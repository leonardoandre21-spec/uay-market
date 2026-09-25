import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect } from "./fixtures";
import { ARQUIVO_SESSAO } from "./dados";

const PIN_ADMIN = process.env.ADMIN_PIN_INICIAL ?? "1234";

test.describe("Login", () => {
  test("sem sessão, rota protegida manda pro login", async ({ page }) => {
    await page.goto("/produtos");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("PIN")).toBeVisible();
  });

  test("PIN errado é recusado e PIN certo entra como administrador", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Administrador/ }).first().click();

    await page.getByLabel("PIN").fill("9999");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("PIN incorreto").first()).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("PIN").fill(PIN_ADMIN);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/gestao$/);
    await expect(page.getByRole("link", { name: "Configurações" })).toBeVisible();

    // Sessão reaproveitada pelos outros arquivos do teste de fumaça.
    mkdirSync(path.dirname(ARQUIVO_SESSAO), { recursive: true });
    await page.context().storageState({ path: ARQUIVO_SESSAO });
  });
});
