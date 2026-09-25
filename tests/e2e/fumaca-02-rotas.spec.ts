/**
 * Navegação por todas as rotas do menu e sub-rotas conhecidas, logado como
 * administrador: cada uma responde 200 sem texto de erro do Next.
 */
import { test, expect, conferirRota } from "./fixtures";
import { dadosBase } from "./dados";

type Dados = Awaited<ReturnType<typeof dadosBase>>;

/** Rotas fixas (menu + sub-rotas) e dinâmicas (dependem de ids reais do banco). */
type Rota = string | [rotulo: string, montar: (d: Dados) => string | null];
const ROTAS: Rota[] = [
  "/",
  "/login",
  // Operação
  "/pdv",
  "/caixa",
  "/caixa/historico",
  ["/caixa/<id da sessão aberta>", (d) => (d.sessaoAbertaId ? `/caixa/${d.sessaoAbertaId}` : null)],
  ["/caixa/<id de sessão fechada>", (d) => (d.sessaoFechadaId ? `/caixa/${d.sessaoFechadaId}` : null)],
  ["/caixa/<id>/resumo", (d) => (d.sessaoFechadaId ? `/caixa/${d.sessaoFechadaId}/resumo` : null)],
  "/vendas",
  ["/vendas/<id>", (d) => (d.vendaId ? `/vendas/${d.vendaId}` : null)],
  ["/vendas/<id>/cupom", (d) => (d.vendaId ? `/vendas/${d.vendaId}/cupom` : null)],
  // Cadastros
  "/produtos",
  "/produtos/novo",
  "/produtos/categorias",
  "/produtos/importar",
  ["/produtos/<id>", (d) => `/produtos/${d.pdvUn1.id}`],
  "/clientes",
  "/clientes/novo",
  ["/clientes/<id>", (d) => (d.clienteId ? `/clientes/${d.clienteId}` : null)],
  [
    "/clientes/<id>/recibo/<lancamentoId>",
    (d) => (d.reciboClienteId && d.reciboLancamentoId ? `/clientes/${d.reciboClienteId}/recibo/${d.reciboLancamentoId}` : null),
  ],
  "/financeiro/fornecedores",
  ["/financeiro/fornecedores/<id>", (d) => (d.fornecedorId ? `/financeiro/fornecedores/${d.fornecedorId}` : null)],
  // Estoque
  "/estoque",
  "/estoque/entradas",
  "/estoque/entradas/nova",
  ["/estoque/entradas/<id>", (d) => (d.entradaId ? `/estoque/entradas/${d.entradaId}` : null)],
  "/estoque/perdas",
  "/estoque/vencimentos",
  ["/estoque/movimentos/<produtoId>", (d) => `/estoque/movimentos/${d.pdvUn1.id}`],
  // Financeiro
  "/financeiro",
  "/financeiro/despesas",
  "/financeiro/despesas/categorias",
  "/financeiro/contas-a-pagar",
  "/financeiro/contas-a-pagar?visao=pagas",
  "/financeiro/contas-a-pagar?visao=canceladas",
  "/financeiro/contas-a-pagar/calendario",
  // Gestão e relatórios
  "/gestao",
  "/gestao/fechamento",
  "/gestao/comparativo",
  "/relatorios",
  "/relatorios/lucro",
  "/relatorios/mais-vendidos",
  "/relatorios/abc",
  "/relatorios/estoque",
  "/relatorios/pagamentos",
  "/relatorios/clientes",
  "/relatorios/conciliacao",
  // Configurações
  "/configuracoes",
  "/configuracoes/usuarios",
  "/configuracoes/pagamentos",
  "/configuracoes/maquininhas",
  "/configuracoes/pix",
  "/configuracoes/mercado-pago",
  "/configuracoes/metas",
  "/configuracoes/backup",
  "/configuracoes/auditoria",
];

/** Route handlers de exportação (CSV) e API: só o status e o tipo do conteúdo. */
const EXPORTACOES = [
  "/produtos/exportar",
  "/clientes/exportar",
  "/financeiro/fornecedores/exportar",
  "/relatorios/exportar?tipo=mais-vendidos",
  "/relatorios/exportar?tipo=lucro-produtos",
  "/relatorios/exportar?tipo=abc",
  "/relatorios/exportar?tipo=estoque-giro",
  "/relatorios/exportar?tipo=pagamentos",
  "/relatorios/exportar?tipo=clientes",
  "/relatorios/exportar?tipo=conciliacao",
  "/gestao/fechamento/exportar",
  "/configuracoes/auditoria/exportar",
];

let dados: Dados;
test.beforeAll(async () => {
  dados = await dadosBase();
});

test.describe("Rotas", () => {
  for (const rota of ROTAS) {
    const rotulo = typeof rota === "string" ? rota : rota[0];
    test(`GET ${rotulo}`, async ({ page }) => {
      const caminho = typeof rota === "string" ? rota : rota[1](dados);
      test.skip(caminho === null, "sem registro no banco pra montar a rota");
      await conferirRota(page, caminho as string);
    });
  }

  test("exportações CSV respondem 200", async ({ page }) => {
    for (const rota of EXPORTACOES) {
      const r = await page.request.get(rota);
      expect(r.status(), rota).toBe(200);
      const corpo = await r.text();
      expect(corpo.toLowerCase(), rota).not.toContain("application error");
    }
  });

  test("rota inexistente devolve 404 da aplicação", async ({ page }) => {
    const r = await page.goto("/rota-que-nao-existe");
    expect(r?.status()).toBe(404);
  });
});
