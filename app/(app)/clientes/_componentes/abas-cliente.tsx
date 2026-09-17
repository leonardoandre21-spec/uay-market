"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AbaCliente = {
  id: string;
  rotulo: string;
  icone?: ReactNode;
  contador?: number | string;
  conteudo: ReactNode;
};

/**
 * Abas simples: o servidor renderiza todas as seções, o cliente só alterna
 * qual aparece. A aba escolhida fica no hash da URL (#extrato) pra poder
 * compartilhar e voltar no mesmo lugar depois do refresh.
 */
export function AbasCliente({ abas, abaInicial }: { abas: AbaCliente[]; abaInicial?: string }) {
  const padrao = abaInicial && abas.some((a) => a.id === abaInicial) ? abaInicial : abas[0]?.id;
  const [ativa, setAtiva] = useState(padrao);

  useEffect(() => {
    const doHash = window.location.hash.replace("#", "");
    if (doHash && abas.some((a) => a.id === doHash)) setAtiva(doHash);
  }, [abas]);

  function escolher(id: string) {
    setAtiva(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <div role="tablist" aria-label="Seções do cliente" className="inline-flex min-w-full gap-1 border-b border-borda">
          {abas.map((aba) => {
            const selecionada = aba.id === ativa;
            return (
              <button
                key={aba.id}
                type="button"
                role="tab"
                id={`aba-${aba.id}`}
                aria-selected={selecionada}
                aria-controls={`painel-${aba.id}`}
                onClick={() => escolher(aba.id)}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors",
                  selecionada
                    ? "border-primaria font-medium text-primaria"
                    : "border-transparent text-texto-suave hover:border-borda hover:text-texto",
                )}
              >
                {aba.icone}
                {aba.rotulo}
                {aba.contador !== undefined ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular",
                      selecionada ? "bg-primaria-suave text-primaria" : "bg-superficie-2 text-texto-fraco",
                    )}
                  >
                    {aba.contador}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {abas.map((aba) => (
        <div
          key={aba.id}
          role="tabpanel"
          id={`painel-${aba.id}`}
          aria-labelledby={`aba-${aba.id}`}
          hidden={aba.id !== ativa}
          className="flex flex-col gap-4"
        >
          {aba.conteudo}
        </div>
      ))}
    </div>
  );
}
