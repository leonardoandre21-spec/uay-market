import { describe, expect, it } from "vitest";
import {
  aplicarPercentual,
  calcularTaxa,
  custoMedioPonderado,
  formatarQuantidade,
  formatarReais,
  margemPontosBase,
  markupPontosBase,
  parsePercentual,
  parseQuantidade,
  parseReais,
  totalLinha,
} from "@/lib/dinheiro";

describe("formatarReais", () => {
  it("formata centavos em reais com separadores brasileiros", () => {
    expect(formatarReais(0)).toBe("R$ 0,00");
    expect(formatarReais(5)).toBe("R$ 0,05");
    expect(formatarReais(1250)).toBe("R$ 12,50");
    expect(formatarReais(123456)).toBe("R$ 1.234,56");
    expect(formatarReais(100000000)).toBe("R$ 1.000.000,00");
    expect(formatarReais(-1999)).toBe("-R$ 19,99");
    expect(formatarReais(1999, false)).toBe("19,99");
  });
});

describe("parseReais", () => {
  it("aceita os formatos que um operador digita", () => {
    expect(parseReais("12,50")).toBe(1250);
    expect(parseReais("12.50")).toBe(1250);
    expect(parseReais("12,5")).toBe(1250);
    expect(parseReais("1.234,56")).toBe(123456);
    expect(parseReais("R$ 1.234,56")).toBe(123456);
    expect(parseReais("1234")).toBe(123400);
    expect(parseReais("0,05")).toBe(5);
    expect(parseReais("-3,00")).toBe(-300);
    expect(parseReais(12.5)).toBe(1250);
  });
  it("rejeita lixo", () => {
    expect(parseReais("")).toBeNull();
    expect(parseReais("abc")).toBeNull();
    expect(parseReais("1,234")).toBeNull();
    expect(parseReais(null)).toBeNull();
  });
});

describe("quantidades em milésimos", () => {
  it("converte e formata", () => {
    expect(parseQuantidade("2")).toBe(2000);
    expect(parseQuantidade("0,350")).toBe(350);
    expect(parseQuantidade("1.5")).toBe(1500);
    expect(parseQuantidade("1,5 kg")).toBe(1500);
    expect(parseQuantidade("0,3505")).toBeNull();
    expect(formatarQuantidade(2000, "UN")).toBe("2");
    expect(formatarQuantidade(350, "KG")).toBe("0,350");
    expect(formatarQuantidade(1500, "UN")).toBe("1,500");
    expect(formatarQuantidade(-1000, "UN")).toBe("-1");
  });
});

describe("cálculos", () => {
  it("total de linha arredonda corretamente", () => {
    expect(totalLinha(2000, 1250)).toBe(2500); // 2 x 12,50
    expect(totalLinha(350, 2990)).toBe(1047); // 0,350 kg x 29,90 = 10,465 -> 10,47
    expect(totalLinha(333, 1000)).toBe(333);
  });
  it("percentuais em pontos-base", () => {
    expect(aplicarPercentual(10000, 1000)).toBe(1000); // 10% de 100,00
    expect(aplicarPercentual(9999, 199)).toBe(199); // 1,99% de 99,99 = 1,9898 -> 1,99
    expect(parsePercentual("1,99")).toBe(199);
    expect(parsePercentual("10")).toBe(1000);
  });
  it("margem e markup", () => {
    expect(margemPontosBase(1000, 600)).toBe(4000); // 40%
    expect(markupPontosBase(1000, 600)).toBe(6667); // 66,67%
    expect(margemPontosBase(0, 600)).toBe(0);
    expect(markupPontosBase(1000, 0)).toBe(0);
  });
  it("custo médio ponderado", () => {
    // 10 un a 5,00 + 10 un a 7,00 = 6,00
    expect(custoMedioPonderado(10000, 500, 10000, 700)).toBe(600);
    // estoque zerado: assume custo da entrada
    expect(custoMedioPonderado(0, 500, 5000, 700)).toBe(700);
    // estoque negativo (vendeu sem estoque): assume custo da entrada
    expect(custoMedioPonderado(-2000, 500, 5000, 700)).toBe(700);
    // entrada zero: mantém
    expect(custoMedioPonderado(10000, 500, 0, 700)).toBe(500);
  });
  it("taxa de pagamento", () => {
    expect(calcularTaxa(10000, 399, 0)).toBe(399);
    expect(calcularTaxa(10000, 0, 50)).toBe(50);
    expect(calcularTaxa(0, 399, 50)).toBe(0);
  });
});
