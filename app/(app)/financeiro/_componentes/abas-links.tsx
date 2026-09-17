import Link from "next/link";
import { cn } from "@/lib/utils";

export type AbaLink = { href: string; rotulo: React.ReactNode; ativa: boolean; contagem?: number | string | null; tom?: "perigo" | "alerta" | "neutro" };

/** Abas de navegação por link (visões, sub-páginas). Funciona em Server Component. */
export function AbasLinks({ abas, className }: { abas: AbaLink[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1 rounded-padrao border border-borda bg-superficie p-1", className)}>
      {abas.map((aba) => (
        <Link
          key={aba.href}
          href={aba.href}
          aria-current={aba.ativa ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
            aba.ativa ? "bg-primaria-suave font-medium text-primaria" : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
          )}
        >
          {aba.rotulo}
          {aba.contagem !== undefined && aba.contagem !== null ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular leading-none",
                aba.tom === "perigo" && aba.contagem !== 0
                  ? "bg-perigo-suave text-perigo"
                  : aba.tom === "alerta" && aba.contagem !== 0
                    ? "bg-alerta-suave text-alerta"
                    : "bg-superficie-2 text-texto-suave",
              )}
            >
              {aba.contagem}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
