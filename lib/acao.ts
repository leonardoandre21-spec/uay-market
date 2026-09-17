// Tipo padrão de retorno das server actions. Nunca lance erro pro cliente:
// devolva { ok: false, erro } com mensagem legível em português.

import { ZodError } from "zod";
import { parseReais } from "@/lib/dinheiro";

export type Resultado<T = undefined> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; campos?: Record<string, string> };

export function sucesso<T>(dados: T): Resultado<T> {
  return { ok: true, dados };
}

export function falha<T = undefined>(erro: string, campos?: Record<string, string>): Resultado<T> {
  return { ok: false, erro, campos };
}

export const MENSAGEM_BANCO_OCUPADO =
  "O sistema está ocupado gravando outra operação e esta não foi concluída. Aguarde alguns segundos e tente de novo.";
export const MENSAGEM_ERRO_BANCO =
  "Erro interno ao acessar o banco de dados. A operação não foi concluída; tente de novo e, se continuar, avise o suporte.";

/** Códigos do Prisma que significam "o banco estava travado ou a transação estourou o tempo": vale tentar de novo. */
const CODIGOS_BANCO_OCUPADO = new Set(["P1008", "P2024", "P2028", "P2034"]);
/** Mesmos casos quando vêm sem código (erro cru do SQLite ou da transação interativa). */
const PADRAO_SQLITE_OCUPADO = /database is locked|SQLITE_BUSY/i;
const PADRAO_TRANSACAO_EXPIRADA = /Transaction already closed|Transaction not found|timed out/i;

/** Erro vindo do Prisma (conhecido, desconhecido, de validação ou pânico do engine). */
function ehErroPrisma(e: unknown): e is Error & { code?: string } {
  return e instanceof Error && (e.name.startsWith("PrismaClient") || "clientVersion" in e);
}

/**
 * Converte qualquer erro (Zod, Prisma, Error) em Resultado de falha legível.
 * Mensagens de `Error` lançadas pelos serviços passam direto (já vêm em
 * português); texto cru do Prisma nunca chega no operador: vira uma mensagem
 * fixa e o erro original vai pro log do servidor.
 */
export function tratarErro<T = undefined>(e: unknown, fallback = "Não foi possível concluir a operação."): Resultado<T> {
  if (e instanceof ZodError) {
    const campos: Record<string, string> = {};
    for (const issue of e.issues) {
      const chave = issue.path.join(".") || "_";
      if (!campos[chave]) campos[chave] = issue.message;
    }
    const primeira = e.issues[0]?.message ?? "Dados inválidos.";
    return falha(primeira, campos);
  }
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code: string }).code;
    if (code === "P2002") return falha("Já existe um registro com esse valor (campo único duplicado).");
    if (code === "P2003") return falha("Não é possível excluir: existem registros vinculados.");
    if (code === "P2025") return falha("Registro não encontrado.");
    if (CODIGOS_BANCO_OCUPADO.has(code)) {
      console.error("Banco ocupado ou transação expirada:", e);
      return falha(MENSAGEM_BANCO_OCUPADO);
    }
  }
  if (e instanceof Error && PADRAO_SQLITE_OCUPADO.test(e.message)) {
    console.error("Banco ocupado:", e);
    return falha(MENSAGEM_BANCO_OCUPADO);
  }
  if (ehErroPrisma(e)) {
    if (PADRAO_TRANSACAO_EXPIRADA.test(e.message)) {
      console.error("Transação expirada:", e);
      return falha(MENSAGEM_BANCO_OCUPADO);
    }
    console.error("Erro do Prisma em server action:", e);
    return falha(MENSAGEM_ERRO_BANCO);
  }
  if (e instanceof Error && e.message) return falha(e.message);
  return falha(fallback);
}

/**
 * Envolve uma função em try/catch devolvendo Resultado.
 * Uso: return executar(async () => { ...; return dados })
 */
export async function executar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return sucesso(await fn());
  } catch (e) {
    return tratarErro<T>(e);
  }
}

/** Lê campos de FormData como string (ou "" se ausente). */
export function campo(form: FormData, nome: string): string {
  const v = form.get(nome);
  return typeof v === "string" ? v.trim() : "";
}

/** Lê campo opcional: "" vira null. */
export function campoOpcional(form: FormData, nome: string): string | null {
  const v = campo(form, nome);
  return v === "" ? null : v;
}

/** Lê inteiro de FormData (ou null). */
export function campoInteiro(form: FormData, nome: string): number | null {
  const v = campo(form, nome);
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/** Lê checkbox de FormData. */
export function campoBooleano(form: FormData, nome: string): boolean {
  const v = form.get(nome);
  return v === "on" || v === "true" || v === "1";
}

/** Lê um campo de dinheiro (EntradaMoeda envia "12,50") como centavos, ou null. Seguro em server actions. */
export function lerMoeda(form: FormData, nome: string): number | null {
  const v = form.get(nome);
  return typeof v === "string" ? parseReais(v) : null;
}
