"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileDown, Search, X } from "lucide-react";
import { Entrada } from "@/components/ui/campo";
import { cn } from "@/lib/utils";
import type { FiltroClientes } from "@/lib/servicos/clientes";

type OpcaoFiltro = { valor: FiltroClientes; rotulo: string; quantidade: number };

/**
 * Busca (nome, CPF ou telefone) com espera de 300ms e filtros como links.
 * Tudo vai pra URL (?busca=&filtro=), então a página do servidor refaz a lista.
 */
export function FiltrosClientes({
  busca,
  filtro,
  opcoes,
  totalExibido,
}: {
  busca: string;
  filtro: FiltroClientes;
  opcoes: OpcaoFiltro[];
  totalExibido: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [texto, setTexto] = useState(busca);
  const temporizador = useRef<number | null>(null);
  const primeiraRenderizacao = useRef(true);

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    if (texto === busca) return;
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (texto.trim()) params.set("busca", texto.trim());
      if (filtro !== "todos") params.set("filtro", filtro);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 300);
    return () => {
      if (temporizador.current) window.clearTimeout(temporizador.current);
    };
  }, [texto, busca, filtro, pathname, router]);

  function linkFiltro(valor: FiltroClientes): string {
    const params = new URLSearchParams();
    if (busca.trim()) params.set("busca", busca.trim());
    if (valor !== "todos") params.set("filtro", valor);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const paramsExportar = new URLSearchParams();
  if (busca.trim()) paramsExportar.set("busca", busca.trim());
  if (filtro !== "todos") paramsExportar.set("filtro", filtro);
  const linkExportar = `/clientes/exportar${paramsExportar.toString() ? `?${paramsExportar}` : ""}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
          <Entrada
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nome, CPF ou telefone"
            aria-label="Buscar cliente"
            className="pl-9 pr-9"
            autoComplete="off"
          />
          {texto ? (
            <button
              type="button"
              onClick={() => setTexto("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-texto-fraco hover:bg-superficie-2 hover:text-texto"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-texto-suave">
            {totalExibido === 0
              ? "Nenhum cliente encontrado"
              : totalExibido === 1
                ? "1 cliente"
                : `${totalExibido} clientes`}
          </p>
          <a
            href={linkExportar}
            className="inline-flex h-9 items-center gap-1.5 rounded-padrao border border-borda bg-superficie px-3 text-sm text-texto hover:bg-superficie-2"
            title="Baixa a lista atual em planilha (CSV)"
          >
            <FileDown className="size-4" aria-hidden />
            Exportar CSV
          </a>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtros">
        {opcoes.map((o) => {
          const ativo = o.valor === filtro;
          return (
            <Link
              key={o.valor}
              href={linkFiltro(o.valor)}
              scroll={false}
              role="tab"
              aria-selected={ativo}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                ativo
                  ? "border-primaria bg-primaria-suave font-medium text-primaria"
                  : "border-borda bg-superficie text-texto-suave hover:bg-superficie-2 hover:text-texto",
              )}
            >
              {o.rotulo}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular",
                  ativo ? "bg-primaria text-primaria-texto" : "bg-superficie-2 text-texto-fraco",
                )}
              >
                {o.quantidade}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
