import { cn } from "@/lib/utils";

// Classes visuais do <Botao>, num módulo sem "use client": servem tanto pro
// botão (componente cliente) quanto pros links com cara de botão renderizados
// no servidor (BotaoLink, LinkBotao). Uma fonte só pras cores da marca.

export type VarianteBotao = "primaria" | "destaque" | "secundaria" | "perigo" | "fantasma" | "contorno";
export type TamanhoBotao = "sm" | "md" | "lg" | "xl";

export const VARIANTES_BOTAO: Record<VarianteBotao, string> = {
  primaria: "bg-primaria text-primaria-texto hover:bg-primaria-forte shadow-sm",
  // Dourado da marca: só pra ação principal de uma tela (finalizar venda, entrar, abrir caixa).
  destaque: "bg-acento text-primaria font-semibold hover:bg-acento-forte shadow-sm",
  secundaria: "bg-superficie-2 text-texto hover:bg-borda",
  perigo: "bg-perigo text-white hover:brightness-95 shadow-sm",
  fantasma: "bg-transparent text-texto-suave hover:bg-superficie-2 hover:text-texto",
  contorno: "bg-superficie border border-borda text-texto hover:border-acento/60 hover:bg-superficie-2",
};

export const TAMANHOS_BOTAO: Record<TamanhoBotao, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
  xl: "h-14 px-6 text-lg gap-2.5",
};

export function classesBotao(variante: VarianteBotao = "primaria", tamanho: TamanhoBotao = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-padrao font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
    "disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap",
    VARIANTES_BOTAO[variante],
    TAMANHOS_BOTAO[tamanho],
    className,
  );
}
