/**
 * Configurações: loja, usuários (criar, editar, trocar PIN, desativar),
 * formas de pagamento, maquininhas (criar, editar, excluir), Pix, metas e
 * backup via /api/backup.
 */
import { test, expect, esperarToast } from "./fixtures";
import { db, nome } from "./dados";

test.describe.configure({ mode: "serial" });

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PIN_ADMIN = process.env.ADMIN_PIN_INICIAL ?? "1234";
const NOME_OPERADOR = nome("Operador");
const NOME_OPERADOR_EDITADO = nome("Operador editado");
const NOME_MAQUININHA = nome("Maquininha");
const NOME_MAQUININHA_EDITADA = nome("Maquininha editada");

test.describe("Loja", () => {
  test("salva os dados da loja", async ({ page }) => {
    const config = await db().configuracao.findFirstOrThrow();
    await page.goto("/configuracoes");
    await page.getByLabel("Nome da loja").fill(config.nomeLoja);
    await page.getByLabel("Mensagem no rodapé do cupom").fill(config.mensagemCupom ?? "Obrigado pela preferência!");
    await page.getByRole("button", { name: "Salvar dados da loja" }).click();
    await esperarToast(page, "Dados da loja salvos.");
    expect((await db().configuracao.findFirstOrThrow()).nomeLoja).toBe(config.nomeLoja);
  });
});

test.describe("Usuários", () => {
  let usuarioId = 0;

  test("cria um operador com PIN 4321", async ({ page }) => {
    await page.goto("/configuracoes/usuarios");
    await page.getByRole("button", { name: "Novo usuário" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Novo usuário");
    await dialogo.getByLabel(/^Nome/).fill(NOME_OPERADOR);
    await dialogo.getByLabel("Tipo de acesso").selectOption("OPERADOR");
    await dialogo.getByLabel(/^PIN/).fill("4321");
    await dialogo.getByLabel(/^Repita o PIN/).fill("4321");
    await dialogo.getByRole("button", { name: "Criar usuário" }).click();
    await esperarToast(page, "Usuário criado.");

    const usuario = await db().usuario.findFirst({ where: { nome: NOME_OPERADOR } });
    expect(usuario?.papel).toBe("OPERADOR");
    expect(usuario?.ativo).toBe(true);
    usuarioId = usuario!.id;
    await expect(page.getByRole("row", { name: new RegExp(escapar(NOME_OPERADOR)) })).toBeVisible();
  });

  test("edita o nome do operador", async ({ page }) => {
    await page.goto("/configuracoes/usuarios");
    const linha = page.getByRole("row", { name: new RegExp(escapar(NOME_OPERADOR)) });
    await linha.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText(`Editar ${NOME_OPERADOR}`);
    await dialogo.getByLabel(/^Nome/).fill(NOME_OPERADOR_EDITADO);
    await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();
    await esperarToast(page, "Usuário atualizado.");
    expect((await db().usuario.findUnique({ where: { id: usuarioId } }))?.nome).toBe(NOME_OPERADOR_EDITADO);
  });

  test("troca o PIN do operador informando o PIN do administrador", async ({ page }) => {
    const antes = (await db().usuario.findUnique({ where: { id: usuarioId } }))!.pinHash;
    await page.goto("/configuracoes/usuarios");
    const linha = page.getByRole("row", { name: new RegExp(escapar(NOME_OPERADOR_EDITADO)) });
    await linha.getByRole("button", { name: "Trocar PIN" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText(`Trocar PIN de ${NOME_OPERADOR_EDITADO}`);
    await dialogo.getByLabel(/^Seu PIN atual/).fill(PIN_ADMIN);
    await dialogo.getByLabel(/^Novo PIN/).fill("5678");
    await dialogo.getByLabel(/^Repita o PIN/).fill("5678");
    await dialogo.getByRole("button", { name: "Trocar PIN" }).click();
    await esperarToast(page, "PIN alterado.");
    expect((await db().usuario.findUnique({ where: { id: usuarioId } }))!.pinHash).not.toBe(antes);
  });

  test("desativa o operador", async ({ page }) => {
    await page.goto("/configuracoes/usuarios");
    const linha = page.getByRole("row", { name: new RegExp(escapar(NOME_OPERADOR_EDITADO)) });
    await linha.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Usuário ativo (pode entrar no sistema)").uncheck();
    await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();
    await esperarToast(page, "Usuário atualizado.");
    expect((await db().usuario.findUnique({ where: { id: usuarioId } }))?.ativo).toBe(false);
  });
});

test.describe("Formas de pagamento", () => {
  test("salva a tabela de formas de pagamento", async ({ page }) => {
    await page.goto("/configuracoes/pagamentos");
    await page.getByRole("button", { name: "Salvar formas de pagamento" }).click();
    await esperarToast(page, "Formas de pagamento salvas.");
    expect(await db().configuracaoPagamento.count({ where: { ativo: true } })).toBeGreaterThan(0);
  });
});

test.describe("Maquininhas", () => {
  let maquininhaId = 0;

  test("cadastra uma maquininha", async ({ page }) => {
    await page.goto("/configuracoes/maquininhas");
    await page.getByRole("button", { name: "Nova maquininha" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Nova maquininha");
    await dialogo.getByLabel(/^Nome/).fill(NOME_MAQUININHA);
    await dialogo.getByLabel("Adquirente").fill("Stone");
    await dialogo.locator("#taxaDebito").fill("1,50");
    await dialogo.locator("#taxaCredito").fill("3,20");
    await dialogo.locator("#taxaCreditoParcelado").fill("4,50");
    await dialogo.locator("#taxaPix").fill("0");
    await dialogo.locator("#prazoDebitoDias").fill("1");
    await dialogo.locator("#prazoCreditoDias").fill("30");
    await dialogo.locator("#prazoPixDias").fill("0");
    await dialogo.getByLabel("Ativa (aparece no caixa)").check();
    await dialogo.getByLabel("Padrão (pré-selecionada no caixa)").uncheck();
    await dialogo.getByRole("button", { name: "Cadastrar maquininha" }).click();
    await esperarToast(page, "Maquininha cadastrada.");

    const maquininha = await db().maquininha.findFirst({ where: { nome: NOME_MAQUININHA } });
    expect(maquininha?.taxaDebito).toBe(150);
    expect(maquininha?.taxaCredito).toBe(320);
    expect(maquininha?.taxaCreditoParcelado).toBe(450);
    expect(maquininha?.padrao).toBe(false);
    maquininhaId = maquininha!.id;
    await expect(page.getByRole("row", { name: new RegExp(escapar(NOME_MAQUININHA)) })).toBeVisible();
  });

  test("edita e exclui a maquininha", async ({ page }) => {
    await page.goto("/configuracoes/maquininhas");
    const linha = page.getByRole("row", { name: new RegExp(escapar(NOME_MAQUININHA)) });
    await linha.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText(`Editar ${NOME_MAQUININHA}`);
    await dialogo.getByLabel(/^Nome/).fill(NOME_MAQUININHA_EDITADA);
    await dialogo.locator("#taxaDebito").fill("1,60");
    await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();
    await esperarToast(page, "Maquininha atualizada.");
    const editada = await db().maquininha.findUnique({ where: { id: maquininhaId } });
    expect(editada?.nome).toBe(NOME_MAQUININHA_EDITADA);
    expect(editada?.taxaDebito).toBe(160);

    const linhaEditada = page.getByRole("row", { name: new RegExp(escapar(NOME_MAQUININHA_EDITADA)) });
    await linhaEditada.getByRole("button", { name: "Excluir" }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao).toContainText(`Excluir ${NOME_MAQUININHA_EDITADA}?`);
    await confirmacao.getByRole("button", { name: "Excluir" }).click();
    await esperarToast(page, "excluída.");
    expect(await db().maquininha.findUnique({ where: { id: maquininhaId } })).toBeNull();
  });
});

test.describe("Pix", () => {
  test("salva a chave Pix", async ({ page }) => {
    const config = await db().configuracao.findFirstOrThrow();
    const chave = config.pixChave?.trim() || "uaymarket@exemplo.com.br";
    await page.goto("/configuracoes/pix");
    await page.getByLabel("Chave Pix").fill(chave);
    await page.getByLabel("Nome de quem recebe").fill(config.pixNomeRecebedor?.trim() || "UAY MARKET");
    await page.getByLabel("Cidade").fill(config.pixCidade?.trim() || "EXTREMA");
    await page.getByRole("button", { name: "Salvar dados do Pix" }).click();
    await esperarToast(page, "Dados do Pix salvos.");
    expect((await db().configuracao.findFirstOrThrow()).pixChave).toBe(chave);
  });
});

test.describe("Metas e regras", () => {
  test("salva metas e regras", async ({ page }) => {
    const antes = await db().configuracao.findFirstOrThrow();
    await page.goto("/configuracoes/metas");
    await page.getByRole("button", { name: "Salvar metas e regras" }).click();
    await esperarToast(page, "Metas e regras salvas.");
    const depois = await db().configuracao.findFirstOrThrow();
    expect(depois.metaVendasDiaria).toBe(antes.metaVendasDiaria);
    expect(depois.metaVendasMensal).toBe(antes.metaVendasMensal);
    expect(depois.permitirVendaSemEstoque).toBe(antes.permitirVendaSemEstoque);
  });
});

test.describe("Backup", () => {
  test("GET /api/backup devolve JSON no formato uay-market-backup", async ({ page }) => {
    await page.goto("/configuracoes/backup");
    const resposta = await page.request.get("/api/backup");
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()["content-type"]).toContain("application/json");
    const json = (await resposta.json()) as { formato?: string; versao?: number; tabelas?: Record<string, unknown[]> };
    expect(json.formato).toBe("uay-market-backup");
    expect(json.versao).toBe(1);
    expect(json.tabelas).toBeTruthy();
    expect(Object.keys(json.tabelas ?? {})).toContain("Produto");
    expect((json.tabelas?.Produto ?? []).length).toBeGreaterThan(0);
  });
});
