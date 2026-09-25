/**
 * Produtos e categorias: criar, editar preço, desativar, reativar, excluir;
 * categoria criar e excluir. Tudo pela tela, conferindo toast e lista.
 */
import { test, expect, esperarToast, digitarCentavos } from "./fixtures";
import { db, ean13, nome, SUFIXO } from "./dados";

test.describe.configure({ mode: "serial" });

const NOME_PRODUTO = nome("Produto");
const NOME_EDITADO = nome("Produto editado");
const CODIGO_BARRAS = ean13(`299${Date.now().toString().slice(-9)}`);
const CODIGO_INTERNO = `E2E${SUFIXO}`;
const NOME_CATEGORIA = nome("Categoria");
let produtoId = 0;

test.describe("Produtos", () => {
  test("cadastra um produto novo", async ({ page }) => {
    await page.goto("/produtos/novo");
    await page.getByLabel("Código de barras").fill(CODIGO_BARRAS);
    await page.getByLabel("Código interno").fill(CODIGO_INTERNO);
    await page.getByLabel(/^Nome\s*\*?$/).fill(NOME_PRODUTO);
    await page.getByLabel("Descrição").fill("Produto criado pelo teste de fumaça.");
    await page.getByLabel("Categoria").selectOption({ index: 1 });
    await page.getByLabel("Vendido por").selectOption("UN");
    await digitarCentavos(page.getByLabel(/Preço de venda/), 1990);
    await digitarCentavos(page.getByLabel(/Preço de custo/), 1200);
    await page.getByLabel(/Estoque mínimo/).fill("2");
    await page.getByRole("button", { name: "Cadastrar produto" }).click();

    await esperarToast(page, "Produto cadastrado.");
    await expect(page).toHaveURL(/\/produtos$/);

    const produto = await db().produto.findUnique({ where: { codigoBarras: CODIGO_BARRAS } });
    expect(produto).not.toBeNull();
    expect(produto?.precoVenda).toBe(1990);
    expect(produto?.precoCusto).toBe(1200);
    produtoId = produto!.id;

    await page.goto(`/produtos?busca=${encodeURIComponent(CODIGO_INTERNO)}`);
    await expect(page.getByRole("link", { name: NOME_PRODUTO, exact: true })).toBeVisible();
  });

  test("edita o preço de venda", async ({ page }) => {
    await page.goto(`/produtos/${produtoId}`);
    await expect(page.getByRole("heading", { name: new RegExp(NOME_PRODUTO) })).toBeVisible();
    await page.getByLabel(/^Nome\s*\*?$/).fill(NOME_EDITADO);
    await digitarCentavos(page.getByLabel(/Preço de venda/), 2490);
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await esperarToast(page, "Produto salvo.");

    const produto = await db().produto.findUnique({ where: { id: produtoId } });
    expect(produto?.precoVenda).toBe(2490);
    expect(produto?.nome).toBe(NOME_EDITADO);
    await expect(page.getByText("R$ 24,90").filter({ visible: true }).first()).toBeVisible();
  });

  test("desativa e reativa o produto", async ({ page }) => {
    await page.goto(`/produtos/${produtoId}`);
    await page.getByRole("button", { name: /^Desativar/ }).click();
    await esperarToast(page, "foi desativado");
    await expect(page.getByText("Inativo", { exact: true })).toBeVisible();
    expect((await db().produto.findUnique({ where: { id: produtoId } }))?.ativo).toBe(false);

    await page.getByRole("button", { name: /^Reativar/ }).click();
    await esperarToast(page, "voltou pro caixa");
    await expect(page.getByText("Ativo", { exact: true })).toBeVisible();
    expect((await db().produto.findUnique({ where: { id: produtoId } }))?.ativo).toBe(true);
  });

  test("exclui o produto de vez", async ({ page }) => {
    await page.goto(`/produtos/${produtoId}`);
    await page.getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByRole("dialog")).toContainText("Excluir produto de vez?");
    await page.getByRole("button", { name: "Sim, excluir" }).click();
    await esperarToast(page, "foi excluído");
    await expect(page).toHaveURL(/\/produtos$/);
    expect(await db().produto.findUnique({ where: { id: produtoId } })).toBeNull();
  });
});

test.describe("Categorias de produto", () => {
  test("cria e exclui uma categoria", async ({ page }) => {
    await page.goto("/produtos/categorias");
    await page.getByRole("button", { name: "Nova categoria" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel(/^Nome\s*\*?$/).fill(NOME_CATEGORIA);
    await dialogo.getByLabel("Ordem").fill("99");
    await dialogo.getByRole("button", { name: "Criar categoria" }).click();
    await esperarToast(page, "Categoria criada.");
    await expect(page.getByRole("row", { name: new RegExp(NOME_CATEGORIA) })).toBeVisible();

    await page.getByRole("button", { name: `Excluir ${NOME_CATEGORIA}` }).click();
    await expect(page.getByRole("dialog")).toContainText("Excluir categoria?");
    await page.getByRole("button", { name: "Sim, excluir" }).click();
    await esperarToast(page, "excluída");
    await expect(page.getByRole("row", { name: new RegExp(NOME_CATEGORIA) })).toHaveCount(0);
    expect(await db().categoria.findFirst({ where: { nome: NOME_CATEGORIA } })).toBeNull();
  });
});
