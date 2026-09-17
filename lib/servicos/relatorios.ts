import "server-only";
import type { FormaPagamento, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatarDataHora } from "@/lib/datas";
import { formatarPercentual, formatarQuantidade, formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import {
  agruparConciliacao,
  aplicarDescontoGeral,
  calcularGiro,
  calcularLucro,
  classificarAbc,
  gerarCsv,
  lucroPorCategoria,
  lucroPorProduto,
  margemBp,
  mediaInteira,
  produtosSemVenda,
  rankearClientes,
  rankearProdutos,
  resumirAbc,
  resumirPagamentos,
  resumirRecebimentosFiado,
  saldosFiadoEmAberto,
  serieDiaria,
  somarFiadoSemTaxa,
  totalFiadoEmAberto,
  valorImobilizadoPorCategoria,
  vendasPorDiaSemana,
  vendasPorHora,
  vendasPorOperador,
  ROTULO_SITUACAO_ESTOQUE,
  SEM_MAQUININHA_ID,
  type CelulaCsv,
  type FormaMaquininha,
  type ItemComReceita,
  type LinhaAbc,
  type LinhaCliente,
  type LinhaFiado,
  type LinhaGiro,
  type LinhaImobilizado,
  type LinhaLucroCategoria,
  type LinhaLucroProduto,
  type LinhaOperador,
  type LinhaPagamento,
  type LinhaRanking,
  type LinhaSemVenda,
  type MaquininhaConciliacao,
  type Periodo,
  type PontoDiaSemana,
  type PontoDiario,
  type PontoHora,
  type ProdutoBase,
  type RecebimentoFiado,
  type ResultadoConciliacao,
  type ResultadoLucro,
  type ResumoClasseAbc,
  type VendaBase,
} from "@/lib/servicos/relatorios-calculos";

// Acesso ao banco dos relatórios. Só leitura. Só vendas CONCLUIDA entram.
// Estratégia: poucas consultas amplas por período e agregação em memória
// com as funções puras de relatorios-calculos.ts (sem N+1).

// ---------------------------------------------------------------- consultas base

function filtroVendas(periodo: Periodo): Prisma.VendaWhereInput {
  return { status: "CONCLUIDA", criadoEm: { gte: periodo.inicio, lte: periodo.fim } };
}

function filtroData(periodo: Periodo): Prisma.DateTimeFilter {
  return { gte: periodo.inicio, lte: periodo.fim };
}

/** Catálogo inteiro (ativos e inativos) indexado por id, com nome da categoria. */
async function carregarProdutos(): Promise<Map<number, ProdutoBase>> {
  const lista = await db.produto.findMany({
    select: {
      id: true,
      nome: true,
      unidade: true,
      categoriaId: true,
      categoria: { select: { nome: true } },
      estoque: true,
      precoCusto: true,
      precoVenda: true,
      ativo: true,
    },
  });
  return new Map(
    lista.map((p) => [
      p.id,
      {
        id: p.id,
        nome: p.nome,
        unidade: p.unidade,
        categoriaId: p.categoriaId,
        categoria: p.categoria?.nome ?? null,
        estoque: p.estoque,
        precoCusto: p.precoCusto,
        precoVenda: p.precoVenda,
        ativo: p.ativo,
      },
    ]),
  );
}

async function carregarVendas(periodo: Periodo): Promise<VendaBase[]> {
  return db.venda.findMany({
    where: filtroVendas(periodo),
    select: {
      id: true,
      criadoEm: true,
      total: true,
      desconto: true,
      custoTotal: true,
      taxasTotal: true,
      usuarioId: true,
      clienteId: true,
    },
    orderBy: { criadoEm: "asc" },
  });
}

/**
 * Itens de vendas concluídas do período, já com o desconto geral do cupom
 * rateado e o custo conciliado com Venda.custoTotal (itens divididos em
 * lotes pelo FEFO podem arredondar 1 centavo diferente da linha inteira).
 */
async function carregarItensComReceita(periodo: Periodo): Promise<ItemComReceita[]> {
  const [itens, vendas] = await Promise.all([
    db.itemVenda.findMany({
      where: { venda: filtroVendas(periodo) },
      select: {
        vendaId: true,
        produtoId: true,
        descricao: true,
        unidade: true,
        quantidade: true,
        custoUnitario: true,
        total: true,
      },
      orderBy: { id: "asc" },
    }),
    db.venda.findMany({
      where: filtroVendas(periodo),
      select: { id: true, desconto: true, custoTotal: true },
    }),
  ]);
  const descontos = new Map(vendas.filter((v) => v.desconto > 0).map((v) => [v.id, v.desconto]));
  const custos = new Map(vendas.map((v) => [v.id, v.custoTotal]));
  return aplicarDescontoGeral(itens, descontos, custos);
}

/**
 * Recebimentos de fiado do período agrupados pela forma como o cliente pagou
 * (só PAGAMENTO com forma; ajuste manual sem forma fica de fora). O sistema
 * não registra maquininha nem taxa nesse recebimento, então os relatórios
 * mostram isso como linha informativa e avisam sobre a taxa que falta.
 */
async function recebimentosFiadoPorForma(periodo: Periodo): Promise<RecebimentoFiado[]> {
  const grupos = await db.lancamentoFiado.groupBy({
    by: ["formaPagamento"],
    where: { tipo: "PAGAMENTO", formaPagamento: { not: null }, criadoEm: filtroData(periodo) },
    _count: { _all: true },
    _sum: { valor: true },
  });
  return resumirRecebimentosFiado(
    grupos
      .filter((g): g is typeof g & { formaPagamento: FormaPagamento } => g.formaPagamento !== null)
      .map((g) => ({ forma: g.formaPagamento, quantidade: g._count._all, valor: g._sum.valor ?? 0 })),
  );
}

async function carregarPerdasPorProduto(periodo: Periodo): Promise<Map<number, number>> {
  const grupos = await db.perda.groupBy({
    by: ["produtoId"],
    where: { data: filtroData(periodo) },
    _sum: { valorTotal: true },
  });
  return new Map(grupos.map((g) => [g.produtoId, g._sum.valorTotal ?? 0]));
}

async function somarDespesas(periodo: Periodo): Promise<number> {
  const agg = await db.despesa.aggregate({ where: { data: filtroData(periodo) }, _sum: { valor: true } });
  return agg._sum.valor ?? 0;
}

async function listarCategoriasComProdutos(): Promise<{ id: number; nome: string }[]> {
  return db.categoria.findMany({
    where: { produtos: { some: {} } },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true },
  });
}

// ---------------------------------------------------------------- resumo do hub

export type ResumoHub = {
  vendas: number;
  receita: number;
  cmv: number;
  taxas: number;
  perdas: number;
  despesas: number;
  /** receita - CMV (antes das taxas) */
  lucroBruto: number;
  /** receita - CMV - taxas: o "lucro bruto" do contrato e do painel de gestão */
  lucroAposTaxas: number;
  lucroReal: number;
  margemRealBp: number;
  ticketMedio: number;
  produtosDistintos: number;
  encalhados: number;
  /** Soma dos saldos positivos por cliente (mesma conta do relatório de Clientes). */
  fiadoEmAberto: number;
  /** Quantos clientes têm saldo positivo. */
  clientesDevendo: number;
  /** Soma dos saldos negativos (cliente pagou e a venda foi cancelada depois): crédito a favor deles. */
  creditoClientes: number;
};

export async function resumoHub(periodo: Periodo): Promise<ResumoHub> {
  // Fiado em aberto é calculado por cliente (saldo = DEBITO − PAGAMENTO − ESTORNO)
  // e soma só os positivos: o crédito de um cliente não abate a dívida dos outros.
  const [vendas, perdas, despesas, produtosVendidos, produtos, lancamentosFiado] = await Promise.all([
    db.venda.aggregate({
      where: filtroVendas(periodo),
      _count: { _all: true },
      _sum: { total: true, custoTotal: true, taxasTotal: true },
    }),
    db.perda.aggregate({ where: { data: filtroData(periodo) }, _sum: { valorTotal: true } }),
    somarDespesas(periodo),
    db.itemVenda.groupBy({ by: ["produtoId"], where: { venda: filtroVendas(periodo) } }),
    carregarProdutos(),
    db.lancamentoFiado.groupBy({ by: ["clienteId", "tipo"], _sum: { valor: true } }),
  ]);
  const fiado = totalFiadoEmAberto(lancamentosFiado.map((l) => ({ clienteId: l.clienteId, tipo: l.tipo, valor: l._sum.valor ?? 0 })));

  const lucro = calcularLucro({
    receita: vendas._sum.total ?? 0,
    cmv: vendas._sum.custoTotal ?? 0,
    taxas: vendas._sum.taxasTotal ?? 0,
    perdas: perdas._sum.valorTotal ?? 0,
    despesas,
  });
  const idsVendidos = new Set(produtosVendidos.map((g) => g.produtoId));
  const encalhados = produtosSemVenda(produtos.values(), idsVendidos).length;

  return {
    vendas: vendas._count._all,
    receita: lucro.receita,
    cmv: lucro.cmv,
    taxas: lucro.taxas,
    perdas: lucro.perdas,
    despesas: lucro.despesas,
    lucroBruto: lucro.lucroBruto,
    lucroAposTaxas: lucro.lucroAposTaxas,
    lucroReal: lucro.lucroReal,
    margemRealBp: lucro.margemRealBp,
    ticketMedio: mediaInteira(lucro.receita, vendas._count._all),
    produtosDistintos: idsVendidos.size,
    encalhados,
    fiadoEmAberto: fiado.emAberto,
    clientesDevendo: fiado.clientesDevendo,
    creditoClientes: fiado.credito,
  };
}

// ---------------------------------------------------------------- mais vendidos

export type RelatorioMaisVendidos = {
  ranking: LinhaRanking[];
  semVenda: LinhaSemVenda[];
  categorias: { id: number; nome: string }[];
  categoriaId: number | null;
  categoriaNome: string | null;
  totais: {
    produtos: number;
    receita: number;
    custo: number;
    lucroBruto: number;
    margemBp: number;
    encalhados: number;
    valorEncalhado: number;
  };
};

export async function relatorioMaisVendidos(periodo: Periodo, categoriaId: number | null): Promise<RelatorioMaisVendidos> {
  const [itens, produtos, categorias] = await Promise.all([
    carregarItensComReceita(periodo),
    carregarProdutos(),
    listarCategoriasComProdutos(),
  ]);

  const categoriaValida = categorias.find((c) => c.id === categoriaId) ?? null;
  const idCategoria = categoriaValida?.id ?? null;

  const rankingCompleto = rankearProdutos(itens, produtos);
  const ranking = idCategoria === null ? rankingCompleto : rankingCompleto.filter((l) => l.categoriaId === idCategoria);

  const vendidos = new Set(rankingCompleto.map((l) => l.produtoId));
  const semVendaTudo = produtosSemVenda(produtos.values(), vendidos);
  const semVenda =
    idCategoria === null
      ? semVendaTudo
      : semVendaTudo.filter((l) => produtos.get(l.produtoId)?.categoriaId === idCategoria);

  const receita = ranking.reduce((s, l) => s + l.receita, 0);
  const custo = ranking.reduce((s, l) => s + l.custo, 0);

  return {
    ranking,
    semVenda,
    categorias,
    categoriaId: idCategoria,
    categoriaNome: categoriaValida?.nome ?? null,
    totais: {
      produtos: ranking.length,
      receita,
      custo,
      lucroBruto: receita - custo,
      margemBp: margemBp(receita, receita - custo),
      encalhados: semVenda.length,
      valorEncalhado: semVenda.reduce((s, l) => s + l.valorImobilizado, 0),
    },
  };
}

// ---------------------------------------------------------------- lucro

export type RelatorioLucro = {
  resumo: ResultadoLucro & { vendas: number; ticketMedio: number };
  porProduto: LinhaLucroProduto[];
  porCategoria: LinhaLucroCategoria[];
  diario: PontoDiario[];
  /** Fiado recebido em cartão/Pix no período: passou sem taxa registrada, então "taxas" e lucro real não a descontam. */
  fiadoSemTaxa: { quantidade: number; valor: number };
};

export async function relatorioLucro(periodo: Periodo): Promise<RelatorioLucro> {
  const [vendas, itens, produtos, perdasPorProduto, despesas, recebimentosFiado] = await Promise.all([
    carregarVendas(periodo),
    carregarItensComReceita(periodo),
    carregarProdutos(),
    carregarPerdasPorProduto(periodo),
    somarDespesas(periodo),
    recebimentosFiadoPorForma(periodo),
  ]);

  const receita = vendas.reduce((s, v) => s + v.total, 0);
  const cmv = vendas.reduce((s, v) => s + v.custoTotal, 0);
  const taxas = vendas.reduce((s, v) => s + v.taxasTotal, 0);
  const perdas = [...perdasPorProduto.values()].reduce((s, v) => s + v, 0);

  const lucro = calcularLucro({ receita, cmv, taxas, perdas, despesas });
  const ranking = rankearProdutos(itens, produtos);
  const porProduto = lucroPorProduto(ranking, taxas, perdasPorProduto, produtos);

  return {
    resumo: { ...lucro, vendas: vendas.length, ticketMedio: mediaInteira(receita, vendas.length) },
    porProduto,
    porCategoria: lucroPorCategoria(porProduto),
    diario: serieDiaria(vendas, periodo.de, periodo.ate),
    fiadoSemTaxa: somarFiadoSemTaxa(recebimentosFiado),
  };
}

// ---------------------------------------------------------------- pagamentos

export type RelatorioPagamentos = {
  formas: LinhaPagamento[];
  /**
   * Recebimentos de fiado do período por forma (informativo). Ficam fora de
   * `formas` e do `resumo`: a venda fiado original já contou na receita, e o
   * recebimento não tem taxa nem maquininha registradas.
   */
  recebimentosFiado: RecebimentoFiado[];
  /** Parte dos recebimentos de fiado que passou em cartão/Pix sem taxa registrada. */
  fiadoSemTaxa: { quantidade: number; valor: number };
  operadores: LinhaOperador[];
  horas: PontoHora[];
  diasSemana: PontoDiaSemana[];
  resumo: {
    vendas: number;
    pagamentos: number;
    receita: number;
    taxas: number;
    liquido: number;
    ticketMedio: number;
    horaPico: PontoHora | null;
    diaPico: PontoDiaSemana | null;
  };
};

export async function relatorioPagamentos(periodo: Periodo): Promise<RelatorioPagamentos> {
  const [grupos, vendas, usuarios, recebimentosFiado] = await Promise.all([
    db.pagamento.groupBy({
      by: ["forma"],
      where: { venda: filtroVendas(periodo) },
      _count: { _all: true },
      _sum: { valor: true, taxaValor: true },
    }),
    carregarVendas(periodo),
    db.usuario.findMany({ select: { id: true, nome: true } }),
    recebimentosFiadoPorForma(periodo),
  ]);

  const formas = resumirPagamentos(
    grupos.map((g) => ({
      forma: g.forma,
      quantidade: g._count._all,
      bruto: g._sum.valor ?? 0,
      taxas: g._sum.taxaValor ?? 0,
    })),
  );
  const horas = vendasPorHora(vendas);
  const diasSemana = vendasPorDiaSemana(vendas);
  const receita = vendas.reduce((s, v) => s + v.total, 0);
  const taxas = formas.reduce((s, f) => s + f.taxas, 0);

  const horaPico = horas.reduce<PontoHora | null>((melhor, h) => (h.quantidade > 0 && (!melhor || h.quantidade > melhor.quantidade) ? h : melhor), null);
  const diaPico = diasSemana.reduce<PontoDiaSemana | null>(
    (melhor, d) => (d.quantidade > 0 && (!melhor || d.total > melhor.total) ? d : melhor),
    null,
  );

  return {
    formas,
    recebimentosFiado,
    fiadoSemTaxa: somarFiadoSemTaxa(recebimentosFiado),
    operadores: vendasPorOperador(vendas, new Map(usuarios.map((u) => [u.id, u.nome]))),
    horas,
    diasSemana,
    resumo: {
      vendas: vendas.length,
      pagamentos: formas.reduce((s, f) => s + f.quantidade, 0),
      receita,
      taxas,
      liquido: receita - taxas,
      ticketMedio: mediaInteira(receita, vendas.length),
      horaPico,
      diaPico,
    },
  };
}

// ---------------------------------------------------------------- curva ABC

export type RelatorioAbc = {
  linhas: LinhaAbc<LinhaRanking>[];
  resumo: ResumoClasseAbc[];
  receitaTotal: number;
  totalItens: number;
};

export async function relatorioAbc(periodo: Periodo): Promise<RelatorioAbc> {
  const [itens, produtos] = await Promise.all([carregarItensComReceita(periodo), carregarProdutos()]);
  const ranking = rankearProdutos(itens, produtos);
  const linhas = classificarAbc(ranking);
  return {
    linhas,
    resumo: resumirAbc(linhas),
    receitaTotal: ranking.reduce((s, l) => s + l.receita, 0),
    totalItens: linhas.length,
  };
}

// ---------------------------------------------------------------- estoque

export type RelatorioEstoque = {
  giro: LinhaGiro[];
  parados: LinhaSemVenda[];
  imobilizado: LinhaImobilizado[];
  resumo: {
    dias: number;
    produtosComEstoque: number;
    valorImobilizado: number;
    parados: number;
    valorParado: number;
    criticos: number;
    semEstoque: number;
    excesso: number;
  };
};

export async function relatorioEstoque(periodo: Periodo): Promise<RelatorioEstoque> {
  const [grupos, produtos] = await Promise.all([
    db.itemVenda.groupBy({
      by: ["produtoId"],
      where: { venda: filtroVendas(periodo) },
      _sum: { quantidade: true },
    }),
    carregarProdutos(),
  ]);

  const vendidoPorProduto = new Map(grupos.map((g) => [g.produtoId, g._sum.quantidade ?? 0]));
  const vendidos = new Set([...vendidoPorProduto.entries()].filter(([, q]) => q > 0).map(([id]) => id));
  const giro = calcularGiro(produtos.values(), vendidoPorProduto, periodo.dias);
  const parados = produtosSemVenda(produtos.values(), vendidos);
  const imobilizado = valorImobilizadoPorCategoria(produtos.values(), vendidos);

  return {
    giro,
    parados,
    imobilizado,
    resumo: {
      dias: periodo.dias,
      produtosComEstoque: imobilizado.reduce((s, c) => s + c.produtos, 0),
      valorImobilizado: imobilizado.reduce((s, c) => s + c.valor, 0),
      parados: parados.length,
      valorParado: parados.reduce((s, p) => s + p.valorImobilizado, 0),
      criticos: giro.filter((l) => l.situacao === "critico").length,
      semEstoque: giro.filter((l) => l.situacao === "sem-estoque").length,
      excesso: giro.filter((l) => l.situacao === "excesso").length,
    },
  };
}

// ---------------------------------------------------------------- clientes

export type RelatorioClientes = {
  ranking: LinhaCliente[];
  fiado: LinhaFiado[];
  resumo: {
    vendas: number;
    vendasIdentificadas: number;
    percentualIdentificadasBp: number;
    receitaIdentificada: number;
    clientesDistintos: number;
    fiadoEmAberto: number;
    clientesComFiado: number;
  };
};

export async function relatorioClientes(periodo: Periodo): Promise<RelatorioClientes> {
  const [vendasComCliente, totalVendas, clientes, lancamentos] = await Promise.all([
    db.venda.findMany({
      where: { ...filtroVendas(periodo), clienteId: { not: null } },
      select: { clienteId: true, total: true },
    }),
    db.venda.count({ where: filtroVendas(periodo) }),
    db.cliente.findMany({ select: { id: true, nome: true, telefone: true, limiteFiado: true } }),
    db.lancamentoFiado.groupBy({ by: ["clienteId", "tipo"], _sum: { valor: true } }),
  ]);

  const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
  const ranking = rankearClientes(vendasComCliente, nomes);
  const fiado = saldosFiadoEmAberto(
    lancamentos.map((l) => ({ clienteId: l.clienteId, tipo: l.tipo, valor: l._sum.valor ?? 0 })),
    new Map(clientes.map((c) => [c.id, { nome: c.nome, telefone: c.telefone, limiteFiado: c.limiteFiado }])),
  );

  const receitaIdentificada = ranking.reduce((s, l) => s + l.total, 0);
  return {
    ranking,
    fiado,
    resumo: {
      vendas: totalVendas,
      vendasIdentificadas: vendasComCliente.length,
      percentualIdentificadasBp: totalVendas > 0 ? Math.round((vendasComCliente.length / totalVendas) * 10000) : 0,
      receitaIdentificada,
      clientesDistintos: ranking.length,
      fiadoEmAberto: fiado.reduce((s, f) => s + f.saldo, 0),
      clientesComFiado: fiado.length,
    },
  };
}

// ---------------------------------------------------------------- conciliação de maquininhas

export type RelatorioConciliacao = ResultadoConciliacao & {
  /** todas as maquininhas cadastradas (pro filtro), ativas primeiro */
  maquininhas: { id: number; nome: string; ativo: boolean }[];
  maquininhaId: number | null;
  maquininhaNome: string | null;
  /**
   * Recebimentos de fiado em cartão/Pix no período. Não entram na lista:
   * o recebimento de fiado não registra maquininha, NSU nem taxa, então
   * esse dinheiro aparece no extrato da adquirente sem linha aqui pra bater.
   */
  fiadoSemTaxa: { quantidade: number; valor: number };
};

/**
 * Pagamentos em cartão (débito/crédito) e Pix que passou na maquininha, de
 * vendas concluídas do período, agrupados por maquininha, dia e data prevista
 * de recebimento. Cartão gravado sem maquininha (venda antiga) aparece como
 * "Sem maquininha". Pix sem maquininha fica de fora (não é conciliável).
 */
export async function relatorioConciliacao(periodo: Periodo, maquininhaId: number | null): Promise<RelatorioConciliacao> {
  const [maquininhas, pagamentos, recebimentosFiado] = await Promise.all([
    db.maquininha.findMany({
      orderBy: [{ ativo: "desc" }, { padrao: "desc" }, { nome: "asc" }],
      select: { id: true, nome: true, ativo: true, prazoDebitoDias: true, prazoCreditoDias: true, prazoPixDias: true },
    }),
    db.pagamento.findMany({
      where: {
        venda: filtroVendas(periodo),
        OR: [{ forma: { in: ["DEBITO", "CREDITO"] } }, { forma: "PIX", maquininhaId: { not: null } }],
        ...(maquininhaId === null ? {} : maquininhaId === SEM_MAQUININHA_ID ? { maquininhaId: null } : { maquininhaId }),
      },
      select: {
        id: true,
        vendaId: true,
        forma: true,
        parcelas: true,
        valor: true,
        taxaValor: true,
        nsu: true,
        autorizacao: true,
        maquininhaId: true,
        venda: { select: { numero: true, criadoEm: true } },
      },
      orderBy: { id: "asc" },
    }),
    recebimentosFiadoPorForma(periodo),
  ]);

  const mapa = new Map<number, MaquininhaConciliacao>(maquininhas.map((m) => [m.id, m]));
  const agrupado = agruparConciliacao(
    pagamentos.map((p) => ({
      pagamentoId: p.id,
      vendaId: p.vendaId,
      vendaNumero: p.venda.numero,
      criadoEm: p.venda.criadoEm,
      forma: p.forma as FormaMaquininha,
      parcelas: p.parcelas,
      valor: p.valor,
      taxaValor: p.taxaValor,
      nsu: p.nsu,
      autorizacao: p.autorizacao,
      maquininhaId: p.maquininhaId,
    })),
    mapa,
  );
  const escolhida = maquininhaId !== null ? mapa.get(maquininhaId) : undefined;
  return {
    ...agrupado,
    maquininhas: maquininhas.map((m) => ({ id: m.id, nome: m.nome, ativo: m.ativo })),
    maquininhaId: escolhida ? escolhida.id : maquininhaId === SEM_MAQUININHA_ID ? SEM_MAQUININHA_ID : null,
    maquininhaNome: escolhida?.nome ?? (maquininhaId === SEM_MAQUININHA_ID ? "Sem maquininha" : null),
    fiadoSemTaxa: somarFiadoSemTaxa(recebimentosFiado),
  };
}

// ---------------------------------------------------------------- exportação CSV

export const TIPOS_EXPORTACAO = [
  "mais-vendidos",
  "sem-venda",
  "lucro-produtos",
  "lucro-categorias",
  "lucro-diario",
  "pagamentos",
  "operadores",
  "horas",
  "dias-semana",
  "abc",
  "estoque-giro",
  "estoque-parados",
  "estoque-imobilizado",
  "clientes",
  "fiado",
  "conciliacao",
  "conciliacao-dias",
  "conciliacao-receber",
] as const;

export type TipoExportacao = (typeof TIPOS_EXPORTACAO)[number];

export function ehTipoExportacao(valor: string | null | undefined): valor is TipoExportacao {
  return TIPOS_EXPORTACAO.some((t) => t === valor);
}

const reais = (c: number): string => formatarReais(c, false);
const pct = (bp: number): string => formatarPercentual(bp);
// Quantidade só com o número ("12", "0,350") pra o Excel somar e ordenar; a unidade vai em coluna própria.
const qtd = (milesimos: number, unidade: "UN" | "KG"): string => formatarQuantidade(milesimos, unidade);
const un = (unidade: "UN" | "KG"): string => (unidade === "KG" ? "kg" : "un");

/**
 * Gera o CSV de um relatório pro período. Devolve nome de arquivo sugerido e
 * o conteúdo pronto (com BOM e ";").
 */
export async function exportarCsv(
  tipo: TipoExportacao,
  periodo: Periodo,
  opcoes: { categoriaId?: number | null; maquininhaId?: number | null } = {},
): Promise<{ nomeArquivo: string; conteudo: string }> {
  const sufixo = `${periodo.de}_a_${periodo.ate}`;
  let cabecalho: string[] = [];
  let linhas: CelulaCsv[][] = [];

  switch (tipo) {
    case "mais-vendidos": {
      const r = await relatorioMaisVendidos(periodo, opcoes.categoriaId ?? null);
      cabecalho = ["Posição", "Produto", "Categoria", "Quantidade vendida", "Unidade", "Nº de vendas", "Receita", "Custo", "Lucro sobre mercadorias", "Margem", "Participação"];
      linhas = r.ranking.map((l, i) => [
        i + 1,
        l.nome,
        l.categoria,
        qtd(l.quantidade, l.unidade),
        un(l.unidade),
        l.vendas,
        reais(l.receita),
        reais(l.custo),
        reais(l.lucroBruto),
        pct(l.margemBp),
        pct(l.participacaoBp),
      ]);
      break;
    }
    case "sem-venda": {
      const r = await relatorioMaisVendidos(periodo, opcoes.categoriaId ?? null);
      cabecalho = ["Produto", "Categoria", "Estoque", "Unidade", "Custo unitário", "Valor parado"];
      linhas = r.semVenda.map((l) => [l.nome, l.categoria, qtd(l.estoque, l.unidade), un(l.unidade), reais(l.precoCusto), reais(l.valorImobilizado)]);
      break;
    }
    case "lucro-produtos": {
      const r = await relatorioLucro(periodo);
      cabecalho = ["Produto", "Categoria", "Quantidade", "Unidade", "Receita", "CMV", "Taxas rateadas", "Perdas", "Lucro", "Margem"];
      linhas = r.porProduto.map((l) => [
        l.nome,
        l.categoria,
        qtd(l.quantidade, l.unidade),
        un(l.unidade),
        reais(l.receita),
        reais(l.cmv),
        reais(l.taxas),
        reais(l.perdas),
        reais(l.lucro),
        pct(l.margemBp),
      ]);
      break;
    }
    case "lucro-categorias": {
      const r = await relatorioLucro(periodo);
      cabecalho = ["Categoria", "Produtos", "Receita", "CMV", "Taxas rateadas", "Perdas", "Lucro", "Margem", "Participação"];
      linhas = r.porCategoria.map((l) => [
        l.categoria,
        l.produtos,
        reais(l.receita),
        reais(l.cmv),
        reais(l.taxas),
        reais(l.perdas),
        reais(l.lucro),
        pct(l.margemBp),
        pct(l.participacaoBp),
      ]);
      break;
    }
    case "lucro-diario": {
      const r = await relatorioLucro(periodo);
      cabecalho = ["Dia", "Vendas", "Receita", "CMV", "Lucro antes das taxas"];
      linhas = r.diario.map((p) => [p.dia.split("-").reverse().join("/"), p.vendas, reais(p.receita), reais(p.cmv), reais(p.lucroBruto)]);
      break;
    }
    case "pagamentos": {
      const r = await relatorioPagamentos(periodo);
      cabecalho = ["Forma de pagamento", "Quantidade", "Valor bruto", "Taxas", "Valor líquido", "Participação"];
      linhas = r.formas.map((f) => [ROTULO_FORMA_PAGAMENTO[f.forma], f.quantidade, reais(f.bruto), reais(f.taxas), reais(f.liquido), pct(f.participacaoBp)]);
      break;
    }
    case "operadores": {
      const r = await relatorioPagamentos(periodo);
      cabecalho = ["Operador", "Vendas", "Total", "Ticket médio", "Participação"];
      linhas = r.operadores.map((o) => [o.nome, o.quantidade, reais(o.total), reais(o.ticketMedio), pct(o.participacaoBp)]);
      break;
    }
    case "horas": {
      const r = await relatorioPagamentos(periodo);
      cabecalho = ["Hora", "Vendas", "Total"];
      linhas = r.horas.map((h) => [h.rotulo, h.quantidade, reais(h.total)]);
      break;
    }
    case "dias-semana": {
      const r = await relatorioPagamentos(periodo);
      cabecalho = ["Dia da semana", "Vendas", "Total", "Ticket médio"];
      linhas = r.diasSemana.map((d) => [d.rotulo, d.quantidade, reais(d.total), reais(d.ticketMedio)]);
      break;
    }
    case "abc": {
      const r = await relatorioAbc(periodo);
      cabecalho = ["Posição", "Classe", "Produto", "Categoria", "Quantidade", "Unidade", "Receita", "Participação", "Acumulado"];
      linhas = r.linhas.map((l) => [l.posicao, l.classe, l.nome, l.categoria, qtd(l.quantidade, l.unidade), un(l.unidade), reais(l.receita), pct(l.participacaoBp), pct(l.acumuladoBp)]);
      break;
    }
    case "estoque-giro": {
      const r = await relatorioEstoque(periodo);
      cabecalho = ["Produto", "Categoria", "Unidade", "Estoque atual", "Vendido no período", "Estoque médio", "Giro", "Cobertura (dias)", "Valor em estoque", "Situação"];
      linhas = r.giro.map((l) => [
        l.nome,
        l.categoria,
        un(l.unidade),
        qtd(l.estoqueAtual, l.unidade),
        qtd(l.quantidadeVendida, l.unidade),
        qtd(l.estoqueMedio, l.unidade),
        l.giro === null ? "" : String(l.giro).replace(".", ","),
        l.cobertura === null ? "" : l.cobertura,
        reais(l.valorImobilizado),
        ROTULO_SITUACAO_ESTOQUE[l.situacao],
      ]);
      break;
    }
    case "estoque-parados": {
      const r = await relatorioEstoque(periodo);
      cabecalho = ["Produto", "Categoria", "Estoque", "Unidade", "Custo unitário", "Valor parado"];
      linhas = r.parados.map((l) => [l.nome, l.categoria, qtd(l.estoque, l.unidade), un(l.unidade), reais(l.precoCusto), reais(l.valorImobilizado)]);
      break;
    }
    case "estoque-imobilizado": {
      const r = await relatorioEstoque(periodo);
      cabecalho = ["Categoria", "Produtos com estoque", "Produtos parados", "Valor em estoque", "Valor parado", "Participação"];
      linhas = r.imobilizado.map((c) => [c.categoria, c.produtos, c.parados, reais(c.valor), reais(c.valorParado), pct(c.participacaoBp)]);
      break;
    }
    case "clientes": {
      const r = await relatorioClientes(periodo);
      cabecalho = ["Cliente", "Compras", "Total", "Ticket médio", "Participação"];
      linhas = r.ranking.map((c) => [c.nome, c.compras, reais(c.total), reais(c.ticketMedio), pct(c.participacaoBp)]);
      break;
    }
    case "fiado": {
      const r = await relatorioClientes(periodo);
      cabecalho = ["Cliente", "Telefone", "Saldo em aberto", "Limite", "Uso do limite"];
      linhas = r.fiado.map((f) => [f.nome, f.telefone ?? "", reais(f.saldo), reais(f.limite), f.limite > 0 ? pct(f.usoLimiteBp) : "Sem limite"]);
      break;
    }
    case "conciliacao": {
      const r = await relatorioConciliacao(periodo, opcoes.maquininhaId ?? null);
      cabecalho = ["Data e hora", "Cupom nº", "Maquininha", "Forma", "Parcelas", "Bruto", "Taxa", "Líquido", "NSU", "Autorização", "Previsto pra", "Última parcela prevista"];
      linhas = r.transacoes.map((t) => [
        formatarDataHora(t.criadoEm),
        t.vendaNumero,
        t.nome,
        ROTULO_FORMA_PAGAMENTO[t.forma],
        t.parcelas,
        reais(t.bruto),
        reais(t.taxa),
        reais(t.liquido),
        t.nsu ?? "",
        t.autorizacao ?? "",
        t.dataPrevista.split("-").reverse().join("/"),
        t.parcelado ? t.dataPrevistaFinal.split("-").reverse().join("/") : "",
      ]);
      break;
    }
    case "conciliacao-dias": {
      const r = await relatorioConciliacao(periodo, opcoes.maquininhaId ?? null);
      cabecalho = [
        "Dia",
        "Maquininha",
        "Transações",
        "Bruto",
        "Taxas",
        "Líquido",
        "Débito (qtd)",
        "Débito bruto",
        "Débito líquido",
        "Crédito (qtd)",
        "Crédito bruto",
        "Crédito líquido",
        "Pix (qtd)",
        "Pix bruto",
        "Pix líquido",
      ];
      linhas = r.porDia.map((d) => [
        d.diaRotulo,
        d.nome,
        d.quantidade,
        reais(d.bruto),
        reais(d.taxas),
        reais(d.liquido),
        d.debitoQuantidade,
        reais(d.debitoBruto),
        reais(d.debitoLiquido),
        d.creditoQuantidade,
        reais(d.creditoBruto),
        reais(d.creditoLiquido),
        d.pixQuantidade,
        reais(d.pixBruto),
        reais(d.pixLiquido),
      ]);
      break;
    }
    case "conciliacao-receber": {
      const r = await relatorioConciliacao(periodo, opcoes.maquininhaId ?? null);
      cabecalho = ["Previsto pra", "Maquininha", "Lançamentos", "Bruto", "Taxas", "Líquido a receber"];
      linhas = r.aReceber.map((a) => [a.dataPrevistaRotulo, a.nome, a.quantidade, reais(a.bruto), reais(a.taxas), reais(a.liquido)]);
      break;
    }
  }

  return { nomeArquivo: `relatorio-${tipo}_${sufixo}.csv`, conteudo: gerarCsv(cabecalho, linhas) };
}
