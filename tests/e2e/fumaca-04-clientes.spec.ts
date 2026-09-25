/**
 * Clientes e fiado: criar, editar, ajuste manual (dívida), receber fiado,
 * desativar, reativar; e um segundo cliente só pra excluir.
 */
import { test, expect, esperarToast, digitarCentavos } from "./fixtures";
import { db, nome, saldoFiado } from "./dados";

test.describe.configure({ mode: "serial" });

const NOME_CLIENTE = nome("Cliente");
const NOME_EDITADO = nome("Cliente editado");
const NOME_DESCARTAVEL = nome("Cliente descartável");
let clienteId = 0;

async function abrirAbaCadastro(page: import("@playwright/test").Page) {
  await page.getByRole("tab", { name: "Cadastro" }).click();
}

test.describe("Clientes", () => {
  test("cadastra um cliente com limite de fiado", async ({ page }) => {
    await page.goto("/clientes/novo");
    await page.getByLabel("Nome completo").fill(NOME_CLIENTE);
    await page.getByLabel("Telefone (WhatsApp)").fill("35999990000");
    await page.getByLabel("E-mail").fill("e2e@exemplo.com.br");
    await page.getByLabel("Endereço").fill("Rua do Teste, 1");
    await digitarCentavos(page.getByLabel("Limite de fiado"), 10_000);
    await page.getByLabel("Observação").fill("Cliente do teste de fumaça.");
    await page.getByRole("button", { name: "Cadastrar cliente" }).click();

    await esperarToast(page, "Cliente cadastrado.");
    await expect(page).toHaveURL(/\/clientes\/\d+/);
    clienteId = Number(/\/clientes\/(\d+)/.exec(page.url())?.[1]);
    const cliente = await db().cliente.findUnique({ where: { id: clienteId } });
    expect(cliente?.nome).toBe(NOME_CLIENTE);
    expect(cliente?.limiteFiado).toBe(10_000);
    await expect(page.getByRole("heading", { name: new RegExp(NOME_CLIENTE) })).toBeVisible();
  });

  test("edita o cadastro", async ({ page }) => {
    await page.goto(`/clientes/${clienteId}`);
    await abrirAbaCadastro(page);
    await page.getByLabel("Nome completo").fill(NOME_EDITADO);
    await page.getByLabel("Endereço").fill("Rua do Teste, 2, Centro");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await esperarToast(page, "Cadastro atualizado.");
    expect((await db().cliente.findUnique({ where: { id: clienteId } }))?.nome).toBe(NOME_EDITADO);
  });

  test("lança dívida por ajuste manual", async ({ page }) => {
    await page.goto(`/clientes/${clienteId}`);
    await page.getByRole("button", { name: "Ajuste manual" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Ajuste manual de saldo");
    await dialogo.getByRole("radio", { name: /Adicionar dívida/ }).click();
    await digitarCentavos(dialogo.getByLabel("Valor"), 5_000);
    await dialogo.getByLabel("Motivo do ajuste").fill("Saldo antigo do caderno (teste de fumaça).");
    await dialogo.getByRole("button", { name: "Lançar dívida" }).click();
    await esperarToast(page, "Ajuste lançado no extrato.");
    expect(await saldoFiado(clienteId)).toBe(5_000);
    await expect(page.getByText("R$ 50,00").filter({ visible: true }).first()).toBeVisible();
  });

  test("recebe parte do fiado em dinheiro", async ({ page }) => {
    await page.goto(`/clientes/${clienteId}`);
    await page.getByRole("button", { name: "Receber pagamento" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Receber pagamento de fiado");
    await digitarCentavos(dialogo.getByLabel("Valor recebido"), 2_000);
    await dialogo.getByLabel("Como o cliente pagou").selectOption("DINHEIRO");
    await dialogo.getByLabel("Observação").fill("Recebimento parcial (teste de fumaça).");
    await dialogo.getByRole("button", { name: "Confirmar recebimento" }).click();
    await expect(dialogo).toContainText("Pagamento recebido");
    await dialogo.locator("button", { hasText: "Fechar" }).click();
    expect(await saldoFiado(clienteId)).toBe(3_000);
    await expect(page.getByText("R$ 30,00").filter({ visible: true }).first()).toBeVisible();
  });

  test("desativa e reativa o cliente", async ({ page }) => {
    await page.goto(`/clientes/${clienteId}`);
    await abrirAbaCadastro(page);
    await page.getByRole("button", { name: "Desativar" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Desativar cliente?");
    await dialogo.getByRole("button", { name: "Desativar" }).click();
    await esperarToast(page, "Cliente desativado.");
    expect((await db().cliente.findUnique({ where: { id: clienteId } }))?.ativo).toBe(false);

    await page.getByRole("button", { name: "Reativar" }).click();
    await esperarToast(page, "Cliente reativado.");
    expect((await db().cliente.findUnique({ where: { id: clienteId } }))?.ativo).toBe(true);
  });

  test("cliente com lançamentos não pode ser excluído; cliente novo pode", async ({ page }) => {
    await page.goto(`/clientes/${clienteId}`);
    await abrirAbaCadastro(page);
    await expect(page.getByRole("button", { name: "Excluir", exact: true })).toBeDisabled();

    await page.goto("/clientes/novo");
    await page.getByLabel("Nome completo").fill(NOME_DESCARTAVEL);
    await page.getByRole("button", { name: "Cadastrar cliente" }).click();
    await esperarToast(page, "Cliente cadastrado.");
    await expect(page).toHaveURL(/\/clientes\/\d+/);
    const descartavelId = Number(/\/clientes\/(\d+)/.exec(page.url())?.[1]);

    await abrirAbaCadastro(page);
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Excluir cliente de vez?");
    await dialogo.getByRole("button", { name: "Excluir de vez" }).click();
    await esperarToast(page, "Cliente excluído.");
    await expect(page).toHaveURL(/\/clientes$/);
    expect(await db().cliente.findUnique({ where: { id: descartavelId } })).toBeNull();
  });
});
