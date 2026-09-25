import { defineConfig } from "@playwright/test";
import path from "node:path";

/**
 * Teste de fumaça de ponta a ponta contra o build de produção (`npm start`).
 * Pré-requisitos: `npm run build` já executado, Postgres local de pé
 * (`npm run db:local`) com os dados de demonstração e .env apontando pra ele.
 * Rodar: `npm run test:e2e` (ou `npx playwright test`).
 *
 * Projetos: "login" entra com o PIN do administrador e salva a sessão em
 * tests/e2e/.auth/admin.json; "fumaca" reaproveita essa sessão em todos os
 * outros arquivos (rodam em série, um worker, na ordem do nome do arquivo).
 */
const ARQUIVO_SESSAO = path.resolve(__dirname, "tests/e2e/.auth/admin.json");

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  globalTeardown: "./tests/e2e/limpeza.ts",
  use: {
    baseURL: "http://localhost:3000",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 1366, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "login",
      testMatch: /fumaca-01-login\.spec\.ts/,
    },
    {
      name: "fumaca",
      testMatch: /fumaca-(?!01-)\d+.*\.spec\.ts/,
      dependencies: ["login"],
      use: { storageState: ARQUIVO_SESSAO },
    },
  ],
  webServer: {
    command: "npm start",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
