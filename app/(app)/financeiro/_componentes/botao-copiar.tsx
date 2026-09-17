"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Botao, type BotaoProps } from "@/components/ui/botao";
import { useToast } from "@/components/ui/toast";

/** Copia um texto (linha digitável, CNPJ...) pro clipboard e confirma com toast. */
export function BotaoCopiar({
  texto,
  rotulo = "Copiar",
  mensagem = "Copiado.",
  somenteIcone = false,
  ...props
}: Omit<BotaoProps, "onClick" | "children"> & {
  texto: string;
  rotulo?: string;
  mensagem?: string;
  somenteIcone?: boolean;
}) {
  const toast = useToast();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.sucesso(mensagem);
      window.setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.erro("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  const Icone = copiado ? Check : Copy;
  return (
    <Botao
      type="button"
      variante="fantasma"
      tamanho="sm"
      onClick={copiar}
      aria-label={somenteIcone ? rotulo : undefined}
      title={rotulo}
      {...props}
    >
      <Icone className="size-4" aria-hidden />
      {somenteIcone ? null : rotulo}
    </Botao>
  );
}
