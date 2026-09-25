/**
 * Estoque: entrada com 2 itens bipados (um com validade) e boleto em 2
 * parcelas, estorno da entrada; perda registrada e estornada; ajuste de
 * estoque; promoção pela tela de vencimentos.
 */
import { test, expect, esperarToast, digitarCentavos } from "./fixtures";
import { dadosBase, dataInput, db, nome } from "./dados";

test.describe.configure({ mode: "serial" });

type Dados = Awaited<ReturnType<typeof dadosBase>>;
let dados: Dados;
let entradaId = 0;

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BUSCA_PRODUTO = "Bipe o código de barras ou digite o nome do produto";

test.beforeAll(async () => {
  dados = await dadosBase();
});

test.describe("Entrada de estoque", () => {
  test("registra entrada com 2 itens, validade e boleto em 2 parcelas", async ({ page }) => {
    const { entradaSemValidade: a, entradaComValidade: b } = dados;
    const estoqueAntesA = (await db().produto.findUnique({ where: { id: a.id } }))!.estoque;
    const validade = dataInput(180);

    await page.goto("/estoque/entradas/nova");
    if (dados.fornecedorId) await page.getByLabel("Fornecedor", { exact: true }).selectOption(String(dados.fornecedorId));
    await page.getByLabel("Número da nota").fill(nome("NF"));
    await page.getByLabel("Observação").fill("Entrada do teste de fumaça.");

    const busca = page.getByPlaceholder(BUSCA_PRODUTO);
    await busca.fill(a.codigoBarras);
    await busca.press("Enter");
    await expect(page.getByLabel(`Quantidade de ${a.nome}`)).toBeVisible();
    await page.getByLabel(`Quantidade de ${a.nome}`).fill("10");
    await digitarCentavos(page.getByLabel(`Custo unitário de ${a.nome}`), 650);

    await busca.fill(b.codigoBarras);
    await busca.press("Enter");
    await expect(page.getByLabel(`Quantidade de ${b.nome}`)).toBeVisible();
    await page.getByLabel(`Quantidade de ${b.nome}`).fill("5");
    await digitarCentavos(page.getByLabel(`Custo unitário de ${b.nome}`), 420);
    await page.getByLabel(`Validade de ${b.nome}`).fill(validade);

    // Total esperado: 10 x 6,50 + 5 x 4,20 = 86,00
    await expect(page.getByText("Total da nota")).toBeVisible();
    await expect(page.locator("tfoot")).toContainText("R$ 86,00");

    await page.getByLabel("Gerar boleto a pagar pra esta compra").check();
    await page.getByLabel("Primeiro vencimento").fill(dataInput(15));
    await page.getByLabel("Parcelas").selectOption("2");
    await expect(page.getByText("1/2 ·")).toBeVisible();
    await expect(page.getByText("2/2 ·")).toBeVisible();

    await page.getByRole("button", { name: "Confirmar entrada" }).click();
    await esperarToast(page, "Entrada registrada.");
    await expect(page).toHaveURL(/\/estoque\/entradas\/\d+$/);
    entradaId = Number(/\/estoque\/entradas\/(\d+)/.exec(page.url())?.[1]);
    await expect(page.getByRole("heading", { name: `Entrada nº ${entradaId}` })).toBeVisible();

    const entrada = await db().entradaEstoque.findUnique({
      where: { id: entradaId },
      include: { itens: true, lotes: true, contas: true },
    });
    expect(entrada?.itens).toHaveLength(2);
    expect(entrada?.lotes).toHaveLength(1);
    expect(entrada?.contas.map((c) => c.status)).toEqual(["PENDENTE", "PENDENTE"]);
    expect(entrada?.contas.reduce((s, c) => s + c.valor, 0)).toBe(8_600);
    expect((await db().produto.findUnique({ where: { id: a.id } }))!.estoque).toBe(estoqueAntesA + 10_000);
  });

  test("estorna a entrada", async ({ page }) => {
    const { entradaSemValidade: a } = dados;
    const estoqueAntes = (await db().produto.findUnique({ where: { id: a.id } }))!.estoque;

    await page.goto(`/estoque/entradas/${entradaId}`);
    await page.getByRole("button", { name: "Estornar entrada" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Motivo do estorno").fill("Nota lançada só pra teste.");
    await dialogo.getByRole("button", { name: "Confirmar estorno" }).click();
    await esperarToast(page, "Entrada estornada.");
    await expect(page.getByText("Esta entrada foi estornada")).toBeVisible();

    const entrada = await db().entradaEstoque.findUnique({ where: { id: entradaId }, include: { contas: true, lotes: true } });
    expect(entrada?.estornadaEm).not.toBeNull();
    expect(entrada?.contas.every((c) => c.status === "CANCELADA")).toBe(true);
    expect(entrada?.lotes).toHaveLength(0);
    expect((await db().produto.findUnique({ where: { id: a.id } }))!.estoque).toBe(estoqueAntes - 10_000);
  });
});

test.describe("Perdas", () => {
  test("registra e estorna uma perda", async ({ page }) => {
    const produto = dados.perda;
    const estoqueAntes = (await db().produto.findUnique({ where: { id: produto.id } }))!.estoque;

    await page.goto("/estoque/perdas");
    await page.getByRole("button", { name: "Registrar perda" }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Registrar perda");
    const busca = dialogo.getByPlaceholder(BUSCA_PRODUTO);
    await busca.fill(produto.codigoBarras);
    await busca.press("Enter");
    await expect(dialogo).toContainText(produto.nome);
    await dialogo.getByLabel(/^Quantidade/).fill("1");
    await dialogo.getByLabel("Motivo").selectOption("QUEBRA");
    await dialogo.getByLabel("Observação").fill("Perda do teste de fumaça.");
    await dialogo.getByRole("button", { name: "Registrar perda" }).click();
    await esperarToast(page, "Perda registrada.");
    expect((await db().produto.findUnique({ where: { id: produto.id } }))!.estoque).toBe(estoqueAntes - 1_000);

    const perda = await db().perda.findFirst({ where: { produtoId: produto.id }, orderBy: { id: "desc" } });
    expect(perda).not.toBeNull();

    const linha = page.getByRole("row", { name: new RegExp(escapar(produto.nome)) }).first();
    await linha.getByRole("button", { name: "Estornar" }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao).toContainText("Estornar perda");
    await confirmacao.getByRole("button", { name: "Estornar perda" }).click();
    await esperarToast(page, "Perda estornada.");
    expect((await db().produto.findUnique({ where: { id: produto.id } }))!.estoque).toBe(estoqueAntes);
    expect(await db().perda.findUnique({ where: { id: perda!.id } })).toBeNull();
  });
});

test.describe("Ajuste de estoque", () => {
  test("adiciona 2 unidades por ajuste", async ({ page }) => {
    const produto = dados.ajuste;
    const estoqueAntes = (await db().produto.findUnique({ where: { id: produto.id } }))!.estoque;

    await page.goto("/estoque");
    await page.getByLabel("Buscar produto").fill(produto.codigoBarras);
    const linha = page.getByRole("row", { name: new RegExp(escapar(produto.nome)) }).first();
    await linha.getByRole("button", { name: "Ajustar" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Ajustar estoque");
    await dialogo.getByRole("radio", { name: /Adicionar/ }).click();
    await dialogo.getByLabel(/^Quantidade/).fill("2");
    await expect(dialogo).toContainText("O estoque vai de");
    await dialogo.getByLabel("Motivo").fill("Contagem de inventário");
    await dialogo.getByRole("button", { name: "Confirmar ajuste" }).click();
    await esperarToast(page, "Estoque ajustado.");
    expect((await db().produto.findUnique({ where: { id: produto.id } }))!.estoque).toBe(estoqueAntes + 2_000);

    // Devolve o estoque ao que era pra não deixar rastro no demo.
    await linha.getByRole("button", { name: "Ajustar" }).click();
    await dialogo.getByRole("radio", { name: /Retirar/ }).click();
    await dialogo.getByLabel(/^Quantidade/).fill("2");
    await dialogo.getByLabel("Motivo").fill("Correção de cadastro");
    await dialogo.getByRole("button", { name: "Confirmar ajuste" }).click();
    await esperarToast(page, "Estoque ajustado.");
    expect((await db().produto.findUnique({ where: { id: produto.id } }))!.estoque).toBe(estoqueAntes);
  });
});

test.describe("Vencimentos", () => {
  test("coloca um lote em promoção", async ({ page }) => {
    test.skip(!dados.lotePromocao, "nenhum lote com validade futura no banco de demonstração");
    const lote = dados.lotePromocao!;
    const precoPromocional = Math.max(1, Math.round(lote.produto.precoVenda * 0.8));

    await page.goto("/estoque/vencimentos");
    await page.getByLabel("Buscar lote").fill(lote.produto.nome);
    // O produto pode ter lotes vencidos (botão desabilitado): usa a primeira linha com o botão liberado.
    const linhas = page.getByRole("row", { name: new RegExp(escapar(lote.produto.nome)) });
    await expect(linhas.first()).toBeVisible();
    await linhas.locator("button:enabled", { hasText: "Promoção" }).first().click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Colocar em promoção");
    await digitarCentavos(dialogo.getByLabel("Preço promocional"), precoPromocional);
    await dialogo.getByLabel("Vale até").fill(dataInput(7));
    await dialogo.getByRole("button", { name: "Ativar promoção" }).click();
    await esperarToast(page, "Promoção ativada.");

    const produto = await db().produto.findUnique({ where: { id: lote.produtoId } });
    expect(produto?.precoPromocional).toBe(precoPromocional);
    expect(produto?.promocaoAte).not.toBeNull();

    // Desfaz a promoção pra não alterar os preços do demo.
    await db().produto.update({ where: { id: lote.produtoId }, data: { precoPromocional: null, promocaoAte: null } });
  });
});
