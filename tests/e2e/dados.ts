/**
 * Acesso direto ao banco de teste (Prisma) pra descobrir ids reais e limpar o
 * que o teste de fumaça criou. Lê DATABASE_URL do .env quando não está no ambiente.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function carregarEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const texto = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
    for (const linha of texto.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(linha);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // sem .env: o Prisma reclama sozinho
  }
}
carregarEnv();

let cliente: PrismaClient | null = null;
export function db(): PrismaClient {
  if (!cliente) cliente = new PrismaClient();
  return cliente;
}
export async function desconectar() {
  await cliente?.$disconnect();
  cliente = null;
}

/** Prefixo em todo nome criado pelo teste, pra reconhecer e limpar depois. */
export const PREFIXO = "E2E";
export const ARQUIVO_SESSAO = path.resolve(__dirname, ".auth/admin.json");

/** Sufixo curto e único por execução, pra não bater em índices únicos. */
export const SUFIXO = Date.now().toString(36).slice(-5).toUpperCase();
export const nome = (base: string) => `${PREFIXO} ${base} ${SUFIXO}`;

/** "yyyy-MM-dd" de hoje (ou hoje + dias) no fuso da loja. */
export function dataInput(maisDias = 0): string {
  const d = new Date(Date.now() + maisDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** EAN-13 válido a partir de 12 dígitos. */
export function ean13(base12: string): string {
  const d = base12.padStart(12, "0").slice(0, 12).split("").map(Number);
  let soma = 0;
  d.slice()
    .reverse()
    .forEach((n, i) => {
      soma += n * (i % 2 === 0 ? 3 : 1);
    });
  return base12 + String((10 - (soma % 10)) % 10);
}

export function formatarReais(centavos: number, comSimbolo = true): string {
  const abs = Math.abs(Math.round(centavos));
  const inteiro = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const texto = `${inteiro},${(abs % 100).toString().padStart(2, "0")}`;
  return `${centavos < 0 ? "-" : ""}${comSimbolo ? "R$ " : ""}${texto}`;
}

/** "R$ 1.234,56" -> 123456 */
export function lerReais(texto: string): number {
  const m = /-?\d[\d.]*,\d{2}/.exec(texto);
  if (!m) throw new Error(`Valor em reais não encontrado em "${texto}"`);
  return parseInt(m[0].replace(/\D/g, ""), 10) * (m[0].startsWith("-") ? -1 : 1);
}

export type ProdutoTeste = {
  id: number;
  nome: string;
  codigoBarras: string;
  unidade: "UN" | "KG";
  precoVenda: number;
  precoCusto: number;
  estoque: number;
  controlaValidade: boolean;
};

const selecaoProduto = {
  id: true,
  nome: true,
  codigoBarras: true,
  unidade: true,
  precoVenda: true,
  precoCusto: true,
  estoque: true,
  controlaValidade: true,
} as const;

/** Produtos ativos, com código de barras, sem promoção vigente e com estoque, na ordem do id. */
async function produtosCandidatos(): Promise<ProdutoTeste[]> {
  const lista = await db().produto.findMany({
    where: {
      ativo: true,
      codigoBarras: { not: null },
      estoque: { gt: 5000 },
      OR: [{ precoPromocional: null }, { promocaoAte: { lt: new Date() } }],
    },
    select: selecaoProduto,
    orderBy: { id: "asc" },
  });
  return lista.map((p) => ({ ...p, codigoBarras: p.codigoBarras as string }));
}

/** Ids e registros reais do banco de demonstração usados pelos testes. */
export async function dadosBase() {
  const produtos = await produtosCandidatos();
  const un = produtos.filter((p) => p.unidade === "UN" && !p.controlaValidade);
  const kg = produtos.filter((p) => p.unidade === "KG");
  const comValidade = produtos.filter((p) => p.unidade === "UN" && p.controlaValidade);
  if (un.length < 4 || kg.length < 1 || comValidade.length < 1) {
    throw new Error("Banco de demonstração sem produtos suficientes pro teste de fumaça (rode npm run db:seed:demo).");
  }

  const [sessaoAberta, sessaoFechada, venda, entrada, fornecedor, clienteQualquer, usuarioAdmin, lancamento] =
    await Promise.all([
      db().sessaoCaixa.findFirst({ where: { status: "ABERTO" }, select: { id: true } }),
      db().sessaoCaixa.findFirst({ where: { status: "FECHADO" }, orderBy: { id: "desc" }, select: { id: true } }),
      db().venda.findFirst({ orderBy: { id: "desc" }, select: { id: true, numero: true } }),
      db().entradaEstoque.findFirst({ orderBy: { id: "desc" }, select: { id: true } }),
      db().fornecedor.findFirst({ where: { ativo: true }, orderBy: { id: "asc" }, select: { id: true, nome: true } }),
      db().cliente.findFirst({ where: { ativo: true }, orderBy: { id: "asc" }, select: { id: true, nome: true } }),
      db().usuario.findFirst({ where: { papel: "ADMIN", ativo: true }, select: { id: true, nome: true } }),
      db().lancamentoFiado.findFirst({ where: { tipo: "PAGAMENTO" }, select: { id: true, clienteId: true } }),
    ]);

  // Lote com validade futura pra testar a promoção pela tela de vencimentos,
  // de um produto que o PDV não vai vender (pra não mexer no preço da venda).
  const evitar = new Set([un[0].id, un[1].id, kg[0].id]);
  const lotes = await db().lote.findMany({
    where: { quantidade: { gt: 0 }, validade: { gte: new Date() }, produto: { ativo: true } },
    select: { id: true, produtoId: true, produto: { select: { nome: true, precoVenda: true } } },
    orderBy: { validade: "asc" },
  });
  const lotePromocao = lotes.find((l) => !evitar.has(l.produtoId)) ?? null;

  return {
    // PDV: dois por unidade e um por quilo
    pdvUn1: un[0],
    pdvUn2: un[1],
    pdvKg: kg[0],
    // Entrada de estoque: um sem validade e um com
    entradaSemValidade: un[2],
    entradaComValidade: comValidade[0],
    // Perda e ajuste em produto simples
    perda: un[3],
    ajuste: un[3],
    sessaoAbertaId: sessaoAberta?.id ?? null,
    sessaoFechadaId: sessaoFechada?.id ?? null,
    vendaId: venda?.id ?? null,
    entradaId: entrada?.id ?? null,
    fornecedorId: fornecedor?.id ?? null,
    fornecedorNome: fornecedor?.nome ?? "",
    clienteId: clienteQualquer?.id ?? null,
    reciboClienteId: lancamento?.clienteId ?? null,
    reciboLancamentoId: lancamento?.id ?? null,
    lotePromocao,
    adminNome: usuarioAdmin?.nome ?? "Administrador",
  };
}

export async function vendaPorNumero(numero: number) {
  return db().venda.findUnique({ where: { numero }, select: { id: true, status: true, total: true, sessaoId: true } });
}

/** Saldo devedor = DEBITO - PAGAMENTO - ESTORNO. */
export async function saldoFiado(clienteId: number): Promise<number> {
  const grupos = await db().lancamentoFiado.groupBy({ by: ["tipo"], where: { clienteId }, _sum: { valor: true } });
  const soma = (tipo: string) => grupos.find((g) => g.tipo === tipo)?._sum.valor ?? 0;
  return soma("DEBITO") - soma("PAGAMENTO") - soma("ESTORNO");
}

/** Remove o que ficou do teste (melhor esforço, cada passo isolado). */
export async function limparResiduos() {
  const d = db();
  const contem = { contains: `${PREFIXO} `, mode: "insensitive" as const };
  const passos: Array<() => Promise<unknown>> = [
    () => d.despesa.deleteMany({ where: { descricao: contem, contaPagarId: null } }),
    () => d.contaPagar.deleteMany({ where: { descricao: contem, status: { not: "PAGA" } } }),
    () => d.categoriaDespesa.deleteMany({ where: { nome: contem, despesas: { none: {} }, contas: { none: {} } } }),
    async () => {
      const clientes = await d.cliente.findMany({ where: { nome: contem, vendas: { none: {} } }, select: { id: true } });
      for (const c of clientes) {
        await d.lancamentoFiado.deleteMany({ where: { clienteId: c.id } });
        await d.cliente.delete({ where: { id: c.id } });
      }
    },
    () =>
      d.fornecedor.deleteMany({
        where: { nome: contem, entradas: { none: {} }, contas: { none: {} }, despesas: { none: {} } },
      }),
    () => d.maquininha.deleteMany({ where: { nome: contem, pagamentos: { none: {} } } }),
    () =>
      d.usuario.deleteMany({
        where: {
          nome: contem,
          auditorias: { none: {} },
          vendas: { none: {} },
          sessoesAbertas: { none: {} },
          sessoesFechadas: { none: {} },
          movimentosCaixa: { none: {} },
          movimentosEstoque: { none: {} },
          entradas: { none: {} },
          perdas: { none: {} },
          despesas: { none: {} },
          lancamentosFiado: { none: {} },
          historicoPrecos: { none: {} },
        },
      }),
    () =>
      d.produto.deleteMany({
        where: {
          nome: contem,
          itensVenda: { none: {} },
          movimentos: { none: {} },
          itensEntrada: { none: {} },
          perdas: { none: {} },
          lotes: { none: {} },
        },
      }),
    () => d.categoria.deleteMany({ where: { nome: contem, produtos: { none: {} } } }),
  ];
  for (const passo of passos) {
    try {
      await passo();
    } catch (e) {
      console.warn("[e2e] limpeza parcial:", e instanceof Error ? e.message.split("\n")[0] : e);
    }
  }
}
