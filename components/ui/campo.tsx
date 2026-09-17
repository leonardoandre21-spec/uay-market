"use client";

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const baseInput =
  "w-full rounded-padrao border border-borda bg-superficie px-3 text-sm text-texto shadow-none " +
  "focus:outline-2 focus:outline-offset-0 focus:outline-primaria focus:border-primaria " +
  "disabled:bg-superficie-2 disabled:text-texto-fraco aria-[invalid=true]:border-perigo";

export interface EntradaProps extends InputHTMLAttributes<HTMLInputElement> {
  tamanho?: "md" | "lg";
}

export const Entrada = forwardRef<HTMLInputElement, EntradaProps>(function Entrada(
  { className, tamanho = "md", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(baseInput, tamanho === "lg" ? "h-12 text-base" : "h-10", className)}
      {...props}
    />
  );
});

export const Selecao = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Selecao(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(baseInput, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
});

export const AreaTexto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function AreaTexto({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(baseInput, "min-h-20 py-2", className)} {...props} />;
  },
);

export function Rotulo({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("block text-sm font-medium text-texto-suave", className)} {...props}>
      {children}
    </label>
  );
}

/**
 * Agrupa rótulo + controle + ajuda/erro.
 * <Campo rotulo="Nome" erro={erros?.nome}><Entrada name="nome" /></Campo>
 */
export function Campo({
  rotulo,
  htmlFor,
  ajuda,
  erro,
  obrigatorio,
  className,
  children,
}: {
  rotulo?: string;
  htmlFor?: string;
  ajuda?: string;
  erro?: string;
  obrigatorio?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {rotulo ? (
        <Rotulo htmlFor={htmlFor}>
          {rotulo}
          {obrigatorio ? <span className="text-perigo"> *</span> : null}
        </Rotulo>
      ) : null}
      {children}
      {erro ? (
        <p className="text-xs text-perigo">{erro}</p>
      ) : ajuda ? (
        <p className="text-xs text-texto-fraco">{ajuda}</p>
      ) : null}
    </div>
  );
}

export function CaixaSelecao({
  className,
  rotulo,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm text-texto cursor-pointer select-none", className)}>
      <input type="checkbox" className="size-4 accent-primaria" {...props} />
      {rotulo}
    </label>
  );
}
