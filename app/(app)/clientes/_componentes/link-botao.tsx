import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variante = "primaria" | "secundaria" | "perigo" | "fantasma" | "contorno";
type Tamanho = "sm" | "md" | "lg";

const variantes: Record<Variante, string> = {
  primaria: "bg-primaria text-primaria-texto hover:bg-primaria-forte shadow-sm",
  secundaria: "bg-superficie-2 text-texto hover:bg-borda",
  perigo: "bg-perigo text-white hover:brightness-95 shadow-sm",
  fantasma: "bg-transparent text-texto-suave hover:bg-superficie-2 hover:text-texto",
  contorno: "bg-superficie border border-borda text-texto hover:bg-superficie-2",
};

const tamanhos: Record<Tamanho, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

/**
 * Link com aparência de botão (mesmas classes do <Botao>), pra usar em
 * Server Components sem virar Client Component. Links externos usam <a>.
 */
export function LinkBotao({
  href,
  variante = "primaria",
  tamanho = "md",
  externo = false,
  desabilitado = false,
  className,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variante?: Variante;
  tamanho?: Tamanho;
  externo?: boolean;
  desabilitado?: boolean;
}) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-padrao font-medium transition-colors select-none whitespace-nowrap",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria",
    variantes[variante],
    tamanhos[tamanho],
    desabilitado && "pointer-events-none opacity-50",
    className,
  );
  if (desabilitado) {
    return (
      <span className={classes} aria-disabled="true" title={props.title}>
        {children}
      </span>
    );
  }
  if (externo) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...props}>
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
