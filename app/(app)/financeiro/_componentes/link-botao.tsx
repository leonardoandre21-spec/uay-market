import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variante = "primaria" | "secundaria" | "fantasma" | "contorno";
type Tamanho = "sm" | "md" | "lg";

const variantes: Record<Variante, string> = {
  primaria: "bg-primaria text-primaria-texto hover:bg-primaria-forte shadow-sm",
  secundaria: "bg-superficie-2 text-texto hover:bg-borda",
  fantasma: "bg-transparent text-texto-suave hover:bg-superficie-2 hover:text-texto",
  contorno: "bg-superficie border border-borda text-texto hover:bg-superficie-2",
};

const tamanhos: Record<Tamanho, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

/**
 * Link com a mesma cara do Botao (pra navegar entre telas sem aninhar botão em link).
 * `nativo` usa <a> comum: necessário pra downloads (route handlers com arquivo).
 */
export function LinkBotao({
  href,
  variante = "contorno",
  tamanho = "md",
  nativo = false,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variante?: Variante; tamanho?: Tamanho; nativo?: boolean }) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-padrao font-medium transition-colors select-none whitespace-nowrap",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria",
    variantes[variante],
    tamanhos[tamanho],
    className,
  );
  if (nativo) {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}
