import { describe, expect, it } from "vitest";
import {
  celulaCsv,
  formatarTamanho,
  lerContentLength,
  pinValido,
  podeDesativarAdmin,
  TAMANHO_MAXIMO_RESTAURACAO,
  tipoTokenMercadoPago,
  type UsuarioResumo,
} from "@/lib/servicos/configuracoes-regras";
import { normalizarChavePix, normalizarTextoPix } from "@/app/(app)/configuracoes/pix/_payload";
import { ADQUIRENTES_SUGERIDAS, ehMercadoPago } from "@/lib/servicos/vendas-calculos";
import { formatarPercentual, parsePercentual } from "@/lib/dinheiro";

describe("pinValido", () => {
  it("aceita só dígitos de 4 a 8", () => {
    expect(pinValido("1234")).toBe(true);
    expect(pinValido("12345678")).toBe(true);
    expect(pinValido("0000")).toBe(true);
  });
  it("rejeita curto, longo, letras e espaços", () => {
    expect(pinValido("123")).toBe(false);
    expect(pinValido("123456789")).toBe(false);
    expect(pinValido("12a4")).toBe(false);
    expect(pinValido("12 34")).toBe(false);
    expect(pinValido("")).toBe(false);
    expect(pinValido(" 1234")).toBe(false);
  });
});

describe("podeDesativarAdmin (regra do último administrador)", () => {
  const lista: UsuarioResumo[] = [
    { id: 1, papel: "ADMIN", ativo: true },
    { id: 2, papel: "OPERADOR", ativo: true },
    { id: 3, papel: "ADMIN", ativo: false },
  ];

  it("bloqueia quando é o único administrador ativo", () => {
    expect(podeDesativarAdmin(lista, 1)).toBe(false);
  });
  it("admin desativado não conta como reserva", () => {
    expect(podeDesativarAdmin(lista, 1)).toBe(false);
  });
  it("libera quando existe outro administrador ativo", () => {
    const comOutro = [...lista, { id: 4, papel: "ADMIN" as const, ativo: true }];
    expect(podeDesativarAdmin(comOutro, 1)).toBe(true);
    expect(podeDesativarAdmin(comOutro, 4)).toBe(true);
  });
  it("operador e admin já inativo podem sempre ser alterados", () => {
    expect(podeDesativarAdmin(lista, 2)).toBe(true);
    expect(podeDesativarAdmin(lista, 3)).toBe(true);
  });
  it("usuário inexistente não pode", () => {
    expect(podeDesativarAdmin(lista, 99)).toBe(false);
    expect(podeDesativarAdmin([], 1)).toBe(false);
  });
});

describe("formatarTamanho", () => {
  it("formata tamanhos", () => {
    expect(formatarTamanho(500)).toBe("500 B");
    expect(formatarTamanho(2048)).toBe("2 KB");
    expect(formatarTamanho(1536 * 1024)).toBe("1,5 MB");
  });
});

describe("limite do arquivo de restauração", () => {
  it("o limite é realista pro banco de um mercado (bem abaixo dos 2 GB antigos)", () => {
    expect(TAMANHO_MAXIMO_RESTAURACAO).toBeGreaterThanOrEqual(50 * 1024 * 1024);
    expect(TAMANHO_MAXIMO_RESTAURACAO).toBeLessThanOrEqual(512 * 1024 * 1024);
  });

  it("lê o Content-Length só quando é um inteiro em dígitos", () => {
    expect(lerContentLength("12345")).toBe(12345);
    expect(lerContentLength(" 42 ")).toBe(42);
    expect(lerContentLength("0")).toBe(0);
    expect(lerContentLength(null)).toBeNull();
    expect(lerContentLength(undefined)).toBeNull();
    expect(lerContentLength("")).toBeNull();
    expect(lerContentLength("-1")).toBeNull();
    expect(lerContentLength("1e9")).toBeNull();
    expect(lerContentLength("12,5")).toBeNull();
    expect(lerContentLength("abc")).toBeNull();
    expect(lerContentLength("1".repeat(16))).toBeNull();
  });

  it("um vídeo de 1,5 GB renomeado pra .json é barrado pelo cabeçalho antes de ler o corpo", () => {
    const tamanho = lerContentLength(String(1.5 * 1024 * 1024 * 1024));
    expect(tamanho).not.toBeNull();
    expect(tamanho! > TAMANHO_MAXIMO_RESTAURACAO).toBe(true);
    // Um backup de 3 MB dentro do multipart passa folgado.
    expect(lerContentLength("3100000")! <= TAMANHO_MAXIMO_RESTAURACAO).toBe(true);
  });
});

describe("tipoTokenMercadoPago", () => {
  it("identifica pelo prefixo sem expor o token", () => {
    expect(tipoTokenMercadoPago(null)).toBeNull();
    expect(tipoTokenMercadoPago("")).toBeNull();
    expect(tipoTokenMercadoPago("APP_USR-123")).toBe("producao");
    expect(tipoTokenMercadoPago("TEST-123")).toBe("teste");
    expect(tipoTokenMercadoPago("xyz")).toBe("desconhecido");
  });
});

describe("cadastro de maquininhas", () => {
  it("sugere as adquirentes do mercado e a opção livre", () => {
    expect(ADQUIRENTES_SUGERIDAS).toContain("InfinitePay");
    expect(ADQUIRENTES_SUGERIDAS).toContain("Sipag");
    expect(ADQUIRENTES_SUGERIDAS).toContain("Mercado Pago");
    expect(ADQUIRENTES_SUGERIDAS[ADQUIRENTES_SUGERIDAS.length - 1]).toBe("Outra");
  });

  it("só a adquirente Mercado Pago libera a integração Point no caixa", () => {
    expect(ADQUIRENTES_SUGERIDAS.filter((a) => ehMercadoPago(a))).toEqual(["Mercado Pago"]);
  });

  it("taxas digitadas no formulário vão e voltam em pontos-base", () => {
    // O formulário mostra "1,39" e a action grava 139 (parsePercentual); a tabela mostra de volta "1,39%".
    expect(parsePercentual("1,39")).toBe(139);
    expect(parsePercentual("4.99")).toBe(499);
    expect(parsePercentual("")).toBeNull();
    expect(parsePercentual("abc")).toBeNull();
    expect(formatarPercentual(139)).toBe("1,39%");
    expect(formatarPercentual(0)).toBe("0,00%");
  });
});

describe("celulaCsv", () => {
  it("escapa ponto e vírgula, aspas e quebras de linha", () => {
    expect(celulaCsv("simples")).toBe("simples");
    expect(celulaCsv(null)).toBe("");
    expect(celulaCsv(42)).toBe("42");
    expect(celulaCsv("a;b")).toBe('"a;b"');
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(celulaCsv("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });
});

describe("normalização dos dados Pix digitados", () => {
  it("normaliza texto sem acento e em maiúsculas", () => {
    expect(normalizarTextoPix("Padaria São João", 25)).toBe("PADARIA SAO JOAO");
    expect(normalizarTextoPix("Extrema", 15)).toBe("EXTREMA");
    expect(normalizarTextoPix("  muitos   espaços ", 25)).toBe("MUITOS ESPACOS");
    expect(normalizarTextoPix("a".repeat(30), 25)).toHaveLength(25);
  });
  it("normaliza chaves dos tipos aceitos", () => {
    expect(normalizarChavePix("123.456.789-01")).toBe("12345678901");
    expect(normalizarChavePix("12.345.678/0001-99")).toBe("12345678000199");
    expect(normalizarChavePix("+55 (35) 99999-9999")).toBe("+5535999999999");
    expect(normalizarChavePix("Dono@Email.com")).toBe("dono@email.com");
    expect(normalizarChavePix("123E4567-E89B-12D3-A456-426614174000")).toBe("123e4567-e89b-12d3-a456-426614174000");
  });
  it("rejeita o que não é chave", () => {
    expect(normalizarChavePix("abc")).toBeNull();
    expect(normalizarChavePix("")).toBeNull();
    expect(normalizarChavePix("+1 555 1234")).toBeNull();
    expect(normalizarChavePix("email-sem-arroba.com")).toBeNull();
    expect(normalizarChavePix("123")).toBeNull();
  });
});
