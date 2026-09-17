import "server-only";
import type { Maquininha } from "@prisma/client";
import { db } from "@/lib/db";
import type { ClienteDb } from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";

// Maquininhas do mercado (InfinitePay, Sipag...). Cada uma guarda as próprias
// taxas e prazos; o pagamento em cartão registra em qual passou e a taxa
// snapshot vem daqui (taxaDaMaquininha em vendas-calculos.ts).

export type MaquininhaEntrada = {
  nome: string;
  adquirente: string | null;
  ativo: boolean;
  padrao: boolean;
  taxaDebito: number;
  taxaCredito: number;
  taxaCreditoParcelado: number;
  taxaPix: number;
  prazoDebitoDias: number;
  prazoCreditoDias: number;
  prazoPixDias: number;
  observacao: string | null;
};

export type MaquininhaListada = Maquininha & { _count: { pagamentos: number } };

/** Todas (ativas primeiro, padrão antes), com a quantidade de pagamentos que já passaram nela. */
export async function listarMaquininhas(tx: ClienteDb = db): Promise<MaquininhaListada[]> {
  return tx.maquininha.findMany({
    orderBy: [{ ativo: "desc" }, { padrao: "desc" }, { nome: "asc" }],
    include: { _count: { select: { pagamentos: true } } },
  });
}

/** Só as ativas (pro PDV e pra validar a venda), padrão primeiro. */
export async function listarMaquininhasAtivas(tx: ClienteDb = db): Promise<Maquininha[]> {
  return tx.maquininha.findMany({ where: { ativo: true }, orderBy: [{ padrao: "desc" }, { nome: "asc" }] });
}

/** A maquininha pré-selecionada no PDV (ativa e marcada como padrão) ou null. */
export async function obterMaquininhaPadrao(tx: ClienteDb = db): Promise<Maquininha | null> {
  return tx.maquininha.findFirst({ where: { ativo: true, padrao: true }, orderBy: { id: "asc" } });
}

export async function obterMaquininha(id: number, tx: ClienteDb = db): Promise<MaquininhaListada | null> {
  return tx.maquininha.findUnique({ where: { id }, include: { _count: { select: { pagamentos: true } } } });
}

/** Só uma pode ser padrão: ao marcar uma, desmarca as outras. Inativa nunca fica padrão. */
function normalizarPadrao(dados: MaquininhaEntrada): MaquininhaEntrada {
  return dados.ativo ? dados : { ...dados, padrao: false };
}

export async function criarMaquininha(entrada: MaquininhaEntrada, adminId: number): Promise<Maquininha> {
  const dados = normalizarPadrao(entrada);
  return db.$transaction(async (tx) => {
    if (dados.padrao) await tx.maquininha.updateMany({ where: { padrao: true }, data: { padrao: false } });
    const maquininha = await tx.maquininha.create({ data: dados });
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "maquininha.criar",
        entidade: "Maquininha",
        entidadeId: maquininha.id,
        detalhes: dados,
      },
      tx,
    );
    return maquininha;
  });
}

export async function editarMaquininha(id: number, entrada: MaquininhaEntrada, adminId: number): Promise<Maquininha> {
  const dados = normalizarPadrao(entrada);
  return db.$transaction(async (tx) => {
    const antes = await tx.maquininha.findUnique({ where: { id } });
    if (!antes) throw new Error("Maquininha não encontrada.");
    if (dados.padrao) await tx.maquininha.updateMany({ where: { padrao: true, id: { not: id } }, data: { padrao: false } });
    const maquininha = await tx.maquininha.update({ where: { id }, data: dados });
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "maquininha.editar",
        entidade: "Maquininha",
        entidadeId: id,
        detalhes: {
          antes: {
            nome: antes.nome,
            adquirente: antes.adquirente,
            ativo: antes.ativo,
            padrao: antes.padrao,
            taxaDebito: antes.taxaDebito,
            taxaCredito: antes.taxaCredito,
            taxaCreditoParcelado: antes.taxaCreditoParcelado,
            taxaPix: antes.taxaPix,
            prazoDebitoDias: antes.prazoDebitoDias,
            prazoCreditoDias: antes.prazoCreditoDias,
            prazoPixDias: antes.prazoPixDias,
            observacao: antes.observacao,
          },
          depois: dados,
        },
      },
      tx,
    );
    return maquininha;
  });
}

/**
 * Exclui só maquininha sem pagamento registrado. Com histórico, o caminho é
 * desativar (o pagamento antigo continua apontando pra ela na conciliação).
 */
export async function excluirMaquininha(id: number, adminId: number): Promise<{ nome: string }> {
  return db.$transaction(async (tx) => {
    const maquininha = await tx.maquininha.findUnique({
      where: { id },
      include: { _count: { select: { pagamentos: true } } },
    });
    if (!maquininha) throw new Error("Maquininha não encontrada.");
    if (maquininha._count.pagamentos > 0) {
      throw new Error(
        `"${maquininha.nome}" já tem ${maquininha._count.pagamentos} pagamento${maquininha._count.pagamentos === 1 ? "" : "s"} registrado${maquininha._count.pagamentos === 1 ? "" : "s"}. Desative em vez de excluir, pra não perder o histórico.`,
      );
    }
    await tx.maquininha.delete({ where: { id } });
    await registrarAuditoria(
      {
        usuarioId: adminId,
        acao: "maquininha.excluir",
        entidade: "Maquininha",
        entidadeId: id,
        detalhes: { nome: maquininha.nome, adquirente: maquininha.adquirente },
      },
      tx,
    );
    return { nome: maquininha.nome };
  });
}
