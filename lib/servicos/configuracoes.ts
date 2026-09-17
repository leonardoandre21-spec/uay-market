import "server-only";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Papel, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { obterConfiguracao, type ClienteDb } from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirAdminAcao, hashPin, pinEmUsoPorOutro, verificarPin, type Sessao } from "@/lib/auth";
import { executar, type Resultado } from "@/lib/acao";
import { agora } from "@/lib/datas";
import {
  backupDesatualizado,
  backupsExcedentes,
  caminhoParaSql,
  ehBackupAutomaticoOuManual,
  gerarNomeBackup,
  gerarNomeRestauracao,
  MANTER_BACKUPS,
  MANTER_RESTAURACOES,
  nomeBackupValido,
  podeDesativarAdmin,
} from "@/lib/servicos/configuracoes-regras";

// Acesso ao banco e ao disco do módulo de configurações. Regras puras ficam
// em configuracoes-regras.ts (com teste).

// ---------------------------------------------------------------- sessão

/**
 * Primeira linha de toda action deste módulo: exige administrador e devolve a
 * sessão como Resultado, pra a action poder validar campos antes de gravar sem
 * nunca lançar pro cliente.
 */
export async function sessaoAdmin(): Promise<Resultado<Sessao>> {
  return executar(exigirAdminAcao);
}

// ---------------------------------------------------------------- configuração geral

export type DadosConfiguracao = Omit<Prisma.ConfiguracaoUncheckedUpdateInput, "id" | "atualizadoEm">;

/** Salva campos na linha única (id = 1), criando a linha com padrões se ainda não existir. */
export async function salvarConfiguracao(dados: DadosConfiguracao, tx: ClienteDb = db) {
  await obterConfiguracao(tx);
  return tx.configuracao.update({ where: { id: 1 }, data: dados });
}

export { obterConfiguracao };

// ---------------------------------------------------------------- usuários

export type UsuarioListado = {
  id: number;
  nome: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: Date;
  ultimoAcesso: Date | null;
};

/**
 * Todos os usuários (ativos e inativos) com a data do último login.
 * Lê `Usuario.ultimoAcesso` (gravado no login); quem ainda não tem o campo
 * preenchido cai no último `sessao.entrar` da auditoria.
 */
export async function listarUsuariosComUltimoAcesso(): Promise<UsuarioListado[]> {
  const usuarios = await db.usuario.findMany({ orderBy: [{ ativo: "desc" }, { nome: "asc" }] });
  const semRegistro = usuarios.filter((u) => u.ultimoAcesso === null).map((u) => u.id);
  const acessos = semRegistro.length
    ? await db.auditoria.groupBy({
        by: ["usuarioId"],
        where: { acao: "sessao.entrar", usuarioId: { in: semRegistro } },
        _max: { criadoEm: true },
      })
    : [];
  const ultimoPorUsuario = new Map<number, Date>();
  for (const a of acessos) {
    if (a.usuarioId !== null && a._max.criadoEm) ultimoPorUsuario.set(a.usuarioId, a._max.criadoEm);
  }
  return usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    papel: u.papel,
    ativo: u.ativo,
    criadoEm: u.criadoEm,
    ultimoAcesso: u.ultimoAcesso ?? ultimoPorUsuario.get(u.id) ?? null,
  }));
}

/** PIN igual ao de outra pessoa faria o login confundir os dois usuários; cada um precisa ter o seu. */
const MENSAGEM_PIN_REPETIDO = "Esse PIN já é usado por outro usuário. Escolha um PIN diferente.";

export async function criarUsuario(dados: { nome: string; pin: string; papel: Papel }, adminId: number) {
  if (await pinEmUsoPorOutro(dados.pin)) throw new Error(MENSAGEM_PIN_REPETIDO);
  return db.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nome: dados.nome,
        pinHash: hashPin(dados.pin),
        papel: dados.papel,
        ativo: true,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "usuario.criar",
        entidade: "Usuario",
        entidadeId: usuario.id,
        detalhes: { nome: usuario.nome, papel: usuario.papel },
      },
      tx,
    );
    return usuario;
  });
}

export async function editarUsuario(
  id: number,
  dados: { nome: string; papel: Papel; ativo: boolean },
  adminId: number,
) {
  return db.$transaction(async (tx) => {
    const atual = await tx.usuario.findUnique({ where: { id } });
    if (!atual) throw new Error("Usuário não encontrado.");

    if (id === adminId && (!dados.ativo || dados.papel !== "ADMIN")) {
      throw new Error("Você não pode desativar nem rebaixar o próprio usuário. Peça a outro administrador.");
    }

    const deixaDeSerAdminAtivo = atual.papel === "ADMIN" && atual.ativo && (!dados.ativo || dados.papel !== "ADMIN");
    if (deixaDeSerAdminAtivo) {
      const todos = await tx.usuario.findMany({
        select: { id: true, papel: true, ativo: true },
      });
      if (!podeDesativarAdmin(todos, id)) {
        throw new Error("Este é o único administrador ativo. Crie ou ative outro administrador antes.");
      }
    }

    const usuario = await tx.usuario.update({
      where: { id },
      data: { nome: dados.nome, papel: dados.papel, ativo: dados.ativo },
    });
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "usuario.editar",
        entidade: "Usuario",
        entidadeId: id,
        detalhes: {
          antes: { nome: atual.nome, papel: atual.papel, ativo: atual.ativo },
          depois: {
            nome: usuario.nome,
            papel: usuario.papel,
            ativo: usuario.ativo,
          },
        },
      },
      tx,
    );
    return usuario;
  });
}

/** Troca o PIN de qualquer usuário. Exige o PIN atual do administrador logado como confirmação. */
export async function trocarPinUsuario(id: number, novoPin: string, adminId: number, pinAtualAdmin: string) {
  if (await pinEmUsoPorOutro(novoPin, id)) throw new Error(MENSAGEM_PIN_REPETIDO);
  return db.$transaction(async (tx) => {
    const admin = await tx.usuario.findUnique({ where: { id: adminId } });
    if (!admin || !admin.ativo || admin.papel !== "ADMIN") throw new Error("Sessão de administrador inválida.");
    if (!verificarPin(pinAtualAdmin, admin.pinHash)) {
      throw new Error("O seu PIN atual está incorreto. A troca não foi feita.");
    }
    const alvo = await tx.usuario.findUnique({ where: { id } });
    if (!alvo) throw new Error("Usuário não encontrado.");

    await tx.usuario.update({
      where: { id },
      data: { pinHash: hashPin(novoPin) },
    });
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "usuario.pin",
        entidade: "Usuario",
        entidadeId: id,
        detalhes: { nome: alvo.nome, proprio: id === adminId },
      },
      tx,
    );
    return { id, nome: alvo.nome };
  });
}

// ---------------------------------------------------------------- formas de pagamento

export type ConfiguracaoPagamentoEntrada = {
  forma: Prisma.ConfiguracaoPagamentoCreateInput["forma"];
  ativo: boolean;
  taxaPercentual: number;
  taxaFixa: number;
  prazoRecebimentoDias: number;
  maxParcelas: number;
};

export async function salvarConfiguracoesPagamento(lista: ConfiguracaoPagamentoEntrada[], adminId: number) {
  return db.$transaction(async (tx) => {
    const antes = await tx.configuracaoPagamento.findMany();
    for (const item of lista) {
      const { forma, ...dados } = item;
      await tx.configuracaoPagamento.upsert({
        where: { forma },
        update: dados,
        create: { forma, ...dados },
      });
    }
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "configuracao.pagamentos",
        entidade: "ConfiguracaoPagamento",
        detalhes: { antes, depois: lista },
      },
      tx,
    );
    return tx.configuracaoPagamento.findMany();
  });
}

// ---------------------------------------------------------------- backups

export const PASTA_BACKUPS = path.join(process.cwd(), "backups");

export type InfoBackup = {
  nome: string;
  tamanho: number; // bytes
  modificadoEm: Date;
  tipo: "backup" | "restauracao";
};

/** Caminho absoluto do arquivo SQLite em uso (DATABASE_URL relativo é resolvido a partir de prisma/). */
export function caminhoBancoAtual(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const semPrefixo = url.replace(/^file:/, "").split("?")[0];
  if (path.isAbsolute(semPrefixo) || /^[A-Za-z]:[\\/]/.test(semPrefixo)) return semPrefixo;
  return path.resolve(process.cwd(), "prisma", semPrefixo);
}

export async function tamanhoBancoAtual(): Promise<number | null> {
  try {
    return (await stat(caminhoBancoAtual())).size;
  } catch {
    return null;
  }
}

async function garantirPastaBackups(): Promise<void> {
  await mkdir(PASTA_BACKUPS, { recursive: true });
}

/** Arquivos .db válidos na pasta backups/, mais recentes primeiro. */
export async function listarBackups(): Promise<InfoBackup[]> {
  await garantirPastaBackups();
  const nomes = (await readdir(PASTA_BACKUPS)).filter(nomeBackupValido);
  const infos = await Promise.all(
    nomes.map(async (nome): Promise<InfoBackup | null> => {
      try {
        const s = await stat(path.join(PASTA_BACKUPS, nome));
        if (!s.isFile()) return null;
        return {
          nome,
          tamanho: s.size,
          modificadoEm: s.mtime,
          tipo: ehBackupAutomaticoOuManual(nome) ? "backup" : "restauracao",
        };
      } catch {
        return null;
      }
    }),
  );
  return infos
    .filter((i): i is InfoBackup => i !== null)
    .sort((a, b) => b.modificadoEm.getTime() - a.modificadoEm.getTime());
}

export function caminhoBackup(nome: string): string | null {
  if (!nomeBackupValido(nome)) return null;
  return path.join(PASTA_BACKUPS, nome);
}

/**
 * Gera uma cópia íntegra do banco com VACUUM INTO (funciona com o sistema
 * aberto). Se já existe um arquivo com o mesmo nome neste minuto, reaproveita.
 */
export async function gerarBackup(origem: "manual" | "automatico", usuarioId: number | null): Promise<InfoBackup> {
  await garantirPastaBackups();
  const nome = gerarNomeBackup(agora());
  const caminho = path.join(PASTA_BACKUPS, nome);

  let existente: InfoBackup | null = null;
  try {
    const s = await stat(caminho);
    if (s.isFile() && s.size > 0)
      existente = {
        nome,
        tamanho: s.size,
        modificadoEm: s.mtime,
        tipo: "backup",
      };
  } catch {
    existente = null;
  }
  if (existente) return existente;

  // VACUUM INTO não aceita parâmetro, então o caminho vai literal (barras normais, aspas escapadas).
  await db.$executeRawUnsafe(`VACUUM INTO '${caminhoParaSql(caminho)}'`);
  const s = await stat(caminho);
  await registrarAuditoria({
    usuarioId,
    acao: origem === "manual" ? "backup.gerar" : "backup.automatico",
    entidade: "Backup",
    detalhes: { nome, tamanho: s.size },
  });
  await limparBackupsExcedentes(usuarioId);
  return { nome, tamanho: s.size, modificadoEm: s.mtime, tipo: "backup" };
}

/**
 * Apaga os arquivos gerados pelo sistema que passam da cota (os mais antigos
 * de `uay-market-*` e `restaurar-*`), pra pasta backups/ não crescer sem fim.
 * Cópias com outro nome ficam. Nunca lança: limpeza falhar não pode impedir
 * o backup. Devolve os nomes apagados.
 */
export async function limparBackupsExcedentes(usuarioId: number | null): Promise<string[]> {
  try {
    await garantirPastaBackups();
    const nomes = (await readdir(PASTA_BACKUPS)).filter(nomeBackupValido);
    const apagados: string[] = [];
    for (const nome of backupsExcedentes(nomes)) {
      try {
        await rm(path.join(PASTA_BACKUPS, nome), { force: true });
        apagados.push(nome);
      } catch (e) {
        console.error(`Não foi possível apagar o backup antigo ${nome}`, e);
      }
    }
    if (apagados.length) {
      await registrarAuditoria({
        usuarioId,
        acao: "backup.limpar",
        entidade: "Backup",
        detalhes: { apagados, cota: { backups: MANTER_BACKUPS, restauracoes: MANTER_RESTAURACOES } },
      });
    }
    return apagados;
  } catch (e) {
    console.error("Limpeza de backups antigos falhou", e);
    return [];
  }
}

/**
 * Backup automático: se o backup mais recente tem mais de 24h (ou não existe),
 * gera um novo em silêncio. Chamado ao abrir /configuracoes/backup. Nunca lança.
 */
export async function garantirBackupAutomatico(usuarioId: number | null): Promise<InfoBackup | null> {
  try {
    const lista = (await listarBackups()).filter((b) => b.tipo === "backup");
    const ultimo = lista[0]?.modificadoEm ?? null;
    if (!backupDesatualizado(ultimo, agora())) return null;
    return await gerarBackup("automatico", usuarioId);
  } catch (e) {
    console.error("Backup automático falhou", e);
    return null;
  }
}

export type ResultadoValidacaoRestauracao = {
  nome: string;
  tamanho: number;
  integridade: string;
  tabelasEncontradas: string[];
};

const TABELAS_ESSENCIAIS = ["Configuracao", "Usuario", "Produto", "Venda"];

/**
 * Salva o arquivo enviado em backups/restaurar-<timestamp>.db e confere se é
 * um banco SQLite íntegro do Uay Market. Não substitui o banco em uso.
 */
export async function salvarEValidarRestauracao(
  conteudo: Buffer,
  usuarioId: number | null,
): Promise<ResultadoValidacaoRestauracao> {
  await garantirPastaBackups();
  const cabecalho = conteudo.subarray(0, 16).toString("latin1");
  if (!cabecalho.startsWith("SQLite format 3")) {
    throw new Error("Este arquivo não é um banco de dados SQLite. Envie um arquivo .db gerado pelo backup.");
  }
  const nome = gerarNomeRestauracao(agora());
  const caminho = path.join(PASTA_BACKUPS, nome);
  await writeFile(caminho, conteudo);

  const cliente = new PrismaClient({
    datasourceUrl: `file:${caminho.replace(/\\/g, "/")}`,
  });
  // Fica null enquanto a validação não termina; qualquer saída sem resultado
  // (inclusive exceção do SQLite ao abrir) apaga o arquivo, pra ele não ficar
  // órfão na lista de backups.
  let resultado: ResultadoValidacaoRestauracao | null = null;
  try {
    let integridade: { integrity_check: string }[];
    try {
      integridade = await cliente.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
    } catch {
      // Cabeçalho "SQLite format 3" válido com o corpo inválido: o SQLite lança
      // ("file is not a database", "malformed") em vez de responder ao PRAGMA.
      throw new Error("O arquivo começa como um banco SQLite, mas não abre (corrompido ou incompleto). Não use este backup.");
    }
    const verificacao = integridade.map((l) => l.integrity_check).join("; ") || "sem resposta";
    if (verificacao !== "ok") {
      throw new Error(`O arquivo está corrompido (verificação: ${verificacao}). Não use este backup.`);
    }
    const tabelas = await cliente.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const nomes = tabelas.map((t) => t.name);
    const faltando = TABELAS_ESSENCIAIS.filter((t) => !nomes.includes(t));
    if (faltando.length) {
      throw new Error(`O arquivo abre, mas não parece ser do Uay Market (faltam as tabelas ${faltando.join(", ")}).`);
    }
    await registrarAuditoria({
      usuarioId,
      acao: "backup.restaurar-validar",
      entidade: "Backup",
      detalhes: { nome, tamanho: conteudo.length, integridade: verificacao },
    });
    resultado = {
      nome,
      tamanho: conteudo.length,
      integridade: verificacao,
      tabelasEncontradas: nomes,
    };
  } finally {
    // Desconecta antes de apagar: no Windows, remover um .db que o engine ainda
    // tem aberto falha com EPERM (e `force` não engole esse erro).
    await cliente.$disconnect();
    if (!resultado) await rm(caminho, { force: true }).catch(() => undefined);
  }
  await limparBackupsExcedentes(usuarioId);
  return resultado;
}

export async function lerBackup(nome: string): Promise<{ conteudo: Buffer; tamanho: number } | null> {
  const caminho = caminhoBackup(nome);
  if (!caminho) return null;
  try {
    const s = await stat(caminho);
    if (!s.isFile()) return null;
    return { conteudo: await readFile(caminho), tamanho: s.size };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- auditoria

export type FiltrosAuditoria = {
  usuarioId?: number | null;
  acao?: string | null;
  de?: Date | null;
  ate?: Date | null;
};

export type LinhaAuditoria = {
  id: number;
  criadoEm: Date;
  usuario: { id: number; nome: string } | null;
  acao: string;
  entidade: string;
  entidadeId: number | null;
  detalhes: string | null;
};

function whereAuditoria(filtros: FiltrosAuditoria): Prisma.AuditoriaWhereInput {
  const where: Prisma.AuditoriaWhereInput = {};
  if (filtros.usuarioId) where.usuarioId = filtros.usuarioId;
  if (filtros.acao) where.acao = filtros.acao;
  if (filtros.de || filtros.ate) {
    where.criadoEm = {
      ...(filtros.de ? { gte: filtros.de } : {}),
      ...(filtros.ate ? { lte: filtros.ate } : {}),
    };
  }
  return where;
}

export async function listarAuditoria(
  filtros: FiltrosAuditoria,
  pagina: number,
  porPagina = 50,
): Promise<{
  linhas: LinhaAuditoria[];
  total: number;
  pagina: number;
  totalPaginas: number;
}> {
  const where = whereAuditoria(filtros);
  const total = await db.auditoria.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
  const linhas = await db.auditoria.findMany({
    where,
    orderBy: { criadoEm: "desc" },
    skip: (paginaAtual - 1) * porPagina,
    take: porPagina,
    include: { usuario: { select: { id: true, nome: true } } },
  });
  return { linhas, total, pagina: paginaAtual, totalPaginas };
}

/** Todas as linhas que batem com o filtro (pra exportar), limitado a 20 mil. */
export async function listarAuditoriaCompleta(filtros: FiltrosAuditoria, limite = 20000): Promise<LinhaAuditoria[]> {
  return db.auditoria.findMany({
    where: whereAuditoria(filtros),
    orderBy: { criadoEm: "desc" },
    take: limite,
    include: { usuario: { select: { id: true, nome: true } } },
  });
}

export async function listarAcoesAuditoria(): Promise<string[]> {
  const linhas = await db.auditoria.findMany({
    distinct: ["acao"],
    select: { acao: true },
    orderBy: { acao: "asc" },
  });
  return linhas.map((l) => l.acao);
}

export async function listarUsuariosParaFiltro(): Promise<{ id: number; nome: string; ativo: boolean }[]> {
  return db.usuario.findMany({
    select: { id: true, nome: true, ativo: true },
    orderBy: { nome: "asc" },
  });
}
