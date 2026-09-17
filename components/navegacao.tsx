"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarClock,
  ClipboardList,
  FileText,
  LayoutDashboard,
  PackagePlus,
  Receipt,
  ScanBarcode,
  Settings,
  ShoppingBasket,
  Store,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { Papel } from "@prisma/client";
import { cn } from "@/lib/utils";

type Item = { href: string; rotulo: string; Icone: typeof Store; apenasAdmin?: boolean };
type Grupo = { titulo: string; itens: Item[] };

// Rotas oficiais do sistema. Cada módulo implementa exatamente estes caminhos.
export const GRUPOS_NAV: Grupo[] = [
  {
    titulo: "Operação",
    itens: [
      { href: "/pdv", rotulo: "Caixa (PDV)", Icone: ScanBarcode },
      { href: "/caixa", rotulo: "Abertura e fechamento", Icone: Wallet },
      { href: "/vendas", rotulo: "Vendas", Icone: Receipt },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/produtos", rotulo: "Produtos", Icone: ShoppingBasket },
      { href: "/clientes", rotulo: "Clientes e fiado", Icone: Users },
      { href: "/financeiro/fornecedores", rotulo: "Fornecedores", Icone: Truck, apenasAdmin: true },
    ],
  },
  {
    titulo: "Estoque",
    itens: [
      { href: "/estoque", rotulo: "Estoque", Icone: Boxes },
      { href: "/estoque/entradas", rotulo: "Entradas (compras)", Icone: PackagePlus, apenasAdmin: true },
      { href: "/estoque/perdas", rotulo: "Perdas", Icone: AlertTriangle },
      { href: "/estoque/vencimentos", rotulo: "Vencimentos", Icone: CalendarClock },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      { href: "/financeiro/despesas", rotulo: "Despesas", Icone: ClipboardList, apenasAdmin: true },
      { href: "/financeiro/contas-a-pagar", rotulo: "Boletos a pagar", Icone: FileText, apenasAdmin: true },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { href: "/gestao", rotulo: "Painel", Icone: LayoutDashboard, apenasAdmin: true },
      { href: "/gestao/fechamento", rotulo: "Fechamento mensal", Icone: CalendarClock, apenasAdmin: true },
      { href: "/relatorios", rotulo: "Relatórios", Icone: BarChart3, apenasAdmin: true },
    ],
  },
  {
    titulo: "Sistema",
    itens: [{ href: "/configuracoes", rotulo: "Configurações", Icone: Settings, apenasAdmin: true }],
  },
];

/** Só o item mais específico que casa com a rota atual fica aceso (ex.: /estoque/vencimentos acende Vencimentos, não Estoque). */
function hrefAtivo(pathname: string): string | null {
  let melhor: string | null = null;
  for (const grupo of GRUPOS_NAV) {
    for (const { href } of grupo.itens) {
      const casa = pathname === href || pathname.startsWith(`${href}/`);
      if (casa && (melhor === null || href.length > melhor.length)) melhor = href;
    }
  }
  return melhor;
}

export function Navegacao({ papel, aoNavegar }: { papel: Papel; aoNavegar?: () => void }) {
  const pathname = usePathname();
  const ativoAtual = hrefAtivo(pathname);
  return (
    <nav className="flex flex-col gap-5">
      {GRUPOS_NAV.map((grupo) => {
        const itens = grupo.itens.filter((i) => !i.apenasAdmin || papel === "ADMIN");
        if (!itens.length) return null;
        return (
          <div key={grupo.titulo}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-texto-fraco">
              {grupo.titulo}
            </p>
            <ul className="flex flex-col gap-0.5">
              {itens.map(({ href, rotulo, Icone }) => {
                const ativo = href === ativoAtual;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={aoNavegar}
                      aria-current={ativo ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                        ativo
                          ? "bg-primaria-suave font-medium text-primaria"
                          : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
                      )}
                    >
                      <Icone className="size-4 shrink-0" aria-hidden />
                      {rotulo}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
