// Regras puras do módulo de backup (sem banco, sem Next). Tudo aqui tem
// teste em tests/backup.test.ts. O acesso ao banco fica em backup.ts.
//
// O backup é um JSON com todas as tabelas do schema. A ordem das tabelas, os
// campos de data e as sequências a resetar são derivados do Prisma.dmmf, então
// uma coluna nova no schema entra no backup sem mexer aqui.

import { format } from "date-fns";
import { noFuso } from "@/lib/datas";

// ---------------------------------------------------------------- tipos mínimos do dmmf

/** Subconjunto de DMMF.Field que este módulo lê (o tipo real do Prisma é compatível). */
export type CampoModelo = {
  name: string;
  kind: "scalar" | "object" | "enum" | "unsupported";
  type: string;
  isId?: boolean;
  isList?: boolean;
  isRequired?: boolean;
  hasDefaultValue?: boolean;
  default?: unknown;
  relationFromFields?: readonly string[];
};

/** Subconjunto de DMMF.Model que este módulo lê. */
export type ModeloDmmf = {
  name: string;
  dbName?: string | null;
  fields: readonly CampoModelo[];
};

// ---------------------------------------------------------------- formato do arquivo

export const FORMATO_BACKUP = "uay-market-backup";
export const VERSAO_BACKUP = 1;

export type LinhaBackup = Record<string, unknown>;

export type ArquivoBackup = {
  formato: typeof FORMATO_BACKUP;
  versao: typeof VERSAO_BACKUP;
  geradoEm: string; // ISO
  tabelas: Record<string, LinhaBackup[]>;
};

/** "uay-market-20260916-1430.json" (horário do mercado). */
export function nomeArquivoBackup(data: Date): string {
  return `uay-market-${format(noFuso(data), "yyyyMMdd-HHmm")}.json`;
}

// ---------------------------------------------------------------- ordem das tabelas

/** Relações em que ESTE modelo guarda a chave estrangeira (o lado com `fields: [...]`). */
function modelosDeQueDepende(modelo: ModeloDmmf): string[] {
  const alvos = new Set<string>();
  for (const campo of modelo.fields) {
    if (campo.kind !== "object") continue;
    if (!campo.relationFromFields || campo.relationFromFields.length === 0) continue;
    if (campo.type === modelo.name) continue; // auto-relação não muda a ordem entre tabelas
    alvos.add(campo.type);
  }
  return [...alvos];
}

/**
 * Ordena os modelos pra que toda tabela apareça DEPOIS das tabelas que ela
 * referencia por chave estrangeira (pais antes dos filhos). Inserir nessa
 * ordem nunca viola FK; apagar na ordem inversa também não. Entre modelos
 * independentes, mantém a ordem original do schema (Kahn estável).
 */
export function ordenarModelosPorDependencia<M extends ModeloDmmf>(models: readonly M[]): M[] {
  const porNome = new Map(models.map((m) => [m.name, m]));
  const pendentes = new Map<string, Set<string>>();
  for (const m of models) {
    const deps = modelosDeQueDepende(m).filter((alvo) => {
      if (!porNome.has(alvo)) throw new Error(`O modelo ${m.name} referencia ${alvo}, que não existe no schema.`);
      return true;
    });
    pendentes.set(m.name, new Set(deps));
  }

  const ordenados: M[] = [];
  const colocados = new Set<string>();
  while (ordenados.length < models.length) {
    const prontos = models.filter((m) => !colocados.has(m.name) && pendentes.get(m.name)!.size === 0);
    if (prontos.length === 0) {
      const restantes = models.filter((m) => !colocados.has(m.name)).map((m) => m.name);
      throw new Error(`Há um ciclo de chaves estrangeiras entre as tabelas ${restantes.join(", ")}.`);
    }
    for (const m of prontos) {
      ordenados.push(m);
      colocados.add(m.name);
      for (const deps of pendentes.values()) deps.delete(m.name);
    }
  }
  return ordenados;
}

// ---------------------------------------------------------------- campos por tipo

/** Nomes dos campos DateTime do modelo (só escalares; relações não entram). */
export function camposData(modelo: ModeloDmmf): string[] {
  return modelo.fields.filter((f) => f.kind === "scalar" && f.type === "DateTime").map((f) => f.name);
}

/** Colunas reais da tabela: escalares e enums. Relações (kind "object") são virtuais. */
export function colunasDoModelo(modelo: ModeloDmmf): string[] {
  return modelo.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name);
}

/** Campo que identifica a linha (`id` na maioria; `forma` em ConfiguracaoPagamento). */
export function campoId(modelo: ModeloDmmf): string {
  const campo = modelo.fields.find((f) => f.isId);
  if (!campo) throw new Error(`O modelo ${modelo.name} não tem chave primária simples.`);
  return campo.name;
}

/** Modelos cujo `id` é Int com @default(autoincrement()): só esses têm sequência pra resetar. */
export function modelosComIdAutoincrement<M extends ModeloDmmf>(models: readonly M[]): M[] {
  return models.filter((m) =>
    m.fields.some((f) => {
      if (!f.isId || f.type !== "Int" || !f.hasDefaultValue) return false;
      const padrao = f.default;
      return typeof padrao === "object" && padrao !== null && (padrao as { name?: unknown }).name === "autoincrement";
    }),
  );
}

/** Nome da tabela no Postgres: `@@map` quando existe, senão o nome do modelo. */
export function nomeTabela(modelo: ModeloDmmf): string {
  return modelo.dbName ?? modelo.name;
}

// ---------------------------------------------------------------- datas

/** Exportação: Date vira string ISO (o JSON não tem tipo data). Outros campos passam intactos. */
export function datasParaIso(linhas: readonly LinhaBackup[], campos: readonly string[]): LinhaBackup[] {
  if (campos.length === 0) return linhas.map((l) => ({ ...l }));
  return linhas.map((linha) => {
    const copia: LinhaBackup = { ...linha };
    for (const campo of campos) {
      const valor = copia[campo];
      if (valor instanceof Date) copia[campo] = valor.toISOString();
    }
    return copia;
  });
}

/**
 * Importação: string ISO vira Date nos campos DateTime; null e undefined ficam
 * como estão. Texto que não é data lança erro (em vez de gravar "Invalid Date").
 */
export function converterDatas(linhas: readonly LinhaBackup[], campos: readonly string[]): LinhaBackup[] {
  if (campos.length === 0) return linhas.map((l) => ({ ...l }));
  return linhas.map((linha, indice) => {
    const copia: LinhaBackup = { ...linha };
    for (const campo of campos) {
      const valor = copia[campo];
      if (valor === null || valor === undefined || valor instanceof Date) continue;
      if (typeof valor !== "string" && typeof valor !== "number") {
        throw new Error(`Linha ${indice + 1}: o campo ${campo} deveria ser uma data, mas veio ${typeof valor}.`);
      }
      const data = new Date(valor);
      if (Number.isNaN(data.getTime())) {
        throw new Error(`Linha ${indice + 1}: o campo ${campo} tem uma data inválida ("${String(valor)}").`);
      }
      copia[campo] = data;
    }
    return copia;
  });
}

// ---------------------------------------------------------------- validação do arquivo

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Confere se o JSON é um backup do Uay Market que este sistema sabe ler:
 * formato e versão certos, `tabelas` como objeto, só tabelas conhecidas, cada
 * uma com uma lista de objetos. Lança Error com mensagem pro dono do mercado.
 * Tabela que falta no arquivo é aceita (fica vazia na importação).
 */
export function validarEstruturaBackup(json: unknown, tabelasConhecidas: readonly string[]): ArquivoBackup {
  if (!ehObjeto(json)) {
    throw new Error("O arquivo não tem o formato de um backup do Uay Market (esperava um objeto JSON).");
  }
  if (json.formato !== FORMATO_BACKUP) {
    throw new Error(
      `O arquivo não é um backup do Uay Market (formato "${String(json.formato ?? "ausente")}"). Envie o .json baixado em Configurações > Backup.`,
    );
  }
  if (json.versao !== VERSAO_BACKUP) {
    throw new Error(
      `Este backup é da versão ${String(json.versao ?? "?")} do formato e este sistema lê a versão ${VERSAO_BACKUP}. Atualize o sistema antes de restaurar.`,
    );
  }
  if (typeof json.geradoEm !== "string" || Number.isNaN(new Date(json.geradoEm).getTime())) {
    throw new Error("O arquivo não informa quando foi gerado (campo geradoEm inválido).");
  }
  if (!ehObjeto(json.tabelas)) {
    throw new Error("O arquivo não tem a seção de tabelas.");
  }
  const conhecidas = new Set(tabelasConhecidas);
  const tabelas: Record<string, LinhaBackup[]> = {};
  for (const [nome, linhas] of Object.entries(json.tabelas)) {
    if (!conhecidas.has(nome)) {
      throw new Error(`O arquivo tem a tabela "${nome}", que este sistema não conhece. O backup pode ser de outra versão.`);
    }
    if (!Array.isArray(linhas)) {
      throw new Error(`A tabela ${nome} deveria ser uma lista de linhas.`);
    }
    linhas.forEach((linha, indice) => {
      if (!ehObjeto(linha)) throw new Error(`A tabela ${nome} tem uma linha inválida (posição ${indice + 1}).`);
    });
    tabelas[nome] = linhas as LinhaBackup[];
  }
  return { formato: FORMATO_BACKUP, versao: VERSAO_BACKUP, geradoEm: json.geradoEm, tabelas };
}

/**
 * Confere se cada linha só usa colunas que existem no modelo. Coluna a mais
 * (backup de uma versão mais nova) daria um erro críptico do Prisma no meio
 * da transação; aqui vira uma mensagem clara antes de apagar qualquer coisa.
 */
export function validarColunas(arquivo: ArquivoBackup, modelos: readonly ModeloDmmf[]): void {
  for (const modelo of modelos) {
    const linhas = arquivo.tabelas[modelo.name];
    if (!linhas || linhas.length === 0) continue;
    const permitidas = new Set(colunasDoModelo(modelo));
    for (const linha of linhas) {
      for (const coluna of Object.keys(linha)) {
        if (!permitidas.has(coluna)) {
          throw new Error(
            `A tabela ${modelo.name} tem a coluna "${coluna}", que este sistema não conhece. O backup pode ser de uma versão mais nova; atualize o sistema antes de restaurar.`,
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------- SQL de reset das sequências

const REGEX_NOME_TABELA = /^[A-Za-z_]+$/;

export function nomeTabelaValido(nome: string): boolean {
  return REGEX_NOME_TABELA.test(nome);
}

/**
 * Depois de inserir linhas com os ids originais, a sequência do Postgres
 * continua onde estava e o próximo INSERT colidiria. Este comando a coloca em
 * MAX(id) + 1. O nome vai interpolado (setval não aceita o nome da tabela como
 * parâmetro), por isso a regex fechada antes.
 */
export function montarSqlReset(tabela: string): string {
  if (!nomeTabelaValido(tabela)) {
    throw new Error(`Nome de tabela inválido pra resetar a sequência: "${tabela}".`);
  }
  return `SELECT setval(pg_get_serial_sequence('"${tabela}"', 'id'), COALESCE((SELECT MAX("id") FROM "${tabela}"), 0) + 1, false)`;
}

// ---------------------------------------------------------------- serialização

/**
 * O JSON do backup em pedaços (cabeçalho, uma tabela por pedaço, fechamento),
 * pra rota devolver como stream. No Vercel uma resposta montada de uma vez tem
 * teto de 4,5 MB; a streamada não. `partes.join("")` é um JSON válido igual a
 * `JSON.stringify(arquivo)`.
 */
export function serializarBackupEmPartes(arquivo: ArquivoBackup): string[] {
  const partes: string[] = [
    `{"formato":${JSON.stringify(arquivo.formato)},"versao":${JSON.stringify(arquivo.versao)},"geradoEm":${JSON.stringify(arquivo.geradoEm)},"tabelas":{`,
  ];
  let primeira = true;
  for (const [nome, linhas] of Object.entries(arquivo.tabelas)) {
    partes.push(`${primeira ? "" : ","}${JSON.stringify(nome)}:${JSON.stringify(linhas)}`);
    primeira = false;
  }
  partes.push("}}");
  return partes;
}

// ---------------------------------------------------------------- contagens

/** Total de linhas por tabela, na ordem dada. */
export function contarLinhas(arquivo: ArquivoBackup, ordem: readonly string[]): Record<string, number> {
  const contagens: Record<string, number> = {};
  for (const nome of ordem) contagens[nome] = arquivo.tabelas[nome]?.length ?? 0;
  return contagens;
}
