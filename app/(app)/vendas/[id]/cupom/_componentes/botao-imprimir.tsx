"use client";

import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";

/** Botão de imprimir (some na impressão). Com auto=1 dispara window.print() ao carregar. */
export function BotaoImprimir({ automatico }: { automatico: boolean }) {
  useEffect(() => {
    if (!automatico) return;
    const t = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(t);
  }, [automatico]);

  return (
    <div className="nao-imprimir mb-4 flex flex-wrap justify-center gap-2">
      <Botao tamanho="lg" onClick={() => window.print()}>
        <Printer className="size-5" aria-hidden />
        Imprimir cupom
      </Botao>
      <Botao tamanho="lg" variante="contorno" onClick={() => window.close()}>
        <X className="size-5" aria-hidden />
        Fechar
      </Botao>
    </div>
  );
}
