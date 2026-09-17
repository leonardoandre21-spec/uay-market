"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type VarianteBotao = "primaria" | "secundaria" | "perigo" | "fantasma" | "contorno";
export type TamanhoBotao = "sm" | "md" | "lg" | "xl";

const variantes: Record<VarianteBotao, string> = {
  primaria: "bg-primaria text-primaria-texto hover:bg-primaria-forte shadow-sm",
  secundaria: "bg-superficie-2 text-texto hover:bg-borda",
  perigo: "bg-perigo text-white hover:brightness-95 shadow-sm",
  fantasma: "bg-transparent text-texto-suave hover:bg-superficie-2 hover:text-texto",
  contorno: "bg-superficie border border-borda text-texto hover:bg-superficie-2",
};

const tamanhos: Record<TamanhoBotao, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
  xl: "h-14 px-6 text-lg gap-2.5",
};

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
      className={cn(
        "inline-flex items-center justify-center rounded-padrao font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria",
        "disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap",
        variantes[variante],
        tamanhos[tamanho],
        className,
      )}
      {...props}
    >
      {pendente ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
