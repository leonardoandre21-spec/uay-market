"use client";

import { Printer } from "lucide-react";
import { Botao } from "@/components/ui/botao";

/** Abre a impressão do navegador. Tudo com a classe nao-imprimir sai da página impressa. */
export function BotaoImprimir({ tamanho = "md" }: { tamanho?: "sm" | "md" }) {
  return (
    <Botao type="button" variante="contorno" tamanho={tamanho} className="nao-imprimir" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden />
      Imprimir
    </Botao>
  );
}
