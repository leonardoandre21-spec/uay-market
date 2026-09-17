import { agora, parseMesInput } from "@/lib/datas";
import { chaveMes, mesAnterior, mesDe, mesSeguinte, rotuloMes, type AnoMes } from "@/lib/servicos/financeiro-calculos";

export type ParametrosBusca = Record<string, string | string[] | undefined>;

export function parametro(sp: ParametrosBusca, nome: string): string | undefined {
  const v = sp[nome];
  return typeof v === "string" && v !== "" ? v : undefined;
}

export function parametroInteiro(sp: ParametrosBusca, nome: string): number | null {
  const v = parametro(sp, nome);
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Lê ?mes=yyyy-MM (padrão: mês atual) e devolve tudo que a navegação precisa. */
export function mesDaUrl(sp: ParametrosBusca) {
  const hoje = mesDe(agora());
  const mes: AnoMes = parseMesInput(parametro(sp, "mes")) ?? hoje;
  return {
    mes,
    chave: chaveMes(mes),
    rotulo: rotuloMes(mes),
    anterior: chaveMes(mesAnterior(mes)),
    seguinte: chaveMes(mesSeguinte(mes)),
    hoje: chaveMes(hoje),
    ehMesAtual: chaveMes(mes) === chaveMes(hoje),
  };
}

/** Monta uma query string a partir de um objeto, ignorando vazios. */
export function montarQuery(valores: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(valores)) {
    if (v === null || v === undefined || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
