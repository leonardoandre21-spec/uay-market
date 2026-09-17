"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Botao } from "@/components/ui/botao";

/** Botão que chama a impressão do navegador. Com autoImprimir, abre a janela de impressão ao carregar. */
export function BotaoImprimir({ autoImprimir = false }: { autoImprimir?: boolean }) {
  useEffect(() => {
    if (!autoImprimir) return;
    const t = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(t);
  }, [autoImprimir]);

  return (
    <Botao onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden />
      Imprimir
    </Botao>
  );
}
