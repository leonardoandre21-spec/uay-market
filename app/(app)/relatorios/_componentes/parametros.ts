// Leitura dos searchParams das páginas de relatório.

export type ParametrosBusca = Record<string, string | string[] | undefined>;

export type PropsPaginaRelatorio = {
  searchParams: Promise<ParametrosBusca>;
};

/** Lê um inteiro positivo de um parâmetro (ou null). */
export function lerInteiro(valor: string | string[] | undefined): number | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  if (!v || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}
