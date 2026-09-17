"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Entrada } from "@/components/ui/campo";
import { cn } from "@/lib/utils";
import type { ChaveAtalho } from "@/lib/servicos/relatorios-calculos";

export type AtalhoFiltro = { chave: ChaveAtalho; rotulo: string; de: string; ate: string };

/**
 * Filtro de período comum a todos os relatórios: atalhos (links) e um
 * formulário GET com data inicial e final. `extras` são parâmetros da página
 * que precisam sobreviver à troca de período (ex.: categoria).
 */
export function FiltroPeriodo({
  de,
  ate,
  atalhoAtivo,
  atalhos,
  extras = {},
}: {
  de: string;
  ate: string;
  atalhoAtivo: ChaveAtalho | null;
  atalhos: AtalhoFiltro[];
  extras?: Record<string, string>;
}) {
  const pathname = usePathname();
  const [deLocal, setDeLocal] = useState(de);
  const [ateLocal, setAteLocal] = useState(ate);

  const extrasQuery = Object.entries(extras).filter(([, v]) => v !== "");

  const linkAtalho = (a: AtalhoFiltro) => {
    const q = new URLSearchParams({ de: a.de, ate: a.ate });
    for (const [k, v] of extrasQuery) q.set(k, v);
    return `${pathname}?${q.toString()}`;
  };

  return (
    <section
      aria-label="Período"
      className="nao-imprimir mb-5 flex flex-col gap-3 rounded-padrao border border-borda bg-superficie px-4 py-3 shadow-padrao lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <CalendarRange className="mr-1 size-4 text-texto-fraco" aria-hidden />
        {atalhos.map((a) => {
          const ativo = a.chave === atalhoAtivo;
          return (
            <Link
              key={a.chave}
              href={linkAtalho(a)}
              aria-current={ativo ? "true" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                ativo
                  ? "bg-primaria font-medium text-primaria-texto"
                  : "bg-superficie-2 text-texto-suave hover:bg-borda hover:text-texto",
              )}
            >
              {a.rotulo}
            </Link>
          );
        })}
      </div>

      <form method="get" action={pathname} className="flex flex-wrap items-end gap-2">
        {extrasQuery.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
          De
          <Entrada
            type="date"
            name="de"
            required
            value={deLocal}
            max={ateLocal || undefined}
            onChange={(e) => setDeLocal(e.target.value)}
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
          Até
          <Entrada
            type="date"
            name="ate"
            required
            value={ateLocal}
            min={deLocal || undefined}
            onChange={(e) => setAteLocal(e.target.value)}
            className="w-40"
          />
        </label>
        <Botao type="submit" variante="secundaria">
          Aplicar
        </Botao>
      </form>
    </section>
  );
}
