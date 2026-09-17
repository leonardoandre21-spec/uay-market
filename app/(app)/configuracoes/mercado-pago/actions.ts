"use server";

import { revalidatePath } from "next/cache";
import { exigirAdminAcao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { campo, campoBooleano, campoOpcional, executar, falha, type Resultado } from "@/lib/acao";
import { obterConfiguracao, salvarConfiguracao, sessaoAdmin } from "@/lib/servicos/configuracoes";
import { tipoTokenMercadoPago } from "@/lib/servicos/configuracoes-regras";

// Chamadas à API do Mercado Pago feitas aqui mesmo, com fetch, pra este módulo
// não depender do lib/mercadopago.ts do PDV. O token nunca sai do servidor.

const API = "https://api.mercadopago.com";
const TEMPO_LIMITE_MS = 15000;

export type Maquininha = {
  id: string;
  operatingMode: string;
  posId: number | null;
  storeId: string | null;
  externalPosId: string | null;
};

async function tokenSalvo(): Promise<string> {
  const config = await obterConfiguracao();
  if (!config.mpAccessToken) {
    throw new Error("Salve o access token do Mercado Pago antes de usar esta função.");
  }
  return config.mpAccessToken;
}

function mensagemHttp(status: number, corpo: unknown): string {
  if (status === 401) return "O Mercado Pago recusou o token (inválido ou expirado). Gere um novo token de produção.";
  if (status === 403)
    return "O token não tem permissão pra essa operação. Confira se é o token da conta dona da maquininha.";
  if (status === 404)
    return "O Mercado Pago não encontrou o que foi pedido (maquininha inexistente ou de outra conta).";
  const detalhe =
    corpo &&
    typeof corpo === "object" &&
    "message" in corpo &&
    typeof (corpo as { message: unknown }).message === "string"
      ? (corpo as { message: string }).message
      : "";
  return `O Mercado Pago respondeu com erro ${status}${detalhe ? ` (${detalhe})` : ""}.`;
}

async function chamarMercadoPago<T>(
  token: string,
  caminho: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API}${caminho}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      cache: "no-store",
    });
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    if (nome === "TimeoutError" || nome === "AbortError") {
      throw new Error("O Mercado Pago demorou demais pra responder. Confira a internet e tente de novo.");
    }
    throw new Error("Não foi possível conectar ao Mercado Pago. Confira a internet e tente de novo.");
  }
  let corpo: unknown = null;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }
  if (!resposta.ok) throw new Error(mensagemHttp(resposta.status, corpo));
  return corpo as T;
}

// ---------------------------------------------------------------- salvar credenciais

export async function salvarMercadoPago(form: FormData): Promise<Resultado<{ tokenConfigurado: boolean }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const novoToken = campo(form, "mpAccessToken");
  const removerToken = campoBooleano(form, "removerToken");
  if (novoToken && novoToken.length < 20) {
    return falha("O access token parece incompleto. Copie o token inteiro do painel do Mercado Pago.", {
      mpAccessToken: "Token incompleto.",
    });
  }
  return executar(async () => {
    const antes = await obterConfiguracao();
    const dados = {
      mpDeviceId: campoOpcional(form, "mpDeviceId"),
      mpUserId: campoOpcional(form, "mpUserId"),
      ...(removerToken ? { mpAccessToken: null } : novoToken ? { mpAccessToken: novoToken } : {}),
    };
    const salvo = await salvarConfiguracao(dados);
    await registrarAuditoria({
      usuarioId: auth.dados.usuarioId,
      acao: "configuracao.mercado-pago",
      entidade: "Configuracao",
      entidadeId: 1,
      detalhes: {
        tokenAlterado: removerToken ? "removido" : novoToken ? "substituido" : "mantido",
        tipoToken: tipoTokenMercadoPago(salvo.mpAccessToken),
        antes: { mpDeviceId: antes.mpDeviceId, mpUserId: antes.mpUserId },
        depois: { mpDeviceId: salvo.mpDeviceId, mpUserId: salvo.mpUserId },
      },
    });
    revalidatePath("/configuracoes/mercado-pago");
    return { tokenConfigurado: Boolean(salvo.mpAccessToken) };
  });
}

// ---------------------------------------------------------------- testar conexão

type UsuarioMp = { id?: number | string; nickname?: string; first_name?: string; last_name?: string; email?: string };

/** GET /users/me: confirma que o token funciona e mostra a conta dona dele. */
export async function testarConexaoMercadoPago(): Promise<
  Resultado<{ nome: string; usuarioId: string; email: string | null }>
> {
  return executar(async () => {
    await exigirAdminAcao();
    const token = await tokenSalvo();
    const u = await chamarMercadoPago<UsuarioMp>(token, "/users/me");
    const nomeCompleto = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    return {
      nome: nomeCompleto || u.nickname || "Conta sem nome",
      usuarioId: u.id !== undefined ? String(u.id) : "",
      email: u.email ?? null,
    };
  });
}

// ---------------------------------------------------------------- maquininhas

type RespostaDispositivos = {
  devices?: Array<{
    id: string;
    operating_mode?: string;
    pos_id?: number;
    store_id?: string | number;
    external_pos_id?: string;
  }>;
};

/** GET /point/integration-api/devices: lista as maquininhas Point ligadas à conta. */
export async function buscarMaquininhas(): Promise<Resultado<Maquininha[]>> {
  return executar(async () => {
    await exigirAdminAcao();
    const token = await tokenSalvo();
    const r = await chamarMercadoPago<RespostaDispositivos>(token, "/point/integration-api/devices?limit=50&offset=0");
    return (r.devices ?? []).map((d) => ({
      id: d.id,
      operatingMode: d.operating_mode ?? "DESCONHECIDO",
      posId: typeof d.pos_id === "number" ? d.pos_id : null,
      storeId: d.store_id !== undefined ? String(d.store_id) : null,
      externalPosId: d.external_pos_id ?? null,
    }));
  });
}

/** Grava a maquininha escolhida como a do caixa. */
export async function usarMaquininha(form: FormData): Promise<Resultado<{ deviceId: string }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const deviceId = campo(form, "deviceId");
  if (!deviceId) return falha("Escolha uma maquininha.");
  return executar(async () => {
    const antes = await obterConfiguracao();
    await salvarConfiguracao({ mpDeviceId: deviceId });
    await registrarAuditoria({
      usuarioId: auth.dados.usuarioId,
      acao: "configuracao.mercado-pago",
      entidade: "Configuracao",
      entidadeId: 1,
      detalhes: { tokenAlterado: "mantido", antes: { mpDeviceId: antes.mpDeviceId }, depois: { mpDeviceId: deviceId } },
    });
    revalidatePath("/configuracoes/mercado-pago");
    return { deviceId };
  });
}

/** PATCH /point/integration-api/devices/{id} com operating_mode PDV (a maquininha passa a obedecer o sistema). */
export async function ativarModoPdv(form: FormData): Promise<Resultado<{ deviceId: string; operatingMode: string }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const deviceId = campo(form, "deviceId");
  if (!deviceId) return falha("Escolha uma maquininha.");
  return executar(async () => {
    const token = await tokenSalvo();
    const r = await chamarMercadoPago<{ id?: string; operating_mode?: string }>(
      token,
      `/point/integration-api/devices/${encodeURIComponent(deviceId)}`,
      { method: "PATCH", body: { operating_mode: "PDV" } },
    );
    await registrarAuditoria({
      usuarioId: auth.dados.usuarioId,
      acao: "configuracao.mercado-pago.modo-pdv",
      entidade: "Configuracao",
      entidadeId: 1,
      detalhes: { deviceId, operatingMode: r.operating_mode ?? "PDV" },
    });
    return { deviceId, operatingMode: r.operating_mode ?? "PDV" };
  });
}
