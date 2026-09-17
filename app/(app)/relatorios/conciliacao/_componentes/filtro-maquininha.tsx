"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Selecao } from "@/components/ui/campo";
import { SEM_MAQUININHA_ID } from "@/lib/servicos/relatorios-calculos";

/** Seleção de maquininha que atualiza a URL (?maquininha=) mantendo o período. */
export function FiltroMaquininha({
  maquininhas,
  maquininhaId,
  temSemMaquininha,
}: {
  maquininhas: { id: number; nome: string; ativo: boolean }[];
  maquininhaId: number | null;
  /** há cartões antigos sem maquininha no período: oferece a opção de filtrar só eles */
  temSemMaquininha: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm text-texto-suave">
      <span className="sr-only sm:not-sr-only">Maquininha</span>
      <Selecao
        aria-label="Maquininha"
        value={maquininhaId ?? ""}
        className="w-52"
        onChange={(e) => {
          const q = new URLSearchParams(params.toString());
          if (e.target.value) q.set("maquininha", e.target.value);
          else q.delete("maquininha");
          router.push(`${pathname}?${q.toString()}`);
        }}
      >
        <option value="">Todas as maquininhas</option>
        {maquininhas.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
            {m.ativo ? "" : " (desativada)"}
          </option>
        ))}
        {temSemMaquininha || maquininhaId === SEM_MAQUININHA_ID ? (
          <option value={SEM_MAQUININHA_ID}>Sem maquininha (cartões antigos)</option>
        ) : null}
      </Selecao>
    </label>
  );
}
