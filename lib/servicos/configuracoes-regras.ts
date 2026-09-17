// Regras puras do módulo de configurações (sem banco, sem Next). Tudo aqui
// tem teste em tests/configuracoes.test.ts.

import type { Papel } from "@prisma/client";

// ---------------------------------------------------------------- PIN

/** PIN aceito: só dígitos, de 4 a 8. Espelha a regra de lib/auth.ts. */
export function pinValido(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export const MENSAGEM_PIN_INVALIDO = "O PIN precisa ter de 4 a 8 números, sem letras.";

// ---------------------------------------------------------------- último admin

export type UsuarioResumo = { id: number; papel: Papel; ativo: boolean };

/**
 * Diz se o usuário `id` pode deixar de ser um administrador ativo (por
 * desativação ou rebaixamento pra operador). Só é permitido quando sobra pelo
 * menos um OUTRO administrador ativo na lista. Usuário que não é admin ativo
 * pode sempre ser alterado.
 */
export function podeDesativarAdmin(lista: UsuarioResumo[], id: number): boolean {
  const alvo = lista.find((u) => u.id === id);
  if (!alvo) return false;
  if (alvo.papel !== "ADMIN" || !alvo.ativo) return true;
  return lista.some((u) => u.id !== id && u.papel === "ADMIN" && u.ativo);
}

// ---------------------------------------------------------------- restauração de backup

/**
 * Limite do arquivo .json enviado pra restaurar. O backup de um mercado tem
 * poucos MB; 200 MB é folga de sobra e cabe na memória da função.
 */
export const TAMANHO_MAXIMO_RESTAURACAO = 200 * 1024 * 1024;

/** Lê o cabeçalho Content-Length; null quando ausente, vazio ou fora do formato (só dígitos). */
export function lerContentLength(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = valor.trim();
  if (!/^\d{1,15}$/.test(texto)) return null;
  return Number(texto);
}

/** "1,2 MB", "340 KB". */
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

// ---------------------------------------------------------------- Mercado Pago

export type TipoTokenMercadoPago = "producao" | "teste" | "desconhecido";

/** Só o prefixo do token diz se é de produção (APP_USR-) ou de teste (TEST-). Nunca exponha o token. */
export function tipoTokenMercadoPago(token: string | null | undefined): TipoTokenMercadoPago | null {
  if (!token) return null;
  if (token.startsWith("APP_USR-")) return "producao";
  if (token.startsWith("TEST-")) return "teste";
  return "desconhecido";
}

// ---------------------------------------------------------------- CSV

/** Escapa um valor pra CSV separado por ponto e vírgula (padrão do Excel em português). */
export function celulaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const s = String(valor);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
