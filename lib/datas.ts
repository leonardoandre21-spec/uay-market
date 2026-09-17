import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export const FUSO = "America/Sao_Paulo";

/** Agora, no fuso do mercado. */
export function agora(): TZDate {
  return TZDate.tz(FUSO);
}

/** Converte qualquer Date pro fuso do mercado. */
export function noFuso(data: Date): TZDate {
  return new TZDate(data, FUSO);
}

/** Início e fim do dia (no fuso) como Date UTC pra usar em filtros do Prisma. */
export function limitesDoDia(data: Date = agora()): { inicio: Date; fim: Date } {
  const d = noFuso(data);
  return { inicio: new Date(startOfDay(d).getTime()), fim: new Date(endOfDay(d).getTime()) };
}

/** Início e fim do mês (no fuso). */
export function limitesDoMes(data: Date = agora()): { inicio: Date; fim: Date } {
  const d = noFuso(data);
  return { inicio: new Date(startOfMonth(d).getTime()), fim: new Date(endOfMonth(d).getTime()) };
}

/** Início e fim de um mês dado ano/mês (1-12). */
export function limitesDoMesAnoMes(ano: number, mes: number): { inicio: Date; fim: Date } {
  const d = new TZDate(ano, mes - 1, 1, FUSO);
  return { inicio: new Date(startOfMonth(d).getTime()), fim: new Date(endOfMonth(d).getTime()) };
}

/** "yyyy-MM-dd" (valor de <input type="date">) -> Date no início do dia no fuso. */
export function parseDataInput(texto: string | null | undefined): Date | null {
  if (!texto) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const d = new TZDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), FUSO);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime());
}

/** Date -> "yyyy-MM-dd" no fuso (pra preencher <input type="date">). */
export function paraDataInput(data: Date | null | undefined): string {
  if (!data) return "";
  return format(noFuso(data), "yyyy-MM-dd");
}

/** Date -> "yyyy-MM" no fuso (pra <input type="month">). */
export function paraMesInput(data: Date): string {
  return format(noFuso(data), "yyyy-MM");
}

/** "yyyy-MM" -> { ano, mes } ou null. */
export function parseMesInput(texto: string | null | undefined): { ano: number; mes: number } | null {
  if (!texto) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { ano: Number(m[1]), mes };
}

/** "16/09/2026" */
export function formatarData(data: Date | null | undefined): string {
  if (!data) return "";
  return format(noFuso(data), "dd/MM/yyyy", { locale: ptBR });
}

/** "16/09/2026 14:35" */
export function formatarDataHora(data: Date | null | undefined): string {
  if (!data) return "";
  return format(noFuso(data), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

/** "14:35" */
export function formatarHora(data: Date | null | undefined): string {
  if (!data) return "";
  return format(noFuso(data), "HH:mm", { locale: ptBR });
}

/** "setembro de 2026" */
export function formatarMesAno(data: Date): string {
  return format(noFuso(data), "MMMM 'de' yyyy", { locale: ptBR });
}

/** "16 set" */
export function formatarDiaCurto(data: Date): string {
  return format(noFuso(data), "dd MMM", { locale: ptBR });
}

/** Dias corridos entre hoje e a data (negativo = já passou). */
export function diasAte(data: Date): number {
  return differenceInCalendarDays(noFuso(data), agora());
}

export { addDays, addMonths, subDays, subMonths };
