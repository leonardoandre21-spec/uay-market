import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Periodo } from "@/lib/servicos/relatorios-calculos";
import type { TipoExportacao } from "@/lib/servicos/relatorios";

/** Monta a URL do CSV de um relatório pro período (e filtros extras). */
export function urlExportacao(tipo: TipoExportacao, periodo: Periodo, extras: Record<string, string | number | null | undefined> = {}): string {
  const q = new URLSearchParams({ tipo, de: periodo.de, ate: periodo.ate });
  for (const [k, v] of Object.entries(extras)) {
    if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  }
  return `/relatorios/exportar?${q.toString()}`;
}

/**
 * Link estilizado como botão que baixa o CSV. É um <a> comum, então funciona
 * em Server Component e não precisa de JavaScript.
 */
export function LinkExportar({
  tipo,
  periodo,
  extras,
  rotulo = "Exportar CSV",
  tamanho = "md",
  className,
}: {
  tipo: TipoExportacao;
  periodo: Periodo;
  extras?: Record<string, string | number | null | undefined>;
  rotulo?: string;
  tamanho?: "sm" | "md";
  className?: string;
}) {
  return (
    <a
      href={urlExportacao(tipo, periodo, extras)}
      download
      className={cn(
        "nao-imprimir inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-padrao border border-borda bg-superficie font-medium text-texto transition-colors hover:bg-superficie-2",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria",
        tamanho === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        className,
      )}
    >
      <Download className="size-4" aria-hidden />
      {rotulo}
    </a>
  );
}
