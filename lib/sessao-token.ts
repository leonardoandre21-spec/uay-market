// Token de sessão assinado com HMAC-SHA256 via Web Crypto.
// Funciona no runtime Node (server actions) e no Edge (middleware).

import type { Papel } from "@prisma/client";

export const NOME_COOKIE_SESSAO = "uay_sessao";
export const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 14; // 14h (um turno longo de caixa)

export type DadosSessao = {
  usuarioId: number;
  nome: string;
  papel: Papel;
  exp: number; // epoch em segundos
};

const SEGREDO_DESENVOLVIMENTO = "segredo-de-desenvolvimento-uay-market-troque-em-producao";
/** Tamanho mínimo em produção (o .env.example pede 32+ e o instalar.bat gera 64 hex). */
export const TAMANHO_MINIMO_SEGREDO = 32;

/**
 * Motivo pelo qual um SESSAO_SEGREDO não serve pra produção, ou null se serve.
 * Um segredo conhecido (o exemplo do .env.example, o de desenvolvimento ou um
 * `dev-...` copiado da máquina de quem programou) deixaria qualquer pessoa
 * forjar um cookie de administrador sem PIN.
 */
export function motivoSegredoInvalido(s: string | undefined): string | null {
  if (!s) return "SESSAO_SEGREDO não está definido no .env.";
  if (s.length < TAMANHO_MINIMO_SEGREDO) {
    return `SESSAO_SEGREDO é curto demais (mínimo ${TAMANHO_MINIMO_SEGREDO} caracteres).`;
  }
  const normalizado = s.trim().toLowerCase();
  if (normalizado.startsWith("troque-por") || normalizado === SEGREDO_DESENVOLVIMENTO || normalizado.startsWith("dev-")) {
    return "SESSAO_SEGREDO ainda é o valor de exemplo/desenvolvimento.";
  }
  return null;
}

function segredo(): string {
  const s = process.env.SESSAO_SEGREDO;
  if (process.env.NODE_ENV === "production") {
    const motivo = motivoSegredoInvalido(s);
    if (motivo) {
      throw new Error(
        `${motivo} Gere um novo com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" ` +
          "e grave em SESSAO_SEGREDO no .env (o scripts\\instalar.bat faz isso sozinho num .env novo).",
      );
    }
    return s as string;
  }
  return s && s.length >= 16 ? s : SEGREDO_DESENVOLVIMENTO;
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64url(texto: string): Uint8Array<ArrayBuffer> {
  const padded = texto.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (texto.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function chaveHmac(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function assinarSessao(dados: DadosSessao): Promise<string> {
  const corpo = base64url(new TextEncoder().encode(JSON.stringify(dados)));
  const assinatura = await crypto.subtle.sign("HMAC", await chaveHmac(), new TextEncoder().encode(corpo));
  return `${corpo}.${base64url(new Uint8Array(assinatura))}`;
}

export async function verificarSessao(token: string | undefined | null): Promise<DadosSessao | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [corpo, assinatura] = partes;
  try {
    const valido = await crypto.subtle.verify(
      "HMAC",
      await chaveHmac(),
      deBase64url(assinatura),
      new TextEncoder().encode(corpo),
    );
    if (!valido) return null;
    const dados = JSON.parse(new TextDecoder().decode(deBase64url(corpo))) as DadosSessao;
    if (typeof dados.usuarioId !== "number" || typeof dados.exp !== "number") return null;
    if (dados.exp * 1000 < Date.now()) return null;
    return dados;
  } catch {
    return null;
  }
}
