"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { Entrada } from "@/components/ui/campo";
import { formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

/**
 * Campo de dinheiro CONTROLADO que digita como calculadora ("1250" -> 12,50).
 * Diferente do EntradaMoeda do kit, o valor vem de fora em centavos e muda
 * quando o pai muda (pré-preencher com o restante, por exemplo).
 */
export const EntradaCentavos = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue"> & {
    valor: number;
    aoMudar: (centavos: number) => void;
    tamanho?: "md" | "lg";
  }
>(function EntradaCentavos({ valor, aoMudar, className, tamanho = "lg", ...props }, ref) {
  return (
    <Entrada
      ref={ref}
      inputMode="numeric"
      autoComplete="off"
      placeholder="0,00"
      tamanho={tamanho}
      className={cn("text-right tabular", className)}
      {...props}
      value={valor > 0 ? formatarReais(valor, false) : ""}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10);
        aoMudar(digitos ? parseInt(digitos, 10) : 0);
      }}
      onFocus={(e) => {
        e.target.select();
        props.onFocus?.(e);
      }}
    />
  );
});
