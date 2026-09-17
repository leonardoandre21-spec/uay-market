// Cálculos puros do módulo Financeiro (despesas, boletos a pagar, fornecedores).
// Nada aqui toca o banco: tudo recebe dados prontos e devolve números/datas.
// Dinheiro em centavos, percentuais em pontos-base, datas no fuso do mercado.

import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BP } from "@/lib/dinheiro";
import { FUSO, noFuso } from "@/lib/datas";

// ---------------------------------------------------------------- meses

export type AnoMes = { ano: number; mes: number }; // mes 1-12

/** Ano/mês (1-12) de uma data, no fuso do mercado. */
export function mesDe(data: Date): AnoMes {
  const d = noFuso(data);
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

/** Normaliza ano + índice de mês (0-based, pode estourar) em ano/mês válidos. */
function normalizarMes(ano: number, indiceMes: number): { ano: number; indiceMes: number } {
  const total = ano * 12 + indiceMes;
  return { ano: Math.floor(total / 12), indiceMes: ((total % 12) + 12) % 12 };
}

export function mesAnterior({ ano, mes }: AnoMes): AnoMes {
  const n = normalizarMes(ano, mes - 2);
  return { ano: n.ano, mes: n.indiceMes + 1 };
}

export function mesSeguinte({ ano, mes }: AnoMes): AnoMes {
  const n = normalizarMes(ano, mes);
  return { ano: n.ano, mes: n.indiceMes + 1 };
}

/** "2026-09" (valor de <input type="month"> e do parâmetro ?mes=). */
export function chaveMes({ ano, mes }: AnoMes): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** "setembro de 2026" */
export function rotuloMes({ ano, mes }: AnoMes): string {
  return format(new TZDate(ano, mes - 1, 1, FUSO), "MMMM 'de' yyyy", { locale: ptBR });
}

/** "set/2026" */
export function rotuloMesCurto({ ano, mes }: AnoMes): string {
  return format(new TZDate(ano, mes - 1, 1, FUSO), "MMM/yyyy", { locale: ptBR });
}

export function mesmoMes(a: AnoMes, b: AnoMes): boolean {
  return a.ano === b.ano && a.mes === b.mes;
}

/** Quantos dias do mês já passaram (inclui hoje). Mês futuro = 0; mês passado = todos os dias. */
export function diasDecorridosNoMes(anoMes: AnoMes, hoje: Date): number {
  const h = noFuso(hoje);
  const atual = { ano: h.getFullYear(), mes: h.getMonth() + 1 };
  const totalDias = getDaysInMonth(new TZDate(anoMes.ano, anoMes.mes - 1, 1, FUSO));
  if (anoMes.ano > atual.ano || (anoMes.ano === atual.ano && anoMes.mes > atual.mes)) return 0;
  if (mesmoMes(anoMes, atual)) return h.getDate();
  return totalDias;
}

// ---------------------------------------------------------------- datas mensais

/**
 * Data no início do dia (fuso do mercado) para ano/índice de mês/dia,
 * ajustando o dia ao fim do mês quando ele não existe (31/01 -> 28/02).
 * O índice de mês pode estourar (13 = fevereiro do ano seguinte).
 */
export function dataMensal(ano: number, indiceMes: number, dia: number): Date {
  const n = normalizarMes(ano, indiceMes);
  const primeiro = new TZDate(n.ano, n.indiceMes, 1, FUSO);
  const diasNoMes = getDaysInMonth(primeiro);
  const d = new TZDate(n.ano, n.indiceMes, Math.min(Math.max(dia, 1), diasNoMes), FUSO);
  return new Date(d.getTime());
}

/**
 * Próximo vencimento de uma conta recorrente: mês seguinte ao vencimento atual,
 * no dia original da conta (`diaVencimento`), ou no último dia do mês quando ele
 * não existe (31/01 -> 28/02 -> 31/03). Sem dia original, usa o dia do vencimento
 * atual, o que faz o 31 virar 28 pra sempre; por isso a conta guarda o dia.
 */
export function proximoVencimentoRecorrente(vencimentoAtual: Date, diaVencimento?: number | null): Date {
  const base = noFuso(vencimentoAtual);
  const dia = diaVencimento && diaVencimento >= 1 ? Math.floor(diaVencimento) : base.getDate();
  return dataMensal(base.getFullYear(), base.getMonth() + 1, dia);
}

/**
 * Datas das parcelas: uma por mês a partir do primeiro vencimento, mantendo
 * o dia. Se o dia não existe no mês, usa o último dia (31/01 -> 28/02 -> 31/03).
 * Mesma regra de `proximoVencimentoRecorrente`, com o dia do primeiro vencimento.
 */
export function gerarParcelas(primeiroVencimento: Date, totalParcelas: number): Date[] {
  const total = Math.max(1, Math.floor(totalParcelas));
  const base = noFuso(primeiroVencimento);
  const dia = base.getDate();
  const datas: Date[] = [dataMensal(base.getFullYear(), base.getMonth(), dia)];
  for (let i = 1; i < total; i++) datas.push(proximoVencimentoRecorrente(datas[i - 1], dia));
  return datas;
}

/** Próximo vencimento sem dia original guardado: mesmo dia no mês seguinte (ajustando fim de mês). */
export function proximoVencimentoMensal(vencimento: Date): Date {
  return proximoVencimentoRecorrente(vencimento, null);
}

/** "todo dia 31" pra conta recorrente; sem dia guardado, "todo mês". */
export function rotuloRecorrencia(diaVencimento: number | null | undefined): string {
  return diaVencimento ? `todo dia ${diaVencimento}` : "todo mês";
}

/** Mesma data, transportada para outro mês (mantém o dia, ajusta fim de mês). */
export function transportarParaMes(data: Date, destino: AnoMes): Date {
  return dataMensal(destino.ano, destino.mes - 1, noFuso(data).getDate());
}

// ---------------------------------------------------------------- faixas de vencimento

export type FaixaVencimento = "atrasada" | "hoje" | "7d" | "30d" | "futura";

/** Classifica pelo número de dias até o vencimento (negativo = já passou). */
export function classificarPorDias(dias: number): FaixaVencimento {
  if (dias < 0) return "atrasada";
  if (dias === 0) return "hoje";
  if (dias <= 7) return "7d";
  if (dias <= 30) return "30d";
  return "futura";
}

/** Dias corridos entre a referência e o vencimento (negativo = atrasada). */
export function diasAteVencimento(vencimento: Date, referencia: Date): number {
  return differenceInCalendarDays(noFuso(vencimento), noFuso(referencia));
}

export function classificarConta(vencimento: Date, referencia: Date): FaixaVencimento {
  return classificarPorDias(diasAteVencimento(vencimento, referencia));
}

export type ResumoFaixa = { total: number; quantidade: number };
export type ResumoPendentes = Record<FaixaVencimento, ResumoFaixa> & {
  /** Vencem de hoje até daqui a 7 dias (inclui hoje, não inclui atrasadas). */
  proximos7: ResumoFaixa;
  /** Vencem de hoje até daqui a 30 dias (inclui hoje e os 7 dias). */
  proximos30: ResumoFaixa;
  todas: ResumoFaixa;
};

function faixaVazia(): ResumoFaixa {
  return { total: 0, quantidade: 0 };
}

function somarNaFaixa(faixa: ResumoFaixa, valor: number): void {
  faixa.total += valor;
  faixa.quantidade += 1;
}

/** Totais das contas pendentes por faixa de vencimento. */
export function resumirPendentes(
  contas: Array<{ vencimento: Date; valor: number }>,
  referencia: Date,
): ResumoPendentes {
  const r: ResumoPendentes = {
    atrasada: faixaVazia(),
    hoje: faixaVazia(),
    "7d": faixaVazia(),
    "30d": faixaVazia(),
    futura: faixaVazia(),
    proximos7: faixaVazia(),
    proximos30: faixaVazia(),
    todas: faixaVazia(),
  };
  for (const c of contas) {
    const faixa = classificarConta(c.vencimento, referencia);
    somarNaFaixa(r[faixa], c.valor);
    somarNaFaixa(r.todas, c.valor);
    if (faixa === "hoje" || faixa === "7d") somarNaFaixa(r.proximos7, c.valor);
    if (faixa === "hoje" || faixa === "7d" || faixa === "30d") somarNaFaixa(r.proximos30, c.valor);
  }
  return r;
}

// ---------------------------------------------------------------- totais e variações

export type TotalCategoria = { categoria: string; total: number; quantidade: number };

/** Soma por categoria, da maior pra menor. Itens sem categoria entram em "Sem categoria". */
export function totaisPorCategoria(
  itens: Array<{ valor: number; categoria: string | null | undefined }>,
  rotuloSemCategoria = "Sem categoria",
): TotalCategoria[] {
  const mapa = new Map<string, TotalCategoria>();
  for (const item of itens) {
    const nome = item.categoria?.trim() || rotuloSemCategoria;
    const atual = mapa.get(nome) ?? { categoria: nome, total: 0, quantidade: 0 };
    atual.total += item.valor;
    atual.quantidade += 1;
    mapa.set(nome, atual);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria, "pt-BR"));
}

/**
 * Variação percentual em pontos-base entre dois totais (atual vs. anterior).
 * Anterior zero: devolve 0 se ambos forem zero, ou null quando não dá pra comparar.
 */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * BP);
}

/** Variação em pontos-base -> "+12,5%", "-3,0%", "0,0%". null -> "sem base de comparação". */
export function formatarVariacao(pontosBase: number | null): string {
  if (pontosBase === null) return "sem base de comparação";
  const sinal = pontosBase > 0 ? "+" : pontosBase < 0 ? "-" : "";
  return `${sinal}${(Math.abs(pontosBase) / 100).toFixed(1).replace(".", ",")}%`;
}

/** Média diária em centavos (arredondada). Zero dias = 0. */
export function mediaDiaria(total: number, dias: number): number {
  if (dias <= 0) return 0;
  return Math.round(total / dias);
}

// ---------------------------------------------------------------- calendário

export type GradeMes = {
  totalDias: number;
  /** Dia da semana do dia 1 (0 = domingo). */
  primeiroDiaSemana: number;
  /** Semanas com 7 posições cada; null = célula fora do mês. */
  semanas: Array<Array<number | null>>;
};

/** Grade de um mês pra desenhar calendário (domingo a sábado). */
export function gradeDoMes({ ano, mes }: AnoMes): GradeMes {
  const primeiro = new TZDate(ano, mes - 1, 1, FUSO);
  const totalDias = getDaysInMonth(primeiro);
  const primeiroDiaSemana = primeiro.getDay();
  const celulas: Array<number | null> = [];
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null);
  for (let d = 1; d <= totalDias; d++) celulas.push(d);
  while (celulas.length % 7 !== 0) celulas.push(null);
  const semanas: Array<Array<number | null>> = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return { totalDias, primeiroDiaSemana, semanas };
}

export type GrupoDia<T> = { dia: number; total: number; itens: T[] };

/** Agrupa itens pelo dia do mês, somando o valor. Só devolve dias com itens, em ordem. */
export function agruparPorDia<T extends { dia: number; valor: number }>(itens: T[]): GrupoDia<T>[] {
  const mapa = new Map<number, GrupoDia<T>>();
  for (const item of itens) {
    const grupo = mapa.get(item.dia) ?? { dia: item.dia, total: 0, itens: [] };
    grupo.total += item.valor;
    grupo.itens.push(item);
    mapa.set(item.dia, grupo);
  }
  return [...mapa.values()].sort((a, b) => a.dia - b.dia);
}

/** Dia do mês de uma data, no fuso do mercado. */
export function diaDoMes(data: Date): number {
  return noFuso(data).getDate();
}

// ---------------------------------------------------------------- pagamento

/** Diferença entre o valor pago e o valor original: positivo = juros/multa, negativo = desconto. */
export function diferencaPagamento(valorOriginal: number, valorPago: number): number {
  return valorPago - valorOriginal;
}

/** Texto do parcelamento ("2/6") ou vazio quando a conta não é parcelada. */
export function rotuloParcela(parcelaAtual: number | null | undefined, totalParcelas: number | null | undefined): string {
  if (!parcelaAtual || !totalParcelas || totalParcelas <= 1) return "";
  return `${parcelaAtual}/${totalParcelas}`;
}
