// Cálculos puros do PDV e das vendas. Sem banco, sem React: só aritmética
// em centavos (dinheiro), milésimos (quantidade) e pontos-base (percentual).
// Tudo aqui é coberto por tests/vendas.test.ts.

import type { FormaPagamento, Papel } from "@prisma/client";
import { aplicarPercentual, calcularTaxa, MIL, totalLinha } from "@/lib/dinheiro";

// ---------------------------------------------------------------- carrinho

export type ItemCalculo = {
  /** milésimos */
  quantidade: number;
  /** centavos, preço praticado (já com promoção) */
  precoUnitario: number;
  /** centavos, desconto dado neste item */
  desconto: number;
};

export type TotaisCarrinho = {
  /** soma de quantidade × preço de todos os itens, antes de qualquer desconto */
  bruto: number;
  /** soma dos descontos por item */
  descontoItens: number;
  /** bruto − descontoItens (é o Venda.subtotal do schema) */
  subtotal: number;
  /** desconto geral efetivamente aplicado (nunca maior que o subtotal) */
  descontoGeral: number;
  /** descontoItens + descontoGeral */
  descontoTotal: number;
  /** subtotal − descontoGeral */
  total: number;
};

/** Valor bruto de uma linha (quantidade × preço), arredondado pra centavo. */
export function brutoItem(item: Pick<ItemCalculo, "quantidade" | "precoUnitario">): number {
  return totalLinha(item.quantidade, item.precoUnitario);
}

/** Total de uma linha já com o desconto do item. Nunca negativo. */
export function totalItem(item: ItemCalculo): number {
  return Math.max(0, brutoItem(item) - Math.max(0, item.desconto));
}

/**
 * Totais do carrinho. O desconto geral vem em centavos (use
 * descontoGeralEmCentavos pra converter percentual) e é limitado ao subtotal.
 */
export function calcularTotais(itens: ItemCalculo[], descontoGeralCentavos = 0): TotaisCarrinho {
  let bruto = 0;
  let descontoItens = 0;
  for (const item of itens) {
    const b = brutoItem(item);
    const d = Math.min(Math.max(0, item.desconto), b);
    bruto += b;
    descontoItens += d;
  }
  const subtotal = bruto - descontoItens;
  const descontoGeral = Math.min(Math.max(0, Math.round(descontoGeralCentavos)), subtotal);
  return {
    bruto,
    descontoItens,
    subtotal,
    descontoGeral,
    descontoTotal: descontoItens + descontoGeral,
    total: subtotal - descontoGeral,
  };
}

export type ModoDesconto = "VALOR" | "PERCENTUAL";

/**
 * Converte o desconto geral digitado pra centavos.
 * VALOR: já está em centavos. PERCENTUAL: valor em pontos-base sobre o subtotal.
 * Resultado limitado a [0, subtotal].
 */
export function descontoGeralEmCentavos(subtotal: number, modo: ModoDesconto, valor: number): number {
  if (subtotal <= 0 || valor <= 0) return 0;
  const centavos = modo === "PERCENTUAL" ? aplicarPercentual(subtotal, valor) : Math.round(valor);
  return Math.min(Math.max(0, centavos), subtotal);
}

/**
 * Teto de desconto em pontos-base pra um papel.
 * ADMIN: sem teto (null). OPERADOR: descontoMaximoPercentual se permitido, senão 0.
 */
export function tetoDescontoParaPapel(
  papel: Papel,
  config: { permitirDescontoOperador: boolean; descontoMaximoPercentual: number },
): number | null {
  if (papel === "ADMIN") return null;
  return config.permitirDescontoOperador ? Math.max(0, config.descontoMaximoPercentual) : 0;
}

/** Máximo de desconto em centavos sobre o bruto dado o teto em bp (null = sem limite). */
export function limiteDesconto(bruto: number, tetoBp: number | null): number | null {
  if (tetoBp === null) return null;
  return aplicarPercentual(Math.max(0, bruto), tetoBp);
}

export type ValidacaoDesconto = { ok: true } | { ok: false; maximo: number; mensagem: string };

/**
 * Confere se o desconto total (itens + geral) respeita o teto do papel.
 * O teto é aplicado sobre o bruto do carrinho.
 */
export function validarDescontoMaximo(bruto: number, descontoTotal: number, tetoBp: number | null): ValidacaoDesconto {
  const maximo = limiteDesconto(bruto, tetoBp);
  if (maximo === null || descontoTotal <= maximo) return { ok: true };
  const percentual = tetoBp === 0 ? "" : ` (${(tetoBp! / 100).toFixed(2).replace(".", ",")}% do total)`;
  return {
    ok: false,
    maximo,
    mensagem:
      maximo === 0
        ? "Você não tem permissão pra dar desconto. Peça a um administrador."
        : `Desconto acima do permitido pro seu perfil: o máximo é R$ ${(maximo / 100).toFixed(2).replace(".", ",")}${percentual}.`,
  };
}

// ---------------------------------------------------------------- troco

/** Troco de um pagamento em dinheiro. Nunca negativo. */
export function calcularTroco(valor: number, valorRecebido: number): number {
  return Math.max(0, valorRecebido - valor);
}

// ---------------------------------------------------------------- pagamentos

export type PagamentoCalculo = {
  forma: FormaPagamento;
  /** centavos que quitam a venda */
  valor: number;
  /** centavos entregues pelo cliente (só DINHEIRO). null = valor exato */
  valorRecebido?: number | null;
  parcelas?: number;
};

export type ValidacaoPagamentos =
  | { ok: true; soma: number; troco: number }
  | { ok: false; soma: number; troco: number; mensagem: string };

/**
 * A soma dos pagamentos precisa bater exatamente com o total da venda.
 * Em DINHEIRO, o valor recebido não pode ser menor que o valor do pagamento;
 * a diferença é troco. Outras formas não têm troco.
 */
export function validarPagamentos(total: number, pagamentos: PagamentoCalculo[]): ValidacaoPagamentos {
  let soma = 0;
  let troco = 0;
  if (total > 0 && pagamentos.length === 0) {
    return { ok: false, soma, troco, mensagem: "Informe pelo menos uma forma de pagamento." };
  }
  for (const p of pagamentos) {
    if (!Number.isInteger(p.valor) || p.valor <= 0) {
      return { ok: false, soma, troco, mensagem: "Cada pagamento precisa ter valor maior que zero." };
    }
    soma += p.valor;
    if (p.forma === "DINHEIRO") {
      const recebido = p.valorRecebido ?? p.valor;
      if (!Number.isInteger(recebido) || recebido < p.valor) {
        return {
          ok: false,
          soma,
          troco,
          mensagem: "O valor recebido em dinheiro é menor que o valor do pagamento.",
        };
      }
      troco += calcularTroco(p.valor, recebido);
    } else if (p.valorRecebido != null && p.valorRecebido !== p.valor) {
      return { ok: false, soma, troco, mensagem: "Só pagamento em dinheiro pode ter troco." };
    }
    if (p.forma !== "CREDITO" && (p.parcelas ?? 1) !== 1) {
      return { ok: false, soma, troco, mensagem: "Só cartão de crédito pode ser parcelado." };
    }
    if ((p.parcelas ?? 1) < 1) {
      return { ok: false, soma, troco, mensagem: "Número de parcelas inválido." };
    }
  }
  if (soma !== total) {
    const falta = total - soma;
    return {
      ok: false,
      soma,
      troco,
      mensagem:
        falta > 0
          ? `Ainda faltam R$ ${(falta / 100).toFixed(2).replace(".", ",")} pra cobrir o total.`
          : `Os pagamentos passam do total em R$ ${(-falta / 100).toFixed(2).replace(".", ",")}. Ajuste os valores.`,
    };
  }
  return { ok: true, soma, troco };
}

/** Quanto ainda falta pagar (nunca negativo). */
export function restantePagar(total: number, pagamentos: Pick<PagamentoCalculo, "valor">[]): number {
  const soma = pagamentos.reduce((acc, p) => acc + p.valor, 0);
  return Math.max(0, total - soma);
}

export type ConfigTaxa = { forma: FormaPagamento; taxaPercentual: number; taxaFixa: number };

export type TaxaPagamento = {
  forma: FormaPagamento;
  valor: number;
  taxaPercentual: number;
  taxaFixa: number;
  taxaValor: number;
};

// ---------------------------------------------------------------- maquininhas

/** Adquirentes sugeridas no cadastro de maquininha. O campo aceita texto livre ("Outra"). */
export const ADQUIRENTES_SUGERIDAS = [
  "InfinitePay",
  "Sipag",
  "Stone",
  "Cielo",
  "Rede",
  "PagSeguro",
  "Mercado Pago",
  "Getnet",
  "Outra",
] as const;

/** Diz se a maquininha é uma Mercado Pago Point (a única com integração pelo PDV). */
export function ehMercadoPago(adquirente: string | null | undefined): boolean {
  return (adquirente ?? "").trim().toLowerCase().replace(/\s+/g, "") === "mercadopago";
}

/** Taxas (pontos-base) de uma maquininha, como estão em Maquininha no schema. */
export type TaxasMaquininha = {
  taxaDebito: number;
  taxaCredito: number;
  taxaCreditoParcelado: number;
  taxaPix: number;
};

/**
 * Taxa que a maquininha cobra num pagamento: DEBITO usa taxaDebito, CREDITO
 * à vista usa taxaCredito, CREDITO em 2x ou mais usa taxaCreditoParcelado,
 * PIX usa taxaPix. DINHEIRO e FIADO não passam na maquininha (zero).
 * Maquininhas não têm taxa fixa por transação: taxaFixa é sempre 0.
 */
export function taxaDaMaquininha(
  maquininha: TaxasMaquininha,
  forma: FormaPagamento,
  parcelas = 1,
): { taxaPercentual: number; taxaFixa: number } {
  let taxaPercentual = 0;
  if (forma === "DEBITO") taxaPercentual = maquininha.taxaDebito;
  else if (forma === "CREDITO") taxaPercentual = parcelas >= 2 ? maquininha.taxaCreditoParcelado : maquininha.taxaCredito;
  else if (forma === "PIX") taxaPercentual = maquininha.taxaPix;
  return { taxaPercentual: Math.max(0, taxaPercentual), taxaFixa: 0 };
}

export type PagamentoParaTaxa = Pick<PagamentoCalculo, "forma" | "valor" | "parcelas"> & {
  /** maquininha em que passou (DEBITO/CREDITO/PIX). null = usa ConfiguracaoPagamento */
  maquininhaId?: number | null;
};

/**
 * Snapshot das taxas por pagamento. Se o pagamento informa uma maquininha
 * conhecida, a taxa vem dela (taxaDaMaquininha); senão, da configuração da
 * forma de pagamento, como sempre foi.
 */
export function calcularTaxasPagamentos(
  pagamentos: PagamentoParaTaxa[],
  configs: ConfigTaxa[],
  maquininhas: ReadonlyMap<number, TaxasMaquininha> = new Map(),
): { taxas: TaxaPagamento[]; total: number } {
  const taxas = pagamentos.map((p) => {
    const maquininha = p.maquininhaId != null ? maquininhas.get(p.maquininhaId) : undefined;
    let taxaPercentual: number;
    let taxaFixa: number;
    if (maquininha) {
      ({ taxaPercentual, taxaFixa } = taxaDaMaquininha(maquininha, p.forma, p.parcelas ?? 1));
    } else {
      const cfg = configs.find((c) => c.forma === p.forma);
      taxaPercentual = cfg?.taxaPercentual ?? 0;
      taxaFixa = cfg?.taxaFixa ?? 0;
    }
    return {
      forma: p.forma,
      valor: p.valor,
      taxaPercentual,
      taxaFixa,
      taxaValor: calcularTaxa(p.valor, taxaPercentual, taxaFixa),
    };
  });
  return { taxas, total: taxas.reduce((acc, t) => acc + t.taxaValor, 0) };
}

// ---------------------------------------------------------------- FEFO

export type LoteFefo = { id: number; quantidade: number };

export type DistribuicaoFefo = {
  /** quanto sai de cada lote, na ordem recebida (vence primeiro, sai primeiro) */
  porLote: { loteId: number; quantidade: number }[];
  /** o que os lotes não cobriram: baixa só do estoque do produto */
  semLote: number;
};

/**
 * Distribui a quantidade vendida pelos lotes, na ordem em que vieram
 * (o chamador ordena por validade crescente). Lotes zerados são ignorados e
 * a quantidade de um lote nunca fica negativa.
 */
export function distribuirFefo(lotes: LoteFefo[], quantidade: number): DistribuicaoFefo {
  const porLote: DistribuicaoFefo["porLote"] = [];
  let restante = Math.max(0, quantidade);
  for (const lote of lotes) {
    if (restante <= 0) break;
    if (lote.quantidade <= 0) continue;
    const baixa = Math.min(lote.quantidade, restante);
    porLote.push({ loteId: lote.id, quantidade: baixa });
    restante -= baixa;
  }
  return { porLote, semLote: restante };
}

/**
 * Divide um desconto (centavos) proporcionalmente entre partes (milésimos),
 * jogando a diferença de arredondamento na última parte pra soma fechar.
 */
export function dividirDesconto(desconto: number, quantidades: number[]): number[] {
  const totalQtd = quantidades.reduce((a, q) => a + q, 0);
  if (quantidades.length === 0) return [];
  if (desconto <= 0 || totalQtd <= 0) return quantidades.map(() => 0);
  const partes = quantidades.map((q) => Math.floor((desconto * q) / totalQtd));
  const soma = partes.reduce((a, p) => a + p, 0);
  partes[partes.length - 1] += desconto - soma;
  return partes;
}

export type ParteItem = {
  loteId: number | null;
  quantidade: number;
  desconto: number;
  total: number;
};

/**
 * Quebra uma linha do carrinho em partes por lote (FEFO), mantendo o total
 * da linha exatamente igual ao calculado com a quantidade inteira. Os totais
 * das partes são quantidade × preço − desconto proporcional, e a última parte
 * absorve qualquer diferença de arredondamento (no máximo 1 centavo).
 */
export function dividirItemPorLotes(
  item: ItemCalculo,
  distribuicao: DistribuicaoFefo,
): { partes: ParteItem[]; total: number } {
  const total = totalItem(item);
  const quantidades = distribuicao.porLote.map((p) => p.quantidade);
  const loteIds: (number | null)[] = distribuicao.porLote.map((p) => p.loteId);
  if (distribuicao.semLote > 0) {
    quantidades.push(distribuicao.semLote);
    loteIds.push(null);
  }
  if (quantidades.length === 0) {
    return { partes: [{ loteId: null, quantidade: item.quantidade, desconto: item.desconto, total }], total };
  }
  const descontos = dividirDesconto(Math.min(item.desconto, brutoItem(item)), quantidades);
  const partes: ParteItem[] = quantidades.map((q, i) => ({
    loteId: loteIds[i],
    quantidade: q,
    desconto: descontos[i],
    total: Math.max(0, totalLinha(q, item.precoUnitario) - descontos[i]),
  }));
  const somaPartes = partes.reduce((a, p) => a + p.total, 0);
  partes[partes.length - 1].total += total - somaPartes;
  return { partes, total };
}

// ---------------------------------------------------------------- custo

/** CMV de uma linha: quantidade × custo unitário (snapshot). */
export function custoItem(quantidade: number, custoUnitario: number): number {
  return totalLinha(quantidade, custoUnitario);
}

// ---------------------------------------------------------------- cancelamento

export const MINUTOS_CANCELAMENTO_OPERADOR = 30;

/**
 * ADMIN cancela qualquer venda concluída. OPERADOR só cancela venda da sessão
 * de caixa aberta agora e com menos de 30 minutos.
 */
export function podeCancelarVenda(
  venda: { status: "CONCLUIDA" | "CANCELADA"; sessaoId: number | null; criadoEm: Date },
  usuario: { papel: Papel },
  sessaoAbertaId: number | null,
  agora: Date,
): { ok: true } | { ok: false; motivo: string } {
  if (venda.status !== "CONCLUIDA") return { ok: false, motivo: "Esta venda já está cancelada." };
  if (usuario.papel === "ADMIN") return { ok: true };
  if (sessaoAbertaId === null || venda.sessaoId !== sessaoAbertaId) {
    return { ok: false, motivo: "Só o administrador pode cancelar vendas de outro caixa." };
  }
  const minutos = (agora.getTime() - venda.criadoEm.getTime()) / 60000;
  if (minutos > MINUTOS_CANCELAMENTO_OPERADOR) {
    return {
      ok: false,
      motivo: `Passaram mais de ${MINUTOS_CANCELAMENTO_OPERADOR} minutos. Peça a um administrador pra cancelar.`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- utilidades

/** Confere se a quantidade é válida pra unidade: UN só aceita unidades inteiras. */
export function quantidadeValida(quantidade: number, unidade: "UN" | "KG"): boolean {
  if (!Number.isInteger(quantidade) || quantidade <= 0) return false;
  if (unidade === "UN") return quantidade % MIL === 0;
  return true;
}

// ---------------------------------------------------------------- conferências do registro

/**
 * O PDV manda o preço que mostrou na tela só como referência; o preço praticado
 * é sempre o recarregado do banco. Se os dois divergem (dono editou o produto,
 * promoção venceu com o carrinho aberto), a venda é recusada com o motivo
 * nominal em vez do erro genérico de soma de pagamentos.
 */
export function conferirPrecoReferencia(
  nome: string,
  precoReferencia: number | null | undefined,
  precoAtual: number,
): string | null {
  if (precoReferencia === null || precoReferencia === undefined) return null;
  if (precoReferencia === precoAtual) return null;
  const fmt = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
  return `O preço de "${nome}" mudou de ${fmt(precoReferencia)} pra ${fmt(precoAtual)} desde o bipe. Remova o item e bipe de novo.`;
}

/** Estado devolvido pela API Point do Mercado Pago pra uma intenção de pagamento. */
export type IntencaoMpResumo = { state?: string | null; amount?: number | null };

/**
 * Confere no servidor o que o PDV declarou sobre uma cobrança do Mercado Pago:
 * só vale se a intenção está FINISHED e o valor cobrado é exatamente o do pagamento.
 */
export function conferirIntencaoMp(
  intencao: IntencaoMpResumo,
  valorCentavos: number,
): { ok: true } | { ok: false; mensagem: string } {
  const estado = intencao.state ?? "OPEN";
  if (estado !== "FINISHED") {
    return {
      ok: false,
      mensagem: `A cobrança no Mercado Pago não consta como aprovada (estado ${estado}). Confira na maquininha e, se o cliente já pagou, registre o cartão manualmente.`,
    };
  }
  if (typeof intencao.amount === "number" && intencao.amount !== valorCentavos) {
    const fmt = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
    return {
      ok: false,
      mensagem: `A maquininha Mercado Pago cobrou ${fmt(intencao.amount)}, mas o pagamento informado é de ${fmt(valorCentavos)}. Ajuste o valor do pagamento pra bater com a cobrança.`,
    };
  }
  return { ok: true };
}

/**
 * Erros de concorrência do SQLite que valem uma nova tentativa: outra conexão
 * segurava o lock de escrita (P2034 do Prisma, "database is locked",
 * SQLITE_BUSY, ou o timeout de socket P1008 esperando o lock).
 */
export function erroDeConcorrencia(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const codigo = "code" in e ? String((e as { code: unknown }).code) : "";
  if (codigo === "P2034" || codigo === "P1008") return true;
  const mensagem = "message" in e ? String((e as { message: unknown }).message).toLowerCase() : "";
  return (
    mensagem.includes("database is locked") ||
    mensagem.includes("sqlite_busy") ||
    mensagem.includes("write conflict or a deadlock")
  );
}

// ---------------------------------------------------------------- exibição

export type ItemVendaExibicao = {
  produtoId: number;
  descricao: string;
  unidade: "UN" | "KG";
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  total: number;
};

/**
 * Reagrupa as linhas de ItemVenda por produto e preço praticado. A gravação
 * quebra uma linha do carrinho em várias quando o produto sai de mais de um
 * lote (FEFO); no cupom e na lista o cliente quer ver um produto por linha.
 * Soma quantidade, desconto e total, que fecham exatos porque a divisão por
 * lote preserva o total da linha original.
 */
export function agruparItensPorProduto<T extends ItemVendaExibicao>(itens: T[]): ItemVendaExibicao[] {
  const grupos = new Map<string, ItemVendaExibicao>();
  for (const item of itens) {
    const chave = `${item.produtoId}|${item.precoUnitario}|${item.unidade}`;
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.quantidade += item.quantidade;
      grupo.desconto += item.desconto;
      grupo.total += item.total;
    } else {
      grupos.set(chave, {
        produtoId: item.produtoId,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        desconto: item.desconto,
        total: item.total,
      });
    }
  }
  return Array.from(grupos.values());
}

/** Quantos produtos distintos há numa venda (linhas por lote não contam em dobro). */
export function contarProdutosDistintos(itens: { produtoId: number }[]): number {
  return new Set(itens.map((i) => i.produtoId)).size;
}
