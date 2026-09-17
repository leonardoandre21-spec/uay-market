"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Entrada } from "@/components/ui/campo";
import { Selo } from "@/components/ui/selo";
import { formatarQuantidadeComUnidade, formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import { buscarProdutosNome } from "../actions";
import type { ProdutoPdv } from "./tipos";

/**
 * Busca por nome com autocompletar. Setas movem, Enter adiciona, Esc volta
 * pro campo de código. Mínimo 2 letras.
 */
export function BuscaProduto({
  aoEscolher,
  aoSair,
  desabilitado,
}: {
  aoEscolher: (produto: ProdutoPdv) => void;
  aoSair: () => void;
  desabilitado?: boolean;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ProdutoPdv[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [indice, setIndice] = useState(0);
  const ultimaBusca = useRef(0);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) {
      // Invalida a busca em voo: a resposta do termo anterior não pode reabrir a lista.
      ++ultimaBusca.current;
      setCarregando(false);
      setResultados([]);
      setAberto(false);
      return;
    }
    const id = ++ultimaBusca.current;
    const timer = window.setTimeout(async () => {
      setCarregando(true);
      const r = await buscarProdutosNome(t);
      if (id !== ultimaBusca.current) return;
      setCarregando(false);
      if (r.ok) {
        setResultados(r.dados);
        setIndice(0);
        setAberto(true);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [termo]);

  function escolher(p: ProdutoPdv) {
    aoEscolher(p);
    setTermo("");
    setResultados([]);
    setAberto(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
        <Entrada
          value={termo}
          disabled={desabilitado}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => resultados.length && setAberto(true)}
          onBlur={() => window.setTimeout(() => setAberto(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setTermo("");
              setAberto(false);
              aoSair();
              return;
            }
            if (!aberto || resultados.length === 0) {
              if (e.key === "Enter") e.preventDefault();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndice((i) => (i + 1) % resultados.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndice((i) => (i - 1 + resultados.length) % resultados.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              escolher(resultados[indice]);
            }
          }}
          placeholder="Buscar produto pelo nome (mín. 2 letras)"
          aria-label="Buscar produto pelo nome"
          autoComplete="off"
          className="pl-9"
        />
        {carregando ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-texto-fraco" aria-hidden />
        ) : null}
      </div>
      {aberto ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-padrao border border-borda bg-superficie shadow-lg"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-3 text-sm text-texto-fraco">Nenhum produto com esse nome.</li>
          ) : (
            resultados.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === indice}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(p)}
                  onMouseEnter={() => setIndice(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                    i === indice ? "bg-primaria-suave" : "hover:bg-superficie-2",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-texto">{p.nome}</span>
                    <span className="block text-xs text-texto-fraco">
                      {p.codigoBarras ?? p.codigoInterno ?? "sem código"} · estoque{" "}
                      {formatarQuantidadeComUnidade(p.estoque, p.unidade)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular text-texto">
                      {formatarReais(p.precoUnitario)}
                      <span className="text-xs font-normal text-texto-fraco">{p.unidade === "KG" ? "/kg" : ""}</span>
                    </span>
                    {p.emPromocao ? <Selo tom="alerta">promoção</Selo> : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
