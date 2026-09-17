import { beforeEach, describe, expect, it, vi } from "vitest";

// Testa o ciclo pagar -> desfazer -> pagar de uma conta mensal em cima de um
// banco falso em memória (só as operações que pagarConta/desfazerPagamento usam).

type Registro = Record<string, unknown> & { id: number };
type Tabela = "contaPagar" | "despesa" | "auditoria";

const banco = vi.hoisted(() => {
  const tabelas: Record<string, Registro[]> = { contaPagar: [], despesa: [], auditoria: [] };
  const sequencias: Record<string, number> = { contaPagar: 0, despesa: 0, auditoria: 0 };
  const padroes: Record<string, Record<string, unknown>> = {
    contaPagar: {
      fornecedorId: null,
      categoriaId: null,
      status: "PENDENTE",
      dataPagamento: null,
      valorPago: null,
      formaPagamento: null,
      linhaDigitavel: null,
      recorrencia: null,
      diaVencimento: null,
      parcelaAtual: null,
      totalParcelas: null,
      entradaId: null,
      observacao: null,
    },
    despesa: { categoriaId: null, fornecedorId: null, contaPagarId: null, sessaoId: null, formaPagamento: null, observacao: null, pagoDoCaixa: false },
    auditoria: {},
  };

  function valorDe(v: unknown): number | string | null {
    if (v instanceof Date) return v.getTime();
    return v as number | string | null;
  }

  function casaCampo(atual: unknown, filtro: unknown): boolean {
    if (filtro !== null && typeof filtro === "object" && !(filtro instanceof Date)) {
      const f = filtro as Record<string, unknown>;
      const a = valorDe(atual);
      if ("not" in f && valorDe(atual) === valorDe(f.not)) return false;
      if ("in" in f && !(f.in as unknown[]).map(valorDe).includes(a)) return false;
      if ("gt" in f && !(a !== null && a > valorDe(f.gt)!)) return false;
      if ("gte" in f && !(a !== null && a >= valorDe(f.gte)!)) return false;
      if ("lt" in f && !(a !== null && a < valorDe(f.lt)!)) return false;
      if ("lte" in f && !(a !== null && a <= valorDe(f.lte)!)) return false;
      return true;
    }
    return valorDe(atual) === valorDe(filtro);
  }

  function casa(registro: Registro, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([campo, filtro]) => casaCampo(registro[campo], filtro));
  }

  function ordenar(lista: Registro[], orderBy: unknown): Registro[] {
    const regras = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Record<string, "asc" | "desc">[];
    return [...lista].sort((a, b) => {
      for (const regra of regras) {
        for (const [campo, direcao] of Object.entries(regra)) {
          const x = valorDe(a[campo]) ?? 0;
          const y = valorDe(b[campo]) ?? 0;
          if (x === y) continue;
          const r = x < y ? -1 : 1;
          return direcao === "desc" ? -r : r;
        }
      }
      return 0;
    });
  }

  function montar(tabela: Tabela, registro: Registro, projecao: Record<string, unknown> | undefined): Registro {
    const saida: Registro = { ...registro };
    if (tabela === "contaPagar" && projecao && "despesa" in projecao) {
      saida.despesa = tabelas.despesa.find((d) => d.contaPagarId === registro.id) ?? null;
      const despesa = saida.despesa as Registro | null;
      if (despesa) saida.despesa = { ...despesa, sessao: null };
    }
    return saida;
  }

  function modelo(tabela: Tabela) {
    return {
      findUnique: async (args: { where: { id: number }; include?: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const r = tabelas[tabela].find((x) => x.id === args.where.id);
        return r ? montar(tabela, r, args.include ?? args.select) : null;
      },
      findFirst: async (args: { where?: Record<string, unknown>; orderBy?: unknown; include?: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const r = ordenar(tabelas[tabela].filter((x) => casa(x, args.where)), args.orderBy)[0];
        return r ? montar(tabela, r, args.include ?? args.select) : null;
      },
      findMany: async (args: { where?: Record<string, unknown>; orderBy?: unknown } = {}) => {
        return ordenar(tabelas[tabela].filter((x) => casa(x, args.where)), args.orderBy).map((r) => montar(tabela, r, undefined));
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const registro: Registro = { ...padroes[tabela], ...args.data, id: ++sequencias[tabela], criadoEm: new Date() };
        tabelas[tabela].push(registro);
        return { ...registro };
      },
      update: async (args: { where: { id: number }; data: Record<string, unknown> }) => {
        const r = tabelas[tabela].find((x) => x.id === args.where.id);
        if (!r) throw new Error(`registro ${tabela}#${args.where.id} não existe`);
        Object.assign(r, args.data);
        return { ...r };
      },
      delete: async (args: { where: { id: number } }) => {
        const i = tabelas[tabela].findIndex((x) => x.id === args.where.id);
        if (i < 0) throw new Error(`registro ${tabela}#${args.where.id} não existe`);
        const [removido] = tabelas[tabela].splice(i, 1);
        return { ...removido };
      },
    };
  }

  const db = {
    contaPagar: modelo("contaPagar"),
    despesa: modelo("despesa"),
    auditoria: modelo("auditoria"),
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };

  function limpar() {
    for (const t of Object.keys(tabelas)) {
      tabelas[t].length = 0;
      sequencias[t] = 0;
    }
  }

  return { db, tabelas, limpar };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: banco.db }));

import { paraDataInput, parseDataInput } from "@/lib/datas";
import { desfazerPagamento, pagarConta } from "@/lib/servicos/financeiro";

function dia(texto: string): Date {
  const d = parseDataInput(texto);
  if (!d) throw new Error(`data inválida no teste: ${texto}`);
  return d;
}

const USUARIO = 1;

async function criarContaMensal(dados: Partial<Record<string, unknown>> = {}) {
  return banco.db.contaPagar.create({
    data: {
      descricao: "Aluguel",
      valor: 200_000,
      vencimento: dia("2026-09-10"),
      status: "PENDENTE",
      recorrencia: "MENSAL",
      diaVencimento: 10,
      ...dados,
    },
  });
}

function pagamento(valorPago = 200_000) {
  return { dataPagamento: dia("2026-09-10"), valorPago, formaPagamento: "PIX" as const, pagoDoCaixa: false, observacao: null };
}

function contasDeOutubro(status = "PENDENTE") {
  return banco.tabelas.contaPagar.filter((c) => c.status === status && paraDataInput(c.vencimento as Date).startsWith("2026-10"));
}

beforeEach(() => banco.limpar());

describe("pagarConta / desfazerPagamento em conta mensal", () => {
  it("pagar cria a conta do mês seguinte uma única vez", async () => {
    const conta = await criarContaMensal();
    const r = await pagarConta(conta.id, pagamento(), USUARIO);
    expect(r.proxima).not.toBeNull();
    expect(r.proximaJaExistia).toBe(false);
    expect(paraDataInput(r.proxima!.vencimento)).toBe("2026-10-10");
    const outubro = contasDeOutubro();
    expect(outubro).toHaveLength(1);
    expect(outubro[0]).toMatchObject({ descricao: "Aluguel", valor: 200_000, recorrencia: "MENSAL", diaVencimento: 10, linhaDigitavel: null });
    expect(banco.tabelas.despesa).toHaveLength(1);
  });

  it("pagar -> desfazer -> pagar deixa exatamente uma conta futura e uma despesa", async () => {
    const conta = await criarContaMensal();
    await pagarConta(conta.id, pagamento(210_000), USUARIO);
    expect(contasDeOutubro()).toHaveLength(1);

    const desfeito = await desfazerPagamento(conta.id, USUARIO);
    expect(desfeito.proximaApagadaId).not.toBeNull();
    expect(desfeito.aviso).toContain("também foi removida");
    expect(contasDeOutubro()).toHaveLength(0);
    expect(banco.tabelas.despesa).toHaveLength(0);
    expect(banco.tabelas.contaPagar.find((c) => c.id === conta.id)).toMatchObject({ status: "PENDENTE", valorPago: null, dataPagamento: null });

    const r = await pagarConta(conta.id, pagamento(200_000), USUARIO);
    expect(r.proximaJaExistia).toBe(false);
    expect(contasDeOutubro()).toHaveLength(1);
    expect(banco.tabelas.despesa).toHaveLength(1);
    expect(banco.tabelas.despesa[0]).toMatchObject({ contaPagarId: conta.id, valor: 200_000 });
    expect(banco.tabelas.contaPagar).toHaveLength(2);
  });

  it("se o dono mexeu na conta seguinte, desfazer não a apaga e pagar de novo a reaproveita", async () => {
    const conta = await criarContaMensal();
    const pago = await pagarConta(conta.id, pagamento(), USUARIO);
    await banco.db.contaPagar.update({ where: { id: pago.proxima!.id }, data: { valor: 220_000 } });

    const desfeito = await desfazerPagamento(conta.id, USUARIO);
    expect(desfeito.proximaApagadaId).toBeNull();
    expect(desfeito.aviso).toContain("continua cadastrada");
    expect(contasDeOutubro()).toHaveLength(1);

    const r = await pagarConta(conta.id, pagamento(), USUARIO);
    expect(r.proximaJaExistia).toBe(true);
    expect(r.proxima!.id).toBe(pago.proxima!.id);
    expect(contasDeOutubro()).toHaveLength(1);
    expect(contasDeOutubro()[0].valor).toBe(220_000);
  });

  it("conta seguinte com linha digitável preenchida não é apagada no desfazer", async () => {
    const conta = await criarContaMensal();
    const pago = await pagarConta(conta.id, pagamento(), USUARIO);
    await banco.db.contaPagar.update({ where: { id: pago.proxima!.id }, data: { linhaDigitavel: "23793.38128 60000.000003 00000.000400 1 99990000200000" } });
    const desfeito = await desfazerPagamento(conta.id, USUARIO);
    expect(desfeito.proximaApagadaId).toBeNull();
    expect(contasDeOutubro()).toHaveLength(1);
  });

  it("conta seguinte movida pra outro dia do mesmo mês fica no desfazer e é reaproveitada no pagar", async () => {
    const conta = await criarContaMensal();
    const pago = await pagarConta(conta.id, pagamento(), USUARIO);
    await banco.db.contaPagar.update({ where: { id: pago.proxima!.id }, data: { vencimento: dia("2026-10-15") } });
    const desfeito = await desfazerPagamento(conta.id, USUARIO);
    expect(desfeito.proximaApagadaId).toBeNull();
    const r = await pagarConta(conta.id, pagamento(), USUARIO);
    expect(r.proximaJaExistia).toBe(true);
    expect(contasDeOutubro()).toHaveLength(1);
    expect(paraDataInput(contasDeOutubro()[0].vencimento as Date)).toBe("2026-10-15");
  });

  it("conta seguinte já paga fica intacta no desfazer e não é duplicada ao pagar de novo", async () => {
    const setembro = await criarContaMensal();
    const pago = await pagarConta(setembro.id, pagamento(), USUARIO);
    const outubro = pago.proxima!.id;
    await pagarConta(outubro, { ...pagamento(), dataPagamento: dia("2026-10-10") }, USUARIO);
    expect(banco.tabelas.contaPagar).toHaveLength(3); // set (PAGA), out (PAGA), nov (PENDENTE)

    const desfeito = await desfazerPagamento(setembro.id, USUARIO);
    expect(desfeito.proximaApagadaId).toBeNull();
    expect(desfeito.aviso).toBeNull();
    expect(banco.tabelas.contaPagar.find((c) => c.id === outubro)).toMatchObject({ status: "PAGA" });

    const r = await pagarConta(setembro.id, pagamento(), USUARIO);
    expect(r.proximaJaExistia).toBe(true);
    expect(r.proxima!.id).toBe(outubro);
    expect(banco.tabelas.contaPagar).toHaveLength(3);
    expect(contasDeOutubro("PAGA")).toHaveLength(1);
    expect(contasDeOutubro("PENDENTE")).toHaveLength(0);
  });

  it("conta seguinte cancelada pelo dono não conta como existente: pagar de novo cria outra", async () => {
    const conta = await criarContaMensal();
    const pago = await pagarConta(conta.id, pagamento(), USUARIO);
    await banco.db.contaPagar.update({ where: { id: pago.proxima!.id }, data: { status: "CANCELADA" } });
    const desfeito = await desfazerPagamento(conta.id, USUARIO);
    expect(desfeito.aviso).toBeNull();
    const r = await pagarConta(conta.id, pagamento(), USUARIO);
    expect(r.proximaJaExistia).toBe(false);
    expect(contasDeOutubro("PENDENTE")).toHaveLength(1);
    expect(contasDeOutubro("CANCELADA")).toHaveLength(1);
  });

  it("duas contas mensais com a mesma descrição em dias diferentes geram cada uma a sua", async () => {
    const dia5 = await criarContaMensal({ vencimento: dia("2026-09-05"), diaVencimento: 5 });
    const dia20 = await criarContaMensal({ vencimento: dia("2026-09-20"), diaVencimento: 20 });
    await pagarConta(dia20.id, pagamento(), USUARIO);
    const r = await pagarConta(dia5.id, pagamento(), USUARIO);
    expect(r.proximaJaExistia).toBe(false);
    expect(contasDeOutubro().map((c) => paraDataInput(c.vencimento as Date)).sort()).toEqual(["2026-10-05", "2026-10-20"]);
  });

  it("contas com fornecedor ou categoria diferentes não se confundem", async () => {
    const a = await criarContaMensal({ fornecedorId: 1 });
    const b = await criarContaMensal({ fornecedorId: 2 });
    await pagarConta(a.id, pagamento(), USUARIO);
    const r = await pagarConta(b.id, pagamento(), USUARIO);
    expect(r.proximaJaExistia).toBe(false);
    expect(contasDeOutubro()).toHaveLength(2);
  });

  it("conta antiga sem dia guardado passa pelo ciclo sem duplicar e grava o dia", async () => {
    const conta = await criarContaMensal({ diaVencimento: null });
    await pagarConta(conta.id, pagamento(), USUARIO);
    await desfazerPagamento(conta.id, USUARIO);
    expect(contasDeOutubro()).toHaveLength(0);
    await pagarConta(conta.id, pagamento(), USUARIO);
    const outubro = contasDeOutubro();
    expect(outubro).toHaveLength(1);
    expect(outubro[0].diaVencimento).toBe(10);
  });

  it("conta sem recorrência não gera próxima nem aviso", async () => {
    const conta = await criarContaMensal({ recorrencia: null, diaVencimento: null });
    const pago = await pagarConta(conta.id, pagamento(), USUARIO);
    expect(pago.proxima).toBeNull();
    const desfeito = await desfazerPagamento(conta.id, USUARIO);
    expect(desfeito.aviso).toBeNull();
    expect(desfeito.proximaApagadaId).toBeNull();
    expect(banco.tabelas.contaPagar).toHaveLength(1);
  });

  it("pagar duas vezes sem desfazer é recusado", async () => {
    const conta = await criarContaMensal();
    await pagarConta(conta.id, pagamento(), USUARIO);
    await expect(pagarConta(conta.id, pagamento(), USUARIO)).rejects.toThrow("já está paga");
    expect(contasDeOutubro()).toHaveLength(1);
  });
});
