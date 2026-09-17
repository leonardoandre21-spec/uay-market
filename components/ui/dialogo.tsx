"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modal controlado. Uso:
 * const [aberto, setAberto] = useState(false)
 * <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo="...">...</Dialogo>
 *
 * Foco ao abrir: o React aplica `autoFocus` no commit, quando o <dialog> ainda
 * está fechado (display: none), então o focus() falha em silêncio e o
 * showModal() acabava focando o botão X do cabeçalho (Enter fechava o diálogo).
 * Por isso, logo depois do showModal(), o foco vai pro primeiro campo útil do
 * conteúdo: `data-autofocus` > `autofocus` > input/select/textarea > botão do
 * rodapé (em confirmação sem campo, o "Cancelar" vem antes da ação de perigo).
 */
export function Dialogo({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = "md",
  className,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo?: React.ReactNode;
  descricao?: React.ReactNode;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  largura?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);
  // Onde o botão do mouse desceu. Arrastar uma seleção de texto a partir de um
  // campo e soltar sobre o fundo escuro dispara `click` no <dialog> (ancestral
  // comum de mousedown e mouseup); só fecha se o clique começou no fundo.
  const alvoPointerDown = useRef<EventTarget | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (aberto && !el.open) {
      el.showModal();
      focarPrimeiroCampo(corpoRef.current);
    }
    if (!aberto && el.open) el.close();
  }, [aberto]);

  const larguras = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onPointerDown={(e) => {
        alvoPointerDown.current = e.target;
      }}
      onClick={(e) => {
        // null: nenhum pointerdown visto (navegador sem pointer events); aí vale o comportamento antigo.
        const comecouNoFundo = alvoPointerDown.current === null || alvoPointerDown.current === ref.current;
        alvoPointerDown.current = null;
        if (e.target === ref.current && comecouNoFundo) aoFechar();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-padrao border border-borda bg-superficie p-0 text-texto shadow-xl",
        "backdrop:bg-black/40 open:animate-in",
        larguras[largura],
        className,
      )}
    >
      <div className="flex max-h-[90vh] flex-col">
        {titulo ? (
          <div className="flex items-start justify-between gap-4 border-b border-borda px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{titulo}</h2>
              {descricao ? <p className="mt-0.5 text-sm text-texto-suave">{descricao}</p> : null}
            </div>
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar"
              className="rounded-md p-1 text-texto-fraco hover:bg-superficie-2 hover:text-texto"
            >
              <X className="size-5" />
            </button>
          </div>
        ) : null}
        <div ref={corpoRef} className="contents">
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {rodape ? <div className="flex justify-end gap-2 border-t border-borda px-5 py-3">{rodape}</div> : null}
        </div>
      </div>
    </dialog>
  );
}

/** Seletores em ordem de preferência; hidden e disabled não recebem foco. */
const SELETORES_FOCO = [
  "[data-autofocus]:not([disabled])",
  "[autofocus]:not([disabled])",
  "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
  "button:not([disabled]), a[href]",
];

/**
 * Foca o primeiro campo útil dentro de `raiz` (conteúdo + rodapé, sem o
 * cabeçalho). Roda logo depois do showModal(), quando o <dialog> já aceita foco.
 * Se nada servir, fica o foco padrão do navegador.
 */
export function focarPrimeiroCampo(raiz: HTMLElement | null): HTMLElement | null {
  if (!raiz) return null;
  for (const seletor of SELETORES_FOCO) {
    const alvo = raiz.querySelector<HTMLElement>(seletor);
    if (!alvo) continue;
    alvo.focus();
    if (alvo instanceof HTMLInputElement && alvo.type !== "checkbox" && alvo.type !== "radio") {
      try {
        alvo.select();
      } catch {
        // Tipos como number/date não aceitam select(): só o foco já basta.
      }
    }
    return alvo;
  }
  return null;
}
