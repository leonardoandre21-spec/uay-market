// Cálculos puros dos relatórios. Nada de banco aqui: recebe listas já
// carregadas e devolve agregados. Tudo em centavos, milésimos e pontos-base.
// Testado em tests/relatorios.test.ts.

import type { FormaPagamento, Unidade } from "@prisma/client";
import {
  addDays,
  agora,
  formatarData,
  formatarDiaCurto,
  limitesDoDia,
  limitesDoMes,
  noFuso,
  paraDataInput,
  parseDataInput,
  subDays,
  subMonths,
} from "@/lib/datas";
import { BP, totalLinha } from "@/lib/dinheiro";

// ---------------------------------------------------------------- período

export const ATALHOS_PERIODO = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "ontem", rotulo: "Ontem" },
  { chave: "7dias", rotulo: "7 dias" },
  { chave: "este-mes", rotulo: "Este mês" },
  { chave: "mes-passado", rotulo: "Mês passado" },
  { chave: "30dias", rotulo: "30 dias" },
  { chave: "este-ano", rotulo: "Este ano" },
] as const;

export type ChaveAtalho = (typeof ATALHOS_PERIODO)[number]["chave"];

export type Periodo = {
  /** Início do primeiro dia (UTC), pra usar em filtros do Prisma. */
  inicio: Date;
  /** Fim do último dia (UTC). */
  fim: Date;
  /** "yyyy-MM-dd" do primeiro dia. */
  de: string;
  /** "yyyy-MM-dd" do último dia. */
  ate: string;
  /** Quantidade de dias corridos do período (mínimo 1). */
  dias: number;
  /** Texto legível: "01/09/2026 a 16/09/2026". */
  rotulo: string;
  /** Atalho equivalente ao intervalo, se houver. */
  atalho: ChaveAtalho | null;
};

function ehChaveAtalho(valor: string | undefined): valor is ChaveAtalho {
  return ATALHOS_PERIODO.some((a) => a.chave === valor);
}

/** Intervalo (de/ate em "yyyy-MM-dd") de um atalho, calculado a partir de hoje. */
export function intervaloAtalho(chave: ChaveAtalho, hoje: Date = agora()): { de: string; ate: string } {
  const h = noFuso(hoje);
  const hojeTexto = paraDataInput(h);
  switch (chave) {
    case "hoje":
      return { de: hojeTexto, ate: hojeTexto };
    case "ontem": {
      const ontem = paraDataInput(subDays(h, 1));
      return { de: ontem, ate: ontem };
    }
    case "7dias":
      return { de: paraDataInput(subDays(h, 6)), ate: hojeTexto };
    case "30dias":
      return { de: paraDataInput(subDays(h, 29)), ate: hojeTexto };
    case "este-mes":
      return { de: `${hojeTexto.slice(0, 7)}-01`, ate: hojeTexto };
    case "mes-passado": {
      const { inicio, fim } = limitesDoMes(subMonths(h, 1));
      return { de: paraDataInput(inicio), ate: paraDataInput(fim) };
    }
    case "este-ano":
      return { de: `${hojeTexto.slice(0, 4)}-01-01`, ate: hojeTexto };
  }
}

/** Todos os atalhos com seus intervalos, pra montar os links do filtro. */
export function atalhosComIntervalo(hoje: Date = agora()) {
  return ATALHOS_PERIODO.map((a) => ({ ...a, ...intervaloAtalho(a.chave, hoje) }));
}

function primeiroValor(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Resolve o período a partir dos searchParams (?de=&ate= ou ?atalho=).
 * Sem parâmetros válidos, usa "este mês". Se de > ate, inverte.
 */
export function resolverPeriodo(
  params: { de?: string | string[]; ate?: string | string[]; atalho?: string | string[] } = {},
  hoje: Date = agora(),
): Periodo {
  const atalhoParam = primeiroValor(params.atalho);
  let de: string;
  let ate: string;

  if (ehChaveAtalho(atalhoParam)) {
    ({ de, ate } = intervaloAtalho(atalhoParam, hoje));
  } else {
    const deParam = primeiroValor(params.de);
    const ateParam = primeiroValor(params.ate);
    const deValido = parseDataInput(deParam) !== null;
    const ateValido = parseDataInput(ateParam) !== null;
    if (deValido && ateValido) {
      de = deParam!.trim();
      ate = ateParam!.trim();
    } else if (deValido && !ateParam) {
      de = deParam!.trim();
      ate = de;
    } else {
      ({ de, ate } = intervaloAtalho("este-mes", hoje));
    }
  }

  if (de > ate) [de, ate] = [ate, de];

  const inicioDia = parseDataInput(de)!;
  const fimDia = parseDataInput(ate)!;
  const inicio = limitesDoDia(inicioDia).inicio;
  const fim = limitesDoDia(fimDia).fim;
  const dias = Math.max(1, Math.round((fimDia.getTime() - inicioDia.getTime()) / 86_400_000) + 1);

  const atalho = atalhosComIntervalo(hoje).find((a) => a.de === de && a.ate === ate)?.chave ?? null;
  const rotulo = de === ate ? formatarData(inicioDia) : `${formatarData(inicioDia)} a ${formatarData(fimDia)}`;

  return { inicio, fim, de, ate, dias, rotulo, atalho };
}

/** Lista de dias ("yyyy-MM-dd") do período, do primeiro ao último, sem buracos. */
export function diasDoPeriodo(de: string, ate: string): string[] {
  const inicio = parseDataInput(de);
  const fim = parseDataInput(ate);
  if (!inicio || !fim) return [];
  const dias: string[] = [];
  let atual = noFuso(inicio);
  const limite = paraDataInput(fim);
  let guarda = 0;
  while (paraDataInput(atual) <= limite && guarda < 5000) {
    dias.push(paraDataInput(atual));
    atual = noFuso(addDays(atual, 1));
    guarda++;
  }
  return dias;
}

// ---------------------------------------------------------------- tipos base

export type VendaBase = {
  id: number;
  criadoEm: Date;
  total: number;
  desconto: number;
  custoTotal: number;
  taxasTotal: number;
  usuarioId: number;
  clienteId: number | null;
};

export type ItemBase = {
  vendaId: number;
  produtoId: number;
  descricao: string;
  unidade: Unidade;
  quantidade: number;
  custoUnitario: number;
  total: number;
};

export type ProdutoBase = {
  id: number;
  nome: string;
  unidade: Unidade;
  categoriaId: number | null;
  categoria: string | null;
  estoque: number;
  precoCusto: number;
  precoVenda: number;
  ativo: boolean;
};

export const SEM_CATEGORIA = "Sem categoria";

// ---------------------------------------------------------------- utilidades

/** Percentual (pontos-base) de `parte` sobre `total`. 0 se total <= 0. */
export function percentualBp(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * BP);
}

/** Margem em pontos-base do lucro sobre a receita. 0 se receita <= 0. */
export function margemBp(receita: number, lucro: number): number {
  if (receita <= 0) return 0;
  return Math.round((lucro / receita) * BP);
}

/** Divisão inteira arredondada, 0 se divisor <= 0. */
export function mediaInteira(total: number, quantidade: number): number {
  if (quantidade <= 0) return 0;
  return Math.round(total / quantidade);
}

/**
 * Rateia `total` proporcionalmente aos `pesos`, em inteiros, garantindo que a
 * soma das partes seja exatamente `total` (método dos maiores restos).
 * Pesos zerados ou negativos não recebem nada. Se a soma dos pesos for 0,
 * devolve tudo zero.
 */
export function ratearProporcional(total: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const pesosValidos = pesos.map((p) => (p > 0 ? p : 0));
  const somaPesos = pesosValidos.reduce((a, b) => a + b, 0);
  if (somaPesos <= 0 || total === 0) return pesos.map(() => 0);

  const sinal = total < 0 ? -1 : 1;
  const alvo = Math.abs(Math.round(total));
  const exatos = pesosValidos.map((p) => (alvo * p) / somaPesos);
  const partes = exatos.map((e) => Math.floor(e));
  let resto = alvo - partes.reduce((a, b) => a + b, 0);

  const ordem = exatos
    .map((e, i) => ({ i, fracao: e - Math.floor(e), peso: pesosValidos[i] }))
    .filter((x) => x.peso > 0)
    .sort((a, b) => b.fracao - a.fracao || b.peso - a.peso || a.i - b.i);

  for (let k = 0; resto > 0 && ordem.length > 0; k = (k + 1) % ordem.length) {
    partes[ordem[k].i] += 1;
    resto -= 1;
  }
  return partes.map((p) => p * sinal);
}

// ---------------------------------------------------------------- receita dos itens

export type ItemComReceita<T extends ItemBase = ItemBase> = T & {
  /** Receita do item já com o desconto geral do cupom rateado. */
  receita: number;
  /** Custo do item: quantidade x custoUnitario / 1000. */
  custo: number;
};

/**
 * Atribui a cada item sua receita líquida: o total do item menos a parte do
 * desconto geral da venda rateada proporcionalmente. Assim a soma da receita
 * dos itens bate com a soma de Venda.total.
 *
 * O custo de cada item é quantidade × custoUnitario. Quando `custoPorVenda`
 * é informado, a soma dos custos dos itens de cada venda é conciliada com
 * `Venda.custoTotal` (a fonte do CMV nos indicadores): uma venda que baixou
 * o mesmo produto de mais de um lote (FEFO) grava várias linhas e a soma dos
 * arredondamentos das partes pode diferir em 1 centavo do arredondamento da
 * quantidade inteira. A diferença vai pra última linha do produto repetido
 * (ou, se não houver, pra última linha da venda), pra que CMV por produto e
 * CMV total do relatório batam sempre.
 */
export function aplicarDescontoGeral<T extends ItemBase>(
  itens: T[],
  descontoPorVenda: Map<number, number>,
  custoPorVenda?: Map<number, number>,
): ItemComReceita<T>[] {
  const porVenda = new Map<number, number[]>();
  itens.forEach((item, indice) => {
    const lista = porVenda.get(item.vendaId);
    if (lista) lista.push(indice);
    else porVenda.set(item.vendaId, [indice]);
  });

  const receitas = itens.map((i) => i.total);
  const custos = itens.map((i) => totalLinha(i.quantidade, i.custoUnitario));
  for (const [vendaId, indices] of porVenda) {
    const desconto = descontoPorVenda.get(vendaId) ?? 0;
    if (desconto > 0) {
      const rateio = ratearProporcional(
        desconto,
        indices.map((i) => itens[i].total),
      );
      indices.forEach((i, k) => {
        receitas[i] = itens[i].total - rateio[k];
      });
    }

    const custoVenda = custoPorVenda?.get(vendaId);
    if (custoVenda === undefined) continue;
    const diferenca = custoVenda - indices.reduce((s, i) => s + custos[i], 0);
    if (diferenca === 0) continue;
    const vezes = new Map<number, number>();
    for (const i of indices) vezes.set(itens[i].produtoId, (vezes.get(itens[i].produtoId) ?? 0) + 1);
    const repetidos = indices.filter((i) => (vezes.get(itens[i].produtoId) ?? 0) > 1);
    const alvo = repetidos.length > 0 ? repetidos[repetidos.length - 1] : indices[indices.length - 1];
    custos[alvo] += diferenca;
  }

  return itens.map((item, i) => ({
    ...item,
    receita: receitas[i],
    custo: custos[i],
  }));
}

// ---------------------------------------------------------------- ranking de produtos

export type LinhaRanking = {
  produtoId: number;
  nome: string;
  unidade: Unidade;
  categoriaId: number | null;
  categoria: string;
  ativo: boolean;
  estoque: number;
  quantidade: number;
  vendas: number;
  receita: number;
  custo: number;
  lucroBruto: number;
  margemBp: number;
  participacaoBp: number;
};

/**
 * Agrupa itens vendidos por produto: quantidade, nº de vendas distintas,
 * receita, custo, lucro bruto (receita - custo), margem e participação na
 * receita total. Ordenado por receita (maior primeiro).
 */
export function rankearProdutos(itens: ItemComReceita[], produtos: Map<number, ProdutoBase>): LinhaRanking[] {
  const acumulado = new Map<
    number,
    { quantidade: number; receita: number; custo: number; vendas: Set<number>; descricao: string; unidade: Unidade }
  >();
  for (const item of itens) {
    let linha = acumulado.get(item.produtoId);
    if (!linha) {
      linha = { quantidade: 0, receita: 0, custo: 0, vendas: new Set(), descricao: item.descricao, unidade: item.unidade };
      acumulado.set(item.produtoId, linha);
    }
    linha.quantidade += item.quantidade;
    linha.receita += item.receita;
    linha.custo += item.custo;
    linha.vendas.add(item.vendaId);
  }

  const receitaTotal = [...acumulado.values()].reduce((s, l) => s + l.receita, 0);

  const linhas: LinhaRanking[] = [];
  for (const [produtoId, acc] of acumulado) {
    const produto = produtos.get(produtoId);
    const lucroBruto = acc.receita - acc.custo;
    linhas.push({
      produtoId,
      nome: produto?.nome ?? acc.descricao,
      unidade: produto?.unidade ?? acc.unidade,
      categoriaId: produto?.categoriaId ?? null,
      categoria: produto?.categoria ?? SEM_CATEGORIA,
      ativo: produto?.ativo ?? false,
      estoque: produto?.estoque ?? 0,
      quantidade: acc.quantidade,
      vendas: acc.vendas.size,
      receita: acc.receita,
      custo: acc.custo,
      lucroBruto,
      margemBp: margemBp(acc.receita, lucroBruto),
      participacaoBp: percentualBp(acc.receita, receitaTotal),
    });
  }
  return linhas.sort((a, b) => b.receita - a.receita || b.quantidade - a.quantidade || a.nome.localeCompare(b.nome));
}

export type LinhaSemVenda = {
  produtoId: number;
  nome: string;
  unidade: Unidade;
  categoria: string;
  estoque: number;
  precoCusto: number;
  valorImobilizado: number;
};

/** Produtos ativos com estoque > 0 que não tiveram nenhuma venda: o encalhe. */
export function produtosSemVenda(produtos: Iterable<ProdutoBase>, produtosVendidos: Set<number>): LinhaSemVenda[] {
  const linhas: LinhaSemVenda[] = [];
  for (const p of produtos) {
    if (!p.ativo || p.estoque <= 0 || produtosVendidos.has(p.id)) continue;
    linhas.push({
      produtoId: p.id,
      nome: p.nome,
      unidade: p.unidade,
      categoria: p.categoria ?? SEM_CATEGORIA,
      estoque: p.estoque,
      precoCusto: p.precoCusto,
      valorImobilizado: totalLinha(p.estoque, p.precoCusto),
    });
  }
  return linhas.sort((a, b) => b.valorImobilizado - a.valorImobilizado || a.nome.localeCompare(b.nome));
}

// ---------------------------------------------------------------- curva ABC

export type ClasseAbc = "A" | "B" | "C";

export type LinhaAbc<T> = T & {
  posicao: number;
  classe: ClasseAbc;
  participacaoBp: number;
  acumuladoBp: number;
};

export const LIMITES_ABC = { a: 8000, b: 9500 } as const;

/**
 * Classifica por receita: ordena do maior pro menor e acumula. Um item é A
 * enquanto o acumulado ANTES dele for menor que 80%, B enquanto for menor que
 * 95%, e C no resto. Assim o primeiro item é sempre A, mesmo que sozinho
 * passe de 80%. Itens sem receita são C.
 */
export function classificarAbc<T extends { receita: number }>(
  linhas: T[],
  limites: { a: number; b: number } = LIMITES_ABC,
): LinhaAbc<T>[] {
  const ordenadas = [...linhas].sort((a, b) => b.receita - a.receita);
  const total = ordenadas.reduce((s, l) => s + Math.max(0, l.receita), 0);
  let acumulado = 0;
  return ordenadas.map((linha, i) => {
    const receita = Math.max(0, linha.receita);
    const acumuladoAntesBp = percentualBp(acumulado, total);
    acumulado += receita;
    const acumuladoBp = percentualBp(acumulado, total);
    let classe: ClasseAbc;
    if (receita <= 0 || total <= 0) classe = "C";
    else if (acumuladoAntesBp < limites.a) classe = "A";
    else if (acumuladoAntesBp < limites.b) classe = "B";
    else classe = "C";
    return { ...linha, posicao: i + 1, classe, participacaoBp: percentualBp(receita, total), acumuladoBp };
  });
}

export type ResumoClasseAbc = {
  classe: ClasseAbc;
  itens: number;
  percentualItensBp: number;
  receita: number;
  percentualReceitaBp: number;
  sugestao: string;
};

export const SUGESTAO_ABC: Record<ClasseAbc, string> = {
  A: "Nunca deixe faltar. Confira o estoque todo dia, negocie preço com o fornecedor e mantenha na prateleira mais visível.",
  B: "Mantenha estoque enxuto e reponha com frequência. Bons candidatos a promoção pra virar classe A.",
  C: "Compre pouco e só quando acabar. Avalie tirar do mix o que encalha ou ocupa espaço sem girar.",
};

export function resumirAbc<T>(linhas: LinhaAbc<T & { receita: number }>[]): ResumoClasseAbc[] {
  const totalItens = linhas.length;
  const totalReceita = linhas.reduce((s, l) => s + Math.max(0, l.receita), 0);
  return (["A", "B", "C"] as ClasseAbc[]).map((classe) => {
    const daClasse = linhas.filter((l) => l.classe === classe);
    const receita = daClasse.reduce((s, l) => s + Math.max(0, l.receita), 0);
    return {
      classe,
      itens: daClasse.length,
      percentualItensBp: percentualBp(daClasse.length, totalItens),
      receita,
      percentualReceitaBp: percentualBp(receita, totalReceita),
      sugestao: SUGESTAO_ABC[classe],
    };
  });
}

// ---------------------------------------------------------------- lucro

export type ComponentesLucro = {
  receita: number;
  cmv: number;
  taxas: number;
  perdas: number;
  despesas: number;
};

export type ResultadoLucro = ComponentesLucro & {
  /** receita - CMV */
  lucroBruto: number;
  /** receita - CMV - taxas */
  lucroAposTaxas: number;
  /** receita - CMV - taxas - perdas - despesas */
  lucroReal: number;
  margemBrutaBp: number;
  margemRealBp: number;
};

export function calcularLucro(c: ComponentesLucro): ResultadoLucro {
  const lucroBruto = c.receita - c.cmv;
  const lucroAposTaxas = lucroBruto - c.taxas;
  const lucroReal = lucroAposTaxas - c.perdas - c.despesas;
  return {
    ...c,
    lucroBruto,
    lucroAposTaxas,
    lucroReal,
    margemBrutaBp: margemBp(c.receita, lucroBruto),
    margemRealBp: margemBp(c.receita, lucroReal),
  };
}

export type LinhaLucroProduto = {
  produtoId: number;
  nome: string;
  unidade: Unidade;
  categoriaId: number | null;
  categoria: string;
  quantidade: number;
  receita: number;
  cmv: number;
  taxas: number;
  perdas: number;
  lucro: number;
  margemBp: number;
};

/**
 * Monta a tabela de lucro por produto: taxas rateadas por receita (a soma dos
 * rateios é exatamente o total de taxas) e perdas do produto no período.
 * Produtos com perda mas sem venda entram com receita zero.
 */
export function lucroPorProduto(
  ranking: LinhaRanking[],
  taxasTotal: number,
  perdasPorProduto: Map<number, number>,
  produtos: Map<number, ProdutoBase>,
): LinhaLucroProduto[] {
  const rateio = ratearProporcional(
    taxasTotal,
    ranking.map((l) => l.receita),
  );
  const linhas: LinhaLucroProduto[] = ranking.map((l, i) => {
    const perdas = perdasPorProduto.get(l.produtoId) ?? 0;
    const lucro = l.receita - l.custo - rateio[i] - perdas;
    return {
      produtoId: l.produtoId,
      nome: l.nome,
      unidade: l.unidade,
      categoriaId: l.categoriaId,
      categoria: l.categoria,
      quantidade: l.quantidade,
      receita: l.receita,
      cmv: l.custo,
      taxas: rateio[i],
      perdas,
      lucro,
      margemBp: margemBp(l.receita, lucro),
    };
  });

  const vendidos = new Set(ranking.map((l) => l.produtoId));
  for (const [produtoId, perdas] of perdasPorProduto) {
    if (vendidos.has(produtoId) || perdas <= 0) continue;
    const produto = produtos.get(produtoId);
    linhas.push({
      produtoId,
      nome: produto?.nome ?? `Produto ${produtoId}`,
      unidade: produto?.unidade ?? "UN",
      categoriaId: produto?.categoriaId ?? null,
      categoria: produto?.categoria ?? SEM_CATEGORIA,
      quantidade: 0,
      receita: 0,
      cmv: 0,
      taxas: 0,
      perdas,
      lucro: -perdas,
      margemBp: 0,
    });
  }
  return linhas.sort((a, b) => b.lucro - a.lucro || b.receita - a.receita || a.nome.localeCompare(b.nome));
}

export type LinhaLucroCategoria = {
  categoriaId: number | null;
  categoria: string;
  produtos: number;
  receita: number;
  cmv: number;
  taxas: number;
  perdas: number;
  lucro: number;
  margemBp: number;
  participacaoBp: number;
};

export function lucroPorCategoria(linhas: LinhaLucroProduto[]): LinhaLucroCategoria[] {
  const mapa = new Map<string, LinhaLucroCategoria>();
  const receitaTotal = linhas.reduce((s, l) => s + l.receita, 0);
  for (const l of linhas) {
    const chave = l.categoriaId === null ? "sem" : String(l.categoriaId);
    let cat = mapa.get(chave);
    if (!cat) {
      cat = {
        categoriaId: l.categoriaId,
        categoria: l.categoria,
        produtos: 0,
        receita: 0,
        cmv: 0,
        taxas: 0,
        perdas: 0,
        lucro: 0,
        margemBp: 0,
        participacaoBp: 0,
      };
      mapa.set(chave, cat);
    }
    cat.produtos += 1;
    cat.receita += l.receita;
    cat.cmv += l.cmv;
    cat.taxas += l.taxas;
    cat.perdas += l.perdas;
    cat.lucro += l.lucro;
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, margemBp: margemBp(c.receita, c.lucro), participacaoBp: percentualBp(c.receita, receitaTotal) }))
    .sort((a, b) => b.receita - a.receita || a.categoria.localeCompare(b.categoria));
}

// ---------------------------------------------------------------- série diária

export type PontoDiario = {
  dia: string;
  rotulo: string;
  vendas: number;
  receita: number;
  cmv: number;
  lucroBruto: number;
};

/** Receita e lucro bruto por dia, preenchendo com zero os dias sem venda. */
export function serieDiaria(vendas: Pick<VendaBase, "criadoEm" | "total" | "custoTotal">[], de: string, ate: string): PontoDiario[] {
  const mapa = new Map<string, PontoDiario>();
  for (const dia of diasDoPeriodo(de, ate)) {
    mapa.set(dia, {
      dia,
      rotulo: formatarDiaCurto(parseDataInput(dia)!),
      vendas: 0,
      receita: 0,
      cmv: 0,
      lucroBruto: 0,
    });
  }
  for (const v of vendas) {
    const ponto = mapa.get(paraDataInput(v.criadoEm));
    if (!ponto) continue;
    ponto.vendas += 1;
    ponto.receita += v.total;
    ponto.cmv += v.custoTotal;
    ponto.lucroBruto += v.total - v.custoTotal;
  }
  return [...mapa.values()];
}

// ---------------------------------------------------------------- pagamentos

export type GrupoPagamento = {
  forma: FormaPagamento;
  quantidade: number;
  bruto: number;
  taxas: number;
};

export type LinhaPagamento = GrupoPagamento & {
  liquido: number;
  participacaoBp: number;
};

export function resumirPagamentos(grupos: GrupoPagamento[]): LinhaPagamento[] {
  const totalBruto = grupos.reduce((s, g) => s + g.bruto, 0);
  return grupos
    .map((g) => ({ ...g, liquido: g.bruto - g.taxas, participacaoBp: percentualBp(g.bruto, totalBruto) }))
    .sort((a, b) => b.bruto - a.bruto);
}

/** Recebimento de fiado (LancamentoFiado PAGAMENTO) agrupado pela forma como o cliente pagou. */
export type RecebimentoFiado = { forma: FormaPagamento; quantidade: number; valor: number };

/**
 * Formas de recebimento de fiado que passam (ou podem passar) pela
 * maquininha. O recebimento de fiado não registra maquininha nem taxa
 * (LancamentoFiado só tem formaPagamento), então esse dinheiro fica fora de
 * "Taxas", do lucro real e da conciliação; os relatórios avisam.
 */
export const FORMAS_FIADO_SEM_TAXA: readonly FormaPagamento[] = ["DEBITO", "CREDITO", "PIX"];

/** Ordena os recebimentos de fiado por valor (maior primeiro), descartando os zerados. */
export function resumirRecebimentosFiado(grupos: RecebimentoFiado[]): RecebimentoFiado[] {
  return grupos.filter((g) => g.quantidade > 0).sort((a, b) => b.valor - a.valor || a.forma.localeCompare(b.forma));
}

/** Soma dos recebimentos de fiado em cartão/Pix: valor que passou sem taxa nem maquininha registradas. */
export function somarFiadoSemTaxa(recebimentos: RecebimentoFiado[]): { quantidade: number; valor: number } {
  return recebimentos
    .filter((r) => FORMAS_FIADO_SEM_TAXA.includes(r.forma))
    .reduce((acc, r) => ({ quantidade: acc.quantidade + r.quantidade, valor: acc.valor + r.valor }), { quantidade: 0, valor: 0 });
}

export type LinhaOperador = {
  usuarioId: number;
  nome: string;
  quantidade: number;
  total: number;
  ticketMedio: number;
  participacaoBp: number;
};

export function vendasPorOperador(
  vendas: Pick<VendaBase, "usuarioId" | "total">[],
  nomes: Map<number, string>,
): LinhaOperador[] {
  const mapa = new Map<number, { quantidade: number; total: number }>();
  for (const v of vendas) {
    const acc = mapa.get(v.usuarioId) ?? { quantidade: 0, total: 0 };
    acc.quantidade += 1;
    acc.total += v.total;
    mapa.set(v.usuarioId, acc);
  }
  const totalGeral = vendas.reduce((s, v) => s + v.total, 0);
  return [...mapa.entries()]
    .map(([usuarioId, acc]) => ({
      usuarioId,
      nome: nomes.get(usuarioId) ?? `Operador ${usuarioId}`,
      quantidade: acc.quantidade,
      total: acc.total,
      ticketMedio: mediaInteira(acc.total, acc.quantidade),
      participacaoBp: percentualBp(acc.total, totalGeral),
    }))
    .sort((a, b) => b.total - a.total);
}

export type PontoHora = { hora: number; rotulo: string; quantidade: number; total: number };

/** Vendas por hora do dia (0 a 23), no fuso do mercado. Sempre 24 pontos. */
export function vendasPorHora(vendas: Pick<VendaBase, "criadoEm" | "total">[]): PontoHora[] {
  const pontos: PontoHora[] = Array.from({ length: 24 }, (_, hora) => ({
    hora,
    rotulo: `${String(hora).padStart(2, "0")}h`,
    quantidade: 0,
    total: 0,
  }));
  for (const v of vendas) {
    const hora = noFuso(v.criadoEm).getHours();
    pontos[hora].quantidade += 1;
    pontos[hora].total += v.total;
  }
  return pontos;
}

export const ROTULO_DIA_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export const ROTULO_DIA_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export type PontoDiaSemana = {
  dia: number;
  rotulo: string;
  rotuloCurto: string;
  quantidade: number;
  total: number;
  ticketMedio: number;
};

/** Vendas por dia da semana, de segunda a domingo. Sempre 7 pontos. */
export function vendasPorDiaSemana(vendas: Pick<VendaBase, "criadoEm" | "total">[]): PontoDiaSemana[] {
  const acumulado = Array.from({ length: 7 }, () => ({ quantidade: 0, total: 0 }));
  for (const v of vendas) {
    const dia = noFuso(v.criadoEm).getDay();
    acumulado[dia].quantidade += 1;
    acumulado[dia].total += v.total;
  }
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  return ordem.map((dia) => ({
    dia,
    rotulo: ROTULO_DIA_SEMANA[dia],
    rotuloCurto: ROTULO_DIA_SEMANA_CURTO[dia],
    quantidade: acumulado[dia].quantidade,
    total: acumulado[dia].total,
    ticketMedio: mediaInteira(acumulado[dia].total, acumulado[dia].quantidade),
  }));
}

// ---------------------------------------------------------------- estoque

/**
 * "sem-estoque": esgotou vendendo (estoque zero com venda no período) ou
 * ficou negativo (vendeu sem estoque). "zerado": estoque zero sem nenhuma
 * venda no período (cadastrado e nunca comprado, ou acabou antes do período).
 */
export type SituacaoEstoque = "sem-estoque" | "zerado" | "parado" | "critico" | "atencao" | "normal" | "excesso";

export const ROTULO_SITUACAO_ESTOQUE: Record<SituacaoEstoque, string> = {
  "sem-estoque": "Sem estoque",
  zerado: "Zerado",
  parado: "Parado",
  critico: "Crítico",
  atencao: "Atenção",
  normal: "Normal",
  excesso: "Excesso",
};

/**
 * Giro do período: quantidade vendida dividida pelo estoque médio aproximado
 * ((estoque atual + vendido) / 2). Devolve número com 2 casas ou null quando
 * não há como calcular (estoque médio zero ou negativo).
 */
export function giroEstoque(quantidadeVendida: number, estoqueAtual: number): number | null {
  const estoqueMedio = (Math.max(0, estoqueAtual) + Math.max(0, quantidadeVendida)) / 2;
  if (estoqueMedio <= 0) return null;
  return Math.round((Math.max(0, quantidadeVendida) / estoqueMedio) * 100) / 100;
}

/**
 * Dias de cobertura: estoque atual dividido pela média diária vendida.
 * null quando nada foi vendido (não dá pra estimar); 0 quando não há estoque.
 */
export function diasDeCobertura(estoqueAtual: number, quantidadeVendida: number, dias: number): number | null {
  if (estoqueAtual <= 0) return 0;
  if (quantidadeVendida <= 0 || dias <= 0) return null;
  const mediaDiaria = quantidadeVendida / dias;
  return Math.round(estoqueAtual / mediaDiaria);
}

export function situacaoEstoque(estoqueAtual: number, quantidadeVendida: number, cobertura: number | null): SituacaoEstoque {
  if (estoqueAtual < 0) return "sem-estoque";
  if (estoqueAtual === 0) return quantidadeVendida > 0 ? "sem-estoque" : "zerado";
  if (quantidadeVendida <= 0 || cobertura === null) return "parado";
  if (cobertura < 7) return "critico";
  if (cobertura < 15) return "atencao";
  if (cobertura > 60) return "excesso";
  return "normal";
}

export type LinhaGiro = {
  produtoId: number;
  nome: string;
  unidade: Unidade;
  categoria: string;
  estoqueAtual: number;
  quantidadeVendida: number;
  estoqueMedio: number;
  giro: number | null;
  cobertura: number | null;
  valorImobilizado: number;
  situacao: SituacaoEstoque;
};

/** Giro e cobertura de todos os produtos ativos (e dos inativos que venderam). */
export function calcularGiro(
  produtos: Iterable<ProdutoBase>,
  vendidoPorProduto: Map<number, number>,
  dias: number,
): LinhaGiro[] {
  const linhas: LinhaGiro[] = [];
  for (const p of produtos) {
    const vendido = vendidoPorProduto.get(p.id) ?? 0;
    if (!p.ativo && vendido <= 0) continue;
    const cobertura = diasDeCobertura(p.estoque, vendido, dias);
    linhas.push({
      produtoId: p.id,
      nome: p.nome,
      unidade: p.unidade,
      categoria: p.categoria ?? SEM_CATEGORIA,
      estoqueAtual: p.estoque,
      quantidadeVendida: vendido,
      estoqueMedio: Math.round((Math.max(0, p.estoque) + vendido) / 2),
      giro: giroEstoque(vendido, p.estoque),
      cobertura,
      valorImobilizado: totalLinha(Math.max(0, p.estoque), p.precoCusto),
      situacao: situacaoEstoque(p.estoque, vendido, cobertura),
    });
  }
  return linhas.sort((a, b) => (b.giro ?? -1) - (a.giro ?? -1) || b.quantidadeVendida - a.quantidadeVendida || a.nome.localeCompare(b.nome));
}

export type LinhaImobilizado = {
  categoriaId: number | null;
  categoria: string;
  produtos: number;
  parados: number;
  valor: number;
  valorParado: number;
  participacaoBp: number;
};

/** Valor imobilizado (estoque x custo) por categoria, só de produtos ativos com estoque positivo. */
export function valorImobilizadoPorCategoria(
  produtos: Iterable<ProdutoBase>,
  produtosVendidos: Set<number>,
): LinhaImobilizado[] {
  const mapa = new Map<string, LinhaImobilizado>();
  let total = 0;
  for (const p of produtos) {
    if (!p.ativo || p.estoque <= 0) continue;
    const chave = p.categoriaId === null ? "sem" : String(p.categoriaId);
    let cat = mapa.get(chave);
    if (!cat) {
      cat = {
        categoriaId: p.categoriaId,
        categoria: p.categoria ?? SEM_CATEGORIA,
        produtos: 0,
        parados: 0,
        valor: 0,
        valorParado: 0,
        participacaoBp: 0,
      };
      mapa.set(chave, cat);
    }
    const valor = totalLinha(p.estoque, p.precoCusto);
    cat.produtos += 1;
    cat.valor += valor;
    total += valor;
    if (!produtosVendidos.has(p.id)) {
      cat.parados += 1;
      cat.valorParado += valor;
    }
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, participacaoBp: percentualBp(c.valor, total) }))
    .sort((a, b) => b.valor - a.valor || a.categoria.localeCompare(b.categoria));
}

// ---------------------------------------------------------------- clientes

export type LinhaCliente = {
  clienteId: number;
  nome: string;
  compras: number;
  total: number;
  ticketMedio: number;
  participacaoBp: number;
};

export function rankearClientes(
  vendas: Pick<VendaBase, "clienteId" | "total">[],
  nomes: Map<number, string>,
): LinhaCliente[] {
  const mapa = new Map<number, { compras: number; total: number }>();
  let totalIdentificado = 0;
  for (const v of vendas) {
    if (v.clienteId === null) continue;
    const acc = mapa.get(v.clienteId) ?? { compras: 0, total: 0 };
    acc.compras += 1;
    acc.total += v.total;
    totalIdentificado += v.total;
    mapa.set(v.clienteId, acc);
  }
  return [...mapa.entries()]
    .map(([clienteId, acc]) => ({
      clienteId,
      nome: nomes.get(clienteId) ?? `Cliente ${clienteId}`,
      compras: acc.compras,
      total: acc.total,
      ticketMedio: mediaInteira(acc.total, acc.compras),
      participacaoBp: percentualBp(acc.total, totalIdentificado),
    }))
    .sort((a, b) => b.total - a.total || b.compras - a.compras || a.nome.localeCompare(b.nome));
}

export type LinhaFiado = {
  clienteId: number;
  nome: string;
  telefone: string | null;
  saldo: number;
  limite: number;
  usoLimiteBp: number;
};

export type LancamentoFiadoBase = { clienteId: number; tipo: "DEBITO" | "PAGAMENTO" | "ESTORNO"; valor: number };

/** Saldo (DEBITO − PAGAMENTO − ESTORNO) de cada cliente, positivo ou não. */
export function saldosFiadoPorCliente(lancamentos: LancamentoFiadoBase[]): Map<number, number> {
  const saldos = new Map<number, number>();
  for (const l of lancamentos) {
    const atual = saldos.get(l.clienteId) ?? 0;
    saldos.set(l.clienteId, l.tipo === "DEBITO" ? atual + l.valor : atual - l.valor);
  }
  return saldos;
}

/**
 * Fiado em aberto = soma dos saldos POSITIVOS por cliente. Um cliente pode
 * ficar com saldo negativo (pagou e depois a venda foi cancelada, gerando
 * ESTORNO); esse crédito é dele e não abate a dívida dos outros. `credito`
 * é a soma desses saldos negativos, em valor absoluto. Mesma regra do
 * relatório de Clientes e da tela de Clientes.
 */
export function totalFiadoEmAberto(lancamentos: LancamentoFiadoBase[]): { emAberto: number; credito: number; clientesDevendo: number } {
  let emAberto = 0;
  let credito = 0;
  let clientesDevendo = 0;
  for (const saldo of saldosFiadoPorCliente(lancamentos).values()) {
    if (saldo > 0) {
      emAberto += saldo;
      clientesDevendo += 1;
    } else if (saldo < 0) {
      credito += -saldo;
    }
  }
  return { emAberto, credito, clientesDevendo };
}

/** Saldo devedor (DEBITO - PAGAMENTO - ESTORNO) por cliente, só de quem tem saldo positivo. */
export function saldosFiadoEmAberto(
  lancamentos: LancamentoFiadoBase[],
  clientes: Map<number, { nome: string; telefone: string | null; limiteFiado: number }>,
): LinhaFiado[] {
  const linhas: LinhaFiado[] = [];
  for (const [clienteId, saldo] of saldosFiadoPorCliente(lancamentos)) {
    if (saldo <= 0) continue;
    const c = clientes.get(clienteId);
    const limite = c?.limiteFiado ?? 0;
    linhas.push({
      clienteId,
      nome: c?.nome ?? `Cliente ${clienteId}`,
      telefone: c?.telefone ?? null,
      saldo,
      limite,
      usoLimiteBp: percentualBp(saldo, limite),
    });
  }
  return linhas.sort((a, b) => b.saldo - a.saldo || a.nome.localeCompare(b.nome));
}

// ---------------------------------------------------------------- conciliação de maquininhas

/** Formas que passam pela maquininha e entram na conciliação. */
export const FORMAS_MAQUININHA = ["DEBITO", "CREDITO", "PIX"] as const;
export type FormaMaquininha = (typeof FORMAS_MAQUININHA)[number];

/** Id fictício da "maquininha" que agrupa cartões antigos gravados sem maquininha. */
export const SEM_MAQUININHA_ID = 0;
export const SEM_MAQUININHA_NOME = "Sem maquininha";

export type MaquininhaConciliacao = {
  id: number;
  nome: string;
  prazoDebitoDias: number;
  prazoCreditoDias: number;
  prazoPixDias: number;
};

export type PagamentoConciliacao = {
  pagamentoId: number;
  vendaId: number;
  vendaNumero: number;
  criadoEm: Date;
  forma: FormaMaquininha;
  parcelas: number;
  /** centavos */
  valor: number;
  /** centavos */
  taxaValor: number;
  nsu: string | null;
  autorizacao: string | null;
  maquininhaId: number | null;
};

/** Prazo (dias corridos) que a maquininha leva pra pagar cada forma. */
export function prazoDaMaquininha(maquininha: Pick<MaquininhaConciliacao, "prazoDebitoDias" | "prazoCreditoDias" | "prazoPixDias">, forma: FormaMaquininha): number {
  if (forma === "DEBITO") return Math.max(0, maquininha.prazoDebitoDias);
  if (forma === "CREDITO") return Math.max(0, maquininha.prazoCreditoDias);
  return Math.max(0, maquininha.prazoPixDias);
}

/**
 * Dia previsto ("yyyy-MM-dd", no fuso do mercado) em que o dinheiro cai na
 * conta: dia da venda + prazo da maquininha pra forma, em dias corridos.
 */
export function dataPrevistaRecebimento(criadoEm: Date, forma: FormaMaquininha, maquininha: MaquininhaConciliacao | null): string {
  const prazo = maquininha ? prazoDaMaquininha(maquininha, forma) : 0;
  return paraDataInput(addDays(noFuso(criadoEm), prazo));
}

/**
 * Prazo de crédito a partir do qual o sistema entende que a maquininha NÃO
 * antecipa o parcelado: cada parcela cai separada, uma a cada 30 dias. Com
 * prazo menor (ex.: D+1, antecipação automática) o valor inteiro cai de uma
 * vez. O cadastro da maquininha não tem campo próprio pra isso; o prazo do
 * crédito é a única pista.
 */
export const PRAZO_SEM_ANTECIPACAO_DIAS = 30;
export const INTERVALO_PARCELAS_DIAS = 30;

export type ParcelaPrevista = {
  numero: number;
  /** "yyyy-MM-dd" */
  dataPrevista: string;
  bruto: number;
  taxas: number;
  liquido: number;
};

/** Se o crédito parcelado deste pagamento cai parcela a parcela (ver PRAZO_SEM_ANTECIPACAO_DIAS). */
export function caiParcelaAParcela(p: Pick<PagamentoConciliacao, "forma" | "parcelas">, maquininha: MaquininhaConciliacao | null): boolean {
  if (p.forma !== "CREDITO" || p.parcelas <= 1 || !maquininha) return false;
  return prazoDaMaquininha(maquininha, "CREDITO") >= PRAZO_SEM_ANTECIPACAO_DIAS;
}

/**
 * Como o líquido de um pagamento cai na conta. Débito, Pix e crédito à vista:
 * tudo na data prevista. Crédito parcelado que cai parcela a parcela: N
 * lançamentos em partes iguais (bruto, taxa e líquido rateados com soma
 * exata), o primeiro na data prevista e os seguintes a cada 30 dias.
 */
export function parcelasPrevistas(
  p: Pick<PagamentoConciliacao, "criadoEm" | "forma" | "parcelas" | "valor" | "taxaValor">,
  maquininha: MaquininhaConciliacao | null,
): ParcelaPrevista[] {
  const primeira = dataPrevistaRecebimento(p.criadoEm, p.forma, maquininha);
  if (!caiParcelaAParcela(p, maquininha)) {
    return [{ numero: 1, dataPrevista: primeira, bruto: p.valor, taxas: p.taxaValor, liquido: p.valor - p.taxaValor }];
  }
  const pesos = Array.from({ length: p.parcelas }, () => 1);
  const brutos = ratearProporcional(p.valor, pesos);
  const taxas = ratearProporcional(p.taxaValor, pesos);
  const inicio = parseDataInput(primeira)!;
  return brutos.map((bruto, k) => ({
    numero: k + 1,
    dataPrevista: paraDataInput(addDays(noFuso(inicio), k * INTERVALO_PARCELAS_DIAS)),
    bruto,
    taxas: taxas[k],
    liquido: bruto - taxas[k],
  }));
}

export type TotaisForma = { quantidade: number; bruto: number; taxas: number; liquido: number };

function totaisVazios(): TotaisForma {
  return { quantidade: 0, bruto: 0, taxas: 0, liquido: 0 };
}

function somarEm(alvo: TotaisForma, p: Pick<PagamentoConciliacao, "valor" | "taxaValor">): void {
  alvo.quantidade += 1;
  alvo.bruto += p.valor;
  alvo.taxas += p.taxaValor;
  alvo.liquido += p.valor - p.taxaValor;
}

/** Totais gerais mais a quebra por forma (débito/crédito/pix), já achatada pra tabela e CSV. */
export type TotaisConciliacao = TotaisForma & {
  debitoQuantidade: number;
  debitoBruto: number;
  debitoTaxas: number;
  debitoLiquido: number;
  creditoQuantidade: number;
  creditoBruto: number;
  creditoTaxas: number;
  creditoLiquido: number;
  pixQuantidade: number;
  pixBruto: number;
  pixTaxas: number;
  pixLiquido: number;
};

function achatar(geral: TotaisForma, porForma: Record<FormaMaquininha, TotaisForma>): TotaisConciliacao {
  return {
    ...geral,
    debitoQuantidade: porForma.DEBITO.quantidade,
    debitoBruto: porForma.DEBITO.bruto,
    debitoTaxas: porForma.DEBITO.taxas,
    debitoLiquido: porForma.DEBITO.liquido,
    creditoQuantidade: porForma.CREDITO.quantidade,
    creditoBruto: porForma.CREDITO.bruto,
    creditoTaxas: porForma.CREDITO.taxas,
    creditoLiquido: porForma.CREDITO.liquido,
    pixQuantidade: porForma.PIX.quantidade,
    pixBruto: porForma.PIX.bruto,
    pixTaxas: porForma.PIX.taxas,
    pixLiquido: porForma.PIX.liquido,
  };
}

class Acumulador {
  geral = totaisVazios();
  porForma: Record<FormaMaquininha, TotaisForma> = { DEBITO: totaisVazios(), CREDITO: totaisVazios(), PIX: totaisVazios() };
  somar(p: PagamentoConciliacao): void {
    somarEm(this.geral, p);
    somarEm(this.porForma[p.forma], p);
  }
  fechar(): TotaisConciliacao {
    return achatar(this.geral, this.porForma);
  }
}

export type LinhaConciliacaoMaquininha = TotaisConciliacao & {
  maquininhaId: number;
  nome: string;
  participacaoBp: number;
};

export type LinhaConciliacaoDia = TotaisConciliacao & {
  /** "yyyy-MM-dd" do dia da venda */
  dia: string;
  diaRotulo: string;
  maquininhaId: number;
  nome: string;
};

export type LinhaAReceber = {
  /** "yyyy-MM-dd" */
  dataPrevista: string;
  dataPrevistaRotulo: string;
  maquininhaId: number;
  nome: string;
  /** Lançamentos previstos na data: um por pagamento, ou um por parcela quando o crédito cai parcela a parcela. */
  quantidade: number;
  bruto: number;
  taxas: number;
  liquido: number;
};

export type TransacaoConciliacao = {
  pagamentoId: number;
  criadoEm: Date;
  vendaId: number;
  vendaNumero: number;
  maquininhaId: number;
  nome: string;
  forma: FormaMaquininha;
  parcelas: number;
  bruto: number;
  taxa: number;
  liquido: number;
  nsu: string | null;
  autorizacao: string | null;
  /** "yyyy-MM-dd" da primeira (ou única) parcela */
  dataPrevista: string;
  /** "yyyy-MM-dd" da última parcela; igual a dataPrevista quando cai de uma vez */
  dataPrevistaFinal: string;
  /** true quando o líquido foi dividido em parcelas em datas diferentes */
  parcelado: boolean;
};

export type ResultadoConciliacao = {
  porMaquininha: LinhaConciliacaoMaquininha[];
  porDia: LinhaConciliacaoDia[];
  aReceber: LinhaAReceber[];
  transacoes: TransacaoConciliacao[];
  totais: TotaisConciliacao;
  /** quantos cartões do período foram gravados sem maquininha */
  semMaquininha: number;
  /** quantos pagamentos tiveram o líquido dividido parcela a parcela em "a receber" */
  parcelados: number;
};

/**
 * Agrupa os pagamentos de cartão/pix do período por maquininha, por dia e por
 * data prevista de recebimento. Pagamentos de cartão sem maquininha (vendas
 * antigas) entram numa linha "Sem maquininha" com prazo zero, pra bater com
 * o relatório de pagamentos. Em "a receber", crédito parcelado que cai
 * parcela a parcela (ver parcelasPrevistas) gera um lançamento por parcela.
 */
export function agruparConciliacao(pagamentos: PagamentoConciliacao[], maquininhas: Map<number, MaquininhaConciliacao>): ResultadoConciliacao {
  const semMaquininha: MaquininhaConciliacao = {
    id: SEM_MAQUININHA_ID,
    nome: SEM_MAQUININHA_NOME,
    prazoDebitoDias: 0,
    prazoCreditoDias: 0,
    prazoPixDias: 0,
  };
  const resolver = (id: number | null): MaquininhaConciliacao => (id !== null ? maquininhas.get(id) : undefined) ?? semMaquininha;

  const porMaquininha = new Map<number, { nome: string; acc: Acumulador }>();
  const porDia = new Map<string, { dia: string; maquininhaId: number; nome: string; acc: Acumulador }>();
  const aReceber = new Map<string, LinhaAReceber>();
  const transacoes: TransacaoConciliacao[] = [];
  const total = new Acumulador();
  let contagemSem = 0;
  let contagemParcelados = 0;

  for (const p of pagamentos) {
    const m = resolver(p.maquininhaId);
    if (m.id === SEM_MAQUININHA_ID) contagemSem++;
    const dia = paraDataInput(p.criadoEm);
    const parcelas = parcelasPrevistas(p, m);
    const dataPrevista = parcelas[0].dataPrevista;
    const dataPrevistaFinal = parcelas[parcelas.length - 1].dataPrevista;
    if (parcelas.length > 1) contagemParcelados++;

    total.somar(p);

    let grupoM = porMaquininha.get(m.id);
    if (!grupoM) porMaquininha.set(m.id, (grupoM = { nome: m.nome, acc: new Acumulador() }));
    grupoM.acc.somar(p);

    const chaveDia = `${dia}|${m.id}`;
    let grupoD = porDia.get(chaveDia);
    if (!grupoD) porDia.set(chaveDia, (grupoD = { dia, maquininhaId: m.id, nome: m.nome, acc: new Acumulador() }));
    grupoD.acc.somar(p);

    for (const parcela of parcelas) {
      const chaveR = `${parcela.dataPrevista}|${m.id}`;
      let grupoR = aReceber.get(chaveR);
      if (!grupoR) {
        aReceber.set(
          chaveR,
          (grupoR = {
            dataPrevista: parcela.dataPrevista,
            dataPrevistaRotulo: formatarData(parseDataInput(parcela.dataPrevista)),
            maquininhaId: m.id,
            nome: m.nome,
            quantidade: 0,
            bruto: 0,
            taxas: 0,
            liquido: 0,
          }),
        );
      }
      grupoR.quantidade += 1;
      grupoR.bruto += parcela.bruto;
      grupoR.taxas += parcela.taxas;
      grupoR.liquido += parcela.liquido;
    }

    transacoes.push({
      pagamentoId: p.pagamentoId,
      criadoEm: p.criadoEm,
      vendaId: p.vendaId,
      vendaNumero: p.vendaNumero,
      maquininhaId: m.id,
      nome: m.nome,
      forma: p.forma,
      parcelas: p.parcelas,
      bruto: p.valor,
      taxa: p.taxaValor,
      liquido: p.valor - p.taxaValor,
      nsu: p.nsu,
      autorizacao: p.autorizacao,
      dataPrevista,
      dataPrevistaFinal,
      parcelado: parcelas.length > 1,
    });
  }

  const totais = total.fechar();
  const linhasMaquininha: LinhaConciliacaoMaquininha[] = [...porMaquininha.entries()]
    .map(([maquininhaId, g]) => {
      const t = g.acc.fechar();
      return { ...t, maquininhaId, nome: g.nome, participacaoBp: percentualBp(t.bruto, totais.bruto) };
    })
    .sort((a, b) => b.bruto - a.bruto || a.nome.localeCompare(b.nome));
  const linhasDia: LinhaConciliacaoDia[] = [...porDia.values()]
    .map((g) => ({
      ...g.acc.fechar(),
      dia: g.dia,
      diaRotulo: formatarData(parseDataInput(g.dia)),
      maquininhaId: g.maquininhaId,
      nome: g.nome,
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome));
  const linhasReceber = [...aReceber.values()].sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista) || a.nome.localeCompare(b.nome));
  transacoes.sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime() || a.pagamentoId - b.pagamentoId);

  return {
    porMaquininha: linhasMaquininha,
    porDia: linhasDia,
    aReceber: linhasReceber,
    transacoes,
    totais,
    semMaquininha: contagemSem,
    parcelados: contagemParcelados,
  };
}

// ---------------------------------------------------------------- CSV

export type CelulaCsv = string | number | null | undefined;

function escaparCelula(valor: CelulaCsv): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  if (/[;"\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/**
 * Gera CSV pro Excel em português: BOM UTF-8, separador ";" e quebra CRLF.
 * Números devem vir já formatados pelo chamador ("12,50").
 */
export function gerarCsv(cabecalho: string[], linhas: CelulaCsv[][]): string {
  const corpo = [cabecalho, ...linhas].map((linha) => linha.map(escaparCelula).join(";"));
  return `﻿${corpo.join("\r\n")}\r\n`;
}
