import "server-only";
import type { Papel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { obterConfiguracao, type ClienteDb } from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirAdminAcao, hashPin, pinEmUsoPorOutro, verificarPin, type Sessao } from "@/lib/auth";
import { executar, type Resultado } from "@/lib/acao";
import { podeDesativarAdmin } from "@/lib/servicos/configuracoes-regras";

// Acesso ao banco do módulo de configurações. Regras puras ficam em
// configuracoes-regras.ts (com teste). Backup (exportar/importar JSON) fica
// em backup.ts.

// ---------------------------------------------------------------- sessão

/**
 * Primeira linha de toda action deste módulo: exige administrador e devolve a
 * sessão como Resultado, pra a action poder validar campos antes de gravar sem
 * nunca lançar pro cliente.
 */
export async function sessaoAdmin(): Promise<Resultado<Sessao>> {
  return executar(exigirAdminAcao);
}

// ---------------------------------------------------------------- configuração geral

export type DadosConfiguracao = Omit<Prisma.ConfiguracaoUncheckedUpdateInput, "id" | "atualizadoEm">;

/** Salva campos na linha única (id = 1), criando a linha com padrões se ainda não existir. */
export async function salvarConfiguracao(dados: DadosConfiguracao, tx: ClienteDb = db) {
  await obterConfiguracao(tx);
  return tx.configuracao.update({ where: { id: 1 }, data: dados });
}

export { obterConfiguracao };

// ---------------------------------------------------------------- usuários

export type UsuarioListado = {
  id: number;
  nome: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: Date;
  ultimoAcesso: Date | null;
};

/**
 * Todos os usuários (ativos e inativos) com a data do último login.
 * Lê `Usuario.ultimoAcesso` (gravado no login); quem ainda não tem o campo
 * preenchido cai no último `sessao.entrar` da auditoria.
 */
export async function listarUsuariosComUltimoAcesso(): Promise<UsuarioListado[]> {
  const usuarios = await db.usuario.findMany({ orderBy: [{ ativo: "desc" }, { nome: "asc" }] });
  const semRegistro = usuarios.filter((u) => u.ultimoAcesso === null).map((u) => u.id);
  const acessos = semRegistro.length
    ? await db.auditoria.groupBy({
        by: ["usuarioId"],
        where: { acao: "sessao.entrar", usuarioId: { in: semRegistro } },
        _max: { criadoEm: true },
      })
    : [];
  const ultimoPorUsuario = new Map<number, Date>();
  for (const a of acessos) {
    if (a.usuarioId !== null && a._max.criadoEm) ultimoPorUsuario.set(a.usuarioId, a._max.criadoEm);
  }
  return usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    papel: u.papel,
    ativo: u.ativo,
    criadoEm: u.criadoEm,
    ultimoAcesso: u.ultimoAcesso ?? ultimoPorUsuario.get(u.id) ?? null,
  }));
}

/** PIN igual ao de outra pessoa faria o login confundir os dois usuários; cada um precisa ter o seu. */
const MENSAGEM_PIN_REPETIDO = "Esse PIN já é usado por outro usuário. Escolha um PIN diferente.";

export async function criarUsuario(dados: { nome: string; pin: string; papel: Papel }, adminId: number) {
  if (await pinEmUsoPorOutro(dados.pin)) throw new Error(MENSAGEM_PIN_REPETIDO);
  return db.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nome: dados.nome,
        pinHash: hashPin(dados.pin),
        papel: dados.papel,
        ativo: true,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "usuario.criar",
        entidade: "Usuario",
        entidadeId: usuario.id,
        detalhes: { nome: usuario.nome, papel: usuario.papel },
      },
      tx,
    );
    return usuario;
  });
}

export async function editarUsuario(
  id: number,
  dados: { nome: string; papel: Papel; ativo: boolean },
  adminId: number,
) {
  return db.$transaction(async (tx) => {
    const atual = await tx.usuario.findUnique({ where: { id } });
    if (!atual) throw new Error("Usuário não encontrado.");

    if (id === adminId && (!dados.ativo || dados.papel !== "ADMIN")) {
      throw new Error("Você não pode desativar nem rebaixar o próprio usuário. Peça a outro administrador.");
    }

    const deixaDeSerAdminAtivo = atual.papel === "ADMIN" && atual.ativo && (!dados.ativo || dados.papel !== "ADMIN");
    if (deixaDeSerAdminAtivo) {
      const todos = await tx.usuario.findMany({
        select: { id: true, papel: true, ativo: true },
      });
      if (!podeDesativarAdmin(todos, id)) {
        throw new Error("Este é o único administrador ativo. Crie ou ative outro administrador antes.");
      }
    }

    const usuario = await tx.usuario.update({
      where: { id },
      data: { nome: dados.nome, papel: dados.papel, ativo: dados.ativo },
    });
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "usuario.editar",
        entidade: "Usuario",
        entidadeId: id,
        detalhes: {
          antes: { nome: atual.nome, papel: atual.papel, ativo: atual.ativo },
          depois: {
            nome: usuario.nome,
            papel: usuario.papel,
            ativo: usuario.ativo,
          },
        },
      },
      tx,
    );
    return usuario;
  });
}

/** Troca o PIN de qualquer usuário. Exige o PIN atual do administrador logado como confirmação. */
export async function trocarPinUsuario(id: number, novoPin: string, adminId: number, pinAtualAdmin: string) {
  if (await pinEmUsoPorOutro(novoPin, id)) throw new Error(MENSAGEM_PIN_REPETIDO);
  return db.$transaction(async (tx) => {
    const admin = await tx.usuario.findUnique({ where: { id: adminId } });
    if (!admin || !admin.ativo || admin.papel !== "ADMIN") throw new Error("Sessão de administrador inválida.");
    if (!verificarPin(pinAtualAdmin, admin.pinHash)) {
      throw new Error("O seu PIN atual está incorreto. A troca não foi feita.");
    }
    const alvo = await tx.usuario.findUnique({ where: { id } });
    if (!alvo) throw new Error("Usuário não encontrado.");

    await tx.usuario.update({
      where: { id },
      data: { pinHash: hashPin(novoPin) },
    });
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "usuario.pin",
        entidade: "Usuario",
        entidadeId: id,
        detalhes: { nome: alvo.nome, proprio: id === adminId },
      },
      tx,
    );
    return { id, nome: alvo.nome };
  });
}

// ---------------------------------------------------------------- formas de pagamento

export type ConfiguracaoPagamentoEntrada = {
  forma: Prisma.ConfiguracaoPagamentoCreateInput["forma"];
  ativo: boolean;
  taxaPercentual: number;
  taxaFixa: number;
  prazoRecebimentoDias: number;
  maxParcelas: number;
};

export async function salvarConfiguracoesPagamento(lista: ConfiguracaoPagamentoEntrada[], adminId: number) {
  return db.$transaction(async (tx) => {
    const antes = await tx.configuracaoPagamento.findMany();
    for (const item of lista) {
      const { forma, ...dados } = item;
      await tx.configuracaoPagamento.upsert({
        where: { forma },
        update: dados,
        create: { forma, ...dados },
      });
    }
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "configuracao.pagamentos",
        entidade: "ConfiguracaoPagamento",
        detalhes: { antes, depois: lista },
      },
      tx,
    );
    return tx.configuracaoPagamento.findMany();
  });
}

// ---------------------------------------------------------------- auditoria

export type FiltrosAuditoria = {
  usuarioId?: number | null;
  acao?: string | null;
  de?: Date | null;
  ate?: Date | null;
};

export type LinhaAuditoria = {
  id: number;
  criadoEm: Date;
  usuario: { id: number; nome: string } | null;
  acao: string;
  entidade: string;
  entidadeId: number | null;
  detalhes: string | null;
};

function whereAuditoria(filtros: FiltrosAuditoria): Prisma.AuditoriaWhereInput {
  const where: Prisma.AuditoriaWhereInput = {};
  if (filtros.usuarioId) where.usuarioId = filtros.usuarioId;
  if (filtros.acao) where.acao = filtros.acao;
  if (filtros.de || filtros.ate) {
    where.criadoEm = {
      ...(filtros.de ? { gte: filtros.de } : {}),
      ...(filtros.ate ? { lte: filtros.ate } : {}),
    };
  }
  return where;
}

export async function listarAuditoria(
  filtros: FiltrosAuditoria,
  pagina: number,
  porPagina = 50,
): Promise<{
  linhas: LinhaAuditoria[];
  total: number;
  pagina: number;
  totalPaginas: number;
}> {
  const where = whereAuditoria(filtros);
  const total = await db.auditoria.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
  const linhas = await db.auditoria.findMany({
    where,
    orderBy: { criadoEm: "desc" },
    skip: (paginaAtual - 1) * porPagina,
    take: porPagina,
    include: { usuario: { select: { id: true, nome: true } } },
  });
  return { linhas, total, pagina: paginaAtual, totalPaginas };
}

/** Todas as linhas que batem com o filtro (pra exportar), limitado a 20 mil. */
export async function listarAuditoriaCompleta(filtros: FiltrosAuditoria, limite = 20000): Promise<LinhaAuditoria[]> {
  return db.auditoria.findMany({
    where: whereAuditoria(filtros),
    orderBy: { criadoEm: "desc" },
    take: limite,
    include: { usuario: { select: { id: true, nome: true } } },
  });
}

export async function listarAcoesAuditoria(): Promise<string[]> {
  const linhas = await db.auditoria.findMany({
    distinct: ["acao"],
    select: { acao: true },
    orderBy: { acao: "asc" },
  });
  return linhas.map((l) => l.acao);
}

export async function listarUsuariosParaFiltro(): Promise<{ id: number; nome: string; ativo: boolean }[]> {
  return db.usuario.findMany({
    select: { id: true, nome: true, ativo: true },
    orderBy: { nome: "asc" },
  });
}
