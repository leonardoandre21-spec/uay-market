import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Papel } from "@prisma/client";
import { db } from "@/lib/db";
import {
  assinarSessao,
  DURACAO_SESSAO_SEGUNDOS,
  NOME_COOKIE_SESSAO,
  verificarSessao,
  type DadosSessao,
} from "@/lib/sessao-token";

// ---------------------------------------------------------------- PIN

/** Gera hash do PIN com scrypt (sem dependência nativa). Formato: salt:hash em hex. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verificarPin(pin: string, pinHash: string): boolean {
  const [salt, hashEsperado] = pinHash.split(":");
  if (!salt || !hashEsperado) return false;
  const hash = scryptSync(pin, salt, 64);
  const esperado = Buffer.from(hashEsperado, "hex");
  return hash.length === esperado.length && timingSafeEqual(hash, esperado);
}

export function pinValido(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

// ---------------------------------------------------------------- sessão

export type Sessao = DadosSessao;

/**
 * Sessão atual ou null. Não redireciona.
 *
 * O cookie só prova que o usuário fez login (assinatura + validade de 14h).
 * Quem manda no acesso é o cadastro: a cada chamada o usuário é relido do
 * banco, então desativar ou rebaixar alguém em Configurações > Usuários vale
 * na hora, sem esperar o cookie expirar. Nome e papel também vêm do banco.
 * O middleware (Edge, sem Prisma) continua só com a assinatura; a decisão
 * final é sempre daqui, via exigirSessao/exigirAdmin e as versões "Acao".
 */
export async function obterSessao(): Promise<Sessao | null> {
  const jar = await cookies();
  const token = await verificarSessao(jar.get(NOME_COOKIE_SESSAO)?.value);
  if (!token) return null;
  const usuario = await db.usuario.findUnique({
    where: { id: token.usuarioId },
    select: { nome: true, papel: true, ativo: true },
  });
  if (!usuario || !usuario.ativo) return null;
  return { usuarioId: token.usuarioId, nome: usuario.nome, papel: usuario.papel, exp: token.exp };
}

/** Exige usuário logado. Redireciona pro login se não houver. */
export async function exigirSessao(): Promise<Sessao> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  return sessao;
}

/** Exige ADMIN. Redireciona pra home se for operador. */
export async function exigirAdmin(): Promise<Sessao> {
  const sessao = await exigirSessao();
  if (sessao.papel !== "ADMIN") redirect("/?erro=sem-permissao");
  return sessao;
}

/** Versão pra server actions: lança erro em vez de redirecionar. */
export async function exigirSessaoAcao(): Promise<Sessao> {
  const sessao = await obterSessao();
  if (!sessao) throw new Error("Sessão expirada. Faça login novamente.");
  return sessao;
}

export async function exigirAdminAcao(): Promise<Sessao> {
  const sessao = await exigirSessaoAcao();
  if (sessao.papel !== "ADMIN") throw new Error("Apenas administradores podem fazer isso.");
  return sessao;
}

export async function iniciarSessao(usuario: { id: number; nome: string; papel: Papel }): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + DURACAO_SESSAO_SEGUNDOS;
  const token = await assinarSessao({ usuarioId: usuario.id, nome: usuario.nome, papel: usuario.papel, exp });
  const jar = await cookies();
  jar.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_INSEGURO !== "1",
    path: "/",
    maxAge: DURACAO_SESSAO_SEGUNDOS,
  });
}

export async function encerrarSessao(): Promise<void> {
  const jar = await cookies();
  jar.delete(NOME_COOKIE_SESSAO);
}

/**
 * Autentica por PIN. O PIN é conferido só contra o usuário escolhido; sem
 * usuário escolhido, só funciona quando existe um único usuário ativo (a tela
 * de login já seleciona esse sozinha). Nunca testa o PIN "em todo mundo":
 * dois usuários com o mesmo PIN fariam quem não escolheu o nome entrar como
 * o primeiro cadastrado, normalmente o administrador.
 */
export async function autenticarPorPin(pin: string, usuarioId?: number) {
  if (!pinValido(pin)) return null;
  const usuarios = await db.usuario.findMany({
    where: { ativo: true, ...(usuarioId ? { id: usuarioId } : {}) },
    orderBy: { id: "asc" },
    take: 2,
  });
  if (usuarios.length !== 1) return null;
  const [u] = usuarios;
  return verificarPin(pin, u.pinHash) ? u : null;
}

/**
 * Confere se algum outro usuário (ativo ou não) já usa esse PIN, pra recusar
 * PIN repetido ao criar usuário ou trocar PIN. Poucos usuários, então o custo
 * do scrypt em cada um é aceitável.
 */
export async function pinEmUsoPorOutro(pin: string, excetoUsuarioId?: number): Promise<boolean> {
  const usuarios = await db.usuario.findMany({
    where: excetoUsuarioId ? { id: { not: excetoUsuarioId } } : {},
    select: { pinHash: true },
  });
  return usuarios.some((u) => verificarPin(pin, u.pinHash));
}
