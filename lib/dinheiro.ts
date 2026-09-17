// Dinheiro em centavos inteiros, quantidades em milésimos inteiros,
// percentuais em pontos-base. Toda conversão passa por aqui.

export const MIL = 1000; // 1 unidade = 1000 milésimos
export const BP = 10000; // 100% = 10000 pontos-base

/** Formata centavos como "R$ 1.234,56". */
export function formatarReais(centavos: number, comSimbolo = true): string {
  const negativo = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const reais = Math.floor(abs / 100);
  const cents = abs % 100;
  const inteiro = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const texto = `${inteiro},${cents.toString().padStart(2, "0")}`;
  return `${negativo ? "-" : ""}${comSimbolo ? "R$ " : ""}${texto}`;
}

/**
 * Converte texto digitado ("12,50", "12.50", "R$ 1.234,56", "1234") em centavos.
 * Retorna null se não for número. Sem vírgula/ponto decimal, trata como reais.
 */
export function parseReais(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "number") return Number.isFinite(texto) ? Math.round(texto * 100) : null;
  let s = texto.trim().replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (!s) return null;
  const negativo = s.startsWith("-");
  if (negativo) s = s.slice(1);
  // "1.234,56" -> "1234.56"; "1234.56" -> "1234.56"; "12,5" -> "12.5"
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d*(\.\d{0,2})?$/.test(s) || s === "." || s === "") return null;
  const [intPart, decPart = ""] = s.split(".");
  const centavos = parseInt(intPart || "0", 10) * 100 + parseInt(decPart.padEnd(2, "0"), 10);
  return negativo ? -centavos : centavos;
}

/** Quantidade em milésimos -> texto ("2", "0,350"). Unidades inteiras sem decimais. */
export function formatarQuantidade(milesimos: number, unidade: "UN" | "KG" = "UN"): string {
  const abs = Math.abs(milesimos);
  const inteiro = Math.floor(abs / MIL);
  const resto = abs % MIL;
  const sinal = milesimos < 0 ? "-" : "";
  if (unidade === "UN" && resto === 0) return `${sinal}${inteiro}`;
  return `${sinal}${inteiro},${resto.toString().padStart(3, "0")}`;
}

/** Quantidade em milésimos com sufixo da unidade ("2 un", "0,350 kg"). */
export function formatarQuantidadeComUnidade(milesimos: number, unidade: "UN" | "KG"): string {
  return `${formatarQuantidade(milesimos, unidade)} ${unidade === "KG" ? "kg" : "un"}`;
}

/** Texto ("2", "0,350", "1.5") -> milésimos. null se inválido. */
export function parseQuantidade(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "number") return Number.isFinite(texto) ? Math.round(texto * MIL) : null;
  let s = texto.trim().replace(/\s/g, "").replace(/(kg|un)$/i, "");
  if (!s) return null;
  s = s.replace(",", ".");
  if (!/^\d*(\.\d{0,3})?$/.test(s) || s === ".") return null;
  const [intPart, decPart = ""] = s.split(".");
  return parseInt(intPart || "0", 10) * MIL + parseInt(decPart.padEnd(3, "0"), 10);
}

/** Total de uma linha: quantidade (milésimos) x preço (centavos) -> centavos, arredondado. */
export function totalLinha(quantidadeMilesimos: number, precoCentavos: number): number {
  return Math.round((quantidadeMilesimos * precoCentavos) / MIL);
}

/** Aplica percentual em pontos-base sobre centavos. 1000 bp = 10%. */
export function aplicarPercentual(centavos: number, pontosBase: number): number {
  return Math.round((centavos * pontosBase) / BP);
}

/** Percentual em pontos-base -> "1,99%". */
export function formatarPercentual(pontosBase: number, casas = 2): string {
  return `${(pontosBase / 100).toFixed(casas).replace(".", ",")}%`;
}

/** Texto "1,99" ou "1.99" (em %) -> pontos-base (199). */
export function parsePercentual(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "number") return Number.isFinite(texto) ? Math.round(texto * 100) : null;
  const s = texto.trim().replace("%", "").replace(",", ".");
  if (!/^-?\d*(\.\d{0,2})?$/.test(s) || s === "" || s === ".") return null;
  return Math.round(parseFloat(s) * 100);
}

/** Margem bruta em pontos-base sobre o preço de venda. Retorna 0 se preço for 0. */
export function margemPontosBase(precoVenda: number, custo: number): number {
  if (precoVenda <= 0) return 0;
  return Math.round(((precoVenda - custo) / precoVenda) * BP);
}

/** Markup em pontos-base sobre o custo. Retorna 0 se custo for 0. */
export function markupPontosBase(precoVenda: number, custo: number): number {
  if (custo <= 0) return 0;
  return Math.round(((precoVenda - custo) / custo) * BP);
}

/**
 * Custo médio ponderado após uma entrada.
 * (estoqueAtual*custoAtual + qtdEntrada*custoEntrada) / (estoqueAtual+qtdEntrada)
 * Se o estoque atual for <= 0, o custo novo é o da entrada.
 */
export function custoMedioPonderado(
  estoqueAtual: number,
  custoAtual: number,
  quantidadeEntrada: number,
  custoEntrada: number,
): number {
  if (quantidadeEntrada <= 0) return custoAtual;
  if (estoqueAtual <= 0) return custoEntrada;
  const total = estoqueAtual * custoAtual + quantidadeEntrada * custoEntrada;
  return Math.round(total / (estoqueAtual + quantidadeEntrada));
}

/** Taxa de uma forma de pagamento sobre um valor: percentual (bp) + fixa (centavos). */
export function calcularTaxa(valor: number, taxaPercentual: number, taxaFixa: number): number {
  if (valor <= 0) return 0;
  return aplicarPercentual(valor, taxaPercentual) + taxaFixa;
}

/** Soma segura de inteiros. */
export function somar(valores: Array<number | null | undefined>): number {
  return valores.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}
