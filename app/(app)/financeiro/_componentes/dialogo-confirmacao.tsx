"use client";

import { useEffect, useState } from "react";
import { Botao, type VarianteBotao } from "@/components/ui/botao";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";

/**
 * Confirmação simples ("Tem certeza?") com campo opcional de motivo.
 * aoConfirmar recebe o motivo digitado (ou null).
 */
export function DialogoConfirmacao({
  aberto,
  aoFechar,
  titulo,
  descricao,
  rotuloConfirmar = "Confirmar",
  varianteConfirmar = "perigo",
  pedirMotivo = false,
  rotuloMotivo = "Motivo (opcional)",
  pendente = false,
  aoConfirmar,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: React.ReactNode;
  rotuloConfirmar?: string;
  varianteConfirmar?: VarianteBotao;
  pedirMotivo?: boolean;
  rotuloMotivo?: string;
  pendente?: boolean;
  aoConfirmar: (motivo: string | null) => void;
  children?: React.ReactNode;
}) {
  const [motivo, setMotivo] = useState("");
  useEffect(() => {
    if (!aberto) setMotivo("");
  }, [aberto]);
  if (!aberto) return null;
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      descricao={descricao}
      largura="sm"
      rodape={
        <>
          <Botao type="button" variante="fantasma" onClick={aoFechar} disabled={pendente}>
            Voltar
          </Botao>
          <Botao type="button" variante={varianteConfirmar} pendente={pendente} onClick={() => aoConfirmar(motivo.trim() || null)}>
            {rotuloConfirmar}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-texto-suave">
        {children}
        {pedirMotivo ? (
          <Campo rotulo={rotuloMotivo} htmlFor="motivo-confirmacao">
            <AreaTexto id="motivo-confirmacao" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
          </Campo>
        ) : null}
      </div>
    </Dialogo>
  );
}
