import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { classesBotao, type TamanhoBotao, type VarianteBotao } from "@/components/ui/estilos-botao";

// Link com a cara do <Botao>. Mesmas classes do kit; usado nas ações de
// página (Novo produto, Importar, Exportar) que navegam em vez de submeter.

export { classesBotao };

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
