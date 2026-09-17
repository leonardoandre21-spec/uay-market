"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, ScanBarcode } from "lucide-react";
import { Entrada } from "@/components/ui/campo";
import { useToast } from "@/components/ui/toast";
import { formatarQuantidadeComUnidade, formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import { buscarProdutoPorCodigoAction, buscarProdutosPorNomeAction } from "../actions";
import type { ProdutoResumo } from "./tipos";

/**
 * Campo único pra achar produto: aceita o leitor de código de barras (que
 * digita o código e manda Enter) e busca por nome com sugestões enquanto digita.
 */
export function BuscaProduto({
  aoSelecionar,
  autoFocus,
  placeholder = "Bipe o código de barras ou digite o nome do produto",
  tamanho = "md",
  desabilitado,
  id,
  className,
}: {
  aoSelecionar: (produto: ProdutoResumo) => void;
  autoFocus?: boolean;
  placeholder?: string;
  tamanho?: "md" | "lg";
  desabilitado?: boolean;
  id?: string;
  className?: string;
}) {
  const toast = useToast();
  const idGerado = useId();
  const idLista = `${id ?? idGerado}-sugestoes`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [termo, setTermo] = useState("");
  const [sugestoes, setSugestoes] = useState<ProdutoResumo[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const ultimaBusca = useRef(0);

  const pareceCodigo = (t: string) => /^\d{6,}$/.test(t.trim());

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2 || pareceCodigo(t)) {
      setSugestoes([]);
      setAberto(false);
      return;
    }
    const marca = ++ultimaBusca.current;
    const timer = window.setTimeout(async () => {
      setCarregando(true);
      const r = await buscarProdutosPorNomeAction(t);
      if (marca !== ultimaBusca.current) return;
      setCarregando(false);
      if (r.ok) {
        setSugestoes(r.dados);
        setAberto(r.dados.length > 0);
        setIndiceAtivo(0);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [termo]);

  function selecionar(produto: ProdutoResumo) {
    aoSelecionar(produto);
    setTermo("");
    setSugestoes([]);
    setAberto(false);
    inputRef.current?.focus();
  }

  async function confirmar() {
    const t = termo.trim();
    if (!t) return;
    if (aberto && sugestoes[indiceAtivo]) {
      selecionar(sugestoes[indiceAtivo]);
      return;
    }
    setCarregando(true);
    const porCodigo = await buscarProdutoPorCodigoAction(t);
    if (porCodigo.ok && porCodigo.dados) {
      setCarregando(false);
      selecionar(porCodigo.dados);
      return;
    }
    const porNome = await buscarProdutosPorNomeAction(t);
    setCarregando(false);
    if (porNome.ok && porNome.dados.length === 1) {
      selecionar(porNome.dados[0]);
      return;
    }
    if (porNome.ok && porNome.dados.length > 1) {
      setSugestoes(porNome.dados);
      setAberto(true);
      setIndiceAtivo(0);
      return;
    }
    toast.erro(
      pareceCodigo(t)
        ? `Nenhum produto cadastrado com o código ${t}.`
        : `Nenhum produto encontrado com "${t}".`,
    );
    inputRef.current?.select();
  }

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
        <Entrada
          ref={inputRef}
          id={id}
          tamanho={tamanho}
          value={termo}
          disabled={desabilitado}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={placeholder}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={idLista}
          aria-autocomplete="list"
          className="pl-9 pr-9"
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => sugestoes.length > 0 && setAberto(true)}
          onBlur={() => window.setTimeout(() => setAberto(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void confirmar();
            } else if (e.key === "ArrowDown" && sugestoes.length) {
              e.preventDefault();
              setAberto(true);
              setIndiceAtivo((i) => (i + 1) % sugestoes.length);
            } else if (e.key === "ArrowUp" && sugestoes.length) {
              e.preventDefault();
              setIndiceAtivo((i) => (i - 1 + sugestoes.length) % sugestoes.length);
            } else if (e.key === "Escape") {
              setAberto(false);
            }
          }}
        />
        {carregando ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-texto-fraco" aria-hidden />
        ) : null}
      </div>

      {aberto && sugestoes.length > 0 ? (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-padrao border border-borda bg-superficie py-1 shadow-lg"
        >
          {sugestoes.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === indiceAtivo}
              onMouseDown={(e) => {
                e.preventDefault();
                selecionar(p);
              }}
              onMouseEnter={() => setIndiceAtivo(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm",
                i === indiceAtivo ? "bg-primaria-suave text-primaria" : "text-texto hover:bg-superficie-2",
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{p.nome}</p>
                <p className="truncate text-xs text-texto-fraco">
                  {[p.codigoBarras ?? p.codigoInterno, p.categoriaNome].filter(Boolean).join(" · ") || "Sem código"}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-texto-suave tabular">
                <p>Estoque: {formatarQuantidadeComUnidade(p.estoque, p.unidade)}</p>
                <p>Custo: {formatarReais(p.precoCusto)}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
