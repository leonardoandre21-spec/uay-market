import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Remove acentos e baixa caixa pra comparação de texto. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Formata CPF "12345678901" -> "123.456.789-01" (ou devolve como veio). */
export function formatarCpf(cpf: string | null | undefined): string {
  if (!cpf) return "";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Guarda só os caracteres do CNPJ (dígitos e, desde julho de 2026, letras nas
 * 12 primeiras posições), em maiúsculas. Vazio vira "".
 */
export function normalizarCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return "";
  return cnpj.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Formata CNPJ "12345678000199" -> "12.345.678/0001-99" (ou devolve como veio). */
export function formatarCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return "";
  const d = normalizarCnpj(cnpj);
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Valida os dígitos verificadores do CNPJ (formatado ou não). Aceita o formato
 * alfanumérico da Receita (12 primeiras posições com letras ou números, os 2
 * verificadores sempre numéricos): cada caractere vale o código ASCII menos 48.
 */
export function cnpjValido(cnpj: string): boolean {
  const d = normalizarCnpj(cnpj);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(.)\1{13}$/.test(d)) return false;
  const digito = (base: string, pesos: number[]) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(d.slice(0, 12), PESOS_CNPJ_1) === Number(d[12]) && digito(d.slice(0, 13), PESOS_CNPJ_2) === Number(d[13]);
}

/** Formata telefone "35992173959" -> "(35) 99217-3959". */
export function formatarTelefone(tel: string | null | undefined): string {
  if (!tel) return "";
  const d = tel.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}

/** Valida dígitos verificadores do CPF. */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** Valida dígito verificador de EAN-8 / EAN-13 / UPC-A. Códigos internos curtos passam. */
export function codigoBarrasValido(codigo: string): boolean {
  const d = codigo.trim();
  if (!/^\d+$/.test(d)) return false;
  if (![8, 12, 13].includes(d.length)) return d.length >= 1 && d.length <= 20;
  const digitos = d.split("").map(Number);
  const verificador = digitos.pop()!;
  let soma = 0;
  digitos.reverse().forEach((n, i) => {
    soma += n * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (soma % 10)) % 10 === verificador;
}

export function truncar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}
