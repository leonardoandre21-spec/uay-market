// Normalização dos dados Pix digitados pelo dono. A geração do payload (BR Code)
// vem de lib/pix.ts (gerarPayloadPix), criado pelo módulo do PDV: assim a prévia
// desta tela e o QR do caixa saem idênticos. Este arquivo só cuida do que o
// dono digita antes de salvar.

/** Remove acentos e caracteres fora do ASCII imprimível; deixa em maiúsculas e corta no máximo. */
export function normalizarTextoPix(texto: string, maximo: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, maximo);
}

/**
 * Normaliza a chave digitada: CPF/CNPJ só números, celular com +55, e-mail em
 * minúsculas, chave aleatória (UUID) em minúsculas. Retorna null se não parecer
 * uma chave Pix válida.
 */
export function normalizarChavePix(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  if (t.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t.toLowerCase() : null;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return t.toLowerCase();
  if (t.startsWith("+")) {
    const digitos = t.slice(1).replace(/\D/g, "");
    return /^55\d{10,11}$/.test(digitos) ? `+${digitos}` : null;
  }
  const digitos = t.replace(/\D/g, "");
  if (digitos.length === 11 || digitos.length === 14) return digitos;
  return null;
}
