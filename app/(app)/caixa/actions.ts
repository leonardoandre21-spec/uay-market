"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessaoAcao } from "@/lib/auth";
import { campo, campoInteiro, campoOpcional, executar, type Resultado } from "@/lib/acao";
import { parseReais } from "@/lib/dinheiro";
import {
  abrirCaixa as abrirCaixaServico,
  fecharCaixa as fecharCaixaServico,
  registrarMovimentoCaixa,
} from "@/lib/servicos/caixa";

// Server actions do módulo Caixa. Validação com Zod, escrita via lib/servicos/caixa.ts.
// Valores de EntradaMoeda chegam como "12,50": parseReais converte pra centavos.

const LIMITE_VALOR = 100_000_00; // R$ 100.000,00: acima disso é erro de digitação

const observacaoOpcional = z
  .string()
  .trim()
  .max(500, "A observação pode ter no máximo 500 caracteres.")
  .nullable();

const esquemaAbrir = z.object({
  valorAbertura: z
    .number({ error: "Informe o valor de abertura (pode ser 0,00)." })
    .int()
    .min(0, "O valor de abertura não pode ser negativo.")
    .max(LIMITE_VALOR, "Valor de abertura muito alto. Confira a digitação."),
  observacao: observacaoOpcional,
});

const esquemaMovimento = z.object({
  sessaoId: z.number({ error: "Caixa não identificado. Recarregue a página." }).int().positive(),
  valor: z
    .number({ error: "Informe o valor." })
    .int()
    .positive("O valor precisa ser maior que zero.")
    .max(LIMITE_VALOR, "Valor muito alto. Confira a digitação."),
  motivo: z
    .string()
    .trim()
    .min(3, "Descreva o motivo (mínimo 3 letras).")
    .max(200, "O motivo pode ter no máximo 200 caracteres."),
});

const esquemaFechar = z.object({
  sessaoId: z.number({ error: "Caixa não identificado. Recarregue a página." }).int().positive(),
  valorContado: z
    .number({ error: "Informe quanto dinheiro tem na gaveta (pode ser 0,00)." })
    .int()
    .min(0, "O valor contado não pode ser negativo.")
    .max(LIMITE_VALOR, "Valor contado muito alto. Confira a digitação."),
  observacao: observacaoOpcional,
});

function revalidarCaixa(sessaoId?: number) {
  revalidatePath("/caixa");
  revalidatePath("/caixa/historico");
  revalidatePath("/pdv");
  if (sessaoId) {
    revalidatePath(`/caixa/${sessaoId}`);
    revalidatePath(`/caixa/${sessaoId}/resumo`);
  }
}

/** Abre uma nova sessão de caixa com o fundo de troco informado. */
export async function abrirCaixa(form: FormData): Promise<Resultado<{ sessaoId: number }>> {
  return executar(async () => {
    const sessao = await exigirSessaoAcao();
    const dados = esquemaAbrir.parse({
      valorAbertura: parseReais(campo(form, "valorAbertura")) ?? undefined,
      observacao: campoOpcional(form, "observacao"),
    });
    const aberta = await abrirCaixaServico({
      usuarioId: sessao.usuarioId,
      valorAbertura: dados.valorAbertura,
      observacao: dados.observacao,
    });
    revalidarCaixa(aberta.id);
    return { sessaoId: aberta.id };
  });
}

async function registrarMovimento(
  form: FormData,
  tipo: "SANGRIA" | "SUPRIMENTO",
): Promise<Resultado<{ movimentoId: number }>> {
  return executar(async () => {
    const sessao = await exigirSessaoAcao();
    const dados = esquemaMovimento.parse({
      sessaoId: campoInteiro(form, "sessaoId") ?? undefined,
      valor: parseReais(campo(form, "valor")) ?? undefined,
      motivo: campo(form, "motivo"),
    });
    const movimento = await registrarMovimentoCaixa({
      sessaoId: dados.sessaoId,
      tipo,
      valor: dados.valor,
      motivo: dados.motivo,
      usuarioId: sessao.usuarioId,
    });
    revalidarCaixa(dados.sessaoId);
    return { movimentoId: movimento.id };
  });
}

/** Retira dinheiro da gaveta (levar pro cofre, pagar entregador, etc). */
export async function registrarSangria(form: FormData): Promise<Resultado<{ movimentoId: number }>> {
  return registrarMovimento(form, "SANGRIA");
}

/** Coloca dinheiro na gaveta (reforço de troco). */
export async function registrarSuprimento(form: FormData): Promise<Resultado<{ movimentoId: number }>> {
  return registrarMovimento(form, "SUPRIMENTO");
}

/** Fecha o caixa: recalcula o esperado no servidor e grava contado e diferença. */
export async function fecharCaixa(
  form: FormData,
): Promise<Resultado<{ sessaoId: number; esperado: number; contado: number; diferenca: number }>> {
  return executar(async () => {
    const sessao = await exigirSessaoAcao();
    const dados = esquemaFechar.parse({
      sessaoId: campoInteiro(form, "sessaoId") ?? undefined,
      valorContado: parseReais(campo(form, "valorContado")) ?? undefined,
      observacao: campoOpcional(form, "observacao"),
    });
    const resultado = await fecharCaixaServico({
      sessaoId: dados.sessaoId,
      usuarioId: sessao.usuarioId,
      papel: sessao.papel,
      valorContado: dados.valorContado,
      observacao: dados.observacao,
    });
    revalidarCaixa(dados.sessaoId);
    return {
      sessaoId: resultado.sessao.id,
      esperado: resultado.resumo.dinheiroEsperado,
      contado: dados.valorContado,
      diferenca: resultado.diferenca,
    };
  });
}
