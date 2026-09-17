import { describe, expect, it } from "vitest";
import {
  agruparPagamentosPorForma,
  calcularDiferenca,
  calcularEsperado,
  descreverDiferenca,
  montarResumoSessao,
  separarObservacaoLegada,
  situacaoDiferenca,
  tomDiferenca,
  variacaoEsperadoAposFechamento,
  type DadosSessaoParaResumo,
} from "@/lib/servicos/caixa-calculos";

describe("calcularEsperado", () => {
  it("segue a fórmula do contrato com todos os componentes", () => {
    // abertura 100,00 + vendas dinheiro 350,00 + suprimento 50,00 + fiado dinheiro 20,00
    // − sangria 200,00 − despesa do caixa 15,00 = 305,00
    expect(
      calcularEsperado({
        valorAbertura: 10000,
        vendasDinheiro: 35000,
        suprimentos: 5000,
        sangrias: 20000,
        despesasCaixa: 1500,
        recebimentosFiadoDinheiro: 2000,
      }),
    ).toBe(30500);
  });

  it("sem movimento nenhum, o esperado é o fundo de troco", () => {
    expect(
      calcularEsperado({
        valorAbertura: 15000,
        vendasDinheiro: 0,
        suprimentos: 0,
        sangrias: 0,
        despesasCaixa: 0,
        recebimentosFiadoDinheiro: 0,
      }),
    ).toBe(15000);
  });

  it("sangria maior que o dinheiro deixa o esperado negativo (o serviço bloqueia antes)", () => {
    expect(
      calcularEsperado({
        valorAbertura: 5000,
        vendasDinheiro: 1000,
        suprimentos: 0,
        sangrias: 8000,
        despesasCaixa: 0,
        recebimentosFiadoDinheiro: 0,
      }),
    ).toBe(-2000);
  });
});

describe("calcularDiferenca", () => {
  it("contado − esperado: positivo é sobra, negativo é falta, zero bateu", () => {
    expect(calcularDiferenca(30500, 30500)).toBe(0);
    expect(calcularDiferenca(31000, 30500)).toBe(500);
    expect(calcularDiferenca(30000, 30500)).toBe(-500);
  });

  it("classifica e descreve a diferença pro dono do mercado", () => {
    expect(situacaoDiferenca(0)).toBe("exato");
    expect(situacaoDiferenca(500)).toBe("sobra");
    expect(situacaoDiferenca(-250)).toBe("falta");
    expect(descreverDiferenca(0)).toBe("Bateu");
    expect(descreverDiferenca(500)).toBe("Sobra de R$ 5,00");
    expect(descreverDiferenca(-250)).toBe("Falta de R$ 2,50");
    expect(tomDiferenca(0)).toBe("sucesso");
    expect(tomDiferenca(1)).toBe("alerta");
    expect(tomDiferenca(-1)).toBe("perigo");
  });
});

describe("variacaoEsperadoAposFechamento", () => {
  it("sem valor gravado (sessão aberta ou fechamento legado) não há o que comparar", () => {
    expect(variacaoEsperadoAposFechamento(null, 50000)).toBeNull();
  });

  it("quando o recalculado bate com o gravado, não há variação", () => {
    expect(variacaoEsperadoAposFechamento(50000, 50000)).toBeNull();
  });

  it("venda em dinheiro cancelada depois do fechamento derruba o recalculado", () => {
    // Fechou com esperado 500,00; ADMIN cancelou venda em dinheiro de 50,00 no dia seguinte.
    expect(variacaoEsperadoAposFechamento(50000, 45000)).toBe(-5000);
  });

  it("lançamento posterior que aumenta o esperado dá variação positiva", () => {
    expect(variacaoEsperadoAposFechamento(50000, 52000)).toBe(2000);
  });

  it("o cupom fecha a conta: parcelas recalculadas somam o recalculado, nunca o gravado", () => {
    const fechamento = montarResumoSessao({
      valorAbertura: 10000,
      vendas: [{ status: "CONCLUIDA", total: 40000, pagamentos: [{ forma: "DINHEIRO", valor: 40000, troco: 0 }] }],
      movimentos: [],
      despesasCaixa: [],
      recebimentosFiado: [],
    });
    const gravadoNoFechamento = fechamento.dinheiroEsperado;
    expect(gravadoNoFechamento).toBe(50000);

    // Depois do fechamento a venda vira CANCELADA e o resumo é recalculado.
    const depois = montarResumoSessao({
      valorAbertura: 10000,
      vendas: [{ status: "CANCELADA", total: 40000, pagamentos: [{ forma: "DINHEIRO", valor: 40000, troco: 0 }] }],
      movimentos: [],
      despesasCaixa: [],
      recebimentosFiado: [],
    });
    const somaDasParcelas =
      depois.valorAbertura +
      depois.porForma.DINHEIRO.valor +
      depois.suprimentos.total +
      depois.recebimentosFiado.dinheiro -
      depois.sangrias.total -
      depois.despesasCaixa.total;
    expect(somaDasParcelas).toBe(depois.dinheiroEsperado);
    expect(variacaoEsperadoAposFechamento(gravadoNoFechamento, depois.dinheiroEsperado)).toBe(-40000);
  });
});

describe("agruparPagamentosPorForma", () => {
  it("soma valor, quantidade e troco por forma, com todas as formas presentes", () => {
    const resumo = agruparPagamentosPorForma([
      { forma: "DINHEIRO", valor: 2000, troco: 300 },
      { forma: "DINHEIRO", valor: 1500, troco: 0 },
      { forma: "PIX", valor: 4990 },
      { forma: "CREDITO", valor: 10000, troco: null },
    ]);
    expect(resumo.DINHEIRO).toEqual({ quantidade: 2, valor: 3500, troco: 300 });
    expect(resumo.PIX).toEqual({ quantidade: 1, valor: 4990, troco: 0 });
    expect(resumo.CREDITO).toEqual({ quantidade: 1, valor: 10000, troco: 0 });
    expect(resumo.DEBITO).toEqual({ quantidade: 0, valor: 0, troco: 0 });
    expect(resumo.FIADO).toEqual({ quantidade: 0, valor: 0, troco: 0 });
  });

  it("usa Pagamento.valor, nunca o valor recebido", () => {
    // Cliente entregou 50,00 numa compra de 37,50: entra 37,50 no dinheiro, troco 12,50.
    const resumo = agruparPagamentosPorForma([{ forma: "DINHEIRO", valor: 3750, troco: 1250 }]);
    expect(resumo.DINHEIRO.valor).toBe(3750);
    expect(resumo.DINHEIRO.troco).toBe(1250);
  });
});

describe("montarResumoSessao", () => {
  const base: DadosSessaoParaResumo = {
    valorAbertura: 10000,
    vendas: [
      { status: "CONCLUIDA", total: 3750, pagamentos: [{ forma: "DINHEIRO", valor: 3750, troco: 1250 }] },
      { status: "CONCLUIDA", total: 4990, pagamentos: [{ forma: "PIX", valor: 4990 }] },
      {
        status: "CONCLUIDA",
        total: 12000,
        pagamentos: [
          { forma: "DINHEIRO", valor: 2000, troco: 0 },
          { forma: "DEBITO", valor: 10000 },
        ],
      },
    ],
    movimentos: [
      { tipo: "SUPRIMENTO", valor: 5000 },
      { tipo: "SANGRIA", valor: 8000 },
      { tipo: "SANGRIA", valor: 2000 },
    ],
    despesasCaixa: [{ valor: 1500 }],
    recebimentosFiado: [
      { formaPagamento: "DINHEIRO", valor: 3000 },
      { formaPagamento: "PIX", valor: 7000 },
    ],
  };

  it("consolida vendas, formas, movimentos e dinheiro esperado", () => {
    const r = montarResumoSessao(base);
    expect(r.vendas).toEqual({ quantidade: 3, total: 20740, canceladas: 0 });
    expect(r.porForma.DINHEIRO).toEqual({ quantidade: 2, valor: 5750, troco: 1250 });
    expect(r.porForma.PIX.valor).toBe(4990);
    expect(r.porForma.DEBITO.valor).toBe(10000);
    expect(r.trocoTotal).toBe(1250);
    expect(r.suprimentos).toEqual({ quantidade: 1, total: 5000 });
    expect(r.sangrias).toEqual({ quantidade: 2, total: 10000 });
    expect(r.despesasCaixa).toEqual({ quantidade: 1, total: 1500 });
    expect(r.recebimentosFiado).toEqual({ quantidade: 2, total: 10000, dinheiro: 3000 });
    // 100,00 + 57,50 + 50,00 + 30,00 − 100,00 − 15,00 = 122,50
    expect(r.dinheiroEsperado).toBe(12250);
  });

  it("venda cancelada não entra em nada, só na contagem de canceladas", () => {
    const comCancelada: DadosSessaoParaResumo = {
      ...base,
      vendas: [
        ...base.vendas,
        {
          status: "CANCELADA",
          total: 9900,
          pagamentos: [{ forma: "DINHEIRO", valor: 9900, troco: 100 }],
        },
      ],
    };
    const semCancelada = montarResumoSessao(base);
    const r = montarResumoSessao(comCancelada);
    expect(r.vendas.quantidade).toBe(3);
    expect(r.vendas.total).toBe(semCancelada.vendas.total);
    expect(r.vendas.canceladas).toBe(1);
    expect(r.porForma.DINHEIRO).toEqual(semCancelada.porForma.DINHEIRO);
    expect(r.trocoTotal).toBe(semCancelada.trocoTotal);
    expect(r.dinheiroEsperado).toBe(semCancelada.dinheiroEsperado);
  });

  it("fiado recebido em Pix ou cartão não entra no dinheiro da gaveta", () => {
    const r = montarResumoSessao({
      valorAbertura: 0,
      vendas: [],
      movimentos: [],
      despesasCaixa: [],
      recebimentosFiado: [
        { formaPagamento: "PIX", valor: 5000 },
        { formaPagamento: "DEBITO", valor: 2000 },
        { formaPagamento: null, valor: 1000 },
      ],
    });
    expect(r.recebimentosFiado.total).toBe(8000);
    expect(r.recebimentosFiado.dinheiro).toBe(0);
    expect(r.dinheiroEsperado).toBe(0);
  });

  it("sessão sem nada: esperado é a abertura e formas zeradas", () => {
    const r = montarResumoSessao({
      valorAbertura: 20000,
      vendas: [],
      movimentos: [],
      despesasCaixa: [],
      recebimentosFiado: [],
    });
    expect(r.dinheiroEsperado).toBe(20000);
    expect(r.vendas).toEqual({ quantidade: 0, total: 0, canceladas: 0 });
    expect(Object.values(r.porForma).every((f) => f.valor === 0 && f.quantidade === 0)).toBe(true);
  });
});

describe("separarObservacaoLegada", () => {
  it("sem texto ou sem prefixo, tudo é da abertura", () => {
    expect(separarObservacaoLegada(null)).toEqual({ abertura: null, fechamento: null });
    expect(separarObservacaoLegada("")).toEqual({ abertura: null, fechamento: null });
    expect(separarObservacaoLegada("Troco conferido pelo gerente.")).toEqual({
      abertura: "Troco conferido pelo gerente.",
      fechamento: null,
    });
  });

  it("separa abertura e fechamento no formato legado (linha com prefixo)", () => {
    expect(separarObservacaoLegada("Abriu com o cofre.\nFechamento: faltou troco na venda 12")).toEqual({
      abertura: "Abriu com o cofre.",
      fechamento: "faltou troco na venda 12",
    });
  });

  it("só fechamento: abertura fica nula e o prefixo some", () => {
    expect(separarObservacaoLegada("Fechamento: gaveta conferida")).toEqual({
      abertura: null,
      fechamento: "gaveta conferida",
    });
  });

  it("mantém quebras de linha dentro de cada parte", () => {
    expect(separarObservacaoLegada("Linha 1\nLinha 2\nFechamento: nota rasgada\ntrocada no banco")).toEqual({
      abertura: "Linha 1\nLinha 2",
      fechamento: "nota rasgada\ntrocada no banco",
    });
  });

  it("não confunde a palavra no meio de uma frase da abertura", () => {
    expect(separarObservacaoLegada("Combinado: Fechamento: só depois das 22h")).toEqual({
      abertura: "Combinado: Fechamento: só depois das 22h",
      fechamento: null,
    });
  });
});
