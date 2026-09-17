"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, XCircle } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Aviso } from "@/components/ui/aviso";
import { formatarReais } from "@/lib/dinheiro";

type EstadoMp = "OPEN" | "ON_TERMINAL" | "PROCESSING" | "FINISHED" | "CANCELED" | "ERROR" | "ABANDONED";

type Fase =
  | { tipo: "ocioso" }
  | { tipo: "criando" }
  | { tipo: "aguardando"; intentId: string; estadoMp: EstadoMp; avisoRede: string | null }
  | { tipo: "cancelando"; intentId: string }
  | { tipo: "aprovado"; intentId: string; paymentId: string | null }
  | { tipo: "falhou"; intentId: string | null; mensagem: string };

const ROTULO_ESTADO: Record<EstadoMp, string> = {
  OPEN: "Enviando pra maquininha...",
  ON_TERMINAL: "Na maquininha. Peça pro cliente passar o cartão.",
  PROCESSING: "Processando o pagamento...",
  FINISHED: "Pagamento aprovado.",
  CANCELED: "Cobrança cancelada na maquininha.",
  ERROR: "A maquininha devolveu erro.",
  ABANDONED: "Ninguém passou o cartão e a cobrança expirou.",
};

const INTERVALO_POLLING_MS = 2000;

type RespostaApi<T> = { ok: true; dados: T } | { ok: false; erro: string };

async function chamarApi<T>(url: string, init?: RequestInit): Promise<RespostaApi<T>> {
  try {
    const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const corpo = (await r.json().catch(() => null)) as RespostaApi<T> | null;
    if (!corpo) return { ok: false, erro: `Resposta inesperada do servidor (${r.status}).` };
    return corpo;
  } catch {
    return { ok: false, erro: "Sem conexão com o servidor do caixa." };
  }
}

/**
 * Cobra um pagamento em cartão na maquininha do Mercado Pago Point.
 * Cria a intenção, consulta a cada 2 segundos até um estado final e avisa
 * o pai quando aprovar. O pai decide o que fazer se falhar (tentar de novo
 * ou registrar manualmente).
 */
export function CobrancaMaquininha({
  valorCentavos,
  tipo,
  parcelas,
  descricao,
  referencia,
  aoAprovar,
  aoMudarOcupado,
}: {
  valorCentavos: number;
  tipo: "credit_card" | "debit_card";
  parcelas: number;
  descricao: string;
  referencia: string;
  aoAprovar: (dados: { intentId: string; paymentId: string | null }) => void;
  aoMudarOcupado: (ocupado: boolean) => void;
}) {
  const [fase, setFase] = useState<Fase>({ tipo: "ocioso" });
  const faseRef = useRef(fase);
  faseRef.current = fase;

  useEffect(() => {
    aoMudarOcupado(fase.tipo === "criando" || fase.tipo === "aguardando" || fase.tipo === "cancelando");
  }, [fase.tipo, aoMudarOcupado]);

  // Valor mudou depois de aprovado? A aprovação não vale mais pra esse valor.
  const valorAprovado = useRef<number | null>(null);
  useEffect(() => {
    if (fase.tipo === "aprovado" && valorAprovado.current !== null && valorAprovado.current !== valorCentavos) {
      setFase({ tipo: "ocioso" });
    }
  }, [valorCentavos, fase.tipo]);

  const cobrar = useCallback(async () => {
    setFase({ tipo: "criando" });
    const r = await chamarApi<{ id: string; estado: EstadoMp }>("/api/mp/intencao", {
      method: "POST",
      body: JSON.stringify({ valorCentavos, tipo, parcelas, descricao, referencia }),
    });
    if (!r.ok) {
      setFase({ tipo: "falhou", intentId: null, mensagem: r.erro });
      return;
    }
    setFase({ tipo: "aguardando", intentId: r.dados.id, estadoMp: r.dados.estado ?? "OPEN", avisoRede: null });
  }, [valorCentavos, tipo, parcelas, descricao, referencia]);

  // polling
  const intentAguardando = fase.tipo === "aguardando" ? fase.intentId : null;
  useEffect(() => {
    if (intentAguardando === null) return;
    const intentId = intentAguardando;
    let ativo = true;
    const consultar = async () => {
      const r = await chamarApi<{ id: string; estado: EstadoMp; pagamentoId: string | null }>(
        `/api/mp/intencao/${encodeURIComponent(intentId)}`,
      );
      if (!ativo || faseRef.current.tipo !== "aguardando") return;
      if (!r.ok) {
        setFase((f) => (f.tipo === "aguardando" ? { ...f, avisoRede: r.erro } : f));
        return;
      }
      const estado = r.dados.estado;
      if (estado === "FINISHED") {
        valorAprovado.current = valorCentavos;
        setFase({ tipo: "aprovado", intentId, paymentId: r.dados.pagamentoId });
        aoAprovar({ intentId, paymentId: r.dados.pagamentoId });
      } else if (estado === "CANCELED" || estado === "ERROR" || estado === "ABANDONED") {
        setFase({ tipo: "falhou", intentId, mensagem: ROTULO_ESTADO[estado] });
      } else {
        setFase((f) => (f.tipo === "aguardando" ? { ...f, estadoMp: estado, avisoRede: null } : f));
      }
    };
    const timer = window.setInterval(consultar, INTERVALO_POLLING_MS);
    return () => {
      ativo = false;
      window.clearInterval(timer);
    };
  }, [intentAguardando, aoAprovar, valorCentavos]);

  async function cancelar() {
    if (fase.tipo !== "aguardando") return;
    const intentId = fase.intentId;
    setFase({ tipo: "cancelando", intentId });
    const r = await chamarApi<{ id: string }>(`/api/mp/intencao/${encodeURIComponent(intentId)}`, { method: "DELETE" });
    setFase(
      r.ok
        ? { tipo: "falhou", intentId, mensagem: "Cobrança cancelada. Nada foi cobrado do cliente." }
        : { tipo: "falhou", intentId, mensagem: `Não deu pra cancelar pela API: ${r.erro} Cancele direto na maquininha.` },
    );
  }

  const rotuloTipo = tipo === "credit_card" ? `crédito${parcelas > 1 ? ` em ${parcelas}x` : ""}` : "débito";

  if (fase.tipo === "aprovado") {
    return (
      <Aviso tom="sucesso" titulo="Pagamento aprovado na maquininha">
        {formatarReais(valorCentavos)} no {rotuloTipo}. Clique em adicionar pra registrar.
      </Aviso>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-padrao border border-borda bg-fundo p-3">
      {fase.tipo === "ocioso" || fase.tipo === "falhou" ? (
        <>
          {fase.tipo === "falhou" ? (
            <Aviso tom="alerta" titulo="A cobrança não foi concluída">
              {fase.mensagem} Você pode tentar de novo ou, se o cliente já pagou na maquininha, adicionar o pagamento
              manualmente.
            </Aviso>
          ) : null}
          <Botao type="button" tamanho="lg" onClick={cobrar} disabled={valorCentavos <= 0} className="w-full">
            <CreditCard className="size-5" aria-hidden />
            {fase.tipo === "falhou" ? "Tentar de novo na maquininha" : "Cobrar na maquininha"}
            <span className="ml-1 tabular opacity-90">{formatarReais(valorCentavos)}</span>
          </Botao>
        </>
      ) : null}

      {fase.tipo === "criando" ? (
        <p className="flex items-center gap-2 text-sm text-texto-suave">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Enviando a cobrança pra maquininha...
        </p>
      ) : null}

      {fase.tipo === "aguardando" || fase.tipo === "cancelando" ? (
        <>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-info-suave text-info">
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-texto">
                {fase.tipo === "cancelando" ? "Cancelando a cobrança..." : ROTULO_ESTADO[fase.estadoMp]}
              </p>
              <p className="text-xs text-texto-fraco">
                {formatarReais(valorCentavos)} no {rotuloTipo}
                {fase.tipo === "aguardando" && fase.avisoRede ? ` · ${fase.avisoRede}` : ""}
              </p>
            </div>
          </div>
          <Botao
            type="button"
            variante="contorno"
            tamanho="md"
            onClick={cancelar}
            disabled={fase.tipo === "cancelando"}
            className="w-full"
          >
            <XCircle className="size-4" aria-hidden />
            Cancelar cobrança
          </Botao>
        </>
      ) : null}

      {fase.tipo === "ocioso" ? (
        <p className="flex items-start gap-1.5 text-xs text-texto-fraco">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          O valor aparece na maquininha e a venda registra sozinha quando aprovar.
        </p>
      ) : null}
    </div>
  );
}
