import { limitesDoDia, parseDataInput } from "@/lib/datas";
import type { FiltrosAuditoria } from "@/lib/servicos/configuracoes";

export type ParametrosAuditoria = {
  usuario?: string;
  acao?: string;
  de?: string;
  ate?: string;
  pagina?: string;
};

/** Lê os parâmetros da URL (?usuario=&acao=&de=&ate=&pagina=) e monta o filtro do banco. */
export function lerFiltrosAuditoria(params: ParametrosAuditoria): { filtros: FiltrosAuditoria; pagina: number } {
  const usuarioId = params.usuario && /^\d+$/.test(params.usuario) ? Number(params.usuario) : null;
  const acao = params.acao?.trim() || null;
  const de = parseDataInput(params.de);
  const ateInicio = parseDataInput(params.ate);
  // "até" inclui o dia inteiro (23:59:59 no fuso do mercado).
  const ate = ateInicio ? limitesDoDia(ateInicio).fim : null;
  const pagina = params.pagina && /^\d+$/.test(params.pagina) ? Math.max(1, Number(params.pagina)) : 1;
  return { filtros: { usuarioId, acao, de, ate }, pagina };
}

/** Reconstrói a query string mantendo os filtros e trocando a página. */
export function montarQuery(params: ParametrosAuditoria, sobrescrever: Partial<ParametrosAuditoria> = {}): string {
  const q = new URLSearchParams();
  const final = { ...params, ...sobrescrever };
  for (const chave of ["usuario", "acao", "de", "ate", "pagina"] as const) {
    const v = final[chave];
    if (v) q.set(chave, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
