"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Entrada } from "@/components/ui/campo";
import { formatarReais, parseReais } from "@/lib/dinheiro";

/**
 * Campo de dinheiro que digita como calculadora: "1" -> 0,01; "12" -> 0,12; "1250" -> 12,50.
 * Envia no FormData o texto formatado ("12,50"); no servidor use parseReais().
 * valorInicial em centavos.
 */
export function EntradaMoeda({
  valorInicial,
  aoMudar,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue"> & {
  valorInicial?: number | null;
  aoMudar?: (centavos: number) => void;
}) {
  const [texto, setTexto] = useState(
    valorInicial !== undefined && valorInicial !== null ? formatarReais(valorInicial, false) : "",
  );

  return (
    <Entrada
      inputMode="numeric"
      autoComplete="off"
      placeholder="0,00"
      className="text-right tabular"
      {...props}
      value={texto}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        const centavos = digitos ? parseInt(digitos, 10) : 0;
        setTexto(digitos ? formatarReais(centavos, false) : "");
        aoMudar?.(centavos);
      }}
    />
  );
}

/** Lê o valor de um EntradaMoeda a partir do FormData (centavos ou null). */
export function lerMoeda(form: FormData, nome: string): number | null {
  const v = form.get(nome);
  return typeof v === "string" ? parseReais(v) : null;
}
