import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  aplicarPercentual as aplicarPercentualLib,
  calcularTaxa as calcularTaxaLib,
  custoMedioPonderado as custoMedioPonderadoLib,
  totalLinha as totalLinhaLib,
} from "@/lib/dinheiro";
import { codigoBarrasValido, cpfValido } from "@/lib/utils";
import {
  Aleatorio,
  aplicarPercentual,
  arredondarParaNota,
  atribuirMaquininhasDemo,
  calcularTaxa,
  cnpjValido,
  custoMedioPonderado,
  dataLocal,
  diaDaSemana,
  diaLocalDe,
  digitoEan13,
  gerarCnpj,
  gerarCpf,
  gerarEan13,
  limparDadosDemo,
  MAQUININHAS_DEMO,
  MARCA_DEMO,
  marcarDemo,
  mulberry32,
  OPERADORES_DEMO,
  seedDemoLiberado,
  somarDias,
  taxaMaquininhaDemo,
  temMarcaDemo,
  totalLinha,
  VARIAVEL_LIBERACAO,
} from "@/prisma/seed-demo";

describe("gerador pseudoaleatório", () => {
  it("é determinístico com a mesma semente", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const sequenciaA = Array.from({ length: 10 }, () => a());
    const sequenciaB = Array.from({ length: 10 }, () => b());
    expect(sequenciaA).toEqual(sequenciaB);
    expect(sequenciaA.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it("muda com a semente", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it("inteiro fica dentro do intervalo fechado e escolha ponderada respeita pesos", () => {
    const rng = new Aleatorio(7);
    for (let i = 0; i < 500; i++) {
      const n = rng.inteiro(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
    let pesados = 0;
    for (let i = 0; i < 1000; i++) if (rng.ponderado(["leve", "pesado"], (x) => (x === "pesado" ? 9 : 1)) === "pesado") pesados++;
    expect(pesados).toBeGreaterThan(800);
    expect(pesados).toBeLessThan(980);
  });
});

describe("códigos de barras EAN-13", () => {
  it("calcula o dígito verificador do exemplo clássico", () => {
    expect(digitoEan13("400638133393")).toBe(1);
    expect(() => digitoEan13("123")).toThrow();
  });

  it("gera códigos brasileiros válidos segundo lib/utils", () => {
    const rng = new Aleatorio(123);
    const codigos = Array.from({ length: 200 }, () => gerarEan13(rng));
    for (const c of codigos) {
      expect(c).toMatch(/^789\d{10}$/);
      expect(codigoBarrasValido(c)).toBe(true);
    }
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});

describe("CPF e CNPJ", () => {
  it("gera CPFs válidos segundo lib/utils", () => {
    const rng = new Aleatorio(99);
    for (let i = 0; i < 200; i++) {
      const cpf = gerarCpf(rng);
      expect(cpf).toMatch(/^\d{11}$/);
      expect(cpfValido(cpf)).toBe(true);
    }
  });

  it("gera CNPJs formatados e válidos", () => {
    const rng = new Aleatorio(5);
    for (let i = 0; i < 100; i++) {
      const cnpj = gerarCnpj(rng);
      expect(cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/0001-\d{2}$/);
      expect(cnpjValido(cnpj)).toBe(true);
    }
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-80")).toBe(false);
    expect(cnpjValido("00.000.000/0000-00")).toBe(false);
  });
});

describe("cópias de lib/dinheiro.ts batem com a original", () => {
  it("custoMedioPonderado", () => {
    const casos: Array<[number, number, number, number]> = [
      [0, 0, 10000, 500],
      [-2000, 300, 5000, 400],
      [10000, 500, 10000, 700],
      [3000, 1234, 1500, 999],
      [1, 1, 1, 1],
      [5000, 800, 0, 900],
    ];
    for (const [estoque, custo, qtd, custoEntrada] of casos) {
      expect(custoMedioPonderado(estoque, custo, qtd, custoEntrada)).toBe(custoMedioPonderadoLib(estoque, custo, qtd, custoEntrada));
    }
  });

  it("totalLinha, aplicarPercentual e calcularTaxa", () => {
    expect(totalLinha(1250, 3290)).toBe(totalLinhaLib(1250, 3290));
    expect(totalLinha(3000, 399)).toBe(1197);
    expect(aplicarPercentual(10000, 399)).toBe(aplicarPercentualLib(10000, 399));
    expect(calcularTaxa(4567, 199, 0)).toBe(calcularTaxaLib(4567, 199, 0));
    expect(calcularTaxa(0, 199, 50)).toBe(0);
  });
});

describe("dinheiro entregue no caixa", () => {
  it("nunca é menor que o total e, quando maior, é nota redonda", () => {
    const rng = new Aleatorio(2024);
    for (let i = 0; i < 300; i++) {
      const total = rng.inteiro(100, 30000);
      const recebido = arredondarParaNota(total, rng);
      expect(recebido).toBeGreaterThanOrEqual(total);
      if (recebido !== total) expect(recebido % 500).toBe(0);
    }
  });
});

describe("datas no fuso do mercado (-03:00)", () => {
  it("converte hora local pra UTC somando 3 horas", () => {
    expect(dataLocal({ ano: 2026, mes: 9, dia: 16 }, 8, 0).toISOString()).toBe("2026-09-16T11:00:00.000Z");
    expect(dataLocal({ ano: 2026, mes: 9, dia: 16 }, 22, 30).toISOString()).toBe("2026-09-17T01:30:00.000Z");
  });

  it("descobre o dia civil local de um instante UTC", () => {
    expect(diaLocalDe(new Date("2026-09-17T01:30:00.000Z"))).toEqual({ ano: 2026, mes: 9, dia: 16 });
    expect(diaLocalDe(new Date("2026-09-16T03:00:00.000Z"))).toEqual({ ano: 2026, mes: 9, dia: 16 });
    expect(diaLocalDe(new Date("2026-09-16T02:59:59.000Z"))).toEqual({ ano: 2026, mes: 9, dia: 15 });
  });

  it("soma dias atravessando mês e ano", () => {
    expect(somarDias({ ano: 2026, mes: 9, dia: 16 }, -60)).toEqual({ ano: 2026, mes: 7, dia: 18 });
    expect(somarDias({ ano: 2026, mes: 12, dia: 30 }, 3)).toEqual({ ano: 2027, mes: 1, dia: 2 });
  });

  it("sabe o dia da semana", () => {
    expect(diaDaSemana({ ano: 2026, mes: 9, dia: 16 })).toBe(3); // quarta-feira
    expect(diaDaSemana({ ano: 2026, mes: 9, dia: 13 })).toBe(0); // domingo
  });
});

// ---------------------------------------------------------------- proteção do banco do mercado

describe("liberação do seed de demonstração", () => {
  it("só libera com PERMITIR_SEED_DEMO=1", () => {
    expect(VARIAVEL_LIBERACAO).toBe("PERMITIR_SEED_DEMO");
    expect(seedDemoLiberado({})).toBe(false);
    expect(seedDemoLiberado({ NODE_ENV: "development" })).toBe(false);
    expect(seedDemoLiberado({ PERMITIR_SEED_DEMO: "" })).toBe(false);
    expect(seedDemoLiberado({ PERMITIR_SEED_DEMO: "0" })).toBe(false);
    expect(seedDemoLiberado({ PERMITIR_SEED_DEMO: "true" })).toBe(false);
    expect(seedDemoLiberado({ PERMITIR_SEED_DEMO: "1" })).toBe(true);
  });
});

describe("marca de demonstração", () => {
  it("prefixa o texto e reconhece só o que tem a marca na frente", () => {
    expect(marcarDemo()).toBe(MARCA_DEMO);
    expect(marcarDemo(null)).toBe(MARCA_DEMO);
    expect(marcarDemo("Frete rateado")).toBe("[demo] Frete rateado");
    expect(temMarcaDemo(marcarDemo())).toBe(true);
    expect(temMarcaDemo(marcarDemo("Vizinha do mercado"))).toBe(true);
    expect(temMarcaDemo(null)).toBe(false);
    expect(temMarcaDemo("Aluguel do ponto")).toBe(false);
    expect(temMarcaDemo("[demonstração] outra coisa")).toBe(false);
    // O filtro Prisma usa startsWith(MARCA_DEMO): tudo que marcarDemo produz começa pela marca.
    expect(marcarDemo("x").startsWith(MARCA_DEMO)).toBe(true);
  });
});

// ---------------------------------------------------------------- banco falso

interface Chamada {
  modelo: string;
  metodo: string;
  args: Record<string, unknown>;
}

type Resposta = (args: Record<string, unknown>, chamadas: Chamada[]) => unknown;

/** PrismaClient de mentira: registra cada chamada e devolve o que o teste programou (ou um padrão vazio). */
function criarDbFalso(respostas: Record<string, Resposta> = {}) {
  const chamadas: Chamada[] = [];
  let sequencia = 100;
  const padrao = (metodo: string, args: Record<string, unknown>): unknown => {
    if (metodo === "findMany" || metodo === "groupBy") return [];
    if (metodo === "count") return 0;
    if (metodo === "findFirst") return null;
    if (metodo === "create") return { id: ++sequencia, ...(args.data as object) };
    if (metodo === "deleteMany" || metodo === "updateMany") return { count: 0 };
    return {};
  };
  const modelo = (nome: string) =>
    new Proxy(
      {},
      {
        get: (_alvo, metodo: string) => (args: Record<string, unknown> = {}) => {
          chamadas.push({ modelo: nome, metodo, args });
          const resposta = respostas[`${nome}.${metodo}`];
          return Promise.resolve(resposta ? resposta(args, chamadas) : padrao(metodo, args));
        },
      },
    );
  const db = new Proxy(
    {},
    {
      get: (_alvo, nome: string) => {
        if (nome === "$transaction") {
          return async (operacoes: unknown) => {
            chamadas.push({ modelo: "$transaction", metodo: "", args: { operacoes } });
            return Array.isArray(operacoes) ? Promise.all(operacoes) : [];
          };
        }
        return modelo(nome);
      },
    },
  );
  const de = (modeloNome: string, metodo: string) => chamadas.filter((c) => c.modelo === modeloNome && c.metodo === metodo);
  return { db: db as unknown as PrismaClient, chamadas, de };
}

const idsOperadores = [{ id: 7 }, { id: 8 }];

// ---------------------------------------------------------------- --maquininhas

describe("atribuirMaquininhasDemo não toca em vendas reais", () => {
  it("num banco sem operadores de demonstração não cria maquininha nem lê pagamento", async () => {
    const { db, de } = criarDbFalso();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await atribuirMaquininhasDemo(db);
    expect(de("usuario", "findMany")[0].args.where).toEqual({ nome: { in: OPERADORES_DEMO.map((o) => o.nome) } });
    expect(de("maquininha", "create")).toHaveLength(0);
    expect(de("pagamento", "findMany")).toHaveLength(0);
    expect(de("$transaction", "")).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("limita aos cartões das vendas dos operadores demo, não desmarca a maquininha padrão real e usa a taxa da maquininha", async () => {
    const pendente = { id: 1, vendaId: 10, forma: "CREDITO", parcelas: 1, valor: 10000 };
    const { db, de } = criarDbFalso({
      "usuario.findMany": () => idsOperadores,
      "maquininha.count": () => 1, // já existe uma padrão (a real do mercado)
      "pagamento.findMany": () => [pendente],
      "pagamento.groupBy": () => [{ vendaId: 10, _sum: { taxaValor: 349 } }],
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await atribuirMaquininhasDemo(db);

    // Só pagamentos DEBITO/CREDITO sem maquininha, de vendas dos operadores demo.
    const busca = de("pagamento", "findMany")[0].args.where as Record<string, unknown>;
    expect(busca.maquininhaId).toBeNull();
    expect(busca.forma).toEqual({ in: ["DEBITO", "CREDITO"] });
    expect(busca.venda).toEqual({ usuarioId: { in: [7, 8] } });

    // Maquininhas demo criadas com a marca e sem roubar o "padrão" de quem já era.
    const criadas = de("maquininha", "create").map((c) => c.args.data as Record<string, unknown>);
    expect(criadas.map((m) => m.nome)).toEqual(MAQUININHAS_DEMO.map((m) => m.nome));
    expect(criadas.every((m) => m.padrao === false)).toBe(true);
    expect(criadas.every((m) => temMarcaDemo(m.observacao as string))).toBe(true);
    expect(de("maquininha", "updateMany")).toHaveLength(0);

    // A taxa gravada é a da maquininha sorteada, e o NSU tem 6 dígitos.
    const atualizacoes = de("pagamento", "update");
    expect(atualizacoes).toHaveLength(1);
    const dados = atualizacoes[0].args.data as Record<string, unknown>;
    const escolhida = MAQUININHAS_DEMO.find((m) => m.taxaCredito === dados.taxaPercentual);
    expect(escolhida).toBeDefined();
    expect(dados.taxaValor).toBe(calcularTaxa(10000, taxaMaquininhaDemo(escolhida!, "CREDITO", 1), 0));
    expect(String(dados.nsu)).toMatch(/^\d{6}$/);
    expect(de("venda", "update")[0].args).toEqual({ where: { id: 10 }, data: { taxasTotal: 349 } });
    vi.restoreAllMocks();
  });

  it("num banco sem maquininha padrão a InfinitePay demo vira a padrão", async () => {
    const { db, de } = criarDbFalso({ "usuario.findMany": () => idsOperadores, "maquininha.count": () => 0 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await atribuirMaquininhasDemo(db);
    const criadas = de("maquininha", "create").map((c) => (c.args.data as Record<string, unknown>).padrao);
    expect(criadas).toEqual([true, false]);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------- --limpar

describe("limparDadosDemo identifica pela marca, nunca por nome", () => {
  const nomesNoFiltro = (chamadas: Chamada[]) =>
    chamadas.filter((c) => c.metodo === "findMany").filter((c) => {
      const where = JSON.stringify(c.args.where ?? {});
      return where.includes('"nome"') || where.includes('"descricao":{"in"');
    });

  it("sem nada marcado não apaga nada", async () => {
    const { db, de, chamadas } = criarDbFalso({ "usuario.findMany": () => idsOperadores });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await limparDadosDemo(db);
    expect(de("$transaction", "")).toHaveLength(0);
    expect(chamadas.some((c) => c.metodo === "deleteMany")).toBe(false);
    expect(log.mock.calls[0][0]).toContain(MARCA_DEMO);
    // Produtos, fornecedores, clientes, sessões e entradas são achados pela marca.
    expect(de("produto", "findMany")[0].args.where).toEqual({ descricao: { startsWith: MARCA_DEMO } });
    expect(de("fornecedor", "findMany")[0].args.where).toEqual({ observacao: { startsWith: MARCA_DEMO } });
    expect(de("cliente", "findMany")[0].args.where).toEqual({ observacao: { startsWith: MARCA_DEMO } });
    expect(de("sessaoCaixa", "findMany")[0].args.where).toEqual({ observacao: { startsWith: MARCA_DEMO } });
    expect(de("entradaEstoque", "findMany")[0].args.where).toEqual({ observacao: { startsWith: MARCA_DEMO } });
    // Nenhuma busca de produto, cliente, fornecedor ou despesa usa nome/descrição em lista.
    expect(nomesNoFiltro(chamadas).map((c) => c.modelo)).toEqual(["usuario"]);
    vi.restoreAllMocks();
  });

  it("aborta inteira quando há venda real com produto de demonstração", async () => {
    const { db, de } = criarDbFalso({
      "usuario.findMany": () => idsOperadores,
      "produto.findMany": () => [{ id: 1 }, { id: 2 }],
      "sessaoCaixa.findMany": () => [{ id: 3 }],
      "venda.findMany": () => [{ id: 50 }],
      "venda.count": () => 2,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(limparDadosDemo(db)).rejects.toThrow(/cancelada/);
    expect(de("$transaction", "")).toHaveLength(0);
    // A venda real é a que está fora das sessões demo (ou sem sessão) e usa produto ou cliente demo.
    const where = de("venda", "count")[0].args.where as Record<string, unknown>;
    expect(where.OR).toEqual([{ sessaoId: null }, { sessaoId: { notIn: [3] } }]);
    expect(JSON.stringify(where.AND)).toContain('"produtoId":{"in":[1,2]}');
    vi.restoreAllMocks();
  });

  it("aborta quando há ajuste de estoque real em produto de demonstração", async () => {
    const { db, de } = criarDbFalso({
      "usuario.findMany": () => idsOperadores,
      "produto.findMany": () => [{ id: 1 }],
      "movimentoEstoque.count": () => 1,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(limparDadosDemo(db)).rejects.toThrow(/cancelada/);
    expect(de("$transaction", "")).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("sem conflito apaga só vendas das sessões demo e os cadastros marcados", async () => {
    const { db, de, chamadas } = criarDbFalso({
      "usuario.findMany": () => idsOperadores,
      "produto.findMany": () => [{ id: 1 }, { id: 2 }],
      "fornecedor.findMany": () => [{ id: 11 }],
      "cliente.findMany": () => [{ id: 21 }],
      "sessaoCaixa.findMany": () => [{ id: 3 }, { id: 4 }],
      "venda.findMany": () => [{ id: 50 }, { id: 51 }],
      "entradaEstoque.findMany": () => [{ id: 31 }],
      "contaPagar.findMany": () => [{ id: 41 }],
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await limparDadosDemo(db);

    expect(de("$transaction", "")).toHaveLength(1);
    // Vendas demo = vendas das sessões marcadas; nunca "vendas que têm produto X".
    expect(de("venda", "findMany")[0].args.where).toEqual({ sessaoId: { in: [3, 4] } });
    expect(de("venda", "deleteMany")[0].args.where).toEqual({ id: { in: [50, 51] } });
    expect(de("itemVenda", "deleteMany")[0].args.where).toEqual({ vendaId: { in: [50, 51] } });
    expect(de("produto", "deleteMany")[0].args.where).toEqual({ id: { in: [1, 2] } });
    expect(de("cliente", "deleteMany")[0].args.where).toEqual({ id: { in: [21] } });
    expect(de("fornecedor", "deleteMany")[0].args.where).toEqual({ id: { in: [11] } });
    // Despesas: pela marca, pela sessão demo ou pelo boleto demo. Nunca pela descrição.
    const despesas = JSON.stringify(de("despesa", "deleteMany")[0].args.where);
    expect(despesas).toContain(`"observacao":{"startsWith":"${MARCA_DEMO}"}`);
    expect(despesas).not.toContain('"descricao"');
    // Auditoria: só dos registros demo e do login dos operadores demo.
    const auditoria = de("auditoria", "deleteMany")[0].args.where as { OR: Record<string, unknown>[] };
    expect(auditoria.OR).toEqual([
      { entidade: "Venda", entidadeId: { in: [50, 51] } },
      { entidade: "SessaoCaixa", entidadeId: { in: [3, 4] } },
      { acao: "sessao.entrar", usuarioId: { in: [7, 8] } },
    ]);
    // Usuários, categorias, maquininhas e configuração ficam.
    for (const modelo of ["usuario", "categoria", "categoriaDespesa", "maquininha", "configuracao", "configuracaoPagamento"]) {
      expect(de(modelo, "deleteMany")).toHaveLength(0);
    }
    expect(nomesNoFiltro(chamadas).map((c) => c.modelo)).toEqual(["usuario"]);
    vi.restoreAllMocks();
  });
});
