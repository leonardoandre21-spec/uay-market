"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Boxes, CreditCard, LayoutDashboard, PieChart, Scale, TrendingUp, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const ABAS_RELATORIOS = [
  { href: "/relatorios", rotulo: "Resumo", Icone: LayoutDashboard },
  { href: "/relatorios/mais-vendidos", rotulo: "Mais vendidos", Icone: Trophy },
  { href: "/relatorios/lucro", rotulo: "Lucro", Icone: TrendingUp },
  { href: "/relatorios/pagamentos", rotulo: "Pagamentos", Icone: CreditCard },
  { href: "/relatorios/conciliacao", rotulo: "Conciliação", Icone: Scale },
  { href: "/relatorios/abc", rotulo: "Curva ABC", Icone: PieChart },
  { href: "/relatorios/estoque", rotulo: "Estoque", Icone: Boxes },
  { href: "/relatorios/clientes", rotulo: "Clientes", Icone: Users },
] as const;

/** Navegação por abas entre os relatórios. Mantém o período (de/ate) ao trocar de aba. */
export function AbasRelatorios() {
  const pathname = usePathname();
  const params = useSearchParams();

  const consulta = new URLSearchParams();
  const de = params.get("de");
  const ate = params.get("ate");
  if (de) consulta.set("de", de);
  if (ate) consulta.set("ate", ate);
  const sufixo = consulta.size ? `?${consulta.toString()}` : "";

  return (
    <nav aria-label="Relatórios" className="nao-imprimir mb-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-borda">
        {ABAS_RELATORIOS.map(({ href, rotulo, Icone }) => {
          const ativo = pathname === href;
          return (
            <li key={href}>
              <Link
                href={`${href}${sufixo}`}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  ativo
                    ? "border-primaria text-primaria"
                    : "border-transparent text-texto-suave hover:border-borda hover:text-texto",
                )}
              >
                <Icone className="size-4 shrink-0" aria-hidden />
                {rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
