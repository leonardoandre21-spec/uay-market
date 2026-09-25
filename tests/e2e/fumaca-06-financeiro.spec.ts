/**
 * Financeiro: fornecedor (criar, editar), despesa (lançar sem sair do caixa,
 * editar, excluir), categoria de despesa (criar, excluir), boleto (criar,
 * pagar, desfazer pagamento, cancelar).
 */
import { test, expect, esperarToast, digitarCentavos } from "./fixtures";
import { dataInput, db, nome } from "./dados";

test.describe.configure({ mode: "serial" });

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NOME_FORNECEDOR = nome("Fornecedor");
const NOME_FORNECEDOR_EDITADO = nome("Fornecedor editado");
const DESCRICAO_DESPESA = nome("Despesa");
const DESCRICAO_DESPESA_EDITADA = nome("Despesa editada");
const NOME_CATEGORIA = nome("Categoria despesa");
const DESCRICAO_BOLETO = nome("Boleto");

test.describe("Fornecedores", () => {
  test("cadastra e edita um fornecedor", async ({ page }) => {
    await page.goto("/financeiro/fornecedores");
    await page.getByRole("button", { name: "Novo fornecedor" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Novo fornecedor");
    await dialogo.getByLabel("Nome", { exact: false }).first().fill(NOME_FORNECEDOR);
    await dialogo.getByLabel("Telefone / WhatsApp").fill("35988887777");
    await dialogo.getByLabel("E-mail").fill("fornecedor.e2e@exemplo.com.br");
    await dialogo.getByLabel("Pessoa de contato").fill("Contato E2E");
    await dialogo.getByRole("button", { name: "Cadastrar fornecedor" }).click();
    await esperarToast(page, "Fornecedor cadastrado.");

    const fornecedor = await db().fornecedor.findFirst({ where: { nome: NOME_FORNECEDOR } });
    expect(fornecedor).not.toBeNull();

    await page.goto(`/financeiro/fornecedores/${fornecedor!.id}`);
    await expect(page.getByRole("heading", { name: new RegExp(escapar(NOME_FORNECEDOR)) })).toBeVisible();
    await page.getByRole("button", { name: "Editar fornecedor" }).click();
    const edicao = page.getByRole("dialog");
    await expect(edicao).toContainText("Editar fornecedor");
    await edicao.getByLabel("Nome", { exact: false }).first().fill(NOME_FORNECEDOR_EDITADO);
    await edicao.getByLabel("Observação").fill("Entrega às terças (teste de fumaça).");
    await edicao.getByRole("button", { name: "Salvar alterações" }).click();
    await esperarToast(page, "Fornecedor atualizado.");
    expect((await db().fornecedor.findUnique({ where: { id: fornecedor!.id } }))?.nome).toBe(NOME_FORNECEDOR_EDITADO);
    await expect(page.getByRole("heading", { name: new RegExp(escapar(NOME_FORNECEDOR_EDITADO)) })).toBeVisible();
  });
});

test.describe("Despesas", () => {
  test("lança, edita e exclui uma despesa fora do caixa", async ({ page }) => {
    await page.goto("/financeiro/despesas");
    await page.getByRole("button", { name: "Lançar despesa" }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Lançar despesa");
    await dialogo.getByLabel("Descrição").fill(DESCRICAO_DESPESA);
    await digitarCentavos(dialogo.getByLabel("Valor"), 12_345);
    await dialogo.getByLabel("Data").fill(dataInput());
    await dialogo.getByLabel("Categoria").selectOption({ label: "Energia" });
    await dialogo.getByLabel("Forma de pagamento").selectOption("PIX");
    await expect(dialogo.getByLabel("Saiu do dinheiro do caixa")).not.toBeChecked();
    await dialogo.getByLabel("Observação").fill("Despesa do teste de fumaça.");
    await dialogo.getByRole("button", { name: "Lançar despesa" }).click();
    await esperarToast(page, "Despesa lançada.");

    const despesa = await db().despesa.findFirst({ where: { descricao: DESCRICAO_DESPESA } });
    expect(despesa?.valor).toBe(12_345);
    expect(despesa?.pagoDoCaixa).toBe(false);
    expect(despesa?.formaPagamento).toBe("PIX");

    const linha = page.getByRole("row", { name: new RegExp(escapar(DESCRICAO_DESPESA)) }).first();
    await expect(linha).toContainText("R$ 123,45");
    await linha.getByRole("button", { name: "Editar despesa" }).click();
    const edicao = page.getByRole("dialog");
    await expect(edicao).toContainText("Editar despesa");
    await edicao.getByLabel("Descrição").fill(DESCRICAO_DESPESA_EDITADA);
    await digitarCentavos(edicao.getByLabel("Valor"), 10_000);
    await edicao.getByRole("button", { name: "Salvar alterações" }).click();
    await esperarToast(page, "Despesa atualizada.");
    const editada = await db().despesa.findUnique({ where: { id: despesa!.id } });
    expect(editada?.descricao).toBe(DESCRICAO_DESPESA_EDITADA);
    expect(editada?.valor).toBe(10_000);

    const linhaEditada = page.getByRole("row", { name: new RegExp(escapar(DESCRICAO_DESPESA_EDITADA)) }).first();
    await linhaEditada.getByRole("button", { name: "Excluir despesa" }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao).toContainText("Excluir despesa?");
    await confirmacao.getByRole("button", { name: "Excluir", exact: true }).click();
    await esperarToast(page, "Despesa excluída.");
    expect(await db().despesa.findUnique({ where: { id: despesa!.id } })).toBeNull();
  });

  test("cria e exclui uma categoria de despesa", async ({ page }) => {
    await page.goto("/financeiro/despesas/categorias");
    await page.getByLabel("Nome da nova categoria").fill(NOME_CATEGORIA);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await esperarToast(page, "Categoria criada.");
    const linha = page.getByRole("row", { name: new RegExp(escapar(NOME_CATEGORIA)) });
    await expect(linha).toBeVisible();
    expect(await db().categoriaDespesa.findUnique({ where: { nome: NOME_CATEGORIA } })).not.toBeNull();

    await page.getByRole("button", { name: `Excluir ${NOME_CATEGORIA}` }).click();
    const confirmacao = page.getByRole("dialog");
    await confirmacao.getByRole("button", { name: "Excluir", exact: true }).click();
    await esperarToast(page, "Categoria excluída.");
    expect(await db().categoriaDespesa.findUnique({ where: { nome: NOME_CATEGORIA } })).toBeNull();
  });
});

test.describe("Boletos a pagar", () => {
  let contaId = 0;

  test("cadastra um boleto", async ({ page }) => {
    await page.goto("/financeiro/contas-a-pagar");
    await page.getByRole("button", { name: "Novo boleto" }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Novo boleto a pagar");
    await dialogo.getByLabel("Descrição").fill(DESCRICAO_BOLETO);
    await digitarCentavos(dialogo.getByLabel("Valor"), 45_000);
    await dialogo.getByLabel("Vencimento").fill(dataInput(10));
    await dialogo.getByLabel("Categoria").selectOption({ label: "Fornecedores" });
    await dialogo.getByLabel("Linha digitável / código do boleto").fill("23793.38128 60000.009999 00000.000000 1 00000000045000");
    await dialogo.getByRole("button", { name: "Cadastrar boleto" }).click();
    await esperarToast(page, "Boleto cadastrado.");

    const conta = await db().contaPagar.findFirst({ where: { descricao: DESCRICAO_BOLETO } });
    expect(conta?.status).toBe("PENDENTE");
    expect(conta?.valor).toBe(45_000);
    contaId = conta!.id;
    await expect(page.getByRole("row", { name: new RegExp(escapar(DESCRICAO_BOLETO)) })).toBeVisible();
  });

  test("paga o boleto e desfaz o pagamento", async ({ page }) => {
    await page.goto("/financeiro/contas-a-pagar");
    const linha = page.getByRole("row", { name: new RegExp(escapar(DESCRICAO_BOLETO)) }).first();
    await linha.getByRole("button", { name: "Pagar" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Registrar pagamento");
    await dialogo.getByLabel("Data do pagamento").fill(dataInput());
    await dialogo.getByLabel("Como foi pago").selectOption("PIX");
    await expect(dialogo.getByLabel("Saiu do dinheiro do caixa")).not.toBeChecked();
    await dialogo.getByRole("button", { name: /Confirmar pagamento de R\$ 450,00/ }).click();
    await esperarToast(page, "Pagamento registrado.");

    const paga = await db().contaPagar.findUnique({ where: { id: contaId }, include: { despesa: true } });
    expect(paga?.status).toBe("PAGA");
    expect(paga?.valorPago).toBe(45_000);
    expect(paga?.despesa?.valor).toBe(45_000);

    await page.goto("/financeiro/contas-a-pagar?visao=pagas");
    const linhaPaga = page.getByRole("row", { name: new RegExp(escapar(DESCRICAO_BOLETO)) }).first();
    await linhaPaga.getByRole("button", { name: "Desfazer pagamento" }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao).toContainText("Desfazer pagamento?");
    await confirmacao.getByRole("button", { name: "Desfazer pagamento" }).click();
    await esperarToast(page, "Pagamento desfeito.");

    const pendente = await db().contaPagar.findUnique({ where: { id: contaId }, include: { despesa: true } });
    expect(pendente?.status).toBe("PENDENTE");
    expect(pendente?.despesa).toBeNull();
  });

  test("cancela o boleto com motivo", async ({ page }) => {
    await page.goto("/financeiro/contas-a-pagar");
    const linha = page.getByRole("row", { name: new RegExp(escapar(DESCRICAO_BOLETO)) }).first();
    await linha.getByRole("button", { name: "Cancelar conta" }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao).toContainText("Cancelar esta conta?");
    await confirmacao.getByLabel(/Motivo/).fill("Boleto de teste, cancelado no fim do teste de fumaça.");
    await confirmacao.getByRole("button", { name: "Cancelar conta" }).click();
    await esperarToast(page, "Conta cancelada.");
    expect((await db().contaPagar.findUnique({ where: { id: contaId } }))?.status).toBe("CANCELADA");

    // A aba "Canceladas" lista por mês de vencimento: abre o mês do boleto (pode cair no mês seguinte).
    const cancelada = await db().contaPagar.findUnique({ where: { id: contaId } });
    const mes = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(cancelada!.vencimento);
    await page.goto(`/financeiro/contas-a-pagar?visao=canceladas&mes=${mes}`);
    await expect(page.getByRole("row", { name: new RegExp(escapar(DESCRICAO_BOLETO)) })).toBeVisible();
  });
});
