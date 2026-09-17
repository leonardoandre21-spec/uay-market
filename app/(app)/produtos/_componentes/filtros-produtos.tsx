"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { SITUACOES_FILTRO, montarQueryProdutos, type FiltrosProdutos } from "@/lib/servicos/produtos-calculos";

export function FiltrosProdutos({
  categorias,
  filtros,
}: {
  categorias: { id: number; nome: string }[];
  filtros: Pick<FiltrosProdutos, "busca" | "categoria" | "situacao">;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const temFiltro = filtros.busca !== "" || filtros.categoria !== "" || filtros.situacao !== "ativos";

  function aplicar(form: HTMLFormElement) {
    const dados = new FormData(form);
    const query = montarQueryProdutos({
      busca: String(dados.get("busca") ?? "").trim(),
      categoria: String(dados.get("categoria") ?? ""),
      situacao: SITUACOES_FILTRO.find((s) => s.valor === dados.get("situacao"))?.valor ?? "ativos",
    });
    router.push(query ? `/produtos?${query}` : "/produtos");
  }

  return (
    <form
      key={`${filtros.busca}|${filtros.categoria}|${filtros.situacao}`}
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        aplicar(e.currentTarget);
      }}
      className="flex flex-wrap items-end gap-3"
      role="search"
    >
      <Campo rotulo="Buscar" htmlFor="busca" className="min-w-64 flex-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
          <Entrada
            id="busca"
            name="busca"
            defaultValue={filtros.busca}
            placeholder="Nome, código de barras ou código interno"
            autoComplete="off"
            className="pl-9"
          />
        </div>
      </Campo>
      <Campo rotulo="Categoria" htmlFor="categoria" className="w-48">
        <Selecao
          id="categoria"
          name="categoria"
          defaultValue={filtros.categoria}
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="">Todas</option>
          <option value="sem">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Situação" htmlFor="situacao" className="w-44">
        <Selecao
          id="situacao"
          name="situacao"
          defaultValue={filtros.situacao}
          onChange={() => formRef.current?.requestSubmit()}
        >
          {SITUACOES_FILTRO.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Botao type="submit" variante="secundaria">
        Filtrar
      </Botao>
      {temFiltro ? (
        <Botao type="button" variante="fantasma" onClick={() => router.push("/produtos")}>
          <X className="size-4" aria-hidden />
          Limpar
        </Botao>
      ) : null}
    </form>
  );
}
