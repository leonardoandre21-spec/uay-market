"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirAdminAcao } from "@/lib/auth";
import { campo, campoBooleano, campoInteiro, campoOpcional, executar, type Resultado } from "@/lib/acao";
import { alternarAtivoFornecedor, criarFornecedorRapido, excluirFornecedor, salvarFornecedor } from "@/lib/servicos/fornecedores";

const esquemaFornecedor = z.object({
  nome: z.string().trim().min(2, "Informe o nome do fornecedor (pelo menos 2 letras).").max(100, "Nome muito longo (máximo 100 letras)."),
  cnpj: z
    .string()
    .trim()
    .nullable()
    .refine((v) => v === null || v.replace(/\D/g, "").length === 14, "O CNPJ precisa ter 14 números."),
  telefone: z
    .string()
    .trim()
    .nullable()
    .refine((v) => v === null || /^\d{10,13}$/.test(v.replace(/\D/g, "")), "Telefone inválido. Use DDD + número."),
  email: z.email("E-mail inválido.").trim().toLowerCase().nullable(),
  contato: z.string().trim().max(80, "Nome do contato muito longo.").nullable(),
  observacao: z.string().trim().max(500, "Observação muito longa (máximo 500 letras).").nullable(),
  ativo: z.boolean(),
});

function atualizarTelas(id?: number) {
  revalidatePath("/financeiro/fornecedores");
  if (id) revalidatePath(`/financeiro/fornecedores/${id}`);
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/contas-a-pagar");
}

export async function salvarFornecedorAcao(form: FormData): Promise<Resultado<{ id: number; nome: string }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const id = campoInteiro(form, "id");
    const dados = esquemaFornecedor.parse({
      nome: campo(form, "nome"),
      cnpj: campoOpcional(form, "cnpj"),
      telefone: campoOpcional(form, "telefone"),
      email: campoOpcional(form, "email"),
      contato: campoOpcional(form, "contato"),
      observacao: campoOpcional(form, "observacao"),
      ativo: id ? campoBooleano(form, "ativo") : true,
    });
    const f = await salvarFornecedor(id, dados, sessao.usuarioId);
    atualizarTelas(f.id);
    return { id: f.id, nome: f.nome };
  });
}

export async function alternarAtivoFornecedorAcao(id: number, ativo: boolean): Promise<Resultado<undefined>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    if (!Number.isInteger(id) || id <= 0) throw new Error("Fornecedor não identificado.");
    await alternarAtivoFornecedor(id, ativo, sessao.usuarioId);
    atualizarTelas(id);
    return undefined;
  });
}

export async function excluirFornecedorAcao(id: number): Promise<Resultado<undefined>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    if (!Number.isInteger(id) || id <= 0) throw new Error("Fornecedor não identificado.");
    await excluirFornecedor(id, sessao.usuarioId);
    atualizarTelas();
    return undefined;
  });
}

/** Cadastro rápido só com o nome (usado em seletores). */
export async function criarFornecedorRapidoAcao(nome: string): Promise<Resultado<{ id: number; nome: string }>> {
  return executar(async () => {
    await exigirAdminAcao();
    const f = await criarFornecedorRapido(nome);
    atualizarTelas(f.id);
    return f;
  });
}
