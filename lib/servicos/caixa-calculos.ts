// Cálculos puros do caixa: sem banco, sem Date, só inteiros em centavos.
// Tudo que decide o fechamento passa por aqui e tem teste em tests/caixa.test.ts.

import type { FormaPagamento, StatusVenda, TipoMovimentoCaixa } from "@prisma/client";
import { formatarReais, somar } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO } from "@/lib/rotulos";

// ---------------------------------------------------------------- dinheiro esperado

export type EntradasEsperado = {
  /** Fundo de troco com que o caixa abriu. */
  valorAbertura: number;
  /** Soma de Pagamento.valor em DINHEIRO das vendas CONCLUIDAS da sessão. */
  vendasDinheiro: number;
  /** Soma dos MovimentoCaixa SUPRIMENTO. */
  suprimentos: number;
  /** Soma dos MovimentoCaixa SANGRIA. */
  sangrias: number;
  /** Soma das Despesas com pagoDoCaixa = true na sessão. */
  despesasCaixa: number;
  /** Soma dos LancamentoFiado PAGAMENTO recebidos em DINHEIRO na sessão. */
  recebimentosFiadoDinheiro: number;
};

/**
 * Dinheiro que deveria estar na gaveta (fórmula do contrato):
 * abertura + vendas em dinheiro + suprimentos + fiado recebido em dinheiro
 * − sangrias − despesas pagas do caixa.
 */
export function calcularEsperado(e: EntradasEsperado): number {
  return (
    e.valorAbertura +
    e.vendasDinheiro +
    e.suprimentos +
    e.recebimentosFiadoDinheiro -
    e.sangrias -
    e.despesasCaixa
  );
}

/** Diferença do fechamento: contado − esperado. Positivo = sobra, negativo = falta. */
export function calcularDiferenca(valorContado: number, valorEsperado: number): number {
  return valorContado - valorEsperado;
}

export type SituacaoDiferenca = "exato" | "sobra" | "falta";

export function situacaoDiferenca(diferenca: number): SituacaoDiferenca {
  if (diferenca === 0) return "exato";
  return diferenca > 0 ? "sobra" : "falta";
}

/** Texto curto pro dono do mercado: "Bateu", "Sobra de R$ 5,00", "Falta de R$ 2,50". */
export function descreverDiferenca(diferenca: number): string {
  const situacao = situacaoDiferenca(diferenca);
  if (situacao === "exato") return "Bateu";
  const valor = formatarReais(Math.abs(diferenca));
  return situacao === "sobra" ? `Sobra de ${valor}` : `Falta de ${valor}`;
}

/** Tom visual (Selo/Indicador) pra cada situação. */
export function tomDiferenca(diferenca: number): "sucesso" | "alerta" | "perigo" {
  const situacao = situacaoDiferenca(diferenca);
  if (situacao === "exato") return "sucesso";
  return situacao === "sobra" ? "alerta" : "perigo";
}

/**
 * Depois do fechamento o esperado recalculado pode divergir do gravado em
 * `valorFechamentoEsperado` (ADMIN cancela uma venda em dinheiro da sessão,
 * por exemplo). Devolve recalculado − gravado, ou null quando não há valor
 * gravado (sessão aberta ou fechamento legado) ou quando os dois batem.
 * O contado e a diferença gravados continuam se referindo ao valor do fechamento.
 */
export function variacaoEsperadoAposFechamento(
  esperadoNoFechamento: number | null,
  esperadoRecalculado: number,
): number | null {
  if (esperadoNoFechamento === null) return null;
  const variacao = esperadoRecalculado - esperadoNoFechamento;
  return variacao === 0 ? null : variacao;
}

// ---------------------------------------------------------------- observação legada

const PREFIXO_FECHAMENTO_LEGADO = /(^|\n)Fechamento:[ \t]*/;

/**
 * Antes da coluna `observacaoFechamento`, o fechamento era gravado dentro de
 * `observacao` com o prefixo "Fechamento: ", na linha seguinte à da abertura.
 * Separa o texto legado nas duas colunas. Sem o prefixo, tudo é da abertura.
 */
export function separarObservacaoLegada(observacao: string | null): {
  abertura: string | null;
  fechamento: string | null;
} {
  if (!observacao) return { abertura: null, fechamento: null };
  const marca = PREFIXO_FECHAMENTO_LEGADO.exec(observacao);
  if (!marca) return { abertura: observacao, fechamento: null };
  const abertura = observacao.slice(0, marca.index).trim();
  const fechamento = observacao.slice(marca.index + marca[0].length).trim();
  return { abertura: abertura || null, fechamento: fechamento || null };
}

// ---------------------------------------------------------------- pagamentos por forma

export type PagamentoResumivel = {
  forma: FormaPagamento;
  /** Valor que quitou a venda (não o valor recebido). */
  valor: number;
  /** Troco devolvido (só faz sentido em DINHEIRO). */
  troco?: number | null;
};

export type TotalPorForma = { quantidade: number; valor: number; troco: number };
export type ResumoPorForma = Record<FormaPagamento, TotalPorForma>;

function resumoPorFormaVazio(): ResumoPorForma {
  const vazio = {} as ResumoPorForma;
  for (const forma of FORMAS_PAGAMENTO) vazio[forma] = { quantidade: 0, valor: 0, troco: 0 };
  return vazio;
}

/** Agrupa pagamentos por forma: quantidade de pagamentos, soma de valor e soma de troco. */
export function agruparPagamentosPorForma(pagamentos: PagamentoResumivel[]): ResumoPorForma {
  const resumo = resumoPorFormaVazio();
  for (const p of pagamentos) {
    const alvo = resumo[p.forma];
    alvo.quantidade += 1;
    alvo.valor += p.valor;
    alvo.troco += p.troco ?? 0;
  }
  return resumo;
}

// ---------------------------------------------------------------- resumo da sessão

export type VendaResumivel = {
  status: StatusVenda;
  total: number;
  pagamentos: PagamentoResumivel[];
};

export type MovimentoResumivel = { tipo: TipoMovimentoCaixa; valor: number };

export type RecebimentoFiadoResumivel = { formaPagamento: FormaPagamento | null; valor: number };

export type DadosSessaoParaResumo = {
  valorAbertura: number;
  /** Todas as vendas da sessão, inclusive canceladas (a função filtra). */
  vendas: VendaResumivel[];
  movimentos: MovimentoResumivel[];
  /** Só as despesas com pagoDoCaixa = true. */
  despesasCaixa: { valor: number }[];
  /** Só lançamentos do tipo PAGAMENTO com sessaoId da sessão. */
  recebimentosFiado: RecebimentoFiadoResumivel[];
};

export type ResumoSessao = {
  valorAbertura: number;
  vendas: { quantidade: number; total: number; canceladas: number };
  /** Só vendas CONCLUIDAS. */
  porForma: ResumoPorForma;
  trocoTotal: number;
  suprimentos: { quantidade: number; total: number };
  sangrias: { quantidade: number; total: number };
  despesasCaixa: { quantidade: number; total: number };
  recebimentosFiado: { quantidade: number; total: number; dinheiro: number };
  dinheiroEsperado: number;
};

/**
 * Monta o resumo completo da sessão a partir dos registros brutos.
 * Vendas CANCELADAS ficam de fora de tudo (só contam em `vendas.canceladas`).
 */
export function montarResumoSessao(d: DadosSessaoParaResumo): ResumoSessao {
  const concluidas = d.vendas.filter((v) => v.status === "CONCLUIDA");
  const canceladas = d.vendas.length - concluidas.length;
  const porForma = agruparPagamentosPorForma(concluidas.flatMap((v) => v.pagamentos));

  const suprimentosLista = d.movimentos.filter((m) => m.tipo === "SUPRIMENTO");
  const sangriasLista = d.movimentos.filter((m) => m.tipo === "SANGRIA");
  const fiadoDinheiro = d.recebimentosFiado.filter((r) => r.formaPagamento === "DINHEIRO");

  const suprimentos = { quantidade: suprimentosLista.length, total: somar(suprimentosLista.map((m) => m.valor)) };
  const sangrias = { quantidade: sangriasLista.length, total: somar(sangriasLista.map((m) => m.valor)) };
  const despesasCaixa = { quantidade: d.despesasCaixa.length, total: somar(d.despesasCaixa.map((x) => x.valor)) };
  const recebimentosFiado = {
    quantidade: d.recebimentosFiado.length,
    total: somar(d.recebimentosFiado.map((r) => r.valor)),
    dinheiro: somar(fiadoDinheiro.map((r) => r.valor)),
  };

  const dinheiroEsperado = calcularEsperado({
    valorAbertura: d.valorAbertura,
    vendasDinheiro: porForma.DINHEIRO.valor,
    suprimentos: suprimentos.total,
    sangrias: sangrias.total,
    despesasCaixa: despesasCaixa.total,
    recebimentosFiadoDinheiro: recebimentosFiado.dinheiro,
  });

  return {
    valorAbertura: d.valorAbertura,
    vendas: { quantidade: concluidas.length, total: somar(concluidas.map((v) => v.total)), canceladas },
    porForma,
    trocoTotal: porForma.DINHEIRO.troco,
    suprimentos,
    sangrias,
    despesasCaixa,
    recebimentosFiado,
    dinheiroEsperado,
  };
}
