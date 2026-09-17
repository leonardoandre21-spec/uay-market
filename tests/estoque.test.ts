import { describe, expect, it } from "vitest";
import {
  aplicarCustoMedio,
  calcularAjuste,
  calcularParcelas,
  classificarFaixaVencimento,
  custoUnitarioComFrete,
  distribuirBaixaAjuste,
  entradaEstornada,
  lerMarcadorEstornoAntigo,
  prepararItensEntrada,
  quantidadeCompativelComUnidade,
  ratearFrete,
  resumirLotesPorFaixa,
  reverterCustoMedio,
  situacaoEstoque,
  subtotalItens,
  totalDaNota,
  totalizarPerdasPorMotivo,
  valorDoEstoque,
  valorEmEstoque,
  verificarEstornoEntrada,
} from "@/lib/servicos/estoque-calculos";
import { parseDataInput, paraDataInput } from "@/lib/datas";
import { custoMedioPonderado } from "@/lib/dinheiro";
import { cnpjValido, formatarCnpj, normalizarCnpj } from "@/lib/utils";

const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);

describe("ratearFrete", () => {
  it("rateia proporcionalmente ao valor e a soma bate com o frete", () => {
    // itens de 100,00 e 300,00; frete 20,00 → 5,00 e 15,00
    expect(ratearFrete([10000, 30000], 2000)).toEqual([500, 1500]);
  });

  it("distribui os centavos que sobram do arredondamento sem perder nem sobrar", () => {
    // três itens iguais, frete 1,00 → 34, 33, 33
    const r = ratearFrete([1000, 1000, 1000], 100);
    expect(soma(r)).toBe(100);
    expect(r).toEqual([34, 33, 33]);
  });

  it("soma sempre igual ao frete em casos difíceis", () => {
    const casos: Array<[number[], number]> = [
      [[1, 1, 1], 10],
      [[333, 333, 334], 1],
      [[12345, 678, 9, 100000], 999],
      [[7, 11, 13, 17, 19, 23], 1000],
      [[1, 99999], 3],
    ];
    for (const [valores, frete] of casos) {
      const r = ratearFrete(valores, frete);
      expect(r).toHaveLength(valores.length);
      expect(soma(r)).toBe(frete);
      for (const x of r) expect(Number.isInteger(x) && x >= 0).toBe(true);
    }
  });

  it("dá mais centavos pra quem tem maior resto", () => {
    // 40% e 60% de 3 centavos: 1,2 e 1,8 → 1 e 2
    expect(ratearFrete([4000, 6000], 3)).toEqual([1, 2]);
  });

  it("frete zero ou lista vazia", () => {
    expect(ratearFrete([1000, 2000], 0)).toEqual([0, 0]);
    expect(ratearFrete([], 500)).toEqual([]);
  });

  it("itens sem valor dividem o frete por igual", () => {
    const r = ratearFrete([0, 0, 0], 100);
    expect(soma(r)).toBe(100);
    expect(r).toEqual([34, 33, 33]);
  });

  it("item de valor zero no meio de itens com valor não recebe frete", () => {
    expect(ratearFrete([1000, 0, 1000], 100)).toEqual([50, 0, 50]);
  });
});

describe("custo unitário com frete", () => {
  it("embute o frete rateado no custo por unidade", () => {
    // 10 un a 5,00 com 2,00 de frete → 0,20 por unidade → 5,20
    expect(custoUnitarioComFrete(10000, 500, 200)).toBe(520);
    // 0,5 kg a 20,00/kg com 1,00 de frete → 2,00/kg → 22,00
    expect(custoUnitarioComFrete(500, 2000, 100)).toBe(2200);
  });

  it("sem frete ou sem quantidade mantém o custo", () => {
    expect(custoUnitarioComFrete(1000, 500, 0)).toBe(500);
    expect(custoUnitarioComFrete(0, 500, 100)).toBe(500);
  });

  it("prepararItensEntrada calcula valor, rateio e custo efetivo por linha", () => {
    const itens = [
      { produtoId: 1, quantidade: 10000, custoUnitario: 1000 }, // 100,00
      { produtoId: 2, quantidade: 2000, custoUnitario: 15000 }, // 300,00
    ];
    const prep = prepararItensEntrada(itens, 2000);
    expect(prep[0].valorItem).toBe(10000);
    expect(prep[1].valorItem).toBe(30000);
    expect(prep[0].freteRateado).toBe(500);
    expect(prep[1].freteRateado).toBe(1500);
    expect(prep[0].custoEfetivo).toBe(1050); // 10,00 + 5,00/10
    expect(prep[1].custoEfetivo).toBe(15750); // 150,00 + 15,00/2
    expect(subtotalItens(itens)).toBe(40000);
    expect(totalDaNota(itens, 2000)).toBe(42000);
  });
});

describe("aplicarCustoMedio", () => {
  it("recalcula custo médio e estoque de cada item", () => {
    const produtos = new Map([[1, { estoque: 10000, precoCusto: 500 }]]);
    const r = aplicarCustoMedio([{ produtoId: 1, quantidade: 10000, custoEfetivo: 700 }], produtos);
    expect(r[0]).toMatchObject({
      estoqueAnterior: 10000,
      estoqueApos: 20000,
      custoAnterior: 500,
      custoNovo: 600,
      custoMudou: true,
    });
    // o mapa original não é alterado
    expect(produtos.get(1)).toEqual({ estoque: 10000, precoCusto: 500 });
  });

  it("mesmo produto em duas linhas: a segunda parte do resultado da primeira", () => {
    const produtos = new Map([[1, { estoque: 0, precoCusto: 0 }]]);
    const r = aplicarCustoMedio(
      [
        { produtoId: 1, quantidade: 10000, custoEfetivo: 500 },
        { produtoId: 1, quantidade: 10000, custoEfetivo: 700 },
      ],
      produtos,
    );
    expect(r[0].estoqueApos).toBe(10000);
    expect(r[0].custoNovo).toBe(500);
    expect(r[1].estoqueAnterior).toBe(10000);
    expect(r[1].estoqueApos).toBe(20000);
    expect(r[1].custoNovo).toBe(600);
  });

  it("estoque negativo assume o custo da entrada", () => {
    const produtos = new Map([[1, { estoque: -2000, precoCusto: 500 }]]);
    const r = aplicarCustoMedio([{ produtoId: 1, quantidade: 5000, custoEfetivo: 700 }], produtos);
    expect(r[0].custoNovo).toBe(700);
    expect(r[0].estoqueApos).toBe(3000);
  });

  it("custo igual não marca mudança", () => {
    const produtos = new Map([[1, { estoque: 1000, precoCusto: 500 }]]);
    const r = aplicarCustoMedio([{ produtoId: 1, quantidade: 1000, custoEfetivo: 500 }], produtos);
    expect(r[0].custoMudou).toBe(false);
  });
});

describe("calcularAjuste", () => {
  it("por contagem", () => {
    expect(calcularAjuste(10000, { novaQuantidade: 8000 })).toEqual({ diferenca: -2000, estoqueApos: 8000 });
    expect(calcularAjuste(-1000, { novaQuantidade: 0 })).toEqual({ diferenca: 1000, estoqueApos: 0 });
  });
  it("por diferença", () => {
    expect(calcularAjuste(10000, { diferenca: 3000 })).toEqual({ diferenca: 3000, estoqueApos: 13000 });
    expect(calcularAjuste(10000, { diferenca: -3000 })).toEqual({ diferenca: -3000, estoqueApos: 7000 });
  });
});

describe("faixas de vencimento", () => {
  it("classifica pelos dias restantes", () => {
    expect(classificarFaixaVencimento(-1)).toBe("VENCIDO");
    expect(classificarFaixaVencimento(-30)).toBe("VENCIDO");
    expect(classificarFaixaVencimento(0)).toBe("ATE_7_DIAS");
    expect(classificarFaixaVencimento(7)).toBe("ATE_7_DIAS");
    expect(classificarFaixaVencimento(8)).toBe("DE_8_A_30_DIAS");
    expect(classificarFaixaVencimento(30)).toBe("DE_8_A_30_DIAS");
    expect(classificarFaixaVencimento(31)).toBe("MAIS_DE_30_DIAS");
    expect(classificarFaixaVencimento(365)).toBe("MAIS_DE_30_DIAS");
  });

  it("resume lotes por faixa com quantidade e valor a custo", () => {
    const resumo = resumirLotesPorFaixa([
      { diasRestantes: -2, quantidade: 2000, custoUnitario: 500 }, // 10,00
      { diasRestantes: 3, quantidade: 1000, custoUnitario: 300 }, // 3,00
      { diasRestantes: 5, quantidade: 500, custoUnitario: 1000 }, // 5,00
      { diasRestantes: 20, quantidade: 3000, custoUnitario: 100 }, // 3,00
      { diasRestantes: 90, quantidade: 1000, custoUnitario: 100 }, // 1,00
      { diasRestantes: 90, quantidade: 0, custoUnitario: 100 }, // ignorado
    ]);
    expect(resumo.VENCIDO).toEqual({ lotes: 1, quantidade: 2000, valorCusto: 1000 });
    expect(resumo.ATE_7_DIAS).toEqual({ lotes: 2, quantidade: 1500, valorCusto: 800 });
    expect(resumo.DE_8_A_30_DIAS).toEqual({ lotes: 1, quantidade: 3000, valorCusto: 300 });
    expect(resumo.MAIS_DE_30_DIAS).toEqual({ lotes: 1, quantidade: 1000, valorCusto: 100 });
  });
});

describe("valor do estoque", () => {
  it("soma estoque × preço / 1000", () => {
    expect(valorEmEstoque(2000, 1250)).toBe(2500);
    expect(valorEmEstoque(350, 2990)).toBe(1047);
  });
  it("estoque negativo não abate do total", () => {
    expect(valorEmEstoque(-5000, 1000)).toBe(0);
    const v = valorDoEstoque([
      { estoque: 10000, precoCusto: 500, precoVenda: 900 },
      { estoque: -3000, precoCusto: 500, precoVenda: 900 },
      { estoque: 0, precoCusto: 500, precoVenda: 900 },
    ]);
    expect(v).toEqual({ custo: 5000, venda: 9000 });
  });
  it("situação em relação ao mínimo", () => {
    expect(situacaoEstoque(-1, 0)).toBe("NEGATIVO");
    expect(situacaoEstoque(0, 0)).toBe("ZERADO");
    expect(situacaoEstoque(500, 1000)).toBe("ABAIXO_MINIMO");
    expect(situacaoEstoque(1000, 1000)).toBe("OK");
    expect(situacaoEstoque(500, 0)).toBe("OK");
  });
});

describe("calcularParcelas", () => {
  it("divide em parcelas mensais e a soma bate com o total", () => {
    const primeiro = parseDataInput("2026-10-10")!;
    const parcelas = calcularParcelas(10000, 3, primeiro);
    expect(parcelas.map((p) => p.valor)).toEqual([3334, 3333, 3333]);
    expect(soma(parcelas.map((p) => p.valor))).toBe(10000);
    expect(parcelas.map((p) => paraDataInput(p.vencimento))).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(parcelas.map((p) => `${p.parcelaAtual}/${p.totalParcelas}`)).toEqual(["1/3", "2/3", "3/3"]);
  });
  it("parcela única", () => {
    const primeiro = parseDataInput("2026-01-31")!;
    const parcelas = calcularParcelas(4999, 1, primeiro);
    expect(parcelas).toHaveLength(1);
    expect(parcelas[0].valor).toBe(4999);
    expect(paraDataInput(parcelas[0].vencimento)).toBe("2026-01-31");
  });
  it("fim de mês respeita o mês mais curto", () => {
    const primeiro = parseDataInput("2026-01-31")!;
    const parcelas = calcularParcelas(300, 3, primeiro);
    expect(parcelas.map((p) => paraDataInput(p.vencimento))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
});

describe("totalizarPerdasPorMotivo", () => {
  it("agrupa registros, quantidade e valor", () => {
    const t = totalizarPerdasPorMotivo([
      { motivo: "VENCIDO", quantidade: 1000, valorTotal: 500 },
      { motivo: "VENCIDO", quantidade: 2000, valorTotal: 900 },
      { motivo: "QUEBRA", quantidade: 500, valorTotal: 250 },
    ]);
    expect(t.VENCIDO).toEqual({ registros: 2, quantidade: 3000, valor: 1400 });
    expect(t.QUEBRA).toEqual({ registros: 1, quantidade: 500, valor: 250 });
    expect(t.FURTO).toEqual({ registros: 0, quantidade: 0, valor: 0 });
  });
});

describe("estorno de entrada", () => {
  it("reconhece estorno pelo campo estornadaEm", () => {
    expect(entradaEstornada({ estornadaEm: null })).toBe(false);
    expect(entradaEstornada({ estornadaEm: undefined })).toBe(false);
    expect(entradaEstornada({ estornadaEm: new Date("2026-09-16T13:00:00Z") })).toBe(true);
    expect(entradaEstornada({ estornadaEm: "2026-09-16T13:00:00.000Z" })).toBe(true);
  });

  it("ainda reconhece o marcador antigo na observação (compatibilidade)", () => {
    expect(entradaEstornada(null)).toBe(false);
    expect(entradaEstornada("nota fiscal 123")).toBe(false);
    expect(entradaEstornada("[ESTORNADA em 16/09/2026 10:00 por Administrador] nota 123")).toBe(true);
    expect(entradaEstornada("  [ESTORNADA em x por y]")).toBe(true);
  });

  it("lê o marcador antigo pra migrar", () => {
    expect(lerMarcadorEstornoAntigo(null)).toBeNull();
    expect(lerMarcadorEstornoAntigo("nota 123")).toBeNull();

    const completo = lerMarcadorEstornoAntigo("[ESTORNADA em 16/09/2026 10:00 por Administrador] nota 123");
    expect(completo?.porQuem).toBe("Administrador");
    expect(completo?.observacaoLimpa).toBe("nota 123");
    expect(completo?.quando).toBeInstanceOf(Date);
    // 10:00 em São Paulo (UTC-3) = 13:00 UTC
    expect(completo?.quando?.getTime()).toBe(Date.parse("2026-09-16T13:00:00.000Z"));

    const semResto = lerMarcadorEstornoAntigo("[ESTORNADA em 01/02/2026 08:30 por Maria (caixa)]");
    expect(semResto).toEqual({ quando: expect.any(Date), porQuem: "Maria (caixa)", observacaoLimpa: null });
    expect(semResto?.quando?.getTime()).toBe(Date.parse("2026-02-01T11:30:00.000Z"));

    const dataIlegivel = lerMarcadorEstornoAntigo("[ESTORNADA em ontem por alguém] resto");
    expect(dataIlegivel).toEqual({ quando: null, porQuem: "alguém", observacaoLimpa: "resto" });

    expect(lerMarcadorEstornoAntigo("[ESTORNADA]")).toEqual({ quando: null, porQuem: null, observacaoLimpa: null });
  });

  it("libera quando nada foi consumido e o estoque cobre", () => {
    const bloqueios = verificarEstornoEntrada({
      estornadaEm: null,
      itens: [
        { produtoId: 1, quantidade: 10000, estoqueAtual: 12000 },
        { produtoId: 2, quantidade: 5000, estoqueAtual: 5000 },
      ],
      lotes: [{ produtoId: 1, quantidade: 10000, consumos: 0 }],
      contas: [{ id: 1, status: "PENDENTE" }],
    });
    expect(bloqueios).toEqual([]);
  });

  it("bloqueia lote consumido, estoque insuficiente e boleto pago", () => {
    const bloqueios = verificarEstornoEntrada({
      estornadaEm: null,
      itens: [
        { produtoId: 1, quantidade: 10000, estoqueAtual: 12000 },
        { produtoId: 2, quantidade: 5000, estoqueAtual: 4000 },
      ],
      lotes: [{ produtoId: 1, quantidade: 8000, consumos: 1 }],
      contas: [{ id: 7, status: "PAGA" }],
    });
    expect(bloqueios).toEqual([
      { tipo: "LOTE_CONSUMIDO", produtoId: 1 },
      { tipo: "ESTOQUE_INSUFICIENTE", produtoId: 2, estoqueAtual: 4000, necessario: 5000 },
      { tipo: "BOLETO_PAGO", contaId: 7 },
    ]);
  });

  it("mesmo produto em duas linhas soma as quantidades antes de comparar", () => {
    const bloqueios = verificarEstornoEntrada({
      estornadaEm: null,
      itens: [
        { produtoId: 1, quantidade: 3000, estoqueAtual: 6000 },
        { produtoId: 1, quantidade: 3000, estoqueAtual: 6000 },
      ],
      lotes: [
        { produtoId: 1, quantidade: 3000, consumos: 0 },
        { produtoId: 1, quantidade: 3000, consumos: 0 },
      ],
      contas: [],
    });
    expect(bloqueios).toEqual([]);
  });

  it("entrada já estornada não estorna de novo", () => {
    const bloqueios = verificarEstornoEntrada({
      estornadaEm: new Date("2026-09-15T12:00:00Z"),
      itens: [],
      lotes: [],
      contas: [],
    });
    expect(bloqueios).toEqual([{ tipo: "JA_ESTORNADA" }]);
  });
});

describe("estorno de entrada: lote decide pela entrada, não pelo flag atual", () => {
  it("lote criado na entrada e consumido bloqueia mesmo com o produto sem controle de validade hoje", () => {
    const bloqueios = verificarEstornoEntrada({
      estornadaEm: null,
      itens: [{ produtoId: 1, quantidade: 10000, estoqueAtual: 16000 }],
      lotes: [{ produtoId: 1, quantidade: 6000, consumos: 1 }],
      contas: [],
    });
    expect(bloqueios).toEqual([{ tipo: "LOTE_CONSUMIDO", produtoId: 1 }]);
  });

  it("entrada sem lote não bloqueia por lote, ainda que o produto controle validade hoje", () => {
    const bloqueios = verificarEstornoEntrada({
      estornadaEm: null,
      itens: [{ produtoId: 2, quantidade: 10000, estoqueAtual: 10000 }],
      lotes: [],
      contas: [],
    });
    expect(bloqueios).toEqual([]);
  });
});

describe("reverterCustoMedio", () => {
  it("restaura o custo de antes quando a entrada foi a última a mexer no custo", () => {
    // 50 un a 20,00; entrada errada de 100 un a 200,00 vira média 140,00
    const custoErrado = custoMedioPonderado(50000, 2000, 100000, 20000);
    expect(custoErrado).toBe(14000);
    const r = reverterCustoMedio({
      custoAtual: custoErrado,
      linhas: [{ quantidade: 100000, custoEfetivo: 20000, estoqueApos: 150000 }],
      historico: [{ precoCustoAnterior: 2000, precoCustoNovo: custoErrado }],
      entradasPosteriores: [],
    });
    expect(r).toEqual({ custoNovo: 2000, custoAntesDaEntrada: 2000, custoEfetivoMedio: 20000, revertido: true, custoMudou: true });
  });

  it("vendas entre a entrada e o estorno não atrapalham (venda não muda o custo médio)", () => {
    // vendeu 30 un depois da entrada: estoque 120, custo continua 140,00
    const r = reverterCustoMedio({
      custoAtual: 14000,
      linhas: [{ quantidade: 100000, custoEfetivo: 20000, estoqueApos: 150000 }],
      historico: [{ precoCustoAnterior: 2000, precoCustoNovo: 14000 }],
      entradasPosteriores: [],
    });
    expect(r.custoNovo).toBe(2000);
    expect(r.revertido).toBe(true);
  });

  it("reaplica entradas posteriores como se a estornada não existisse", () => {
    // 50 un a 20,00; A (errada): 100 un a 200,00 = 140,00; B (certa): 100 un a 20,00 = 92,00
    const aposA = custoMedioPonderado(50000, 2000, 100000, 20000);
    const aposB = custoMedioPonderado(150000, aposA, 100000, 2000);
    expect(aposB).toBe(9200);
    const r = reverterCustoMedio({
      custoAtual: aposB,
      linhas: [{ quantidade: 100000, custoEfetivo: 20000, estoqueApos: 150000 }],
      historico: [
        { precoCustoAnterior: 2000, precoCustoNovo: aposA },
        { precoCustoAnterior: aposA, precoCustoNovo: aposB },
      ],
      entradasPosteriores: [{ quantidade: 100000, custoEfetivo: 2000, estoqueApos: 250000, ativa: true }],
    });
    // sem A: 50 un a 20,00 + 100 un a 20,00 = 20,00
    expect(r.custoNovo).toBe(2000);
    expect(r.revertido).toBe(true);
  });

  it("vendas antes de uma entrada posterior deixam o estoque hipotético negativo: custo passa a ser o da posterior", () => {
    // 50 a 20,00; A: 100 a 200,00 = 140,00; vendeu 100; B: 100 a 25,00
    const aposA = custoMedioPonderado(50000, 2000, 100000, 20000);
    const aposB = custoMedioPonderado(50000, aposA, 100000, 2500);
    const r = reverterCustoMedio({
      custoAtual: aposB,
      linhas: [{ quantidade: 100000, custoEfetivo: 20000, estoqueApos: 150000 }],
      historico: [
        { precoCustoAnterior: 2000, precoCustoNovo: aposA },
        { precoCustoAnterior: aposA, precoCustoNovo: aposB },
      ],
      entradasPosteriores: [{ quantidade: 100000, custoEfetivo: 2500, estoqueApos: 150000, ativa: true }],
    });
    // sem A o estoque antes de B seria 50 - 100 = -50, então o custo vira o de B
    expect(r.custoNovo).toBe(2500);
    expect(r.revertido).toBe(true);
  });

  it("entrada posterior já estornada é ignorada nos dois caminhos", () => {
    const aposA = custoMedioPonderado(50000, 2000, 100000, 20000);
    const r = reverterCustoMedio({
      custoAtual: aposA, // o estorno de B devolveu o custo pós-A
      linhas: [{ quantidade: 100000, custoEfetivo: 20000, estoqueApos: 150000 }],
      historico: [
        { precoCustoAnterior: 2000, precoCustoNovo: aposA },
        { precoCustoAnterior: aposA, precoCustoNovo: 8800 },
        { precoCustoAnterior: 8800, precoCustoNovo: aposA },
      ],
      entradasPosteriores: [{ quantidade: 100000, custoEfetivo: 2000, estoqueApos: 250000, ativa: false }],
    });
    expect(r.custoNovo).toBe(2000);
    expect(r.revertido).toBe(true);
  });

  it("estoque que zera com o estorno volta ao custo de antes da entrada", () => {
    // 20 un a 3,00; entrada de 100 un a 30,00 = 25,50; vendeu 20; estorno deixa 0 em estoque
    const apos = custoMedioPonderado(20000, 300, 100000, 3000);
    expect(apos).toBe(2550);
    const r = reverterCustoMedio({
      custoAtual: apos,
      linhas: [{ quantidade: 100000, custoEfetivo: 3000, estoqueApos: 120000 }],
      historico: [{ precoCustoAnterior: 300, precoCustoNovo: apos }],
      entradasPosteriores: [],
    });
    expect(r.custoNovo).toBe(300);
  });

  it("mesmo produto em duas linhas da entrada usa o custo de antes da primeira", () => {
    const apos1 = custoMedioPonderado(10000, 500, 10000, 700); // 600
    const apos2 = custoMedioPonderado(20000, apos1, 10000, 900); // 700
    const r = reverterCustoMedio({
      custoAtual: apos2,
      linhas: [
        { quantidade: 10000, custoEfetivo: 700, estoqueApos: 20000 },
        { quantidade: 10000, custoEfetivo: 900, estoqueApos: 30000 },
      ],
      historico: [
        { precoCustoAnterior: 500, precoCustoNovo: apos1 },
        { precoCustoAnterior: apos1, precoCustoNovo: apos2 },
      ],
      entradasPosteriores: [],
    });
    expect(r.custoNovo).toBe(500);
    expect(r.custoEfetivoMedio).toBe(800);
    expect(r.revertido).toBe(true);
  });

  it("entrada que não mudou o custo (sem HistoricoPreco) mantém o custo e não marca mudança", () => {
    const r = reverterCustoMedio({
      custoAtual: 500,
      linhas: [{ quantidade: 10000, custoEfetivo: 500, estoqueApos: 20000 }],
      historico: [],
      entradasPosteriores: [],
    });
    expect(r).toMatchObject({ custoNovo: 500, revertido: true, custoMudou: false });
  });

  it("custo editado à mão depois da entrada é preservado (caminho real não bate com o atual)", () => {
    const aposA = custoMedioPonderado(50000, 2000, 100000, 20000);
    const r = reverterCustoMedio({
      custoAtual: 2100, // dono corrigiu no cadastro
      linhas: [{ quantidade: 100000, custoEfetivo: 20000, estoqueApos: 150000 }],
      historico: [
        { precoCustoAnterior: 2000, precoCustoNovo: aposA },
        { precoCustoAnterior: aposA, precoCustoNovo: 2100 },
      ],
      entradasPosteriores: [],
    });
    expect(r).toMatchObject({ custoNovo: 2100, revertido: false, custoMudou: false });
  });

  it("sem linhas não faz nada", () => {
    const r = reverterCustoMedio({ custoAtual: 900, linhas: [], historico: [], entradasPosteriores: [] });
    expect(r).toMatchObject({ custoNovo: 900, revertido: false, custoMudou: false });
  });
});

describe("quantidadeCompativelComUnidade", () => {
  it("UN só aceita inteiro; KG aceita fração", () => {
    expect(quantidadeCompativelComUnidade(1000, "UN")).toBe(true);
    expect(quantidadeCompativelComUnidade(12000, "UN")).toBe(true);
    expect(quantidadeCompativelComUnidade(0, "UN")).toBe(true);
    expect(quantidadeCompativelComUnidade(-3000, "UN")).toBe(true);
    expect(quantidadeCompativelComUnidade(500, "UN")).toBe(false);
    expect(quantidadeCompativelComUnidade(1500, "UN")).toBe(false);
    expect(quantidadeCompativelComUnidade(-1500, "UN")).toBe(false);
    expect(quantidadeCompativelComUnidade(350, "KG")).toBe(true);
    expect(quantidadeCompativelComUnidade(2500, "KG")).toBe(true);
    expect(quantidadeCompativelComUnidade(1.5, "KG")).toBe(false);
  });
});

describe("distribuirBaixaAjuste", () => {
  const lotes = [
    { id: 1, quantidade: 4000 },
    { id: 2, quantidade: 6000 },
  ];

  it("ajuste positivo ou sem lote não mexe em lote", () => {
    expect(distribuirBaixaAjuste(lotes, 3000, 13000)).toEqual([]);
    expect(distribuirBaixaAjuste([], -3000, 7000)).toEqual([]);
  });

  it("tira a diferença do que vence primeiro", () => {
    expect(distribuirBaixaAjuste(lotes, -3000, 7000)).toEqual([{ loteId: 1, quantidade: 3000 }]);
    expect(distribuirBaixaAjuste(lotes, -5000, 5000)).toEqual([
      { loteId: 1, quantidade: 4000 },
      { loteId: 2, quantidade: 1000 },
    ]);
  });

  it("contagem pra zero zera todos os lotes", () => {
    expect(distribuirBaixaAjuste(lotes, -10000, 0)).toEqual([
      { loteId: 1, quantidade: 4000 },
      { loteId: 2, quantidade: 6000 },
    ]);
  });

  it("lotes acima do saldo final são realinhados e nunca ficam negativos", () => {
    // estoque 10 com lote de 12 (já desalinhado); contagem acha 7: o lote precisa caber em 7
    expect(distribuirBaixaAjuste([{ id: 1, quantidade: 12000 }], -3000, 7000)).toEqual([{ loteId: 1, quantidade: 5000 }]);
    // retirar mais do que há em lote tira só o que existe
    expect(distribuirBaixaAjuste(lotes, -20000, -10000)).toEqual([
      { loteId: 1, quantidade: 4000 },
      { loteId: 2, quantidade: 6000 },
    ]);
  });

  it("lote sem saldo é pulado", () => {
    expect(
      distribuirBaixaAjuste(
        [
          { id: 1, quantidade: 0 },
          { id: 2, quantidade: 2000 },
        ],
        -1000,
        5000,
      ),
    ).toEqual([{ loteId: 2, quantidade: 1000 }]);
  });
});

describe("CNPJ", () => {
  it("normaliza e formata", () => {
    expect(normalizarCnpj("12.345.678/0001-95")).toBe("12345678000195");
    expect(normalizarCnpj(" 12abc ")).toBe("12ABC");
    expect(normalizarCnpj(null)).toBe("");
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("12345")).toBe("12345");
  });

  it("valida dígitos verificadores numéricos", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-80")).toBe(false);
    expect(cnpjValido("12.345.678/0001-00")).toBe(false);
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
    expect(cnpjValido("00.000.000/0000-00")).toBe(false);
    expect(cnpjValido("1234567800019")).toBe(false);
    expect(cnpjValido("")).toBe(false);
  });

  it("aceita o formato alfanumérico da Receita", () => {
    // Exemplo divulgado pela Receita Federal: 12.ABC.345/01DE-35
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("12abc34501de35")).toBe(true);
    expect(cnpjValido("12.ABC.345/01DE-36")).toBe(false);
    // dígitos verificadores nunca têm letra
    expect(cnpjValido("12.ABC.345/01DE-3A")).toBe(false);
  });
});
