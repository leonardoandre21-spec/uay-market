/**
 * Base dos testes de fumaça: monitor de erros do navegador (console, exceções,
 * respostas 5xx) que derruba o teste quando aparece erro típico de build de
 * produção do Next (server action importando módulo de cliente, RSC quebrado),
 * mais atalhos pra toast e pra conferir uma rota.
 */
import { test as base, expect, type Page } from "@playwright/test";

/** Padrões que, aparecendo no console ou em exceção da página, reprovam o teste. */
export const PADROES_FATAIS = [
  "Attempted to call",
  "is on the client",
  "Server Components render",
  "NEXT_NOT_FOUND",
  "Minified React error",
  "Application error",
  "Unhandled Runtime Error",
];

/** Textos que nunca podem aparecer no corpo de uma página renderizada. */
export const TEXTOS_ERRO_PAGINA = [
  "Application error",
  "Attempted to call",
  "Server Components render",
  "Unhandled Runtime Error",
  "digest",
];

export type Monitor = { fatais: string[]; avisos: string[] };

export const test = base.extend<{ monitor: Monitor }>({
  monitor: [
    async ({ page }, use, testInfo) => {
      const monitor: Monitor = { fatais: [], avisos: [] };
      const classificar = (origem: string, texto: string) => {
        const linha = `[${origem}] ${texto}`;
        if (PADROES_FATAIS.some((p) => texto.includes(p))) monitor.fatais.push(linha);
        else monitor.avisos.push(linha);
      };
      page.on("console", (m) => {
        if (m.type() === "error") classificar("console", m.text());
      });
      page.on("pageerror", (e) => classificar("pageerror", e.message));
      page.on("requestfailed", (r) => {
        const erro = r.failure()?.errorText ?? "";
        // Navegação que aborta o carregamento anterior é normal (router.push, refresh).
        if (erro.includes("ERR_ABORTED")) return;
        monitor.avisos.push(`[requestfailed] ${r.method()} ${r.url()} ${erro}`);
      });
      page.on("response", (r) => {
        if (r.status() >= 500) monitor.fatais.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`);
      });

      await use(monitor);

      if (monitor.avisos.length) {
        await testInfo.attach("avisos-do-navegador", { body: monitor.avisos.join("\n"), contentType: "text/plain" });
      }
      expect(monitor.fatais, "erros fatais do navegador/servidor").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Toast do kit de UI (container popover). */
export function toast(page: Page, texto: string | RegExp) {
  return page.locator('[popover="manual"]').getByText(texto).first();
}

export async function esperarToast(page: Page, texto: string | RegExp) {
  await expect(toast(page, texto)).toBeVisible({ timeout: 15_000 });
}

/** Abre a rota, exige 200 e nenhum texto de erro do Next no corpo. */
export async function conferirRota(page: Page, rota: string) {
  const resposta = await page.goto(rota);
  expect(resposta, `sem resposta em ${rota}`).not.toBeNull();
  expect(resposta!.status(), `status de ${rota}`).toBe(200);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  const corpo = await page.locator("body").innerText();
  const minusculo = corpo.toLowerCase();
  for (const padrao of TEXTOS_ERRO_PAGINA) {
    expect(minusculo, `"${padrao}" apareceu em ${rota}`).not.toContain(padrao.toLowerCase());
  }
  return corpo;
}

/** Digita num EntradaMoeda/EntradaCentavos (aceita só dígitos, "1990" = 19,90). */
export async function digitarCentavos(alvo: ReturnType<Page["locator"]>, centavos: number) {
  await alvo.fill(String(Math.round(centavos)));
}
