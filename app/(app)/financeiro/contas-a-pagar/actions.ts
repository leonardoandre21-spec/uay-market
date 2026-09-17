"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirAdminAcao } from "@/lib/auth";
import { campo, campoBooleano, campoInteiro, campoOpcional, executar, type Resultado } from "@/lib/acao";
import { formatarData, parseDataInput } from "@/lib/datas";
import { lerMoeda } from "@/components/ui/entrada-moeda";
import {
  atualizarConta,
  cancelarConta,
  criarContas,
  desfazerPagamento,
  pagarConta,
  reativarConta,
} from "@/lib/servicos/financeiro";

const FORMAS_BOLETO = ["DINHEIRO", "PIX", "DEBITO", "CREDITO"] as const;

const esquemaBase = {
  descricao: z.string().trim().min(2, "Descreva a conta (pelo menos 2 letras).").max(120, "Descrição muito longa (máximo 120 letras)."),
  fornecedorId: z.number().int().positive().nullable(),
  novoFornecedor: z.string().trim().max(80, "Nome do fornecedor muito longo.").nullable(),
  categoriaId: z.number().int().positive().nullable(),
  novaCategoria: z.string().trim().max(80, "Nome da categoria muito longo.").nullable(),
  valor: z.number({ error: "Informe o valor." }).int().positive("O valor precisa ser maior que zero."),
  vencimento: z.date({ error: "Informe uma data de vencimento válida." }),
  linhaDigitavel: z.string().trim().max(200, "Linha digitável muito longa.").nullable(),
  recorrenciaMensal: z.boolean(),
  observacao: z.string().trim().max(500, "Observação muito longa (máximo 500 letras).").nullable(),
};

const esquemaNovaConta = z.object({
  ...esquemaBase,
  totalParcelas: z.number({ error: "Informe o número de parcelas." }).int("Número de parcelas inválido.").min(1, "Mínimo de 1 parcela.").max(60, "Máximo de 60 parcelas."),
});

const esquemaEdicaoConta = z.object({
  ...esquemaBase,
  diaVencimento: z.number({ error: "Dia do vencimento inválido." }).int("Dia do vencimento inválido.").min(1, "O dia precisa estar entre 1 e 31.").max(31, "O dia precisa estar entre 1 e 31.").nullable(),
});

function lerBase(form: FormData) {
  return {
    descricao: campo(form, "descricao"),
    fornecedorId: campoInteiro(form, "fornecedorId"),
    novoFornecedor: campoOpcional(form, "novoFornecedor"),
    categoriaId: campoInteiro(form, "categoriaId"),
    novaCategoria: campoOpcional(form, "novaCategoria"),
    valor: lerMoeda(form, "valor"),
    vencimento: parseDataInput(campo(form, "vencimento")),
    linhaDigitavel: campoOpcional(form, "linhaDigitavel"),
    recorrenciaMensal: campoBooleano(form, "recorrenciaMensal"),
    observacao: campoOpcional(form, "observacao"),
  };
}

function atualizarTelas() {
  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath("/financeiro/contas-a-pagar/calendario");
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/fornecedores");
}

export async function cadastrarConta(form: FormData): Promise<Resultado<{ quantidade: number; primeiroVencimento: string }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const dados = esquemaNovaConta.parse({
      ...lerBase(form),
      totalParcelas: campoInteiro(form, "totalParcelas") ?? 1,
    });
    const criadas = await criarContas(dados, sessao.usuarioId);
    atualizarTelas();
    return { quantidade: criadas.length, primeiroVencimento: formatarData(criadas[0]?.vencimento ?? dados.vencimento) };
  });
}

export async function editarConta(form: FormData): Promise<Resultado<{ id: number }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const id = campoInteiro(form, "id");
    if (!id) throw new Error("Conta não identificada.");
    const dados = esquemaEdicaoConta.parse({ ...lerBase(form), diaVencimento: campoInteiro(form, "diaVencimento") });
    await atualizarConta(id, dados, sessao.usuarioId);
    atualizarTelas();
    return { id };
  });
}

const esquemaPagamento = z.object({
  dataPagamento: z.date({ error: "Informe a data do pagamento." }),
  valorPago: z.number({ error: "Informe o valor pago." }).int().positive("O valor pago precisa ser maior que zero."),
  formaPagamento: z.enum(FORMAS_BOLETO, { error: "Escolha como a conta foi paga." }),
  pagoDoCaixa: z.boolean(),
  observacao: z.string().trim().max(300, "Observação muito longa.").nullable(),
});

export async function pagarContaAcao(form: FormData): Promise<Resultado<{ proximaConta: string | null }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const id = campoInteiro(form, "id");
    if (!id) throw new Error("Conta não identificada.");
    const pagoDoCaixa = campoBooleano(form, "pagoDoCaixa");
    const dados = esquemaPagamento.parse({
      dataPagamento: parseDataInput(campo(form, "dataPagamento")),
      valorPago: lerMoeda(form, "valorPago"),
      formaPagamento: pagoDoCaixa ? "DINHEIRO" : campoOpcional(form, "formaPagamento"),
      pagoDoCaixa,
      observacao: campoOpcional(form, "observacao"),
    });
    const r = await pagarConta(id, dados, sessao.usuarioId);
    atualizarTelas();
    return { proximaConta: r.proxima ? formatarData(r.proxima.vencimento) : null };
  });
}

export async function desfazerPagamentoAcao(id: number): Promise<Resultado<{ aviso: string | null }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    if (!Number.isInteger(id) || id <= 0) throw new Error("Conta não identificada.");
    const r = await desfazerPagamento(id, sessao.usuarioId);
    atualizarTelas();
    return { aviso: r.aviso };
  });
}

export async function cancelarContaAcao(id: number, motivo: string | null): Promise<Resultado<undefined>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    if (!Number.isInteger(id) || id <= 0) throw new Error("Conta não identificada.");
    await cancelarConta(id, motivo, sessao.usuarioId);
    atualizarTelas();
    return undefined;
  });
}

export async function reativarContaAcao(id: number): Promise<Resultado<undefined>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    if (!Number.isInteger(id) || id <= 0) throw new Error("Conta não identificada.");
    await reativarConta(id, sessao.usuarioId);
    atualizarTelas();
    return undefined;
  });
}
