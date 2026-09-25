import Link from "next/link";
import type { ComponentProps } from "react";
import { classesBotao, type TamanhoBotao, type VarianteBotao } from "@/components/ui/estilos-botao";

// Link com a aparência do <Botao>, pra navegar sem aninhar <button> dentro de <a>.
// Mesmas classes visuais do kit (components/ui/botao.tsx).

export function LinkBotao({
  variante = "primaria",
  tamanho = "md",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variante?: VarianteBotao; tamanho?: TamanhoBotao }) {
  return (
    <Link
      className={classesBotao(variante, tamanho, className)}
      {...props}
    >
      {children}
    </Link>
  );
}
