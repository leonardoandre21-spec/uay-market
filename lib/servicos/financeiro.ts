import "server-only";
import type { FormaPagamento, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { obterSessaoCaixaAberta, type ClienteDb } from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";
import { addDays, agora, formatarData, limitesDoDia, limitesDoMesAnoMes } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { normalizarTexto } from "@/lib/utils";
import { criarFornecedorRapido } from "@/lib/servicos/fornecedores";
import {
  diaDoMes,
  gerarParcelas,
  mesDe,
  proximoVencimentoRecorrente,
  resumirPendentes,
  rotuloParcela,
  transportarParaMes,
  type AnoMes,
} from "@/lib/servicos/financeiro-calculos";

// Acesso ao banco do módulo Financeiro: despesas, categorias de despesa e
// boletos (contas a pagar). Os cálculos puros ficam em financeiro-calculos.ts.

// ---------------------------------------------------------------- categorias de despesa

/** Devolve a categoria com esse nome (ignorando acentos/caixa) ou cria uma nova. */
export async function criarCategoriaDespesaRapida(nome: string, tx: ClienteDb = db): Promise<{ id: number; nome: string }> {
  const limpo = nome.trim().replace(/\s+/g, " ");
  if (limpo.length < 2) throw new Error("Informe o nome da categoria (pelo menos 2 letras).");
  const todas = await tx.categoriaDespesa.findMany({ select: { id: true, nome: true } });
  const alvo = normalizarTexto(limpo);
  const existente = todas.find((c) => normalizarTexto(c.nome) === alvo);
  if (existente) return existente;
  return tx.categoriaDespesa.create({ data: { nome: limpo }, select: { id: true, nome: true } });
}

export async function listarCategoriasDespesaComUso() {
  return db.categoriaDespesa.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { despesas: true, contas: true } } },
  });
}

/** Total gasto por categoria (id) num mês, pra tela de categorias. */
export async function somarDespesasPorCategoria(mes: AnoMes): Promise<Map<number | null, number>> {
  const { inicio, fim } = limitesDoMesAnoMes(mes.ano, mes.mes);
  const grupos = await db.despesa.groupBy({
    by: ["categoriaId"],
    where: { data: { gte: inicio, lte: fim } },
    _sum: { valor: true },
  });
  return new Map(grupos.map((g) => [g.categoriaId, g._sum.valor ?? 0]));
}

export async function criarCategoriaDespesa(nome: string, usuarioId: number) {
  const limpo = nome.trim().replace(/\s+/g, " ");
  if (limpo.length < 2) throw new Error("Informe o nome da categoria (pelo menos 2 letras).");
  const todas = await db.categoriaDespesa.findMany({ select: { nome: true } });
  if (todas.some((c) => normalizarTexto(c.nome) === normalizarTexto(limpo))) {
    throw new Error("Já existe uma categoria com esse nome.");
  }
  const criada = await db.categoriaDespesa.create({ data: { nome: limpo } });
  await registrarAuditoria({ usuarioId, acao: "categoria-despesa.criar", entidade: "CategoriaDespesa", entidadeId: criada.id, detalhes: { nome: limpo } });
  return criada;
}

export async function renomearCategoriaDespesa(id: number, nome: string, usuarioId: number) {
  const limpo = nome.trim().replace(/\s+/g, " ");
  if (limpo.length < 2) throw new Error("Informe o nome da categoria (pelo menos 2 letras).");
  const atual = await db.categoriaDespesa.findUnique({ where: { id } });
  if (!atual) throw new Error("Categoria não encontrada.");
  const outras = await db.categoriaDespesa.findMany({ where: { id: { not: id } }, select: { nome: true } });
  if (outras.some((c) => normalizarTexto(c.nome) === normalizarTexto(limpo))) {
    throw new Error("Já existe outra categoria com esse nome.");
  }
  const atualizada = await db.categoriaDespesa.update({ where: { id }, data: { nome: limpo } });
  await registrarAuditoria({ usuarioId, acao: "categoria-despesa.renomear", entidade: "CategoriaDespesa", entidadeId: id, detalhes: { de: atual.nome, para: limpo } });
  return atualizada;
}

export async function excluirCategoriaDespesa(id: number, usuarioId: number) {
  const cat = await db.categoriaDespesa.findUnique({
    where: { id },
    include: { _count: { select: { despesas: true, contas: true } } },
  });
  if (!cat) throw new Error("Categoria não encontrada.");
  if (cat._count.despesas + cat._count.contas > 0) {
    throw new Error(
      `A categoria "${cat.nome}" está em uso em ${cat._count.despesas} despesa(s) e ${cat._count.contas} boleto(s). Mude a categoria desses lançamentos antes de excluir.`,
    );
  }
  await db.categoriaDespesa.delete({ where: { id } });
  await registrarAuditoria({ usuarioId, acao: "categoria-despesa.excluir", entidade: "CategoriaDespesa", entidadeId: id, detalhes: { nome: cat.nome } });
}

async function resolverCategoria(tx: ClienteDb, categoriaId: number | null, novaCategoria: string | null): Promise<number | null> {
  if (novaCategoria && novaCategoria.trim()) return (await criarCategoriaDespesaRapida(novaCategoria, tx)).id;
  if (categoriaId === null) return null;
  const existe = await tx.categoriaDespesa.findUnique({ where: { id: categoriaId }, select: { id: true } });
  if (!existe) throw new Error("A categoria escolhida não existe mais. Escolha outra.");
  return categoriaId;
}

async function resolverFornecedor(tx: ClienteDb, fornecedorId: number | null, novoFornecedor: string | null): Promise<number | null> {
  if (novoFornecedor && novoFornecedor.trim()) return (await criarFornecedorRapido(novoFornecedor, tx)).id;
  if (fornecedorId === null) return null;
  const existe = await tx.fornecedor.findUnique({ where: { id: fornecedorId }, select: { id: true } });
  if (!existe) throw new Error("O fornecedor escolhido não existe mais. Escolha outro.");
  return fornecedorId;
}

// ---------------------------------------------------------------- despesas

export type FiltrosDespesas = AnoMes & {
  categoriaId?: number | null;
  fornecedorId?: number | null;
  forma?: FormaPagamento | null;
};

function whereDespesas(f: FiltrosDespesas): Prisma.DespesaWhereInput {
  const { inicio, fim } = limitesDoMesAnoMes(f.ano, f.mes);
  return {
    data: { gte: inicio, lte: fim },
    ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
    ...(f.fornecedorId ? { fornecedorId: f.fornecedorId } : {}),
    ...(f.forma ? { formaPagamento: f.forma } : {}),
  };
}

const incluirDespesa = {
  categoria: true,
  fornecedor: { select: { id: true, nome: true } },
  contaPagar: { select: { id: true, status: true } },
  sessao: { select: { id: true, status: true } },
} satisfies Prisma.DespesaInclude;

export type DespesaCompleta = Prisma.DespesaGetPayload<{ include: typeof incluirDespesa }>;

export async function listarDespesas(f: FiltrosDespesas): Promise<DespesaCompleta[]> {
  return db.despesa.findMany({
    where: whereDespesas(f),
    orderBy: [{ data: "desc" }, { id: "desc" }],
    include: incluirDespesa,
  });
}

export async function somarDespesas(f: FiltrosDespesas): Promise<number> {
  const r = await db.despesa.aggregate({ where: whereDespesas(f), _sum: { valor: true } });
  return r._sum.valor ?? 0;
}

/** Despesas de um mês que podem ser repetidas (as que vieram de boleto ficam de fora). */
export async function listarDespesasRepetiveis(mes: AnoMes) {
  const { inicio, fim } = limitesDoMesAnoMes(mes.ano, mes.mes);
  return db.despesa.findMany({
    where: { data: { gte: inicio, lte: fim }, contaPagarId: null },
    orderBy: [{ data: "asc" }, { id: "asc" }],
    include: { categoria: { select: { nome: true } }, fornecedor: { select: { nome: true } } },
  });
}

export type DadosDespesa = {
  descricao: string;
  categoriaId: number | null;
  novaCategoria: string | null;
  fornecedorId: number | null;
  novoFornecedor: string | null;
  valor: number; // centavos
  data: Date;
  formaPagamento: FormaPagamento | null;
  pagoDoCaixa: boolean;
  observacao: string | null;
};

export async function criarDespesa(dados: DadosDespesa, usuarioId: number) {
  if (dados.valor <= 0) throw new Error("O valor da despesa precisa ser maior que zero.");
  return db.$transaction(async (tx) => {
    const categoriaId = await resolverCategoria(tx, dados.categoriaId, dados.novaCategoria);
    const fornecedorId = await resolverFornecedor(tx, dados.fornecedorId, dados.novoFornecedor);
    let sessaoId: number | null = null;
    let forma = dados.formaPagamento;
    if (dados.pagoDoCaixa) {
      const sessao = await obterSessaoCaixaAberta(tx);
      if (!sessao) throw new Error("Não há caixa aberto. Abra o caixa antes de marcar que a despesa saiu do dinheiro do caixa.");
      sessaoId = sessao.id;
      forma = "DINHEIRO";
    }
    const despesa = await tx.despesa.create({
      data: {
        descricao: dados.descricao.trim(),
        categoriaId,
        fornecedorId,
        valor: dados.valor,
        data: dados.data,
        formaPagamento: forma,
        pagoDoCaixa: dados.pagoDoCaixa,
        sessaoId,
        observacao: dados.observacao?.trim() || null,
        usuarioId,
      },
    });
    await registrarAuditoria(
      { usuarioId, acao: "despesa.criar", entidade: "Despesa", entidadeId: despesa.id, detalhes: { descricao: despesa.descricao, valor: despesa.valor, pagoDoCaixa: despesa.pagoDoCaixa, sessaoId } },
      tx,
    );
    return despesa;
  });
}

export async function atualizarDespesa(id: number, dados: DadosDespesa, usuarioId: number) {
  if (dados.valor <= 0) throw new Error("O valor da despesa precisa ser maior que zero.");
  return db.$transaction(async (tx) => {
    const atual = await tx.despesa.findUnique({ where: { id }, include: { sessao: { select: { status: true } } } });
    if (!atual) throw new Error("Despesa não encontrada.");
    if (atual.contaPagarId) {
      throw new Error("Essa despesa veio de um boleto pago. Para alterar, use a tela Boletos a pagar (desfaça o pagamento e pague de novo).");
    }
    const sessaoFechada = atual.sessaoId !== null && atual.sessao?.status === "FECHADO";
    if (sessaoFechada && (atual.valor !== dados.valor || !dados.pagoDoCaixa)) {
      throw new Error("Essa despesa saiu do dinheiro de um caixa que já foi fechado. O valor e a marcação de caixa não podem mais mudar; os outros dados podem.");
    }
    const categoriaId = await resolverCategoria(tx, dados.categoriaId, dados.novaCategoria);
    const fornecedorId = await resolverFornecedor(tx, dados.fornecedorId, dados.novoFornecedor);
    let sessaoId: number | null = null;
    let forma = dados.formaPagamento;
    if (dados.pagoDoCaixa) {
      if (atual.pagoDoCaixa && atual.sessaoId) {
        sessaoId = atual.sessaoId;
      } else {
        const sessao = await obterSessaoCaixaAberta(tx);
        if (!sessao) throw new Error("Não há caixa aberto. Abra o caixa antes de marcar que a despesa saiu do dinheiro do caixa.");
        sessaoId = sessao.id;
      }
      forma = "DINHEIRO";
    }
    const atualizada = await tx.despesa.update({
      where: { id },
      data: {
        descricao: dados.descricao.trim(),
        categoriaId,
        fornecedorId,
        valor: dados.valor,
        data: dados.data,
        formaPagamento: forma,
        pagoDoCaixa: dados.pagoDoCaixa,
        sessaoId,
        observacao: dados.observacao?.trim() || null,
      },
    });
    await registrarAuditoria(
      {
        usuarioId,
        acao: "despesa.editar",
        entidade: "Despesa",
        entidadeId: id,
        detalhes: {
          antes: { descricao: atual.descricao, valor: atual.valor, data: atual.data, pagoDoCaixa: atual.pagoDoCaixa, categoriaId: atual.categoriaId, fornecedorId: atual.fornecedorId },
          depois: { descricao: atualizada.descricao, valor: atualizada.valor, data: atualizada.data, pagoDoCaixa: atualizada.pagoDoCaixa, categoriaId, fornecedorId },
        },
      },
      tx,
    );
    return atualizada;
  });
}

export async function excluirDespesa(id: number, usuarioId: number) {
  return db.$transaction(async (tx) => {
    const atual = await tx.despesa.findUnique({ where: { id }, include: { sessao: { select: { status: true } } } });
    if (!atual) throw new Error("Despesa não encontrada.");
    if (atual.contaPagarId) {
      throw new Error("Essa despesa veio de um boleto pago. Para removê-la, desfaça o pagamento na tela Boletos a pagar.");
    }
    if (atual.sessaoId !== null && atual.sessao?.status === "FECHADO") {
      throw new Error("Essa despesa saiu do dinheiro de um caixa que já foi fechado e não pode ser excluída.");
    }
    await tx.despesa.delete({ where: { id } });
    await registrarAuditoria(
      { usuarioId, acao: "despesa.excluir", entidade: "Despesa", entidadeId: id, detalhes: { descricao: atual.descricao, valor: atual.valor, data: atual.data, pagoDoCaixa: atual.pagoDoCaixa, sessaoId: atual.sessaoId } },
      tx,
    );
  });
}

/**
 * Copia despesas de um mês pra outro (mesmo dia, ajustando fim de mês).
 * Pula as que já existem no destino com a mesma descrição e valor.
 */
export async function repetirDespesas(ids: number[], destino: AnoMes, usuarioId: number) {
  if (!ids.length) throw new Error("Marque pelo menos uma despesa pra repetir.");
  const origem = await db.despesa.findMany({ where: { id: { in: ids }, contaPagarId: null }, orderBy: { data: "asc" } });
  if (!origem.length) throw new Error("Nenhuma das despesas marcadas pode ser repetida.");
  const { inicio, fim } = limitesDoMesAnoMes(destino.ano, destino.mes);
  const jaExistentes = await db.despesa.findMany({
    where: { data: { gte: inicio, lte: fim } },
    select: { descricao: true, valor: true },
  });
  const chaves = new Set(jaExistentes.map((d) => `${normalizarTexto(d.descricao)}|${d.valor}`));
  const paraCriar = origem.filter((d) => !chaves.has(`${normalizarTexto(d.descricao)}|${d.valor}`));
  const ignoradas = origem.length - paraCriar.length;
  if (!paraCriar.length) return { criadas: 0, ignoradas };
  await db.$transaction(async (tx) => {
    await tx.despesa.createMany({
      data: paraCriar.map((d) => ({
        descricao: d.descricao,
        categoriaId: d.categoriaId,
        fornecedorId: d.fornecedorId,
        valor: d.valor,
        data: transportarParaMes(d.data, destino),
        formaPagamento: d.formaPagamento,
        pagoDoCaixa: false,
        sessaoId: null,
        observacao: d.observacao,
        usuarioId,
      })),
    });
    await registrarAuditoria(
      { usuarioId, acao: "despesa.repetir", entidade: "Despesa", detalhes: { destino, origemIds: paraCriar.map((d) => d.id), criadas: paraCriar.length, ignoradas } },
      tx,
    );
  });
  return { criadas: paraCriar.length, ignoradas };
}

// ---------------------------------------------------------------- contas a pagar

export type VisaoContas = "atrasadas" | "hoje" | "7d" | "30d" | "pendentes" | "pagas" | "canceladas";
export const VISOES_CONTAS: VisaoContas[] = ["atrasadas", "hoje", "7d", "30d", "pendentes", "pagas", "canceladas"];

export function ehVisaoContas(v: string | undefined | null): v is VisaoContas {
  return typeof v === "string" && (VISOES_CONTAS as string[]).includes(v);
}

const incluirConta = {
  fornecedor: { select: { id: true, nome: true } },
  categoria: true,
  despesa: { select: { id: true, sessaoId: true } },
} satisfies Prisma.ContaPagarInclude;

export type ContaCompleta = Prisma.ContaPagarGetPayload<{ include: typeof incluirConta }>;

export async function listarContas(visao: VisaoContas, mes: AnoMes): Promise<ContaCompleta[]> {
  const hoje = agora();
  const { inicio: inicioHoje, fim: fimHoje } = limitesDoDia(hoje);
  const doMes = limitesDoMesAnoMes(mes.ano, mes.mes);
  let where: Prisma.ContaPagarWhereInput;
  switch (visao) {
    case "atrasadas":
      where = { status: "PENDENTE", vencimento: { lt: inicioHoje } };
      break;
    case "hoje":
      where = { status: "PENDENTE", vencimento: { gte: inicioHoje, lte: fimHoje } };
      break;
    case "7d":
      where = { status: "PENDENTE", vencimento: { gte: inicioHoje, lte: limitesDoDia(addDays(hoje, 7)).fim } };
      break;
    case "30d":
      where = { status: "PENDENTE", vencimento: { gte: inicioHoje, lte: limitesDoDia(addDays(hoje, 30)).fim } };
      break;
    case "pagas":
      where = { status: "PAGA", dataPagamento: { gte: doMes.inicio, lte: doMes.fim } };
      break;
    case "canceladas":
      where = { status: "CANCELADA", vencimento: { gte: doMes.inicio, lte: doMes.fim } };
      break;
    case "pendentes":
    default:
      where = { status: "PENDENTE" };
  }
  return db.contaPagar.findMany({
    where,
    orderBy: visao === "pagas" ? [{ dataPagamento: "desc" }, { id: "desc" }] : [{ vencimento: "asc" }, { id: "asc" }],
    include: incluirConta,
  });
}

export async function resumoContas(mes: AnoMes) {
  const hoje = agora();
  const { inicio, fim } = limitesDoMesAnoMes(mes.ano, mes.mes);
  const [pendentes, doMes, pagasNoMes, canceladasNoMes] = await Promise.all([
    db.contaPagar.findMany({ where: { status: "PENDENTE" }, select: { vencimento: true, valor: true } }),
    db.contaPagar.aggregate({
      where: { status: { not: "CANCELADA" }, vencimento: { gte: inicio, lte: fim } },
      _sum: { valor: true },
      _count: { _all: true },
    }),
    db.contaPagar.aggregate({
      where: { status: "PAGA", dataPagamento: { gte: inicio, lte: fim } },
      _sum: { valorPago: true },
      _count: { _all: true },
    }),
    db.contaPagar.count({ where: { status: "CANCELADA", vencimento: { gte: inicio, lte: fim } } }),
  ]);
  return {
    pendentes: resumirPendentes(pendentes, hoje),
    doMes: { total: doMes._sum.valor ?? 0, quantidade: doMes._count._all },
    pagasNoMes: { total: pagasNoMes._sum.valorPago ?? 0, quantidade: pagasNoMes._count._all },
    canceladasNoMes,
  };
}

export type DadosConta = {
  descricao: string;
  fornecedorId: number | null;
  novoFornecedor: string | null;
  categoriaId: number | null;
  novaCategoria: string | null;
  valor: number; // centavos (de cada parcela, quando parcelado)
  vencimento: Date;
  linhaDigitavel: string | null;
  recorrenciaMensal: boolean;
  totalParcelas: number;
  observacao: string | null;
};

const LIMITE_PARCELAS = 60;

export async function criarContas(dados: DadosConta, usuarioId: number) {
  if (dados.valor <= 0) throw new Error("O valor da conta precisa ser maior que zero.");
  const totalParcelas = Math.max(1, Math.floor(dados.totalParcelas));
  if (totalParcelas > LIMITE_PARCELAS) throw new Error(`O parcelamento aceita no máximo ${LIMITE_PARCELAS} parcelas.`);
  if (totalParcelas > 1 && dados.recorrenciaMensal) {
    throw new Error("Escolha só uma opção: parcelar ou repetir todo mês.");
  }
  return db.$transaction(async (tx) => {
    const fornecedorId = await resolverFornecedor(tx, dados.fornecedorId, dados.novoFornecedor);
    const categoriaId = await resolverCategoria(tx, dados.categoriaId, dados.novaCategoria);
    const datas = gerarParcelas(dados.vencimento, totalParcelas);
    // Dia original do primeiro vencimento: a próxima conta mensal volta pra ele (31/01 -> 28/02 -> 31/03).
    const diaVencimento = dados.recorrenciaMensal || totalParcelas > 1 ? diaDoMes(dados.vencimento) : null;
    const criadas: { id: number; vencimento: Date }[] = [];
    for (const [i, vencimento] of datas.entries()) {
      const conta = await tx.contaPagar.create({
        data: {
          descricao: dados.descricao.trim(),
          fornecedorId,
          categoriaId,
          valor: dados.valor,
          vencimento,
          status: "PENDENTE",
          // Cada boleto tem o próprio código; nas parcelas só a primeira recebe o informado.
          linhaDigitavel: i === 0 ? dados.linhaDigitavel?.trim() || null : null,
          recorrencia: dados.recorrenciaMensal ? "MENSAL" : null,
          diaVencimento,
          parcelaAtual: totalParcelas > 1 ? i + 1 : null,
          totalParcelas: totalParcelas > 1 ? totalParcelas : null,
          observacao: dados.observacao?.trim() || null,
        },
        select: { id: true, vencimento: true },
      });
      criadas.push(conta);
    }
    await registrarAuditoria(
      {
        usuarioId,
        acao: "conta.criar",
        entidade: "ContaPagar",
        entidadeId: criadas[0]?.id ?? null,
        detalhes: { descricao: dados.descricao, valor: dados.valor, parcelas: totalParcelas, recorrenciaMensal: dados.recorrenciaMensal, diaVencimento, ids: criadas.map((c) => c.id) },
      },
      tx,
    );
    return criadas;
  });
}

export type DadosEdicaoConta = Omit<DadosConta, "totalParcelas"> & {
  /** Dia do mês em que a conta mensal repete (1-31). Null = dia do vencimento informado. */
  diaVencimento: number | null;
};

export async function atualizarConta(id: number, dados: DadosEdicaoConta, usuarioId: number) {
  if (dados.valor <= 0) throw new Error("O valor da conta precisa ser maior que zero.");
  if (dados.diaVencimento !== null && (!Number.isInteger(dados.diaVencimento) || dados.diaVencimento < 1 || dados.diaVencimento > 31)) {
    throw new Error("O dia do vencimento precisa estar entre 1 e 31.");
  }
  return db.$transaction(async (tx) => {
    const atual = await tx.contaPagar.findUnique({ where: { id } });
    if (!atual) throw new Error("Conta não encontrada.");
    if (atual.status !== "PENDENTE") {
      throw new Error(atual.status === "PAGA" ? "Essa conta já foi paga. Desfaça o pagamento antes de alterar." : "Essa conta está cancelada. Reative antes de alterar.");
    }
    const fornecedorId = await resolverFornecedor(tx, dados.fornecedorId, dados.novoFornecedor);
    const categoriaId = await resolverCategoria(tx, dados.categoriaId, dados.novaCategoria);
    // Mensal: usa o dia informado (ou o do vencimento). Parcela: mantém o dia do carnê. Conta única: nenhum.
    const diaVencimento = dados.recorrenciaMensal ? (dados.diaVencimento ?? diaDoMes(dados.vencimento)) : atual.totalParcelas ? atual.diaVencimento : null;
    const atualizada = await tx.contaPagar.update({
      where: { id },
      data: {
        descricao: dados.descricao.trim(),
        fornecedorId,
        categoriaId,
        valor: dados.valor,
        vencimento: dados.vencimento,
        linhaDigitavel: dados.linhaDigitavel?.trim() || null,
        recorrencia: dados.recorrenciaMensal ? "MENSAL" : null,
        diaVencimento,
        observacao: dados.observacao?.trim() || null,
      },
    });
    await registrarAuditoria(
      {
        usuarioId,
        acao: "conta.editar",
        entidade: "ContaPagar",
        entidadeId: id,
        detalhes: {
          antes: { descricao: atual.descricao, valor: atual.valor, vencimento: atual.vencimento, recorrencia: atual.recorrencia, diaVencimento: atual.diaVencimento },
          depois: { descricao: atualizada.descricao, valor: atualizada.valor, vencimento: atualizada.vencimento, recorrencia: atualizada.recorrencia, diaVencimento: atualizada.diaVencimento },
        },
      },
      tx,
    );
    return atualizada;
  });
}

export type DadosPagamentoConta = {
  dataPagamento: Date;
  valorPago: number; // centavos
  formaPagamento: FormaPagamento;
  pagoDoCaixa: boolean;
  observacao: string | null;
};

type ContaMensalBase = {
  id: number;
  descricao: string;
  fornecedorId: number | null;
  categoriaId: number | null;
  vencimento: Date;
  diaVencimento: number | null;
};

/** Dia em que a conta mensal repete: o guardado ou, nas contas antigas, o do vencimento atual. */
function diaRecorrencia(conta: Pick<ContaMensalBase, "vencimento" | "diaVencimento">): number {
  return conta.diaVencimento ?? diaDoMes(conta.vencimento);
}

/**
 * Filtro da conta do mês seguinte gerada por essa conta mensal: mesma descrição,
 * fornecedor, categoria e dia de recorrência, vencendo no mês do próximo
 * vencimento. Compara por mês (e não pela data exata) pra continuar achando a
 * conta quando o dono só mexeu no dia dela. Quem chama decide o status.
 */
function whereProximaContaMensal(conta: ContaMensalBase, proximoVencimento: Date, status: Prisma.ContaPagarWhereInput["status"]): Prisma.ContaPagarWhereInput {
  const { ano, mes } = mesDe(proximoVencimento);
  const { inicio, fim } = limitesDoMesAnoMes(ano, mes);
  return {
    id: { not: conta.id },
    status,
    recorrencia: "MENSAL",
    descricao: conta.descricao,
    fornecedorId: conta.fornecedorId,
    categoriaId: conta.categoriaId,
    diaVencimento: diaRecorrencia(conta),
    vencimento: { gte: inicio, lte: fim },
  };
}

/**
 * Paga um boleto: marca a conta como PAGA, cria a despesa vinculada e, se a
 * conta for mensal, já cadastra a do mês seguinte (a menos que ela já exista:
 * pagar, desfazer e pagar de novo não pode cadastrar a mesma conta duas vezes).
 */
export async function pagarConta(id: number, dados: DadosPagamentoConta, usuarioId: number) {
  if (dados.valorPago <= 0) throw new Error("O valor pago precisa ser maior que zero.");
  return db.$transaction(async (tx) => {
    const conta = await tx.contaPagar.findUnique({ where: { id }, include: { despesa: { select: { id: true } } } });
    if (!conta) throw new Error("Conta não encontrada.");
    if (conta.status === "PAGA" || conta.despesa) throw new Error("Essa conta já está paga.");
    if (conta.status === "CANCELADA") throw new Error("Essa conta está cancelada. Reative antes de pagar.");

    let sessaoId: number | null = null;
    let forma: FormaPagamento = dados.formaPagamento;
    if (dados.pagoDoCaixa) {
      const sessao = await obterSessaoCaixaAberta(tx);
      if (!sessao) throw new Error("Não há caixa aberto. Abra o caixa antes de marcar que o pagamento saiu do dinheiro do caixa.");
      sessaoId = sessao.id;
      forma = "DINHEIRO";
    }

    const atualizada = await tx.contaPagar.update({
      where: { id },
      data: { status: "PAGA", dataPagamento: dados.dataPagamento, valorPago: dados.valorPago, formaPagamento: forma },
    });

    const parcela = rotuloParcela(conta.parcelaAtual, conta.totalParcelas);
    const diferenca = dados.valorPago - conta.valor;
    const notas: string[] = [];
    if (diferenca > 0) notas.push(`Valor original ${formatarReais(conta.valor)}; juros/multa de ${formatarReais(diferenca)}.`);
    if (diferenca < 0) notas.push(`Valor original ${formatarReais(conta.valor)}; desconto de ${formatarReais(-diferenca)}.`);
    if (dados.observacao?.trim()) notas.push(dados.observacao.trim());

    const despesa = await tx.despesa.create({
      data: {
        contaPagarId: id,
        descricao: parcela ? `${conta.descricao} (parcela ${parcela})` : conta.descricao,
        categoriaId: conta.categoriaId,
        fornecedorId: conta.fornecedorId,
        valor: dados.valorPago,
        data: dados.dataPagamento,
        formaPagamento: forma,
        pagoDoCaixa: dados.pagoDoCaixa,
        sessaoId,
        observacao: notas.length ? notas.join(" ") : null,
        usuarioId,
      },
    });

    let proxima: { id: number; vencimento: Date } | null = null;
    let proximaJaExistia = false;
    if (conta.recorrencia === "MENSAL") {
      // Contas antigas sem o dia guardado passam a guardar o dia do vencimento atual daqui em diante.
      const diaVencimento = diaRecorrencia(conta);
      const proximoVencimento = proximoVencimentoRecorrente(conta.vencimento, diaVencimento);
      // Se a do mês seguinte já está cadastrada (pagamento desfeito e refeito, ou
      // conta atrasada paga depois da seguinte), reaproveita em vez de duplicar.
      const existente = await tx.contaPagar.findFirst({
        where: whereProximaContaMensal(conta, proximoVencimento, { not: "CANCELADA" }),
        orderBy: { id: "asc" },
        select: { id: true, vencimento: true },
      });
      if (existente) {
        proxima = existente;
        proximaJaExistia = true;
      } else {
        proxima = await tx.contaPagar.create({
          data: {
            descricao: conta.descricao,
            fornecedorId: conta.fornecedorId,
            categoriaId: conta.categoriaId,
            valor: conta.valor,
            vencimento: proximoVencimento,
            status: "PENDENTE",
            recorrencia: "MENSAL",
            diaVencimento,
            observacao: conta.observacao,
          },
          select: { id: true, vencimento: true },
        });
      }
    }

    await registrarAuditoria(
      {
        usuarioId,
        acao: "conta.pagar",
        entidade: "ContaPagar",
        entidadeId: id,
        detalhes: {
          descricao: conta.descricao,
          valor: conta.valor,
          valorPago: dados.valorPago,
          dataPagamento: dados.dataPagamento,
          formaPagamento: forma,
          pagoDoCaixa: dados.pagoDoCaixa,
          sessaoId,
          despesaId: despesa.id,
          proximaContaId: proxima?.id ?? null,
          proximaJaExistia,
        },
      },
      tx,
    );

    return { conta: atualizada, despesa, proxima, proximaJaExistia };
  });
}

/**
 * Desfaz um pagamento: apaga a despesa vinculada e devolve a conta pra PENDENTE.
 * A conta do mês seguinte, criada no pagamento de uma conta mensal, é apagada
 * junto quando ainda está do jeito que nasceu (pendente, sem despesa, mesmo
 * valor, sem linha digitável). Se o dono já mexeu nela, ela fica e só avisamos.
 */
export async function desfazerPagamento(id: number, usuarioId: number) {
  return db.$transaction(async (tx) => {
    const conta = await tx.contaPagar.findUnique({
      where: { id },
      include: { despesa: { include: { sessao: { select: { status: true } } } } },
    });
    if (!conta) throw new Error("Conta não encontrada.");
    if (conta.status !== "PAGA") throw new Error("Só dá pra desfazer o pagamento de uma conta que está paga.");
    if (conta.despesa?.sessaoId && conta.despesa.sessao?.status === "FECHADO") {
      throw new Error("Esse pagamento saiu do dinheiro de um caixa que já foi fechado e não pode ser desfeito.");
    }
    if (conta.despesa) await tx.despesa.delete({ where: { id: conta.despesa.id } });
    await tx.contaPagar.update({
      where: { id },
      data: { status: "PENDENTE", dataPagamento: null, valorPago: null, formaPagamento: null },
    });
    let aviso: string | null = null;
    let proximaApagadaId: number | null = null;
    if (conta.recorrencia === "MENSAL") {
      const proximoVencimento = proximoVencimentoRecorrente(conta.vencimento, diaRecorrencia(conta));
      const proxima = await tx.contaPagar.findFirst({
        where: whereProximaContaMensal(conta, proximoVencimento, "PENDENTE"),
        orderBy: { id: "asc" },
        select: { id: true, vencimento: true, valor: true, linhaDigitavel: true, despesa: { select: { id: true } } },
      });
      if (proxima) {
        // Só some com a conta que ainda está exatamente como o pagamento a criou.
        const intocada =
          proxima.valor === conta.valor &&
          proxima.vencimento.getTime() === proximoVencimento.getTime() &&
          !proxima.linhaDigitavel &&
          !proxima.despesa;
        if (intocada) {
          await tx.contaPagar.delete({ where: { id: proxima.id } });
          proximaApagadaId = proxima.id;
          aviso = `A conta do mês seguinte (vencimento ${formatarData(proxima.vencimento)}), criada por esse pagamento, também foi removida. Ela volta quando a conta for paga de novo.`;
        } else {
          aviso = `A conta do mês seguinte (vencimento ${formatarData(proxima.vencimento)}) foi alterada depois de criada e continua cadastrada. Se não quiser, cancele-a.`;
        }
      }
    }
    await registrarAuditoria(
      {
        usuarioId,
        acao: "conta.desfazer-pagamento",
        entidade: "ContaPagar",
        entidadeId: id,
        detalhes: { descricao: conta.descricao, valorPago: conta.valorPago, dataPagamento: conta.dataPagamento, despesaApagadaId: conta.despesa?.id ?? null, proximaApagadaId },
      },
      tx,
    );
    return { aviso, proximaApagadaId };
  });
}

export async function cancelarConta(id: number, motivo: string | null, usuarioId: number) {
  const conta = await db.contaPagar.findUnique({ where: { id } });
  if (!conta) throw new Error("Conta não encontrada.");
  if (conta.status !== "PENDENTE") {
    throw new Error(conta.status === "PAGA" ? "Essa conta já foi paga. Desfaça o pagamento antes de cancelar." : "Essa conta já está cancelada.");
  }
  const nota = motivo?.trim() ? `Cancelada em ${formatarData(agora())}: ${motivo.trim()}` : null;
  const atualizada = await db.contaPagar.update({
    where: { id },
    data: {
      status: "CANCELADA",
      observacao: nota ? [conta.observacao, nota].filter(Boolean).join("\n") : conta.observacao,
    },
  });
  await registrarAuditoria({
    usuarioId,
    acao: "conta.cancelar",
    entidade: "ContaPagar",
    entidadeId: id,
    detalhes: { descricao: conta.descricao, valor: conta.valor, vencimento: conta.vencimento, motivo: motivo?.trim() || null },
  });
  return atualizada;
}

export async function reativarConta(id: number, usuarioId: number) {
  const conta = await db.contaPagar.findUnique({ where: { id } });
  if (!conta) throw new Error("Conta não encontrada.");
  if (conta.status !== "CANCELADA") throw new Error("Só dá pra reativar uma conta cancelada.");
  const atualizada = await db.contaPagar.update({ where: { id }, data: { status: "PENDENTE" } });
  await registrarAuditoria({ usuarioId, acao: "conta.reativar", entidade: "ContaPagar", entidadeId: id, detalhes: { descricao: conta.descricao, valor: conta.valor } });
  return atualizada;
}

/** Contas do mês (pendentes e pagas) pro calendário de vencimentos. */
export async function listarContasDoMesParaCalendario(mes: AnoMes) {
  const { inicio, fim } = limitesDoMesAnoMes(mes.ano, mes.mes);
  return db.contaPagar.findMany({
    where: { status: { not: "CANCELADA" }, vencimento: { gte: inicio, lte: fim } },
    orderBy: [{ vencimento: "asc" }, { id: "asc" }],
    include: { fornecedor: { select: { nome: true } }, categoria: { select: { nome: true } } },
  });
}
