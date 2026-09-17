"use client";

import { useEffect, type RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * Foca (e seleciona) um campo logo depois que o diálogo nativo abre.
 * O <dialog> só aceita foco depois do showModal(), que roda no efeito do pai,
 * então esperamos um instante.
 */
export function useFocoAoAbrir(ref: RefObject<HTMLInputElement | HTMLButtonElement | null>, ativo = true) {
  useEffect(() => {
    if (!ativo) return;
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (el instanceof HTMLInputElement) el.select();
    }, 40);
    return () => window.clearTimeout(t);
  }, [ref, ativo]);
}

/** Tecla de atalho desenhada discretamente. */
export function Tecla({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-borda bg-superficie-2 px-1 font-mono text-[10px] font-medium text-texto-suave",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Converte texto de quantidade em milésimos respeitando a unidade; null se inválido. */
export function lerQuantidade(texto: string, unidade: "UN" | "KG"): number | null {
  let s = texto.trim().replace(/\s/g, "").replace(/(kg|un)$/i, "");
  if (!s) return null;
  s = s.replace(",", ".");
  if (unidade === "UN") {
    if (!/^\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    return n > 0 ? n * 1000 : null;
  }
  if (!/^\d*(\.\d{0,3})?$/.test(s) || s === ".") return null;
  const [intPart, decPart = ""] = s.split(".");
  const m = parseInt(intPart || "0", 10) * 1000 + parseInt(decPart.padEnd(3, "0"), 10);
  return m > 0 ? m : null;
}

/** Elementos em que o teclado global não deve interferir. */
export function alvoEhCampo(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  const tag = alvo.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || alvo.isContentEditable;
}
