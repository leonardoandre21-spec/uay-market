"use client";

import { Printer } from "lucide-react";
import { Botao, type BotaoProps } from "@/components/ui/botao";

/** Abre a caixa de impressão do navegador (cupom 80mm). */
export function BotaoImprimir({ children = "Imprimir", ...props }: Omit<BotaoProps, "onClick">) {
  return (
    <Botao type="button" onClick={() => window.print()} {...props}>
      <Printer className="size-4" aria-hidden />
      {children}
    </Botao>
  );
}
