import "server-only";
import { db } from "@/lib/db";
import type { ClienteDb } from "@/lib/consultas";

/**
 * Registra uma ação relevante (cancelamento, alteração de preço, fechamento
 * de caixa, etc). Nunca lança: auditoria não pode derrubar a operação.
 */
export async function registrarAuditoria(
  params: {
    usuarioId?: number | null;
    acao: string;
    entidade: string;
    entidadeId?: number | null;
    detalhes?: unknown;
  },
  tx: ClienteDb = db,
): Promise<void> {
  try {
    await tx.auditoria.create({
      data: {
        usuarioId: params.usuarioId ?? null,
        acao: params.acao,
        entidade: params.entidade,
        entidadeId: params.entidadeId ?? null,
        detalhes: params.detalhes === undefined ? null : JSON.stringify(params.detalhes),
      },
    });
  } catch (e) {
    console.error("Falha ao registrar auditoria", e);
  }
}
