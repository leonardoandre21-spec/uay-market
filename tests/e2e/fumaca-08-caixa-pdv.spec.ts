/**
 * Caixa e PDV: sangria e suprimento na sessão aberta; venda no PDV com dois
 * produtos por unidade e um por quilo (peso), desconto geral, pagamento misto
 * dinheiro + débito na InfinitePay com NSU; cancelamento da venda com motivo;
 * fechamento do caixa com o valor contado igual ao esperado; reabertura com R$ 300,00.
 */
import { test, expect, esperarToast, digitarCentavos } from "./fixtures";
import { dadosBase, db, formatarReais, lerReais, vendaPorNumero } from "./dados";

test.describe.configure({ mode: "serial" });

type Dados = Awaited<ReturnType<typeof dadosBase>>;
let dados: Dados;
let sessaoId = 0;
let numeroVenda = 0;
let vendaId = 0;

const PLACEHOLDER_LEITOR = "Passe o produto no leitor ou digite o código e aperte Enter";

test.beforeAll(async () => {
  dados = await dadosBase();
});

test.describe("Caixa aberto", () => {
  test("garante uma sessão de caixa aberta", async ({ page }) => {
    if (dados.sessaoAbertaId) {
      sessaoId = dados.sessaoAbertaId;
      return;
    }
    // Execução anterior interrompida depois do fechamento: abre de novo pela tela.
    await page.goto("/caixa");
    await digitarCentavos(page.getByLabel(/Fundo de troco/), 30_000);
    await page.getByRole("button", { name: "Abrir caixa e ir para o PDV" }).click();
    await expect(page).toHaveURL(/\/pdv$/);
    const aberta = await db().sessaoCaixa.findFirst({ where: { status: "ABERTO" }, select: { id: true } });
    expect(aberta).not.toBeNull();
    sessaoId = aberta!.id;
  });

  test("registra uma sangria", async ({ page }) => {
    await page.goto("/caixa");
    await page.getByRole("button", { name: "Sangria" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Sangria (retirar dinheiro da gaveta)");
    await digitarCentavos(dialogo.getByLabel(/Quanto está saindo da gaveta/), 5_000);
    await dialogo.getByLabel("Motivo").fill("Levado ao cofre (teste de fumaça).");
    await dialogo.getByRole("button", { name: "Registrar sangria" }).click();
    await esperarToast(page, "Sangria registrada.");
    const movimento = await db().movimentoCaixa.findFirst({ where: { sessaoId, tipo: "SANGRIA" }, orderBy: { id: "desc" } });
    expect(movimento?.valor).toBe(5_000);
  });

  test("registra um suprimento", async ({ page }) => {
    await page.goto("/caixa");
    await page.getByRole("button", { name: "Suprimento" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Suprimento (colocar dinheiro na gaveta)");
    await digitarCentavos(dialogo.getByLabel(/Quanto está entrando na gaveta/), 3_000);
    await dialogo.getByLabel("Motivo").fill("Troco em moedas do banco (teste de fumaça).");
    await dialogo.getByRole("button", { name: "Registrar suprimento" }).click();
    await esperarToast(page, "Suprimento registrado.");
    const movimento = await db().movimentoCaixa.findFirst({ where: { sessaoId, tipo: "SUPRIMENTO" }, orderBy: { id: "desc" } });
    expect(movimento?.valor).toBe(3_000);
  });
});

test.describe("PDV", () => {
  test("vende 2 produtos por unidade + 1 por quilo, com desconto e pagamento misto", async ({ page }) => {
    const { pdvUn1: a, pdvUn2: b, pdvKg: c } = dados;
    const pesoMilesimos = 500;
    const desconto = 500;
    const totalEsperado = a.precoVenda + b.precoVenda + Math.round((pesoMilesimos * c.precoVenda) / 1000) - desconto;
    const dinheiro = 2_000;
    const debito = totalEsperado - dinheiro;
    const estoqueAntes = {
      a: (await db().produto.findUnique({ where: { id: a.id } }))!.estoque,
      c: (await db().produto.findUnique({ where: { id: c.id } }))!.estoque,
    };
    const infinitePay = await db().maquininha.findFirst({ where: { ativo: true, adquirente: "InfinitePay" } });
    expect(infinitePay, "maquininha InfinitePay ativa no demo").not.toBeNull();

    await page.goto("/pdv");
    const leitor = page.getByPlaceholder(PLACEHOLDER_LEITOR);
    await expect(leitor).toBeVisible();

    await leitor.fill(a.codigoBarras);
    await leitor.press("Enter");
    await expect(page.getByLabel(`Quantidade de ${a.nome}`)).toBeVisible();

    await leitor.fill(b.codigoBarras);
    await leitor.press("Enter");
    await expect(page.getByLabel(`Quantidade de ${b.nome}`)).toBeVisible();

    await leitor.fill(c.codigoBarras);
    await leitor.press("Enter");
    const dialogoPeso = page.getByRole("dialog");
    await expect(dialogoPeso).toContainText("Informe o peso");
    await dialogoPeso.getByLabel("Peso (kg)").fill("0,500");
    await dialogoPeso.getByLabel("Peso (kg)").press("Enter");
    await expect(page.getByLabel(`Quantidade de ${c.nome}`)).toBeVisible();

    await digitarCentavos(page.getByLabel("Desconto geral"), desconto);
    await page.getByLabel("Desconto geral").press("Enter");
    await expect(page.getByText("Total a pagar").locator("xpath=following-sibling::p[1]")).toHaveText(formatarReais(totalEsperado));

    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    const pagamento = page.getByRole("dialog");
    await expect(pagamento).toContainText("Receber pagamento");

    // Parte em dinheiro (cliente entrega exatamente R$ 20,00).
    await pagamento.getByRole("button", { name: "Dinheiro", exact: true }).click();
    await digitarCentavos(pagamento.getByLabel("Valor deste pagamento"), dinheiro);
    await digitarCentavos(pagamento.getByLabel("Valor recebido do cliente"), dinheiro);
    await pagamento.getByRole("button", { name: /Adicionar pagamento/ }).click();
    await expect(pagamento.getByText("Já pago").locator("xpath=following-sibling::p[1]")).toHaveText(formatarReais(dinheiro));

    // Resto no débito, InfinitePay, com NSU do comprovante.
    await pagamento.getByRole("button", { name: "Débito", exact: true }).click();
    await expect(pagamento.getByLabel("Valor deste pagamento")).toHaveValue(formatarReais(debito, false));
    await pagamento.getByRole("button", { name: new RegExp(infinitePay!.nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await pagamento.getByLabel("NSU / Doc (opcional)").fill("123456");
    await pagamento.getByRole("button", { name: /Adicionar e fechar a conta/ }).click();
    await expect(pagamento).toContainText("Conta fechada. Tudo certo pra registrar a venda.");
    await pagamento.getByRole("button", { name: /Confirmar venda/ }).click();

    await expect(page.getByRole("heading", { name: "Venda registrada" })).toBeVisible({ timeout: 20_000 });
    const textoCupom = await page.getByText(/Cupom nº/).innerText();
    numeroVenda = Number(/Cupom nº\s*(\d+)/.exec(textoCupom)?.[1]);
    expect(numeroVenda).toBeGreaterThan(0);
    expect(lerReais(textoCupom)).toBe(totalEsperado);

    const venda = await vendaPorNumero(numeroVenda);
    expect(venda?.status).toBe("CONCLUIDA");
    expect(venda?.total).toBe(totalEsperado);
    expect(venda?.sessaoId).toBe(sessaoId);
    vendaId = venda!.id;

    const pagamentos = await db().pagamento.findMany({ where: { vendaId }, orderBy: { id: "asc" } });
    expect(pagamentos.map((p) => [p.forma, p.valor])).toEqual([
      ["DINHEIRO", dinheiro],
      ["DEBITO", debito],
    ]);
    expect(pagamentos[1].maquininhaId).toBe(infinitePay!.id);
    expect(pagamentos[1].nsu).toBe("123456");
    expect(pagamentos[1].taxaPercentual).toBe(infinitePay!.taxaDebito);

    expect((await db().produto.findUnique({ where: { id: a.id } }))!.estoque).toBe(estoqueAntes.a - 1_000);
    expect((await db().produto.findUnique({ where: { id: c.id } }))!.estoque).toBe(estoqueAntes.c - pesoMilesimos);

    await page.getByRole("button", { name: /Nova venda/ }).click();
    await expect(leitor).toBeVisible();
  });

  test("mostra a venda e o cupom", async ({ page }) => {
    await page.goto(`/vendas/${vendaId}`);
    await expect(page.getByRole("heading", { name: `Venda nº ${numeroVenda}` })).toBeVisible();
    await expect(page.getByText("Concluída").first()).toBeVisible();
    const cupom = await page.goto(`/vendas/${vendaId}/cupom`);
    expect(cupom?.status()).toBe(200);
    await expect(page.locator("body")).toContainText(String(numeroVenda));
  });

  test("cancela a venda com motivo", async ({ page }) => {
    const { pdvUn1: a } = dados;
    const estoqueAntes = (await db().produto.findUnique({ where: { id: a.id } }))!.estoque;

    await page.goto(`/vendas/${vendaId}`);
    await page.getByRole("button", { name: "Cancelar venda" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText(`Cancelar a venda nº ${numeroVenda}?`);
    await dialogo.getByLabel("Motivo do cancelamento").fill("Venda de teste do smoke test.");
    await dialogo.getByRole("button", { name: "Confirmar cancelamento" }).click();
    await esperarToast(page, `Venda nº ${numeroVenda} cancelada.`);
    await expect(page.getByText("Cancelada", { exact: true }).first()).toBeVisible();

    expect((await vendaPorNumero(numeroVenda))?.status).toBe("CANCELADA");
    expect((await db().produto.findUnique({ where: { id: a.id } }))!.estoque).toBe(estoqueAntes + 1_000);
  });
});

test.describe("Fechamento e reabertura do caixa", () => {
  test("fecha o caixa com o valor contado igual ao esperado", async ({ page }) => {
    await page.goto("/caixa");
    await page.getByRole("button", { name: "Fechar caixa" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Fechar caixa");
    const esperadoTexto = await dialogo.getByText("Dinheiro esperado na gaveta").locator("xpath=following-sibling::p[1]").innerText();
    const esperado = lerReais(esperadoTexto);

    await digitarCentavos(dialogo.getByLabel(/Quanto tem na gaveta/), esperado);
    await expect(dialogo).toContainText("R$ 0,00");
    await dialogo.getByLabel(/Observação/).fill("Gaveta conferida (teste de fumaça).");
    await dialogo.getByRole("button", { name: "Confirmar fechamento" }).click();
    await esperarToast(page, "Caixa fechado.");
    await expect(page).toHaveURL(new RegExp(`/caixa/${sessaoId}`));

    const sessao = await db().sessaoCaixa.findUnique({ where: { id: sessaoId } });
    expect(sessao?.status).toBe("FECHADO");
    expect(sessao?.valorFechamentoContado).toBe(esperado);
    expect(sessao?.valorFechamentoEsperado).toBe(esperado);
    expect(sessao?.diferenca).toBe(0);
  });

  test("abre o caixa de novo com R$ 300,00", async ({ page }) => {
    await page.goto("/caixa");
    await digitarCentavos(page.getByLabel(/Fundo de troco/), 30_000);
    await page.getByLabel(/Observação/).fill("Reaberto pelo teste de fumaça.");
    await page.getByRole("button", { name: "Abrir caixa e ir para o PDV" }).click();
    // A abertura navega do grupo (app) pro grupo (pdv): a prova é a URL e o banco,
    // não o toast (ele só sobrevive à troca de layout com o ToastProvider no layout raiz).
    await expect(page).toHaveURL(/\/pdv$/);
    await expect(page.getByPlaceholder(PLACEHOLDER_LEITOR)).toBeVisible();

    const aberta = await db().sessaoCaixa.findFirst({ where: { status: "ABERTO" }, orderBy: { id: "desc" } });
    expect(aberta).not.toBeNull();
    expect(aberta!.id).toBeGreaterThan(sessaoId);
    expect(aberta!.valorAbertura).toBe(30_000);
  });
});
