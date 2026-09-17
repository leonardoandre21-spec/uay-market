// Funções puras do módulo de produtos: filtros da listagem, leitura e geração
// de CSV, mapeamento de colunas, validação de linhas de importação, sugestão
// de preço e esquemas de validação dos formulários.
//
// Nada aqui toca o banco. Roda no servidor, no navegador e nos testes
// (tests/produtos.test.ts). Acesso a dados fica em lib/servicos/produtos.ts.

import { z } from "zod";
import type { Unidade } from "@prisma/client";
import { BP, MIL, formatarQuantidade, formatarReais, parseQuantidade, parseReais, totalLinha } from "@/lib/dinheiro";
import { formatarData, formatarDataHora, limitesDoDia, parseDataInput } from "@/lib/datas";
import { codigoBarrasValido, normalizarTexto } from "@/lib/utils";

// ---------------------------------------------------------------- filtros da listagem

export const PRODUTOS_POR_PAGINA = 50;

export const SITUACOES_FILTRO = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "abaixo-minimo", rotulo: "Abaixo do mínimo" },
  { valor: "promocao", rotulo: "Em promoção" },
  { valor: "inativos", rotulo: "Inativos" },
  { valor: "todos", rotulo: "Todos" },
] as const;

export type SituacaoFiltro = (typeof SITUACOES_FILTRO)[number]["valor"];

export type FiltrosProdutos = {
  /** Texto livre: nome, código de barras ou código interno. */
  busca: string;
  /** "" = todas, "sem" = sem categoria, ou o id em texto. */
  categoria: string;
  situacao: SituacaoFiltro;
  pagina: number;
};

export function parseSituacao(texto: string | null | undefined, padrao: SituacaoFiltro = "ativos"): SituacaoFiltro {
  const achado = SITUACOES_FILTRO.find((s) => s.valor === texto);
  return achado ? achado.valor : padrao;
}

export function parsePagina(texto: string | null | undefined): number {
  const n = Number(texto);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Lê os filtros da URL (searchParams do Next ou URLSearchParams já convertido em objeto). */
export function lerFiltrosProdutos(
  params: Record<string, string | string[] | undefined>,
  situacaoPadrao: SituacaoFiltro = "ativos",
): FiltrosProdutos {
  const um = (chave: string) => {
    const v = params[chave];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const categoriaBruta = um("categoria").trim();
  const categoria = categoriaBruta === "sem" || /^\d+$/.test(categoriaBruta) ? categoriaBruta : "";
  return {
    busca: um("busca").trim().slice(0, 80),
    categoria,
    situacao: parseSituacao(um("situacao"), situacaoPadrao),
    pagina: parsePagina(um("pagina")),
  };
}

/** Monta a query string dos filtros, omitindo o que está no padrão. */
export function montarQueryProdutos(filtros: Partial<FiltrosProdutos>, incluirSituacaoPadrao = false): string {
  const q = new URLSearchParams();
  if (filtros.busca) q.set("busca", filtros.busca);
  if (filtros.categoria) q.set("categoria", filtros.categoria);
  if (filtros.situacao && (filtros.situacao !== "ativos" || incluirSituacaoPadrao)) q.set("situacao", filtros.situacao);
  if (filtros.pagina && filtros.pagina > 1) q.set("pagina", String(filtros.pagina));
  return q.toString();
}

export function totalPaginas(total: number, porPagina = PRODUTOS_POR_PAGINA): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / porPagina));
}

/** Intervalo exibido ("Mostrando 51 a 100 de 320"). */
export function intervaloPagina(pagina: number, total: number, porPagina = PRODUTOS_POR_PAGINA): { de: number; ate: number } {
  if (total <= 0) return { de: 0, ate: 0 };
  const de = (pagina - 1) * porPagina + 1;
  return { de, ate: Math.min(total, pagina * porPagina) };
}

// ---------------------------------------------------------------- estoque e promoção

/**
 * Mesma regra de situacaoEstoque() (módulo de estoque) e do painel (gestao):
 * só conta quando há mínimo definido e o estoque ficou abaixo dele. Mínimo
 * zero significa "não controlo", e estoque igual ao mínimo ainda está OK.
 */
export function estoqueAbaixoDoMinimo(estoque: number, estoqueMinimo: number): boolean {
  return estoqueMinimo > 0 && estoque < estoqueMinimo;
}

/** Promoção só faz sentido abaixo do preço normal. Sem promoção (null) sempre cabe. */
export function promocaoCabeNoPreco(precoPromocional: number | null, precoVenda: number): boolean {
  return precoPromocional === null || precoPromocional < precoVenda;
}

/** Mesmo critério de precoEfetivo() em lib/consultas, mas puro e testável. */
export function promocaoVigente(
  produto: { precoPromocional: number | null; promocaoAte: Date | null },
  referencia: Date,
): boolean {
  if (produto.precoPromocional === null || produto.precoPromocional <= 0) return false;
  return produto.promocaoAte === null || produto.promocaoAte.getTime() >= referencia.getTime();
}

/** Valor do estoque a preço de custo, em centavos. Ignora estoque negativo. */
export function valorEstoqueACusto(itens: ReadonlyArray<{ estoque: number; precoCusto: number }>): number {
  return itens.reduce((acc, p) => (p.estoque > 0 ? acc + totalLinha(p.estoque, p.precoCusto) : acc), 0);
}

// ---------------------------------------------------------------- preços

/**
 * Preço de venda pra alcançar uma margem (sobre a venda) a partir do custo.
 * preco = custo / (1 - margem). Retorna null se não dá pra calcular
 * (custo zero ou margem de 100% ou mais).
 */
export function sugerirPrecoPorMargem(custoCentavos: number, margemPontosBase: number): number | null {
  if (!Number.isFinite(custoCentavos) || custoCentavos <= 0) return null;
  if (!Number.isFinite(margemPontosBase) || margemPontosBase < 0 || margemPontosBase >= BP) return null;
  return Math.round((custoCentavos * BP) / (BP - margemPontosBase));
}

/** Preço de venda a partir do custo e do markup (sobre o custo). */
export function sugerirPrecoPorMarkup(custoCentavos: number, markupPontosBase: number): number | null {
  if (!Number.isFinite(custoCentavos) || custoCentavos <= 0) return null;
  if (!Number.isFinite(markupPontosBase) || markupPontosBase < 0) return null;
  return Math.round((custoCentavos * (BP + markupPontosBase)) / BP);
}

/** Quanto sobra por unidade/kg vendido, em centavos. */
export function lucroUnitario(precoVenda: number, custo: number): number {
  return precoVenda - custo;
}

// ---------------------------------------------------------------- CSV: leitura e escrita

export type Separador = ";" | "," | "\t";

/** Escolhe o separador olhando a primeira linha não vazia. Empate favorece ";" (padrão do Excel em português). */
export function detectarSeparador(texto: string): Separador {
  const primeira = texto.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const contar = (sep: string) => {
    let n = 0;
    let aspas = false;
    for (const c of primeira) {
      if (c === '"') aspas = !aspas;
      else if (!aspas && c === sep) n++;
    }
    return n;
  };
  let melhor: Separador = ";";
  let maior = 0;
  for (const sep of [";", ",", "\t"] as const) {
    const n = contar(sep);
    if (n > maior) {
      maior = n;
      melhor = sep;
    }
  }
  return melhor;
}

/**
 * Lê CSV respeitando aspas (campo com separador ou quebra de linha dentro,
 * aspas duplicadas como escape). Linhas totalmente vazias são descartadas.
 */
export function parseCsv(texto: string, separador?: Separador): string[][] {
  const t = texto.replace(/^﻿/, "");
  const sep = separador ?? detectarSeparador(t);
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"' && campo === "") {
      entreAspas = true;
    } else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;
const NUMERO_PURO = /^[+-]?\d+(?:[.,]\d+)?$/;

/**
 * Impede que Excel e LibreOffice tratem a célula como fórmula (texto começando
 * com =, +, -, @, tab ou CR): prefixa com apóstrofo, como recomenda a OWASP.
 * Número puro ("-3", "-12,5") fica como está pra continuar somando na planilha.
 * A importação tira esse apóstrofo de volta (ver validarLinha), então o
 * arquivo exportado reimporta sem sujeira.
 */
export function neutralizarFormulaCsv(valor: string): string {
  return INICIO_DE_FORMULA.test(valor) && !NUMERO_PURO.test(valor) ? `'${valor}` : valor;
}

/** Gera CSV com aspas onde precisa e sem célula que vire fórmula. Quebra de linha CRLF (Excel). */
export function gerarCsv(linhas: ReadonlyArray<ReadonlyArray<string>>, separador: Separador = ";", comBom = false): string {
  const escapar = (bruto: string) => {
    const v = neutralizarFormulaCsv(bruto);
    const precisa = v !== bruto || v.includes(separador) || v.includes('"') || v.includes("\n") || v.includes("\r");
    return precisa ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const corpo = linhas.map((l) => l.map(escapar).join(separador)).join("\r\n");
  return `${comBom ? "﻿" : ""}${corpo}${linhas.length ? "\r\n" : ""}`;
}

/**
 * Decodifica os bytes de um arquivo CSV. Tenta UTF-8 estrito; se falhar
 * (Excel em português costuma salvar em Windows-1252), usa Windows-1252.
 */
export function decodificarTextoCsv(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u8).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(u8);
  }
}

// ---------------------------------------------------------------- CSV: importação

export const CAMPOS_IMPORTACAO = [
  "codigoBarras",
  "codigoInterno",
  "nome",
  "descricao",
  "categoria",
  "unidade",
  "precoVenda",
  "precoCusto",
  "estoque",
  "estoqueMinimo",
] as const;

export type CampoImportacao = (typeof CAMPOS_IMPORTACAO)[number];

export const ROTULO_CAMPO_IMPORTACAO: Record<CampoImportacao, string> = {
  codigoBarras: "Código de barras",
  codigoInterno: "Código interno",
  nome: "Nome",
  descricao: "Descrição",
  categoria: "Categoria",
  unidade: "Unidade",
  precoVenda: "Preço de venda",
  precoCusto: "Preço de custo",
  estoque: "Estoque",
  estoqueMinimo: "Estoque mínimo",
};

export const CAMPOS_OBRIGATORIOS_IMPORTACAO: CampoImportacao[] = ["nome", "precoVenda"];

/** Índice da coluna de cada campo reconhecido no cabeçalho. */
export type MapaColunas = Partial<Record<CampoImportacao, number>>;

/** "Código de Barras (EAN)" -> "codigo_de_barras_ean" */
export function normalizarCabecalho(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const CABECALHOS_EXATOS: Record<string, CampoImportacao> = {
  codigo: "codigoBarras",
  cod: "codigoBarras",
  codigo_barras: "codigoBarras",
  codigo_de_barras: "codigoBarras",
  cod_barras: "codigoBarras",
  barras: "codigoBarras",
  ean: "codigoBarras",
  ean13: "codigoBarras",
  ean_13: "codigoBarras",
  gtin: "codigoBarras",
  upc: "codigoBarras",
  codigo_ean: "codigoBarras",
  codigo_produto: "codigoBarras",
  codigo_interno: "codigoInterno",
  cod_interno: "codigoInterno",
  sku: "codigoInterno",
  referencia: "codigoInterno",
  ref: "codigoInterno",
  plu: "codigoInterno",
  nome: "nome",
  produto: "nome",
  descricao: "nome",
  nome_produto: "nome",
  nome_do_produto: "nome",
  item: "nome",
  mercadoria: "nome",
  desc: "nome",
  detalhes: "descricao",
  observacao: "descricao",
  observacoes: "descricao",
  obs: "descricao",
  descricao_detalhada: "descricao",
  descricao_completa: "descricao",
  categoria: "categoria",
  grupo: "categoria",
  secao: "categoria",
  departamento: "categoria",
  setor: "categoria",
  familia: "categoria",
  unidade: "unidade",
  un: "unidade",
  und: "unidade",
  unid: "unidade",
  um: "unidade",
  unidade_medida: "unidade",
  unidade_de_medida: "unidade",
  medida: "unidade",
  tipo_unidade: "unidade",
  preco: "precoVenda",
  preco_venda: "precoVenda",
  preco_de_venda: "precoVenda",
  valor: "precoVenda",
  valor_venda: "precoVenda",
  valor_de_venda: "precoVenda",
  venda: "precoVenda",
  preco_unitario: "precoVenda",
  pvenda: "precoVenda",
  vlr_venda: "precoVenda",
  preco_r: "precoVenda",
  custo: "precoCusto",
  preco_custo: "precoCusto",
  preco_de_custo: "precoCusto",
  valor_custo: "precoCusto",
  custo_medio: "precoCusto",
  custo_unitario: "precoCusto",
  vlr_custo: "precoCusto",
  pcusto: "precoCusto",
  estoque: "estoque",
  quantidade: "estoque",
  qtd: "estoque",
  qtde: "estoque",
  saldo: "estoque",
  estoque_atual: "estoque",
  estoque_inicial: "estoque",
  qtd_estoque: "estoque",
  quantidade_estoque: "estoque",
  estoque_minimo: "estoqueMinimo",
  minimo: "estoqueMinimo",
  est_minimo: "estoqueMinimo",
  estoque_min: "estoqueMinimo",
  qtd_minima: "estoqueMinimo",
  quantidade_minima: "estoqueMinimo",
  ponto_de_pedido: "estoqueMinimo",
};

/** Reconhece um nome de coluna, por nome exato e depois por palavras-chave. */
export function reconhecerCabecalho(texto: string): CampoImportacao | null {
  const n = normalizarCabecalho(texto);
  if (!n) return null;
  const exato = CABECALHOS_EXATOS[n];
  if (exato) return exato;

  const p = ` ${n.replace(/_/g, " ")} `;
  const tem = (re: RegExp) => re.test(p);
  if (tem(/promo/)) return null; // promoção não entra pela importação
  if (tem(/minim/)) return "estoqueMinimo";
  if (tem(/custo/)) return "precoCusto";
  if (tem(/interno| sku | ref | referencia | plu /)) return "codigoInterno";
  if (tem(/barra|ean|gtin|upc/)) return "codigoBarras";
  if (tem(/codigo| cod /)) return "codigoBarras";
  if (tem(/preco|valor|venda/)) return "precoVenda";
  if (tem(/estoque|quantidade| qtd| saldo/)) return "estoque";
  if (tem(/categoria|grupo|secao|departamento|setor/)) return "categoria";
  if (tem(/unidade|medida/)) return "unidade";
  if (tem(/nome|descricao|produto|item/)) return "nome";
  return null;
}

/**
 * Mapeia cabeçalhos pra campos. Primeira coluna reconhecida vence; se o
 * arquivo tem "nome" e "descrição", a descrição vira o campo descricao.
 */
export function mapearCabecalhos(cabecalhos: ReadonlyArray<string>): { mapa: MapaColunas; ignorados: string[] } {
  const mapa: MapaColunas = {};
  const ignorados: string[] = [];
  const pareceDescricao = (c: string) => /desc/.test(normalizarCabecalho(c));

  cabecalhos.forEach((cabecalho, i) => {
    const campo = reconhecerCabecalho(cabecalho);
    if (!campo) {
      if (cabecalho.trim()) ignorados.push(cabecalho);
      return;
    }
    if (mapa[campo] === undefined) {
      mapa[campo] = i;
      return;
    }
    if (campo === "nome" && mapa.descricao === undefined) {
      const anterior = cabecalhos[mapa.nome!];
      if (pareceDescricao(cabecalho)) {
        mapa.descricao = i;
        return;
      }
      if (pareceDescricao(anterior)) {
        mapa.descricao = mapa.nome;
        mapa.nome = i;
        return;
      }
    }
    ignorados.push(cabecalho);
  });

  return { mapa, ignorados };
}

/**
 * Limpa um código vindo de planilha: tira espaços e apóstrofo do Excel,
 * expande notação científica ("7.89123E+12") e remove ",0" final.
 */
export function normalizarCodigo(texto: string): string {
  let s = texto.trim().replace(/\s+/g, "").replace(/^'+/, "");
  if (s === "") return "";
  const cientifico = /^(\d+)(?:[.,](\d+))?[eE]\+?(\d+)$/.exec(s);
  if (cientifico) {
    const inteiro = cientifico[1];
    const fracao = cientifico[2] ?? "";
    const expoente = Number(cientifico[3]);
    if (fracao.length <= expoente) s = inteiro + fracao + "0".repeat(expoente - fracao.length);
  }
  return s.replace(/[.,]0+$/, "");
}

/**
 * Mesma tolerância de buscarProdutoPorCodigo() em lib/consultas: UPC-A de 12
 * dígitos também casa com o EAN-13 de zero à esquerda, e vice-versa.
 */
export function variantesCodigoBarras(codigo: string): string[] {
  if (/^\d{12}$/.test(codigo)) return [codigo, `0${codigo}`];
  if (/^0\d{12}$/.test(codigo)) return [codigo, codigo.slice(1)];
  return [codigo];
}

export type ProdutoIndexavel = {
  id: number;
  codigoBarras: string | null;
  codigoInterno: string | null;
  nome: string;
};

/**
 * Índice em memória dos produtos existentes pra importação. Trata código de
 * barras e código interno como um único espaço de códigos, igual ao caixa
 * (buscarProdutoPorCodigo procura o que foi bipado nos dois campos).
 */
export class IndiceProdutos<P extends ProdutoIndexavel> {
  private readonly porBarras = new Map<string, P>();
  private readonly porInterno = new Map<string, P>();
  private readonly porNome = new Map<string, P>();

  constructor(produtos: Iterable<P> = []) {
    for (const p of produtos) this.indexar(p);
  }

  indexar(p: P): void {
    if (p.codigoBarras) this.porBarras.set(p.codigoBarras, p);
    if (p.codigoInterno) this.porInterno.set(p.codigoInterno, p);
    const chave = normalizarTexto(p.nome);
    if (!this.porNome.has(chave)) this.porNome.set(chave, p);
  }

  /** Produto dono do código em qualquer campo, com tolerância ao zero à esquerda do EAN/UPC. */
  porCodigo(codigo: string): P | undefined {
    for (const v of variantesCodigoBarras(codigo)) {
      const p = this.porBarras.get(v);
      if (p) return p;
    }
    return this.porInterno.get(codigo);
  }

  /**
   * Produto que a linha da planilha atualiza: código exato no campo homônimo,
   * depois o mesmo código em qualquer campo, depois o nome (só quando a linha
   * não traz código nenhum). undefined = produto novo.
   */
  alvoDaLinha(linha: { codigoBarras: string | null; codigoInterno: string | null; nome: string }): P | undefined {
    const barras = linha.codigoBarras;
    const interno = linha.codigoInterno;
    if (!barras && !interno) return this.porNome.get(normalizarTexto(linha.nome));
    return (
      (barras ? this.porBarras.get(barras) : undefined) ??
      (interno ? this.porInterno.get(interno) : undefined) ??
      (barras ? this.porCodigo(barras) : undefined) ??
      (interno ? this.porCodigo(interno) : undefined)
    );
  }

  /** O código já é deste produto, em qualquer um dos dois campos. */
  codigoEhDoProduto(codigo: string, produto: P): boolean {
    return (
      (produto.codigoBarras !== null && variantesCodigoBarras(codigo).includes(produto.codigoBarras)) ||
      produto.codigoInterno === codigo
    );
  }

  /** O código pertence a algum outro produto (qualquer campo) que não o informado. */
  ocupadoPorOutro(codigo: string, id: number): boolean {
    for (const v of variantesCodigoBarras(codigo)) {
      const p = this.porBarras.get(v);
      if (p && p.id !== id) return true;
    }
    const q = this.porInterno.get(codigo);
    return q !== undefined && q.id !== id;
  }
}

const UNIDADES_UN = new Set([
  "un", "und", "unid", "unidade", "unidades", "u", "pc", "pcs", "peca", "pecas", "pct", "pacote",
  "cx", "caixa", "fd", "fardo", "garrafa", "lata", "saco", "lt", "l", "litro", "dz", "duzia", "pote", "frasco",
]);
const UNIDADES_KG = new Set(["kg", "kgs", "quilo", "quilos", "kilo", "kilos", "quilograma", "quilogramas", "k", "peso", "g", "gr", "grama", "gramas"]);

export function parseUnidade(texto: string): Unidade | null {
  const t = normalizarTexto(texto).replace(/[^a-z]/g, "");
  if (!t) return null;
  if (UNIDADES_UN.has(t)) return "UN";
  if (UNIDADES_KG.has(t)) return "KG";
  return null;
}

export type LinhaImportacao = {
  numero: number;
  codigoBarras: string | null;
  codigoInterno: string | null;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  unidade: Unidade;
  precoVenda: number;
  precoCusto: number | null;
  estoque: number | null;
  estoqueMinimo: number | null;
};

export type LinhaAnalisada = {
  /** Número da linha no arquivo (cabeçalho = 1). */
  numero: number;
  /** Texto bruto de cada coluna reconhecida, pra mostrar na pré-visualização. */
  valores: Partial<Record<CampoImportacao, string>>;
  dados: LinhaImportacao | null;
  erros: string[];
};

/** Valida uma linha do CSV já mapeada. Todos os erros da linha são listados. */
export function validarLinha(celulas: ReadonlyArray<string>, mapa: MapaColunas, numero: number): LinhaAnalisada {
  // Um apóstrofo no começo é proteção contra fórmula (nossa exportação ou o
  // próprio Excel), não faz parte do valor.
  const ler = (c: CampoImportacao) => {
    const i = mapa[c];
    return i === undefined ? "" : (celulas[i] ?? "").trim().replace(/^'/, "");
  };
  const valores: Partial<Record<CampoImportacao, string>> = {};
  for (const c of CAMPOS_IMPORTACAO) if (mapa[c] !== undefined) valores[c] = ler(c);

  const erros: string[] = [];

  const nome = ler("nome");
  if (!nome) erros.push("Nome vazio.");
  else if (nome.length > 120) erros.push("Nome com mais de 120 caracteres.");

  const codigoBarras = normalizarCodigo(ler("codigoBarras"));
  if (codigoBarras && !codigoBarrasValido(codigoBarras)) erros.push(`Código de barras "${codigoBarras}" inválido.`);

  const codigoInterno = ler("codigoInterno");
  if (codigoInterno.length > 30) erros.push("Código interno com mais de 30 caracteres.");

  const unidadeTexto = ler("unidade");
  const unidade = unidadeTexto === "" ? "UN" : parseUnidade(unidadeTexto);
  if (!unidade) erros.push(`Unidade "${unidadeTexto}" não reconhecida. Use UN ou KG.`);

  const precoTexto = ler("precoVenda");
  const precoVenda = parseReais(precoTexto);
  if (precoVenda === null || precoVenda <= 0) {
    erros.push(precoTexto ? `Preço de venda "${precoTexto}" inválido.` : "Preço de venda vazio.");
  }

  const custoTexto = ler("precoCusto");
  let precoCusto: number | null = null;
  if (custoTexto !== "") {
    precoCusto = parseReais(custoTexto);
    if (precoCusto === null || precoCusto < 0) erros.push(`Preço de custo "${custoTexto}" inválido.`);
  }

  const lerQuantidade = (campo: "estoque" | "estoqueMinimo", rotulo: string): number | null => {
    const texto = ler(campo);
    if (texto === "") return null;
    const q = parseQuantidade(texto);
    if (q === null || q < 0) {
      erros.push(`${rotulo} "${texto}" inválido.`);
      return null;
    }
    if (unidade === "UN" && q % MIL !== 0) {
      erros.push(`${rotulo} precisa ser um número inteiro pra produto vendido por unidade.`);
      return null;
    }
    return q;
  };
  const estoque = lerQuantidade("estoque", "Estoque");
  const estoqueMinimo = lerQuantidade("estoqueMinimo", "Estoque mínimo");

  const categoria = ler("categoria");
  if (categoria.length > 60) erros.push("Nome da categoria com mais de 60 caracteres.");

  const descricao = ler("descricao").slice(0, 500);

  const dados: LinhaImportacao | null =
    erros.length === 0 && unidade && precoVenda !== null
      ? {
          numero,
          codigoBarras: codigoBarras || null,
          codigoInterno: codigoInterno || null,
          nome,
          descricao: descricao || null,
          categoria: categoria || null,
          unidade,
          precoVenda,
          precoCusto,
          estoque,
          estoqueMinimo,
        }
      : null;

  return { numero, valores, dados, erros };
}

export type AnaliseCsv = {
  separador: Separador;
  cabecalhos: string[];
  mapa: MapaColunas;
  colunasIgnoradas: string[];
  camposFaltando: CampoImportacao[];
  /** Problema que impede a importação inteira (sem cabeçalho, sem coluna de nome...). */
  erroGeral: string | null;
  linhas: LinhaAnalisada[];
  total: number;
  validas: number;
  comErro: number;
};

/** Pipeline completo: texto do arquivo -> linhas validadas e resumo. */
export function analisarCsv(texto: string): AnaliseCsv {
  const separador = detectarSeparador(texto);
  const tabela = parseCsv(texto, separador);
  const vazio: AnaliseCsv = {
    separador,
    cabecalhos: [],
    mapa: {},
    colunasIgnoradas: [],
    camposFaltando: [...CAMPOS_OBRIGATORIOS_IMPORTACAO],
    erroGeral: "O arquivo está vazio.",
    linhas: [],
    total: 0,
    validas: 0,
    comErro: 0,
  };
  if (tabela.length === 0) return vazio;

  const [cabecalhos, ...corpo] = tabela;
  const { mapa, ignorados } = mapearCabecalhos(cabecalhos);
  const camposFaltando = CAMPOS_OBRIGATORIOS_IMPORTACAO.filter((c) => mapa[c] === undefined);

  let erroGeral: string | null = null;
  if (camposFaltando.length) {
    const nomes = camposFaltando.map((c) => `"${ROTULO_CAMPO_IMPORTACAO[c]}"`).join(" e ");
    erroGeral = `Não encontrei a coluna ${nomes}. A primeira linha do arquivo precisa ter os nomes das colunas (ex.: codigo, nome, categoria, unidade, preco, custo, estoque).`;
  } else if (corpo.length === 0) {
    erroGeral = "O arquivo só tem a linha de cabeçalho, sem produtos.";
  }

  const linhas = erroGeral ? [] : corpo.map((celulas, i) => validarLinha(celulas, mapa, i + 2));
  const validas = linhas.filter((l) => l.dados !== null).length;

  return {
    separador,
    cabecalhos,
    mapa,
    colunasIgnoradas: ignorados,
    camposFaltando,
    erroGeral,
    linhas,
    total: linhas.length,
    validas,
    comErro: linhas.length - validas,
  };
}

// ---------------------------------------------------------------- CSV: exportação

export const CABECALHO_EXPORTACAO = [
  "id",
  "codigo_barras",
  "codigo_interno",
  "nome",
  "descricao",
  "categoria",
  "unidade",
  "preco_venda",
  "preco_custo",
  "preco_promocional",
  "promocao_ate",
  "estoque",
  "estoque_minimo",
  "controla_validade",
  "ativo",
  "criado_em",
] as const;

/** Cabeçalho do modelo pra quem vai montar a planilha do zero (só o que a importação lê). */
export const CABECALHO_MODELO = ["codigo_barras", "codigo_interno", "nome", "descricao", "categoria", "unidade", "preco_venda", "preco_custo", "estoque", "estoque_minimo"] as const;

export const LINHAS_EXEMPLO_MODELO: string[][] = [
  ["7891000100103", "", "Leite integral 1L", "", "Frios e laticínios", "UN", "5,49", "4,10", "24", "6"],
  ["", "BAN01", "Banana prata", "Vendida por peso", "Hortifruti", "KG", "6,99", "3,80", "12,500", "3"],
];

export type ProdutoExportacao = {
  id: number;
  codigoBarras: string | null;
  codigoInterno: string | null;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  unidade: Unidade;
  precoVenda: number;
  precoCusto: number;
  precoPromocional: number | null;
  promocaoAte: Date | null;
  estoque: number;
  estoqueMinimo: number;
  controlaValidade: boolean;
  ativo: boolean;
  criadoEm: Date;
};

/** Uma linha da exportação, na ordem de CABECALHO_EXPORTACAO. Números no formato brasileiro. */
export function linhaExportacao(p: ProdutoExportacao): string[] {
  return [
    String(p.id),
    p.codigoBarras ?? "",
    p.codigoInterno ?? "",
    p.nome,
    p.descricao ?? "",
    p.categoria ?? "",
    p.unidade,
    formatarReais(p.precoVenda, false),
    formatarReais(p.precoCusto, false),
    p.precoPromocional !== null ? formatarReais(p.precoPromocional, false) : "",
    p.promocaoAte ? formatarData(p.promocaoAte) : "",
    formatarQuantidade(p.estoque, p.unidade),
    formatarQuantidade(p.estoqueMinimo, p.unidade),
    p.controlaValidade ? "sim" : "não",
    p.ativo ? "sim" : "não",
    formatarDataHora(p.criadoEm),
  ];
}

// ---------------------------------------------------------------- navegação

/** Só aceita caminho interno ("/pdv"). Qualquer outra coisa cai no padrão. */
export function destinoSeguro(voltar: string | null | undefined, padrao = "/produtos"): string {
  if (!voltar) return padrao;
  const v = voltar.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /\s/.test(v) || v.includes("://")) return padrao;
  return v;
}

// ---------------------------------------------------------------- esquemas dos formulários

function issue(ctx: { addIssue: (i: { code: "custom"; message: string }) => void }, message: string): typeof z.NEVER {
  ctx.addIssue({ code: "custom", message });
  return z.NEVER;
}

/** Texto de EntradaMoeda ("12,50") -> centavos. Vazio ou zero vira null. */
function moedaOpcional(mensagem: string) {
  return z.string().transform((texto, ctx) => {
    const t = texto.trim();
    if (t === "") return null;
    const centavos = parseReais(t);
    if (centavos === null || centavos < 0) return issue(ctx, mensagem);
    return centavos === 0 ? null : centavos;
  });
}

function moedaObrigatoria(mensagem: string) {
  return z.string().transform((texto, ctx) => {
    const centavos = parseReais(texto.trim());
    if (centavos === null || centavos < 0) return issue(ctx, mensagem);
    return centavos;
  });
}

/** Texto ("2", "0,350") -> milésimos. Vazio vira null. */
function quantidadeOpcional(mensagem: string) {
  return z.string().transform((texto, ctx) => {
    const t = texto.trim();
    if (t === "") return null;
    const q = parseQuantidade(t);
    if (q === null || q < 0) return issue(ctx, mensagem);
    return q;
  });
}

function textoOpcional(max: number, mensagemMax: string) {
  return z
    .string()
    .trim()
    .max(max, mensagemMax)
    .transform((v) => (v === "" ? null : v));
}

export const esquemaProduto = z
  .object({
    id: z.number().int().positive().nullable(),
    codigoBarras: z.string().transform((texto, ctx) => {
      const c = normalizarCodigo(texto);
      if (c === "") return null;
      if (!codigoBarrasValido(c)) {
        return issue(ctx, "Código de barras inválido. Confira os dígitos (EAN-8, EAN-13 ou UPC) ou use só números.");
      }
      return c;
    }),
    codigoInterno: textoOpcional(30, "Código interno muito longo (máximo 30 caracteres)."),
    nome: z.string().trim().min(1, "Informe o nome do produto.").max(120, "Nome muito longo (máximo 120 caracteres)."),
    descricao: textoOpcional(500, "Descrição muito longa (máximo 500 caracteres)."),
    categoriaId: z.string().transform((texto, ctx) => {
      const t = texto.trim();
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isInteger(n) || n <= 0) return issue(ctx, "Categoria inválida.");
      return n;
    }),
    unidade: z.enum(["UN", "KG"], { error: "Escolha como o produto é vendido: por unidade ou por quilo." }),
    precoVenda: moedaObrigatoria("Informe o preço de venda."),
    /** null = campo não enviado (operador não edita custo). */
    precoCusto: z
      .string()
      .nullable()
      .transform((texto, ctx) => {
        if (texto === null) return null;
        const t = texto.trim();
        if (t === "") return 0;
        const centavos = parseReais(t);
        if (centavos === null || centavos < 0) return issue(ctx, "Preço de custo inválido.");
        return centavos;
      }),
    precoPromocional: moedaOpcional("Preço promocional inválido."),
    promocaoAte: z.string().transform((texto, ctx) => {
      const t = texto.trim();
      if (t === "") return null;
      const d = parseDataInput(t);
      if (!d) return issue(ctx, "Data da promoção inválida.");
      return limitesDoDia(d).fim;
    }),
    estoqueInicial: quantidadeOpcional("Estoque inicial inválido. Use números, por exemplo 10 ou 2,500."),
    estoqueMinimo: quantidadeOpcional("Estoque mínimo inválido. Use números, por exemplo 5 ou 1,500.").transform((v) => v ?? 0),
    controlaValidade: z.boolean(),
    ativo: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (d.precoVenda <= 0) {
      ctx.addIssue({ code: "custom", path: ["precoVenda"], message: "O preço de venda precisa ser maior que zero." });
    }
    if (!promocaoCabeNoPreco(d.precoPromocional, d.precoVenda)) {
      ctx.addIssue({
        code: "custom",
        path: ["precoPromocional"],
        message: "O preço promocional precisa ser menor que o preço de venda.",
      });
    }
    if (d.promocaoAte !== null && d.precoPromocional === null) {
      ctx.addIssue({
        code: "custom",
        path: ["precoPromocional"],
        message: "Informe o preço promocional ou apague a data da promoção.",
      });
    }
    if (d.unidade === "UN") {
      if (d.estoqueInicial !== null && d.estoqueInicial % MIL !== 0) {
        ctx.addIssue({
          code: "custom",
          path: ["estoqueInicial"],
          message: "Produto vendido por unidade: o estoque precisa ser um número inteiro.",
        });
      }
      if (d.estoqueMinimo % MIL !== 0) {
        ctx.addIssue({
          code: "custom",
          path: ["estoqueMinimo"],
          message: "Produto vendido por unidade: o estoque mínimo precisa ser um número inteiro.",
        });
      }
    }
  });

export type DadosProduto = z.output<typeof esquemaProduto>;

export const esquemaCategoria = z.object({
  id: z.number().int().positive().nullable(),
  nome: z.string().trim().min(1, "Informe o nome da categoria.").max(60, "Nome muito longo (máximo 60 caracteres)."),
  cor: z.string().transform((texto, ctx) => {
    const t = texto.trim().toLowerCase();
    if (t === "") return null;
    if (!/^#[0-9a-f]{6}$/.test(t)) return issue(ctx, "Cor inválida.");
    return t;
  }),
  ordem: z.string().transform((texto, ctx) => {
    const t = texto.trim();
    if (t === "") return 0;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 9999) return issue(ctx, "Ordem inválida. Use um número inteiro de 0 a 9999.");
    return n;
  }),
});

export type DadosCategoria = z.output<typeof esquemaCategoria>;
