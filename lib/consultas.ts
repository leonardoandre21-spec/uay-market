import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { agora } from "@/lib/datas";

// Consultas compartilhadas entre módulos. Só leitura. Cada módulo escreve
// sua própria lógica de escrita em lib/servicos/<modulo>.ts.

export type ClienteDb = Prisma.TransactionClient | typeof db;

/**
 * Linha única de configuração; cria com defaults se não existir.
 * Leitura pura no caminho comum: o upsert (mesmo com `update: {}`) abre uma
 * transação de escrita no SQLite e travava layouts e polling atrás de qualquer
 * venda em andamento. Só cai no upsert quando a linha ainda não existe (banco
 * virgem antes do seed), e aí o upsert evita corrida entre dois creates.
 */
export async function obterConfiguracao(tx: ClienteDb = db) {
  const existente = await tx.configuracao.findUnique({ where: { id: 1 } });
  if (existente) return existente;
  return tx.configuracao.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

/** Configurações de taxa por forma de pagamento (cria as que faltarem). */
export async function obterConfiguracoesPagamento(tx: ClienteDb = db) {
  const formas = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "FIADO"] as const;
  const existentes = await tx.configuracaoPagamento.findMany();
  const faltando = formas.filter((f) => !existentes.some((e) => e.forma === f));
  if (faltando.length) {
    await tx.configuracaoPagamento.createMany({ data: faltando.map((forma) => ({ forma })) });
    return tx.configuracaoPagamento.findMany();
  }
  return existentes;
}

/** Sessão de caixa aberta (só pode existir uma) ou null. */
export async function obterSessaoCaixaAberta(tx: ClienteDb = db) {
  return tx.sessaoCaixa.findFirst({ where: { status: "ABERTO" }, orderBy: { abertoEm: "desc" } });
}

export async function listarCategorias(tx: ClienteDb = db) {
  return tx.categoria.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
}

export async function listarCategoriasDespesa(tx: ClienteDb = db) {
  return tx.categoriaDespesa.findMany({ orderBy: { nome: "asc" } });
}

export async function listarFornecedoresAtivos(tx: ClienteDb = db) {
  return tx.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } });
}

export async function listarClientesAtivos(tx: ClienteDb = db) {
  return tx.cliente.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } });
}

export async function listarUsuariosAtivos(tx: ClienteDb = db) {
  return tx.usuario.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, papel: true },
  });
}

export async function listarProdutosAtivos(tx: ClienteDb = db) {
  return tx.produto.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    include: { categoria: true },
  });
}

/**
 * Busca produto pelo que o leitor bipou: código de barras exato, código interno
 * exato, ou id numérico. Retorna null se não achar.
 */
export async function buscarProdutoPorCodigo(codigo: string, tx: ClienteDb = db) {
  const c = codigo.trim();
  if (!c) return null;
  const porCodigo = await tx.produto.findFirst({
    where: { ativo: true, OR: [{ codigoBarras: c }, { codigoInterno: c }] },
    include: { categoria: true },
  });
  if (porCodigo) return porCodigo;
  // Leitores às vezes omitem/adicionam o dígito verificador do EAN-13 ou leem UPC-A com zero à esquerda.
  if (/^\d{12}$/.test(c)) {
    const comZero = await tx.produto.findFirst({
      where: { ativo: true, codigoBarras: `0${c}` },
      include: { categoria: true },
    });
    if (comZero) return comZero;
  }
  if (/^0\d{12}$/.test(c)) {
    const semZero = await tx.produto.findFirst({
      where: { ativo: true, codigoBarras: c.slice(1) },
      include: { categoria: true },
    });
    if (semZero) return semZero;
  }
  return null;
}

/** Busca por nome (contém) pra autocompletar no caixa e nos cadastros. */
export async function buscarProdutosPorNome(termo: string, limite = 20, tx: ClienteDb = db) {
  const t = termo.trim();
  if (!t) return [];
  return tx.produto.findMany({
    where: { ativo: true, nome: { contains: t, mode: "insensitive" } },
    orderBy: { nome: "asc" },
    take: limite,
    include: { categoria: true },
  });
}

/** Preço efetivo: promocional se estiver dentro da validade da promoção. */
export function precoEfetivo(produto: {
  precoVenda: number;
  precoPromocional: number | null;
  promocaoAte: Date | null;
}): number {
  if (
    produto.precoPromocional !== null &&
    produto.precoPromocional > 0 &&
    (produto.promocaoAte === null || produto.promocaoAte.getTime() >= agora().getTime())
  ) {
    // Defesa: promoção nunca cobra mais que o preço normal.
    return Math.min(produto.precoPromocional, produto.precoVenda);
  }
  return produto.precoVenda;
}

/** Saldo devedor do cliente em centavos (DEBITO − PAGAMENTO − ESTORNO). */
export async function saldoFiado(clienteId: number, tx: ClienteDb = db): Promise<number> {
  const [deb, abat] = await Promise.all([
    tx.lancamentoFiado.aggregate({ where: { clienteId, tipo: "DEBITO" }, _sum: { valor: true } }),
    tx.lancamentoFiado.aggregate({ where: { clienteId, tipo: { in: ["PAGAMENTO", "ESTORNO"] } }, _sum: { valor: true } }),
  ]);
  return (deb._sum.valor ?? 0) - (abat._sum.valor ?? 0);
}

/** Próximo número de cupom (sequencial). Chamar dentro de transação. */
export async function proximoNumeroVenda(tx: ClienteDb): Promise<number> {
  const ultimo = await tx.venda.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
  return (ultimo?.numero ?? 0) + 1;
}
