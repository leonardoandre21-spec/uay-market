import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import type { TamanhoBotao, VarianteBotao } from "@/components/ui/botao";

// Link com a aparência do <Botao>, pra navegar sem aninhar <button> dentro de <a>.
// Mesmas classes visuais do kit (components/ui/botao.tsx).

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

export function LinkBotao({
  variante = "primaria",
  tamanho = "md",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variante?: VarianteBotao; tamanho?: TamanhoBotao }) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center rounded-padrao font-medium transition-colors select-none whitespace-nowrap",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria",
        variantes[variante],
        tamanhos[tamanho],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
