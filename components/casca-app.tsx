"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";
import type { Papel } from "@prisma/client";
import { Navegacao } from "@/components/navegacao";
import { LogoUay } from "@/components/marca";
import { ROTULO_PAPEL } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

/**
 * Casca das páginas administrativas: barra lateral fixa no desktop,
 * menu retrátil no celular. O conteúdo vem em children.
 */
export function CascaApp({
  nomeLoja,
  usuario,
  sair,
  children,
}: {
  nomeLoja: string;
  usuario: { nome: string; papel: Papel };
  sair: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [menuAberto, setMenuAberto] = useState(false);

  const iniciais = usuario.nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const barraLateral = (
    <div className="flex h-full flex-col bg-primaria text-white">
      <Link
        href="/"
        onClick={() => setMenuAberto(false)}
        className="relative block overflow-hidden px-5 pb-5 pt-6"
        title={nomeLoja}
      >
        <LogoUay variante="clara" className="h-[72px]" prioridade />
        <span className="mt-3 block text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
          Gestão do mercado
        </span>
      </Link>
      <div className="mx-5 mb-3 h-px bg-gradient-to-r from-acento/70 via-acento/25 to-transparent" aria-hidden />
      <div className="rolagem-escura flex-1 overflow-y-auto px-3 pb-4">
        <Navegacao papel={usuario.papel} aoNavegar={() => setMenuAberto(false)} />
      </div>
      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3.5">
        <span className="fonte-marca flex size-9 shrink-0 items-center justify-center rounded-full bg-acento text-sm font-bold text-primaria">
          {iniciais || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{usuario.nome}</p>
          <p className="text-xs text-white/55">{ROTULO_PAPEL[usuario.papel]}</p>
        </div>
        <form action={sair}>
          <button
            type="submit"
            title="Sair"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-white/65 transition-colors hover:bg-white/10 hover:text-acento"
          >
            <LogOut className="size-4" aria-hidden /> Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 bg-primaria lg:block">
        <div className="sticky top-0 h-screen">{barraLateral}</div>
      </aside>

      {/* Menu móvel */}
      <div
        className={cn("fixed inset-0 z-40 lg:hidden", menuAberto ? "" : "pointer-events-none")}
        aria-hidden={!menuAberto}
      >
        <div
          className={cn("absolute inset-0 bg-black/40 transition-opacity", menuAberto ? "opacity-100" : "opacity-0")}
          onClick={() => setMenuAberto(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-72 max-w-[85%] bg-primaria shadow-xl transition-transform",
            menuAberto ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
            className="absolute right-3 top-4 z-10 rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
          {barraLateral}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-primaria px-4 py-2.5 shadow-md lg:hidden">
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/" aria-label={nomeLoja}>
            <LogoUay variante="clara" className="h-9" prioridade />
          </Link>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
