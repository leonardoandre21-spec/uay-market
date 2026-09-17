import { describe, expect, it } from "vitest";
import {
  campoEmv,
  crc16Ccitt,
  formatarValorPix,
  gerarPayloadPix,
  limparTextoPix,
  payloadPixValido,
} from "@/lib/pix";

/** Implementação de referência do CRC-16/CCITT-FALSE por tabela, independente da lib. */
function crcReferencia(texto: string): string {
  const tabela: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    tabela.push(c);
  }
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc = ((crc << 8) ^ tabela[((crc >> 8) ^ texto.charCodeAt(i)) & 0xff]) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Lê os campos EMV de nível superior do payload em um mapa id -> valor. */
function lerCampos(payload: string): Record<string, string> {
  const campos: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const tamanho = Number(payload.slice(i + 2, i + 4));
    campos[id] = payload.slice(i + 4, i + 4 + tamanho);
    i += 4 + tamanho;
  }
  return campos;
}

describe("crc16Ccitt", () => {
  it("bate com o vetor clássico 123456789 -> 29B1", () => {
    expect(crc16Ccitt("123456789")).toBe("29B1");
    expect(crcReferencia("123456789")).toBe("29B1");
  });

  it("bate com a implementação de referência por tabela em textos variados", () => {
    for (const t of ["", "A", "br.gov.bcb.pix", "000201010212", "UAY MARKET 12.50 SAO PAULO ***6304"]) {
      expect(crc16Ccitt(t)).toBe(crcReferencia(t));
    }
  });

  it("sempre devolve 4 hex maiúsculos", () => {
    expect(crc16Ccitt("x")).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe("campoEmv e formatarValorPix", () => {
  it("monta id + tamanho + valor", () => {
    expect(campoEmv("00", "01")).toBe("000201");
    expect(campoEmv("05", "***")).toBe("0503***");
  });

  it("formata centavos com ponto decimal", () => {
    expect(formatarValorPix(1250)).toBe("12.50");
    expect(formatarValorPix(5)).toBe("0.05");
    expect(formatarValorPix(123456)).toBe("1234.56");
  });

  it("limpa acentos e caracteres fora do ASCII", () => {
    expect(limparTextoPix("São João  Ltda")).toBe("Sao Joao Ltda");
    expect(limparTextoPix("Açaí & Cia")).toBe("Acai & Cia");
  });
});

describe("gerarPayloadPix", () => {
  const base = { chave: "12345678901", nome: "Uay Market", cidade: "Sao Paulo" };

  it("gera payload com estrutura EMV correta e CRC válido", () => {
    const payload = gerarPayloadPix({ ...base, valorCentavos: 1250 });
    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
    expect(payloadPixValido(payload)).toBe(true);
    expect(payload.slice(-4)).toBe(crcReferencia(payload.slice(0, -4)));

    const campos = lerCampos(payload);
    expect(campos["00"]).toBe("01");
    expect(campos["52"]).toBe("0000");
    expect(campos["53"]).toBe("986");
    expect(campos["54"]).toBe("12.50");
    expect(campos["58"]).toBe("BR");
    expect(campos["59"]).toBe("Uay Market");
    expect(campos["60"]).toBe("Sao Paulo");
    expect(campos["62"]).toBe("0503***");
    expect(campos["63"]).toHaveLength(4);

    const conta = lerCampos(campos["26"]);
    expect(conta["00"]).toBe("br.gov.bcb.pix");
    expect(conta["01"]).toBe("12345678901");
    expect(conta["02"]).toBeUndefined();
  });

  it("omite o valor quando não informado", () => {
    const campos = lerCampos(gerarPayloadPix(base));
    expect(campos["54"]).toBeUndefined();
    expect(payloadPixValido(gerarPayloadPix(base))).toBe(true);
  });

  it("trunca nome em 25 e cidade em 15, sem acentos", () => {
    const campos = lerCampos(
      gerarPayloadPix({
        chave: "email@exemplo.com",
        nome: "Mercearia São Sebastião do Paraíso Ltda ME",
        cidade: "São Sebastião do Paraíso",
      }),
    );
    expect(campos["59"]).toBe("Mercearia Sao Sebastiao d");
    expect(campos["59"]).toHaveLength(25);
    expect(campos["60"]).toBe("Sao Sebastiao d");
    expect(campos["60"]).toHaveLength(15);
    expect(/^[\x20-\x7e]*$/.test(campos["59"])).toBe(true);
  });

  it("usa txid e descrição quando informados, limpando caracteres inválidos", () => {
    const payload = gerarPayloadPix({ ...base, txid: "VENDA-123", descricao: "Cupom nº 123" });
    const campos = lerCampos(payload);
    expect(campos["62"]).toBe(campoEmv("05", "VENDA123"));
    expect(lerCampos(campos["26"])["02"]).toBe("Cupom n 123");
    expect(payloadPixValido(payload)).toBe(true);
  });

  it("recusa chave vazia", () => {
    expect(() => gerarPayloadPix({ ...base, chave: "  " })).toThrow();
  });

  it("detecta CRC adulterado", () => {
    const payload = gerarPayloadPix(base);
    const adulterado = payload.slice(0, -4) + (payload.endsWith("0000") ? "FFFF" : "0000");
    expect(payloadPixValido(adulterado)).toBe(false);
  });
});
