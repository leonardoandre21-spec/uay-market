"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tom = "sucesso" | "erro" | "info";
type Toast = { id: number; tom: Tom; mensagem: string };

type Contexto = {
  notificar: (mensagem: string, tom?: Tom) => void;
  sucesso: (mensagem: string) => void;
  erro: (mensagem: string) => void;
};

const ToastContext = createContext<Contexto | null>(null);

/** Provider global (já está no layout do app). Use `const toast = useToast()`. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const proximoId = useRef(1);
  const caixaRef = useRef<HTMLDivElement>(null);

  // O contêiner é um popover "manual": vive na camada superior do navegador,
  // acima de qualquer <dialog> modal, senão o aviso some atrás do backdrop.
  useEffect(() => {
    const el = caixaRef.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (toasts.length > 0 && !el.matches(":popover-open")) el.showPopover();
      if (toasts.length === 0 && el.matches(":popover-open")) el.hidePopover();
    } catch {
      // Navegador sem suporte a popover: fica o posicionamento fixo comum.
    }
  }, [toasts.length]);

  const remover = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const notificar = useCallback(
    (mensagem: string, tom: Tom = "info") => {
      const id = proximoId.current++;
      setToasts((t) => [...t, { id, tom, mensagem }]);
      window.setTimeout(() => remover(id), tom === "erro" ? 6000 : 3500);
    },
    [remover],
  );

  const valor = useMemo<Contexto>(
    () => ({
      notificar,
      sucesso: (m) => notificar(m, "sucesso"),
      erro: (m) => notificar(m, "erro"),
    }),
    [notificar],
  );

  const icones: Record<Tom, React.ReactNode> = {
    sucesso: <CheckCircle2 className="size-4 text-sucesso" />,
    erro: <XCircle className="size-4 text-perigo" />,
    info: <Info className="size-4 text-info" />,
  };

  return (
    <ToastContext.Provider value={valor}>
      {children}
      <div
        ref={caixaRef}
        popover="manual"
        className="pointer-events-none fixed inset-auto bottom-4 right-4 z-[100] m-0 flex w-80 flex-col gap-2 border-0 bg-transparent p-0"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-padrao border border-borda bg-superficie px-3 py-2.5 text-sm shadow-lg",
            )}
          >
            <span className="mt-0.5 shrink-0">{icones[t.tom]}</span>
            <span className="flex-1 text-texto">{t.mensagem}</span>
            <button
              type="button"
              onClick={() => remover(t.id)}
              aria-label="Fechar aviso"
              className="text-texto-fraco hover:text-texto"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Contexto {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>.");
  return ctx;
}
