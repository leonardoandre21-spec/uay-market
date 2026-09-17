// Testes do grupo compartilhado: sessão relida do banco (lib/auth.ts), login
// sem "tenta em todos" (autenticarPorPin), PIN repetido, segredo de sessão em
// produção (lib/sessao-token.ts), mensagens de banco ocupado (lib/acao.ts) e
// obterConfiguracao sem escrita (lib/consultas.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------- dublês

type UsuarioFalso = {
  id: number;
  nome: string;
  pinHash: string;
  papel: "ADMIN" | "OPERADOR";
  ativo: boolean;
};

const banco = vi.hoisted(() => {
  const usuarios: UsuarioFalso[] = [];
  const configuracao = { linhas: [] as { id: number; nomeLoja: string }[], chamadas: [] as string[] };
  const db = {
    usuario: {
      findUnique: async (args: { where: { id: number }; select?: Record<string, boolean> }) => {
        const u = usuarios.find((x) => x.id === args.where.id);
        if (!u) return null;
        if (!args.select) return { ...u };
        const saida: Record<string, unknown> = {};
        for (const chave of Object.keys(args.select)) saida[chave] = (u as Record<string, unknown>)[chave];
        return saida;
      },
      findMany: async (args: {
        where?: { ativo?: boolean; id?: number | { not: number } };
        orderBy?: unknown;
        take?: number;
        select?: Record<string, boolean>;
      }) => {
        let lista = [...usuarios].sort((a, b) => a.id - b.id);
        const w = args.where ?? {};
        if (w.ativo !== undefined) lista = lista.filter((u) => u.ativo === w.ativo);
        if (typeof w.id === "number") lista = lista.filter((u) => u.id === w.id);
        else if (w.id && typeof w.id === "object") lista = lista.filter((u) => u.id !== (w.id as { not: number }).not);
        if (args.take !== undefined) lista = lista.slice(0, args.take);
        return lista.map((u) => ({ ...u }));
      },
    },
    configuracao: {
      findUnique: async (args: { where: { id: number } }) => {
        configuracao.chamadas.push("findUnique");
        return configuracao.linhas.find((l) => l.id === args.where.id) ?? null;
      },
      upsert: async (args: { where: { id: number }; create: { id: number } }) => {
        configuracao.chamadas.push("upsert");
        let linha = configuracao.linhas.find((l) => l.id === args.where.id);
        if (!linha) {
          linha = { id: args.create.id, nomeLoja: "Uay Market" };
          configuracao.linhas.push(linha);
        }
        return linha;
      },
    },
  };
  return { db, usuarios, configuracao };
});

const cookiesFalsos = vi.hoisted(() => {
  const valores = new Map<string, string>();
  const jar = {
    get: (nome: string) => (valores.has(nome) ? { name: nome, value: valores.get(nome)! } : undefined),
    set: (nome: string, valor: string) => {
      valores.set(nome, valor);
    },
    delete: (nome: string) => {
      valores.delete(nome);
    },
  };
  return { jar, valores };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => cookiesFalsos.jar }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));
vi.mock("@/lib/db", () => ({ db: banco.db }));

import {
  autenticarPorPin,
  exigirAdminAcao,
  exigirSessaoAcao,
  hashPin,
  iniciarSessao,
  obterSessao,
  pinEmUsoPorOutro,
} from "@/lib/auth";
import {
  assinarSessao,
  DURACAO_SESSAO_SEGUNDOS,
  motivoSegredoInvalido,
  NOME_COOKIE_SESSAO,
  TAMANHO_MINIMO_SEGREDO,
  verificarSessao,
} from "@/lib/sessao-token";
import { MENSAGEM_BANCO_OCUPADO, MENSAGEM_ERRO_BANCO, tratarErro } from "@/lib/acao";
import { obterConfiguracao } from "@/lib/consultas";

const HASH_1234 = hashPin("1234");
const HASH_9999 = hashPin("9999");

function usuario(dados: Partial<UsuarioFalso> & { id: number }): UsuarioFalso {
  const u: UsuarioFalso = { nome: `Usuário ${dados.id}`, pinHash: HASH_1234, papel: "OPERADOR", ativo: true, ...dados };
  banco.usuarios.push(u);
  return u;
}

async function logarComo(u: UsuarioFalso) {
  await iniciarSessao({ id: u.id, nome: u.nome, papel: u.papel });
}

beforeEach(() => {
  banco.usuarios.length = 0;
  banco.configuracao.linhas.length = 0;
  banco.configuracao.chamadas.length = 0;
  cookiesFalsos.valores.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- sessão relida do banco

describe("obterSessao relê o usuário no banco a cada chamada", () => {
  it("devolve a sessão com nome e papel do banco enquanto o usuário está ativo", async () => {
    const admin = usuario({ id: 1, nome: "Dono", papel: "ADMIN" });
    await logarComo(admin);
    const sessao = await obterSessao();
    expect(sessao).toMatchObject({ usuarioId: 1, nome: "Dono", papel: "ADMIN" });
    expect(sessao?.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it("usuário desativado depois do login perde a sessão na hora", async () => {
    const joao = usuario({ id: 2, nome: "João" });
    await logarComo(joao);
    expect(await obterSessao()).not.toBeNull();
    joao.ativo = false;
    expect(await obterSessao()).toBeNull();
    await expect(exigirSessaoAcao()).rejects.toThrow("Sessão expirada");
  });

  it("admin rebaixado a operador deixa de passar em exigirAdminAcao com o cookie antigo", async () => {
    const ex = usuario({ id: 3, nome: "Ex-admin", papel: "ADMIN" });
    await logarComo(ex);
    expect((await exigirAdminAcao()).papel).toBe("ADMIN");
    ex.papel = "OPERADOR";
    expect((await exigirSessaoAcao()).papel).toBe("OPERADOR");
    await expect(exigirAdminAcao()).rejects.toThrow("Apenas administradores");
  });

  it("usuário apagado do banco ou cookie adulterado não têm sessão", async () => {
    const u = usuario({ id: 4 });
    await logarComo(u);
    banco.usuarios.length = 0;
    expect(await obterSessao()).toBeNull();

    usuario({ id: 4 });
    const token = cookiesFalsos.valores.get(NOME_COOKIE_SESSAO)!;
    cookiesFalsos.valores.set(NOME_COOKIE_SESSAO, `${token.slice(0, -2)}xx`);
    expect(await obterSessao()).toBeNull();
  });

  it("renomear o usuário aparece na sessão sem novo login", async () => {
    const u = usuario({ id: 5, nome: "Maria" });
    await logarComo(u);
    u.nome = "Maria da Silva";
    expect((await obterSessao())?.nome).toBe("Maria da Silva");
  });
});

// ---------------------------------------------------------------- login por PIN

describe("autenticarPorPin", () => {
  it("com um único usuário ativo, entra sem escolher o nome", async () => {
    usuario({ id: 1, papel: "ADMIN" });
    usuario({ id: 2, ativo: false, pinHash: HASH_9999 });
    expect((await autenticarPorPin("1234"))?.id).toBe(1);
    expect(await autenticarPorPin("9999")).toBeNull();
  });

  it("com mais de um usuário ativo, exige o usuário escolhido (nunca testa o PIN em todos)", async () => {
    usuario({ id: 1, papel: "ADMIN" });
    usuario({ id: 2, nome: "Maria" }); // mesmo PIN 1234 do admin
    expect(await autenticarPorPin("1234")).toBeNull();
    expect((await autenticarPorPin("1234", 2))?.papel).toBe("OPERADOR");
    expect((await autenticarPorPin("1234", 1))?.papel).toBe("ADMIN");
  });

  it("não autentica usuário inativo nem PIN fora do formato", async () => {
    usuario({ id: 1, ativo: false });
    expect(await autenticarPorPin("1234", 1)).toBeNull();
    usuario({ id: 2 });
    expect(await autenticarPorPin("12", 2)).toBeNull();
    expect(await autenticarPorPin("abcd", 2)).toBeNull();
  });
});

describe("pinEmUsoPorOutro", () => {
  it("acha o PIN em outro usuário, inclusive inativo, e ignora o próprio", async () => {
    usuario({ id: 1, papel: "ADMIN" });
    usuario({ id: 2, ativo: false, pinHash: HASH_9999 });
    expect(await pinEmUsoPorOutro("1234")).toBe(true);
    expect(await pinEmUsoPorOutro("1234", 1)).toBe(false);
    expect(await pinEmUsoPorOutro("9999", 1)).toBe(true);
    expect(await pinEmUsoPorOutro("5555")).toBe(false);
  });
});

// ---------------------------------------------------------------- segredo de sessão

describe("segredo de sessão em produção", () => {
  const SEGREDO_BOM = "a".repeat(64);

  it("motivoSegredoInvalido recusa vazio, curto, exemplo e desenvolvimento", () => {
    expect(motivoSegredoInvalido(undefined)).toMatch(/não está definido/);
    expect(motivoSegredoInvalido("x".repeat(TAMANHO_MINIMO_SEGREDO - 1))).toMatch(/curto/);
    expect(motivoSegredoInvalido("troque-por-um-segredo-longo-e-aleatorio")).toMatch(/exemplo/);
    expect(motivoSegredoInvalido("dev-uay-market-3f9a2c7e-0000000000000000000000000000")).toMatch(/exemplo/);
    expect(motivoSegredoInvalido("segredo-de-desenvolvimento-uay-market-troque-em-producao")).toMatch(/exemplo/);
    expect(motivoSegredoInvalido(SEGREDO_BOM)).toBeNull();
  });

  it("assinar com o valor do .env.example em produção lança erro que aponta o conserto", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSAO_SEGREDO", "troque-por-um-segredo-longo-e-aleatorio");
    const dados = { usuarioId: 1, nome: "x", papel: "ADMIN" as const, exp: Math.floor(Date.now() / 1000) + 60 };
    await expect(assinarSessao(dados)).rejects.toThrow(/exemplo[^]*randomBytes/);
  });

  it("com segredo forte em produção assina e verifica; token de outro segredo não vale", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSAO_SEGREDO", SEGREDO_BOM);
    const dados = { usuarioId: 7, nome: "Dono", papel: "ADMIN" as const, exp: Math.floor(Date.now() / 1000) + 60 };
    const token = await assinarSessao(dados);
    expect(await verificarSessao(token)).toEqual(dados);

    vi.stubEnv("SESSAO_SEGREDO", "b".repeat(64));
    expect(await verificarSessao(token)).toBeNull();
  });

  it("token expirado é recusado", async () => {
    const dados = { usuarioId: 7, nome: "Dono", papel: "ADMIN" as const, exp: Math.floor(Date.now() / 1000) - 1 };
    expect(await verificarSessao(await assinarSessao(dados))).toBeNull();
    expect(DURACAO_SESSAO_SEGUNDOS).toBe(14 * 60 * 60);
  });
});

// ---------------------------------------------------------------- erros de banco

describe("tratarErro esconde texto cru do Prisma e explica banco ocupado", () => {
  function erroPrisma(nome: string, mensagem: string, code?: string) {
    const e = new Error(mensagem) as Error & { code?: string; clientVersion: string };
    e.name = nome;
    e.clientVersion = "6.19.3";
    if (code) e.code = code;
    return e;
  }

  it("códigos de banco ocupado viram mensagem fixa em português", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const code of ["P2034", "P2028", "P2024", "P1008"]) {
      const r = tratarErro(erroPrisma("PrismaClientKnownRequestError", "Transaction failed due to a write conflict", code));
      expect(r).toEqual({ ok: false, erro: MENSAGEM_BANCO_OCUPADO, campos: undefined });
    }
  });

  it("database is locked (sem código) também vira banco ocupado", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cru =
      'Invalid `prisma.venda.create()` invocation: Error occurred during query execution: ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(SqliteError { extended_code: 5, message: Some("database is locked") }) })';
    const r = tratarErro(erroPrisma("PrismaClientUnknownRequestError", cru));
    expect(r).toEqual({ ok: false, erro: MENSAGEM_BANCO_OCUPADO, campos: undefined });
    expect(tratarErro(new Error(cru))).toEqual({ ok: false, erro: MENSAGEM_BANCO_OCUPADO, campos: undefined });
  });

  it("outro erro do Prisma não vaza o texto em inglês e vai pro log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = tratarErro(erroPrisma("PrismaClientValidationError", "Argument `nome` is missing."));
    expect(r).toEqual({ ok: false, erro: MENSAGEM_ERRO_BANCO, campos: undefined });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("códigos conhecidos e Error dos serviços continuam como antes", () => {
    expect(tratarErro(erroPrisma("PrismaClientKnownRequestError", "Unique constraint", "P2002")).ok).toBe(false);
    expect((tratarErro(erroPrisma("PrismaClientKnownRequestError", "Unique constraint", "P2002")) as { erro: string }).erro).toMatch(
      /Já existe/,
    );
    expect(tratarErro(new Error("Caixa fechado. Abra o caixa antes de vender."))).toEqual({
      ok: false,
      erro: "Caixa fechado. Abra o caixa antes de vender.",
      campos: undefined,
    });
    expect(tratarErro(new Error("A maquininha respondeu timed out"))).toEqual({
      ok: false,
      erro: "A maquininha respondeu timed out",
      campos: undefined,
    });
    expect(tratarErro("qualquer coisa")).toEqual({ ok: false, erro: "Não foi possível concluir a operação.", campos: undefined });
  });
});

// ---------------------------------------------------------------- configuração sem escrita

describe("obterConfiguracao", () => {
  it("só lê quando a linha existe", async () => {
    banco.configuracao.linhas.push({ id: 1, nomeLoja: "Mercado do Zé" });
    const c = await obterConfiguracao();
    expect(c.nomeLoja).toBe("Mercado do Zé");
    expect(banco.configuracao.chamadas).toEqual(["findUnique"]);
  });

  it("cria a linha uma única vez quando não existe", async () => {
    await obterConfiguracao();
    await obterConfiguracao();
    expect(banco.configuracao.linhas).toHaveLength(1);
    expect(banco.configuracao.chamadas).toEqual(["findUnique", "upsert", "findUnique"]);
  });
});
