import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";
import type { TamanhoBotao, VarianteBotao } from "@/components/ui/botao";
import { cn } from "@/lib/utils";

// Link com a cara do <Botao>. Mesmas classes do kit; usado nas ações de
// página (Novo produto, Importar, Exportar) que navegam em vez de submeter.

const variantes: Record<VarianteBotao, string> = {
  primaria: "bg-primaria text-primaria-texto hover:bg-primaria-forte shadow-sm",
  secundaria: "bg-superficie-2 text-texto hover:bg-borda",
  perigo: "bg-perigo text-white hover:brightness-95 shadow-sm",
  fantasma: "bg-transparent text-texto-suave hover:bg-superficie-2 hover:text-texto",
  contorno: "bg-superficie border border-borda text-texto hover:bg-superficie-2",
};

const tamanhos: Record<TamanhoBotao, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
  xl: "h-14 px-6 text-lg gap-2.5",
};

export function classesBotao(variante: VarianteBotao = "primaria", tamanho: TamanhoBotao = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-padrao font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria",
    "select-none whitespace-nowrap",
    variantes[variante],
    tamanhos[tamanho],
    className,
  );
}

export function BotaoLink({
  href,
  variante = "primaria",
  tamanho = "md",
  nativo = false,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  /** true = <a> comum (downloads e route handlers); false = <Link> do Next. */
  nativo?: boolean;
}) {
  const classes = classesBotao(variante, tamanho, className);
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
