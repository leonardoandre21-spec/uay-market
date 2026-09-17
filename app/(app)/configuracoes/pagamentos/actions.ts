"use server";

import { revalidatePath } from "next/cache";
import { campo, campoBooleano, campoInteiro, executar, falha, type Resultado } from "@/lib/acao";
import { parsePercentual, parseReais } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO, ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import {
  salvarConfiguracoesPagamento,
  sessaoAdmin,
  type ConfiguracaoPagamentoEntrada,
} from "@/lib/servicos/configuracoes";

/** Salva as cinco formas de uma vez. Campos vêm com sufixo da forma: ativo_PIX, taxaPercentual_PIX... */
export async function salvarPagamentos(form: FormData): Promise<Resultado<{ quantidade: number }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const lista: ConfiguracaoPagamentoEntrada[] = [];
  const erros: Record<string, string> = {};

  for (const forma of FORMAS_PAGAMENTO) {
    const rotulo = ROTULO_FORMA_PAGAMENTO[forma];
    const textoTaxa = campo(form, `taxaPercentual_${forma}`);
    const taxaPercentual = textoTaxa === "" ? 0 : parsePercentual(textoTaxa);
    if (taxaPercentual === null || taxaPercentual < 0 || taxaPercentual > 10000) {
      erros[`taxaPercentual_${forma}`] = `Taxa de ${rotulo}: informe um percentual entre 0 e 100.`;
    }
    const taxaFixaTexto = campo(form, `taxaFixa_${forma}`);
    const taxaFixa = taxaFixaTexto === "" ? 0 : parseReais(taxaFixaTexto);
    if (taxaFixa === null || taxaFixa < 0) {
      erros[`taxaFixa_${forma}`] = `Taxa fixa de ${rotulo}: valor inválido.`;
    }
    const prazoTexto = campo(form, `prazoRecebimentoDias_${forma}`);
    const prazo = prazoTexto === "" ? 0 : campoInteiro(form, `prazoRecebimentoDias_${forma}`);
    if (prazo === null || prazo < 0 || prazo > 365) {
      erros[`prazoRecebimentoDias_${forma}`] = `Prazo de ${rotulo}: informe de 0 a 365 dias.`;
    }
    let maxParcelas = 1;
    if (forma === "CREDITO") {
      const parcelasTexto = campo(form, `maxParcelas_${forma}`);
      const parcelas = parcelasTexto === "" ? 1 : campoInteiro(form, `maxParcelas_${forma}`);
      if (parcelas === null || parcelas < 1 || parcelas > 24) {
        erros[`maxParcelas_${forma}`] = "Parcelas no crédito: informe de 1 a 24.";
      } else {
        maxParcelas = parcelas;
      }
    }
    lista.push({
      forma,
      ativo: campoBooleano(form, `ativo_${forma}`),
      taxaPercentual: taxaPercentual ?? 0,
      taxaFixa: taxaFixa ?? 0,
      prazoRecebimentoDias: prazo ?? 0,
      maxParcelas,
    });
  }

  if (Object.keys(erros).length) return falha(Object.values(erros)[0], erros);
  if (!lista.some((l) => l.ativo)) return falha("Pelo menos uma forma de pagamento precisa ficar ativa.");

  return executar(async () => {
    const salvo = await salvarConfiguracoesPagamento(lista, auth.dados.usuarioId);
    revalidatePath("/configuracoes/pagamentos");
    return { quantidade: salvo.length };
  });
}
