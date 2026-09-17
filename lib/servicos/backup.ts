import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ClienteDb } from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  camposData,
  campoId,
  contarLinhas,
  converterDatas,
  datasParaIso,
  FORMATO_BACKUP,
  modelosComIdAutoincrement,
  montarSqlReset,
  nomeTabela,
  ordenarModelosPorDependencia,
  validarColunas,
  validarEstruturaBackup,
  VERSAO_BACKUP,
  type ArquivoBackup,
  type LinhaBackup,
} from "@/lib/servicos/backup-calculos";

// Backup do banco em JSON. Em produção o banco fica no Neon (com restauração
// por ponto no tempo própria); este módulo é a cópia que o dono baixa toda
// semana e o caminho pra voltar um arquivo num sistema vazio. Não há disco
// persistente no Vercel, então nada é gravado em pasta: exporta direto na
// resposta e importa direto do upload.

/** Todos os modelos do schema, pais antes dos filhos (ordem de inserção). */
const MODELOS = ordenarModelosPorDependencia(Prisma.dmmf.datamodel.models);
const NOMES_MODELOS = MODELOS.map((m) => m.name);

/** Linhas por createMany: folga grande pro limite de 65.535 parâmetros do Postgres. */
const LOTE_INSERCAO = 500;

type DelegadoGenerico = {
  findMany(args: { orderBy: Record<string, "asc"> }): Promise<LinhaBackup[]>;
  deleteMany(): Promise<{ count: number }>;
  createMany(args: { data: LinhaBackup[]; skipDuplicates: boolean }): Promise<{ count: number }>;
};

/** `tx.venda`, `tx.itemVenda`...: a propriedade do client é o nome do modelo com a inicial minúscula. */
function delegado(tx: ClienteDb, nomeModelo: string): DelegadoGenerico {
  const chave = nomeModelo.charAt(0).toLowerCase() + nomeModelo.slice(1);
  const alvo = (tx as unknown as Record<string, DelegadoGenerico | undefined>)[chave];
  if (!alvo) throw new Error(`O Prisma Client não expõe o modelo ${nomeModelo}.`);
  return alvo;
}

// ---------------------------------------------------------------- exportar

/**
 * Lê todas as tabelas num mesmo instante (transação só de leitura em
 * REPEATABLE READ, pra uma venda que entra no meio não aparecer em Venda sem
 * aparecer em ItemVenda) e devolve o objeto pronto pra virar JSON.
 */
export async function exportarBackup(usuarioId: number): Promise<ArquivoBackup> {
  const tabelas: Record<string, LinhaBackup[]> = {};
  await db.$transaction(
    async (tx) => {
      for (const modelo of MODELOS) {
        const linhas = await delegado(tx, modelo.name).findMany({ orderBy: { [campoId(modelo)]: "asc" } });
        tabelas[modelo.name] = datasParaIso(linhas, camposData(modelo));
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 },
  );
  const arquivo: ArquivoBackup = {
    formato: FORMATO_BACKUP,
    versao: VERSAO_BACKUP,
    geradoEm: new Date().toISOString(),
    tabelas,
  };
  await registrarAuditoria({
    usuarioId,
    acao: "backup.exportar",
    entidade: "Backup",
    detalhes: { geradoEm: arquivo.geradoEm, contagens: contarLinhas(arquivo, NOMES_MODELOS) },
  });
  return arquivo;
}

// ---------------------------------------------------------------- importar

/**
 * Substitui TODO o banco pelo conteúdo do arquivo, numa transação só: apaga
 * as tabelas dos filhos pros pais, insere dos pais pros filhos mantendo os
 * ids originais e recoloca as sequências em MAX(id) + 1. Se qualquer passo
 * falhar, nada muda. Devolve quantas linhas entraram em cada tabela.
 *
 * A auditoria é gravada DEPOIS da transação: dentro dela seria apagada junto
 * com a tabela Auditoria. Se o usuário que restaurou não existe no backup,
 * a linha fica sem usuário (o id vai nos detalhes).
 */
export async function importarBackup(json: unknown, usuarioId: number): Promise<Record<string, number>> {
  const arquivo = validarEstruturaBackup(json, NOMES_MODELOS);
  validarColunas(arquivo, MODELOS);

  const contagens: Record<string, number> = {};
  await db.$transaction(
    async (tx) => {
      for (const modelo of [...MODELOS].reverse()) {
        await delegado(tx, modelo.name).deleteMany();
      }
      for (const modelo of MODELOS) {
        let linhas: LinhaBackup[];
        try {
          linhas = converterDatas(arquivo.tabelas[modelo.name] ?? [], camposData(modelo));
        } catch (e) {
          throw new Error(`Tabela ${modelo.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
        let inseridas = 0;
        for (let i = 0; i < linhas.length; i += LOTE_INSERCAO) {
          const lote = linhas.slice(i, i + LOTE_INSERCAO);
          try {
            const r = await delegado(tx, modelo.name).createMany({ data: lote, skipDuplicates: false });
            inseridas += r.count;
          } catch (e) {
            throw new Error(
              `Não foi possível gravar a tabela ${modelo.name} (linhas ${i + 1} a ${i + lote.length}). ${resumirErroPrisma(e)}`,
            );
          }
        }
        contagens[modelo.name] = inseridas;
      }
      for (const modelo of modelosComIdAutoincrement(MODELOS)) {
        await tx.$executeRawUnsafe(montarSqlReset(nomeTabela(modelo)));
      }
    },
    { timeout: 120000, maxWait: 15000 },
  );

  const usuarioAindaExiste = await db.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } });
  await registrarAuditoria({
    usuarioId: usuarioAindaExiste ? usuarioId : null,
    acao: "backup.importar",
    entidade: "Backup",
    detalhes: { geradoEm: arquivo.geradoEm, contagens, restauradoPorUsuarioId: usuarioId },
  });
  return contagens;
}

/** Primeira linha útil de um erro do Prisma, sem o stack, pra mostrar ao dono junto com a tabela. */
function resumirErroPrisma(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return "Há linhas repetidas (mesmo id ou mesmo valor único) no arquivo.";
    if (e.code === "P2003") return "Uma linha aponta pra um registro que não está no arquivo (chave estrangeira).";
    return `Erro ${e.code} do banco.`;
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    return "Uma coluna obrigatória está faltando ou com o tipo errado no arquivo.";
  }
  if (e instanceof Error) return e.message.split("\n").find((l) => l.trim()) ?? "Erro desconhecido.";
  return "Erro desconhecido.";
}

// ---------------------------------------------------------------- histórico

export type RegistroBackup = {
  em: Date;
  usuario: string | null;
  contagens: Record<string, number> | null;
};

async function ultimoRegistro(acao: "backup.exportar" | "backup.importar"): Promise<RegistroBackup | null> {
  const linha = await db.auditoria.findFirst({
    where: { acao },
    orderBy: { criadoEm: "desc" },
    include: { usuario: { select: { nome: true } } },
  });
  if (!linha) return null;
  let contagens: Record<string, number> | null = null;
  if (linha.detalhes) {
    try {
      const detalhes = JSON.parse(linha.detalhes) as { contagens?: Record<string, number> };
      contagens = detalhes.contagens ?? null;
    } catch {
      contagens = null;
    }
  }
  return { em: linha.criadoEm, usuario: linha.usuario?.nome ?? null, contagens };
}

/** Última vez que alguém baixou o backup (auditoria backup.exportar). */
export function ultimoBackupExportado(): Promise<RegistroBackup | null> {
  return ultimoRegistro("backup.exportar");
}

/** Última restauração feita a partir de um arquivo (auditoria backup.importar). */
export function ultimaRestauracao(): Promise<RegistroBackup | null> {
  return ultimoRegistro("backup.importar");
}

/** Nomes das tabelas na ordem do backup (pra tela mostrar as contagens na mesma ordem). */
export function tabelasDoBackup(): string[] {
  return [...NOMES_MODELOS];
}
