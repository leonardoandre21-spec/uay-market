"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, Menu, Store, X } from "lucide-react";
import type { Papel } from "@prisma/client";
import { Navegacao } from "@/components/navegacao";
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

  const barraLateral = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primaria text-primaria-texto">
          <Store className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-texto">{nomeLoja}</p>
          <p className="text-xs text-texto-fraco">Gestão do mercado</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <Navegacao papel={usuario.papel} aoNavegar={() => setMenuAberto(false)} />
      </div>
      <div className="border-t border-borda px-4 py-3">
        <p className="truncate text-sm font-medium text-texto">{usuario.nome}</p>
        <p className="text-xs text-texto-fraco">{ROTULO_PAPEL[usuario.papel]}</p>
        <form action={sair} className="mt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-xs text-texto-suave hover:text-perigo"
          >
            <LogOut className="size-3.5" aria-hidden /> Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-borda bg-superficie lg:block">
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
            "absolute inset-y-0 left-0 w-72 max-w-[85%] bg-superficie shadow-xl transition-transform",
            menuAberto ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
            className="absolute right-3 top-4 rounded-md p-1 text-texto-fraco hover:bg-superficie-2"
          >
            <X className="size-5" />
          </button>
          {barraLateral}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-borda bg-superficie px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            className="rounded-md p-1.5 text-texto-suave hover:bg-superficie-2"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/" className="text-sm font-semibold text-texto">
            {nomeLoja}
          </Link>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
