import { describe, expect, it } from "vitest";
import {
  agruparItensPorProduto,
  brutoItem,
  calcularTaxasPagamentos,
  calcularTotais,
  calcularTroco,
  conferirIntencaoMp,
  conferirPrecoReferencia,
  contarProdutosDistintos,
  custoItem,
  descontoGeralEmCentavos,
  distribuirFefo,
  dividirDesconto,
  dividirItemPorLotes,
  ehMercadoPago,
  erroDeConcorrencia,
  limiteDesconto,
  podeCancelarVenda,
  quantidadeValida,
  restantePagar,
  taxaDaMaquininha,
  tetoDescontoParaPapel,
  totalItem,
  validarDescontoMaximo,
  validarPagamentos,
} from "@/lib/servicos/vendas-calculos";

describe("arredondamento de produto por quilo", () => {
  it("0,350 kg × R$ 19,90 arredonda 696,5 pra 697 centavos", () => {
    expect(brutoItem({ quantidade: 350, precoUnitario: 1990 })).toBe(697);
  });

  it("0,333 kg × R$ 29,90 = 995,67 -> 996", () => {
    expect(brutoItem({ quantidade: 333, precoUnitario: 2990 })).toBe(996);
  });

  it("1,275 kg × R$ 8,49 = 1082,475 -> 1082", () => {
    expect(brutoItem({ quantidade: 1275, precoUnitario: 849 })).toBe(1082);
  });

  it("total do item nunca fica negativo com desconto maior que o bruto", () => {
    expect(totalItem({ quantidade: 1000, precoUnitario: 500, desconto: 900 })).toBe(0);
  });

  it("quantidade por unidade precisa ser inteira; quilo aceita fração", () => {
    expect(quantidadeValida(2000, "UN")).toBe(true);
    expect(quantidadeValida(1500, "UN")).toBe(false);
    expect(quantidadeValida(350, "KG")).toBe(true);
    expect(quantidadeValida(0, "KG")).toBe(false);
    expect(quantidadeValida(-1000, "UN")).toBe(false);
  });
});

describe("calcularTotais", () => {
  const itens = [
    { quantidade: 2000, precoUnitario: 599, desconto: 0 }, // 11,98
    { quantidade: 350, precoUnitario: 1990, desconto: 50 }, // 6,97 - 0,50 = 6,47
  ];

  it("soma bruto, descontos por item, subtotal e total", () => {
    const t = calcularTotais(itens, 0);
    expect(t.bruto).toBe(1198 + 697);
    expect(t.descontoItens).toBe(50);
    expect(t.subtotal).toBe(1845);
    expect(t.descontoGeral).toBe(0);
    expect(t.total).toBe(1845);
  });

  it("aplica desconto geral em valor e limita ao subtotal", () => {
    expect(calcularTotais(itens, 300).total).toBe(1545);
    const exagerado = calcularTotais(itens, 99999);
    expect(exagerado.descontoGeral).toBe(1845);
    expect(exagerado.total).toBe(0);
    expect(calcularTotais(itens, -100).descontoGeral).toBe(0);
  });

  it("converte desconto percentual em centavos sobre o subtotal", () => {
    expect(descontoGeralEmCentavos(1845, "PERCENTUAL", 1000)).toBe(185); // 10% de 18,45 = 1,845 -> 185
    expect(descontoGeralEmCentavos(1845, "VALOR", 300)).toBe(300);
    expect(descontoGeralEmCentavos(1845, "VALOR", 5000)).toBe(1845);
    expect(descontoGeralEmCentavos(0, "PERCENTUAL", 1000)).toBe(0);
  });

  it("carrinho vazio zera tudo", () => {
    const t = calcularTotais([], 500);
    expect(t.total).toBe(0);
    expect(t.descontoGeral).toBe(0);
  });
});

describe("desconto máximo por papel", () => {
  const config = { permitirDescontoOperador: true, descontoMaximoPercentual: 1000 };

  it("ADMIN não tem teto", () => {
    expect(tetoDescontoParaPapel("ADMIN", config)).toBeNull();
    expect(limiteDesconto(10000, null)).toBeNull();
    expect(validarDescontoMaximo(10000, 9999, null).ok).toBe(true);
  });

  it("OPERADOR respeita o percentual configurado sobre o bruto", () => {
    expect(tetoDescontoParaPapel("OPERADOR", config)).toBe(1000);
    expect(limiteDesconto(10000, 1000)).toBe(1000);
    expect(validarDescontoMaximo(10000, 1000, 1000).ok).toBe(true);
    const r = validarDescontoMaximo(10000, 1001, 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.maximo).toBe(1000);
      expect(r.mensagem).toContain("10,00");
    }
  });

  it("OPERADOR sem permissão não dá desconto nenhum", () => {
    expect(tetoDescontoParaPapel("OPERADOR", { ...config, permitirDescontoOperador: false })).toBe(0);
    const r = validarDescontoMaximo(10000, 1, 0);
    expect(r.ok).toBe(false);
    expect(validarDescontoMaximo(10000, 0, 0).ok).toBe(true);
  });
});

describe("FEFO", () => {
  const lotes = [
    { id: 1, quantidade: 2000 }, // vence primeiro
    { id: 2, quantidade: 0 }, // zerado, deve ser ignorado
    { id: 3, quantidade: 5000 },
  ];

  it("baixa do primeiro lote quando ele cobre tudo", () => {
    expect(distribuirFefo(lotes, 1500)).toEqual({ porLote: [{ loteId: 1, quantidade: 1500 }], semLote: 0 });
  });

  it("divide entre lotes pulando os zerados", () => {
    expect(distribuirFefo(lotes, 3000)).toEqual({
      porLote: [
        { loteId: 1, quantidade: 2000 },
        { loteId: 3, quantidade: 1000 },
      ],
      semLote: 0,
    });
  });

  it("lotes insuficientes: o restante sai sem lote e nenhum lote fica negativo", () => {
    const r = distribuirFefo(lotes, 9000);
    expect(r.porLote).toEqual([
      { loteId: 1, quantidade: 2000 },
      { loteId: 3, quantidade: 5000 },
    ]);
    expect(r.semLote).toBe(2000);
    expect(r.porLote.reduce((a, p) => a + p.quantidade, 0) + r.semLote).toBe(9000);
  });

  it("sem lotes, tudo sai sem lote", () => {
    expect(distribuirFefo([], 1000)).toEqual({ porLote: [], semLote: 1000 });
  });

  it("divide o desconto proporcionalmente e a soma fecha", () => {
    expect(dividirDesconto(100, [1000, 1000, 1000])).toEqual([33, 33, 34]);
    expect(dividirDesconto(0, [1000, 2000])).toEqual([0, 0]);
    expect(dividirDesconto(50, [])).toEqual([]);
  });

  it("dividir item por lotes mantém o total da linha exato", () => {
    const item = { quantidade: 1500, precoUnitario: 333, desconto: 20 };
    const totalLinhaInteira = totalItem(item); // round(499,5) - 20 = 480
    const { partes, total } = dividirItemPorLotes(item, distribuirFefo([{ id: 7, quantidade: 1000 }], 1500));
    expect(total).toBe(totalLinhaInteira);
    expect(partes).toHaveLength(2);
    expect(partes[0].loteId).toBe(7);
    expect(partes[1].loteId).toBeNull();
    expect(partes.reduce((a, p) => a + p.quantidade, 0)).toBe(1500);
    expect(partes.reduce((a, p) => a + p.desconto, 0)).toBe(20);
    expect(partes.reduce((a, p) => a + p.total, 0)).toBe(totalLinhaInteira);
  });

  it("item sem lote vira uma parte única", () => {
    const item = { quantidade: 2000, precoUnitario: 500, desconto: 0 };
    const { partes } = dividirItemPorLotes(item, distribuirFefo([], 2000));
    expect(partes).toEqual([{ loteId: null, quantidade: 2000, desconto: 0, total: 1000 }]);
  });
});

describe("pagamentos e troco", () => {
  it("troco nunca é negativo", () => {
    expect(calcularTroco(1845, 2000)).toBe(155);
    expect(calcularTroco(1845, 1845)).toBe(0);
    expect(calcularTroco(1845, 1000)).toBe(0);
  });

  it("aceita soma exata com troco em dinheiro", () => {
    const r = validarPagamentos(1845, [{ forma: "DINHEIRO", valor: 1845, valorRecebido: 2000 }]);
    expect(r).toEqual({ ok: true, soma: 1845, troco: 155 });
  });

  it("aceita pagamento misto (parte dinheiro com troco, parte cartão)", () => {
    const r = validarPagamentos(10000, [
      { forma: "DINHEIRO", valor: 6000, valorRecebido: 10000 },
      { forma: "CREDITO", valor: 4000, parcelas: 2 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.soma).toBe(10000);
    expect(r.troco).toBe(4000);
  });

  it("recusa soma diferente do total", () => {
    const falta = validarPagamentos(10000, [{ forma: "PIX", valor: 9000 }]);
    expect(falta.ok).toBe(false);
    if (!falta.ok) expect(falta.mensagem).toContain("10,00");
    const sobra = validarPagamentos(10000, [{ forma: "PIX", valor: 11000 }]);
    expect(sobra.ok).toBe(false);
  });

  it("recusa dinheiro recebido menor que o valor e troco fora do dinheiro", () => {
    expect(validarPagamentos(1000, [{ forma: "DINHEIRO", valor: 1000, valorRecebido: 900 }]).ok).toBe(false);
    expect(validarPagamentos(1000, [{ forma: "PIX", valor: 1000, valorRecebido: 1200 }]).ok).toBe(false);
  });

  it("recusa valor zero, parcelas fora do crédito e lista vazia com total positivo", () => {
    expect(validarPagamentos(1000, [{ forma: "PIX", valor: 0 }]).ok).toBe(false);
    expect(validarPagamentos(1000, [{ forma: "DEBITO", valor: 1000, parcelas: 3 }]).ok).toBe(false);
    expect(validarPagamentos(1000, []).ok).toBe(false);
    expect(validarPagamentos(0, []).ok).toBe(true);
  });

  it("calcula o restante a pagar", () => {
    expect(restantePagar(10000, [{ valor: 6000 }])).toBe(4000);
    expect(restantePagar(10000, [{ valor: 12000 }])).toBe(0);
  });

  it("aplica snapshot de taxas por forma", () => {
    const { taxas, total } = calcularTaxasPagamentos(
      [
        { forma: "CREDITO", valor: 10000 },
        { forma: "DINHEIRO", valor: 500 },
      ],
      [
        { forma: "CREDITO", taxaPercentual: 349, taxaFixa: 10 },
        { forma: "DINHEIRO", taxaPercentual: 0, taxaFixa: 0 },
      ],
    );
    expect(taxas[0]).toMatchObject({ taxaPercentual: 349, taxaFixa: 10, taxaValor: 359 });
    expect(taxas[1].taxaValor).toBe(0);
    expect(total).toBe(359);
  });

  it("CMV da linha usa o custo snapshot", () => {
    expect(custoItem(350, 1200)).toBe(420);
  });
});

describe("taxa da maquininha", () => {
  // InfinitePay (Gustavo): débito 1,39%, crédito 3,49%, parcelado 4,99%, pix 0%
  const infinite = { taxaDebito: 139, taxaCredito: 349, taxaCreditoParcelado: 499, taxaPix: 0 };

  it("escolhe a taxa pela forma e pelas parcelas, sempre sem taxa fixa", () => {
    expect(taxaDaMaquininha(infinite, "DEBITO")).toEqual({ taxaPercentual: 139, taxaFixa: 0 });
    expect(taxaDaMaquininha(infinite, "CREDITO")).toEqual({ taxaPercentual: 349, taxaFixa: 0 });
    expect(taxaDaMaquininha(infinite, "CREDITO", 1)).toEqual({ taxaPercentual: 349, taxaFixa: 0 });
    expect(taxaDaMaquininha(infinite, "CREDITO", 2)).toEqual({ taxaPercentual: 499, taxaFixa: 0 });
    expect(taxaDaMaquininha(infinite, "CREDITO", 12)).toEqual({ taxaPercentual: 499, taxaFixa: 0 });
    expect(taxaDaMaquininha({ ...infinite, taxaPix: 80 }, "PIX")).toEqual({ taxaPercentual: 80, taxaFixa: 0 });
  });

  it("dinheiro e fiado não passam na maquininha", () => {
    expect(taxaDaMaquininha(infinite, "DINHEIRO")).toEqual({ taxaPercentual: 0, taxaFixa: 0 });
    expect(taxaDaMaquininha(infinite, "FIADO", 3)).toEqual({ taxaPercentual: 0, taxaFixa: 0 });
  });

  it("taxa negativa no cadastro vira zero", () => {
    expect(taxaDaMaquininha({ ...infinite, taxaDebito: -5 }, "DEBITO").taxaPercentual).toBe(0);
  });

  it("calcularTaxasPagamentos usa a maquininha quando informada e a configuração quando não", () => {
    const sipag = { taxaDebito: 149, taxaCredito: 299, taxaCreditoParcelado: 399, taxaPix: 0 };
    const maquininhas = new Map([
      [1, infinite],
      [2, sipag],
    ]);
    const configs = [
      { forma: "DEBITO" as const, taxaPercentual: 199, taxaFixa: 0 },
      { forma: "CREDITO" as const, taxaPercentual: 399, taxaFixa: 10 },
      { forma: "PIX" as const, taxaPercentual: 0, taxaFixa: 0 },
    ];
    const { taxas, total } = calcularTaxasPagamentos(
      [
        { forma: "DEBITO", valor: 10000, maquininhaId: 1 }, // 1,39% = 139
        { forma: "CREDITO", valor: 10000, parcelas: 3, maquininhaId: 2 }, // 3,99% = 399
        { forma: "CREDITO", valor: 10000, parcelas: 1, maquininhaId: null }, // config: 3,99% + 0,10 = 409
        { forma: "DEBITO", valor: 10000, maquininhaId: 99 }, // maquininha desconhecida: cai na config = 199
        { forma: "PIX", valor: 5000, maquininhaId: 1 }, // pix 0% na maquininha
      ],
      configs,
      maquininhas,
    );
    expect(taxas.map((t) => t.taxaValor)).toEqual([139, 399, 409, 199, 0]);
    expect(taxas[0]).toMatchObject({ taxaPercentual: 139, taxaFixa: 0 });
    expect(taxas[2]).toMatchObject({ taxaPercentual: 399, taxaFixa: 10 });
    expect(total).toBe(139 + 399 + 409 + 199);
  });

  it("sem o mapa de maquininhas o comportamento antigo continua igual", () => {
    const { total } = calcularTaxasPagamentos(
      [{ forma: "DEBITO", valor: 10000, maquininhaId: 1 }],
      [{ forma: "DEBITO", taxaPercentual: 199, taxaFixa: 0 }],
    );
    expect(total).toBe(199);
  });

  it("identifica maquininha Mercado Pago pela adquirente, tolerando caixa e espaços", () => {
    expect(ehMercadoPago("Mercado Pago")).toBe(true);
    expect(ehMercadoPago("  mercadopago ")).toBe(true);
    expect(ehMercadoPago("InfinitePay")).toBe(false);
    expect(ehMercadoPago("Sipag")).toBe(false);
    expect(ehMercadoPago(null)).toBe(false);
    expect(ehMercadoPago(undefined)).toBe(false);
  });
});

describe("podeCancelarVenda", () => {
  const agora = new Date("2026-09-16T15:00:00Z");
  const venda = { status: "CONCLUIDA" as const, sessaoId: 5, criadoEm: new Date("2026-09-16T14:45:00Z") };

  it("ADMIN cancela qualquer venda concluída", () => {
    expect(podeCancelarVenda({ ...venda, sessaoId: 1 }, { papel: "ADMIN" }, 5, agora).ok).toBe(true);
  });

  it("ninguém cancela venda já cancelada", () => {
    expect(podeCancelarVenda({ ...venda, status: "CANCELADA" }, { papel: "ADMIN" }, 5, agora).ok).toBe(false);
  });

  it("OPERADOR cancela só da sessão aberta e dentro de 30 minutos", () => {
    expect(podeCancelarVenda(venda, { papel: "OPERADOR" }, 5, agora).ok).toBe(true);
    expect(podeCancelarVenda(venda, { papel: "OPERADOR" }, 6, agora).ok).toBe(false);
    expect(podeCancelarVenda(venda, { papel: "OPERADOR" }, null, agora).ok).toBe(false);
    const antiga = { ...venda, criadoEm: new Date("2026-09-16T14:00:00Z") };
    expect(podeCancelarVenda(antiga, { papel: "OPERADOR" }, 5, agora).ok).toBe(false);
  });
});

describe("venda de total zero (100% de desconto, brinde)", () => {
  it("o servidor aceita lista de pagamentos vazia só quando o total é zero", () => {
    const totais = calcularTotais([{ quantidade: 1000, precoUnitario: 500, desconto: 0 }], 500);
    expect(totais.total).toBe(0);
    expect(validarPagamentos(totais.total, []).ok).toBe(true);
    expect(validarPagamentos(1, []).ok).toBe(false);
    expect(restantePagar(0, [])).toBe(0);
  });
});

describe("conferências do registro da venda", () => {
  it("preço divergente entre o bipe e a confirmação recusa nomeando produto e valores", () => {
    expect(conferirPrecoReferencia("Arroz 5kg", 2490, 2490)).toBeNull();
    expect(conferirPrecoReferencia("Arroz 5kg", null, 2990)).toBeNull();
    expect(conferirPrecoReferencia("Arroz 5kg", undefined, 2990)).toBeNull();
    const msg = conferirPrecoReferencia("Arroz 5kg", 2490, 2990);
    expect(msg).toContain("Arroz 5kg");
    expect(msg).toContain("R$ 24,90");
    expect(msg).toContain("R$ 29,90");
    expect(msg).toContain("bipe de novo");
  });

  it("cobrança Mercado Pago só passa com estado FINISHED e valor igual ao do pagamento", () => {
    expect(conferirIntencaoMp({ state: "FINISHED", amount: 8000 }, 8000).ok).toBe(true);
    expect(conferirIntencaoMp({ state: "FINISHED" }, 8000).ok).toBe(true);
    const aberta = conferirIntencaoMp({ state: "ON_TERMINAL", amount: 8000 }, 8000);
    expect(aberta.ok).toBe(false);
    if (!aberta.ok) expect(aberta.mensagem).toContain("ON_TERMINAL");
    const semEstado = conferirIntencaoMp({}, 8000);
    expect(semEstado.ok).toBe(false);
    const valorErrado = conferirIntencaoMp({ state: "FINISHED", amount: 12000 }, 9000);
    expect(valorErrado.ok).toBe(false);
    if (!valorErrado.ok) {
      expect(valorErrado.mensagem).toContain("R$ 120,00");
      expect(valorErrado.mensagem).toContain("R$ 90,00");
    }
  });

  it("reconhece erro de lock do SQLite pra tentar de novo, e só ele", () => {
    expect(erroDeConcorrencia({ code: "P2034", message: "Transaction failed due to a write conflict or a deadlock." })).toBe(true);
    expect(erroDeConcorrencia({ code: "P1008", message: "Socket timeout" })).toBe(true);
    expect(erroDeConcorrencia(new Error("database is locked"))).toBe(true);
    expect(erroDeConcorrencia(new Error("SQLITE_BUSY: database is busy"))).toBe(true);
    expect(erroDeConcorrencia({ code: "P2002", message: "Unique constraint failed" })).toBe(false);
    expect(erroDeConcorrencia(new Error("Estoque insuficiente"))).toBe(false);
    expect(erroDeConcorrencia(null)).toBe(false);
    expect(erroDeConcorrencia("texto")).toBe(false);
  });
});

describe("itens divididos por lote na exibição", () => {
  const queijoLoteA = { produtoId: 2, descricao: "Queijo", unidade: "KG" as const, quantidade: 400, precoUnitario: 3990, desconto: 40, total: 1556 };
  const queijoLoteB = { produtoId: 2, descricao: "Queijo", unidade: "KG" as const, quantidade: 600, precoUnitario: 3990, desconto: 60, total: 2334 };
  const pao = { produtoId: 1, descricao: "Pão", unidade: "UN" as const, quantidade: 3000, precoUnitario: 100, desconto: 0, total: 300 };

  it("agrupa as partes do mesmo produto somando quantidade, desconto e total", () => {
    const agrupados = agruparItensPorProduto([pao, queijoLoteA, queijoLoteB]);
    expect(agrupados).toHaveLength(2);
    const queijo = agrupados.find((i) => i.produtoId === 2)!;
    expect(queijo.quantidade).toBe(1000);
    expect(queijo.desconto).toBe(100);
    expect(queijo.total).toBe(3890); // 1,000 kg × 39,90 − 1,00
    expect(agrupados.find((i) => i.produtoId === 1)).toMatchObject(pao);
  });

  it("mesmo produto com preço diferente fica em linhas separadas", () => {
    const agrupados = agruparItensPorProduto([queijoLoteA, { ...queijoLoteB, precoUnitario: 3490 }]);
    expect(agrupados).toHaveLength(2);
  });

  it("mantém a ordem da primeira aparição", () => {
    const agrupados = agruparItensPorProduto([queijoLoteA, pao, queijoLoteB]);
    expect(agrupados.map((i) => i.produtoId)).toEqual([2, 1]);
  });

  it("conta produtos distintos, não linhas por lote", () => {
    expect(contarProdutosDistintos([pao, queijoLoteA, queijoLoteB])).toBe(2);
    expect(contarProdutosDistintos([])).toBe(0);
  });
});
