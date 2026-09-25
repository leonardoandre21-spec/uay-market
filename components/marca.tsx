import Image from "next/image";
import logoEscura from "@/public/marca/logo-uay-market.png";
import logoClara from "@/public/marca/logo-uay-market-clara.png";
import { cn } from "@/lib/utils";

/**
 * Logo oficial do Uay Market (PNG transparente, 1096x836).
 * variante "escura": azul-marinho e dourado, pra fundo claro.
 * variante "clara": branco e dourado, pra fundo azul-marinho.
 * Controle o tamanho pela altura (className "h-10 w-auto", por exemplo).
 */
export function LogoUay({
  variante = "escura",
  className,
  prioridade = false,
}: {
  variante?: "escura" | "clara";
  className?: string;
  prioridade?: boolean;
}) {
  return (
    <Image
      src={variante === "clara" ? logoClara : logoEscura}
      alt="Uay Market"
      priority={prioridade}
      className={cn("h-12 w-auto select-none", className)}
      draggable={false}
    />
  );
}
