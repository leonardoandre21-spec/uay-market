import { describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import {
  agruparVendasPorDia,
  capitalizar,
  centavosParaCsv,
  chaveMes,
  compararMeses,
  contaSemPagamentoEm,
  despesaEntraNoResultado,
  dinheiroEsperado,
  DRE_VAZIA,
  estatisticasDiarias,
  fiadoAntigoEmAberto,
  formatarDuracao,
  formatarVariacao,
  linhasDre,
  listarMeses,
  margemBp,
  mesAnterior,
  mesAnteriorAteMesmoDia,
  mesSeguinte,
  mesmoTrechoDoDia,
  montarCsvDre,
  montarDre,
  preencherDias,
  progressoMeta,
  resumirFiadoDoMes,
  rotuloDiaCurto,
  rotuloMesCurto,
  ticketMedio,
  topProdutosPorReceita,
  ultimosMeses,
  variacaoPercentual,
  type EntradasDre,
  type LancamentoFiadoMes,
} from "@/lib/servicos/gestao-calculos";
import { limitesDoMesAnoMes } from "@/lib/datas";

const FUSO = "America/Sao_Paulo";

const exemplo: EntradasDre = {
  receitaBruta: 1_000_000, // R$ 10.000,00
  taxas: 20_000, // R$ 200,00
  cmv: 600_000, // R$ 6.000,00
  numeroVendas: 400,
  perdas: [
    { rotulo: "Vencido", valor: 15_000, registros: 3 },
    { rotulo: "Avaria", valor: 5_000, registros: 1 },
  ],
  despesas: [
    { rotulo: "Aluguel", valor: 150_000, registros: 1 },
    { rotulo: "Energia", valor: 40_000, registros: 1 },
  ],
};

describe("montarDre", () => {
  it("monta todas as linhas do demonstrativo", () => {
    const dre = montarDre(exemplo);
    expect(dre.receitaBruta).toBe(1_000_000);
    expect(dre.taxas).toBe(20_000);
    expect(dre.receitaLiquida).toBe(980_000);
    expect(dre.cmv).toBe(600_000);
    expect(dre.lucroBruto).toBe(380_000);
    expect(dre.margemBrutaBp).toBe(3800); // 38,00%
    expect(dre.perdasTotal).toBe(20_000);
    expect(dre.despesasTotal).toBe(190_000);
    expect(dre.lucroLiquido).toBe(170_000);
    expect(dre.margemLiquidaBp).toBe(1700); // 17,00%
    expect(dre.numeroVendas).toBe(400);
    expect(dre.ticketMedio).toBe(2500); // R$ 25,00
  });

  it("ordena perdas e despesas da maior pra menor sem mudar a entrada", () => {
    const entradas: EntradasDre = {
      ...exemplo,
      despesas: [
        { rotulo: "Energia", valor: 40_000, registros: 1 },
        { rotulo: "Aluguel", valor: 150_000, registros: 1 },
      ],
    };
    const dre = montarDre(entradas);
    expect(dre.despesas.map((d) => d.rotulo)).toEqual(["Aluguel", "Energia"]);
    expect(entradas.despesas[0].rotulo).toBe("Energia");
  });

  it("é segura com tudo zerado (sem divisão por zero)", () => {
    const dre = montarDre(DRE_VAZIA);
    expect(dre.lucroBruto).toBe(0);
    expect(dre.lucroLiquido).toBe(0);
    expect(dre.margemBrutaBp).toBe(0);
    expect(dre.margemLiquidaBp).toBe(0);
    expect(dre.ticketMedio).toBe(0);
  });

  it("mostra prejuízo e margem negativa", () => {
    const dre = montarDre({ ...exemplo, despesas: [{ rotulo: "Aluguel", valor: 500_000, registros: 1 }] });
    expect(dre.lucroLiquido).toBe(-140_000);
    expect(dre.margemLiquidaBp).toBe(-1400);
  });
});

describe("linhasDre", () => {
  it("gera as linhas na ordem do demonstrativo com detalhes e variação", () => {
    const atual = montarDre(exemplo);
    const anterior = montarDre({ ...exemplo, receitaBruta: 800_000, perdas: [{ rotulo: "Furto", valor: 1_000, registros: 1 }] });
    const linhas = linhasDre(atual, anterior);
    expect(linhas.map((l) => l.chave)).toEqual([
      "receitaBruta",
      "taxas",
      "receitaLiquida",
      "cmv",
      "lucroBruto",
      "perdas",
      "perda:Vencido",
      "perda:Avaria",
      "perda:Furto",
      "despesas",
      "despesa:Aluguel",
      "despesa:Energia",
      "lucroLiquido",
    ]);
    const receita = linhas[0];
    expect(receita.valor).toBe(1_000_000);
    expect(receita.valorAnterior).toBe(800_000);
    expect(receita.variacaoBp).toBe(2500); // +25%
    const lucroBruto = linhas.find((l) => l.chave === "lucroBruto")!;
    expect(lucroBruto.margemBp).toBe(3800);
    expect(lucroBruto.margemAnteriorBp).toBe(anterior.margemBrutaBp);
    const furto = linhas.find((l) => l.chave === "perda:Furto")!;
    expect(furto.valor).toBe(0);
    expect(furto.valorAnterior).toBe(1_000);
    expect(furto.variacaoBp).toBe(-10000);
  });
});

describe("variacaoPercentual e formatarVariacao", () => {
  it("calcula em pontos-base", () => {
    expect(variacaoPercentual(125, 100)).toBe(2500);
    expect(variacaoPercentual(75, 100)).toBe(-2500);
    expect(variacaoPercentual(100, 100)).toBe(0);
  });
  it("sem base anterior devolve null", () => {
    expect(variacaoPercentual(500, 0)).toBeNull();
    expect(variacaoPercentual(0, 0)).toBeNull();
  });
  it("prejuízo virando lucro dá variação positiva", () => {
    expect(variacaoPercentual(50, -100)).toBe(15000);
  });
  it("formata com sinal e vírgula", () => {
    expect(formatarVariacao(1250)).toBe("+12,5%");
    expect(formatarVariacao(-305)).toBe("-3,1%");
    expect(formatarVariacao(0)).toBe("0,0%");
    expect(formatarVariacao(-3)).toBe("0,0%");
    expect(formatarVariacao(1250, 0)).toBe("+13%");
    expect(formatarVariacao(1250, 2)).toBe("+12,50%");
    expect(formatarVariacao(null)).toBe("n/d");
  });
});

describe("margemBp e ticketMedio", () => {
  it("protegem divisão por zero", () => {
    expect(margemBp(100, 0)).toBe(0);
    expect(margemBp(100, -5)).toBe(0);
    expect(ticketMedio(1000, 0)).toBe(0);
  });
  it("calculam normalmente", () => {
    expect(margemBp(25, 100)).toBe(2500);
    expect(ticketMedio(10_000, 4)).toBe(2500);
    expect(ticketMedio(1000, 3)).toBe(333);
  });
});

describe("preencherDias", () => {
  it("preenche dias sem venda com zero e mantém a ordem", () => {
    const de = new TZDate(2026, 8, 1, FUSO); // 1 set 2026
    const ate = new TZDate(2026, 8, 5, FUSO); // 5 set 2026
    const serie = [
      { dia: "2026-09-03", receita: 300 },
      { dia: "2026-09-01", receita: 100 },
    ];
    const cheia = preencherDias(serie, de, ate, { receita: 0 });
    expect(cheia.map((p) => p.dia)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(cheia.map((p) => p.receita)).toEqual([100, 0, 300, 0, 0]);
  });

  it("descarta dias fora do intervalo", () => {
    const de = new TZDate(2026, 8, 10, FUSO);
    const ate = new TZDate(2026, 8, 11, FUSO);
    const cheia = preencherDias([{ dia: "2026-08-31", receita: 1 }], de, ate, { receita: 0 });
    expect(cheia).toHaveLength(2);
    expect(cheia.every((p) => p.receita === 0)).toBe(true);
  });

  it("intervalo de um dia único devolve um ponto; intervalo invertido devolve vazio", () => {
    const dia = new TZDate(2026, 0, 15, FUSO);
    expect(preencherDias([], dia, dia, { receita: 0 })).toHaveLength(1);
    expect(preencherDias([], new TZDate(2026, 0, 16, FUSO), dia, { receita: 0 })).toHaveLength(0);
  });

  it("respeita o fuso: venda às 23h30 de Brasília cai no dia certo", () => {
    // 23h30 em São Paulo = 02h30 UTC do dia seguinte.
    const venda = { criadoEm: new Date("2026-09-02T02:30:00.000Z"), total: 1000, custoTotal: 600, taxasTotal: 20 };
    const agrupado = agruparVendasPorDia([venda]);
    expect(agrupado).toEqual([{ dia: "2026-09-01", receita: 1000, lucroBruto: 380, vendas: 1 }]);
  });
});

describe("agruparVendasPorDia e estatisticasDiarias", () => {
  it("soma receita, lucro bruto e cupons por dia", () => {
    const vendas = [
      { criadoEm: new Date("2026-09-01T12:00:00.000Z"), total: 1000, custoTotal: 500, taxasTotal: 0 },
      { criadoEm: new Date("2026-09-01T15:00:00.000Z"), total: 2000, custoTotal: 1000, taxasTotal: 100 },
      { criadoEm: new Date("2026-09-03T15:00:00.000Z"), total: 500, custoTotal: 100, taxasTotal: 0 },
    ];
    const dias = agruparVendasPorDia(vendas);
    expect(dias).toEqual([
      { dia: "2026-09-01", receita: 3000, lucroBruto: 1400, vendas: 2 },
      { dia: "2026-09-03", receita: 500, lucroBruto: 400, vendas: 1 },
    ]);
    const est = estatisticasDiarias(dias);
    expect(est.diasComVenda).toBe(2);
    expect(est.melhorDia).toEqual({ dia: "2026-09-01", receita: 3000 });
    expect(est.mediaPorDia).toBe(1750);
  });

  it("sem vendas devolve zeros", () => {
    expect(estatisticasDiarias([])).toEqual({ diasComVenda: 0, melhorDia: null, mediaPorDia: 0 });
    expect(estatisticasDiarias([{ dia: "2026-09-01", receita: 0, vendas: 0 }]).diasComVenda).toBe(0);
  });
});

describe("progressoMeta", () => {
  it("sem meta devolve null", () => {
    expect(progressoMeta(1000, null)).toBeNull();
    expect(progressoMeta(1000, undefined)).toBeNull();
    expect(progressoMeta(1000, 0)).toBeNull();
  });
  it("calcula percentual, falta e limite da barra", () => {
    const p = progressoMeta(250_000, 1_000_000)!;
    expect(p.percentualBp).toBe(2500);
    expect(p.percentualLimitadoBp).toBe(2500);
    expect(p.falta).toBe(750_000);
    expect(p.atingida).toBe(false);
  });
  it("meta batida trava a barra em 100% e zera o que falta", () => {
    const p = progressoMeta(1_200_000, 1_000_000)!;
    expect(p.percentualBp).toBe(12000);
    expect(p.percentualLimitadoBp).toBe(10000);
    expect(p.falta).toBe(0);
    expect(p.atingida).toBe(true);
  });
});

describe("dinheiroEsperado", () => {
  it("segue a regra do contrato", () => {
    expect(
      dinheiroEsperado({
        valorAbertura: 10_000,
        vendasDinheiro: 50_000,
        suprimentos: 5_000,
        sangrias: 20_000,
        fiadoRecebidoDinheiro: 3_000,
        despesasDoCaixa: 1_500,
      }),
    ).toBe(46_500);
  });
});

describe("fiadoAntigoEmAberto", () => {
  it("pagamentos quitam as compras antigas primeiro", () => {
    const pagamentos = [
      { clienteId: 1, valor: 3_000 },
      { clienteId: 2, valor: 10_000 },
    ];
    const antigos = [
      { clienteId: 1, valor: 8_000 }, // ainda deve 5.000 de compras antigas
      { clienteId: 2, valor: 4_000 }, // já pagou tudo que era antigo
      { clienteId: 3, valor: 2_000 }, // nunca pagou nada
    ];
    expect(fiadoAntigoEmAberto(pagamentos, antigos)).toEqual({ total: 7_000, clientes: 2 });
  });
  it("sem débitos antigos devolve zero", () => {
    expect(fiadoAntigoEmAberto([{ clienteId: 1, valor: 100 }], [])).toEqual({ total: 0, clientes: 0 });
  });
});

describe("meses", () => {
  it("navega entre meses virando o ano", () => {
    expect(mesAnterior(2026, 1)).toEqual({ ano: 2025, mes: 12 });
    expect(mesSeguinte(2026, 12)).toEqual({ ano: 2027, mes: 1 });
    expect(chaveMes(2026, 9)).toBe("2026-09");
    expect(rotuloMesCurto(2026, 9)).toBe("set/26");
    expect(compararMeses({ ano: 2026, mes: 1 }, { ano: 2025, mes: 12 })).toBeGreaterThan(0);
  });
  it("lista intervalos e últimos meses", () => {
    expect(listarMeses({ ano: 2025, mes: 11 }, { ano: 2026, mes: 2 }).map((m) => chaveMes(m.ano, m.mes))).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(listarMeses({ ano: 2026, mes: 3 }, { ano: 2026, mes: 1 })).toEqual([]);
    expect(ultimosMeses({ ano: 2026, mes: 2 }, 3).map((m) => chaveMes(m.ano, m.mes))).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
  it("rótulo curto do dia e capitalização", () => {
    expect(rotuloDiaCurto("2026-09-16")).toBe("16 set");
    expect(capitalizar("setembro de 2026")).toBe("Setembro de 2026");
    expect(capitalizar("")).toBe("");
  });
});

describe("formatarDuracao", () => {
  it("formata horas e minutos", () => {
    expect(formatarDuracao(30_000)).toBe("menos de 1min");
    expect(formatarDuracao(45 * 60_000)).toBe("45min");
    expect(formatarDuracao(2 * 3_600_000)).toBe("2h");
    expect(formatarDuracao(3 * 3_600_000 + 20 * 60_000)).toBe("3h 20min");
  });
});

describe("CSV do DRE", () => {
  it("escreve centavos com vírgula", () => {
    expect(centavosParaCsv(123456)).toBe("1234,56");
    expect(centavosParaCsv(5)).toBe("0,05");
    expect(centavosParaCsv(-1999)).toBe("-19,99");
  });
  it("gera CSV com BOM, ponto e vírgula e aspas quando precisa", () => {
    const atual = montarDre({ ...exemplo, despesas: [{ rotulo: "Internet; telefone", valor: 10_000, registros: 1 }] });
    const anterior = montarDre(DRE_VAZIA);
    const csv = montarCsvDre(linhasDre(atual, anterior), "setembro de 2026", "agosto de 2026");
    expect(csv.startsWith("﻿")).toBe(true);
    const linhas = csv.replace("﻿", "").trim().split("\r\n");
    expect(linhas[0]).toBe("Linha;setembro de 2026;agosto de 2026;Variação (%);Margem (%)");
    expect(linhas[1]).toBe("Receita bruta de vendas;10000,00;0,00;;");
    expect(linhas.find((l) => l.includes("Internet"))).toBe('"   Internet; telefone";100,00;0,00;;');
    const lucroBruto = linhas.find((l) => l.startsWith("(=) Lucro bruto"))!;
    expect(lucroBruto).toBe("(=) Lucro bruto;3800,00;0,00;;38,00");
  });
});

describe("despesaEntraNoResultado (boleto de compra não conta duas vezes)", () => {
  it("despesa manual e boleto sem entrada entram; boleto de entrada de estoque fica de fora", () => {
    expect(despesaEntraNoResultado({ contaPagar: null })).toBe(true);
    expect(despesaEntraNoResultado({ contaPagar: { entradaId: null } })).toBe(true); // aluguel, energia
    expect(despesaEntraNoResultado({ contaPagar: { entradaId: 7 } })).toBe(false); // mercadoria
  });

  it("entrada com boleto pago e venda no mesmo mês: lucro real conta o custo uma vez só", () => {
    // Entrada de 100 un a R$ 10,00 (R$ 1.000) com boleto pago no mês; vende as 100 un a R$ 15,00.
    const despesasDoMes = [
      { rotulo: "Fornecedores", valor: 100_000, registros: 1, contaPagar: { entradaId: 1 } },
      { rotulo: "Aluguel", valor: 20_000, registros: 1, contaPagar: { entradaId: null } },
    ];
    const noResultado = despesasDoMes.filter(despesaEntraNoResultado);
    const dre = montarDre({
      receitaBruta: 150_000,
      taxas: 0,
      cmv: 100_000, // custo médio que a própria entrada alimentou
      numeroVendas: 100,
      perdas: [],
      despesas: noResultado.map(({ rotulo, valor, registros }) => ({ rotulo, valor, registros })),
    });
    expect(dre.despesasTotal).toBe(20_000);
    expect(dre.lucroLiquido).toBe(30_000); // 1.500 − 1.000 (CMV) − 200 (aluguel); sem a correção daria −700
  });
});

describe("contaSemPagamentoEm (foto do fim do mês)", () => {
  const fimJulho = limitesDoMesAnoMes(2026, 7).fim;
  it("aluguel vencido em julho e pago em agosto estava atrasado no fim de julho", () => {
    const conta = { status: "PAGA", dataPagamento: new Date("2026-08-05T03:00:00.000Z") };
    expect(contaSemPagamentoEm(conta, fimJulho)).toBe(true);
    // e no fim de agosto já não estava
    expect(contaSemPagamentoEm(conta, limitesDoMesAnoMes(2026, 8).fim)).toBe(false);
  });
  it("pendente até hoje sempre conta; cancelada nunca", () => {
    expect(contaSemPagamentoEm({ status: "PENDENTE", dataPagamento: null }, fimJulho)).toBe(true);
    expect(contaSemPagamentoEm({ status: "CANCELADA", dataPagamento: null }, fimJulho)).toBe(false);
    expect(contaSemPagamentoEm({ status: "PAGA", dataPagamento: null }, fimJulho)).toBe(false);
  });
  it("paga no próprio dia da referência conta como paga", () => {
    const pagaNoDia = { status: "PAGA", dataPagamento: new Date("2026-07-31T03:00:00.000Z") };
    expect(contaSemPagamentoEm(pagaNoDia, fimJulho)).toBe(false);
  });
});

describe("períodos comparáveis", () => {
  it("mesmoTrechoDoDia corta a semana passada no mesmo horário de hoje", () => {
    const agoraData = new TZDate(2026, 8, 16, 10, 30, FUSO); // 16 set 2026, 10h30
    const trecho = mesmoTrechoDoDia(agoraData, 7);
    expect(trecho.inicio.getTime()).toBe(new TZDate(2026, 8, 9, 0, 0, 0, 0, FUSO).getTime());
    expect(trecho.fim.getTime()).toBe(new TZDate(2026, 8, 9, 10, 30, FUSO).getTime());
  });

  it("mesAnteriorAteMesmoDia vai do dia 1 até o fim do mesmo dia do mês anterior", () => {
    const agoraData = new TZDate(2026, 8, 16, 10, 30, FUSO); // dia 16 de setembro
    const trecho = mesAnteriorAteMesmoDia(2026, 9, agoraData);
    expect(trecho.dia).toBe(16);
    expect(trecho.inicio.getTime()).toBe(limitesDoMesAnoMes(2026, 8).inicio.getTime());
    expect(trecho.fim.getTime()).toBe(new TZDate(2026, 7, 16, 23, 59, 59, 999, FUSO).getTime());
  });

  it("mesAnteriorAteMesmoDia trava no último dia quando o mês anterior é mais curto", () => {
    const agoraData = new TZDate(2026, 2, 31, 9, 0, FUSO); // 31 de março; fevereiro/2026 tem 28 dias
    const trecho = mesAnteriorAteMesmoDia(2026, 3, agoraData);
    expect(trecho.dia).toBe(28);
    expect(trecho.fim.getTime()).toBe(limitesDoMesAnoMes(2026, 2).fim.getTime());
  });

  it("mesAnteriorAteMesmoDia vira o ano em janeiro", () => {
    const agoraData = new TZDate(2027, 0, 5, 12, 0, FUSO);
    const trecho = mesAnteriorAteMesmoDia(2027, 1, agoraData);
    expect(trecho.inicio.getTime()).toBe(limitesDoMesAnoMes(2026, 12).inicio.getTime());
    expect(trecho.fim.getTime()).toBe(new TZDate(2026, 11, 5, 23, 59, 59, 999, FUSO).getTime());
  });
});

describe("resumirFiadoDoMes", () => {
  const setembro = limitesDoMesAnoMes(2026, 9);
  const vendaAgosto = { criadoEm: new Date("2026-08-10T15:00:00.000Z") };
  const vendaSetembro = { criadoEm: new Date("2026-09-03T15:00:00.000Z") };

  it("perdão de dívida não é dinheiro recebido", () => {
    const lancamentos: LancamentoFiadoMes[] = [
      { tipo: "PAGAMENTO", valor: 5_000, formaPagamento: "DINHEIRO", vendaId: null, venda: null },
      { tipo: "PAGAMENTO", valor: 15_000, formaPagamento: null, vendaId: null, venda: null }, // acerto manual
    ];
    const r = resumirFiadoDoMes(lancamentos, setembro);
    expect(r.recebido).toBe(5_000);
    expect(r.abatimentos).toBe(15_000);
  });

  it("cancelar venda fiado de mês anterior não deixa o fiado novo negativo", () => {
    const lancamentos: LancamentoFiadoMes[] = [
      { tipo: "ESTORNO", valor: 30_000, formaPagamento: null, vendaId: 10, venda: vendaAgosto },
    ];
    const r = resumirFiadoDoMes(lancamentos, setembro);
    expect(r.novo).toBe(0);
    expect(r.cancelamentosAntigos).toBe(30_000);
  });

  it("venda fiado cancelada no próprio mês abate o fiado novo; dívida antiga lançada à mão vai em linha própria", () => {
    const lancamentos: LancamentoFiadoMes[] = [
      { tipo: "DEBITO", valor: 20_000, formaPagamento: null, vendaId: 20, venda: vendaSetembro },
      { tipo: "DEBITO", valor: 8_000, formaPagamento: null, vendaId: 21, venda: vendaSetembro },
      { tipo: "ESTORNO", valor: 8_000, formaPagamento: null, vendaId: 21, venda: vendaSetembro },
      { tipo: "DEBITO", valor: 50_000, formaPagamento: null, vendaId: null, venda: null }, // caderno antigo
    ];
    const r = resumirFiadoDoMes(lancamentos, setembro);
    expect(r.novo).toBe(20_000);
    expect(r.dividaAntigaLancada).toBe(50_000);
  });

  it("mantém a conciliação com a variação do saldo", () => {
    const lancamentos: LancamentoFiadoMes[] = [
      { tipo: "DEBITO", valor: 20_000, formaPagamento: null, vendaId: 20, venda: vendaSetembro },
      { tipo: "ESTORNO", valor: 30_000, formaPagamento: null, vendaId: 10, venda: vendaAgosto },
      { tipo: "PAGAMENTO", valor: 5_000, formaPagamento: "PIX", vendaId: null, venda: null },
      { tipo: "PAGAMENTO", valor: 1_000, formaPagamento: null, vendaId: null, venda: null },
      { tipo: "DEBITO", valor: 4_000, formaPagamento: null, vendaId: null, venda: null },
    ];
    const r = resumirFiadoDoMes(lancamentos, setembro);
    const variacaoSaldo = lancamentos.reduce((acc, l) => acc + (l.tipo === "DEBITO" ? l.valor : -l.valor), 0);
    expect(r.novo + r.dividaAntigaLancada - r.recebido - r.abatimentos - r.cancelamentosAntigos).toBe(variacaoSaldo);
    expect(resumirFiadoDoMes([], setembro)).toEqual({
      novo: 0,
      dividaAntigaLancada: 0,
      recebido: 0,
      abatimentos: 0,
      cancelamentosAntigos: 0,
    });
  });
});

describe("topProdutosPorReceita", () => {
  it("rateia o desconto geral do cupom como o relatório Mais vendidos", () => {
    // Cupom 1: Arroz R$ 100 + Feijão R$ 100 com desconto geral de R$ 50.
    const porProduto = [
      { produtoId: 1, quantidade: 10_000, totalBruto: 10_000 },
      { produtoId: 2, quantidade: 10_000, totalBruto: 10_000 },
    ];
    const itens = [
      { vendaId: 1, produtoId: 1, total: 10_000 },
      { vendaId: 1, produtoId: 2, total: 10_000 },
    ];
    const top = topProdutosPorReceita(porProduto, itens, new Map([[1, 5_000]]));
    expect(top.map((t) => t.receita)).toEqual([7_500, 7_500]);
    expect(top.reduce((s, t) => s + t.receita, 0)).toBe(15_000); // bate com Venda.total
  });

  it("a ordem segue a receita líquida e respeita o limite", () => {
    const porProduto = [
      { produtoId: 1, quantidade: 1_000, totalBruto: 10_000 }, // bruto maior, mas com desconto
      { produtoId: 2, quantidade: 1_000, totalBruto: 9_000 },
      { produtoId: 3, quantidade: 1_000, totalBruto: 1_000 },
    ];
    const itens = [{ vendaId: 5, produtoId: 1, total: 10_000 }];
    const top = topProdutosPorReceita(porProduto, itens, new Map([[5, 2_000]]), 2);
    expect(top.map((t) => t.produtoId)).toEqual([2, 1]);
    expect(top[1].receita).toBe(8_000);
  });

  it("sem desconto geral devolve a soma bruta", () => {
    const top = topProdutosPorReceita([{ produtoId: 9, quantidade: 500, totalBruto: 1_234 }], [], new Map());
    expect(top).toEqual([{ produtoId: 9, quantidade: 500, receita: 1_234 }]);
    expect(topProdutosPorReceita([], [], new Map())).toEqual([]);
  });
});
