"use client";

import { Download, Printer } from "lucide-react";
import { Botao } from "@/components/ui/botao";

/** Imprimir (A4) e exportar CSV do demonstrativo do mês. */
export function BotoesFechamento({ mes }: { mes: string }) {
  return (
    <div className="flex items-center gap-2">
      <a
        href={`/gestao/fechamento/exportar?mes=${mes}`}
        download
        className="inline-flex h-10 items-center gap-2 rounded-padrao border border-borda bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2"
      >
        <Download className="size-4" aria-hidden /> Exportar CSV
      </a>
      <Botao type="button" variante="primaria" onClick={() => window.print()}>
        <Printer className="size-4" aria-hidden /> Imprimir
      </Botao>
    </div>
  );
}
