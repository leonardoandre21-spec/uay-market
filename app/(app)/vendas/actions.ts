"use server";

import { revalidatePath } from "next/cache";
import { exigirSessaoAcao } from "@/lib/auth";
import { campo, campoInteiro, executar, falha, type Resultado } from "@/lib/acao";
import { cancelarVenda } from "@/lib/servicos/vendas";

/**
 * Cancela uma venda. ADMIN cancela qualquer uma; OPERADOR só da sessão
 * aberta e com menos de 30 minutos. Motivo obrigatório.
 */
export async function cancelarVendaAction(form: FormData): Promise<Resultado<{ numero: number }>> {
  const sessao = await exigirSessaoAcao().catch(() => null);
  if (!sessao) return falha("Sessão expirada. Faça login novamente.");
  const vendaId = campoInteiro(form, "vendaId");
  const motivo = campo(form, "motivo");
  if (!vendaId) return falha("Venda não informada.");
  if (motivo.length < 3) return falha("Informe o motivo do cancelamento.", { motivo: "Escreva o motivo (mínimo 3 letras)." });
  if (motivo.length > 300) return falha("Motivo muito longo (máximo 300 letras).", { motivo: "Máximo 300 letras." });

  const resultado = await executar(() =>
    cancelarVenda({ vendaId, motivo }, { usuarioId: sessao.usuarioId, papel: sessao.papel }),
  );
  if (resultado.ok) {
    revalidatePath("/vendas");
    revalidatePath(`/vendas/${vendaId}`);
    revalidatePath("/caixa");
  }
  return resultado;
}
