"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { classesBotao, type TamanhoBotao, type VarianteBotao } from "@/components/ui/estilos-botao";

export type { TamanhoBotao, VarianteBotao };

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  pendente?: boolean;
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { className, variante = "primaria", tamanho = "md", pendente = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || pendente}
      className={classesBotao(variante, tamanho, className)}
      {...props}
    >
      {pendente ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
