"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Selecao } from "@/components/ui/campo";

/** Seleção de categoria que atualiza a URL (?categoria=) mantendo o período. */
export function FiltroCategoria({
  categorias,
  categoriaId,
}: {
  categorias: { id: number; nome: string }[];
  categoriaId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm text-texto-suave">
      <span className="sr-only sm:not-sr-only">Categoria</span>
      <Selecao
        aria-label="Categoria"
        value={categoriaId ?? ""}
        className="w-48"
        onChange={(e) => {
          const q = new URLSearchParams(params.toString());
          if (e.target.value) q.set("categoria", e.target.value);
          else q.delete("categoria");
          router.push(`${pathname}?${q.toString()}`);
        }}
      >
        <option value="">Todas as categorias</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>
    </label>
  );
}
