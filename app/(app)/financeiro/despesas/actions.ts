"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirAdminAcao } from "@/lib/auth";
import { campo, campoBooleano, campoInteiro, campoOpcional, executar, type Resultado } from "@/lib/acao";
import { parseDataInput, parseMesInput } from "@/lib/datas";
import { lerMoeda } from "@/components/ui/entrada-moeda";
import {
  atualizarDespesa,
  criarCategoriaDespesa,
  criarDespesa,
  excluirCategoriaDespesa,
  excluirDespesa,
  renomearCategoriaDespesa,
  repetirDespesas,
} from "@/lib/servicos/financeiro";

const FORMAS_DESPESA = ["DINHEIRO", "PIX", "DEBITO", "CREDITO"] as const;

const esquemaDespesa = z.object({
  descricao: z.string().trim().min(2, "Descreva a despesa (pelo menos 2 letras).").max(120, "Descrição muito longa (máximo 120 letras)."),
  categoriaId: z.number().int().positive().nullable(),
  novaCategoria: z.string().trim().max(80, "Nome da categoria muito longo.").nullable(),
  fornecedorId: z.number().int().positive().nullable(),
  novoFornecedor: z.string().trim().max(80, "Nome do fornecedor muito longo.").nullable(),
  valor: z.number({ error: "Informe o valor da despesa." }).int().positive("O valor precisa ser maior que zero."),
  data: z.date({ error: "Informe uma data válida." }),
  formaPagamento: z.enum(FORMAS_DESPESA, { error: "Forma de pagamento inválida." }).nullable(),
  pagoDoCaixa: z.boolean(),
  observacao: z.string().trim().max(500, "Observação muito longa (máximo 500 letras).").nullable(),
});

function lerDespesa(form: FormData) {
  return esquemaDespesa.parse({
    descricao: campo(form, "descricao"),
    categoriaId: campoInteiro(form, "categoriaId"),
    novaCategoria: campoOpcional(form, "novaCategoria"),
    fornecedorId: campoInteiro(form, "fornecedorId"),
    novoFornecedor: campoOpcional(form, "novoFornecedor"),
    valor: lerMoeda(form, "valor"),
    data: parseDataInput(campo(form, "data")),
    formaPagamento: campoOpcional(form, "formaPagamento"),
    pagoDoCaixa: campoBooleano(form, "pagoDoCaixa"),
    observacao: campoOpcional(form, "observacao"),
  });
}

function atualizarTelas() {
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/despesas/categorias");
  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath("/financeiro/fornecedores");
}

export async function lancarDespesa(form: FormData): Promise<Resultado<{ id: number }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const dados = lerDespesa(form);
    const despesa = await criarDespesa(dados, sessao.usuarioId);
    atualizarTelas();
    return { id: despesa.id };
  });
}

export async function editarDespesa(form: FormData): Promise<Resultado<{ id: number }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const id = campoInteiro(form, "id");
    if (!id) throw new Error("Despesa não identificada.");
    const dados = lerDespesa(form);
    await atualizarDespesa(id, dados, sessao.usuarioId);
    atualizarTelas();
    return { id };
  });
}

export async function excluirDespesaAcao(id: number): Promise<Resultado<undefined>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    if (!Number.isInteger(id) || id <= 0) throw new Error("Despesa não identificada.");
    await excluirDespesa(id, sessao.usuarioId);
    atualizarTelas();
    return undefined;
  });
}

export async function repetirDespesasAcao(form: FormData): Promise<Resultado<{ criadas: number; ignoradas: number }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const ids = form
      .getAll("ids")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);
    const destino = parseMesInput(campo(form, "mesDestino"));
    if (!destino) throw new Error("Mês de destino inválido.");
    if (!ids.length) throw new Error("Marque pelo menos uma despesa pra repetir.");
    const r = await repetirDespesas(ids, destino, sessao.usuarioId);
    atualizarTelas();
    return r;
  });
}

// ---------------------------------------------------------------- categorias

export async function criarCategoriaAcao(form: FormData): Promise<Resultado<{ id: number; nome: string }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const nome = z.string().trim().min(2, "Informe o nome da categoria (pelo menos 2 letras).").max(60, "Nome muito longo.").parse(campo(form, "nome"));
    const c = await criarCategoriaDespesa(nome, sessao.usuarioId);
    atualizarTelas();
    return { id: c.id, nome: c.nome };
  });
}

export async function renomearCategoriaAcao(form: FormData): Promise<Resultado<{ id: number; nome: string }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const id = campoInteiro(form, "id");
    if (!id) throw new Error("Categoria não identificada.");
    const nome = z.string().trim().min(2, "Informe o nome da categoria (pelo menos 2 letras).").max(60, "Nome muito longo.").parse(campo(form, "nome"));
    const c = await renomearCategoriaDespesa(id, nome, sessao.usuarioId);
    atualizarTelas();
    return { id: c.id, nome: c.nome };
  });
}

export async function excluirCategoriaAcao(id: number): Promise<Resultado<undefined>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    if (!Number.isInteger(id) || id <= 0) throw new Error("Categoria não identificada.");
    await excluirCategoriaDespesa(id, sessao.usuarioId);
    atualizarTelas();
    return undefined;
  });
}
