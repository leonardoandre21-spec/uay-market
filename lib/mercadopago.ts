import "server-only";
import { obterConfiguracao } from "@/lib/consultas";

// Cliente da API Point do Mercado Pago (maquininha Point Smart / Point Pro 2).
// Fluxo: o PDV cria uma "intenção de pagamento" pra maquininha, ela mostra o
// valor na tela, o cliente passa o cartão, e o PDV consulta o estado até
// FINISHED. Só fetch, sem SDK.
//
// IMPORTANTE: `amount` é em CENTAVOS inteiros (R$ 12,50 = 1250), igual ao
// resto do sistema. Nunca mande float.

const BASE_URL = "https://api.mercadopago.com";

export type EstadoIntencao = "OPEN" | "ON_TERMINAL" | "PROCESSING" | "FINISHED" | "CANCELED" | "ERROR" | "ABANDONED";

export type DispositivoPoint = {
  id: string;
  operating_mode: "PDV" | "STANDALONE" | string;
  pos_id?: number;
  store_id?: string;
  external_pos_id?: string;
};

export type IntencaoPagamento = {
  id: string;
  device_id?: string;
  /** centavos */
  amount?: number;
  description?: string;
  state?: EstadoIntencao;
  payment?: { id?: number | string; type?: string; installments?: number } | null;
  additional_info?: { external_reference?: string; print_on_terminal?: boolean };
};

export type CredenciaisMp = { token: string; deviceId: string | null };

/** Erro legível pro operador, com o status HTTP pra depuração. */
export class ErroMercadoPago extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.name = "ErroMercadoPago";
    this.status = status;
  }
}

/** Lê token e maquininha da Configuração. Lança se o token não estiver configurado. */
export async function obterCredenciaisMp(): Promise<CredenciaisMp> {
  const config = await obterConfiguracao();
  const token = config.mpAccessToken?.trim();
  if (!token) {
    throw new ErroMercadoPago("Mercado Pago não configurado. Informe o token de acesso em Configurações.", 0);
  }
  return { token, deviceId: config.mpDeviceId?.trim() || null };
}

/** Só diz se dá pra usar a maquininha (token + dispositivo). Não lança. */
export async function mercadoPagoConfigurado(config: {
  mpAccessToken: string | null;
  mpDeviceId: string | null;
}): Promise<boolean> {
  return Boolean(config.mpAccessToken?.trim() && config.mpDeviceId?.trim());
}

function mensagemPorStatus(status: number, corpo: unknown): string {
  const detalhe = extrairMensagem(corpo);
  switch (status) {
    case 400:
      return `O Mercado Pago recusou a requisição${detalhe ? `: ${detalhe}` : "."}`;
    case 401:
    case 403:
      return "Token do Mercado Pago inválido ou sem permissão. Confira o token em Configurações.";
    case 404:
      return "Maquininha ou cobrança não encontrada no Mercado Pago. Confira o código do dispositivo.";
    case 409:
      return "A maquininha já tem uma cobrança em andamento. Cancele a cobrança anterior antes de criar outra.";
    case 429:
      return "Muitas consultas ao Mercado Pago em pouco tempo. Aguarde alguns segundos.";
    default:
      if (status >= 500) return "O Mercado Pago está com problemas no momento. Tente de novo em instantes.";
      return `Erro ao falar com o Mercado Pago (código ${status})${detalhe ? `: ${detalhe}` : "."}`;
  }
}

function extrairMensagem(corpo: unknown): string | null {
  if (!corpo || typeof corpo !== "object") return null;
  const obj = corpo as Record<string, unknown>;
  if (typeof obj.message === "string") return obj.message;
  if (Array.isArray(obj.errors) && obj.errors.length) {
    const primeiro = obj.errors[0] as Record<string, unknown>;
    if (typeof primeiro?.message === "string") return primeiro.message;
  }
  if (typeof obj.error === "string") return obj.error;
  return null;
}

async function requisitar<T>(caminho: string, token: string, init: RequestInit = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE_URL}${caminho}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ErroMercadoPago("Sem conexão com o Mercado Pago. Verifique a internet do caixa.", 0);
  }
  const texto = await resposta.text();
  let corpo: unknown = null;
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = { message: texto.slice(0, 200) };
    }
  }
  if (!resposta.ok) throw new ErroMercadoPago(mensagemPorStatus(resposta.status, corpo), resposta.status);
  return corpo as T;
}

/** Lista as maquininhas vinculadas à conta. */
export async function listarDispositivos(token: string): Promise<DispositivoPoint[]> {
  const r = await requisitar<{ devices?: DispositivoPoint[] }>("/point/integration-api/devices", token, {
    method: "GET",
  });
  return r.devices ?? [];
}

/** Coloca a maquininha em modo PDV (aceita cobranças vindas do sistema). */
export async function definirModoPdv(deviceId: string, token: string): Promise<DispositivoPoint> {
  return requisitar<DispositivoPoint>(`/point/integration-api/devices/${encodeURIComponent(deviceId)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ operating_mode: "PDV" }),
  });
}

export type NovaIntencao = {
  deviceId: string;
  /** centavos inteiros */
  valorCentavos: number;
  descricao: string;
  tipo: "credit_card" | "debit_card";
  parcelas?: number;
  /** referência externa (ex.: "pdv-sessao-12-1726500000") pra achar a cobrança depois */
  referencia: string;
};

/**
 * Cria a intenção de pagamento e manda pra maquininha.
 * `amount` vai em centavos; `installments_cost: "seller"` = parcelado sem juros pro cliente.
 */
export async function criarIntencaoPagamento(params: NovaIntencao, token: string): Promise<IntencaoPagamento> {
  if (!Number.isInteger(params.valorCentavos) || params.valorCentavos <= 0) {
    throw new ErroMercadoPago("Valor da cobrança inválido.", 0);
  }
  const payment: Record<string, unknown> = { type: params.tipo };
  if (params.tipo === "credit_card") {
    payment.installments = Math.max(1, params.parcelas ?? 1);
    payment.installments_cost = "seller";
  }
  return requisitar<IntencaoPagamento>(
    `/point/integration-api/devices/${encodeURIComponent(params.deviceId)}/payment-intents`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        amount: params.valorCentavos,
        description: params.descricao.slice(0, 100),
        payment,
        additional_info: {
          external_reference: params.referencia.slice(0, 64),
          print_on_terminal: true,
        },
      }),
    },
  );
}

/** Consulta o estado atual da intenção (usado no polling do PDV). */
export async function consultarIntencao(id: string, token: string): Promise<IntencaoPagamento> {
  return requisitar<IntencaoPagamento>(`/point/integration-api/payment-intents/${encodeURIComponent(id)}`, token, {
    method: "GET",
  });
}

/** Cancela uma intenção ainda aberta na maquininha. */
export async function cancelarIntencao(deviceId: string, id: string, token: string): Promise<{ id: string }> {
  return requisitar<{ id: string }>(
    `/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents/${encodeURIComponent(id)}`,
    token,
    { method: "DELETE" },
  );
}

/** Estados finais: a cobrança não muda mais. */
export function intencaoEncerrada(estado: EstadoIntencao | undefined): boolean {
  return estado === "FINISHED" || estado === "CANCELED" || estado === "ERROR" || estado === "ABANDONED";
}
