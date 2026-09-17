import { describe, expect, it } from "vitest";
import {
  IndiceProdutos,
  analisarCsv,
  decodificarTextoCsv,
  destinoSeguro,
  detectarSeparador,
  esquemaCategoria,
  esquemaProduto,
  estoqueAbaixoDoMinimo,
  gerarCsv,
  intervaloPagina,
  lerFiltrosProdutos,
  linhaExportacao,
  mapearCabecalhos,
  montarQueryProdutos,
  neutralizarFormulaCsv,
  normalizarCabecalho,
  normalizarCodigo,
  parseCsv,
  parseUnidade,
  promocaoCabeNoPreco,
  promocaoVigente,
  reconhecerCabecalho,
  sugerirPrecoPorMargem,
  sugerirPrecoPorMarkup,
  totalPaginas,
  validarLinha,
  valorEstoqueACusto,
  variantesCodigoBarras,
  type ProdutoIndexavel,
} from "@/lib/servicos/produtos-calculos";
import { margemPontosBase } from "@/lib/dinheiro";

// ---------------------------------------------------------------- CSV

describe("detectarSeparador", () => {
  it("escolhe o separador mais frequente na primeira linha", () => {
    expect(detectarSeparador("codigo;nome;preco\n1;Arroz;5,00")).toBe(";");
    expect(detectarSeparador("codigo,nome,preco\n1,Arroz,5.00")).toBe(",");
    expect(detectarSeparador("codigo\tnome\tpreco")).toBe("\t");
  });

  it("ignora separadores dentro de aspas e favorece ; no empate", () => {
    expect(detectarSeparador('"a,b";"c,d"')).toBe(";");
    expect(detectarSeparador("nome")).toBe(";");
  });

  it("pula linhas vazias e BOM no começo", () => {
    expect(detectarSeparador("﻿\n\ncodigo,nome\n")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("lê campos simples com ; e quebras CRLF", () => {
    expect(parseCsv("a;b;c\r\n1;2;3\r\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("respeita aspas: separador, quebra de linha e aspas duplicadas dentro do campo", () => {
    const texto = 'nome;desc\n"Arroz; tipo 1";"Linha 1\nLinha 2"\n"Ele disse ""oi""";x';
    expect(parseCsv(texto)).toEqual([
      ["nome", "desc"],
      ["Arroz; tipo 1", "Linha 1\nLinha 2"],
      ['Ele disse "oi"', "x"],
    ]);
  });

  it("trata aspas no meio de campo sem aspas como texto comum", () => {
    expect(parseCsv('a;b\nTubo 5" polegadas;1')).toEqual([
      ["a", "b"],
      ['Tubo 5" polegadas', "1"],
    ]);
  });

  it("descarta linhas totalmente vazias e remove o BOM", () => {
    expect(parseCsv("﻿a;b\n\n;\n1;2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("aceita separador forçado", () => {
    expect(parseCsv("a,b;c\n1,2;3", ",")).toEqual([
      ["a", "b;c"],
      ["1", "2;3"],
    ]);
  });
});

describe("gerarCsv", () => {
  it("coloca aspas só onde precisa e escapa aspas internas", () => {
    const csv = gerarCsv([
      ["nome", "obs"],
      ["Arroz", "sem"],
      ["Feijão; preto", 'Marca "Boa"'],
      ["Linha\nquebrada", ""],
    ]);
    expect(csv).toBe('nome;obs\r\nArroz;sem\r\n"Feijão; preto";"Marca ""Boa"""\r\n"Linha\nquebrada";\r\n');
  });

  it("adiciona BOM quando pedido e gera vazio pra lista vazia", () => {
    expect(gerarCsv([["a"]], ";", true).charCodeAt(0)).toBe(0xfeff);
    expect(gerarCsv([])).toBe("");
  });

  it("o que gera, o parse lê de volta igual", () => {
    const linhas = [
      ["a", "b"],
      ['x;"y"', "z\nw"],
    ];
    expect(parseCsv(gerarCsv(linhas))).toEqual(linhas);
  });

  it("neutraliza célula que o Excel leria como fórmula, sem mexer em número", () => {
    expect(neutralizarFormulaCsv('=HYPERLINK("http://x";"clique")')).toBe("'=HYPERLINK(\"http://x\";\"clique\")");
    expect(neutralizarFormulaCsv("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(neutralizarFormulaCsv("-Coca Cola 2L")).toBe("'-Coca Cola 2L");
    expect(neutralizarFormulaCsv("+Leve")).toBe("'+Leve");
    expect(neutralizarFormulaCsv("@mercado")).toBe("'@mercado");
    expect(neutralizarFormulaCsv("\t=1+1")).toBe("'\t=1+1");
    expect(neutralizarFormulaCsv("\r=1+1")).toBe("'\r=1+1");
    // números com sinal continuam números (estoque negativo, variação em %)
    expect(neutralizarFormulaCsv("-3")).toBe("-3");
    expect(neutralizarFormulaCsv("-12,5")).toBe("-12,5");
    expect(neutralizarFormulaCsv("+5.49")).toBe("+5.49");
    // texto comum passa direto
    expect(neutralizarFormulaCsv("Arroz")).toBe("Arroz");
    expect(neutralizarFormulaCsv("Coca Cola -2L")).toBe("Coca Cola -2L");
    expect(neutralizarFormulaCsv("")).toBe("");
  });

  it("gerarCsv aplica a proteção e coloca a célula entre aspas", () => {
    const csv = gerarCsv([
      ["nome", "estoque"],
      ["=1+1", "-3"],
      ["-Coca Cola 2L", "2"],
    ]);
    expect(csv).toBe("nome;estoque\r\n\"'=1+1\";-3\r\n\"'-Coca Cola 2L\";2\r\n");
  });
});

describe("decodificarTextoCsv", () => {
  it("lê UTF-8 e tira o BOM", () => {
    const bytes = new TextEncoder().encode("﻿nome;preço\nPão;1,00");
    expect(decodificarTextoCsv(bytes)).toBe("nome;preço\nPão;1,00");
  });

  it("cai pra Windows-1252 quando o arquivo veio do Excel antigo", () => {
    // "Pão" em Windows-1252: P=0x50, ã=0xE3, o=0x6F
    const bytes = new Uint8Array([0x50, 0xe3, 0x6f]);
    expect(decodificarTextoCsv(bytes)).toBe("Pão");
  });
});

// ---------------------------------------------------------------- cabeçalhos

describe("normalizarCabecalho / reconhecerCabecalho", () => {
  it("normaliza acentos, espaços e símbolos", () => {
    expect(normalizarCabecalho("Código de Barras (EAN)")).toBe("codigo_de_barras_ean");
    expect(normalizarCabecalho("  Preço R$ ")).toBe("preco_r");
  });

  it("reconhece os nomes flexíveis do contrato", () => {
    expect(reconhecerCabecalho("codigo")).toBe("codigoBarras");
    expect(reconhecerCabecalho("codigo_barras")).toBe("codigoBarras");
    expect(reconhecerCabecalho("EAN")).toBe("codigoBarras");
    expect(reconhecerCabecalho("Código de Barras (EAN)")).toBe("codigoBarras");
    expect(reconhecerCabecalho("nome")).toBe("nome");
    expect(reconhecerCabecalho("Descrição")).toBe("nome");
    expect(reconhecerCabecalho("categoria")).toBe("categoria");
    expect(reconhecerCabecalho("Unidade")).toBe("unidade");
    expect(reconhecerCabecalho("preco")).toBe("precoVenda");
    expect(reconhecerCabecalho("Preço de venda")).toBe("precoVenda");
    expect(reconhecerCabecalho("custo")).toBe("precoCusto");
    expect(reconhecerCabecalho("preco_custo")).toBe("precoCusto");
    expect(reconhecerCabecalho("estoque")).toBe("estoque");
    expect(reconhecerCabecalho("Estoque Mínimo")).toBe("estoqueMinimo");
    expect(reconhecerCabecalho("SKU")).toBe("codigoInterno");
    expect(reconhecerCabecalho("Cód. Interno")).toBe("codigoInterno");
  });

  it("prioriza palavras mais específicas e ignora promoção", () => {
    expect(reconhecerCabecalho("Qtd mínima em estoque")).toBe("estoqueMinimo");
    expect(reconhecerCabecalho("Valor de custo")).toBe("precoCusto");
    expect(reconhecerCabecalho("preco_promocional")).toBeNull();
    expect(reconhecerCabecalho("id")).toBeNull();
    expect(reconhecerCabecalho("")).toBeNull();
  });
});

describe("mapearCabecalhos", () => {
  it("mapeia por índice e lista colunas ignoradas", () => {
    const { mapa, ignorados } = mapearCabecalhos(["ean", "nome", "categoria", "preco", "custo", "estoque", "fornecedor"]);
    expect(mapa).toEqual({ codigoBarras: 0, nome: 1, categoria: 2, precoVenda: 3, precoCusto: 4, estoque: 5 });
    expect(ignorados).toEqual(["fornecedor"]);
  });

  it("quando há nome e descrição, descrição vira o campo descricao", () => {
    expect(mapearCabecalhos(["nome", "descricao", "preco"]).mapa).toEqual({ nome: 0, descricao: 1, precoVenda: 2 });
    expect(mapearCabecalhos(["descricao", "nome", "preco"]).mapa).toEqual({ descricao: 0, nome: 1, precoVenda: 2 });
  });

  it("só descrição (sem nome) vira nome", () => {
    expect(mapearCabecalhos(["descricao", "preco"]).mapa).toEqual({ nome: 0, precoVenda: 1 });
  });

  it("coluna repetida: a primeira vence e a outra é ignorada", () => {
    const { mapa, ignorados } = mapearCabecalhos(["preco", "valor", "nome"]);
    expect(mapa).toEqual({ precoVenda: 0, nome: 2 });
    expect(ignorados).toEqual(["valor"]);
  });
});

// ---------------------------------------------------------------- códigos e unidades

describe("normalizarCodigo", () => {
  it("tira espaços e apóstrofo do Excel", () => {
    expect(normalizarCodigo(" 789 123 ")).toBe("789123");
    expect(normalizarCodigo("'7891234567895")).toBe("7891234567895");
  });

  it("expande notação científica do Excel", () => {
    expect(normalizarCodigo("7.891234567895E+12")).toBe("7891234567895");
    expect(normalizarCodigo("7,89E+12")).toBe("7890000000000");
    expect(normalizarCodigo("7.89123456789512E+3")).toBe("7.89123456789512E+3");
  });

  it("remove ,0 ou .0 final e mantém vazio", () => {
    expect(normalizarCodigo("7891234567895.0")).toBe("7891234567895");
    expect(normalizarCodigo("")).toBe("");
  });
});

describe("parseUnidade", () => {
  it("reconhece variações de unidade e quilo", () => {
    expect(parseUnidade("UN")).toBe("UN");
    expect(parseUnidade("unidade")).toBe("UN");
    expect(parseUnidade("Pç")).toBe("UN");
    expect(parseUnidade("cx")).toBe("UN");
    expect(parseUnidade("KG")).toBe("KG");
    expect(parseUnidade("Quilo")).toBe("KG");
    expect(parseUnidade("kg.")).toBe("KG");
    expect(parseUnidade("g")).toBe("KG");
  });

  it("devolve null pro que não conhece", () => {
    expect(parseUnidade("")).toBeNull();
    expect(parseUnidade("metro")).toBeNull();
  });
});

// ---------------------------------------------------------------- validação de linha

describe("validarLinha", () => {
  const mapa = mapearCabecalhos(["codigo", "nome", "categoria", "unidade", "preco", "custo", "estoque", "estoque_minimo"]).mapa;

  it("converte uma linha boa em dados prontos pro banco", () => {
    const r = validarLinha(["7891000100103", "Leite integral 1L", "Laticínios", "UN", "5,49", "R$ 4,10", "24", "6"], mapa, 2);
    expect(r.erros).toEqual([]);
    expect(r.dados).toEqual({
      numero: 2,
      codigoBarras: "7891000100103",
      codigoInterno: null,
      nome: "Leite integral 1L",
      descricao: null,
      categoria: "Laticínios",
      unidade: "UN",
      precoVenda: 549,
      precoCusto: 410,
      estoque: 24000,
      estoqueMinimo: 6000,
    });
  });

  it("aceita quilo com quantidade fracionada e campos opcionais vazios", () => {
    const r = validarLinha(["", "Banana prata", "", "kg", "6,99", "", "12,500", ""], mapa, 3);
    expect(r.erros).toEqual([]);
    expect(r.dados).toMatchObject({
      codigoBarras: null,
      unidade: "KG",
      precoVenda: 699,
      precoCusto: null,
      estoque: 12500,
      estoqueMinimo: null,
      categoria: null,
    });
  });

  it("unidade vazia vira UN", () => {
    const r = validarLinha(["", "Pão francês", "", "", "0,80", "", "", ""], mapa, 4);
    expect(r.dados?.unidade).toBe("UN");
  });

  it("lista todos os erros da linha", () => {
    const r = validarLinha(["7891234567890", "", "", "UN", "abc", "-1", "2,5", "x"], mapa, 5);
    expect(r.dados).toBeNull();
    expect(r.erros).toEqual([
      "Nome vazio.",
      'Código de barras "7891234567890" inválido.',
      'Preço de venda "abc" inválido.',
      'Preço de custo "-1" inválido.',
      "Estoque precisa ser um número inteiro pra produto vendido por unidade.",
      'Estoque mínimo "x" inválido.',
    ]);
  });

  it("unidade desconhecida é erro e não dispara a checagem de inteiro", () => {
    const r = validarLinha(["", "Item", "", "litro cúbico", "1,00", "", "2,5", ""], mapa, 9);
    expect(r.dados).toBeNull();
    expect(r.erros).toEqual(['Unidade "litro cúbico" não reconhecida. Use UN ou KG.']);
  });

  it("preço zero ou vazio é erro", () => {
    expect(validarLinha(["", "Item", "", "", "0", "", "", ""], mapa, 6).erros).toContain('Preço de venda "0" inválido.');
    expect(validarLinha(["", "Item", "", "", "", "", "", ""], mapa, 7).erros).toContain("Preço de venda vazio.");
  });

  it("guarda os valores brutos pra pré-visualização e tolera linha curta", () => {
    const r = validarLinha(["123", "Sal"], mapa, 8);
    expect(r.valores.codigoBarras).toBe("123");
    expect(r.valores.nome).toBe("Sal");
    expect(r.valores.precoVenda).toBe("");
    expect(r.erros).toContain("Preço de venda vazio.");
  });

  it("tira o apóstrofo de proteção contra fórmula que a exportação (ou o Excel) coloca", () => {
    const r = validarLinha(["'7891000100103", "'-Coca Cola 2L", "'=Bebidas", "UN", "'9,99", "", "", ""], mapa, 10);
    expect(r.erros).toEqual([]);
    expect(r.dados).toMatchObject({ codigoBarras: "7891000100103", nome: "-Coca Cola 2L", categoria: "=Bebidas", precoVenda: 999 });
    expect(r.valores.nome).toBe("-Coca Cola 2L");
  });

  it("exportar e importar de novo não suja nome que começa com sinal", () => {
    const csv = gerarCsv([
      ["codigo", "nome", "categoria", "unidade", "preco", "custo", "estoque", "estoque_minimo"],
      ["", "-Coca Cola 2L", "+Bebidas", "UN", "9,99", "6,00", "12", "0"],
    ]);
    const a = analisarCsv(csv);
    expect(a.erroGeral).toBeNull();
    expect(a.linhas[0].dados).toMatchObject({ nome: "-Coca Cola 2L", categoria: "+Bebidas", precoVenda: 999, estoque: 12000 });
  });
});

// ---------------------------------------------------------------- casamento de códigos na importação

describe("variantesCodigoBarras", () => {
  it("UPC-A de 12 dígitos casa com o EAN-13 de zero à esquerda e vice-versa, igual ao caixa", () => {
    expect(variantesCodigoBarras("123456789012")).toEqual(["123456789012", "0123456789012"]);
    expect(variantesCodigoBarras("0123456789012")).toEqual(["0123456789012", "123456789012"]);
    expect(variantesCodigoBarras("7891000100103")).toEqual(["7891000100103"]);
    expect(variantesCodigoBarras("10")).toEqual(["10"]);
    expect(variantesCodigoBarras("BAN01")).toEqual(["BAN01"]);
  });
});

describe("IndiceProdutos", () => {
  const paoPlu: ProdutoIndexavel = { id: 1, codigoBarras: null, codigoInterno: "10", nome: "Pão francês" };
  const leiteEan: ProdutoIndexavel = { id: 2, codigoBarras: "7891000100103", codigoInterno: null, nome: "Leite integral 1L" };
  const bananaSku: ProdutoIndexavel = { id: 3, codigoBarras: null, codigoInterno: "BAN01", nome: "Banana prata" };
  const refriUpc: ProdutoIndexavel = { id: 4, codigoBarras: "036000291452", codigoInterno: null, nome: "Refrigerante lata" };
  const soNome: ProdutoIndexavel = { id: 5, codigoBarras: null, codigoInterno: null, nome: "Sal grosso" };
  const indice = () => new IndiceProdutos<ProdutoIndexavel>([paoPlu, leiteEan, bananaSku, refriUpc, soNome]);

  it("casa código exato no campo homônimo", () => {
    const i = indice();
    expect(i.alvoDaLinha({ codigoBarras: "7891000100103", codigoInterno: null, nome: "Leite" })).toBe(leiteEan);
    expect(i.alvoDaLinha({ codigoBarras: null, codigoInterno: "BAN01", nome: "Banana" })).toBe(bananaSku);
  });

  it("coluna 'codigo' com o PLU acha o produto que tem esse valor como código interno (não duplica)", () => {
    const i = indice();
    expect(i.alvoDaLinha({ codigoBarras: "10", codigoInterno: null, nome: "Pão francês" })).toBe(paoPlu);
    // e o inverso: planilha com coluna plu/sku trazendo o código de barras
    expect(i.alvoDaLinha({ codigoBarras: null, codigoInterno: "7891000100103", nome: "Leite" })).toBe(leiteEan);
  });

  it("tolera o zero à esquerda do EAN-13/UPC-A como buscarProdutoPorCodigo", () => {
    const i = indice();
    expect(i.alvoDaLinha({ codigoBarras: "0036000291452", codigoInterno: null, nome: "Refri" })).toBe(refriUpc);
    expect(i.porCodigo("0036000291452")).toBe(refriUpc);
  });

  it("campo homônimo ganha do cruzado quando os dois casam produtos diferentes", () => {
    const i = indice();
    // linha com barras do leite e interno do pão: a barras exata vence
    expect(i.alvoDaLinha({ codigoBarras: "7891000100103", codigoInterno: "10", nome: "x" })).toBe(leiteEan);
    // barras "10" (que só existe como interno do pão) e interno "BAN01" exato: o exato vence
    expect(i.alvoDaLinha({ codigoBarras: "10", codigoInterno: "BAN01", nome: "x" })).toBe(bananaSku);
  });

  it("sem código, casa por nome normalizado; com código desconhecido, é produto novo", () => {
    const i = indice();
    expect(i.alvoDaLinha({ codigoBarras: null, codigoInterno: null, nome: "  SAL GROSSO " })).toBe(soNome);
    expect(i.alvoDaLinha({ codigoBarras: "999", codigoInterno: null, nome: "Sal grosso" })).toBeUndefined();
    expect(i.alvoDaLinha({ codigoBarras: null, codigoInterno: "NOVO", nome: "Sal grosso" })).toBeUndefined();
  });

  it("sabe se o código já é do produto (qualquer campo) ou pertence a outro", () => {
    const i = indice();
    expect(i.codigoEhDoProduto("10", paoPlu)).toBe(true);
    expect(i.codigoEhDoProduto("0036000291452", refriUpc)).toBe(true);
    expect(i.codigoEhDoProduto("10", leiteEan)).toBe(false);
    expect(i.ocupadoPorOutro("10", leiteEan.id)).toBe(true);
    expect(i.ocupadoPorOutro("10", paoPlu.id)).toBe(false);
    expect(i.ocupadoPorOutro("0036000291452", leiteEan.id)).toBe(true);
    expect(i.ocupadoPorOutro("livre", leiteEan.id)).toBe(false);
  });

  it("produto criado durante a importação passa a ser encontrado pelas linhas seguintes", () => {
    const i = indice();
    const novo: ProdutoIndexavel = { id: 6, codigoBarras: "555", codigoInterno: "N1", nome: "Novo" };
    i.indexar(novo);
    expect(i.alvoDaLinha({ codigoBarras: null, codigoInterno: "555", nome: "Novo" })).toBe(novo);
    expect(i.alvoDaLinha({ codigoBarras: "N1", codigoInterno: null, nome: "Novo" })).toBe(novo);
  });
});

describe("analisarCsv", () => {
  it("faz o pipeline completo com resumo", () => {
    const texto = ["ean;Descrição;Categoria;Un;Preço;Custo;Estoque", "7891000100103;Leite;Laticínios;UN;5,49;4,10;24", ";Banana;Hortifruti;KG;6,99;;12,5", ";;;;;;", "999;Sem preço;;UN;;;"].join("\r\n");
    const a = analisarCsv(texto);
    expect(a.erroGeral).toBeNull();
    expect(a.separador).toBe(";");
    expect(a.total).toBe(3);
    expect(a.validas).toBe(2);
    expect(a.comErro).toBe(1);
    expect(a.linhas[0].numero).toBe(2);
    expect(a.linhas[2].erros).toEqual(["Preço de venda vazio."]);
    expect(a.colunasIgnoradas).toEqual([]);
  });

  it("acusa arquivo vazio, sem coluna obrigatória e só cabeçalho", () => {
    expect(analisarCsv("").erroGeral).toBe("O arquivo está vazio.");
    const semNome = analisarCsv("codigo;preco\n1;2");
    expect(semNome.camposFaltando).toEqual(["nome"]);
    expect(semNome.erroGeral).toContain('"Nome"');
    const soCabecalho = analisarCsv("nome;preco\n");
    expect(soCabecalho.erroGeral).toBe("O arquivo só tem a linha de cabeçalho, sem produtos.");
  });

  it("lê arquivo com vírgula e aspas", () => {
    const a = analisarCsv('nome,preco,categoria\n"Arroz, tipo 1",25.90,Mercearia');
    expect(a.separador).toBe(",");
    expect(a.linhas[0].dados).toMatchObject({ nome: "Arroz, tipo 1", precoVenda: 2590, categoria: "Mercearia" });
  });
});

// ---------------------------------------------------------------- exportação

describe("linhaExportacao", () => {
  it("formata no padrão brasileiro e na ordem do cabeçalho", () => {
    const linha = linhaExportacao({
      id: 7,
      codigoBarras: "7891000100103",
      codigoInterno: null,
      nome: "Leite",
      descricao: null,
      categoria: "Laticínios",
      unidade: "UN",
      precoVenda: 549,
      precoCusto: 410,
      precoPromocional: 499,
      promocaoAte: new Date("2026-09-20T02:59:59.999Z"),
      estoque: 24000,
      estoqueMinimo: 6000,
      controlaValidade: true,
      ativo: true,
      criadoEm: new Date("2026-09-16T15:30:00Z"),
    });
    expect(linha).toEqual(["7", "7891000100103", "", "Leite", "", "Laticínios", "UN", "5,49", "4,10", "4,99", "19/09/2026", "24", "6", "sim", "sim", "16/09/2026 12:30"]);
  });

  it("exportação reimporta sem perder nome, preços e quantidades", () => {
    const csv = gerarCsv([
      ["id", "codigo_barras", "codigo_interno", "nome", "descricao", "categoria", "unidade", "preco_venda", "preco_custo", "preco_promocional", "promocao_ate", "estoque", "estoque_minimo", "controla_validade", "ativo", "criado_em"],
      ["1", "7891000100103", "", "Leite", "Caixinha", "Laticínios", "UN", "5,49", "4,10", "", "", "24", "6", "não", "sim", "16/09/2026 12:30"],
    ]);
    const a = analisarCsv(csv);
    expect(a.erroGeral).toBeNull();
    expect(a.linhas[0].dados).toMatchObject({
      codigoBarras: "7891000100103",
      nome: "Leite",
      descricao: "Caixinha",
      categoria: "Laticínios",
      precoVenda: 549,
      precoCusto: 410,
      estoque: 24000,
      estoqueMinimo: 6000,
    });
  });
});

// ---------------------------------------------------------------- preços

describe("sugerirPrecoPorMargem", () => {
  it("calcula preço que entrega a margem pedida", () => {
    expect(sugerirPrecoPorMargem(1000, 3000)).toBe(1429); // 10,00 com 30% -> 14,29
    expect(sugerirPrecoPorMargem(1000, 0)).toBe(1000);
    expect(sugerirPrecoPorMargem(410, 2500)).toBe(547);
  });

  it("a margem do preço sugerido bate com a pedida (arredondamento de centavo)", () => {
    const preco = sugerirPrecoPorMargem(1000, 3000)!;
    expect(Math.abs(margemPontosBase(preco, 1000) - 3000)).toBeLessThanOrEqual(5);
  });

  it("devolve null sem custo ou com margem impossível", () => {
    expect(sugerirPrecoPorMargem(0, 3000)).toBeNull();
    expect(sugerirPrecoPorMargem(1000, 10000)).toBeNull();
    expect(sugerirPrecoPorMargem(1000, -100)).toBeNull();
    expect(sugerirPrecoPorMargem(1000, Number.NaN)).toBeNull();
  });
});

describe("sugerirPrecoPorMarkup", () => {
  it("aplica o markup sobre o custo", () => {
    expect(sugerirPrecoPorMarkup(1000, 5000)).toBe(1500);
    expect(sugerirPrecoPorMarkup(0, 5000)).toBeNull();
  });
});

// ---------------------------------------------------------------- estoque e promoção

describe("estoqueAbaixoDoMinimo / promocaoVigente / valorEstoqueACusto", () => {
  it("abaixo do mínimo segue a mesma regra do estoque e do painel: mínimo definido e estoque menor", () => {
    expect(estoqueAbaixoDoMinimo(4999, 5000)).toBe(true);
    expect(estoqueAbaixoDoMinimo(0, 5000)).toBe(true);
    expect(estoqueAbaixoDoMinimo(-1000, 5000)).toBe(true);
    // igual ao mínimo ainda está OK (situacaoEstoque(1000, 1000) === "OK")
    expect(estoqueAbaixoDoMinimo(5000, 5000)).toBe(false);
    expect(estoqueAbaixoDoMinimo(5001, 5000)).toBe(false);
    // sem mínimo definido nunca alerta, mesmo zerado ou negativo
    expect(estoqueAbaixoDoMinimo(0, 0)).toBe(false);
    expect(estoqueAbaixoDoMinimo(-1000, 0)).toBe(false);
  });

  it("promoção só cabe abaixo do preço normal", () => {
    expect(promocaoCabeNoPreco(null, 700)).toBe(true);
    expect(promocaoCabeNoPreco(699, 700)).toBe(true);
    expect(promocaoCabeNoPreco(700, 700)).toBe(false);
    expect(promocaoCabeNoPreco(800, 700)).toBe(false);
  });

  it("promoção vale com preço positivo e data futura ou sem data", () => {
    const hoje = new Date("2026-09-16T12:00:00Z");
    expect(promocaoVigente({ precoPromocional: 499, promocaoAte: null }, hoje)).toBe(true);
    expect(promocaoVigente({ precoPromocional: 499, promocaoAte: new Date("2026-09-17T00:00:00Z") }, hoje)).toBe(true);
    expect(promocaoVigente({ precoPromocional: 499, promocaoAte: new Date("2026-09-15T00:00:00Z") }, hoje)).toBe(false);
    expect(promocaoVigente({ precoPromocional: null, promocaoAte: null }, hoje)).toBe(false);
    expect(promocaoVigente({ precoPromocional: 0, promocaoAte: null }, hoje)).toBe(false);
  });

  it("soma o estoque a custo ignorando negativos", () => {
    expect(
      valorEstoqueACusto([
        { estoque: 24000, precoCusto: 410 }, // 98,40
        { estoque: 12500, precoCusto: 380 }, // 47,50
        { estoque: -3000, precoCusto: 1000 },
      ]),
    ).toBe(9840 + 4750);
  });
});

// ---------------------------------------------------------------- filtros e paginação

describe("filtros da listagem", () => {
  it("lê e sanitiza os parâmetros da URL", () => {
    expect(lerFiltrosProdutos({ busca: "  arroz ", categoria: "3", situacao: "inativos", pagina: "2" })).toEqual({
      busca: "arroz",
      categoria: "3",
      situacao: "inativos",
      pagina: 2,
    });
    expect(lerFiltrosProdutos({ categoria: "abc", situacao: "qualquer", pagina: "-1" })).toEqual({
      busca: "",
      categoria: "",
      situacao: "ativos",
      pagina: 1,
    });
    expect(lerFiltrosProdutos({ categoria: ["sem", "1"] }).categoria).toBe("sem");
    expect(lerFiltrosProdutos({}, "todos").situacao).toBe("todos");
  });

  it("monta a query omitindo padrões", () => {
    expect(montarQueryProdutos({ busca: "", categoria: "", situacao: "ativos", pagina: 1 })).toBe("");
    expect(montarQueryProdutos({ busca: "café", categoria: "sem", situacao: "promocao", pagina: 3 })).toBe(
      "busca=caf%C3%A9&categoria=sem&situacao=promocao&pagina=3",
    );
    expect(montarQueryProdutos({ situacao: "ativos" }, true)).toBe("situacao=ativos");
  });

  it("calcula páginas e intervalo", () => {
    expect(totalPaginas(0)).toBe(1);
    expect(totalPaginas(50)).toBe(1);
    expect(totalPaginas(51)).toBe(2);
    expect(intervaloPagina(2, 120)).toEqual({ de: 51, ate: 100 });
    expect(intervaloPagina(3, 120)).toEqual({ de: 101, ate: 120 });
    expect(intervaloPagina(1, 0)).toEqual({ de: 0, ate: 0 });
  });
});

describe("destinoSeguro", () => {
  it("só aceita caminho interno", () => {
    expect(destinoSeguro("/pdv")).toBe("/pdv");
    expect(destinoSeguro("/pdv?codigo=123")).toBe("/pdv?codigo=123");
    expect(destinoSeguro("")).toBe("/produtos");
    expect(destinoSeguro(null)).toBe("/produtos");
    expect(destinoSeguro("//evil.com")).toBe("/produtos");
    expect(destinoSeguro("https://evil.com")).toBe("/produtos");
    expect(destinoSeguro("pdv")).toBe("/produtos");
    expect(destinoSeguro("/x y", "/caixa")).toBe("/caixa");
  });
});

// ---------------------------------------------------------------- esquemas dos formulários

describe("esquemaProduto", () => {
  const base = {
    id: null,
    codigoBarras: "7891000100103",
    codigoInterno: "",
    nome: "  Leite integral  ",
    descricao: "",
    categoriaId: "2",
    unidade: "UN",
    precoVenda: "5,49",
    precoCusto: "4,10",
    precoPromocional: "",
    promocaoAte: "",
    estoqueInicial: "24",
    estoqueMinimo: "6",
    controlaValidade: false,
    ativo: true,
  };

  it("converte o formulário em centavos, milésimos e datas", () => {
    const d = esquemaProduto.parse(base);
    expect(d).toMatchObject({
      codigoBarras: "7891000100103",
      codigoInterno: null,
      nome: "Leite integral",
      descricao: null,
      categoriaId: 2,
      unidade: "UN",
      precoVenda: 549,
      precoCusto: 410,
      precoPromocional: null,
      promocaoAte: null,
      estoqueInicial: 24000,
      estoqueMinimo: 6000,
    });
  });

  it("promoção: data vira fim do dia no fuso do mercado", () => {
    const d = esquemaProduto.parse({ ...base, precoPromocional: "4,99", promocaoAte: "2026-09-20" });
    expect(d.precoPromocional).toBe(499);
    expect(d.promocaoAte?.toISOString()).toBe("2026-09-21T02:59:59.999Z");
  });

  it("custo null significa campo não enviado (operador); vazio vira 0", () => {
    expect(esquemaProduto.parse({ ...base, precoCusto: null }).precoCusto).toBeNull();
    expect(esquemaProduto.parse({ ...base, precoCusto: "" }).precoCusto).toBe(0);
  });

  it("acusa erros por campo com mensagens em português", () => {
    const r = esquemaProduto.safeParse({
      ...base,
      codigoBarras: "7891234567890",
      nome: "",
      precoVenda: "0",
      precoPromocional: "9,00",
      estoqueInicial: "2,5",
      estoqueMinimo: "1,5",
      unidade: "LT",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const porCampo = Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
    expect(porCampo.codigoBarras).toContain("Código de barras inválido");
    expect(porCampo.nome).toBe("Informe o nome do produto.");
    expect(porCampo.unidade).toBe("Escolha como o produto é vendido: por unidade ou por quilo.");
    expect(porCampo.precoVenda).toBeUndefined(); // superRefine só roda se os campos passaram
  });

  it("regras cruzadas: preço zero, promoção maior que o preço, data sem promoção, estoque fracionado em UN", () => {
    const r = esquemaProduto.safeParse({
      ...base,
      precoVenda: "0",
      precoPromocional: "",
      promocaoAte: "2026-12-01",
      estoqueInicial: "2,5",
      estoqueMinimo: "1,5",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const caminhos = r.error.issues.map((i) => i.path.join("."));
    expect(caminhos).toContain("precoVenda");
    expect(caminhos).toContain("precoPromocional");
    expect(caminhos).toContain("estoqueInicial");
    expect(caminhos).toContain("estoqueMinimo");

    const promoAlta = esquemaProduto.safeParse({ ...base, precoPromocional: "5,49" });
    expect(promoAlta.success).toBe(false);
    if (!promoAlta.success) {
      expect(promoAlta.error.issues[0].message).toBe("O preço promocional precisa ser menor que o preço de venda.");
    }
  });

  it("quilo aceita quantidades fracionadas e código com espaços é limpo", () => {
    const d = esquemaProduto.parse({ ...base, unidade: "KG", estoqueInicial: "12,500", estoqueMinimo: "1,5", codigoBarras: " 7891000100103 " });
    expect(d.estoqueInicial).toBe(12500);
    expect(d.estoqueMinimo).toBe(1500);
    expect(d.codigoBarras).toBe("7891000100103");
  });
});

describe("esquemaCategoria", () => {
  it("normaliza cor e ordem", () => {
    expect(esquemaCategoria.parse({ id: null, nome: " Bebidas ", cor: "#1F7A4D", ordem: "" })).toEqual({
      id: null,
      nome: "Bebidas",
      cor: "#1f7a4d",
      ordem: 0,
    });
    expect(esquemaCategoria.parse({ id: 3, nome: "Limpeza", cor: "", ordem: "7" })).toEqual({ id: 3, nome: "Limpeza", cor: null, ordem: 7 });
  });

  it("rejeita nome vazio, cor fora do padrão e ordem inválida", () => {
    const r = esquemaCategoria.safeParse({ id: null, nome: "", cor: "verde", ordem: "-1" });
    expect(r.success).toBe(false);
    if (r.success) return;
    const porCampo = Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
    expect(porCampo.nome).toBe("Informe o nome da categoria.");
    expect(porCampo.cor).toBe("Cor inválida.");
    expect(porCampo.ordem).toContain("Ordem inválida");
  });
});
