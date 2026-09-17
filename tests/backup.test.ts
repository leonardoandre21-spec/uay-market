import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  campoId,
  camposData,
  colunasDoModelo,
  contarLinhas,
  converterDatas,
  datasParaIso,
  FORMATO_BACKUP,
  modelosComIdAutoincrement,
  montarSqlReset,
  nomeArquivoBackup,
  nomeTabela,
  nomeTabelaValido,
  ordenarModelosPorDependencia,
  serializarBackupEmPartes,
  validarColunas,
  validarEstruturaBackup,
  VERSAO_BACKUP,
  type ArquivoBackup,
  type CampoModelo,
  type ModeloDmmf,
} from "@/lib/servicos/backup-calculos";

// ---------------------------------------------------------------- dmmf fictício

const id = (extra: Partial<CampoModelo> = {}): CampoModelo => ({
  name: "id",
  kind: "scalar",
  type: "Int",
  isId: true,
  hasDefaultValue: true,
  default: { name: "autoincrement", args: [] },
  ...extra,
});
const escalar = (name: string, type = "String"): CampoModelo => ({ name, kind: "scalar", type });
/** Lado da relação que guarda a FK (fields: [...]). */
const fk = (name: string, alvo: string, coluna: string): CampoModelo => ({
  name,
  kind: "object",
  type: alvo,
  relationFromFields: [coluna],
});
/** Lado inverso da relação (lista ou opcional sem fields). */
const inversa = (name: string, alvo: string): CampoModelo => ({
  name,
  kind: "object",
  type: alvo,
  isList: true,
  relationFromFields: [],
});

const modelo = (name: string, fields: CampoModelo[], dbName: string | null = null): ModeloDmmf => ({
  name,
  dbName,
  fields,
});

// Grafo: Avo <- Pai <- Filho <- Neto; Filho também aponta pra Avo; Solto não depende de nada.
const FICTICIO: ModeloDmmf[] = [
  modelo("Neto", [id(), escalar("filhoId", "Int"), fk("filho", "Filho", "filhoId")]),
  modelo("Filho", [
    id(),
    escalar("paiId", "Int"),
    fk("pai", "Pai", "paiId"),
    escalar("avoId", "Int"),
    fk("avo", "Avo", "avoId"),
    inversa("netos", "Neto"),
  ]),
  modelo("Solto", [id(), escalar("nome")]),
  modelo("Pai", [id(), escalar("avoId", "Int"), fk("avo", "Avo", "avoId"), inversa("filhos", "Filho")]),
  modelo("Avo", [id(), inversa("pais", "Pai"), inversa("filhos", "Filho")]),
];

describe("ordenarModelosPorDependencia", () => {
  it("coloca todo pai antes dos filhos (ordem topológica pelas FKs)", () => {
    const ordem = ordenarModelosPorDependencia(FICTICIO).map((m) => m.name);
    const pos = (n: string) => ordem.indexOf(n);
    expect(ordem).toHaveLength(FICTICIO.length);
    expect(pos("Avo")).toBeLessThan(pos("Pai"));
    expect(pos("Pai")).toBeLessThan(pos("Filho"));
    expect(pos("Avo")).toBeLessThan(pos("Filho"));
    expect(pos("Filho")).toBeLessThan(pos("Neto"));
  });

  it("é estável: entre modelos prontos, mantém a ordem do schema", () => {
    const ordem = ordenarModelosPorDependencia(FICTICIO).map((m) => m.name);
    // Solto e Avo não dependem de ninguém; Solto vem antes no schema fictício.
    expect(ordem.slice(0, 2)).toEqual(["Solto", "Avo"]);
    expect(ordem).toEqual(["Solto", "Avo", "Pai", "Filho", "Neto"]);
  });

  it("relações inversas (sem relationFromFields) não criam dependência", () => {
    const soInversas = [
      modelo("A", [id(), inversa("bs", "B")]),
      modelo("B", [id(), escalar("aId", "Int"), fk("a", "A", "aId")]),
    ];
    expect(ordenarModelosPorDependencia(soInversas).map((m) => m.name)).toEqual(["A", "B"]);
  });

  it("auto-relação não conta como ciclo", () => {
    const auto = [modelo("Categoria", [id(), escalar("paiId", "Int"), fk("pai", "Categoria", "paiId")])];
    expect(ordenarModelosPorDependencia(auto).map((m) => m.name)).toEqual(["Categoria"]);
  });

  it("ciclo real lança erro em português com os nomes envolvidos", () => {
    const ciclo = [
      modelo("A", [id(), escalar("bId", "Int"), fk("b", "B", "bId")]),
      modelo("B", [id(), escalar("aId", "Int"), fk("a", "A", "aId")]),
    ];
    expect(() => ordenarModelosPorDependencia(ciclo)).toThrow(/ciclo de chaves estrangeiras.*A, B/);
  });

  it("referência a modelo inexistente lança erro", () => {
    const quebrado = [modelo("A", [id(), escalar("xId", "Int"), fk("x", "Fantasma", "xId")])];
    expect(() => ordenarModelosPorDependencia(quebrado)).toThrow(/Fantasma/);
  });

  it("no schema real do Uay Market, toda tabela vem depois das que referencia", () => {
    const models = Prisma.dmmf.datamodel.models;
    const ordem = ordenarModelosPorDependencia(models);
    expect(ordem).toHaveLength(models.length);
    const pos = new Map(ordem.map((m, i) => [m.name, i]));
    for (const m of ordem) {
      for (const f of m.fields) {
        if (f.kind !== "object" || !f.relationFromFields?.length || f.type === m.name) continue;
        expect(pos.get(f.type)!, `${f.type} deveria vir antes de ${m.name}`).toBeLessThan(pos.get(m.name)!);
      }
    }
    // Sanidade nos casos que importam: Venda depois de Usuario/SessaoCaixa/Cliente, itens depois da Venda.
    expect(pos.get("Usuario")!).toBeLessThan(pos.get("Venda")!);
    expect(pos.get("SessaoCaixa")!).toBeLessThan(pos.get("Venda")!);
    expect(pos.get("Venda")!).toBeLessThan(pos.get("ItemVenda")!);
    expect(pos.get("Perda")!).toBeLessThan(pos.get("MovimentoEstoque")!);
    expect(pos.get("ContaPagar")!).toBeLessThan(pos.get("Despesa")!);
  });
});

describe("campos derivados do dmmf", () => {
  it("camposData pega só escalares DateTime", () => {
    const m = modelo("X", [
      id(),
      escalar("criadoEm", "DateTime"),
      escalar("nome"),
      escalar("validade", "DateTime"),
      { name: "dono", kind: "object", type: "DateTime", relationFromFields: ["donoId"] },
    ]);
    expect(camposData(m)).toEqual(["criadoEm", "validade"]);
  });

  it("colunasDoModelo inclui escalares e enums, exclui relações", () => {
    const m = modelo("X", [
      id(),
      escalar("nome"),
      { name: "papel", kind: "enum", type: "Papel" },
      fk("dono", "Usuario", "donoId"),
      inversa("filhos", "Y"),
    ]);
    expect(colunasDoModelo(m)).toEqual(["id", "nome", "papel"]);
  });

  it("campoId acha a chave primária, inclusive quando não se chama id", () => {
    expect(campoId(modelo("X", [id(), escalar("nome")]))).toBe("id");
    const cfg = modelo("ConfiguracaoPagamento", [{ name: "forma", kind: "enum", type: "FormaPagamento", isId: true }]);
    expect(campoId(cfg)).toBe("forma");
    expect(() => campoId(modelo("SemId", [escalar("a")]))).toThrow(/chave primária/);
  });

  it("modelosComIdAutoincrement exclui id fixo e chave enum", () => {
    const lista = [
      modelo("Venda", [id()]),
      modelo("Configuracao", [id({ default: 1 })]),
      modelo("ConfiguracaoPagamento", [{ name: "forma", kind: "enum", type: "FormaPagamento", isId: true }]),
      modelo("SemDefault", [id({ hasDefaultValue: false, default: undefined })]),
    ];
    expect(modelosComIdAutoincrement(lista).map((m) => m.name)).toEqual(["Venda"]);
  });

  it("no schema real, só Configuracao e ConfiguracaoPagamento ficam fora do reset de sequência", () => {
    const todos = Prisma.dmmf.datamodel.models.map((m) => m.name);
    const comSequencia = modelosComIdAutoincrement(Prisma.dmmf.datamodel.models).map((m) => m.name);
    const semSequencia = todos.filter((n) => !comSequencia.includes(n));
    expect(semSequencia.sort()).toEqual(["Configuracao", "ConfiguracaoPagamento"]);
  });

  it("nomeTabela usa @@map quando existe", () => {
    expect(nomeTabela(modelo("Venda", [id()]))).toBe("Venda");
    expect(nomeTabela(modelo("Venda", [id()], "vendas"))).toBe("vendas");
  });
});

describe("conversão de datas", () => {
  it("exportação: Date vira ISO só nos campos indicados", () => {
    const d = new Date("2026-09-16T17:30:05.000Z");
    const linhas = [{ id: 1, criadoEm: d, nome: "x", validade: null }];
    const saida = datasParaIso(linhas, ["criadoEm", "validade"]);
    expect(saida).toEqual([{ id: 1, criadoEm: "2026-09-16T17:30:05.000Z", nome: "x", validade: null }]);
    // Não altera a linha original.
    expect(linhas[0].criadoEm).toBe(d);
  });

  it("importação: string ISO vira Date, null fica null, outros campos passam intactos", () => {
    const saida = converterDatas(
      [{ id: 1, criadoEm: "2026-09-16T17:30:05.000Z", validade: null, nome: "x" }],
      ["criadoEm", "validade"],
    );
    expect(saida[0].criadoEm).toBeInstanceOf(Date);
    expect((saida[0].criadoEm as Date).toISOString()).toBe("2026-09-16T17:30:05.000Z");
    expect(saida[0].validade).toBeNull();
    expect(saida[0].nome).toBe("x");
    expect(saida[0].id).toBe(1);
  });

  it("importação: campo ausente fica ausente (o Prisma aplica o default)", () => {
    const saida = converterDatas([{ id: 1 }], ["criadoEm"]);
    expect("criadoEm" in saida[0]).toBe(false);
  });

  it("importação: data inválida ou tipo errado lança erro apontando a linha", () => {
    expect(() => converterDatas([{ id: 1, criadoEm: "ontem" }], ["criadoEm"])).toThrow(/Linha 1.*criadoEm.*inválida/);
    expect(() => converterDatas([{ id: 1 }, { id: 2, criadoEm: true }], ["criadoEm"])).toThrow(/Linha 2.*criadoEm/);
  });

  it("sem campos de data, devolve cópias sem mexer", () => {
    const linhas = [{ id: 1, nome: "a" }];
    expect(converterDatas(linhas, [])).toEqual(linhas);
    expect(datasParaIso(linhas, [])).toEqual(linhas);
    expect(converterDatas(linhas, [])[0]).not.toBe(linhas[0]);
  });
});

describe("validarEstruturaBackup", () => {
  const CONHECIDAS = ["Usuario", "Produto", "Venda"];
  const valido = (): unknown => ({
    formato: FORMATO_BACKUP,
    versao: VERSAO_BACKUP,
    geradoEm: "2026-09-17T12:00:00.000Z",
    tabelas: { Usuario: [{ id: 1, nome: "Admin" }], Produto: [] },
  });

  it("aceita um arquivo válido e devolve a estrutura tipada", () => {
    const r = validarEstruturaBackup(valido(), CONHECIDAS);
    expect(r.formato).toBe(FORMATO_BACKUP);
    expect(r.versao).toBe(1);
    expect(r.tabelas.Usuario).toHaveLength(1);
    expect(r.tabelas.Produto).toEqual([]);
    expect(r.tabelas.Venda).toBeUndefined(); // tabela ausente é permitida (fica vazia)
  });

  it("rejeita o que não é objeto", () => {
    expect(() => validarEstruturaBackup(null, CONHECIDAS)).toThrow(/formato de um backup/);
    expect(() => validarEstruturaBackup([], CONHECIDAS)).toThrow(/formato de um backup/);
    expect(() => validarEstruturaBackup("texto", CONHECIDAS)).toThrow(/formato de um backup/);
  });

  it("rejeita formato errado com mensagem em português", () => {
    const json = { ...(valido() as object), formato: "outro-sistema" };
    expect(() => validarEstruturaBackup(json, CONHECIDAS)).toThrow(/não é um backup do Uay Market.*outro-sistema/);
    const semFormato = { ...(valido() as object), formato: undefined };
    expect(() => validarEstruturaBackup(semFormato, CONHECIDAS)).toThrow(/ausente/);
  });

  it("rejeita versão diferente da que o sistema lê", () => {
    const json = { ...(valido() as object), versao: 2 };
    expect(() => validarEstruturaBackup(json, CONHECIDAS)).toThrow(/versão 2.*lê a versão 1/);
  });

  it("rejeita geradoEm inválido e tabelas ausentes", () => {
    expect(() => validarEstruturaBackup({ ...(valido() as object), geradoEm: "nunca" }, CONHECIDAS)).toThrow(/geradoEm/);
    expect(() => validarEstruturaBackup({ ...(valido() as object), tabelas: [] }, CONHECIDAS)).toThrow(/seção de tabelas/);
  });

  it("rejeita tabela desconhecida", () => {
    const json = valido() as { tabelas: Record<string, unknown> };
    json.tabelas.Estranha = [];
    expect(() => validarEstruturaBackup(json, CONHECIDAS)).toThrow(/tabela "Estranha".*não conhece/);
  });

  it("rejeita tabela que não é lista e linha que não é objeto", () => {
    const a = valido() as { tabelas: Record<string, unknown> };
    a.tabelas.Produto = { id: 1 };
    expect(() => validarEstruturaBackup(a, CONHECIDAS)).toThrow(/Produto deveria ser uma lista/);
    const b = valido() as { tabelas: Record<string, unknown> };
    b.tabelas.Produto = [{ id: 1 }, 7];
    expect(() => validarEstruturaBackup(b, CONHECIDAS)).toThrow(/Produto tem uma linha inválida \(posição 2\)/);
  });
});

describe("validarColunas", () => {
  const modelos = [modelo("Usuario", [id(), escalar("nome"), { name: "papel", kind: "enum", type: "Papel" }])];
  const arquivo = (linhas: Record<string, unknown>[]): ArquivoBackup => ({
    formato: FORMATO_BACKUP,
    versao: VERSAO_BACKUP,
    geradoEm: "2026-09-17T12:00:00.000Z",
    tabelas: { Usuario: linhas },
  });

  it("aceita colunas conhecidas e linhas com menos colunas", () => {
    expect(() => validarColunas(arquivo([{ id: 1, nome: "a", papel: "ADMIN" }, { id: 2 }]), modelos)).not.toThrow();
    expect(() => validarColunas(arquivo([]), modelos)).not.toThrow();
  });

  it("rejeita coluna desconhecida (backup de versão mais nova)", () => {
    expect(() => validarColunas(arquivo([{ id: 1, nome: "a", telefone: "x" }]), modelos)).toThrow(
      /Usuario tem a coluna "telefone".*não conhece/,
    );
  });
});

describe("reset de sequência", () => {
  it("aceita só letras e sublinhado no nome da tabela", () => {
    expect(nomeTabelaValido("Venda")).toBe(true);
    expect(nomeTabelaValido("ItemVenda")).toBe(true);
    expect(nomeTabelaValido("conta_pagar")).toBe(true);
    expect(nomeTabelaValido("")).toBe(false);
    expect(nomeTabelaValido("Venda2")).toBe(false);
    expect(nomeTabelaValido('Venda"; DROP TABLE "Venda')).toBe(false);
    expect(nomeTabelaValido("Venda; --")).toBe(false);
    expect(nomeTabelaValido("Ven da")).toBe(false);
    expect(nomeTabelaValido("public.Venda")).toBe(false);
  });

  it("monta o SQL esperado e recusa nome inválido", () => {
    expect(montarSqlReset("Venda")).toBe(
      `SELECT setval(pg_get_serial_sequence('"Venda"', 'id'), COALESCE((SELECT MAX("id") FROM "Venda"), 0) + 1, false)`,
    );
    expect(() => montarSqlReset('Venda"; DROP TABLE "Venda')).toThrow(/Nome de tabela inválido/);
    expect(() => montarSqlReset("")).toThrow(/Nome de tabela inválido/);
  });

  it("todas as tabelas do schema real passam na regex", () => {
    for (const m of Prisma.dmmf.datamodel.models) {
      expect(nomeTabelaValido(nomeTabela(m)), m.name).toBe(true);
    }
  });
});

describe("serializarBackupEmPartes", () => {
  const arquivo: ArquivoBackup = {
    formato: FORMATO_BACKUP,
    versao: VERSAO_BACKUP,
    geradoEm: "2026-09-17T12:00:00.000Z",
    tabelas: {
      Usuario: [{ id: 1, nome: 'Ana "a"', criadoEm: "2026-09-16T17:30:05.000Z", ultimoAcesso: null }],
      Produto: [],
      Venda: [{ id: 1 }, { id: 2 }],
    },
  };

  it("junta num JSON idêntico ao JSON.stringify do objeto", () => {
    const partes = serializarBackupEmPartes(arquivo);
    expect(partes.join("")).toBe(JSON.stringify(arquivo));
    expect(JSON.parse(partes.join(""))).toEqual(arquivo);
  });

  it("uma tabela por pedaço, mais cabeçalho e fechamento", () => {
    const partes = serializarBackupEmPartes(arquivo);
    expect(partes).toHaveLength(2 + 3);
    expect(partes[0].startsWith('{"formato":"uay-market-backup"')).toBe(true);
    expect(partes[partes.length - 1]).toBe("}}");
  });

  it("sem tabelas também é JSON válido", () => {
    const vazio = { ...arquivo, tabelas: {} };
    expect(JSON.parse(serializarBackupEmPartes(vazio).join(""))).toEqual(vazio);
  });
});

describe("nome do arquivo e contagens", () => {
  it("nome do arquivo usa o horário do mercado e termina em .json", () => {
    const data = new Date("2026-09-16T17:30:05Z"); // 14:30:05 em São Paulo
    expect(nomeArquivoBackup(data)).toBe("uay-market-20260916-1430.json");
  });

  it("contarLinhas segue a ordem pedida e zera tabela ausente", () => {
    const arquivo: ArquivoBackup = {
      formato: FORMATO_BACKUP,
      versao: VERSAO_BACKUP,
      geradoEm: "2026-09-17T12:00:00.000Z",
      tabelas: { Venda: [{ id: 1 }, { id: 2 }], Usuario: [{ id: 1 }] },
    };
    expect(contarLinhas(arquivo, ["Usuario", "Venda", "Produto"])).toEqual({ Usuario: 1, Venda: 2, Produto: 0 });
  });
});
