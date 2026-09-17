import { describe, expect, it } from "vitest";
import { paraDataInput, parseDataInput } from "@/lib/datas";
import {
  agruparPorDia,
  chaveMes,
  classificarConta,
  classificarPorDias,
  dataMensal,
  diasAteVencimento,
  diasDecorridosNoMes,
  diferencaPagamento,
  formatarVariacao,
  gerarParcelas,
  gradeDoMes,
  mediaDiaria,
  mesAnterior,
  mesDe,
  mesSeguinte,
  proximoVencimentoMensal,
  proximoVencimentoRecorrente,
  resumirPendentes,
  rotuloParcela,
  rotuloRecorrencia,
  totaisPorCategoria,
  transportarParaMes,
  variacaoPercentual,
} from "@/lib/servicos/financeiro-calculos";

function dia(texto: string): Date {
  const d = parseDataInput(texto);
  if (!d) throw new Error(`data inválida no teste: ${texto}`);
  return d;
}

describe("gerarParcelas", () => {
  it("gera uma data por mês mantendo o dia", () => {
    const datas = gerarParcelas(dia("2026-03-10"), 4).map(paraDataInput);
    expect(datas).toEqual(["2026-03-10", "2026-04-10", "2026-05-10", "2026-06-10"]);
  });

  it("ajusta pro último dia quando o mês é mais curto (31/01 -> 28/02) e volta pro 31 depois", () => {
    const datas = gerarParcelas(dia("2026-01-31"), 4).map(paraDataInput);
    expect(datas).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("respeita ano bissexto", () => {
    const datas = gerarParcelas(dia("2028-01-30"), 2).map(paraDataInput);
    expect(datas).toEqual(["2028-01-30", "2028-02-29"]);
  });

  it("atravessa a virada do ano", () => {
    const datas = gerarParcelas(dia("2026-11-15"), 3).map(paraDataInput);
    expect(datas).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
  });

  it("uma parcela devolve só o próprio vencimento; valores inválidos viram 1", () => {
    expect(gerarParcelas(dia("2026-05-05"), 1).map(paraDataInput)).toEqual(["2026-05-05"]);
    expect(gerarParcelas(dia("2026-05-05"), 0).map(paraDataInput)).toEqual(["2026-05-05"]);
  });

  it("proximoVencimentoMensal é o mês seguinte com o mesmo dia", () => {
    expect(paraDataInput(proximoVencimentoMensal(dia("2026-08-31")))).toBe("2026-09-30");
    expect(paraDataInput(proximoVencimentoMensal(dia("2026-12-05")))).toBe("2027-01-05");
  });

  it("proximoVencimentoRecorrente volta pro dia original depois de um mês curto (31/01 -> 28/02 -> 31/03)", () => {
    const fev = proximoVencimentoRecorrente(dia("2026-01-31"), 31);
    expect(paraDataInput(fev)).toBe("2026-02-28");
    const mar = proximoVencimentoRecorrente(fev, 31);
    expect(paraDataInput(mar)).toBe("2026-03-31");
    expect(paraDataInput(proximoVencimentoRecorrente(mar, 31))).toBe("2026-04-30");
  });

  it("proximoVencimentoRecorrente mantém o dia quando ele existe (30/04 -> 30/05)", () => {
    expect(paraDataInput(proximoVencimentoRecorrente(dia("2026-04-30"), 30))).toBe("2026-05-30");
    expect(paraDataInput(proximoVencimentoRecorrente(dia("2026-05-10"), 10))).toBe("2026-06-10");
  });

  it("proximoVencimentoRecorrente respeita bissexto e virada de ano", () => {
    expect(paraDataInput(proximoVencimentoRecorrente(dia("2028-01-31"), 31))).toBe("2028-02-29");
    expect(paraDataInput(proximoVencimentoRecorrente(dia("2026-12-31"), 31))).toBe("2027-01-31");
  });

  it("proximoVencimentoRecorrente sem dia guardado usa o dia do vencimento atual (comportamento antigo)", () => {
    expect(paraDataInput(proximoVencimentoRecorrente(dia("2026-02-28"), null))).toBe("2026-03-28");
    expect(paraDataInput(proximoVencimentoRecorrente(dia("2026-02-28"), undefined))).toBe("2026-03-28");
    expect(paraDataInput(proximoVencimentoRecorrente(dia("2026-02-28"), 0))).toBe("2026-03-28");
  });

  it("proximoVencimentoRecorrente permite ajustar o dia da recorrência (vencimento 05, conta passa a vencer dia 20)", () => {
    expect(paraDataInput(proximoVencimentoRecorrente(dia("2026-09-05"), 20))).toBe("2026-10-20");
  });

  it("rotuloRecorrencia mostra o dia guardado", () => {
    expect(rotuloRecorrencia(31)).toBe("todo dia 31");
    expect(rotuloRecorrencia(5)).toBe("todo dia 5");
    expect(rotuloRecorrencia(null)).toBe("todo mês");
    expect(rotuloRecorrencia(undefined)).toBe("todo mês");
  });

  it("dataMensal aceita índice de mês estourado e dia fora do limite", () => {
    expect(paraDataInput(dataMensal(2026, 12, 31))).toBe("2027-01-31");
    expect(paraDataInput(dataMensal(2026, 1, 31))).toBe("2026-02-28");
    expect(paraDataInput(dataMensal(2026, -1, 10))).toBe("2025-12-10");
    expect(paraDataInput(dataMensal(2026, 3, 0))).toBe("2026-04-01");
  });

  it("transportarParaMes leva a despesa pro mesmo dia em outro mês", () => {
    expect(paraDataInput(transportarParaMes(dia("2026-08-31"), { ano: 2026, mes: 9 }))).toBe("2026-09-30");
    expect(paraDataInput(transportarParaMes(dia("2026-08-05"), { ano: 2026, mes: 9 }))).toBe("2026-09-05");
  });
});

describe("classificação por faixa de vencimento", () => {
  it("classifica pelos dias", () => {
    expect(classificarPorDias(-1)).toBe("atrasada");
    expect(classificarPorDias(-40)).toBe("atrasada");
    expect(classificarPorDias(0)).toBe("hoje");
    expect(classificarPorDias(1)).toBe("7d");
    expect(classificarPorDias(7)).toBe("7d");
    expect(classificarPorDias(8)).toBe("30d");
    expect(classificarPorDias(30)).toBe("30d");
    expect(classificarPorDias(31)).toBe("futura");
  });

  it("calcula dias corridos entre a referência e o vencimento", () => {
    const hoje = dia("2026-09-16");
    expect(diasAteVencimento(dia("2026-09-16"), hoje)).toBe(0);
    expect(diasAteVencimento(dia("2026-09-23"), hoje)).toBe(7);
    expect(diasAteVencimento(dia("2026-09-10"), hoje)).toBe(-6);
    expect(classificarConta(dia("2026-09-10"), hoje)).toBe("atrasada");
    expect(classificarConta(dia("2026-09-16"), hoje)).toBe("hoje");
    expect(classificarConta(dia("2026-09-20"), hoje)).toBe("7d");
    expect(classificarConta(dia("2026-10-10"), hoje)).toBe("30d");
    expect(classificarConta(dia("2026-12-01"), hoje)).toBe("futura");
  });

  it("resume as pendentes por faixa somando valores e contando", () => {
    const hoje = dia("2026-09-16");
    const contas = [
      { vencimento: dia("2026-09-01"), valor: 10000 },
      { vencimento: dia("2026-09-15"), valor: 5000 },
      { vencimento: dia("2026-09-16"), valor: 2000 },
      { vencimento: dia("2026-09-20"), valor: 3000 },
      { vencimento: dia("2026-10-05"), valor: 7000 },
      { vencimento: dia("2027-01-01"), valor: 100 },
    ];
    const r = resumirPendentes(contas, hoje);
    expect(r.atrasada).toEqual({ total: 15000, quantidade: 2 });
    expect(r.hoje).toEqual({ total: 2000, quantidade: 1 });
    expect(r["7d"]).toEqual({ total: 3000, quantidade: 1 });
    expect(r["30d"]).toEqual({ total: 7000, quantidade: 1 });
    expect(r.futura).toEqual({ total: 100, quantidade: 1 });
    expect(r.proximos7).toEqual({ total: 5000, quantidade: 2 });
    expect(r.proximos30).toEqual({ total: 12000, quantidade: 3 });
    expect(r.todas).toEqual({ total: 27100, quantidade: 6 });
  });

  it("lista vazia devolve tudo zerado", () => {
    const r = resumirPendentes([], dia("2026-09-16"));
    expect(r.todas).toEqual({ total: 0, quantidade: 0 });
    expect(r.atrasada.total).toBe(0);
  });
});

describe("totaisPorCategoria", () => {
  it("soma por categoria e ordena da maior pra menor", () => {
    const r = totaisPorCategoria([
      { valor: 1000, categoria: "Energia" },
      { valor: 2500, categoria: "Aluguel" },
      { valor: 500, categoria: "Energia" },
      { valor: 300, categoria: null },
      { valor: 200, categoria: "" },
    ]);
    expect(r).toEqual([
      { categoria: "Aluguel", total: 2500, quantidade: 1 },
      { categoria: "Energia", total: 1500, quantidade: 2 },
      { categoria: "Sem categoria", total: 500, quantidade: 2 },
    ]);
  });

  it("desempata pelo nome", () => {
    const r = totaisPorCategoria([
      { valor: 100, categoria: "Zeta" },
      { valor: 100, categoria: "Alfa" },
    ]);
    expect(r.map((x) => x.categoria)).toEqual(["Alfa", "Zeta"]);
  });

  it("lista vazia devolve vazio", () => {
    expect(totaisPorCategoria([])).toEqual([]);
  });
});

describe("variacaoPercentual", () => {
  it("calcula em pontos-base", () => {
    expect(variacaoPercentual(11000, 10000)).toBe(1000); // +10%
    expect(variacaoPercentual(9000, 10000)).toBe(-1000); // -10%
    expect(variacaoPercentual(10000, 10000)).toBe(0);
    expect(variacaoPercentual(15000, 10000)).toBe(5000);
  });

  it("trata divisão por zero", () => {
    expect(variacaoPercentual(0, 0)).toBe(0);
    expect(variacaoPercentual(500, 0)).toBeNull();
  });

  it("formata com sinal e uma casa", () => {
    expect(formatarVariacao(1250)).toBe("+12,5%");
    expect(formatarVariacao(-300)).toBe("-3,0%");
    expect(formatarVariacao(0)).toBe("0,0%");
    expect(formatarVariacao(null)).toBe("sem base de comparação");
  });
});

describe("média diária e dias decorridos", () => {
  it("mediaDiaria arredonda e protege contra zero", () => {
    expect(mediaDiaria(30000, 30)).toBe(1000);
    expect(mediaDiaria(1001, 3)).toBe(334);
    expect(mediaDiaria(5000, 0)).toBe(0);
  });

  it("diasDecorridosNoMes considera mês atual, passado e futuro", () => {
    const hoje = dia("2026-09-16");
    expect(diasDecorridosNoMes({ ano: 2026, mes: 9 }, hoje)).toBe(16);
    expect(diasDecorridosNoMes({ ano: 2026, mes: 8 }, hoje)).toBe(31);
    expect(diasDecorridosNoMes({ ano: 2026, mes: 2 }, hoje)).toBe(28);
    expect(diasDecorridosNoMes({ ano: 2026, mes: 10 }, hoje)).toBe(0);
    expect(diasDecorridosNoMes({ ano: 2027, mes: 1 }, hoje)).toBe(0);
  });
});

describe("navegação de meses", () => {
  it("anda pra frente e pra trás inclusive na virada do ano", () => {
    expect(mesAnterior({ ano: 2026, mes: 1 })).toEqual({ ano: 2025, mes: 12 });
    expect(mesSeguinte({ ano: 2026, mes: 12 })).toEqual({ ano: 2027, mes: 1 });
    expect(mesAnterior({ ano: 2026, mes: 6 })).toEqual({ ano: 2026, mes: 5 });
    expect(mesSeguinte({ ano: 2026, mes: 6 })).toEqual({ ano: 2026, mes: 7 });
  });

  it("chaveMes e mesDe", () => {
    expect(chaveMes({ ano: 2026, mes: 3 })).toBe("2026-03");
    expect(mesDe(dia("2026-09-16"))).toEqual({ ano: 2026, mes: 9 });
  });
});

describe("calendário", () => {
  it("gradeDoMes monta as semanas de domingo a sábado", () => {
    // Setembro de 2026 começa numa terça (2) e tem 30 dias.
    const g = gradeDoMes({ ano: 2026, mes: 9 });
    expect(g.totalDias).toBe(30);
    expect(g.primeiroDiaSemana).toBe(2);
    expect(g.semanas[0]).toEqual([null, null, 1, 2, 3, 4, 5]);
    expect(g.semanas.at(-1)).toEqual([27, 28, 29, 30, null, null, null]);
    expect(g.semanas.every((s) => s.length === 7)).toBe(true);
  });

  it("agruparPorDia soma e ordena", () => {
    const grupos = agruparPorDia([
      { dia: 10, valor: 100, id: 1 },
      { dia: 2, valor: 50, id: 2 },
      { dia: 10, valor: 25, id: 3 },
    ]);
    expect(grupos.map((g) => g.dia)).toEqual([2, 10]);
    expect(grupos[1].total).toBe(125);
    expect(grupos[1].itens.map((i) => i.id)).toEqual([1, 3]);
  });
});

describe("pagamento e parcelas", () => {
  it("diferencaPagamento sinaliza juros e desconto", () => {
    expect(diferencaPagamento(10000, 10250)).toBe(250);
    expect(diferencaPagamento(10000, 9800)).toBe(-200);
    expect(diferencaPagamento(10000, 10000)).toBe(0);
  });

  it("rotuloParcela só aparece quando há parcelamento", () => {
    expect(rotuloParcela(2, 6)).toBe("2/6");
    expect(rotuloParcela(1, 1)).toBe("");
    expect(rotuloParcela(null, null)).toBe("");
  });
});
