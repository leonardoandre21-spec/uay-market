"use server";

import { revalidatePath } from "next/cache";
import { exigirSessaoAcao } from "@/lib/auth";
import { executar, falha, sucesso, type Resultado } from "@/lib/acao";
import { buscarProdutoPorCodigo, buscarProdutosPorNome } from "@/lib/consultas";
import {
  buscarClientesPdv,
  buscarProdutoInativoPorCodigo,
  esquemaVenda,
  obterClientePdv,
  paraProdutoPdv,
  registrarVenda,
  type ClientePdv,
  type ProdutoPdv,
  type ResultadoRegistroVenda,
} from "@/lib/servicos/vendas";

/** Resultado do bipe: achou, não existe, ou existe mas está desativado (o caixa manda reativar, não cadastrar). */
export type BuscaProdutoPdv =
  | { tipo: "encontrado"; produto: ProdutoPdv }
  | { tipo: "inativo"; id: number; nome: string }
  | { tipo: "nao_encontrado" };

/** O que o leitor bipou (ou o operador digitou). */
export async function buscarProduto(codigo: string): Promise<Resultado<BuscaProdutoPdv>> {
  return executar(async () => {
    await exigirSessaoAcao();
    const c = String(codigo ?? "").trim();
    if (!c) return { tipo: "nao_encontrado" };
    const produto = await buscarProdutoPorCodigo(c);
    if (produto) return { tipo: "encontrado", produto: paraProdutoPdv(produto) };
    const inativo = await buscarProdutoInativoPorCodigo(c);
    return inativo ? { tipo: "inativo", id: inativo.id, nome: inativo.nome } : { tipo: "nao_encontrado" };
  });
}

/** Autocompletar por nome no caixa (mínimo 2 letras). */
export async function buscarProdutosNome(termo: string): Promise<Resultado<ProdutoPdv[]>> {
  return executar(async () => {
    await exigirSessaoAcao();
    const t = String(termo ?? "").trim();
    if (t.length < 2) return [];
    const produtos = await buscarProdutosPorNome(t, 12);
    return produtos.map(paraProdutoPdv);
  });
}

/** Busca cliente por nome, CPF ou telefone, já com saldo fiado. */
export async function buscarClientes(termo: string): Promise<Resultado<ClientePdv[]>> {
  return executar(async () => {
    await exigirSessaoAcao();
    return buscarClientesPdv(String(termo ?? ""));
  });
}

/** Reconfere o saldo de um cliente já selecionado. */
export async function recarregarCliente(clienteId: number): Promise<Resultado<ClientePdv | null>> {
  return executar(async () => {
    await exigirSessaoAcao();
    return obterClientePdv(Number(clienteId));
  });
}

/** Fecha a venda. Preço e custo são recarregados do banco; o cliente só manda quantidades e descontos. */
export async function registrarVendaAction(entrada: unknown): Promise<Resultado<ResultadoRegistroVenda>> {
  const sessao = await exigirSessaoAcao().catch(() => null);
  if (!sessao) return falha("Sessão expirada. Faça login novamente.");
  const parsed = esquemaVenda.safeParse(entrada);
  if (!parsed.success) {
    const primeira = parsed.error.issues[0];
    return falha(primeira?.message === "Adicione pelo menos um produto." ? primeira.message : "Dados da venda inválidos. Confira o carrinho e os pagamentos.");
  }
  const resultado = await executar(() => registrarVenda(parsed.data, { usuarioId: sessao.usuarioId, papel: sessao.papel }));
  if (resultado.ok) {
    revalidatePath("/vendas");
    revalidatePath("/caixa");
    return sucesso(resultado.dados);
  }
  return resultado;
}
