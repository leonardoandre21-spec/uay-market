import { describe, expect, it } from "vitest";
import {
  agruparConciliacao,
  aplicarDescontoGeral,
  caiParcelaAParcela,
  calcularGiro,
  calcularLucro,
  classificarAbc,
  dataPrevistaRecebimento,
  diasDeCobertura,
  diasDoPeriodo,
  gerarCsv,
  giroEstoque,
  intervaloAtalho,
  lucroPorCategoria,
  lucroPorProduto,
  margemBp,
  parcelasPrevistas,
  prazoDaMaquininha,
  produtosSemVenda,
  rankearClientes,
  rankearProdutos,
  ratearProporcional,
  resolverPeriodo,
  resumirAbc,
  resumirPagamentos,
  resumirRecebimentosFiado,
  saldosFiadoEmAberto,
  saldosFiadoPorCliente,
  SEM_MAQUININHA_ID,
  SEM_MAQUININHA_NOME,
  serieDiaria,
  situacaoEstoque,
  somarFiadoSemTaxa,
  totalFiadoEmAberto,
  valorImobilizadoPorCategoria,
  vendasPorDiaSemana,
  vendasPorHora,
  vendasPorOperador,
  type ItemBase,
  type MaquininhaConciliacao,
  type PagamentoConciliacao,
  type ProdutoBase,
} from "@/lib/servicos/relatorios-calculos";

// 16/09/2026 12:00 em São Paulo (15:00 UTC).
const HOJE = new Date("2026-09-16T15:00:00Z");

function produto(parcial: Partial<ProdutoBase> & { id: number; nome: string }): ProdutoBase {
  return {
    unidade: "UN",
    categoriaId: 1,
    categoria: "Mercearia",
    estoque: 10_000,
    precoCusto: 500,
    precoVenda: 800,
    ativo: true,
    ...parcial,
  };
}

function item(parcial: Partial<ItemBase> & { vendaId: number; produtoId: number }): ItemBase {
  return {
    descricao: `Produto ${parcial.produtoId}`,
    unidade: "UN",
    quantidade: 1000,
    custoUnitario: 500,
    total: 800,
    ...parcial,
  };
}

describe("resolverPeriodo", () => {
  it("usa este mês quando não recebe parâmetros", () => {
    const p = resolverPeriodo({}, HOJE);
    expect(p.de).toBe("2026-09-01");
    expect(p.ate).toBe("2026-09-16");
    expect(p.dias).toBe(16);
    expect(p.atalho).toBe("este-mes");
    expect(p.rotulo).toBe("01/09/2026 a 16/09/2026");
  });

  it("respeita de/ate informados e reconhece o atalho equivalente", () => {
    const p = resolverPeriodo({ de: "2026-09-10", ate: "2026-09-16" }, HOJE);
    expect(p.dias).toBe(7);
    expect(p.atalho).toBe("7dias");
  });

  it("inverte quando de > ate", () => {
    const p = resolverPeriodo({ de: "2026-09-16", ate: "2026-09-01" }, HOJE);
    expect(p.de).toBe("2026-09-01");
    expect(p.ate).toBe("2026-09-16");
  });

  it("ignora datas inválidas e volta pro padrão", () => {
    const p = resolverPeriodo({ de: "abc", ate: "2026-09-16" }, HOJE);
    expect(p.de).toBe("2026-09-01");
    expect(p.atalho).toBe("este-mes");
  });

  it("aceita atalho por nome", () => {
    expect(resolverPeriodo({ atalho: "ontem" }, HOJE)).toMatchObject({ de: "2026-09-15", ate: "2026-09-15", dias: 1 });
    expect(resolverPeriodo({ atalho: "mes-passado" }, HOJE)).toMatchObject({ de: "2026-08-01", ate: "2026-08-31", dias: 31 });
    expect(resolverPeriodo({ atalho: "este-ano" }, HOJE)).toMatchObject({ de: "2026-01-01", ate: "2026-09-16" });
    expect(intervaloAtalho("30dias", HOJE)).toEqual({ de: "2026-08-18", ate: "2026-09-16" });
  });

  it("gera limites em UTC cobrindo o dia inteiro no fuso de São Paulo", () => {
    const p = resolverPeriodo({ de: "2026-09-15", ate: "2026-09-15" }, HOJE);
    expect(p.inicio.toISOString()).toBe("2026-09-15T03:00:00.000Z");
    expect(p.fim.toISOString()).toBe("2026-09-16T02:59:59.999Z");
    expect(p.rotulo).toBe("15/09/2026");
  });
});

describe("diasDoPeriodo", () => {
  it("lista todos os dias sem buracos, inclusive virada de mês", () => {
    expect(diasDoPeriodo("2026-08-30", "2026-09-02")).toEqual(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
  });
  it("devolve um dia quando de = ate e vazio pra datas inválidas", () => {
    expect(diasDoPeriodo("2026-09-16", "2026-09-16")).toEqual(["2026-09-16"]);
    expect(diasDoPeriodo("x", "2026-09-16")).toEqual([]);
  });
});

describe("ratearProporcional", () => {
  it("a soma dos rateios é exatamente o total, mesmo com dízimas", () => {
    const partes = ratearProporcional(100, [1, 1, 1]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(100);
    expect(partes.sort()).toEqual([33, 33, 34]);
  });

  it("distribui proporcionalmente", () => {
    expect(ratearProporcional(1000, [3000, 1000])).toEqual([750, 250]);
  });

  it("pesos zerados não recebem nada e soma continua batendo", () => {
    const partes = ratearProporcional(999, [500, 0, 250, -10]);
    expect(partes[1]).toBe(0);
    expect(partes[3]).toBe(0);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(999);
  });

  it("sem pesos válidos devolve zeros; lista vazia devolve vazio", () => {
    expect(ratearProporcional(500, [0, 0])).toEqual([0, 0]);
    expect(ratearProporcional(500, [])).toEqual([]);
    expect(ratearProporcional(0, [1, 2])).toEqual([0, 0]);
  });

  it("funciona com total negativo", () => {
    const partes = ratearProporcional(-100, [1, 1, 1]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(-100);
  });
});

describe("aplicarDescontoGeral", () => {
  it("rateia o desconto do cupom entre os itens e calcula o custo", () => {
    const itens = [
      item({ vendaId: 1, produtoId: 1, total: 6000, quantidade: 2000, custoUnitario: 1500 }),
      item({ vendaId: 1, produtoId: 2, total: 4000 }),
      item({ vendaId: 2, produtoId: 1, total: 1000 }),
    ];
    const resultado = aplicarDescontoGeral(itens, new Map([[1, 1000]]));
    expect(resultado[0].receita).toBe(5400);
    expect(resultado[1].receita).toBe(3600);
    expect(resultado[2].receita).toBe(1000);
    expect(resultado[0].custo).toBe(3000);
    expect(resultado[0].receita + resultado[1].receita).toBe(9000);
  });

  it("concilia o custo dos itens com Venda.custoTotal quando o produto foi dividido em lotes (FEFO)", () => {
    // 1,5 kg a R$ 3,33/kg baixado de dois lotes: partes arredondam 233 + 266 = 499,
    // mas Venda.custoTotal usa a quantidade inteira: round(1500 x 333 / 1000) = 500.
    const itens = [
      item({ vendaId: 1, produtoId: 7, unidade: "KG", quantidade: 700, custoUnitario: 333, total: 490 }),
      item({ vendaId: 1, produtoId: 7, unidade: "KG", quantidade: 800, custoUnitario: 333, total: 560 }),
      item({ vendaId: 1, produtoId: 2, quantidade: 1000, custoUnitario: 2000, total: 3000 }),
    ];
    const semConciliar = aplicarDescontoGeral(itens, new Map());
    expect(semConciliar.map((i) => i.custo)).toEqual([233, 266, 2000]);

    const conciliado = aplicarDescontoGeral(itens, new Map(), new Map([[1, 2500]]));
    // a diferença vai pra última parte do produto repetido, não pro arroz
    expect(conciliado.map((i) => i.custo)).toEqual([233, 267, 2000]);
    expect(conciliado.reduce((s, i) => s + i.custo, 0)).toBe(2500);
    // receita não muda
    expect(conciliado.map((i) => i.receita)).toEqual([490, 560, 3000]);
  });

  it("sem produto repetido, a diferença de custo vai pra última linha da venda; venda sem custo informado fica como está", () => {
    const itens = [
      item({ vendaId: 1, produtoId: 1, quantidade: 1000, custoUnitario: 100, total: 200 }),
      item({ vendaId: 1, produtoId: 2, quantidade: 1000, custoUnitario: 300, total: 500 }),
      item({ vendaId: 2, produtoId: 1, quantidade: 1000, custoUnitario: 100, total: 200 }),
    ];
    const resultado = aplicarDescontoGeral(itens, new Map(), new Map([[1, 399]]));
    expect(resultado.map((i) => i.custo)).toEqual([100, 299, 100]);
    // ranking soma o custo conciliado por produto
    const ranking = rankearProdutos(resultado, new Map());
    expect(ranking.reduce((s, l) => s + l.custo, 0)).toBe(499);
  });
});

describe("rankearProdutos", () => {
  const produtos = new Map<number, ProdutoBase>([
    [1, produto({ id: 1, nome: "Arroz 5kg" })],
    [2, produto({ id: 2, nome: "Banana", unidade: "KG", categoriaId: 2, categoria: "Hortifruti" })],
  ]);

  it("agrupa por produto com quantidade, receita, custo, lucro e margem", () => {
    const itens = aplicarDescontoGeral(
      [
        item({ vendaId: 1, produtoId: 1, quantidade: 2000, total: 5000, custoUnitario: 1500 }),
        item({ vendaId: 2, produtoId: 1, quantidade: 1000, total: 2500, custoUnitario: 1500 }),
        item({ vendaId: 2, produtoId: 2, quantidade: 350, total: 280, custoUnitario: 400, unidade: "KG" }),
      ],
      new Map(),
    );
    const ranking = rankearProdutos(itens, produtos);
    expect(ranking).toHaveLength(2);
    expect(ranking[0]).toMatchObject({
      produtoId: 1,
      nome: "Arroz 5kg",
      quantidade: 3000,
      vendas: 2,
      receita: 7500,
      custo: 4500,
      lucroBruto: 3000,
      margemBp: 4000,
    });
    expect(ranking[1]).toMatchObject({ produtoId: 2, quantidade: 350, receita: 280, custo: 140, categoria: "Hortifruti" });
    expect(ranking[0].participacaoBp + ranking[1].participacaoBp).toBeGreaterThanOrEqual(9999);
  });

  it("usa a descrição do item quando o produto não existe mais", () => {
    const ranking = rankearProdutos(aplicarDescontoGeral([item({ vendaId: 1, produtoId: 99, descricao: "Antigo" })], new Map()), produtos);
    expect(ranking[0].nome).toBe("Antigo");
    expect(ranking[0].categoria).toBe("Sem categoria");
  });
});

describe("produtosSemVenda", () => {
  it("lista só ativos com estoque positivo que não venderam", () => {
    const lista = [
      produto({ id: 1, nome: "Vendeu" }),
      produto({ id: 2, nome: "Encalhado", estoque: 4000, precoCusto: 250 }),
      produto({ id: 3, nome: "Sem estoque", estoque: 0 }),
      produto({ id: 4, nome: "Inativo", ativo: false }),
    ];
    const resultado = produtosSemVenda(lista, new Set([1]));
    expect(resultado.map((p) => p.nome)).toEqual(["Encalhado"]);
    expect(resultado[0].valorImobilizado).toBe(1000);
  });
});

describe("classificarAbc", () => {
  it("classifica em A (até 80%), B (até 95%) e C, com acumulado; o item que cruza a faixa fica na classe de cima", () => {
    const linhas = [
      { nome: "a", receita: 5000 },
      { nome: "b", receita: 2000 },
      { nome: "c", receita: 1500 },
      { nome: "d", receita: 1000 },
      { nome: "e", receita: 500 },
    ];
    const abc = classificarAbc(linhas);
    expect(abc.map((l) => l.classe)).toEqual(["A", "A", "A", "B", "C"]);
    expect(abc.map((l) => l.acumuladoBp)).toEqual([5000, 7000, 8500, 9500, 10000]);
    expect(abc.map((l) => l.posicao)).toEqual([1, 2, 3, 4, 5]);
  });

  it("primeiro item é sempre A mesmo passando de 80% sozinho; sem receita vira C", () => {
    const abc = classificarAbc([{ receita: 9000 }, { receita: 1000 }, { receita: 0 }]);
    expect(abc.map((l) => l.classe)).toEqual(["A", "B", "C"]);
  });

  it("lista vazia devolve vazio e resumo zerado", () => {
    const abc = classificarAbc([]);
    expect(abc).toEqual([]);
    const resumo = resumirAbc(abc);
    expect(resumo).toHaveLength(3);
    expect(resumo.every((r) => r.itens === 0 && r.receita === 0)).toBe(true);
  });

  it("resume contagem e percentual por classe", () => {
    const abc = classificarAbc([{ receita: 8000 }, { receita: 1500 }, { receita: 300 }, { receita: 200 }]);
    const resumo = resumirAbc(abc);
    expect(resumo[0]).toMatchObject({ classe: "A", itens: 1, percentualItensBp: 2500, receita: 8000, percentualReceitaBp: 8000 });
    expect(resumo[1]).toMatchObject({ classe: "B", itens: 1, receita: 1500 });
    expect(resumo[2]).toMatchObject({ classe: "C", itens: 2, receita: 500 });
    expect(resumo[0].sugestao.length).toBeGreaterThan(10);
  });
});

describe("lucro", () => {
  it("calcula lucro bruto, após taxas, real e margens", () => {
    const r = calcularLucro({ receita: 100_000, cmv: 60_000, taxas: 2_000, perdas: 3_000, despesas: 15_000 });
    expect(r.lucroBruto).toBe(40_000);
    expect(r.lucroAposTaxas).toBe(38_000);
    expect(r.lucroReal).toBe(20_000);
    expect(r.margemBrutaBp).toBe(4000);
    expect(r.margemRealBp).toBe(2000);
  });

  it("margem é zero sem receita (sem divisão por zero)", () => {
    expect(margemBp(0, -500)).toBe(0);
    expect(calcularLucro({ receita: 0, cmv: 0, taxas: 0, perdas: 100, despesas: 0 }).margemRealBp).toBe(0);
  });

  it("rateia taxas por receita com soma exata e inclui perdas de produto sem venda", () => {
    const produtos = new Map<number, ProdutoBase>([
      [1, produto({ id: 1, nome: "A" })],
      [2, produto({ id: 2, nome: "B" })],
      [3, produto({ id: 3, nome: "Só perda", categoriaId: 2, categoria: "Hortifruti" })],
    ]);
    const ranking = rankearProdutos(
      aplicarDescontoGeral(
        [
          item({ vendaId: 1, produtoId: 1, total: 7000, custoUnitario: 4000 }),
          item({ vendaId: 1, produtoId: 2, total: 3000, custoUnitario: 1000 }),
        ],
        new Map(),
      ),
      produtos,
    );
    const linhas = lucroPorProduto(ranking, 333, new Map([[2, 200], [3, 150]]), produtos);
    const somaTaxas = linhas.reduce((s, l) => s + l.taxas, 0);
    expect(somaTaxas).toBe(333);
    const a = linhas.find((l) => l.produtoId === 1)!;
    const b = linhas.find((l) => l.produtoId === 2)!;
    const c = linhas.find((l) => l.produtoId === 3)!;
    expect(a.taxas).toBe(233);
    expect(b.taxas).toBe(100);
    expect(b.perdas).toBe(200);
    expect(b.lucro).toBe(3000 - 1000 - 100 - 200);
    expect(c).toMatchObject({ receita: 0, perdas: 150, lucro: -150, categoria: "Hortifruti" });

    const categorias = lucroPorCategoria(linhas);
    expect(categorias[0]).toMatchObject({ categoria: "Mercearia", produtos: 2, receita: 10_000, taxas: 333 });
    expect(categorias[1]).toMatchObject({ categoria: "Hortifruti", lucro: -150 });
  });
});

describe("serieDiaria", () => {
  it("preenche dias sem venda com zero e agrupa no fuso de São Paulo", () => {
    const vendas = [
      // 15/09 23:30 em São Paulo (02:30 UTC do dia 16)
      { criadoEm: new Date("2026-09-16T02:30:00Z"), total: 1000, custoTotal: 600 },
      { criadoEm: new Date("2026-09-16T12:00:00Z"), total: 500, custoTotal: 200 },
      { criadoEm: new Date("2026-09-16T13:00:00Z"), total: 500, custoTotal: 300 },
    ];
    const serie = serieDiaria(vendas, "2026-09-14", "2026-09-16");
    expect(serie).toHaveLength(3);
    expect(serie[0]).toMatchObject({ dia: "2026-09-14", vendas: 0, receita: 0, lucroBruto: 0 });
    expect(serie[1]).toMatchObject({ dia: "2026-09-15", vendas: 1, receita: 1000, lucroBruto: 400 });
    expect(serie[2]).toMatchObject({ dia: "2026-09-16", vendas: 2, receita: 1000, cmv: 500, lucroBruto: 500 });
    expect(serie[2].rotulo).toBe("16 set");
  });
});

describe("pagamentos e operadores", () => {
  it("calcula líquido e participação por forma", () => {
    const linhas = resumirPagamentos([
      { forma: "PIX", quantidade: 2, bruto: 3000, taxas: 0 },
      { forma: "CREDITO", quantidade: 1, bruto: 7000, taxas: 280 },
    ]);
    expect(linhas[0]).toMatchObject({ forma: "CREDITO", liquido: 6720, participacaoBp: 7000 });
    expect(linhas[1]).toMatchObject({ forma: "PIX", liquido: 3000, participacaoBp: 3000 });
  });

  it("recebimentos de fiado por forma: ordena por valor e separa o que passou em cartão/Pix sem taxa", () => {
    const linhas = resumirRecebimentosFiado([
      { forma: "DINHEIRO", quantidade: 3, valor: 12_000 },
      { forma: "CREDITO", quantidade: 1, valor: 50_000 },
      { forma: "PIX", quantidade: 2, valor: 8000 },
      { forma: "DEBITO", quantidade: 0, valor: 0 },
    ]);
    expect(linhas.map((l) => l.forma)).toEqual(["CREDITO", "DINHEIRO", "PIX"]);
    // R$ 500 no crédito + R$ 80 no Pix passaram sem taxa registrada; dinheiro não conta
    expect(somarFiadoSemTaxa(linhas)).toEqual({ quantidade: 3, valor: 58_000 });
    expect(somarFiadoSemTaxa([])).toEqual({ quantidade: 0, valor: 0 });
  });

  it("agrupa por operador com ticket médio", () => {
    const linhas = vendasPorOperador(
      [
        { usuarioId: 1, total: 1000 },
        { usuarioId: 1, total: 3000 },
        { usuarioId: 2, total: 500 },
      ],
      new Map([[1, "Ana"]]),
    );
    expect(linhas[0]).toMatchObject({ nome: "Ana", quantidade: 2, total: 4000, ticketMedio: 2000 });
    expect(linhas[1].nome).toBe("Operador 2");
  });

  it("distribui por hora e dia da semana no fuso do mercado", () => {
    const vendas = [
      { criadoEm: new Date("2026-09-16T02:30:00Z"), total: 1000 }, // terça 15/09 23h SP
      { criadoEm: new Date("2026-09-16T12:15:00Z"), total: 500 }, // quarta 16/09 09h SP
    ];
    const horas = vendasPorHora(vendas);
    expect(horas).toHaveLength(24);
    expect(horas[23]).toMatchObject({ rotulo: "23h", quantidade: 1, total: 1000 });
    expect(horas[9]).toMatchObject({ quantidade: 1, total: 500 });

    const semana = vendasPorDiaSemana(vendas);
    expect(semana).toHaveLength(7);
    expect(semana[0].rotulo).toBe("Segunda");
    expect(semana[1]).toMatchObject({ rotulo: "Terça", quantidade: 1, total: 1000, ticketMedio: 1000 });
    expect(semana[2]).toMatchObject({ rotulo: "Quarta", quantidade: 1 });
    expect(semana[6].rotulo).toBe("Domingo");
  });
});

describe("estoque", () => {
  it("giro usa estoque médio (atual + vendido) / 2 e trata zero", () => {
    expect(giroEstoque(10_000, 10_000)).toBe(1);
    expect(giroEstoque(30_000, 10_000)).toBe(1.5);
    expect(giroEstoque(0, 0)).toBeNull();
    expect(giroEstoque(0, 5000)).toBe(0);
  });

  it("cobertura divide estoque pela média diária e trata divisão por zero", () => {
    expect(diasDeCobertura(20_000, 10_000, 10)).toBe(20);
    expect(diasDeCobertura(5000, 0, 10)).toBeNull();
    expect(diasDeCobertura(0, 1000, 10)).toBe(0);
    expect(diasDeCobertura(5000, 1000, 0)).toBeNull();
  });

  it("situação segue a cobertura", () => {
    expect(situacaoEstoque(0, 1000, 0)).toBe("sem-estoque");
    expect(situacaoEstoque(-500, 0, 0)).toBe("sem-estoque");
    expect(situacaoEstoque(1000, 0, null)).toBe("parado");
    expect(situacaoEstoque(1000, 1000, 3)).toBe("critico");
    expect(situacaoEstoque(1000, 1000, 10)).toBe("atencao");
    expect(situacaoEstoque(1000, 1000, 30)).toBe("normal");
    expect(situacaoEstoque(1000, 1000, 90)).toBe("excesso");
  });

  it("estoque zero sem nenhuma venda é 'zerado', não 'sem estoque'", () => {
    expect(situacaoEstoque(0, 0, 0)).toBe("zerado");
    expect(situacaoEstoque(0, 0, null)).toBe("zerado");
    // esgotou vendendo ou ficou negativo: aí sim é falta
    expect(situacaoEstoque(0, 500, 0)).toBe("sem-estoque");
    expect(situacaoEstoque(-200, 500, 0)).toBe("sem-estoque");
  });

  it("calcularGiro monta as linhas e ignora inativos sem venda", () => {
    const produtos = [
      produto({ id: 1, nome: "Arroz", estoque: 20_000, precoCusto: 2000 }),
      produto({ id: 2, nome: "Inativo", ativo: false }),
      produto({ id: 3, nome: "Parado", estoque: 3000, precoCusto: 100 }),
    ];
    const linhas = calcularGiro(produtos, new Map([[1, 10_000]]), 10);
    expect(linhas.map((l) => l.nome)).toEqual(["Arroz", "Parado"]);
    expect(linhas[0]).toMatchObject({ giro: 0.67, cobertura: 20, valorImobilizado: 40_000, situacao: "normal", estoqueMedio: 15_000 });
    expect(linhas[1]).toMatchObject({ giro: 0, cobertura: null, situacao: "parado", valorImobilizado: 300 });
  });

  it("calcularGiro separa produto cadastrado sem estoque e sem venda (zerado) de quem esgotou vendendo ou ficou negativo", () => {
    const produtos = [
      produto({ id: 1, nome: "Nunca comprado", estoque: 0 }),
      produto({ id: 2, nome: "Esgotou", estoque: 0 }),
      produto({ id: 3, nome: "Negativo", estoque: -2000 }),
    ];
    const linhas = calcularGiro(produtos, new Map([[2, 5000]]), 10);
    const porNome = new Map(linhas.map((l) => [l.nome, l.situacao]));
    expect(porNome.get("Nunca comprado")).toBe("zerado");
    expect(porNome.get("Esgotou")).toBe("sem-estoque");
    expect(porNome.get("Negativo")).toBe("sem-estoque");
    expect(linhas.filter((l) => l.situacao === "sem-estoque")).toHaveLength(2);
  });

  it("valor imobilizado por categoria separa o que está parado", () => {
    const produtos = [
      produto({ id: 1, nome: "A", estoque: 10_000, precoCusto: 100 }),
      produto({ id: 2, nome: "B", estoque: 10_000, precoCusto: 300 }),
      produto({ id: 3, nome: "C", estoque: 2000, precoCusto: 500, categoriaId: null, categoria: null }),
      produto({ id: 4, nome: "Zerado", estoque: 0 }),
    ];
    const linhas = valorImobilizadoPorCategoria(produtos, new Set([1]));
    expect(linhas[0]).toMatchObject({ categoria: "Mercearia", produtos: 2, parados: 1, valor: 4000, valorParado: 3000, participacaoBp: 8000 });
    expect(linhas[1]).toMatchObject({ categoria: "Sem categoria", valor: 1000, participacaoBp: 2000 });
  });
});

describe("clientes", () => {
  it("rankeia clientes identificados e ignora venda sem cliente", () => {
    const linhas = rankearClientes(
      [
        { clienteId: 1, total: 1000 },
        { clienteId: 1, total: 2000 },
        { clienteId: null, total: 9000 },
        { clienteId: 2, total: 500 },
      ],
      new Map([[1, "Maria"], [2, "João"]]),
    );
    expect(linhas[0]).toMatchObject({ nome: "Maria", compras: 2, total: 3000, ticketMedio: 1500 });
    expect(linhas[0].participacaoBp + linhas[1].participacaoBp).toBe(10_000);
  });

  it("saldo de fiado em aberto = débitos - pagamentos, só positivos", () => {
    const linhas = saldosFiadoEmAberto(
      [
        { clienteId: 1, tipo: "DEBITO", valor: 5000 },
        { clienteId: 1, tipo: "PAGAMENTO", valor: 2000 },
        { clienteId: 2, tipo: "DEBITO", valor: 1000 },
        { clienteId: 2, tipo: "PAGAMENTO", valor: 1000 },
      ],
      new Map([[1, { nome: "Maria", telefone: null, limiteFiado: 6000 }]]),
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ nome: "Maria", saldo: 3000, limite: 6000, usoLimiteBp: 5000 });
  });

  it("fiado em aberto soma só saldos positivos: crédito de um cliente não abate a dívida dos outros", () => {
    // A deve 300. B comprou 100 fiado, pagou 100 e depois a venda foi cancelada (ESTORNO 100): saldo -100.
    const lancamentos = [
      { clienteId: 1, tipo: "DEBITO" as const, valor: 30_000 },
      { clienteId: 2, tipo: "DEBITO" as const, valor: 10_000 },
      { clienteId: 2, tipo: "PAGAMENTO" as const, valor: 10_000 },
      { clienteId: 2, tipo: "ESTORNO" as const, valor: 10_000 },
    ];
    expect(saldosFiadoPorCliente(lancamentos)).toEqual(new Map([[1, 30_000], [2, -10_000]]));
    // a soma global daria 200; o dono tem 300 a receber
    expect(totalFiadoEmAberto(lancamentos)).toEqual({ emAberto: 30_000, credito: 10_000, clientesDevendo: 1 });
    // e bate com o relatório de Clientes
    const linhas = saldosFiadoEmAberto(lancamentos, new Map());
    expect(linhas.reduce((s, l) => s + l.saldo, 0)).toBe(30_000);
    expect(totalFiadoEmAberto([])).toEqual({ emAberto: 0, credito: 0, clientesDevendo: 0 });
  });

  it("estorno de venda cancelada abate o saldo em aberto", () => {
    const linhas = saldosFiadoEmAberto(
      [
        { clienteId: 1, tipo: "DEBITO", valor: 5000 },
        { clienteId: 1, tipo: "ESTORNO", valor: 5000 },
        { clienteId: 2, tipo: "DEBITO", valor: 4000 },
        { clienteId: 2, tipo: "ESTORNO", valor: 1000 },
        { clienteId: 2, tipo: "PAGAMENTO", valor: 500 },
      ],
      new Map([[2, { nome: "João", telefone: null, limiteFiado: 0 }]]),
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ nome: "João", saldo: 2500 });
  });
});

describe("conciliação de maquininhas", () => {
  const infinite: MaquininhaConciliacao = { id: 1, nome: "InfinitePay (Gustavo)", prazoDebitoDias: 1, prazoCreditoDias: 30, prazoPixDias: 0 };
  const sipag: MaquininhaConciliacao = { id: 2, nome: "Sipag", prazoDebitoDias: 1, prazoCreditoDias: 30, prazoPixDias: 0 };
  const maquininhas = new Map([
    [1, infinite],
    [2, sipag],
  ]);

  function pagamento(parcial: Partial<PagamentoConciliacao> & { pagamentoId: number }): PagamentoConciliacao {
    return {
      vendaId: parcial.pagamentoId,
      vendaNumero: 1000 + parcial.pagamentoId,
      criadoEm: new Date("2026-09-16T15:00:00Z"), // 16/09 12:00 em São Paulo
      forma: "DEBITO",
      parcelas: 1,
      valor: 10000,
      taxaValor: 139,
      nsu: null,
      autorizacao: null,
      maquininhaId: 1,
      ...parcial,
    };
  }

  it("prazo por forma vem da maquininha e nunca é negativo", () => {
    expect(prazoDaMaquininha(infinite, "DEBITO")).toBe(1);
    expect(prazoDaMaquininha(infinite, "CREDITO")).toBe(30);
    expect(prazoDaMaquininha(infinite, "PIX")).toBe(0);
    expect(prazoDaMaquininha({ prazoDebitoDias: -3, prazoCreditoDias: 0, prazoPixDias: 0 }, "DEBITO")).toBe(0);
  });

  it("data prevista soma o prazo em dias corridos no fuso do mercado", () => {
    const venda = new Date("2026-09-16T15:00:00Z");
    expect(dataPrevistaRecebimento(venda, "DEBITO", infinite)).toBe("2026-09-17");
    expect(dataPrevistaRecebimento(venda, "CREDITO", infinite)).toBe("2026-10-16");
    expect(dataPrevistaRecebimento(venda, "PIX", infinite)).toBe("2026-09-16");
    // 16/09 23:30 em São Paulo é 17/09 02:30 UTC: o dia da venda continua sendo 16/09
    expect(dataPrevistaRecebimento(new Date("2026-09-17T02:30:00Z"), "DEBITO", infinite)).toBe("2026-09-17");
    // sem maquininha, prazo zero
    expect(dataPrevistaRecebimento(venda, "CREDITO", null)).toBe("2026-09-16");
  });

  it("agrupa por maquininha, por dia e por data prevista, com quebra por forma", () => {
    const r = agruparConciliacao(
      [
        pagamento({ pagamentoId: 1, forma: "DEBITO", valor: 10000, taxaValor: 139, maquininhaId: 1, nsu: "123456" }),
        pagamento({ pagamentoId: 2, forma: "CREDITO", parcelas: 3, valor: 20000, taxaValor: 998, maquininhaId: 1 }),
        pagamento({ pagamentoId: 3, forma: "DEBITO", valor: 5000, taxaValor: 75, maquininhaId: 2 }),
        pagamento({
          pagamentoId: 4,
          forma: "PIX",
          valor: 3000,
          taxaValor: 0,
          maquininhaId: 2,
          criadoEm: new Date("2026-09-17T13:00:00Z"),
        }),
      ],
      maquininhas,
    );

    expect(r.totais).toMatchObject({ quantidade: 4, bruto: 38000, taxas: 1212, liquido: 36788 });
    expect(r.totais).toMatchObject({ debitoQuantidade: 2, debitoBruto: 15000, creditoBruto: 20000, pixBruto: 3000 });
    expect(r.semMaquininha).toBe(0);

    expect(r.porMaquininha.map((m) => m.nome)).toEqual(["InfinitePay (Gustavo)", "Sipag"]);
    expect(r.porMaquininha[0]).toMatchObject({
      maquininhaId: 1,
      quantidade: 2,
      bruto: 30000,
      taxas: 1137,
      liquido: 28863,
      debitoBruto: 10000,
      creditoBruto: 20000,
      creditoLiquido: 19002,
      pixBruto: 0,
    });
    expect(r.porMaquininha[0].participacaoBp + r.porMaquininha[1].participacaoBp).toBe(10000);

    // dois dias × maquininhas: 16/09 InfinitePay, 16/09 Sipag, 17/09 Sipag
    expect(r.porDia.map((d) => `${d.dia} ${d.nome}`)).toEqual([
      "2026-09-16 InfinitePay (Gustavo)",
      "2026-09-16 Sipag",
      "2026-09-17 Sipag",
    ]);
    expect(r.porDia[0]).toMatchObject({ diaRotulo: "16/09/2026", quantidade: 2, liquido: 28863 });

    // a receber: débito cai em D+1, pix no dia; crédito 3x com prazo 30 (sem antecipação)
    // cai parcela a parcela: D+30, D+60, D+90, líquido 19002 rateado em 6334 x 3
    expect(r.aReceber.map((a) => `${a.dataPrevista} ${a.nome} ${a.liquido}`)).toEqual([
      "2026-09-17 InfinitePay (Gustavo) 9861",
      "2026-09-17 Sipag 7925",
      "2026-10-16 InfinitePay (Gustavo) 6334",
      "2026-11-15 InfinitePay (Gustavo) 6334",
      "2026-12-15 InfinitePay (Gustavo) 6334",
    ]);
    expect(r.aReceber[1]).toMatchObject({ dataPrevistaRotulo: "17/09/2026", quantidade: 2, bruto: 8000, taxas: 75 });
    expect(r.aReceber[2]).toMatchObject({ quantidade: 1, bruto: 6667, taxas: 333 });
    // a soma das parcelas é exatamente o líquido do pagamento
    expect(r.aReceber.reduce((s, a) => s + a.liquido, 0)).toBe(r.totais.liquido);
    expect(r.aReceber.reduce((s, a) => s + a.bruto, 0)).toBe(r.totais.bruto);
    expect(r.parcelados).toBe(1);

    // transações em ordem cronológica, com NSU e data prevista (primeira e última parcela)
    expect(r.transacoes.map((t) => t.pagamentoId)).toEqual([1, 2, 3, 4]);
    expect(r.transacoes[0]).toMatchObject({ vendaNumero: 1001, nome: "InfinitePay (Gustavo)", nsu: "123456", liquido: 9861, dataPrevista: "2026-09-17", dataPrevistaFinal: "2026-09-17", parcelado: false });
    expect(r.transacoes[1]).toMatchObject({ forma: "CREDITO", parcelas: 3, taxa: 998, dataPrevista: "2026-10-16", dataPrevistaFinal: "2026-12-15", parcelado: true });
  });

  it("crédito parcelado: prazo de 30 dias ou mais cai parcela a parcela; prazo curto (antecipação) cai inteiro", () => {
    const sipagSemAntecipacao: MaquininhaConciliacao = { id: 3, nome: "Sipag", prazoDebitoDias: 1, prazoCreditoDias: 30, prazoPixDias: 0 };
    const infiniteAntecipa: MaquininhaConciliacao = { id: 4, nome: "InfinitePay", prazoDebitoDias: 1, prazoCreditoDias: 1, prazoPixDias: 0 };
    // venda de R$ 900 em 3x no dia 01/09 (12:00 em São Paulo), taxa 5% = R$ 45
    const venda = { criadoEm: new Date("2026-09-01T15:00:00Z"), forma: "CREDITO" as const, parcelas: 3, valor: 90_000, taxaValor: 4500 };

    expect(caiParcelaAParcela(venda, sipagSemAntecipacao)).toBe(true);
    expect(parcelasPrevistas(venda, sipagSemAntecipacao)).toEqual([
      { numero: 1, dataPrevista: "2026-10-01", bruto: 30_000, taxas: 1500, liquido: 28_500 },
      { numero: 2, dataPrevista: "2026-10-31", bruto: 30_000, taxas: 1500, liquido: 28_500 },
      { numero: 3, dataPrevista: "2026-11-30", bruto: 30_000, taxas: 1500, liquido: 28_500 },
    ]);

    // InfinitePay com antecipação automática (prazo 1): tudo em D+1
    expect(caiParcelaAParcela(venda, infiniteAntecipa)).toBe(false);
    expect(parcelasPrevistas(venda, infiniteAntecipa)).toEqual([{ numero: 1, dataPrevista: "2026-09-02", bruto: 90_000, taxas: 4500, liquido: 85_500 }]);

    // crédito à vista, débito e cartão sem maquininha nunca dividem
    expect(caiParcelaAParcela({ ...venda, parcelas: 1 }, sipagSemAntecipacao)).toBe(false);
    expect(caiParcelaAParcela({ ...venda, forma: "DEBITO" }, sipagSemAntecipacao)).toBe(false);
    expect(caiParcelaAParcela(venda, null)).toBe(false);
    expect(parcelasPrevistas(venda, null)).toHaveLength(1);

    // rateio com dízima: soma exata do bruto, da taxa e do líquido
    const dizima = parcelasPrevistas({ ...venda, valor: 10_000, taxaValor: 100 }, sipagSemAntecipacao);
    expect(dizima.map((p) => p.bruto)).toEqual([3334, 3333, 3333]);
    expect(dizima.map((p) => p.taxas)).toEqual([34, 33, 33]);
    expect(dizima.reduce((s, p) => s + p.liquido, 0)).toBe(9900);
  });

  it("cartão sem maquininha (venda antiga) vira a linha 'Sem maquininha' com prazo zero", () => {
    const r = agruparConciliacao(
      [
        pagamento({ pagamentoId: 1, maquininhaId: null, forma: "CREDITO", valor: 10000, taxaValor: 399 }),
        pagamento({ pagamentoId: 2, maquininhaId: 77, forma: "DEBITO", valor: 10000, taxaValor: 199 }), // id desconhecido
      ],
      maquininhas,
    );
    expect(r.semMaquininha).toBe(2);
    expect(r.porMaquininha).toHaveLength(1);
    expect(r.porMaquininha[0]).toMatchObject({ maquininhaId: SEM_MAQUININHA_ID, nome: SEM_MAQUININHA_NOME, quantidade: 2, liquido: 19402 });
    expect(r.aReceber).toHaveLength(1);
    expect(r.aReceber[0].dataPrevista).toBe("2026-09-16");
  });

  it("lista vazia devolve tudo zerado", () => {
    const r = agruparConciliacao([], maquininhas);
    expect(r.totais.quantidade).toBe(0);
    expect(r.porMaquininha).toEqual([]);
    expect(r.porDia).toEqual([]);
    expect(r.aReceber).toEqual([]);
    expect(r.transacoes).toEqual([]);
  });
});

describe("gerarCsv", () => {
  it("gera BOM, separador ; e escapa aspas e quebras", () => {
    const csv = gerarCsv(["Produto", "Receita"], [["Arroz; tipo 1", "12,50"], ['Café "forte"', null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    const linhas = csv.slice(1).split("\r\n");
    expect(linhas[0]).toBe("Produto;Receita");
    expect(linhas[1]).toBe('"Arroz; tipo 1";12,50');
    expect(linhas[2]).toBe('"Café ""forte""";');
    expect(linhas[3]).toBe("");
  });
});
