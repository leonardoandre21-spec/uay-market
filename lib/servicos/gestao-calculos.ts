// Cálculos puros do módulo de Gestão: DRE simplificado, variações, séries por dia,
// progresso de meta, dinheiro esperado no caixa e CSV do fechamento.
// Nada aqui acessa banco. Tudo em centavos inteiros (dinheiro), milésimos (quantidade)
// e pontos-base (percentual). Divisão por zero sempre protegida.

import { BP } from "@/lib/dinheiro";
import {
  addDays,
  formatarDiaCurto,
  formatarMesAno,
  limitesDoDia,
  limitesDoMesAnoMes,
  noFuso,
  paraDataInput,
  parseDataInput,
  subDays,
} from "@/lib/datas";
import { ratearProporcional } from "@/lib/servicos/relatorios-calculos";

// ---------------------------------------------------------------- tipos

/** Linha de detalhe de perda (por motivo) ou despesa (por categoria). */
export type LinhaDetalhe = {
  rotulo: string;
  valor: number; // centavos
  registros: number;
};

/** Números brutos que o banco entrega pra montar a DRE de um período. */
export type EntradasDre = {
  receitaBruta: number; // centavos, soma de Venda.total (CONCLUIDA)
  taxas: number; // centavos, soma de Venda.taxasTotal
  cmv: number; // centavos, soma de Venda.custoTotal
  numeroVendas: number;
  perdas: LinhaDetalhe[]; // por motivo
  despesas: LinhaDetalhe[]; // por categoria (só as que entram no resultado, ver despesaEntraNoResultado)
};

/** DRE simplificado, pronto pra exibir. */
export type Dre = {
  receitaBruta: number;
  taxas: number;
  receitaLiquida: number;
  cmv: number;
  lucroBruto: number;
  margemBrutaBp: number; // sobre a receita bruta
  perdasTotal: number;
  perdas: LinhaDetalhe[];
  despesasTotal: number;
  despesas: LinhaDetalhe[];
  lucroLiquido: number;
  margemLiquidaBp: number; // sobre a receita bruta
  numeroVendas: number;
  ticketMedio: number;
};

export type PontoDia = {
  dia: string; // "yyyy-MM-dd" no fuso do mercado
  receita: number;
  lucroBruto: number;
  vendas: number;
};

export type ProgressoMeta = {
  meta: number;
  realizado: number;
  percentualBp: number; // pode passar de 100%
  percentualLimitadoBp: number; // travado em 100% pra barra
  falta: number; // centavos que faltam (0 se atingiu)
  atingida: boolean;
};

export type EntradasDinheiroEsperado = {
  valorAbertura: number;
  vendasDinheiro: number;
  suprimentos: number;
  sangrias: number;
  fiadoRecebidoDinheiro: number;
  despesasDoCaixa: number;
};

export type AnoMes = { ano: number; mes: number };

// ---------------------------------------------------------------- utilidades numéricas

/** Divisão segura devolvendo pontos-base. Base zero ou negativa vira 0. */
export function margemBp(valor: number, base: number): number {
  if (base <= 0) return 0;
  return Math.round((valor / base) * BP);
}

/** Ticket médio em centavos. Sem vendas devolve 0. */
export function ticketMedio(total: number, numeroVendas: number): number {
  if (numeroVendas <= 0) return 0;
  return Math.round(total / numeroVendas);
}

/**
 * Variação percentual entre dois valores, em pontos-base (1250 = +12,50%).
 * Usa o módulo do anterior como base pra que um prejuízo virando lucro dê variação positiva.
 * Devolve null quando não há base de comparação (anterior = 0).
 */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * BP);
}

/** "+12,5%", "-3,1%" ou "n/d" quando não há base. Arredonda em inteiro (sem erro de ponto flutuante). */
export function formatarVariacao(bp: number | null, casas: 0 | 1 | 2 = 1): string {
  if (bp === null) return "n/d";
  const divisor = 10 ** (2 - casas); // pontos-base por unidade da última casa exibida
  const arredondado = Math.round(Math.abs(bp) / divisor);
  const sinal = arredondado === 0 ? "" : bp > 0 ? "+" : "-";
  const escala = 10 ** casas;
  const inteiro = Math.floor(arredondado / escala);
  const decimais = arredondado % escala;
  const texto = casas === 0 ? `${inteiro}` : `${inteiro},${String(decimais).padStart(casas, "0")}`;
  return `${sinal}${texto}%`;
}

/** Duração em milissegundos -> "3h 20min", "45min", "menos de 1min". */
export function formatarDuracao(ms: number): string {
  const minutos = Math.max(0, Math.floor(ms / 60000));
  if (minutos < 1) return "menos de 1min";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto}min`;
  if (resto === 0) return `${horas}h`;
  return `${horas}h ${resto}min`;
}

// ---------------------------------------------------------------- DRE

export function montarDre(entradas: EntradasDre): Dre {
  const receitaBruta = entradas.receitaBruta;
  const taxas = entradas.taxas;
  const cmv = entradas.cmv;
  const receitaLiquida = receitaBruta - taxas;
  const lucroBruto = receitaLiquida - cmv;
  const perdas = [...entradas.perdas].sort((a, b) => b.valor - a.valor);
  const despesas = [...entradas.despesas].sort((a, b) => b.valor - a.valor);
  const perdasTotal = perdas.reduce((acc, p) => acc + p.valor, 0);
  const despesasTotal = despesas.reduce((acc, d) => acc + d.valor, 0);
  const lucroLiquido = lucroBruto - perdasTotal - despesasTotal;
  return {
    receitaBruta,
    taxas,
    receitaLiquida,
    cmv,
    lucroBruto,
    margemBrutaBp: margemBp(lucroBruto, receitaBruta),
    perdasTotal,
    perdas,
    despesasTotal,
    despesas,
    lucroLiquido,
    margemLiquidaBp: margemBp(lucroLiquido, receitaBruta),
    numeroVendas: entradas.numeroVendas,
    ticketMedio: ticketMedio(receitaBruta, entradas.numeroVendas),
  };
}

export const DRE_VAZIA: EntradasDre = {
  receitaBruta: 0,
  taxas: 0,
  cmv: 0,
  numeroVendas: 0,
  perdas: [],
  despesas: [],
};

/** Linha do demonstrativo já comparada com o período anterior. */
export type LinhaDre = {
  chave: string;
  rotulo: string;
  tipo: "receita" | "deducao" | "resultado" | "detalhe";
  valor: number;
  valorAnterior: number;
  variacaoBp: number | null;
  margemBp?: number; // só em linhas de resultado
  margemAnteriorBp?: number;
};

/** Monta as linhas do demonstrativo (mês atual x anterior) na ordem de exibição. */
export function linhasDre(atual: Dre, anterior: Dre): LinhaDre[] {
  const linha = (
    chave: string,
    rotulo: string,
    tipo: LinhaDre["tipo"],
    valor: number,
    valorAnterior: number,
    extra?: Partial<LinhaDre>,
  ): LinhaDre => ({
    chave,
    rotulo,
    tipo,
    valor,
    valorAnterior,
    variacaoBp: variacaoPercentual(valor, valorAnterior),
    ...extra,
  });

  const detalhes = (
    prefixo: string,
    atuais: LinhaDetalhe[],
    anteriores: LinhaDetalhe[],
  ): LinhaDre[] => {
    const rotulos = new Set<string>([...atuais.map((l) => l.rotulo), ...anteriores.map((l) => l.rotulo)]);
    return [...rotulos]
      .map((rotulo) => {
        const a = atuais.find((l) => l.rotulo === rotulo)?.valor ?? 0;
        const b = anteriores.find((l) => l.rotulo === rotulo)?.valor ?? 0;
        return linha(`${prefixo}:${rotulo}`, rotulo, "detalhe", a, b);
      })
      .sort((x, y) => y.valor - x.valor || y.valorAnterior - x.valorAnterior);
  };

  return [
    linha("receitaBruta", "Receita bruta de vendas", "receita", atual.receitaBruta, anterior.receitaBruta),
    linha("taxas", "(-) Taxas de cartão e Pix", "deducao", atual.taxas, anterior.taxas),
    linha("receitaLiquida", "(=) Receita líquida", "resultado", atual.receitaLiquida, anterior.receitaLiquida),
    linha("cmv", "(-) Custo das mercadorias vendidas (CMV)", "deducao", atual.cmv, anterior.cmv),
    linha("lucroBruto", "(=) Lucro bruto", "resultado", atual.lucroBruto, anterior.lucroBruto, {
      margemBp: atual.margemBrutaBp,
      margemAnteriorBp: anterior.margemBrutaBp,
    }),
    linha("perdas", "(-) Perdas de mercadoria", "deducao", atual.perdasTotal, anterior.perdasTotal),
    ...detalhes("perda", atual.perdas, anterior.perdas),
    linha("despesas", "(-) Despesas operacionais", "deducao", atual.despesasTotal, anterior.despesasTotal),
    ...detalhes("despesa", atual.despesas, anterior.despesas),
    linha("lucroLiquido", "(=) Lucro líquido", "resultado", atual.lucroLiquido, anterior.lucroLiquido, {
      margemBp: atual.margemLiquidaBp,
      margemAnteriorBp: anterior.margemLiquidaBp,
    }),
  ];
}

// ---------------------------------------------------------------- séries por dia

/** Chave "yyyy-MM-dd" de uma data, no fuso do mercado. */
export function chaveDia(data: Date): string {
  return paraDataInput(data);
}

/** Agrupa vendas por dia (fuso do mercado), somando receita e lucro bruto. */
export function agruparVendasPorDia(
  vendas: Array<{ criadoEm: Date; total: number; custoTotal: number; taxasTotal: number }>,
): PontoDia[] {
  const mapa = new Map<string, PontoDia>();
  for (const v of vendas) {
    const dia = chaveDia(v.criadoEm);
    const ponto = mapa.get(dia) ?? { dia, receita: 0, lucroBruto: 0, vendas: 0 };
    ponto.receita += v.total;
    ponto.lucroBruto += v.total - v.custoTotal - v.taxasTotal;
    ponto.vendas += 1;
    mapa.set(dia, ponto);
  }
  return [...mapa.values()].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
}

/**
 * Preenche os dias sem registro entre `de` e `ate` (inclusive) com o valor vazio.
 * A série de entrada precisa ter a chave `dia` no formato "yyyy-MM-dd".
 * Devolve sempre em ordem cronológica; dias fora do intervalo são descartados.
 */
export function preencherDias<T extends object>(
  serie: Array<{ dia: string } & T>,
  de: Date,
  ate: Date,
  vazio: T,
): Array<{ dia: string } & T> {
  const porDia = new Map(serie.map((p) => [p.dia, p]));
  const resultado: Array<{ dia: string } & T> = [];
  const ultimo = chaveDia(ate);
  let cursor = noFuso(de);
  let chave = chaveDia(cursor);
  let protecao = 0;
  while (chave <= ultimo && protecao < 1000) {
    resultado.push(porDia.get(chave) ?? { dia: chave, ...vazio });
    cursor = addDays(cursor, 1);
    chave = chaveDia(cursor);
    protecao += 1;
  }
  return resultado;
}

/** Rótulo curto de um dia "yyyy-MM-dd" -> "16 set". */
export function rotuloDiaCurto(dia: string): string {
  const data = parseDataInput(dia);
  return data ? formatarDiaCurto(data) : dia;
}

export type EstatisticasDiarias = {
  diasComVenda: number;
  melhorDia: { dia: string; receita: number } | null;
  mediaPorDia: number; // receita / dias com venda
};

/** Dias com venda, melhor dia e média por dia com venda. */
export function estatisticasDiarias(dias: Array<{ dia: string; receita: number; vendas: number }>): EstatisticasDiarias {
  const comVenda = dias.filter((d) => d.vendas > 0);
  if (comVenda.length === 0) return { diasComVenda: 0, melhorDia: null, mediaPorDia: 0 };
  const melhor = comVenda.reduce((m, d) => (d.receita > m.receita ? d : m), comVenda[0]);
  const total = comVenda.reduce((acc, d) => acc + d.receita, 0);
  return {
    diasComVenda: comVenda.length,
    melhorDia: { dia: melhor.dia, receita: melhor.receita },
    mediaPorDia: Math.round(total / comVenda.length),
  };
}

// ---------------------------------------------------------------- meta

/** Progresso em relação à meta. Sem meta (null ou <= 0) devolve null. */
export function progressoMeta(realizado: number, meta: number | null | undefined): ProgressoMeta | null {
  if (meta === null || meta === undefined || meta <= 0) return null;
  const percentualBp = Math.round((realizado / meta) * BP);
  return {
    meta,
    realizado,
    percentualBp,
    percentualLimitadoBp: Math.min(BP, Math.max(0, percentualBp)),
    falta: Math.max(0, meta - realizado),
    atingida: realizado >= meta,
  };
}

// ---------------------------------------------------------------- caixa

/** Dinheiro que deveria estar na gaveta agora (regra do contrato). */
export function dinheiroEsperado(e: EntradasDinheiroEsperado): number {
  return (
    e.valorAbertura +
    e.vendasDinheiro +
    e.suprimentos +
    e.fiadoRecebidoDinheiro -
    e.sangrias -
    e.despesasDoCaixa
  );
}

// ---------------------------------------------------------------- fiado

/**
 * Fiado em aberto há mais de N dias. Os pagamentos quitam as compras mais antigas
 * primeiro, então o que ainda está aberto do período antigo é
 * max(0, débitos antigos - pagamentos totais) por cliente. Quem chama pode
 * incluir em `pagamentosPorCliente` os ESTORNOs de vendas antigas (abatem o
 * débito da própria venda).
 */
export function fiadoAntigoEmAberto(
  pagamentosPorCliente: Array<{ clienteId: number; valor: number }>,
  debitosAntigosPorCliente: Array<{ clienteId: number; valor: number }>,
): { total: number; clientes: number } {
  const pagos = new Map<number, number>();
  for (const p of pagamentosPorCliente) pagos.set(p.clienteId, (pagos.get(p.clienteId) ?? 0) + p.valor);
  let total = 0;
  let clientes = 0;
  for (const d of debitosAntigosPorCliente) {
    const aberto = d.valor - (pagos.get(d.clienteId) ?? 0);
    if (aberto > 0) {
      total += aberto;
      clientes += 1;
    }
  }
  return { total, clientes };
}

/** Lançamento de fiado do mês com o que o resumo precisa pra classificar. */
export type LancamentoFiadoMes = {
  tipo: "DEBITO" | "PAGAMENTO" | "ESTORNO";
  valor: number;
  formaPagamento: string | null; // null em ESTORNO e nos ajustes manuais
  vendaId: number | null; // null nos ajustes manuais
  venda: { criadoEm: Date } | null;
};

export type ResumoFiadoMes = {
  /** Compras fiado do mês menos os cancelamentos de vendas do próprio mês. */
  novo: number;
  /** Dívida antiga lançada à mão (ajuste DEBITO sem venda). */
  dividaAntigaLancada: number;
  /** Só o que os clientes pagaram de verdade (PAGAMENTO com forma). */
  recebido: number;
  /** Acerto, desconto ou dívida perdoada (PAGAMENTO sem forma): nenhum dinheiro entrou. */
  abatimentos: number;
  /** ESTORNO de vendas de meses anteriores canceladas neste mês. */
  cancelamentosAntigos: number;
};

/**
 * Resumo do fiado de um mês a partir dos lançamentos criados nele.
 * Vale a conciliação: saldoFinal(mês) − saldoFinal(mês anterior)
 * = novo + dividaAntigaLancada − recebido − abatimentos − cancelamentosAntigos.
 */
export function resumirFiadoDoMes(
  lancamentos: LancamentoFiadoMes[],
  periodo: { inicio: Date; fim: Date },
): ResumoFiadoMes {
  const r: ResumoFiadoMes = { novo: 0, dividaAntigaLancada: 0, recebido: 0, abatimentos: 0, cancelamentosAntigos: 0 };
  for (const l of lancamentos) {
    if (l.tipo === "DEBITO") {
      if (l.vendaId === null) r.dividaAntigaLancada += l.valor;
      else r.novo += l.valor;
    } else if (l.tipo === "PAGAMENTO") {
      if (l.formaPagamento === null) r.abatimentos += l.valor;
      else r.recebido += l.valor;
    } else {
      const criadoEm = l.venda?.criadoEm.getTime();
      const vendaDoMes =
        criadoEm !== undefined && criadoEm >= periodo.inicio.getTime() && criadoEm <= periodo.fim.getTime();
      if (vendaDoMes) r.novo -= l.valor;
      else r.cancelamentosAntigos += l.valor;
    }
  }
  return r;
}

// ---------------------------------------------------------------- despesas e boletos

/**
 * Uma despesa entra no resultado (DRE, lucro real) a menos que tenha nascido do
 * boleto de uma entrada de estoque: a mercadoria comprada já é abatida como CMV
 * quando é vendida, então somar o boleto contaria o mesmo custo duas vezes.
 * Boletos sem entrada (aluguel, energia...) continuam como despesa.
 */
export function despesaEntraNoResultado(despesa: { contaPagar: { entradaId: number | null } | null }): boolean {
  return despesa.contaPagar === null || despesa.contaPagar.entradaId === null;
}

/**
 * Conta a pagar que estava sem pagamento numa data: pendente até hoje, ou paga
 * só depois dela. Cancelada nunca conta. Serve pra refazer a foto do fim de um
 * mês já encerrado em vez de usar o status de hoje.
 */
export function contaSemPagamentoEm(conta: { status: string; dataPagamento: Date | null }, data: Date): boolean {
  if (conta.status === "PENDENTE") return true;
  if (conta.status === "PAGA") return conta.dataPagamento !== null && conta.dataPagamento.getTime() > data.getTime();
  return false;
}

// ---------------------------------------------------------------- períodos comparáveis

/**
 * Mesmo trecho do dia, N dias atrás: de 00:00 até o mesmo horário de `agora`.
 * Assim um dia parcial é comparado com um dia parcial, e não com o dia inteiro.
 */
export function mesmoTrechoDoDia(agoraData: Date, diasAtras: number): { inicio: Date; fim: Date } {
  const fim = subDays(noFuso(agoraData), diasAtras);
  return { inicio: limitesDoDia(fim).inicio, fim: new Date(fim.getTime()) };
}

/**
 * Trecho do mês anterior comparável com um mês em andamento: do dia 1 até o fim
 * do mesmo dia do mês em que estamos (ou do último dia, quando o mês anterior é
 * mais curto). `dia` é o dia usado como corte.
 */
export function mesAnteriorAteMesmoDia(
  ano: number,
  mes: number,
  agoraData: Date,
): { inicio: Date; fim: Date; dia: number } {
  const ant = mesAnterior(ano, mes);
  const limites = limitesDoMesAnoMes(ant.ano, ant.mes);
  const ultimoDia = noFuso(limites.fim).getDate();
  const dia = Math.min(noFuso(agoraData).getDate(), ultimoDia);
  const fim = limitesDoDia(addDays(noFuso(limites.inicio), dia - 1)).fim;
  return { inicio: limites.inicio, fim, dia };
}

// ---------------------------------------------------------------- top produtos

export type TopProduto = { produtoId: number; quantidade: number; receita: number };

/**
 * Produtos que mais faturaram, com a receita já líquida do desconto geral do
 * cupom (rateado proporcionalmente entre os itens, como no relatório Mais
 * vendidos). `porProduto` é a soma bruta de ItemVenda.total por produto;
 * `itensComDescontoGeral` são só os itens das vendas que tiveram desconto geral.
 * Empate em receita desempata pela quantidade.
 */
export function topProdutosPorReceita(
  porProduto: Array<{ produtoId: number; quantidade: number; totalBruto: number }>,
  itensComDescontoGeral: Array<{ vendaId: number; produtoId: number; total: number }>,
  descontoPorVenda: Map<number, number>,
  limite = 5,
): TopProduto[] {
  const receita = new Map<number, TopProduto>();
  for (const p of porProduto) {
    const linha = receita.get(p.produtoId) ?? { produtoId: p.produtoId, quantidade: 0, receita: 0 };
    linha.quantidade += p.quantidade;
    linha.receita += p.totalBruto;
    receita.set(p.produtoId, linha);
  }

  const porVenda = new Map<number, Array<{ produtoId: number; total: number }>>();
  for (const item of itensComDescontoGeral) {
    const lista = porVenda.get(item.vendaId);
    if (lista) lista.push(item);
    else porVenda.set(item.vendaId, [item]);
  }
  for (const [vendaId, itens] of porVenda) {
    const desconto = descontoPorVenda.get(vendaId) ?? 0;
    if (desconto <= 0) continue;
    const rateio = ratearProporcional(
      desconto,
      itens.map((i) => i.total),
    );
    itens.forEach((item, k) => {
      const linha = receita.get(item.produtoId);
      if (linha) linha.receita -= rateio[k];
    });
  }

  return [...receita.values()]
    .sort((a, b) => b.receita - a.receita || b.quantidade - a.quantidade || a.produtoId - b.produtoId)
    .slice(0, limite);
}

// ---------------------------------------------------------------- meses

export function chaveMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function mesAnterior(ano: number, mes: number): AnoMes {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export function mesSeguinte(ano: number, mes: number): AnoMes {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

export function compararMeses(a: AnoMes, b: AnoMes): number {
  return a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes;
}

/** Lista de meses de `de` até `ate` (inclusive), em ordem cronológica. Limite de 120 meses. */
export function listarMeses(de: AnoMes, ate: AnoMes): AnoMes[] {
  const meses: AnoMes[] = [];
  let cursor = { ...de };
  while (compararMeses(cursor, ate) <= 0 && meses.length < 120) {
    meses.push(cursor);
    cursor = mesSeguinte(cursor.ano, cursor.mes);
  }
  return meses;
}

/** Últimos N meses terminando em `ate`, do mais antigo pro mais recente. */
export function ultimosMeses(ate: AnoMes, quantidade: number): AnoMes[] {
  const meses: AnoMes[] = [];
  let cursor = { ...ate };
  for (let i = 0; i < quantidade; i++) {
    meses.unshift(cursor);
    cursor = mesAnterior(cursor.ano, cursor.mes);
  }
  return meses;
}

/** "setembro de 2026" */
export function rotuloMes(ano: number, mes: number): string {
  return formatarMesAno(limitesDoMesAnoMes(ano, mes).inicio);
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "set/26" */
export function rotuloMesCurto(ano: number, mes: number): string {
  return `${MESES_CURTOS[mes - 1]}/${String(ano).slice(-2)}`;
}

/** "setembro de 2026" -> "Setembro de 2026" (pra início de frase, título ou opção de lista). */
export function capitalizar(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

// ---------------------------------------------------------------- CSV

/** Valor em centavos como "1234,56" (sem símbolo, sem separador de milhar), pro Excel ler como número. */
export function centavosParaCsv(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  return `${negativo ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function celulaCsv(texto: string): string {
  if (/[";\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/**
 * CSV do DRE (separador ";", decimal com vírgula, BOM UTF-8 pro Excel em português).
 * Colunas: Linha; Mês atual; Mês anterior; Variação %; Margem %.
 */
export function montarCsvDre(linhas: LinhaDre[], rotuloMesAtual: string, rotuloMesAnterior: string): string {
  const cabecalho = ["Linha", rotuloMesAtual, rotuloMesAnterior, "Variação (%)", "Margem (%)"];
  const corpo = linhas.map((l) => [
    (l.tipo === "detalhe" ? "   " : "") + l.rotulo,
    centavosParaCsv(l.valor),
    centavosParaCsv(l.valorAnterior),
    l.variacaoBp === null ? "" : (l.variacaoBp / 100).toFixed(2).replace(".", ","),
    l.margemBp === undefined ? "" : (l.margemBp / 100).toFixed(2).replace(".", ","),
  ]);
  const registros = [cabecalho, ...corpo].map((linha) => linha.map(celulaCsv).join(";"));
  return `﻿${registros.join("\r\n")}\r\n`;
}
