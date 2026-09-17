import "server-only";
import type { Papel, Prisma, TipoMovimentoCaixa } from "@prisma/client";
import { db } from "@/lib/db";
import { type ClienteDb, obterSessaoCaixaAberta } from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataHora } from "@/lib/datas";
import {
  calcularDiferenca,
  descreverDiferenca,
  montarResumoSessao,
  type ResumoSessao,
} from "@/lib/servicos/caixa-calculos";

// Acesso ao banco do módulo Caixa. Toda escrita roda em transação e registra auditoria.
// Os cálculos ficam em caixa-calculos.ts (puro, com teste).

// ---------------------------------------------------------------- leitura

const INCLUDE_SESSAO_COMPLETA = {
  usuarioAbertura: { select: { id: true, nome: true } },
  usuarioFechamento: { select: { id: true, nome: true } },
  movimentos: {
    orderBy: { criadoEm: "desc" },
    include: { usuario: { select: { id: true, nome: true } } },
  },
} satisfies Prisma.SessaoCaixaInclude;

export type SessaoCompleta = Prisma.SessaoCaixaGetPayload<{ include: typeof INCLUDE_SESSAO_COMPLETA }>;

/** Sessão com quem abriu/fechou e os movimentos de gaveta (mais recentes primeiro). */
export async function carregarSessao(id: number, tx: ClienteDb = db): Promise<SessaoCompleta | null> {
  return tx.sessaoCaixa.findUnique({ where: { id }, include: INCLUDE_SESSAO_COMPLETA });
}

/**
 * Resumo ao vivo da sessão: vendas concluídas, por forma, troco, movimentos,
 * despesas do caixa, fiado recebido e o dinheiro esperado na gaveta.
 * Recalcula tudo a partir dos registros; nunca confia em valor guardado.
 */
export async function resumoSessao(sessaoId: number, tx: ClienteDb = db): Promise<ResumoSessao> {
  const sessao = await tx.sessaoCaixa.findUniqueOrThrow({
    where: { id: sessaoId },
    select: { valorAbertura: true },
  });
  const [vendas, movimentos, despesasCaixa, recebimentosFiado] = await Promise.all([
    tx.venda.findMany({
      where: { sessaoId },
      select: {
        status: true,
        total: true,
        pagamentos: { select: { forma: true, valor: true, troco: true } },
      },
    }),
    tx.movimentoCaixa.findMany({ where: { sessaoId }, select: { tipo: true, valor: true } }),
    tx.despesa.findMany({ where: { sessaoId, pagoDoCaixa: true }, select: { valor: true } }),
    // Só PAGAMENTO é dinheiro que entrou; ESTORNO (venda cancelada) nunca conta no caixa.
    tx.lancamentoFiado.findMany({
      where: { sessaoId, tipo: "PAGAMENTO" },
      select: { formaPagamento: true, valor: true },
    }),
  ]);
  return montarResumoSessao({
    valorAbertura: sessao.valorAbertura,
    vendas,
    movimentos,
    despesasCaixa,
    recebimentosFiado,
  });
}

const INCLUDE_VENDA_LISTA = {
  usuario: { select: { nome: true } },
  cliente: { select: { nome: true } },
  pagamentos: { select: { forma: true, valor: true } },
} satisfies Prisma.VendaInclude;

export type VendaDaSessao = Prisma.VendaGetPayload<{ include: typeof INCLUDE_VENDA_LISTA }>;

/** Últimas vendas da sessão (inclusive canceladas, pra conferência), mais recentes primeiro. */
export async function listarVendasDaSessao(sessaoId: number, limite = 10, tx: ClienteDb = db): Promise<VendaDaSessao[]> {
  return tx.venda.findMany({
    where: { sessaoId },
    orderBy: { criadoEm: "desc" },
    take: limite,
    include: INCLUDE_VENDA_LISTA,
  });
}

/** Última sessão fechada (pra sugerir o fundo de troco na abertura). */
export async function obterUltimaSessaoFechada(tx: ClienteDb = db) {
  return tx.sessaoCaixa.findFirst({
    where: { status: "FECHADO" },
    orderBy: { fechadoEm: "desc" },
    include: { usuarioFechamento: { select: { nome: true } } },
  });
}

export type SessaoFechadaResumida = Prisma.SessaoCaixaGetPayload<{
  include: {
    usuarioAbertura: { select: { nome: true } };
    usuarioFechamento: { select: { nome: true } };
  };
}> & { vendasQuantidade: number; vendasTotal: number };

/**
 * Sessões fechadas com abertura dentro do período. Se `usuarioId` vier,
 * só as que esse usuário abriu ou fechou (visão do operador).
 */
export async function listarSessoesFechadas(
  params: { inicio: Date; fim: Date; usuarioId?: number },
  tx: ClienteDb = db,
): Promise<SessaoFechadaResumida[]> {
  const sessoes = await tx.sessaoCaixa.findMany({
    where: {
      status: "FECHADO",
      abertoEm: { gte: params.inicio, lte: params.fim },
      ...(params.usuarioId
        ? { OR: [{ usuarioAberturaId: params.usuarioId }, { usuarioFechamentoId: params.usuarioId }] }
        : {}),
    },
    orderBy: { abertoEm: "desc" },
    include: {
      usuarioAbertura: { select: { nome: true } },
      usuarioFechamento: { select: { nome: true } },
    },
  });
  if (!sessoes.length) return [];

  const vendas = await tx.venda.groupBy({
    by: ["sessaoId"],
    where: { sessaoId: { in: sessoes.map((s) => s.id) }, status: "CONCLUIDA" },
    _sum: { total: true },
    _count: { _all: true },
  });
  const porSessao = new Map(vendas.map((v) => [v.sessaoId, v]));

  return sessoes.map((s) => {
    const agregado = porSessao.get(s.id);
    return {
      ...s,
      vendasQuantidade: agregado?._count._all ?? 0,
      vendasTotal: agregado?._sum.total ?? 0,
    };
  });
}

/** Operador só enxerga sessões que ele mesmo abriu ou fechou; ADMIN vê todas. */
export function podeVerSessao(
  sessao: { usuarioAberturaId: number; usuarioFechamentoId: number | null },
  usuario: { usuarioId: number; papel: Papel },
): boolean {
  if (usuario.papel === "ADMIN") return true;
  return sessao.usuarioAberturaId === usuario.usuarioId || sessao.usuarioFechamentoId === usuario.usuarioId;
}

/** Quem pode fechar: ADMIN sempre; operador só a sessão que ele abriu. */
export function podeFecharSessao(
  sessao: { usuarioAberturaId: number },
  usuario: { usuarioId: number; papel: Papel },
): boolean {
  return usuario.papel === "ADMIN" || sessao.usuarioAberturaId === usuario.usuarioId;
}

// ---------------------------------------------------------------- escrita

/**
 * As escritas do caixa leem e depois gravam (só um caixa ABERTO; sangria ≤ esperado;
 * esperado do fechamento). Nada no schema impede duas sessões ABERTO, então a regra
 * depende da transação ser serializável. No SQLite isso já é o padrão (o segundo
 * escritor recebe BUSY em vez de gravar em cima de leitura velha). Ao migrar pra
 * Postgres, o padrão é READ COMMITTED e essas sequências virariam corrida; o nível
 * é fixado aqui pra manter a garantia. Conflito de serialização sai como P2034
 * (Prisma pede pra repetir a operação).
 */
const TRANSACAO_CAIXA = { isolationLevel: "Serializable" } as const;

export async function abrirCaixa(params: { usuarioId: number; valorAbertura: number; observacao: string | null }) {
  return db.$transaction(async (tx) => {
    const aberta = await obterSessaoCaixaAberta(tx);
    if (aberta) {
      throw new Error(
        `Já existe um caixa aberto desde ${formatarDataHora(aberta.abertoEm)}. Feche-o antes de abrir outro.`,
      );
    }
    const sessao = await tx.sessaoCaixa.create({
      data: {
        usuarioAberturaId: params.usuarioId,
        valorAbertura: params.valorAbertura,
        observacao: params.observacao,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: params.usuarioId,
        acao: "caixa.abrir",
        entidade: "SessaoCaixa",
        entidadeId: sessao.id,
        detalhes: { valorAbertura: params.valorAbertura, observacao: params.observacao },
      },
      tx,
    );
    return sessao;
  }, TRANSACAO_CAIXA);
}

export async function registrarMovimentoCaixa(params: {
  sessaoId: number;
  tipo: TipoMovimentoCaixa;
  valor: number;
  motivo: string;
  usuarioId: number;
}) {
  return db.$transaction(async (tx) => {
    const sessao = await tx.sessaoCaixa.findUnique({ where: { id: params.sessaoId } });
    if (!sessao) throw new Error("Caixa não encontrado.");
    if (sessao.status !== "ABERTO") throw new Error("Este caixa já foi fechado. Abra um novo caixa antes.");

    if (params.tipo === "SANGRIA") {
      const resumo = await resumoSessao(sessao.id, tx);
      if (params.valor > resumo.dinheiroEsperado) {
        throw new Error(
          `A gaveta deve ter ${formatarReais(resumo.dinheiroEsperado)} em dinheiro. Não dá pra retirar ${formatarReais(params.valor)}.`,
        );
      }
    }

    const movimento = await tx.movimentoCaixa.create({
      data: {
        sessaoId: sessao.id,
        tipo: params.tipo,
        valor: params.valor,
        motivo: params.motivo,
        usuarioId: params.usuarioId,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: params.usuarioId,
        acao: params.tipo === "SANGRIA" ? "caixa.sangria" : "caixa.suprimento",
        entidade: "MovimentoCaixa",
        entidadeId: movimento.id,
        detalhes: { sessaoId: sessao.id, valor: params.valor, motivo: params.motivo },
      },
      tx,
    );
    return movimento;
  }, TRANSACAO_CAIXA);
}

export async function fecharCaixa(params: {
  sessaoId: number;
  usuarioId: number;
  papel: Papel;
  valorContado: number;
  observacao: string | null;
}) {
  return db.$transaction(async (tx) => {
    const sessao = await tx.sessaoCaixa.findUnique({ where: { id: params.sessaoId } });
    if (!sessao) throw new Error("Caixa não encontrado.");
    if (sessao.status !== "ABERTO") throw new Error("Este caixa já foi fechado.");
    if (!podeFecharSessao(sessao, params)) {
      throw new Error("Este caixa foi aberto por outro usuário. Só um administrador pode fechá-lo.");
    }

    // O esperado é recalculado aqui, no servidor, a partir dos registros da sessão.
    const resumo = await resumoSessao(sessao.id, tx);
    const esperado = resumo.dinheiroEsperado;
    const diferenca = calcularDiferenca(params.valorContado, esperado);
    if (diferenca !== 0 && !params.observacao) {
      throw new Error(`${descreverDiferenca(diferenca)} em relação ao esperado. Explique o motivo na observação.`);
    }

    // `observacao` continua sendo só da abertura; o fechamento vai na própria coluna.
    const fechada = await tx.sessaoCaixa.update({
      where: { id: sessao.id },
      data: {
        status: "FECHADO",
        fechadoEm: new Date(),
        usuarioFechamentoId: params.usuarioId,
        valorFechamentoEsperado: esperado,
        valorFechamentoContado: params.valorContado,
        diferenca,
        observacaoFechamento: params.observacao || null,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: params.usuarioId,
        acao: "caixa.fechar",
        entidade: "SessaoCaixa",
        entidadeId: sessao.id,
        detalhes: {
          esperado,
          contado: params.valorContado,
          diferenca,
          vendas: resumo.vendas,
          sangrias: resumo.sangrias.total,
          suprimentos: resumo.suprimentos.total,
          observacao: params.observacao,
        },
      },
      tx,
    );
    return { sessao: fechada, resumo, diferenca };
  }, TRANSACAO_CAIXA);
}
