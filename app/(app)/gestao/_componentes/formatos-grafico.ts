// Formatação compartilhada pelos gráficos (roda no navegador).

/** Eixo em reais de forma compacta: "R$ 1,2 mil", "R$ 850". */
export function formatarEixoReais(centavos: number): string {
  const reais = centavos / 100;
  const abs = Math.abs(reais);
  const sinal = reais < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1000) return `${sinal}R$ ${(abs / 1000).toFixed(1).replace(".", ",")} mil`;
  return `${sinal}R$ ${Math.round(abs)}`;
}
