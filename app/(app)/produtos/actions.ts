"use server";

import { revalidatePath } from "next/cache";
import { campo, campoBooleano, campoInteiro, falha, sucesso, tratarErro, type Resultado } from "@/lib/acao";
import { exigirAdminAcao, exigirSessaoAcao } from "@/lib/auth";
import { analisarCsv, destinoSeguro, esquemaCategoria, esquemaProduto } from "@/lib/servicos/produtos-calculos";
import {
  ErroDeCampo,
  atualizarProduto,
  criarProduto,
  definirAtivoProduto,
  excluirCategoria as excluirCategoriaNoBanco,
  excluirProduto as excluirProdutoNoBanco,
  importarProdutos,
  salvarCategoria as salvarCategoriaNoBanco,
  type ResumoImportacao,
} from "@/lib/servicos/produtos";

function tratarErroProdutos<T>(e: unknown): Resultado<T> {
  if (e instanceof ErroDeCampo) return falha(e.message, { [e.campo]: e.message });
  return tratarErro<T>(e);
}

function revalidarProdutos(id?: number) {
  revalidatePath("/produtos");
  if (id) revalidatePath(`/produtos/${id}`);
}

// ---------------------------------------------------------------- produto

/**
 * Cria (sem id) ou atualiza (com id) um produto.
 * Operador pode cadastrar e editar, mas o preço de custo só muda com ADMIN
 * (o campo chega desabilitado e o serviço ignora o valor mesmo assim).
 * Devolve `destino` pra onde ir depois de salvar (null = ficar na página).
 */
export async function salvarProduto(form: FormData): Promise<Resultado<{ id: number; destino: string | null }>> {
  try {
    const sessao = await exigirSessaoAcao();

    const dados = esquemaProduto.parse({
      id: campoInteiro(form, "id"),
      codigoBarras: campo(form, "codigoBarras"),
      codigoInterno: campo(form, "codigoInterno"),
      nome: campo(form, "nome"),
      descricao: campo(form, "descricao"),
      categoriaId: campo(form, "categoriaId"),
      unidade: campo(form, "unidade"),
      precoVenda: campo(form, "precoVenda"),
      precoCusto: sessao.papel === "ADMIN" && form.has("precoCusto") ? campo(form, "precoCusto") : null,
      precoPromocional: campo(form, "precoPromocional"),
      promocaoAte: campo(form, "promocaoAte"),
      estoqueInicial: campo(form, "estoqueInicial"),
      estoqueMinimo: campo(form, "estoqueMinimo"),
      controlaValidade: campoBooleano(form, "controlaValidade"),
      ativo: campoBooleano(form, "ativo"),
    });

    if (dados.id === null) {
      const produto = await criarProduto(dados, sessao);
      revalidarProdutos(produto.id);
      return sucesso({ id: produto.id, destino: destinoSeguro(campo(form, "voltar"), "/produtos") });
    }

    const produto = await atualizarProduto(dados.id, dados, sessao);
    revalidarProdutos(produto.id);
    return sucesso({ id: produto.id, destino: null });
  } catch (e) {
    return tratarErroProdutos(e);
  }
}

/** Desativa ou reativa (soft delete). Produto inativo some do caixa mas mantém o histórico. */
export async function alternarAtivoProduto(id: number, ativo: boolean): Promise<Resultado<{ ativo: boolean }>> {
  try {
    const sessao = await exigirSessaoAcao();
    if (!Number.isInteger(id) || id <= 0) return falha("Produto inválido.");
    const produto = await definirAtivoProduto(id, ativo, sessao.usuarioId);
    revalidarProdutos(id);
    return sucesso({ ativo: produto.ativo });
  } catch (e) {
    return tratarErroProdutos(e);
  }
}

/** Exclusão definitiva. Só ADMIN, e só se o produto nunca teve venda nem movimento. */
export async function excluirProduto(id: number): Promise<Resultado<{ destino: string }>> {
  try {
    const sessao = await exigirAdminAcao();
    if (!Number.isInteger(id) || id <= 0) return falha("Produto inválido.");
    await excluirProdutoNoBanco(id, sessao.usuarioId);
    revalidarProdutos(id);
    return sucesso({ destino: "/produtos" });
  } catch (e) {
    return tratarErroProdutos(e);
  }
}

// ---------------------------------------------------------------- categorias

export async function salvarCategoria(form: FormData): Promise<Resultado<{ id: number }>> {
  try {
    const sessao = await exigirSessaoAcao();
    const dados = esquemaCategoria.parse({
      id: campoInteiro(form, "id"),
      nome: campo(form, "nome"),
      cor: campo(form, "cor"),
      ordem: campo(form, "ordem"),
    });
    const categoria = await salvarCategoriaNoBanco(dados, sessao.usuarioId);
    revalidatePath("/produtos/categorias");
    revalidatePath("/produtos");
    return sucesso({ id: categoria.id });
  } catch (e) {
    return tratarErroProdutos(e);
  }
}

/** Só ADMIN. Categoria com produtos não pode ser excluída. */
export async function excluirCategoria(id: number): Promise<Resultado<undefined>> {
  try {
    const sessao = await exigirAdminAcao();
    if (!Number.isInteger(id) || id <= 0) return falha("Categoria inválida.");
    await excluirCategoriaNoBanco(id, sessao.usuarioId);
    revalidatePath("/produtos/categorias");
    revalidatePath("/produtos");
    return sucesso(undefined);
  } catch (e) {
    return tratarErroProdutos(e);
  }
}

// ---------------------------------------------------------------- importação CSV

/**
 * Recebe o texto do CSV (já decodificado no navegador) e importa as linhas
 * válidas. Só ADMIN, porque a importação altera preço de custo em massa.
 */
export async function importarProdutosCsv(
  form: FormData,
): Promise<Resultado<ResumoImportacao & { ignoradas: number; total: number }>> {
  try {
    const sessao = await exigirAdminAcao();
    const texto = campo(form, "csv");
    const ignorarComErro = campoBooleano(form, "ignorarComErro");
    if (!texto) return falha("Escolha um arquivo CSV antes de importar.");

    const analise = analisarCsv(texto);
    if (analise.erroGeral) return falha(analise.erroGeral);
    if (analise.comErro > 0 && !ignorarComErro) {
      return falha(
        `Há ${analise.comErro} ${analise.comErro === 1 ? "linha com erro" : "linhas com erro"}. Corrija o arquivo ou marque a opção de importar só as linhas válidas.`,
      );
    }
    const validas = analise.linhas.flatMap((l) => (l.dados ? [l.dados] : []));
    if (validas.length === 0) return falha("Nenhuma linha válida pra importar.");

    const resumo = await importarProdutos(validas, sessao.usuarioId);
    revalidatePath("/produtos");
    revalidatePath("/produtos/categorias");
    return sucesso({ ...resumo, ignoradas: analise.comErro, total: analise.total });
  } catch (e) {
    return tratarErroProdutos(e);
  }
}
