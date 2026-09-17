// Pix estático (BR Code / EMV QRCPS-MPM). Gera o texto "copia e cola" que
// também vira QR Code. Função pura: serve no servidor e no navegador.
//
// Estrutura (id + tamanho em 2 dígitos + valor):
//   00 "01"                       formato do payload
//   26 conta do recebedor         00 "br.gov.bcb.pix", 01 chave, 02 descrição (opcional)
//   52 "0000"                     categoria do comerciante
//   53 "986"                      moeda (BRL)
//   54 valor "12.50"              opcional; sem ele o pagador digita o valor
//   58 "BR"                       país
//   59 nome do recebedor          máx. 25 caracteres, sem acento
//   60 cidade                     máx. 15 caracteres, sem acento
//   62 dados adicionais           05 txid ("***" quando não há identificador)
//   63 CRC16-CCITT                4 hex maiúsculos sobre tudo até "6304" inclusive

export type ParametrosPix = {
  /** chave Pix como cadastrada no banco: CPF/CNPJ só dígitos, e-mail, telefone +55... ou chave aleatória */
  chave: string;
  /** nome do recebedor (será truncado em 25 e sem acentos) */
  nome: string;
  /** cidade do recebedor (truncada em 15, sem acentos) */
  cidade: string;
  /** valor em centavos; omitido ou 0 = QR sem valor definido */
  valorCentavos?: number | null;
  /** identificador da transação (A-Z a-z 0-9, máx. 25). Padrão "***" */
  txid?: string | null;
  /** descrição curta que aparece pro pagador (opcional) */
  descricao?: string | null;
};

const TAMANHO_MAX_NOME = 25;
const TAMANHO_MAX_CIDADE = 15;
const TAMANHO_MAX_TXID = 25;
const TAMANHO_MAX_DESCRICAO = 72;
const TAMANHO_MAX_CHAVE = 77;

/** Remove acentos e qualquer caractere fora do ASCII imprimível; colapsa espaços. */
export function limparTextoPix(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Monta um campo EMV: id (2 dígitos) + tamanho (2 dígitos) + valor. */
export function campoEmv(id: string, valor: string): string {
  if (valor.length > 99) throw new Error(`Campo Pix ${id} passou de 99 caracteres.`);
  return `${id}${valor.length.toString().padStart(2, "0")}${valor}`;
}

/** Centavos -> "12.50" (ponto decimal, sem separador de milhar), como o padrão exige. */
export function formatarValorPix(centavos: number): string {
  const abs = Math.abs(Math.round(centavos));
  return `${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, "0")}`;
}

/**
 * CRC-16/CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF, sem reflexão,
 * sem XOR final. Retorna 4 dígitos hexadecimais maiúsculos.
 * Vetor de teste clássico: "123456789" -> "29B1".
 */
export function crc16Ccitt(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Gera o payload completo do Pix estático, já com o CRC no final. */
export function gerarPayloadPix(params: ParametrosPix): string {
  const chave = params.chave.replace(/\s+/g, "").trim();
  if (!chave) throw new Error("Chave Pix não informada.");
  if (chave.length > TAMANHO_MAX_CHAVE) throw new Error("Chave Pix muito longa.");

  const nome = (limparTextoPix(params.nome) || "NAO INFORMADO").slice(0, TAMANHO_MAX_NOME);
  const cidade = (limparTextoPix(params.cidade) || "NAO INFORMADA").slice(0, TAMANHO_MAX_CIDADE);
  const txid = (limparTextoPix(params.txid ?? "").replace(/[^A-Za-z0-9]/g, "") || "***").slice(0, TAMANHO_MAX_TXID);
  const descricao = limparTextoPix(params.descricao ?? "").slice(0, TAMANHO_MAX_DESCRICAO);

  let conta = campoEmv("00", "br.gov.bcb.pix") + campoEmv("01", chave);
  if (descricao) conta += campoEmv("02", descricao);

  let payload = campoEmv("00", "01") + campoEmv("26", conta) + campoEmv("52", "0000") + campoEmv("53", "986");
  if (params.valorCentavos && params.valorCentavos > 0) {
    payload += campoEmv("54", formatarValorPix(params.valorCentavos));
  }
  payload += campoEmv("58", "BR") + campoEmv("59", nome) + campoEmv("60", cidade);
  payload += campoEmv("62", campoEmv("05", txid));
  payload += "6304";
  return payload + crc16Ccitt(payload);
}

/** Confere se um payload termina com CRC válido. */
export function payloadPixValido(payload: string): boolean {
  if (payload.length < 8) return false;
  const corpo = payload.slice(0, -4);
  if (!corpo.endsWith("6304")) return false;
  return crc16Ccitt(corpo) === payload.slice(-4).toUpperCase();
}
