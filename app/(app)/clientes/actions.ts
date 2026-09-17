"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirAdminAcao, exigirSessaoAcao } from "@/lib/auth";
import { campo, campoBooleano, campoInteiro, campoOpcional, executar, type Resultado } from "@/lib/acao";
import { parseReais } from "@/lib/dinheiro";
import { parseDataInput } from "@/lib/datas";
import { cpfValido } from "@/lib/utils";
import {
  ajustarSaldoFiado,
  alterarAtivoCliente,
  atualizarCliente,
  criarCliente,
  excluirCliente,
  receberPagamentoFiado,
  type DadosCliente,
  type FormaRecebimento,
} from "@/lib/servicos/clientes";

// ---------------------------------------------------------------- validação

const esquemaCliente = z.object({
  nome: z.string().trim().min(2, "Informe o nome do cliente (pelo menos 2 letras).").max(120, "Nome muito longo."),
  cpf: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || cpfValido(v), "CPF inválido. Confira os números."),
  telefone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 10 || v.length === 11, "Telefone deve ter DDD + número (10 ou 11 dígitos)."),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido."),
  endereco: z.string().trim().max(200, "Endereço muito longo."),
  dataNascimento: z
    .string()
    .trim()
    .refine((v) => v === "" || parseDataInput(v) !== null, "Data de nascimento inválida."),
  observacao: z.string().trim().max(1000, "Observação muito longa."),
});

function revalidarCliente(id?: number) {
  revalidatePath("/clientes");
  if (id) revalidatePath(`/clientes/${id}`);
}

function lerDadosCliente(form: FormData, ehAdmin: boolean, edicao: boolean): DadosCliente {
  const dados = esquemaCliente.parse({
    nome: campo(form, "nome"),
    cpf: campo(form, "cpf"),
    telefone: campo(form, "telefone"),
    email: campo(form, "email"),
    endereco: campo(form, "endereco"),
    dataNascimento: campo(form, "dataNascimento"),
    observacao: campo(form, "observacao"),
  });

  const dataNascimento = dados.dataNascimento ? parseDataInput(dados.dataNascimento) : null;
  if (dataNascimento && dataNascimento.getTime() > Date.now()) {
    throw new Error("A data de nascimento não pode ser no futuro.");
  }

  const resultado: DadosCliente = {
    nome: dados.nome,
    cpf: dados.cpf || null,
    telefone: dados.telefone || null,
    email: dados.email || null,
    endereco: dados.endereco || null,
    dataNascimento,
    observacao: dados.observacao || null,
  };

  if (ehAdmin && form.has("limiteFiado")) {
    const limite = parseReais(campo(form, "limiteFiado"));
    if (limite === null || limite < 0) throw new Error("Limite de fiado inválido.");
    resultado.limiteFiado = limite;
  }
  if (edicao && form.has("ativoPresente")) {
    resultado.ativo = campoBooleano(form, "ativo");
  }
  return resultado;
}

// ---------------------------------------------------------------- cadastro

/** Cria ou atualiza (quando vem "id"). Operador pode; limite de fiado só ADMIN. */
export async function salvarCliente(form: FormData): Promise<Resultado<{ id: number; criado: boolean }>> {
  return executar(async () => {
    const sessao = await exigirSessaoAcao();
    const ehAdmin = sessao.papel === "ADMIN";
    const id = campoInteiro(form, "id");

    if (id) {
      const dados = lerDadosCliente(form, ehAdmin, true);
      const cliente = await atualizarCliente(id, dados, sessao.usuarioId, ehAdmin);
      revalidarCliente(cliente.id);
      return { id: cliente.id, criado: false };
    }

    const dados = lerDadosCliente(form, ehAdmin, false);
    if (!ehAdmin) dados.limiteFiado = 0;
    const cliente = await criarCliente(dados, sessao.usuarioId);
    revalidarCliente(cliente.id);
    return { id: cliente.id, criado: true };
  });
}

export async function desativarCliente(form: FormData): Promise<Resultado<{ id: number }>> {
  return executar(async () => {
    const sessao = await exigirSessaoAcao();
    const id = campoInteiro(form, "id");
    if (!id) throw new Error("Cliente não informado.");
    await alterarAtivoCliente(id, false, sessao.usuarioId);
    revalidarCliente(id);
    return { id };
  });
}

export async function reativarCliente(form: FormData): Promise<Resultado<{ id: number }>> {
  return executar(async () => {
    const sessao = await exigirSessaoAcao();
    const id = campoInteiro(form, "id");
    if (!id) throw new Error("Cliente não informado.");
    await alterarAtivoCliente(id, true, sessao.usuarioId);
    revalidarCliente(id);
    return { id };
  });
}

/** Exclusão definitiva: só ADMIN e só sem compras nem lançamentos. */
export async function excluirClienteAcao(form: FormData): Promise<Resultado<{ id: number }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const id = campoInteiro(form, "id");
    if (!id) throw new Error("Cliente não informado.");
    await excluirCliente(id, sessao.usuarioId);
    revalidatePath("/clientes");
    return { id };
  });
}

// ---------------------------------------------------------------- fiado

const FORMAS_RECEBIMENTO: FormaRecebimento[] = ["DINHEIRO", "PIX", "DEBITO", "CREDITO"];

export async function receberPagamento(form: FormData): Promise<
  Resultado<{
    lancamentoId: number;
    clienteId: number;
    saldoNovo: number;
    entrouNoCaixa: boolean;
    maquininhaNome: string | null;
    /** Taxa da maquininha/forma lançada automaticamente em despesas (0 = nenhuma). */
    taxaValor: number;
    despesaId: number | null;
  }>
> {
  return executar(async () => {
    const sessao = await exigirSessaoAcao();
    const clienteId = campoInteiro(form, "clienteId");
    if (!clienteId) throw new Error("Cliente não informado.");

    const valor = parseReais(campo(form, "valor"));
    if (valor === null || valor <= 0) throw new Error("Informe o valor recebido.");

    const forma = campo(form, "forma") as FormaRecebimento;
    if (!FORMAS_RECEBIMENTO.includes(forma)) throw new Error("Escolha como o cliente pagou.");

    const maquininhaId = campoInteiro(form, "maquininhaId");
    if (maquininhaId !== null && maquininhaId <= 0) throw new Error("Maquininha inválida.");

    const resultado = await receberPagamentoFiado({
      clienteId,
      valor,
      forma,
      maquininhaId,
      nsu: campoOpcional(form, "nsu"),
      observacao: campoOpcional(form, "observacao"),
      usuarioId: sessao.usuarioId,
    });
    revalidarCliente(clienteId);
    revalidatePath("/caixa");
    if (resultado.despesaId !== null) revalidatePath("/financeiro/despesas");
    return { ...resultado, clienteId };
  });
}

export async function ajustarSaldo(
  form: FormData,
): Promise<Resultado<{ lancamentoId: number; clienteId: number; saldoNovo: number }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const clienteId = campoInteiro(form, "clienteId");
    if (!clienteId) throw new Error("Cliente não informado.");

    const tipo = campo(form, "tipo");
    if (tipo !== "DEBITO" && tipo !== "PAGAMENTO") throw new Error("Escolha o tipo do ajuste.");

    const valor = parseReais(campo(form, "valor"));
    if (valor === null || valor <= 0) throw new Error("Informe o valor do ajuste.");

    const observacao = campo(form, "observacao");
    if (observacao.length < 5) throw new Error("Explique o motivo do ajuste (pelo menos 5 letras).");

    const resultado = await ajustarSaldoFiado({ clienteId, tipo, valor, observacao, usuarioId: sessao.usuarioId });
    revalidarCliente(clienteId);
    return { ...resultado, clienteId };
  });
}
