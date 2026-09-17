"use client";

import { useFormStatus } from "react-dom";
import { Botao, type BotaoProps } from "@/components/ui/botao";

/** Botão de submit que mostra spinner enquanto a server action roda. */
export function BotaoEnviar(props: BotaoProps) {
  const { pending } = useFormStatus();
  return <Botao type="submit" pendente={pending} {...props} />;
}
