import "server-only";
import type { FormaPagamento, MotivoPerda, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { obterConfiguracao, obterSessaoCaixaAberta } from "@/lib/consultas";
import { addDays, agora, limitesDoDia, limitesDoMes, limitesDoMesAnoMes, paraMesInput, subDays } from "@/lib/datas";
import { ROTULO_MOTIVO_PERDA } from "@/lib/rotulos";
import {
  agruparVendasPorDia,
  capitalizar,
  compararMeses,
  chaveMes,
  dinheiroEsperado,
  estatisticasDiarias,
  fiadoAntigoEmAberto,
  formatarDuracao,
  linhasDre,
  listarMeses,
  mesAnterior,
  mesAnteriorAteMesmoDia,
  mesSeguinte,
  mesmoTrechoDoDia,
  montarDre,
  preencherDias,
  progressoMeta,
  resumirFiadoDoMes,
  rotuloDiaCurto,
  rotuloMes,
  rotuloMesCurto,
  ticketMedio,
  topProdutosPorReceita,
  ultimosMeses,
  variacaoPercentual,
  type AnoMes,
  type Dre,
  type EntradasDre,
  type EstatisticasDiarias,
  type LinhaDetalhe,
  type LinhaDre,
  type PontoDia,
  type ProgressoMeta,
  type ResumoFiadoMes,
} from "@/lib/servicos/gestao-calculos";

// Leitura do banco pro painel do dono, fechamento mensal e comparativo.
// Uma consulta por bloco (aggregate/groupBy), tudo disparado em paralelo.
// Os cálculos ficam em gestao-calculos.ts.

type Periodo = { inicio: Date; fim: Date };

const SEM_CATEGORIA = "Sem categoria";
const SEM_FORNECEDOR = "Sem fornecedor";

/**
 * Despesas que entram no resultado (DRE, lucro real): todas, menos as geradas por
 * boleto de entrada de estoque. A mercadoria comprada já é abatida como CMV quando
 * é vendida; somar o boleto de novo contaria o mesmo custo duas vezes. Boletos sem
 * entrada (aluguel, energia...) continuam como despesa. Mesma regra de
 * `despesaEntraNoResultado` em gestao-calculos.ts, em forma de filtro do Prisma.
 */
const DESPESA_NO_RESULTADO: Prisma.DespesaWhereInput = {
  OR: [{ contaPagarId: null }, { contaPagar: { entradaId: null } }],
};

/** Contas a pagar que estavam sem pagamento numa data (regra pura: `contaSemPagamentoEm`). */
function filtroSemPagamentoEm(data: Date): Prisma.ContaPagarWhereInput {
  return { OR: [{ status: "PENDENTE" }, { status: "PAGA", dataPagamento: { gt: data } }] };
}

// ---------------------------------------------------------------- blocos reutilizáveis

/** Soma das vendas concluídas do período. */
async function agregarVendas(periodo: Periodo) {
  const r = await db.venda.aggregate({
    where: { status: "CONCLUIDA", criadoEm: { gte: periodo.inicio, lte: periodo.fim } },
    _sum: { total: true, custoTotal: true, taxasTotal: true },
    _count: { _all: true },
  });
  return {
    total: r._sum.total ?? 0,
    custoTotal: r._sum.custoTotal ?? 0,
    taxasTotal: r._sum.taxasTotal ?? 0,
    quantidade: r._count._all,
  };
}

/** Perdas do período agrupadas por motivo. */
async function perdasPorMotivo(periodo: Periodo): Promise<LinhaDetalhe[]> {
  const grupos = await db.perda.groupBy({
    by: ["motivo"],
    where: { data: { gte: periodo.inicio, lte: periodo.fim } },
    _sum: { valorTotal: true },
    _count: { _all: true },
  });
  return grupos.map((g) => ({
    rotulo: ROTULO_MOTIVO_PERDA[g.motivo as MotivoPerda],
    valor: g._sum.valorTotal ?? 0,
    registros: g._count._all,
  }));
}

/** Despesas do período agrupadas por categoria (boletos de compra de mercadoria ficam de fora, ver DESPESA_NO_RESULTADO). */
async function despesasPorCategoria(periodo: Periodo): Promise<LinhaDetalhe[]> {
  const grupos = await db.despesa.groupBy({
    by: ["categoriaId"],
    where: { data: { gte: periodo.inicio, lte: periodo.fim }, ...DESPESA_NO_RESULTADO },
    _sum: { valor: true },
    _count: { _all: true },
  });
  const ids = grupos.map((g) => g.categoriaId).filter((id): id is number => id !== null);
  const categorias = ids.length
    ? await db.categoriaDespesa.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })
    : [];
  const nomes = new Map(categorias.map((c) => [c.id, c.nome]));
  return grupos.map((g) => ({
    rotulo: g.categoriaId === null ? SEM_CATEGORIA : (nomes.get(g.categoriaId) ?? SEM_CATEGORIA),
    valor: g._sum.valor ?? 0,
    registros: g._count._all,
  }));
}

/** Números brutos da DRE de um período. */
export async function coletarEntradasDre(periodo: Periodo): Promise<EntradasDre> {
  const [vendas, perdas, despesas] = await Promise.all([
    agregarVendas(periodo),
    perdasPorMotivo(periodo),
    despesasPorCategoria(periodo),
  ]);
  return {
    receitaBruta: vendas.total,
    taxas: vendas.taxasTotal,
    cmv: vendas.custoTotal,
    numeroVendas: vendas.quantidade,
    perdas,
    despesas,
  };
}

/** Vendas por forma de pagamento no período (valor pago e taxa). */
async function pagamentosPorForma(periodo: Periodo): Promise<ResumoForma[]> {
  const grupos = await db.pagamento.groupBy({
    by: ["forma"],
    where: { venda: { status: "CONCLUIDA", criadoEm: { gte: periodo.inicio, lte: periodo.fim } } },
    _sum: { valor: true, taxaValor: true },
    _count: { _all: true },
  });
  const total = grupos.reduce((acc, g) => acc + (g._sum.valor ?? 0), 0);
  return grupos
    .map((g) => ({
      forma: g.forma as FormaPagamento,
      valor: g._sum.valor ?? 0,
      taxas: g._sum.taxaValor ?? 0,
      quantidade: g._count._all,
      participacaoBp: total > 0 ? Math.round(((g._sum.valor ?? 0) / total) * 10000) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

export type ResumoForma = {
  forma: FormaPagamento;
  valor: number;
  taxas: number;
  quantidade: number;
  participacaoBp: number;
};

/** Compras (entradas de estoque) do período. Entradas estornadas ficam de fora. */
async function agregarCompras(periodo: Periodo) {
  const r = await db.entradaEstoque.aggregate({
    where: { data: { gte: periodo.inicio, lte: periodo.fim }, estornadaEm: null },
    _sum: { valorTotal: true, frete: true },
    _count: { _all: true },
  });
  return {
    notas: r._count._all,
    mercadorias: r._sum.valorTotal ?? 0,
    frete: r._sum.frete ?? 0,
    total: (r._sum.valorTotal ?? 0) + (r._sum.frete ?? 0),
  };
}

// ---------------------------------------------------------------- resumo mensal (gráficos e comparativo)

export type ResumoMes = {
  ano: number;
  mes: number;
  chave: string; // "yyyy-MM"
  rotulo: string; // "setembro de 2026"
  rotuloCurto: string; // "set/26"
  dre: Dre;
};

/** DRE resumida de vários meses. Perdas e despesas vêm numa consulta só cada; vendas, uma agregação por mês. */
export async function resumoMensal(meses: AnoMes[]): Promise<ResumoMes[]> {
  if (meses.length === 0) return [];
  const periodos = meses.map((m) => ({ ...m, ...limitesDoMesAnoMes(m.ano, m.mes) }));
  const inicioGeral = periodos[0].inicio;
  const fimGeral = periodos[periodos.length - 1].fim;

  const [vendasPorMes, perdas, despesas] = await Promise.all([
    Promise.all(periodos.map((p) => agregarVendas(p))),
    db.perda.findMany({
      where: { data: { gte: inicioGeral, lte: fimGeral } },
      select: { data: true, valorTotal: true },
    }),
    db.despesa.findMany({
      where: { data: { gte: inicioGeral, lte: fimGeral }, ...DESPESA_NO_RESULTADO },
      select: { data: true, valor: true },
    }),
  ]);

  const perdasPorChave = new Map<string, number>();
  for (const p of perdas) {
    const chave = paraMesInput(p.data);
    perdasPorChave.set(chave, (perdasPorChave.get(chave) ?? 0) + p.valorTotal);
  }
  const despesasPorChave = new Map<string, number>();
  for (const d of despesas) {
    const chave = paraMesInput(d.data);
    despesasPorChave.set(chave, (despesasPorChave.get(chave) ?? 0) + d.valor);
  }

  return periodos.map((p, i) => {
    const chave = chaveMes(p.ano, p.mes);
    const vendas = vendasPorMes[i];
    const dre = montarDre({
      receitaBruta: vendas.total,
      taxas: vendas.taxasTotal,
      cmv: vendas.custoTotal,
      numeroVendas: vendas.quantidade,
      perdas: [{ rotulo: "Perdas", valor: perdasPorChave.get(chave) ?? 0, registros: 0 }],
      despesas: [{ rotulo: "Despesas", valor: despesasPorChave.get(chave) ?? 0, registros: 0 }],
    });
    return { ano: p.ano, mes: p.mes, chave, rotulo: rotuloMes(p.ano, p.mes), rotuloCurto: rotuloMesCurto(p.ano, p.mes), dre };
  });
}

/** Mês atual no fuso do mercado. */
export function mesAtual(): AnoMes {
  const chave = paraMesInput(agora());
  const [ano, mes] = chave.split("-").map(Number);
  return { ano, mes };
}

/**
 * Meses disponíveis no seletor do fechamento: do primeiro movimento registrado
 * (venda, despesa, compra ou perda) até o mês atual. Sempre inclui o mês pedido.
 */
export async function listarMesesDisponiveis(incluir?: AnoMes): Promise<Array<{ chave: string; rotulo: string }>> {
  const [venda, despesa, entrada, perda] = await Promise.all([
    db.venda.aggregate({ _min: { criadoEm: true } }),
    db.despesa.aggregate({ _min: { data: true } }),
    db.entradaEstoque.aggregate({ _min: { data: true } }),
    db.perda.aggregate({ _min: { data: true } }),
  ]);
  const datas = [venda._min.criadoEm, despesa._min.data, entrada._min.data, perda._min.data].filter(
    (d): d is Date => d instanceof Date,
  );
  const atual = mesAtual();
  let primeiro: AnoMes = atual;
  if (datas.length) {
    const maisAntiga = datas.reduce((a, b) => (a < b ? a : b));
    const [ano, mes] = paraMesInput(maisAntiga).split("-").map(Number);
    primeiro = { ano, mes };
  }
  if (incluir && compararMeses(incluir, primeiro) < 0) primeiro = incluir;
  const ultimo = incluir && compararMeses(incluir, atual) > 0 ? incluir : atual;
  return listarMeses(primeiro, ultimo)
    .reverse()
    .map((m) => ({ chave: chaveMes(m.ano, m.mes), rotulo: capitalizar(rotuloMes(m.ano, m.mes)) }));
}

// ---------------------------------------------------------------- painel (/gestao)

export type DadosPainel = {
  geradoEm: string;
  hoje: {
    receita: number;
    cupons: number;
    lucroBruto: number;
    ticketMedio: number;
    variacaoReceitaBp: number | null;
    variacaoCuponsBp: number | null;
    semanaPassada: { receita: number; cupons: number };
  };
  caixa:
    | { aberto: true; desde: string; abertoHa: string; dinheiroEsperado: number; operador: string }
    | { aberto: false };
  mes: {
    rotulo: string;
    receita: number;
    lucroReal: number;
    despesas: number;
    perdas: number;
    compras: number;
    comprasNotas: number;
    progresso: ProgressoMeta | null;
    metaDiaria: number | null;
  };
  serie30Dias: Array<PontoDia & { rotulo: string }>;
  alertas: {
    boletos: { atrasados: number; atrasadosTotal: number; vencendo: number; vencendoTotal: number; dias: number };
    lotes: { vencidos: number; vencendo: number; dias: number };
    produtosAbaixoMinimo: number;
    fiadoAntigo: { total: number; clientes: number; dias: number };
    diferencasCaixa: { sessoes: number; total: number; dias: number };
    canceladasHoje: { quantidade: number; total: number };
  };
  topProdutos: Array<{ produtoId: number; nome: string; unidade: "UN" | "KG"; quantidade: number; receita: number }>;
  ultimasVendas: Array<{
    id: number;
    numero: number;
    horario: string;
    total: number;
    status: "CONCLUIDA" | "CANCELADA";
    formas: FormaPagamento[];
    cliente: string | null;
    operador: string;
    itens: number;
  }>;
  formasPagamento: ResumoForma[];
};

export async function obterPainel(): Promise<DadosPainel> {
  const agoraData = agora();
  const hoje = limitesDoDia(agoraData);
  // Hoje só tem vendas até agora; a semana passada é cortada no mesmo horário pra comparação ser justa.
  const semanaPassadaAteAgora = mesmoTrechoDoDia(agoraData, 7);
  const mes = limitesDoMes(agoraData);
  const inicio30 = limitesDoDia(subDays(agoraData, 29)).inicio;
  const ha7Dias = subDays(agoraData, 7);
  const ha30Dias = subDays(agoraData, 30);

  const config = await obterConfiguracao();
  const diasVencimento = config.alertaVencimentoDias;
  const limiteVencimentoLotes = limitesDoDia(addDays(agoraData, diasVencimento)).fim;
  const limiteBoletos = limitesDoDia(addDays(agoraData, 7)).fim;

  const [
    vendasHoje,
    vendasSemanaPassada,
    sessaoAberta,
    vendasMes,
    perdasMes,
    despesasMes,
    comprasMes,
    vendas30,
    boletosAtrasados,
    boletosVencendo,
    lotesVencidos,
    lotesVencendo,
    produtosAbaixoMinimo,
    pagamentosFiado,
    debitosAntigos,
    estornosAntigos,
    sessoesComDiferenca,
    canceladasHoje,
    topGrupos,
    itensComDescontoGeral,
    vendasComDescontoGeral,
    ultimas,
    formasPagamento,
  ] = await Promise.all([
    agregarVendas(hoje),
    agregarVendas(semanaPassadaAteAgora),
    obterSessaoCaixaAberta(),
    agregarVendas(mes),
    db.perda.aggregate({ where: { data: { gte: mes.inicio, lte: mes.fim } }, _sum: { valorTotal: true } }),
    db.despesa.aggregate({ where: { data: { gte: mes.inicio, lte: mes.fim }, ...DESPESA_NO_RESULTADO }, _sum: { valor: true } }),
    agregarCompras(mes),
    db.venda.findMany({
      where: { status: "CONCLUIDA", criadoEm: { gte: inicio30, lte: hoje.fim } },
      select: { criadoEm: true, total: true, custoTotal: true, taxasTotal: true },
    }),
    db.contaPagar.aggregate({
      where: { status: "PENDENTE", vencimento: { lt: hoje.inicio } },
      _sum: { valor: true },
      _count: { _all: true },
    }),
    db.contaPagar.aggregate({
      where: { status: "PENDENTE", vencimento: { gte: hoje.inicio, lte: limiteBoletos } },
      _sum: { valor: true },
      _count: { _all: true },
    }),
    db.lote.count({ where: { quantidade: { gt: 0 }, validade: { lt: hoje.inicio }, produto: { ativo: true } } }),
    db.lote.count({
      where: { quantidade: { gt: 0 }, validade: { gte: hoje.inicio, lte: limiteVencimentoLotes }, produto: { ativo: true } },
    }),
    db.produto.count({
      where: { ativo: true, estoqueMinimo: { gt: 0 }, estoque: { lt: db.produto.fields.estoqueMinimo } },
    }),
    db.lancamentoFiado.groupBy({ by: ["clienteId"], where: { tipo: "PAGAMENTO" }, _sum: { valor: true } }),
    db.lancamentoFiado.groupBy({
      by: ["clienteId"],
      where: { tipo: "DEBITO", criadoEm: { lt: ha30Dias } },
      _sum: { valor: true },
    }),
    // ESTORNO abate o débito da própria venda: só os de vendas antigas reduzem o fiado antigo.
    db.lancamentoFiado.groupBy({
      by: ["clienteId"],
      where: { tipo: "ESTORNO", venda: { criadoEm: { lt: ha30Dias } } },
      _sum: { valor: true },
    }),
    db.sessaoCaixa.aggregate({
      where: { status: "FECHADO", fechadoEm: { gte: ha7Dias }, diferenca: { not: 0 } },
      _sum: { diferenca: true },
      _count: { _all: true },
    }),
    db.venda.aggregate({
      where: { status: "CANCELADA", canceladaEm: { gte: hoje.inicio, lte: hoje.fim } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    // Top 5: soma bruta por produto + itens das vendas com desconto geral, pra ratear o
    // desconto e a receita bater com o relatório Mais vendidos (ItemVenda.total é antes dele).
    db.itemVenda.groupBy({
      by: ["produtoId"],
      where: { venda: { status: "CONCLUIDA", criadoEm: { gte: mes.inicio, lte: mes.fim } } },
      _sum: { quantidade: true, total: true },
    }),
    db.itemVenda.findMany({
      where: { venda: { status: "CONCLUIDA", criadoEm: { gte: mes.inicio, lte: mes.fim }, desconto: { gt: 0 } } },
      select: { vendaId: true, produtoId: true, total: true },
    }),
    db.venda.findMany({
      where: { status: "CONCLUIDA", criadoEm: { gte: mes.inicio, lte: mes.fim }, desconto: { gt: 0 } },
      select: { id: true, desconto: true },
    }),
    db.venda.findMany({
      orderBy: { criadoEm: "desc" },
      take: 10,
      select: {
        id: true,
        numero: true,
        criadoEm: true,
        total: true,
        status: true,
        cliente: { select: { nome: true } },
        usuario: { select: { nome: true } },
        pagamentos: { select: { forma: true } },
        _count: { select: { itens: true } },
      },
    }),
    pagamentosPorForma(mes),
  ]);

  // Caixa aberto: dinheiro esperado na gaveta agora.
  let caixa: DadosPainel["caixa"] = { aberto: false };
  if (sessaoAberta) {
    const [vendasDinheiro, movimentos, fiadoDinheiro, despesasCaixa, operador] = await Promise.all([
      db.pagamento.aggregate({
        where: { forma: "DINHEIRO", venda: { sessaoId: sessaoAberta.id, status: "CONCLUIDA" } },
        _sum: { valor: true },
      }),
      db.movimentoCaixa.groupBy({ by: ["tipo"], where: { sessaoId: sessaoAberta.id }, _sum: { valor: true } }),
      db.lancamentoFiado.aggregate({
        where: { sessaoId: sessaoAberta.id, tipo: "PAGAMENTO", formaPagamento: "DINHEIRO" },
        _sum: { valor: true },
      }),
      db.despesa.aggregate({ where: { sessaoId: sessaoAberta.id, pagoDoCaixa: true }, _sum: { valor: true } }),
      db.usuario.findUnique({ where: { id: sessaoAberta.usuarioAberturaId }, select: { nome: true } }),
    ]);
    const suprimentos = movimentos.find((m) => m.tipo === "SUPRIMENTO")?._sum.valor ?? 0;
    const sangrias = movimentos.find((m) => m.tipo === "SANGRIA")?._sum.valor ?? 0;
    caixa = {
      aberto: true,
      desde: sessaoAberta.abertoEm.toISOString(),
      abertoHa: formatarDuracao(agoraData.getTime() - sessaoAberta.abertoEm.getTime()),
      operador: operador?.nome ?? "operador",
      dinheiroEsperado: dinheiroEsperado({
        valorAbertura: sessaoAberta.valorAbertura,
        vendasDinheiro: vendasDinheiro._sum.valor ?? 0,
        suprimentos,
        sangrias,
        fiadoRecebidoDinheiro: fiadoDinheiro._sum.valor ?? 0,
        despesasDoCaixa: despesasCaixa._sum.valor ?? 0,
      }),
    };
  }

  // Top 5 com o desconto geral rateado; nomes dos produtos numa consulta só.
  const top = topProdutosPorReceita(
    topGrupos.map((g) => ({ produtoId: g.produtoId, quantidade: g._sum.quantidade ?? 0, totalBruto: g._sum.total ?? 0 })),
    itensComDescontoGeral,
    new Map(vendasComDescontoGeral.map((v) => [v.id, v.desconto])),
    5,
  );
  const idsTop = top.map((g) => g.produtoId);
  const produtosTop = idsTop.length
    ? await db.produto.findMany({ where: { id: { in: idsTop } }, select: { id: true, nome: true, unidade: true } })
    : [];
  const produtoPorId = new Map(produtosTop.map((p) => [p.id, p]));

  const perdasTotal = perdasMes._sum.valorTotal ?? 0;
  const despesasTotal = despesasMes._sum.valor ?? 0;
  const lucroRealMes = vendasMes.total - vendasMes.custoTotal - vendasMes.taxasTotal - perdasTotal - despesasTotal;

  const serie = preencherDias(agruparVendasPorDia(vendas30), inicio30, hoje.fim, {
    receita: 0,
    lucroBruto: 0,
    vendas: 0,
  });

  const fiadoAntigo = fiadoAntigoEmAberto(
    [...pagamentosFiado, ...estornosAntigos].map((g) => ({ clienteId: g.clienteId, valor: g._sum.valor ?? 0 })),
    debitosAntigos.map((g) => ({ clienteId: g.clienteId, valor: g._sum.valor ?? 0 })),
  );

  const mesRef = mesAtual();

  return {
    geradoEm: agoraData.toISOString(),
    hoje: {
      receita: vendasHoje.total,
      cupons: vendasHoje.quantidade,
      lucroBruto: vendasHoje.total - vendasHoje.custoTotal - vendasHoje.taxasTotal,
      ticketMedio: ticketMedio(vendasHoje.total, vendasHoje.quantidade),
      variacaoReceitaBp: variacaoPercentual(vendasHoje.total, vendasSemanaPassada.total),
      variacaoCuponsBp: variacaoPercentual(vendasHoje.quantidade, vendasSemanaPassada.quantidade),
      semanaPassada: { receita: vendasSemanaPassada.total, cupons: vendasSemanaPassada.quantidade },
    },
    caixa,
    mes: {
      rotulo: rotuloMes(mesRef.ano, mesRef.mes),
      receita: vendasMes.total,
      lucroReal: lucroRealMes,
      despesas: despesasTotal,
      perdas: perdasTotal,
      compras: comprasMes.total,
      comprasNotas: comprasMes.notas,
      progresso: progressoMeta(vendasMes.total, config.metaVendasMensal),
      metaDiaria: config.metaVendasDiaria && config.metaVendasDiaria > 0 ? config.metaVendasDiaria : null,
    },
    serie30Dias: serie.map((p) => ({ ...p, rotulo: rotuloDiaCurto(p.dia) })),
    alertas: {
      boletos: {
        atrasados: boletosAtrasados._count._all,
        atrasadosTotal: boletosAtrasados._sum.valor ?? 0,
        vencendo: boletosVencendo._count._all,
        vencendoTotal: boletosVencendo._sum.valor ?? 0,
        dias: 7,
      },
      lotes: { vencidos: lotesVencidos, vencendo: lotesVencendo, dias: diasVencimento },
      produtosAbaixoMinimo,
      fiadoAntigo: { ...fiadoAntigo, dias: 30 },
      diferencasCaixa: {
        sessoes: sessoesComDiferenca._count._all,
        total: sessoesComDiferenca._sum.diferenca ?? 0,
        dias: 7,
      },
      canceladasHoje: { quantidade: canceladasHoje._count._all, total: canceladasHoje._sum.total ?? 0 },
    },
    topProdutos: top.map((g) => {
      const p = produtoPorId.get(g.produtoId);
      return {
        produtoId: g.produtoId,
        nome: p?.nome ?? `Produto ${g.produtoId}`,
        unidade: p?.unidade ?? "UN",
        quantidade: g.quantidade,
        receita: g.receita,
      };
    }),
    ultimasVendas: ultimas.map((v) => ({
      id: v.id,
      numero: v.numero,
      horario: v.criadoEm.toISOString(),
      total: v.total,
      status: v.status,
      formas: [...new Set(v.pagamentos.map((p) => p.forma))],
      cliente: v.cliente?.nome ?? null,
      operador: v.usuario.nome,
      itens: v._count.itens,
    })),
    formasPagamento,
  };
}

// ---------------------------------------------------------------- fechamento (/gestao/fechamento)

/** Como o mês anterior entra na comparação: inteiro, ou só até o mesmo dia quando o mês consultado está em andamento. */
export type ComparacaoFechamento = {
  parcial: boolean;
  /** Dia de corte do mês anterior (só quando parcial). */
  ateDia: number | null;
  /** "agosto de 2026" ou "agosto de 2026 até o dia 16". */
  rotulo: string;
};

/** Período do mês consultado e o trecho do mês anterior usado na comparação (mesma regra do fechamento e do CSV). */
export function periodosDoFechamento(ano: number, mes: number, agoraData: Date = agora()) {
  const periodo = limitesDoMesAnoMes(ano, mes);
  const ant = mesAnterior(ano, mes);
  const ehMesAtual = compararMeses({ ano, mes }, mesAtual()) === 0;
  // Mês em andamento só tem vendas até hoje: comparar com o mês anterior inteiro pintaria
  // tudo de vermelho. Corta o anterior no mesmo dia do mês.
  const trechoAnterior = ehMesAtual ? mesAnteriorAteMesmoDia(ano, mes, agoraData) : null;
  const periodoAnterior: Periodo = trechoAnterior ?? limitesDoMesAnoMes(ant.ano, ant.mes);
  const rotuloAnterior = rotuloMes(ant.ano, ant.mes);
  const comparacao: ComparacaoFechamento = {
    parcial: trechoAnterior !== null,
    ateDia: trechoAnterior?.dia ?? null,
    rotulo: trechoAnterior ? `${rotuloAnterior} até o dia ${trechoAnterior.dia}` : rotuloAnterior,
  };
  return { periodo, periodoAnterior, ant, ehMesAtual, comparacao };
}

export type DadosFechamento = {
  ano: number;
  mes: number;
  chave: string;
  rotulo: string;
  anterior: { chave: string; rotulo: string };
  proximo: { chave: string; rotulo: string } | null;
  ehMesAtual: boolean;
  comparacao: ComparacaoFechamento;
  dre: Dre;
  dreAnterior: Dre;
  linhas: LinhaDre[];
  indicadores: EstatisticasDiarias & { numeroVendas: number; ticketMedio: number; receita: number };
  compras: {
    notas: number;
    mercadorias: number;
    frete: number;
    total: number;
    fornecedores: Array<{ nome: string; notas: number; total: number }>;
  };
  boletos: {
    pagos: { quantidade: number; total: number };
    /** Vencimento no mês e sem pagamento na data de referência. */
    pendentesNoMes: { quantidade: number; total: number };
    /** Vencidos e sem pagamento na data de referência. */
    atrasados: { quantidade: number; total: number };
    /** Mês já encerrado: a foto é do último dia dele; senão, é a situação de hoje. */
    mesEncerrado: boolean;
    /** Data de referência da foto (ISO). */
    referencia: string;
  };
  formasPagamento: ResumoForma[];
  caixa: { sessoes: number; fechadas: number; comDiferenca: number; somaDiferencas: number };
  fiado: ResumoFiadoMes & { saldoFinal: number };
  ultimosMeses: ResumoMes[];
  mesesDisponiveis: Array<{ chave: string; rotulo: string }>;
};

export async function obterFechamento(ano: number, mes: number): Promise<DadosFechamento> {
  const agoraData = agora();
  const { periodo, periodoAnterior, ant, ehMesAtual, comparacao } = periodosDoFechamento(ano, mes, agoraData);
  const atual = mesAtual();
  // Boletos: num mês já encerrado a foto é do fim dele (pendente ou pago só depois);
  // no mês em andamento, é a situação de hoje. "Atrasado" = venceu antes da referência.
  const mesEncerrado = periodo.fim < agoraData;
  const referenciaBoletos = mesEncerrado ? periodo.fim : limitesDoDia(agoraData).inicio;
  const semPagamento = filtroSemPagamentoEm(referenciaBoletos);

  const [
    entradas,
    entradasAnterior,
    vendasDoMes,
    compras,
    fornecedoresGrupos,
    boletosPagos,
    boletosPendentes,
    boletosAtrasados,
    formasPagamento,
    sessoesAbertas,
    sessoesFechadas,
    sessoesComDiferenca,
    fiadoMes,
    fiadoAcumulado,
    serieMeses,
    mesesDisponiveis,
  ] = await Promise.all([
    coletarEntradasDre(periodo),
    coletarEntradasDre(periodoAnterior),
    db.venda.findMany({
      where: { status: "CONCLUIDA", criadoEm: { gte: periodo.inicio, lte: periodo.fim } },
      select: { criadoEm: true, total: true, custoTotal: true, taxasTotal: true },
    }),
    agregarCompras(periodo),
    db.entradaEstoque.groupBy({
      by: ["fornecedorId"],
      where: { data: { gte: periodo.inicio, lte: periodo.fim }, estornadaEm: null },
      _sum: { valorTotal: true, frete: true },
      _count: { _all: true },
      orderBy: { _sum: { valorTotal: "desc" } },
      take: 5,
    }),
    db.contaPagar.aggregate({
      where: { status: "PAGA", dataPagamento: { gte: periodo.inicio, lte: periodo.fim } },
      _sum: { valorPago: true },
      _count: { _all: true },
    }),
    db.contaPagar.aggregate({
      where: { ...semPagamento, vencimento: { gte: periodo.inicio, lte: periodo.fim } },
      _sum: { valor: true },
      _count: { _all: true },
    }),
    db.contaPagar.aggregate({
      where: { ...semPagamento, vencimento: { lt: referenciaBoletos } },
      _sum: { valor: true },
      _count: { _all: true },
    }),
    pagamentosPorForma(periodo),
    db.sessaoCaixa.count({ where: { abertoEm: { gte: periodo.inicio, lte: periodo.fim } } }),
    db.sessaoCaixa.aggregate({
      where: { status: "FECHADO", fechadoEm: { gte: periodo.inicio, lte: periodo.fim } },
      _sum: { diferenca: true },
      _count: { _all: true },
    }),
    db.sessaoCaixa.count({
      where: { status: "FECHADO", fechadoEm: { gte: periodo.inicio, lte: periodo.fim }, diferenca: { not: 0 } },
    }),
    // Lançamentos do mês com forma, venda e data da venda: o resumo separa o que foi
    // pago de verdade, os ajustes manuais e os cancelamentos de vendas antigas.
    db.lancamentoFiado.findMany({
      where: { criadoEm: { gte: periodo.inicio, lte: periodo.fim } },
      select: { tipo: true, valor: true, formaPagamento: true, vendaId: true, venda: { select: { criadoEm: true } } },
    }),
    db.lancamentoFiado.groupBy({ by: ["tipo"], where: { criadoEm: { lte: periodo.fim } }, _sum: { valor: true } }),
    resumoMensal(ultimosMeses({ ano, mes }, 6)),
    listarMesesDisponiveis({ ano, mes }),
  ]);

  const idsFornecedores = fornecedoresGrupos.map((g) => g.fornecedorId).filter((id): id is number => id !== null);
  const fornecedores = idsFornecedores.length
    ? await db.fornecedor.findMany({ where: { id: { in: idsFornecedores } }, select: { id: true, nome: true } })
    : [];
  const nomeFornecedor = new Map(fornecedores.map((f) => [f.id, f.nome]));

  const dre = montarDre(entradas);
  const dreAnterior = montarDre(entradasAnterior);
  const dias = preencherDias(agruparVendasPorDia(vendasDoMes), periodo.inicio, periodo.fim, {
    receita: 0,
    lucroBruto: 0,
    vendas: 0,
  });
  const estatisticas = estatisticasDiarias(dias);

  const somaFiado = (lista: typeof fiadoAcumulado, tipo: "DEBITO" | "PAGAMENTO" | "ESTORNO") =>
    lista.find((g) => g.tipo === tipo)?._sum.valor ?? 0;
  // Saldo devedor = DEBITO − PAGAMENTO − ESTORNO.
  const saldoFiado = (lista: typeof fiadoAcumulado) =>
    somaFiado(lista, "DEBITO") - somaFiado(lista, "PAGAMENTO") - somaFiado(lista, "ESTORNO");

  const prox = compararMeses({ ano, mes }, atual) < 0 ? mesSeguinte(ano, mes) : null;

  return {
    ano,
    mes,
    chave: chaveMes(ano, mes),
    rotulo: rotuloMes(ano, mes),
    anterior: { chave: chaveMes(ant.ano, ant.mes), rotulo: rotuloMes(ant.ano, ant.mes) },
    proximo: prox ? { chave: chaveMes(prox.ano, prox.mes), rotulo: rotuloMes(prox.ano, prox.mes) } : null,
    ehMesAtual,
    comparacao,
    dre,
    dreAnterior,
    linhas: linhasDre(dre, dreAnterior),
    indicadores: {
      ...estatisticas,
      numeroVendas: dre.numeroVendas,
      ticketMedio: dre.ticketMedio,
      receita: dre.receitaBruta,
    },
    compras: {
      ...compras,
      fornecedores: fornecedoresGrupos.map((g) => ({
        nome: g.fornecedorId === null ? SEM_FORNECEDOR : (nomeFornecedor.get(g.fornecedorId) ?? SEM_FORNECEDOR),
        notas: g._count._all,
        total: (g._sum.valorTotal ?? 0) + (g._sum.frete ?? 0),
      })),
    },
    boletos: {
      pagos: { quantidade: boletosPagos._count._all, total: boletosPagos._sum.valorPago ?? 0 },
      pendentesNoMes: { quantidade: boletosPendentes._count._all, total: boletosPendentes._sum.valor ?? 0 },
      atrasados: { quantidade: boletosAtrasados._count._all, total: boletosAtrasados._sum.valor ?? 0 },
      mesEncerrado,
      referencia: referenciaBoletos.toISOString(),
    },
    formasPagamento,
    caixa: {
      sessoes: sessoesAbertas,
      fechadas: sessoesFechadas._count._all,
      comDiferenca: sessoesComDiferenca,
      somaDiferencas: sessoesFechadas._sum.diferenca ?? 0,
    },
    // saldoFinal(mês) − saldoFinal(mês anterior) = novo + dividaAntigaLancada − recebido − abatimentos − cancelamentosAntigos.
    fiado: {
      ...resumirFiadoDoMes(fiadoMes, periodo),
      saldoFinal: saldoFiado(fiadoAcumulado),
    },
    ultimosMeses: serieMeses,
    mesesDisponiveis,
  };
}

// ---------------------------------------------------------------- comparativo (/gestao/comparativo)

/** Últimos N meses (padrão 12) com a DRE resumida de cada um, do mais recente pro mais antigo. */
export async function obterComparativo(quantidade = 12): Promise<ResumoMes[]> {
  const meses = ultimosMeses(mesAtual(), quantidade);
  const resumo = await resumoMensal(meses);
  return [...resumo].reverse();
}
