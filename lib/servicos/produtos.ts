import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ClienteDb } from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";
import { agora } from "@/lib/datas";
import { normalizarTexto } from "@/lib/utils";
import {
  IndiceProdutos,
  PRODUTOS_POR_PAGINA,
  promocaoCabeNoPreco,
  totalPaginas,
  valorEstoqueACusto,
  variantesCodigoBarras,
  type DadosCategoria,
  type DadosProduto,
  type FiltrosProdutos,
  type LinhaImportacao,
} from "@/lib/servicos/produtos-calculos";

// Acesso ao banco do módulo de produtos e categorias. Toda escrita que toca
// mais de uma tabela roda em transação. Estoque só muda via MovimentoEstoque.

/** Erro ligado a um campo do formulário (a action devolve em `campos`). */
export class ErroDeCampo extends Error {
  constructor(
    public readonly campo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeCampo";
  }
}

type SessaoMinima = { usuarioId: number; papel: "ADMIN" | "OPERADOR" };

// ---------------------------------------------------------------- listagem

/** Mesma regra de estoqueAbaixoDoMinimo(), do painel (gestao) e de situacaoEstoque(): mínimo definido e estoque abaixo dele. */
function whereAbaixoDoMinimo(): Prisma.ProdutoWhereInput {
  return { estoqueMinimo: { gt: 0 }, estoque: { lt: db.produto.fields.estoqueMinimo } };
}

function montarWhere(filtros: FiltrosProdutos): Prisma.ProdutoWhereInput {
  const condicoes: Prisma.ProdutoWhereInput[] = [];

  if (filtros.busca) {
    const termo = filtros.busca;
    condicoes.push({
      OR: [
        { nome: { contains: termo, mode: "insensitive" } },
        { descricao: { contains: termo, mode: "insensitive" } },
        { codigoBarras: { contains: termo, mode: "insensitive" } },
        { codigoInterno: { contains: termo, mode: "insensitive" } },
      ],
    });
  }

  if (filtros.categoria === "sem") condicoes.push({ categoriaId: null });
  else if (filtros.categoria) condicoes.push({ categoriaId: Number(filtros.categoria) });

  switch (filtros.situacao) {
    case "ativos":
      condicoes.push({ ativo: true });
      break;
    case "inativos":
      condicoes.push({ ativo: false });
      break;
    case "abaixo-minimo":
      condicoes.push({ ativo: true, ...whereAbaixoDoMinimo() });
      break;
    case "promocao":
      condicoes.push({
        ativo: true,
        precoPromocional: { gt: 0 },
        OR: [{ promocaoAte: null }, { promocaoAte: { gte: agora() } }],
      });
      break;
    case "todos":
      break;
  }

  return condicoes.length ? { AND: condicoes } : {};
}

const incluirCategoria = { categoria: { select: { id: true, nome: true, cor: true } } } satisfies Prisma.ProdutoInclude;

export type ProdutoDaLista = Prisma.ProdutoGetPayload<{ include: typeof incluirCategoria }>;

export async function listarProdutos(filtros: FiltrosProdutos): Promise<{
  produtos: ProdutoDaLista[];
  total: number;
  pagina: number;
  paginas: number;
}> {
  const where = montarWhere(filtros);
  const total = await db.produto.count({ where });
  const paginas = totalPaginas(total);
  const pagina = Math.min(filtros.pagina, paginas);
  const produtos = await db.produto.findMany({
    where,
    include: incluirCategoria,
    orderBy: [{ nome: "asc" }, { id: "asc" }],
    skip: (pagina - 1) * PRODUTOS_POR_PAGINA,
    take: PRODUTOS_POR_PAGINA,
  });
  return { produtos, total, pagina, paginas };
}

/** Todos os produtos que batem nos filtros, sem paginação (exportação). */
export async function listarProdutosParaExportar(filtros: FiltrosProdutos): Promise<ProdutoDaLista[]> {
  return db.produto.findMany({
    where: montarWhere(filtros),
    include: incluirCategoria,
    orderBy: [{ nome: "asc" }, { id: "asc" }],
  });
}

export type ResumoProdutos = {
  ativos: number;
  abaixoMinimo: number;
  emPromocao: number;
  valorEstoqueCusto: number;
};

export async function resumoProdutos(): Promise<ResumoProdutos> {
  const [ativos, abaixoMinimo, emPromocao, itens] = await Promise.all([
    db.produto.count({ where: { ativo: true } }),
    db.produto.count({ where: { ativo: true, ...whereAbaixoDoMinimo() } }),
    db.produto.count({
      where: { ativo: true, precoPromocional: { gt: 0 }, OR: [{ promocaoAte: null }, { promocaoAte: { gte: agora() } }] },
    }),
    db.produto.findMany({ where: { ativo: true }, select: { estoque: true, precoCusto: true } }),
  ]);
  return { ativos, abaixoMinimo, emPromocao, valorEstoqueCusto: valorEstoqueACusto(itens) };
}

// ---------------------------------------------------------------- detalhe

const incluirDetalhe = {
  categoria: true,
  historicoPrecos: {
    orderBy: { criadoEm: "desc" },
    take: 50,
    include: { usuario: { select: { nome: true } } },
  },
  movimentos: {
    orderBy: { criadoEm: "desc" },
    take: 20,
    include: { usuario: { select: { nome: true } }, venda: { select: { numero: true } } },
  },
  lotes: { where: { quantidade: { gt: 0 } }, orderBy: { validade: "asc" } },
  _count: { select: { itensVenda: true, movimentos: true, itensEntrada: true, perdas: true, lotes: true } },
} satisfies Prisma.ProdutoInclude;

export type ProdutoDetalhado = Prisma.ProdutoGetPayload<{ include: typeof incluirDetalhe }>;

export async function obterProdutoDetalhado(id: number): Promise<ProdutoDetalhado | null> {
  return db.produto.findUnique({ where: { id }, include: incluirDetalhe });
}

/** Produto pode ser apagado de verdade só se nunca teve venda, entrada, perda, lote ou movimento. */
export function produtoPodeSerExcluido(p: { _count: ProdutoDetalhado["_count"] }): boolean {
  const c = p._count;
  return c.itensVenda === 0 && c.movimentos === 0 && c.itensEntrada === 0 && c.perdas === 0 && c.lotes === 0;
}

// ---------------------------------------------------------------- escrita de produto

/**
 * O caixa procura o código bipado nos dois campos (buscarProdutoPorCodigo),
 * então um código não pode existir em nenhum dos dois campos de outro produto,
 * nem como EAN-13/UPC-A com ou sem o zero à esquerda.
 */
async function garantirCodigosLivres(
  tx: ClienteDb,
  codigoBarras: string | null,
  codigoInterno: string | null,
  ignorarId: number | null,
): Promise<void> {
  const semOProprio = ignorarId ? { NOT: { id: ignorarId } } : {};
  const donoDoCodigo = (codigo: string) =>
    tx.produto.findFirst({
      where: { OR: [{ codigoBarras: { in: variantesCodigoBarras(codigo) } }, { codigoInterno: codigo }], ...semOProprio },
      select: { nome: true, codigoInterno: true },
    });
  const mensagem = (outro: { nome: string; codigoInterno: string | null }, codigo: string) =>
    `Já existe um produto com esse código${outro.codigoInterno === codigo ? " (como código interno)" : " de barras"}: "${outro.nome}".`;

  if (codigoBarras) {
    const outro = await donoDoCodigo(codigoBarras);
    if (outro) throw new ErroDeCampo("codigoBarras", mensagem(outro, codigoBarras));
  }
  if (codigoInterno) {
    const outro = await donoDoCodigo(codigoInterno);
    if (outro) throw new ErroDeCampo("codigoInterno", mensagem(outro, codigoInterno));
  }
}

async function garantirCategoriaExiste(tx: ClienteDb, categoriaId: number | null): Promise<void> {
  if (categoriaId === null) return;
  const existe = await tx.categoria.findUnique({ where: { id: categoriaId }, select: { id: true } });
  if (!existe) throw new ErroDeCampo("categoriaId", "Essa categoria não existe mais. Escolha outra.");
}

export async function criarProduto(dados: DadosProduto, sessao: SessaoMinima) {
  const podeEditarCusto = sessao.papel === "ADMIN";
  return db.$transaction(async (tx) => {
    await garantirCodigosLivres(tx, dados.codigoBarras, dados.codigoInterno, null);
    await garantirCategoriaExiste(tx, dados.categoriaId);

    const estoqueInicial = dados.estoqueInicial ?? 0;
    const precoCusto = podeEditarCusto ? (dados.precoCusto ?? 0) : 0;

    const produto = await tx.produto.create({
      data: {
        codigoBarras: dados.codigoBarras,
        codigoInterno: dados.codigoInterno,
        nome: dados.nome,
        descricao: dados.descricao,
        categoriaId: dados.categoriaId,
        unidade: dados.unidade,
        precoVenda: dados.precoVenda,
        precoCusto,
        precoPromocional: dados.precoPromocional,
        promocaoAte: dados.precoPromocional !== null ? dados.promocaoAte : null,
        estoque: estoqueInicial,
        estoqueMinimo: dados.estoqueMinimo,
        controlaValidade: dados.controlaValidade,
        ativo: dados.ativo,
      },
    });

    if (estoqueInicial !== 0) {
      await tx.movimentoEstoque.create({
        data: {
          produtoId: produto.id,
          tipo: "AJUSTE",
          quantidade: estoqueInicial,
          estoqueApos: estoqueInicial,
          custoUnitario: precoCusto,
          motivo: "Estoque inicial",
          usuarioId: sessao.usuarioId,
        },
      });
    }

    await registrarAuditoria(
      {
        usuarioId: sessao.usuarioId,
        acao: "produto.criar",
        entidade: "Produto",
        entidadeId: produto.id,
        detalhes: { nome: produto.nome, precoVenda: produto.precoVenda, precoCusto, estoqueInicial },
      },
      tx,
    );

    return produto;
  });
}

export async function atualizarProduto(id: number, dados: DadosProduto, sessao: SessaoMinima) {
  const podeEditarCusto = sessao.papel === "ADMIN";
  return db.$transaction(async (tx) => {
    const atual = await tx.produto.findUnique({ where: { id } });
    if (!atual) throw new Error("Produto não encontrado. Ele pode ter sido excluído.");

    await garantirCodigosLivres(tx, dados.codigoBarras, dados.codigoInterno, id);
    await garantirCategoriaExiste(tx, dados.categoriaId);

    const precoCustoNovo = podeEditarCusto && dados.precoCusto !== null ? dados.precoCusto : atual.precoCusto;
    const precoMudou = atual.precoVenda !== dados.precoVenda || atual.precoCusto !== precoCustoNovo;

    const produto = await tx.produto.update({
      where: { id },
      data: {
        codigoBarras: dados.codigoBarras,
        codigoInterno: dados.codigoInterno,
        nome: dados.nome,
        descricao: dados.descricao,
        categoriaId: dados.categoriaId,
        unidade: dados.unidade,
        precoVenda: dados.precoVenda,
        precoCusto: precoCustoNovo,
        precoPromocional: dados.precoPromocional,
        promocaoAte: dados.precoPromocional !== null ? dados.promocaoAte : null,
        estoqueMinimo: dados.estoqueMinimo,
        controlaValidade: dados.controlaValidade,
        ativo: dados.ativo,
      },
    });

    if (precoMudou) {
      await tx.historicoPreco.create({
        data: {
          produtoId: id,
          precoVendaAnterior: atual.precoVenda,
          precoVendaNovo: dados.precoVenda,
          precoCustoAnterior: atual.precoCusto,
          precoCustoNovo,
          usuarioId: sessao.usuarioId,
        },
      });
      await registrarAuditoria(
        {
          usuarioId: sessao.usuarioId,
          acao: "produto.preco",
          entidade: "Produto",
          entidadeId: id,
          detalhes: {
            precoVenda: { de: atual.precoVenda, para: dados.precoVenda },
            precoCusto: { de: atual.precoCusto, para: precoCustoNovo },
          },
        },
        tx,
      );
    }

    const alteracoes: Record<string, { de: unknown; para: unknown }> = {};
    const comparar = <K extends keyof typeof atual>(chave: K, novo: (typeof atual)[K]) => {
      const antigo = atual[chave];
      const iguais =
        antigo instanceof Date && novo instanceof Date ? antigo.getTime() === novo.getTime() : antigo === novo;
      if (!iguais) alteracoes[chave as string] = { de: antigo, para: novo };
    };
    comparar("nome", produto.nome);
    comparar("codigoBarras", produto.codigoBarras);
    comparar("codigoInterno", produto.codigoInterno);
    comparar("categoriaId", produto.categoriaId);
    comparar("unidade", produto.unidade);
    comparar("precoPromocional", produto.precoPromocional);
    comparar("promocaoAte", produto.promocaoAte);
    comparar("estoqueMinimo", produto.estoqueMinimo);
    comparar("controlaValidade", produto.controlaValidade);
    comparar("ativo", produto.ativo);

    if (Object.keys(alteracoes).length) {
      await registrarAuditoria(
        { usuarioId: sessao.usuarioId, acao: "produto.editar", entidade: "Produto", entidadeId: id, detalhes: alteracoes },
        tx,
      );
    }

    return produto;
  });
}

export async function definirAtivoProduto(id: number, ativo: boolean, usuarioId: number) {
  return db.$transaction(async (tx) => {
    const atual = await tx.produto.findUnique({ where: { id }, select: { id: true, nome: true, ativo: true } });
    if (!atual) throw new Error("Produto não encontrado. Ele pode ter sido excluído.");
    const produto = await tx.produto.update({ where: { id }, data: { ativo } });
    await registrarAuditoria(
      {
        usuarioId,
        acao: ativo ? "produto.reativar" : "produto.desativar",
        entidade: "Produto",
        entidadeId: id,
        detalhes: { nome: atual.nome },
      },
      tx,
    );
    return produto;
  });
}

/** Exclusão definitiva. Só quando o produto nunca teve movimento nem venda. */
export async function excluirProduto(id: number, usuarioId: number): Promise<void> {
  await db.$transaction(async (tx) => {
    const produto = await tx.produto.findUnique({
      where: { id },
      include: { _count: { select: { itensVenda: true, movimentos: true, itensEntrada: true, perdas: true, lotes: true } } },
    });
    if (!produto) throw new Error("Produto não encontrado. Ele pode já ter sido excluído.");
    if (!produtoPodeSerExcluido(produto)) {
      throw new Error("Este produto já tem vendas ou movimentos de estoque e não pode ser apagado. Desative-o para tirar do caixa.");
    }
    await tx.produto.delete({ where: { id } });
    await registrarAuditoria(
      {
        usuarioId,
        acao: "produto.excluir",
        entidade: "Produto",
        entidadeId: id,
        detalhes: { nome: produto.nome, codigoBarras: produto.codigoBarras, precoVenda: produto.precoVenda },
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------- categorias

export type CategoriaComContagem = Prisma.CategoriaGetPayload<{ include: { _count: { select: { produtos: true } } } }>;

export async function listarCategoriasComContagem(): Promise<CategoriaComContagem[]> {
  return db.categoria.findMany({
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    include: { _count: { select: { produtos: true } } },
  });
}

export async function salvarCategoria(dados: DadosCategoria, usuarioId: number) {
  return db.$transaction(async (tx) => {
    const todas = await tx.categoria.findMany({ select: { id: true, nome: true } });
    const chave = normalizarTexto(dados.nome);
    const repetida = todas.find((c) => normalizarTexto(c.nome) === chave && c.id !== dados.id);
    if (repetida) throw new ErroDeCampo("nome", `Já existe a categoria "${repetida.nome}".`);

    if (dados.id === null) {
      const criada = await tx.categoria.create({ data: { nome: dados.nome, cor: dados.cor, ordem: dados.ordem } });
      await registrarAuditoria(
        { usuarioId, acao: "categoria.criar", entidade: "Categoria", entidadeId: criada.id, detalhes: { nome: criada.nome } },
        tx,
      );
      return criada;
    }

    const existe = todas.some((c) => c.id === dados.id);
    if (!existe) throw new Error("Categoria não encontrada. Ela pode ter sido excluída.");
    const atualizada = await tx.categoria.update({
      where: { id: dados.id },
      data: { nome: dados.nome, cor: dados.cor, ordem: dados.ordem },
    });
    await registrarAuditoria(
      { usuarioId, acao: "categoria.editar", entidade: "Categoria", entidadeId: atualizada.id, detalhes: { nome: atualizada.nome } },
      tx,
    );
    return atualizada;
  });
}

export async function excluirCategoria(id: number, usuarioId: number): Promise<void> {
  await db.$transaction(async (tx) => {
    const categoria = await tx.categoria.findUnique({
      where: { id },
      include: { _count: { select: { produtos: true } } },
    });
    if (!categoria) throw new Error("Categoria não encontrada. Ela pode já ter sido excluída.");
    const n = categoria._count.produtos;
    if (n > 0) {
      throw new Error(
        `A categoria "${categoria.nome}" tem ${n} ${n === 1 ? "produto" : "produtos"}. Mova esses produtos pra outra categoria antes de excluir.`,
      );
    }
    await tx.categoria.delete({ where: { id } });
    await registrarAuditoria(
      { usuarioId, acao: "categoria.excluir", entidade: "Categoria", entidadeId: id, detalhes: { nome: categoria.nome } },
      tx,
    );
  });
}

// ---------------------------------------------------------------- importação CSV

export type ResumoImportacao = {
  criados: number;
  atualizados: number;
  categoriasCriadas: number;
  /** Promoções apagadas porque o preço novo da planilha ficou igual ou abaixo do promocional. */
  promocoesRemovidas: number;
};

type ProdutoIndexado = {
  id: number;
  codigoBarras: string | null;
  codigoInterno: string | null;
  nome: string;
  precoVenda: number;
  precoCusto: number;
  precoPromocional: number | null;
};

/**
 * Importa linhas já validadas. Produto com o mesmo código (de barras ou
 * interno, em qualquer um dos dois campos, como o caixa procura) ou com o
 * mesmo nome quando a linha não tem código é atualizado: nome, preços,
 * categoria, descrição e mínimo. Promoção que ficaria igual ou acima do preço
 * novo é apagada. Estoque só entra em produto novo (movimento AJUSTE
 * "Estoque inicial (importação)"). Tudo numa transação.
 */
export async function importarProdutos(linhas: LinhaImportacao[], usuarioId: number): Promise<ResumoImportacao> {
  return db.$transaction(
    async (tx) => {
      const categorias = await tx.categoria.findMany({ select: { id: true, nome: true } });
      const categoriaPorNome = new Map(categorias.map((c) => [normalizarTexto(c.nome), c.id]));
      let proximaOrdem = categorias.length;

      const existentes: ProdutoIndexado[] = await tx.produto.findMany({
        select: {
          id: true,
          codigoBarras: true,
          codigoInterno: true,
          nome: true,
          precoVenda: true,
          precoCusto: true,
          precoPromocional: true,
        },
      });
      const indice = new IndiceProdutos(existentes);

      let criados = 0;
      let atualizados = 0;
      let categoriasCriadas = 0;
      let promocoesRemovidas = 0;

      for (const linha of linhas) {
        let categoriaId: number | null = null;
        if (linha.categoria) {
          const chave = normalizarTexto(linha.categoria);
          let id = categoriaPorNome.get(chave);
          if (id === undefined) {
            const nova = await tx.categoria.create({ data: { nome: linha.categoria, ordem: proximaOrdem++ } });
            id = nova.id;
            categoriaPorNome.set(chave, id);
            categoriasCriadas++;
          }
          categoriaId = id;
        }

        const alvo = indice.alvoDaLinha(linha);

        if (alvo) {
          // Só grava um código se ele ainda não for do alvo (em qualquer campo) e não pertencer a outro produto.
          const gravar = (codigo: string | null): codigo is string =>
            !!codigo && !indice.codigoEhDoProduto(codigo, alvo) && !indice.ocupadoPorOutro(codigo, alvo.id);
          const gravarBarras = gravar(linha.codigoBarras);
          const gravarInterno = gravar(linha.codigoInterno);
          const precoCustoNovo = linha.precoCusto ?? alvo.precoCusto;
          // A planilha não traz promoção; se a que existe ficaria igual ou acima do preço novo, o caixa
          // cobraria o promocional mais caro que o normal. Apaga a promoção e avisa no resumo.
          const removerPromocao = !promocaoCabeNoPreco(alvo.precoPromocional, linha.precoVenda);

          await tx.produto.update({
            where: { id: alvo.id },
            data: {
              nome: linha.nome,
              descricao: linha.descricao ?? undefined,
              categoriaId: categoriaId ?? undefined,
              precoVenda: linha.precoVenda,
              precoCusto: precoCustoNovo,
              estoqueMinimo: linha.estoqueMinimo ?? undefined,
              codigoBarras: gravarBarras ? linha.codigoBarras : undefined,
              codigoInterno: gravarInterno ? linha.codigoInterno : undefined,
              ...(removerPromocao ? { precoPromocional: null, promocaoAte: null } : {}),
            },
          });
          if (removerPromocao) {
            promocoesRemovidas++;
            await registrarAuditoria(
              {
                usuarioId,
                acao: "produto.promocao",
                entidade: "Produto",
                entidadeId: alvo.id,
                detalhes: {
                  precoVenda: linha.precoVenda,
                  precoPromocionalAnterior: alvo.precoPromocional,
                  precoPromocional: null,
                  motivo: "Preço de venda importado igual ou abaixo do promocional",
                  origem: "importacao",
                },
              },
              tx,
            );
          }

          if (alvo.precoVenda !== linha.precoVenda || alvo.precoCusto !== precoCustoNovo) {
            await tx.historicoPreco.create({
              data: {
                produtoId: alvo.id,
                precoVendaAnterior: alvo.precoVenda,
                precoVendaNovo: linha.precoVenda,
                precoCustoAnterior: alvo.precoCusto,
                precoCustoNovo,
                usuarioId,
              },
            });
          }

          alvo.nome = linha.nome;
          alvo.precoVenda = linha.precoVenda;
          alvo.precoCusto = precoCustoNovo;
          if (removerPromocao) alvo.precoPromocional = null;
          if (gravarBarras) alvo.codigoBarras = linha.codigoBarras;
          if (gravarInterno) alvo.codigoInterno = linha.codigoInterno;
          indice.indexar(alvo);
          atualizados++;
          continue;
        }

        const estoque = linha.estoque ?? 0;
        const precoCusto = linha.precoCusto ?? 0;
        // Sem alvo, nenhum dos códigos da linha existe em produto algum (alvoDaLinha olha os dois campos),
        // então dá pra gravar os dois sem duplicar o que o caixa já encontra.
        const criado = await tx.produto.create({
          data: {
            codigoBarras: linha.codigoBarras,
            codigoInterno: linha.codigoInterno,
            nome: linha.nome,
            descricao: linha.descricao,
            categoriaId,
            unidade: linha.unidade,
            precoVenda: linha.precoVenda,
            precoCusto,
            estoque,
            estoqueMinimo: linha.estoqueMinimo ?? 0,
          },
        });
        if (estoque !== 0) {
          await tx.movimentoEstoque.create({
            data: {
              produtoId: criado.id,
              tipo: "AJUSTE",
              quantidade: estoque,
              estoqueApos: estoque,
              custoUnitario: precoCusto,
              motivo: "Estoque inicial (importação)",
              usuarioId,
            },
          });
        }
        indice.indexar({
          id: criado.id,
          codigoBarras: criado.codigoBarras,
          codigoInterno: criado.codigoInterno,
          nome: criado.nome,
          precoVenda: criado.precoVenda,
          precoCusto: criado.precoCusto,
          precoPromocional: criado.precoPromocional,
        });
        criados++;
      }

      await registrarAuditoria(
        {
          usuarioId,
          acao: "produto.importar",
          entidade: "Produto",
          detalhes: { linhas: linhas.length, criados, atualizados, categoriasCriadas, promocoesRemovidas },
        },
        tx,
      );

      return { criados, atualizados, categoriasCriadas, promocoesRemovidas };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}
