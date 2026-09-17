import { describe, expect, it } from "vitest";
import {
  aniversarianteDoMes,
  calcularExtrato,
  calcularSaldo,
  debitosEmAberto,
  diaDoAniversario,
  diasEmAtraso,
  ehAjusteManual,
  escaparCsv,
  EXTRATO_POR_PAGINA,
  fiadoVencido,
  filtrarAniversariantesDoMes,
  formaPassaNaMaquininha,
  idadeEmAnos,
  iniciaisDoNome,
  lerLimiteExtrato,
  linhaCsv,
  montarCsvClientes,
  montarDespesaTaxaFiado,
  montarLinkWhatsApp,
  montarMensagemCobranca,
  montarObservacaoRecebimento,
  ordenarCronologico,
  situacaoCliente,
  somenteDigitos,
  telefoneParaWhatsApp,
  totaisFiado,
  type LancamentoBase,
  type LancamentoComOrigem,
} from "@/lib/servicos/clientes-calculos";

// Datas em UTC "meio-dia" pra não cair em virada de dia no fuso de São Paulo.
function dia(texto: string): Date {
  return new Date(`${texto}T12:00:00.000Z`);
}

function debito(id: number, valor: number, data: string, vendaId: number | null = id): LancamentoBase {
  return { id, tipo: "DEBITO", valor, criadoEm: dia(data), vendaId };
}

function pagamento(id: number, valor: number, data: string): LancamentoBase {
  return { id, tipo: "PAGAMENTO", valor, criadoEm: dia(data), vendaId: null };
}

/** Estorno de venda fiado cancelada: aponta pra venda cujo débito ele desfaz. */
function estorno(id: number, valor: number, data: string, vendaId: number | null): LancamentoBase {
  return { id, tipo: "ESTORNO", valor, criadoEm: dia(data), vendaId };
}

describe("ordenarCronologico", () => {
  it("ordena por data e desempata por id sem alterar a lista original", () => {
    const original = [debito(3, 100, "2026-09-10"), debito(1, 100, "2026-09-01"), debito(2, 100, "2026-09-01")];
    const ordenada = ordenarCronologico(original);
    expect(ordenada.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(original.map((l) => l.id)).toEqual([3, 1, 2]);
  });

  it("aceita datas em texto ISO", () => {
    const lista: LancamentoBase[] = [
      { id: 2, tipo: "DEBITO", valor: 100, criadoEm: "2026-09-05T12:00:00.000Z" },
      { id: 1, tipo: "DEBITO", valor: 100, criadoEm: "2026-09-01T12:00:00.000Z" },
    ];
    expect(ordenarCronologico(lista).map((l) => l.id)).toEqual([1, 2]);
  });
});

describe("calcularSaldo", () => {
  it("soma débitos e subtrai pagamentos", () => {
    expect(calcularSaldo([])).toBe(0);
    expect(calcularSaldo([debito(1, 5000, "2026-09-01"), pagamento(2, 2000, "2026-09-02")])).toBe(3000);
    expect(calcularSaldo([debito(1, 5000, "2026-09-01"), pagamento(2, 5000, "2026-09-02")])).toBe(0);
  });

  it("estorno de venda cancelada reduz o saldo como um pagamento", () => {
    expect(calcularSaldo([debito(1, 5000, "2026-09-01"), estorno(2, 5000, "2026-09-01", 1)])).toBe(0);
    expect(
      calcularSaldo([debito(1, 5000, "2026-09-01"), debito(2, 3000, "2026-09-02"), estorno(3, 5000, "2026-09-02", 1), pagamento(4, 1000, "2026-09-03")]),
    ).toBe(2000);
  });
});

describe("calcularExtrato", () => {
  it("calcula o saldo acumulado em ordem cronológica e devolve do mais recente pro mais antigo", () => {
    const extrato = calcularExtrato([
      pagamento(3, 3000, "2026-09-10"),
      debito(1, 5000, "2026-09-01"),
      debito(2, 2500, "2026-09-05"),
      debito(4, 1000, "2026-09-12"),
    ]);
    expect(extrato.map((l) => l.id)).toEqual([4, 3, 2, 1]);
    expect(extrato.map((l) => l.saldoApos)).toEqual([5500, 4500, 7500, 5000]);
    expect(extrato.map((l) => l.valorComSinal)).toEqual([1000, -3000, 2500, 5000]);
  });

  it("mantém os campos originais do lançamento", () => {
    const [linha] = calcularExtrato([debito(7, 1234, "2026-09-01", 99)]);
    expect(linha.id).toBe(7);
    expect(linha.vendaId).toBe(99);
    expect(linha.valor).toBe(1234);
  });

  it("lista vazia devolve extrato vazio", () => {
    expect(calcularExtrato([])).toEqual([]);
  });

  it("estorno aparece com sinal negativo e zera o débito da venda cancelada", () => {
    const extrato = calcularExtrato([debito(1, 4000, "2026-09-01"), estorno(2, 4000, "2026-09-01", 1)]);
    expect(extrato.map((l) => l.id)).toEqual([2, 1]);
    expect(extrato[0].tipo).toBe("ESTORNO");
    expect(extrato[0].valorComSinal).toBe(-4000);
    expect(extrato[0].saldoApos).toBe(0);
  });
});

describe("debitosEmAberto (FIFO)", () => {
  it("pagamentos quitam os débitos mais antigos primeiro", () => {
    const abertos = debitosEmAberto([
      debito(1, 5000, "2026-08-01"),
      debito(2, 3000, "2026-08-15"),
      debito(3, 2000, "2026-09-01"),
      pagamento(4, 6000, "2026-09-05"),
    ]);
    // 6000 cobre o débito 1 (5000) e 1000 do débito 2. Sobram 2000 do 2 e 2000 do 3.
    expect(abertos.map((a) => [a.lancamento.id, a.valorEmAberto])).toEqual([
      [2, 2000],
      [3, 2000],
    ]);
  });

  it("pagamento total zera tudo", () => {
    expect(debitosEmAberto([debito(1, 5000, "2026-08-01"), pagamento(2, 5000, "2026-09-05")])).toEqual([]);
  });

  it("pagamento feito antes do débito também abate (crédito)", () => {
    const abertos = debitosEmAberto([pagamento(1, 1000, "2026-08-01"), debito(2, 1500, "2026-08-10")]);
    expect(abertos).toHaveLength(1);
    expect(abertos[0].valorEmAberto).toBe(500);
  });

  it("sem pagamentos, todos os débitos ficam em aberto na ordem cronológica", () => {
    const abertos = debitosEmAberto([debito(2, 100, "2026-09-02"), debito(1, 200, "2026-09-01")]);
    expect(abertos.map((a) => a.lancamento.id)).toEqual([1, 2]);
  });

  it("estorno quita o débito da própria venda, não o mais antigo", () => {
    const abertos = debitosEmAberto([
      debito(1, 5000, "2026-08-01", 10),
      debito(2, 3000, "2026-08-15", 20),
      estorno(3, 3000, "2026-08-15", 20), // venda 20 cancelada
    ]);
    // Sem o estorno casar com a venda, o FIFO abateria o débito 1. Aqui o débito 1 continua inteiro.
    expect(abertos.map((a) => [a.lancamento.id, a.valorEmAberto])).toEqual([[1, 5000]]);
  });

  it("estorno sem débito correspondente vira pagamento genérico (FIFO)", () => {
    const abertos = debitosEmAberto([
      debito(1, 5000, "2026-08-01", 10),
      debito(2, 3000, "2026-08-15", 20),
      estorno(3, 2000, "2026-08-20", 99), // venda 99 não tem débito na lista
      estorno(4, 500, "2026-08-21", null),
    ]);
    expect(abertos.map((a) => [a.lancamento.id, a.valorEmAberto])).toEqual([
      [1, 2500],
      [2, 3000],
    ]);
  });

  it("estorno maior que o débito da venda: a sobra abate os outros débitos", () => {
    const abertos = debitosEmAberto([
      debito(1, 5000, "2026-08-01", 10),
      debito(2, 3000, "2026-08-15", 20),
      estorno(3, 4000, "2026-08-15", 20),
    ]);
    expect(abertos.map((a) => [a.lancamento.id, a.valorEmAberto])).toEqual([[1, 4000]]);
  });

  it("soma do que está em aberto bate com o saldo, com estornos e pagamentos misturados", () => {
    const lancamentos = [
      debito(1, 5000, "2026-08-01", 10),
      debito(2, 3000, "2026-08-15", 20),
      debito(3, 2000, "2026-09-01", 30),
      estorno(4, 3000, "2026-08-15", 20),
      pagamento(5, 1500, "2026-09-05"),
    ];
    const abertos = debitosEmAberto(lancamentos);
    expect(abertos.reduce((s, a) => s + a.valorEmAberto, 0)).toBe(calcularSaldo(lancamentos));
    expect(abertos.map((a) => [a.lancamento.id, a.valorEmAberto])).toEqual([
      [1, 3500],
      [3, 2000],
    ]);
  });
});

describe("diasEmAtraso", () => {
  const hoje = dia("2026-09-16");

  it("é 0 sem dívida", () => {
    expect(diasEmAtraso([], hoje)).toBe(0);
    expect(diasEmAtraso([debito(1, 100, "2026-08-01"), pagamento(2, 100, "2026-08-02")], hoje)).toBe(0);
  });

  it("conta a partir do débito mais antigo ainda em aberto, não do mais antigo de todos", () => {
    const lancamentos = [
      debito(1, 5000, "2026-07-01"), // quitado pelo pagamento
      debito(2, 3000, "2026-08-20"), // parcialmente em aberto
      pagamento(3, 5000, "2026-08-25"),
    ];
    expect(diasEmAtraso(lancamentos, hoje)).toBe(27);
  });

  it("débito de hoje é 0 dias", () => {
    expect(diasEmAtraso([debito(1, 100, "2026-09-16")], hoje)).toBe(0);
  });

  it("venda antiga cancelada (estorno) não conta como atraso", () => {
    const lancamentos = [
      debito(1, 5000, "2026-07-01", 10),
      estorno(2, 5000, "2026-07-01", 10),
      debito(3, 3000, "2026-09-10", 30),
    ];
    expect(diasEmAtraso(lancamentos, hoje)).toBe(6);
  });

  it("estorno da venda nova quita só ela: o débito antigo continua atrasado", () => {
    // Débito de 60 dias (venda 1) + débito de 5 dias (venda 2) cancelado no mesmo dia.
    const lancamentos = [
      debito(1, 5000, "2026-07-18", 1),
      debito(2, 8000, "2026-09-11", 2),
      estorno(3, 8000, "2026-09-11", 2),
    ];
    expect(calcularSaldo(lancamentos)).toBe(5000);
    expect(diasEmAtraso(lancamentos, hoje)).toBe(60);
    expect(fiadoVencido(diasEmAtraso(lancamentos, hoje))).toBe(true);
  });

  it("sem vendaId nos lançamentos o estorno viraria crédito genérico e esconderia o atraso (por isso a lista precisa selecionar vendaId)", () => {
    const semVenda: LancamentoBase[] = [
      { id: 1, tipo: "DEBITO", valor: 5000, criadoEm: dia("2026-07-18") },
      { id: 2, tipo: "DEBITO", valor: 8000, criadoEm: dia("2026-09-11") },
      { id: 3, tipo: "ESTORNO", valor: 8000, criadoEm: dia("2026-09-11") },
    ];
    // Mesmo saldo, dias diferentes: 8000 cobre os 5000 antigos e 3000 do novo, sobra 5000 de 5 dias.
    expect(calcularSaldo(semVenda)).toBe(5000);
    expect(diasEmAtraso(semVenda, hoje)).toBe(5);
    expect(fiadoVencido(diasEmAtraso(semVenda, hoje))).toBe(false);
  });

  it("fiadoVencido usa o limite de 30 dias", () => {
    expect(fiadoVencido(30)).toBe(false);
    expect(fiadoVencido(31)).toBe(true);
    expect(fiadoVencido(10, 5)).toBe(true);
  });
});

describe("aniversariantes", () => {
  const referencia = dia("2026-09-16");

  it("reconhece o mês do aniversário no fuso do mercado", () => {
    expect(aniversarianteDoMes(dia("1990-09-03"), referencia)).toBe(true);
    expect(aniversarianteDoMes(dia("1990-10-03"), referencia)).toBe(false);
    expect(aniversarianteDoMes(null, referencia)).toBe(false);
    // Meia-noite UTC de 1º de outubro ainda é 30 de setembro em São Paulo.
    expect(aniversarianteDoMes(new Date("1990-10-01T00:00:00.000Z"), referencia)).toBe(true);
  });

  it("filtra e ordena pelo dia do aniversário", () => {
    const clientes = [
      { nome: "Ana", dataNascimento: dia("1980-09-25") },
      { nome: "Bia", dataNascimento: dia("1975-03-02") },
      { nome: "Caio", dataNascimento: dia("2000-09-04") },
      { nome: "Dora", dataNascimento: null },
    ];
    expect(filtrarAniversariantesDoMes(clientes, referencia).map((c) => c.nome)).toEqual(["Caio", "Ana"]);
    expect(diaDoAniversario(dia("1980-09-25"))).toBe(25);
    expect(diaDoAniversario(null)).toBeNull();
  });

  it("calcula a idade completa", () => {
    expect(idadeEmAnos(dia("1990-09-16"), referencia)).toBe(36);
    expect(idadeEmAnos(dia("1990-09-17"), referencia)).toBe(35);
    expect(idadeEmAnos(dia("1990-01-01"), referencia)).toBe(36);
    expect(idadeEmAnos(null, referencia)).toBeNull();
  });
});

describe("situacaoCliente", () => {
  it("prioriza inativo, depois atraso, depois limite, depois saldo", () => {
    expect(situacaoCliente({ ativo: false, saldo: 100, limiteFiado: 0, diasAtraso: 90 }).codigo).toBe("inativo");
    expect(situacaoCliente({ ativo: true, saldo: 100, limiteFiado: 50, diasAtraso: 45 }).codigo).toBe("atrasado");
    expect(situacaoCliente({ ativo: true, saldo: 100, limiteFiado: 50, diasAtraso: 3 }).codigo).toBe("acima-do-limite");
    expect(situacaoCliente({ ativo: true, saldo: 100, limiteFiado: 500, diasAtraso: 3 }).codigo).toBe("devendo");
    expect(situacaoCliente({ ativo: true, saldo: 0, limiteFiado: 0, diasAtraso: 0 }).codigo).toBe("sem-fiado");
    expect(situacaoCliente({ ativo: true, saldo: 0, limiteFiado: 500, diasAtraso: 0 }).codigo).toBe("em-dia");
  });

  it("mostra os dias no rótulo de atrasado", () => {
    expect(situacaoCliente({ ativo: true, saldo: 100, limiteFiado: 500, diasAtraso: 45 }).rotulo).toBe("Atrasado há 45 dias");
  });

  it("saldo negativo é crédito do cliente, não 'em dia' nem 'sem fiado'", () => {
    const comLimite = situacaoCliente({ ativo: true, saldo: -10000, limiteFiado: 500, diasAtraso: 0 });
    expect(comLimite.codigo).toBe("credito");
    expect(comLimite.rotulo).toBe("Crédito de R$ 100,00");
    expect(comLimite.tom).toBe("info");
    expect(situacaoCliente({ ativo: true, saldo: -1, limiteFiado: 0, diasAtraso: 0 }).codigo).toBe("credito");
    // Inativo continua na frente de tudo.
    expect(situacaoCliente({ ativo: false, saldo: -10000, limiteFiado: 500, diasAtraso: 0 }).codigo).toBe("inativo");
  });
});

describe("ajuste manual e totais do fiado", () => {
  function comOrigem(
    id: number,
    tipo: LancamentoComOrigem["tipo"],
    valor: number,
    extra: { vendaId?: number | null; formaPagamento?: string | null } = {},
  ): LancamentoComOrigem {
    return { id, tipo, valor, criadoEm: dia("2026-09-01"), vendaId: extra.vendaId ?? null, formaPagamento: extra.formaPagamento ?? null };
  }

  it("ehAjusteManual reconhece DEBITO e PAGAMENTO sem venda e sem forma; ESTORNO nunca", () => {
    expect(ehAjusteManual(comOrigem(1, "DEBITO", 100))).toBe(true);
    expect(ehAjusteManual(comOrigem(2, "DEBITO", 100, { vendaId: 7 }))).toBe(false);
    expect(ehAjusteManual(comOrigem(3, "PAGAMENTO", 100))).toBe(true);
    expect(ehAjusteManual(comOrigem(4, "PAGAMENTO", 100, { formaPagamento: "DINHEIRO" }))).toBe(false);
    expect(ehAjusteManual(comOrigem(5, "ESTORNO", 100))).toBe(false);
    expect(ehAjusteManual(comOrigem(6, "ESTORNO", 100, { vendaId: 7 }))).toBe(false);
  });

  it("desconto/perdão manual não conta como dinheiro pago", () => {
    // Deve 100, dono perdoa 20 (ajuste), cliente paga 80 em dinheiro.
    const lancamentos = [
      comOrigem(1, "DEBITO", 10000, { vendaId: 1 }),
      comOrigem(2, "PAGAMENTO", 2000),
      comOrigem(3, "PAGAMENTO", 8000, { formaPagamento: "DINHEIRO" }),
    ];
    expect(totaisFiado(lancamentos)).toEqual({ comprado: 10000, pago: 8000, abatido: 2000 });
    expect(calcularSaldo(lancamentos)).toBe(0);
  });

  it("venda cancelada sai do comprado; dívida do caderno entra", () => {
    const lancamentos = [
      comOrigem(1, "DEBITO", 5000, { vendaId: 1 }),
      comOrigem(2, "ESTORNO", 5000, { vendaId: 1 }),
      comOrigem(3, "DEBITO", 3000), // caderno antigo (ajuste manual)
      comOrigem(4, "PAGAMENTO", 1000, { formaPagamento: "PIX" }),
    ];
    expect(totaisFiado(lancamentos)).toEqual({ comprado: 3000, pago: 1000, abatido: 0 });
    expect(totaisFiado([])).toEqual({ comprado: 0, pago: 0, abatido: 0 });
  });
});

describe("recebimento em cartão/Pix", () => {
  it("só Pix, débito e crédito passam na maquininha", () => {
    expect(formaPassaNaMaquininha("PIX")).toBe(true);
    expect(formaPassaNaMaquininha("DEBITO")).toBe(true);
    expect(formaPassaNaMaquininha("CREDITO")).toBe(true);
    expect(formaPassaNaMaquininha("DINHEIRO")).toBe(false);
    expect(formaPassaNaMaquininha("FIADO")).toBe(false);
  });

  it("observação leva maquininha e NSU na frente e o texto do operador depois", () => {
    expect(montarObservacaoRecebimento({ observacao: null, maquininhaNome: null, nsu: null })).toBeNull();
    expect(montarObservacaoRecebimento({ observacao: "  ", maquininhaNome: null, nsu: null })).toBeNull();
    expect(montarObservacaoRecebimento({ observacao: "pagou com o filho", maquininhaNome: null, nsu: null })).toBe("pagou com o filho");
    expect(montarObservacaoRecebimento({ observacao: null, maquininhaNome: "Sipag", nsu: null })).toBe("Sipag");
    expect(montarObservacaoRecebimento({ observacao: null, maquininhaNome: "Sipag", nsu: "123456" })).toBe("Sipag · NSU 123456");
    expect(montarObservacaoRecebimento({ observacao: " combinou o resto ", maquininhaNome: "InfinitePay", nsu: "9" })).toBe(
      "InfinitePay · NSU 9 · combinou o resto",
    );
  });

  it("despesa da taxa descreve cliente, maquininha, valor e percentual", () => {
    const d = montarDespesaTaxaFiado({
      forma: "CREDITO",
      rotuloForma: "Cartão de crédito",
      clienteNome: "Maria da Silva",
      maquininhaNome: "InfinitePay",
      valorRecebido: 30000,
      taxaPercentual: 350,
      taxaFixa: 0,
      taxaValor: 1050,
      lancamentoId: 42,
      nsu: "778899",
    });
    expect(d.descricao).toBe("Taxa de cartão de crédito · fiado de Maria da Silva");
    expect(d.observacao).toContain("pela InfinitePay");
    expect(d.observacao).toContain("R$ 300,00");
    expect(d.observacao).toContain("3,50%");
    expect(d.observacao).toContain("nº 42");
    expect(d.observacao).toContain("NSU 778899");
    expect(d.observacao).toContain("não saiu do caixa");
  });

  it("sem maquininha (Pix da conta) cita a configuração da forma e a taxa fixa", () => {
    const d = montarDespesaTaxaFiado({
      forma: "PIX",
      rotuloForma: "Pix",
      clienteNome: "Zé",
      maquininhaNome: null,
      valorRecebido: 10000,
      taxaPercentual: 99,
      taxaFixa: 50,
      taxaValor: 149,
      lancamentoId: 7,
      nsu: null,
    });
    expect(d.descricao).toBe("Taxa de pix · fiado de Zé");
    expect(d.observacao).toContain("pela configuração da forma de pagamento");
    expect(d.observacao).toContain("0,99% + R$ 0,50 fixo");
    expect(d.observacao).not.toContain("NSU");
  });
});

describe("lerLimiteExtrato", () => {
  it("padrão, número, todos e lixo", () => {
    expect(lerLimiteExtrato(undefined)).toBe(EXTRATO_POR_PAGINA);
    expect(lerLimiteExtrato(null)).toBe(EXTRATO_POR_PAGINA);
    expect(lerLimiteExtrato("")).toBe(EXTRATO_POR_PAGINA);
    expect(lerLimiteExtrato("100")).toBe(100);
    expect(lerLimiteExtrato("todos")).toBeNull();
    expect(lerLimiteExtrato("0")).toBe(EXTRATO_POR_PAGINA);
    expect(lerLimiteExtrato("-5")).toBe(EXTRATO_POR_PAGINA);
    expect(lerLimiteExtrato("abc")).toBe(EXTRATO_POR_PAGINA);
    expect(lerLimiteExtrato("1e3")).toBe(EXTRATO_POR_PAGINA);
  });
});

describe("WhatsApp", () => {
  it("normaliza o telefone com DDI 55", () => {
    expect(telefoneParaWhatsApp("(35) 99217-3959")).toBe("5535992173959");
    expect(telefoneParaWhatsApp("35992173959")).toBe("5535992173959");
    expect(telefoneParaWhatsApp("3532311234")).toBe("553532311234");
    expect(telefoneParaWhatsApp("+55 35 99217-3959")).toBe("5535992173959");
    expect(telefoneParaWhatsApp("035 99217-3959")).toBe("5535992173959");
  });

  it("rejeita telefone curto ou vazio", () => {
    expect(telefoneParaWhatsApp("1234")).toBeNull();
    expect(telefoneParaWhatsApp("")).toBeNull();
    expect(telefoneParaWhatsApp(null)).toBeNull();
  });

  it("monta a mensagem com nome da loja, saldo e itens em aberto", () => {
    const msg = montarMensagemCobranca({
      nomeLoja: "Uay Market",
      nomeCliente: "Maria da Silva",
      saldo: 12550,
      itensEmAberto: [
        { data: dia("2026-09-01"), valor: 10000, numeroVenda: 123 },
        { data: dia("2026-09-10"), valor: 2550, numeroVenda: null },
      ],
    });
    expect(msg).toContain("Olá, Maria!");
    expect(msg).toContain("Uay Market");
    expect(msg).toContain("R$ 125,50");
    expect(msg).toContain("01/09/2026: R$ 100,00 (cupom nº 123)");
    expect(msg).toContain("10/09/2026: R$ 25,50");
    expect(msg).not.toContain("undefined");
  });

  it("resume quando há mais de 10 itens em aberto", () => {
    const itens = Array.from({ length: 12 }, (_, i) => ({ data: dia("2026-09-01"), valor: 100, numeroVenda: i + 1 }));
    const msg = montarMensagemCobranca({ nomeLoja: "Loja", nomeCliente: "Zé", saldo: 1200, itensEmAberto: itens });
    expect(msg).toContain("e mais 2 lançamento(s)");
    expect(msg).not.toContain("cupom nº 11");
  });

  it("monta o link wa.me com a mensagem codificada", () => {
    const link = montarLinkWhatsApp("(35) 99217-3959", "Olá, Maria! Saldo: R$ 10,00");
    expect(link).toBe("https://wa.me/5535992173959?text=Ol%C3%A1%2C%20Maria!%20Saldo%3A%20R%24%2010%2C00");
    expect(montarLinkWhatsApp("", "x")).toBeNull();
  });
});

describe("CSV", () => {
  it("escapa aspas, ponto e vírgula e quebras de linha", () => {
    expect(escaparCsv("simples")).toBe("simples");
    expect(escaparCsv("a;b")).toBe('"a;b"');
    expect(escaparCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(escaparCsv("linha1\nlinha2")).toBe('"linha1\nlinha2"');
    expect(escaparCsv(null)).toBe("");
    expect(escaparCsv(42)).toBe("42");
  });

  it("monta a linha com separador ;", () => {
    expect(linhaCsv(["Maria", "123", null, 10])).toBe("Maria;123;;10");
  });

  it("gera o arquivo com BOM, cabeçalho e valores em reais", () => {
    const csv = montarCsvClientes([
      {
        nome: "Maria; da Silva",
        cpf: "123.456.789-01",
        telefone: "(35) 99217-3959",
        email: "",
        endereco: "Rua A, 10",
        dataNascimento: "03/09/1990",
        limiteFiado: 20000,
        saldo: 12550,
        diasAtraso: 12,
        ultimaCompra: "10/09/2026",
        situacao: "Devendo",
        ativo: true,
      },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    const linhas = csv.replace("﻿", "").trim().split("\r\n");
    expect(linhas).toHaveLength(2);
    expect(linhas[0].startsWith("Nome;CPF;Telefone")).toBe(true);
    expect(linhas[1]).toBe('"Maria; da Silva";123.456.789-01;(35) 99217-3959;;Rua A, 10;03/09/1990;200,00;125,50;12;10/09/2026;Devendo;Sim');
  });
});

describe("utilitários de cadastro", () => {
  it("somenteDigitos limpa máscara e devolve null pra vazio", () => {
    expect(somenteDigitos("123.456.789-01")).toBe("12345678901");
    expect(somenteDigitos("(35) 99217-3959")).toBe("35992173959");
    expect(somenteDigitos("")).toBeNull();
    expect(somenteDigitos("abc")).toBeNull();
    expect(somenteDigitos(null)).toBeNull();
  });

  it("iniciaisDoNome pega primeira e última", () => {
    expect(iniciaisDoNome("Maria da Silva")).toBe("MS");
    expect(iniciaisDoNome("Zé")).toBe("ZÉ");
    expect(iniciaisDoNome("   ")).toBe("?");
  });
});
