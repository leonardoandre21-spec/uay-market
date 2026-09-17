// Cálculos puros do módulo de estoque: rateio de frete, custo médio aplicado
// numa lista de itens, faixas de vencimento, valor do estoque, parcelas de
// boleto e totais de perdas. Nenhuma função aqui acessa o banco.
//
// Convenções (ver docs/CONTRATO-MODULOS.md): dinheiro em centavos inteiros,
// quantidade em milésimos inteiros. Toda divisão arredonda pra inteiro.

import type { MotivoPerda } from "@prisma/client";
import { TZDate } from "@date-fns/tz";
import { MIL, custoMedioPonderado, somar, totalLinha } from "@/lib/dinheiro";
import { FUSO, addMonths, noFuso } from "@/lib/datas";
import { MOTIVOS_PERDA } from "@/lib/rotulos";

// ---------------------------------------------------------------- frete

/**
 * Rateia o frete (centavos) proporcionalmente ao valor de cada item (centavos).
 * Garante que a soma dos rateios seja exatamente igual ao frete, distribuindo
 * os centavos que sobram do arredondamento pelos itens de maior resto
 * (método do maior resto). Se todos os valores forem zero, divide por igual.
 */
export function ratearFrete(valoresItens: number[], frete: number): number[] {
  const n = valoresItens.length;
  if (n === 0) return [];
  if (frete <= 0) return valoresItens.map(() => 0);

  const totalItens = somar(valoresItens.map((v) => Math.max(0, v)));
  const pesos = totalItens > 0 ? valoresItens.map((v) => Math.max(0, v)) : valoresItens.map(() => 1);
  const somaPesos = somar(pesos);

  const brutos = pesos.map((p) => (p * frete) / somaPesos);
  const rateios = brutos.map((b) => Math.floor(b));
  let sobra = frete - somar(rateios);

  // Ordena índices pelo resto fracionário (maior primeiro); empate pelo índice menor.
  const ordem = brutos
    .map((b, i) => ({ i, resto: b - Math.floor(b) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i)
    .map((x) => x.i);

  let k = 0;
  while (sobra > 0) {
    rateios[ordem[k % n]] += 1;
    sobra -= 1;
    k += 1;
  }
  return rateios;
}

/**
 * Custo unitário efetivo de um item depois de embutir o frete rateado.
 * frete rateado (centavos) / quantidade (milésimos) → centavos por unidade.
 */
export function custoUnitarioComFrete(quantidade: number, custoUnitario: number, freteRateado: number): number {
  if (quantidade <= 0) return custoUnitario;
  if (freteRateado <= 0) return custoUnitario;
  return custoUnitario + Math.round((freteRateado * MIL) / quantidade);
}

export type ItemCompra = {
  produtoId: number;
  quantidade: number; // milésimos
  custoUnitario: number; // centavos, sem frete
};

export type ItemCompraPreparado<T extends ItemCompra = ItemCompra> = T & {
  valorItem: number; // centavos = quantidade × custoUnitario / 1000
  freteRateado: number; // centavos
  custoEfetivo: number; // centavos por unidade, já com frete
};

/** Calcula valor de cada linha, rateia o frete e devolve o custo efetivo de cada item. */
export function prepararItensEntrada<T extends ItemCompra>(itens: T[], frete: number): ItemCompraPreparado<T>[] {
  const valores = itens.map((i) => totalLinha(i.quantidade, i.custoUnitario));
  const rateios = ratearFrete(valores, frete);
  return itens.map((item, i) => ({
    ...item,
    valorItem: valores[i],
    freteRateado: rateios[i],
    custoEfetivo: custoUnitarioComFrete(item.quantidade, item.custoUnitario, rateios[i]),
  }));
}

/** Soma dos itens (sem frete). */
export function subtotalItens(itens: Array<{ quantidade: number; custoUnitario: number }>): number {
  return somar(itens.map((i) => totalLinha(i.quantidade, i.custoUnitario)));
}

/** Total da nota = itens + frete. */
export function totalDaNota(itens: Array<{ quantidade: number; custoUnitario: number }>, frete: number): number {
  return subtotalItens(itens) + Math.max(0, frete);
}

// ---------------------------------------------------------------- custo médio

export type EstadoProduto = { estoque: number; precoCusto: number };

export type ResultadoCustoMedio = {
  indice: number;
  produtoId: number;
  quantidade: number;
  custoEfetivo: number;
  estoqueAnterior: number;
  estoqueApos: number;
  custoAnterior: number;
  custoNovo: number;
  custoMudou: boolean;
};

/**
 * Aplica o custo médio ponderado item a item, na ordem da lista. Se o mesmo
 * produto aparecer em mais de uma linha, a segunda linha já parte do estoque e
 * do custo atualizados pela primeira. Não altera o mapa recebido.
 */
export function aplicarCustoMedio(
  itens: Array<{ produtoId: number; quantidade: number; custoEfetivo: number }>,
  produtos: ReadonlyMap<number, EstadoProduto>,
): ResultadoCustoMedio[] {
  const estado = new Map<number, EstadoProduto>();
  for (const [id, p] of produtos) estado.set(id, { estoque: p.estoque, precoCusto: p.precoCusto });

  return itens.map((item, indice) => {
    const atual = estado.get(item.produtoId);
    if (!atual) throw new Error(`Produto ${item.produtoId} não está na lista de estados.`);
    const custoNovo = custoMedioPonderado(atual.estoque, atual.precoCusto, item.quantidade, item.custoEfetivo);
    const estoqueApos = atual.estoque + item.quantidade;
    const resultado: ResultadoCustoMedio = {
      indice,
      produtoId: item.produtoId,
      quantidade: item.quantidade,
      custoEfetivo: item.custoEfetivo,
      estoqueAnterior: atual.estoque,
      estoqueApos,
      custoAnterior: atual.precoCusto,
      custoNovo,
      custoMudou: custoNovo !== atual.precoCusto,
    };
    estado.set(item.produtoId, { estoque: estoqueApos, precoCusto: custoNovo });
    return resultado;
  });
}

/** Linha de entrada como ficou no MovimentoEstoque ENTRADA: quantidade, custo efetivo (com frete) e saldo depois dela. */
export type LinhaEntradaCusto = { quantidade: number; custoEfetivo: number; estoqueApos: number };

export type ResultadoReversaoCusto = {
  /** Custo médio que o produto deve ter depois do estorno. */
  custoNovo: number;
  /** Custo médio que o produto tinha antes da entrada estornada (melhor estimativa). */
  custoAntesDaEntrada: number;
  /** Custo unitário médio das linhas estornadas (pra registrar no movimento de estorno). */
  custoEfetivoMedio: number;
  /** true quando o custo foi de fato recalculado; false quando foi mantido por segurança. */
  revertido: boolean;
  custoMudou: boolean;
};

/**
 * Desfaz o efeito de uma entrada no custo médio ponderado do produto.
 *
 * O custo antes da entrada vem do primeiro `HistoricoPreco` do produto criado
 * a partir dela (`precoCustoAnterior`); se não houve registro, a entrada não
 * mudou o custo. Entradas posteriores (ainda ativas) são reaplicadas por cima
 * como se a entrada estornada nunca tivesse existido: o estoque antes de cada
 * uma fica menor pela quantidade estornada. Vendas e perdas não mexem no custo
 * médio, então não entram na conta.
 *
 * Segurança: antes de mexer, reproduz o caminho real (entrada + posteriores)
 * e confere se chega no custo atual. Se não chegar, alguém editou o custo à
 * mão depois da entrada; nesse caso o custo é mantido e `revertido` vem false.
 */
export function reverterCustoMedio(params: {
  custoAtual: number;
  /** Movimentos ENTRADA desta entrada pro produto, na ordem em que foram gravados. */
  linhas: LinhaEntradaCusto[];
  /** HistoricoPreco do produto criados a partir desta entrada, em ordem cronológica. */
  historico: Array<{ precoCustoAnterior: number; precoCustoNovo: number }>;
  /** Movimentos ENTRADA de outras entradas do produto, depois desta, em ordem. `ativa` = entrada não estornada. */
  entradasPosteriores: Array<LinhaEntradaCusto & { ativa: boolean }>;
}): ResultadoReversaoCusto {
  const { custoAtual, linhas, historico, entradasPosteriores } = params;
  const manter = (custoAntes: number, custoEfetivoMedio: number): ResultadoReversaoCusto => ({
    custoNovo: custoAtual,
    custoAntesDaEntrada: custoAntes,
    custoEfetivoMedio,
    revertido: false,
    custoMudou: false,
  });
  if (linhas.length === 0) return manter(custoAtual, custoAtual);

  const quantidade = somar(linhas.map((l) => l.quantidade));
  const custoEfetivoMedio = quantidade > 0 ? Math.round(somar(linhas.map((l) => l.quantidade * l.custoEfetivo)) / quantidade) : custoAtual;
  const custoAntes = historico[0]?.precoCustoAnterior ?? custoAtual;
  const posteriores = entradasPosteriores.filter((e) => e.ativa);

  // Caminho real: entrada estornada + entradas posteriores. Tem que bater com o custo atual.
  let custoEsperado = custoAntes;
  let estoque = linhas[0].estoqueApos - linhas[0].quantidade;
  for (const linha of linhas) {
    custoEsperado = custoMedioPonderado(estoque, custoEsperado, linha.quantidade, linha.custoEfetivo);
    estoque = linha.estoqueApos;
  }
  for (const e of posteriores) {
    custoEsperado = custoMedioPonderado(e.estoqueApos - e.quantidade, custoEsperado, e.quantidade, e.custoEfetivo);
  }
  if (custoEsperado !== custoAtual) return manter(custoAntes, custoEfetivoMedio);

  // Caminho sem a entrada: só as posteriores, com o estoque menor pela quantidade estornada.
  let custoNovo = custoAntes;
  for (const e of posteriores) {
    custoNovo = custoMedioPonderado(e.estoqueApos - e.quantidade - quantidade, custoNovo, e.quantidade, e.custoEfetivo);
  }
  custoNovo = Math.max(0, custoNovo);
  return {
    custoNovo,
    custoAntesDaEntrada: custoAntes,
    custoEfetivoMedio,
    revertido: true,
    custoMudou: custoNovo !== custoAtual,
  };
}

// ---------------------------------------------------------------- ajuste

export type PedidoAjuste = { novaQuantidade: number } | { diferenca: number };

/** Dado o estoque atual e o que o operador informou, devolve a diferença e o saldo final. */
export function calcularAjuste(estoqueAtual: number, pedido: PedidoAjuste): { diferenca: number; estoqueApos: number } {
  if ("novaQuantidade" in pedido) {
    return { diferenca: pedido.novaQuantidade - estoqueAtual, estoqueApos: pedido.novaQuantidade };
  }
  return { diferenca: pedido.diferenca, estoqueApos: estoqueAtual + pedido.diferenca };
}

/**
 * Produto vendido por unidade só aceita quantidade inteira (múltiplo de 1000
 * milésimos); por quilo aceita fração. Mesma regra do cadastro e do PDV.
 */
export function quantidadeCompativelComUnidade(quantidade: number, unidade: "UN" | "KG"): boolean {
  if (!Number.isInteger(quantidade)) return false;
  return unidade !== "UN" || Math.abs(quantidade) % MIL === 0;
}

/**
 * Quanto tirar de cada lote quando um ajuste reduz o estoque, do que vence
 * primeiro pro que vence depois (a lista já vem nessa ordem). Tira a diferença
 * do ajuste e, se mesmo assim os lotes somarem mais que o saldo final, tira o
 * excedente também, pra tela de vencimentos não mostrar quantidade que não
 * existe na prateleira. Nenhum lote fica negativo. Ajuste positivo não cria
 * nem mexe em lote (não há validade conhecida).
 */
export function distribuirBaixaAjuste(
  lotes: Array<{ id: number; quantidade: number }>,
  diferenca: number,
  estoqueApos: number,
): Array<{ loteId: number; quantidade: number }> {
  if (diferenca >= 0) return [];
  const totalLotes = somar(lotes.map((l) => Math.max(0, l.quantidade)));
  if (totalLotes <= 0) return [];
  const excedente = totalLotes - Math.max(0, estoqueApos);
  let restante = Math.min(totalLotes, Math.max(-diferenca, excedente));
  const baixas: Array<{ loteId: number; quantidade: number }> = [];
  for (const lote of lotes) {
    if (restante <= 0) break;
    if (lote.quantidade <= 0) continue;
    const baixa = Math.min(lote.quantidade, restante);
    baixas.push({ loteId: lote.id, quantidade: baixa });
    restante -= baixa;
  }
  return baixas;
}

// ---------------------------------------------------------------- vencimento

export type FaixaVencimento = "VENCIDO" | "ATE_7_DIAS" | "DE_8_A_30_DIAS" | "MAIS_DE_30_DIAS";

export const FAIXAS_VENCIMENTO: FaixaVencimento[] = ["VENCIDO", "ATE_7_DIAS", "DE_8_A_30_DIAS", "MAIS_DE_30_DIAS"];

export const ROTULO_FAIXA_VENCIMENTO: Record<FaixaVencimento, string> = {
  VENCIDO: "Vencidos",
  ATE_7_DIAS: "Vence em até 7 dias",
  DE_8_A_30_DIAS: "Vence em 8 a 30 dias",
  MAIS_DE_30_DIAS: "Vence em mais de 30 dias",
};

/** Classifica pelo número de dias corridos até a validade (negativo = já venceu). */
export function classificarFaixaVencimento(diasRestantes: number): FaixaVencimento {
  if (diasRestantes < 0) return "VENCIDO";
  if (diasRestantes <= 7) return "ATE_7_DIAS";
  if (diasRestantes <= 30) return "DE_8_A_30_DIAS";
  return "MAIS_DE_30_DIAS";
}

export type ResumoFaixa = { lotes: number; quantidade: number; valorCusto: number };

/** Conta lotes, quantidade e valor a custo por faixa de vencimento. */
export function resumirLotesPorFaixa(
  lotes: Array<{ diasRestantes: number; quantidade: number; custoUnitario: number }>,
): Record<FaixaVencimento, ResumoFaixa> {
  const resumo = {} as Record<FaixaVencimento, ResumoFaixa>;
  for (const f of FAIXAS_VENCIMENTO) resumo[f] = { lotes: 0, quantidade: 0, valorCusto: 0 };
  for (const lote of lotes) {
    if (lote.quantidade <= 0) continue;
    const faixa = classificarFaixaVencimento(lote.diasRestantes);
    resumo[faixa].lotes += 1;
    resumo[faixa].quantidade += lote.quantidade;
    resumo[faixa].valorCusto += totalLinha(lote.quantidade, lote.custoUnitario);
  }
  return resumo;
}

// ---------------------------------------------------------------- valor do estoque

/**
 * Valor de um produto em estoque. Estoque negativo não tem valor físico,
 * então conta como zero em vez de abater do total.
 */
export function valorEmEstoque(estoque: number, preco: number): number {
  return totalLinha(Math.max(0, estoque), preco);
}

/** Valor total do estoque a custo e a preço de venda (só produtos com estoque positivo). */
export function valorDoEstoque(
  produtos: Array<{ estoque: number; precoCusto: number; precoVenda: number }>,
): { custo: number; venda: number } {
  let custo = 0;
  let venda = 0;
  for (const p of produtos) {
    custo += valorEmEstoque(p.estoque, p.precoCusto);
    venda += valorEmEstoque(p.estoque, p.precoVenda);
  }
  return { custo, venda };
}

export type SituacaoEstoque = "NEGATIVO" | "ZERADO" | "ABAIXO_MINIMO" | "OK";

/** Situação do produto em relação ao mínimo. */
export function situacaoEstoque(estoque: number, estoqueMinimo: number): SituacaoEstoque {
  if (estoque < 0) return "NEGATIVO";
  if (estoque === 0) return "ZERADO";
  if (estoqueMinimo > 0 && estoque < estoqueMinimo) return "ABAIXO_MINIMO";
  return "OK";
}

// ---------------------------------------------------------------- boleto

export type Parcela = { parcelaAtual: number; totalParcelas: number; valor: number; vencimento: Date };

/**
 * Divide um total em parcelas mensais iguais. Os centavos que sobram da divisão
 * vão pras primeiras parcelas, um centavo em cada, pra soma bater com o total.
 * O vencimento da parcela N é o primeiro vencimento + (N-1) meses, no fuso do mercado.
 */
export function calcularParcelas(total: number, numeroParcelas: number, primeiroVencimento: Date): Parcela[] {
  const n = Math.max(1, Math.floor(numeroParcelas));
  const base = Math.floor(total / n);
  const sobra = total - base * n;
  const parcelas: Parcela[] = [];
  for (let i = 0; i < n; i++) {
    parcelas.push({
      parcelaAtual: i + 1,
      totalParcelas: n,
      valor: base + (i < sobra ? 1 : 0),
      vencimento: new Date(addMonths(noFuso(primeiroVencimento), i).getTime()),
    });
  }
  return parcelas;
}

// ---------------------------------------------------------------- perdas

export type TotalMotivo = { registros: number; quantidade: number; valor: number };

/** Totaliza perdas por motivo (todos os motivos aparecem, mesmo zerados). */
export function totalizarPerdasPorMotivo(
  perdas: Array<{ motivo: MotivoPerda; quantidade: number; valorTotal: number }>,
): Record<MotivoPerda, TotalMotivo> {
  const totais = {} as Record<MotivoPerda, TotalMotivo>;
  for (const m of MOTIVOS_PERDA) totais[m] = { registros: 0, quantidade: 0, valor: 0 };
  for (const p of perdas) {
    totais[p.motivo].registros += 1;
    totais[p.motivo].quantidade += p.quantidade;
    totais[p.motivo].valor += p.valorTotal;
  }
  return totais;
}

// ---------------------------------------------------------------- estorno de entrada

/**
 * Prefixo antigo gravado na observação antes de existirem os campos
 * `EntradaEstoque.estornadaEm` / `estornadaPorId`. Fica só pra reconhecer e
 * migrar registros antigos; nada novo é gravado com ele.
 * @deprecated Use `EntradaEstoque.estornadaEm`.
 */
export const MARCADOR_ESTORNO_ENTRADA = "[ESTORNADA";

/**
 * Diz se uma entrada foi estornada. A forma atual recebe o objeto com o campo
 * `estornadaEm` (Date do banco ou ISO string vinda de Client Component).
 * Quem soma compras deve ignorar entradas em que isso é true; em consultas
 * Prisma, prefira filtrar `where: { estornadaEm: null }` direto no banco.
 */
export function entradaEstornada(entrada: { estornadaEm: Date | string | null | undefined }): boolean;
/** @deprecated Passe o objeto `{ estornadaEm }`. Só reconhece o marcador antigo na observação. */
export function entradaEstornada(observacao: string | null | undefined): boolean;
export function entradaEstornada(
  valor: { estornadaEm: Date | string | null | undefined } | string | null | undefined,
): boolean {
  if (valor && typeof valor === "object") return valor.estornadaEm != null;
  return typeof valor === "string" && valor.trimStart().startsWith(MARCADOR_ESTORNO_ENTRADA);
}

/**
 * Lê o marcador antigo "[ESTORNADA em dd/MM/yyyy HH:mm por Fulano] resto da
 * observação" e devolve os pedaços: quando (Date no fuso da loja, ou null se a
 * data não veio ou não deu pra ler), quem estornou e a observação limpa.
 * Devolve null quando a observação não tem o marcador. Usado só na migração.
 * @deprecated Só pra migrar registros antigos pra `estornadaEm` / `estornadaPorId`.
 */
export function lerMarcadorEstornoAntigo(
  observacao: string | null | undefined,
): { quando: Date | null; porQuem: string | null; observacaoLimpa: string | null } | null {
  if (typeof observacao !== "string") return null;
  const m = /^\s*\[ESTORNADA(?:\s+em\s+(.+?))?(?:\s+por\s+(.+?))?\]\s*([\s\S]*)$/.exec(observacao);
  if (!m) return null;
  const data = m[1] ? /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(m[1].trim()) : null;
  const quando = data
    ? new TZDate(Number(data[3]), Number(data[2]) - 1, Number(data[1]), Number(data[4] ?? 0), Number(data[5] ?? 0), FUSO)
    : null;
  const porQuem = m[2]?.trim() || null;
  const observacaoLimpa = m[3].trim() || null;
  return { quando: quando && !Number.isNaN(quando.getTime()) ? quando : null, porQuem, observacaoLimpa };
}

export type MotivoBloqueioEstorno =
  | { tipo: "JA_ESTORNADA" }
  | { tipo: "LOTE_CONSUMIDO"; produtoId: number }
  | { tipo: "ESTOQUE_INSUFICIENTE"; produtoId: number; estoqueAtual: number; necessario: number }
  | { tipo: "BOLETO_PAGO"; contaId: number };

/**
 * Verifica se uma entrada pode ser estornada:
 * - ainda não foi estornada;
 * - nenhum lote criado por ela foi consumido (quantidade restante dos lotes do
 *   produto = quantidade que entrou, e nenhum item de venda ou perda aponta pro lote).
 *   A checagem vale pra todo produto que ganhou lote nesta entrada, mesmo que
 *   o produto tenha deixado de controlar validade depois; produto sem lote
 *   nesta entrada não é bloqueado por lote, ainda que controle validade hoje;
 * - o estoque atual de cada produto cobre a quantidade que entrou;
 * - nenhum boleto vinculado já foi pago.
 * Devolve a lista de bloqueios (vazia = pode estornar).
 */
export function verificarEstornoEntrada(entrada: {
  estornadaEm: Date | string | null;
  itens: Array<{ produtoId: number; quantidade: number; estoqueAtual: number }>;
  lotes: Array<{ produtoId: number; quantidade: number; consumos: number }>;
  contas: Array<{ id: number; status: "PENDENTE" | "PAGA" | "CANCELADA" }>;
}): MotivoBloqueioEstorno[] {
  const bloqueios: MotivoBloqueioEstorno[] = [];
  if (entradaEstornada(entrada)) {
    bloqueios.push({ tipo: "JA_ESTORNADA" });
    return bloqueios;
  }

  const porProduto = new Map<number, { quantidade: number; estoqueAtual: number }>();
  for (const item of entrada.itens) {
    const atual = porProduto.get(item.produtoId);
    if (atual) atual.quantidade += item.quantidade;
    else porProduto.set(item.produtoId, { quantidade: item.quantidade, estoqueAtual: item.estoqueAtual });
  }

  const lotesPorProduto = new Map<number, { quantidade: number; consumos: number }>();
  for (const lote of entrada.lotes) {
    const atual = lotesPorProduto.get(lote.produtoId);
    if (atual) {
      atual.quantidade += lote.quantidade;
      atual.consumos += lote.consumos;
    } else lotesPorProduto.set(lote.produtoId, { quantidade: lote.quantidade, consumos: lote.consumos });
  }

  for (const [produtoId, item] of porProduto) {
    const lotes = lotesPorProduto.get(produtoId);
    if (lotes && (lotes.consumos > 0 || lotes.quantidade !== item.quantidade)) {
      bloqueios.push({ tipo: "LOTE_CONSUMIDO", produtoId });
    }
    if (item.estoqueAtual < item.quantidade) {
      bloqueios.push({
        tipo: "ESTOQUE_INSUFICIENTE",
        produtoId,
        estoqueAtual: item.estoqueAtual,
        necessario: item.quantidade,
      });
    }
  }

  for (const conta of entrada.contas) {
    if (conta.status === "PAGA") bloqueios.push({ tipo: "BOLETO_PAGO", contaId: conta.id });
  }

  return bloqueios;
}
