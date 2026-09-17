"use server";

import { redirect } from "next/navigation";
import { autenticarPorPin, encerrarSessao, iniciarSessao, obterSessao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { db } from "@/lib/db";
import { campo, campoInteiro, falha, type Resultado } from "@/lib/acao";
import {
  CHAVE_GERAL,
  chaveUsuario,
  LimitadorTentativas,
  mensagemEspera,
  normalizarUsuarioId,
  OPCOES_GERAL,
  OPCOES_POR_USUARIO,
} from "@/lib/tentativas-login";

// Limitadores em memória (processo único). Um por usuário alvo, outro geral do
// PC, pra quem alterna de usuário ou omite o usuário não escapar do limite.
const limitadorPorUsuario = new LimitadorTentativas(OPCOES_POR_USUARIO);
const limitadorGeral = new LimitadorTentativas(OPCOES_GERAL);

/** Pausa fixa em todo PIN errado: não trava o servidor, só deixa script de força bruta mais lento. */
const ATRASO_PIN_ERRADO_MS = 500;

export async function entrar(form: FormData): Promise<Resultado<{ destino: string }>> {
  const pin = campo(form, "pin");
  const usuarioId = normalizarUsuarioId(campoInteiro(form, "usuarioId"));
  const chave = chaveUsuario(usuarioId);

  // Em espera: recusa antes de calcular qualquer hash (scrypt é caro e síncrono).
  const espera = Math.max(limitadorGeral.bloqueioRestante(CHAVE_GERAL), limitadorPorUsuario.bloqueioRestante(chave));
  if (espera > 0) return falha(mensagemEspera(espera));

  // Com mais de um usuário ativo, o PIN só é conferido contra o nome escolhido
  // (autenticarPorPin nunca testa em todos). Sem escolha, orienta em vez de
  // contar como PIN errado.
  if (usuarioId === undefined && (await db.usuario.count({ where: { ativo: true } })) > 1) {
    return falha("Escolha seu nome antes de digitar o PIN.");
  }

  const usuario = await autenticarPorPin(pin, usuarioId);
  if (!usuario) {
    const geral = limitadorGeral.registrarFalha(CHAVE_GERAL);
    const porUsuario = limitadorPorUsuario.registrarFalha(chave);
    const bloqueioMs = Math.max(geral.bloqueioMs, porUsuario.bloqueioMs);
    await registrarAuditoria({
      usuarioId: null,
      acao: "sessao.pin-incorreto",
      entidade: "Usuario",
      entidadeId: usuarioId ?? null,
      detalhes: {
        usuarioId: usuarioId ?? null,
        errosSeguidos: porUsuario.falhas,
        errosSeguidosNoPc: geral.falhas,
        esperaSegundos: Math.ceil(bloqueioMs / 1000),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, ATRASO_PIN_ERRADO_MS));
    if (bloqueioMs > 0) return falha(`PIN incorreto. ${mensagemEspera(bloqueioMs)}`);
    return falha("PIN incorreto. Tente novamente.");
  }

  limitadorPorUsuario.zerar(chave);
  limitadorGeral.zerar(CHAVE_GERAL);
  await iniciarSessao(usuario);
  await db.usuario.update({ where: { id: usuario.id }, data: { ultimoAcesso: new Date() } }).catch(() => undefined);
  await registrarAuditoria({ usuarioId: usuario.id, acao: "sessao.entrar", entidade: "Usuario", entidadeId: usuario.id });
  return { ok: true, dados: { destino: usuario.papel === "ADMIN" ? "/gestao" : "/pdv" } };
}

export async function sair(): Promise<void> {
  const sessao = await obterSessao();
  if (sessao) {
    await registrarAuditoria({ usuarioId: sessao.usuarioId, acao: "sessao.sair", entidade: "Usuario", entidadeId: sessao.usuarioId });
  }
  await encerrarSessao();
  redirect("/login");
}
