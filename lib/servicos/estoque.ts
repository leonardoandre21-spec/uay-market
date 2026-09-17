import "server-only";
import { cnpjValido, normalizarCnpj, normalizarTexto } from "@/lib/utils";
import type { MotivoPerda, Papel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { listarCategorias, obterConfiguracao, type ClienteDb } from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";
import { addDays, agora, diasAte, formatarData, formatarDataHora, limitesDoDia, paraDataInput, noFuso } from "@/lib/datas";
import { formatarPercentual, formatarQuantidade, formatarQuantidadeComUnidade, formatarReais, totalLinha } from "@/lib/dinheiro";
import { ROTULO_MOTIVO_PERDA } from "@/lib/rotulos";
import {
  aplicarCustoMedio,
  calcularAjuste,
  calcularParcelas,
  classificarFaixaVencimento,
  distribuirBaixaAjuste,
  entradaEstornada,
  prepararItensEntrada,
  quantidadeCompativelComUnidade,
  reverterCustoMedio,
  situacaoEstoque,
  subtotalItens,
  valorDoEstoque,
  valorEmEstoque,
  verificarEstornoEntrada,
  type FaixaVencimento,
  type MotivoBloqueioEstorno,
  type PedidoAjuste,
  type SituacaoEstoque,
} from "@/lib/servicos/estoque-calculos";
import { promocaoVigente } from "@/lib/servicos/produtos-calculos";
import { limiteDesconto, tetoDescontoParaPapel } from "@/lib/servicos/vendas-calculos";

// Acesso ao banco do módulo de estoque. Leituras devolvem objetos prontos pra
// tela (datas já formatadas quando vão pra Client Component). Escritas rodam
// em transação e registram MovimentoEstoque + auditoria.

const OPCOES_TRANSACAO = { maxWait: 10_000, timeout: 30_000 } as const;

// ---------------------------------------------------------------- tipos de leitura

export type ProdutoEstoque = {
  id: number;
  nome: string;
  codigoBarras: string | null;
  codigoInterno: string | null;
  unidade: "UN" | "KG";
  categoriaId: number | null;
  categoriaNome: string | null;
  estoque: number;
  estoqueMinimo: number;
  precoCusto: number;
  precoVenda: number;
  controlaValidade: boolean;
  valorCusto: number;
  valorVenda: number;
  situacao: SituacaoEstoque;
};

export type VisaoGeralEstoque = {
  produtos: ProdutoEstoque[];
  categorias: Array<{ id: number; nome: string }>;
  indicadores: {
    valorCusto: number;
    valorVenda: number;
    totalProdutos: number;
    abaixoMinimo: number;
    zerados: number;
    negativos: number;
    vencendo: { lotes: number; valorCusto: number; vencidos: number; dias: number };
  };
};

export async function obterVisaoGeralEstoque(): Promise<VisaoGeralEstoque> {
  const [produtosDb, config, categorias] = await Promise.all([
    db.produto.findMany({ where: { ativo: true }, include: { categoria: true }, orderBy: { nome: "asc" } }),
    obterConfiguracao(),
    listarCategorias(),
  ]);

  const dias = config.alertaVencimentoDias;
  const limite = limitesDoDia(addDays(agora(), dias)).fim;
  const lotesVencendo = await db.lote.findMany({
    where: { quantidade: { gt: 0 }, validade: { lte: limite }, produto: { ativo: true } },
    select: { quantidade: true, custoUnitario: true, validade: true },
  });

  const produtos: ProdutoEstoque[] = produtosDb.map((p) => ({
    id: p.id,
    nome: p.nome,
    codigoBarras: p.codigoBarras,
    codigoInterno: p.codigoInterno,
    unidade: p.unidade,
    categoriaId: p.categoriaId,
    categoriaNome: p.categoria?.nome ?? null,
    estoque: p.estoque,
    estoqueMinimo: p.estoqueMinimo,
    precoCusto: p.precoCusto,
    precoVenda: p.precoVenda,
    controlaValidade: p.controlaValidade,
    valorCusto: valorEmEstoque(p.estoque, p.precoCusto),
    valorVenda: valorEmEstoque(p.estoque, p.precoVenda),
    situacao: situacaoEstoque(p.estoque, p.estoqueMinimo),
  }));

  const valores = valorDoEstoque(produtosDb);
  let vencidos = 0;
  let valorVencendo = 0;
  for (const l of lotesVencendo) {
    if (diasAte(l.validade) < 0) vencidos += 1;
    valorVencendo += totalLinha(l.quantidade, l.custoUnitario);
  }

  return {
    produtos,
    categorias: categorias.map((c) => ({ id: c.id, nome: c.nome })),
    indicadores: {
      valorCusto: valores.custo,
      valorVenda: valores.venda,
      totalProdutos: produtos.length,
      abaixoMinimo: produtos.filter((p) => p.situacao === "ABAIXO_MINIMO").length,
      zerados: produtos.filter((p) => p.situacao === "ZERADO").length,
      negativos: produtos.filter((p) => p.situacao === "NEGATIVO").length,
      vencendo: { lotes: lotesVencendo.length, valorCusto: valorVencendo, vencidos, dias },
    },
  };
}

// ---------------------------------------------------------------- extrato

export const MOVIMENTOS_POR_PAGINA = 100;

export async function obterExtratoProduto(produtoId: number, pagina = 1) {
  const produto = await db.produto.findUnique({ where: { id: produtoId }, include: { categoria: true } });
  if (!produto) return null;

  const paginaAtual = Math.max(1, pagina);
  const [total, movimentos] = await Promise.all([
    db.movimentoEstoque.count({ where: { produtoId } }),
    db.movimentoEstoque.findMany({
      where: { produtoId },
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      skip: (paginaAtual - 1) * MOVIMENTOS_POR_PAGINA,
      take: MOVIMENTOS_POR_PAGINA,
      include: {
        venda: { select: { id: true, numero: true } },
        entrada: { select: { id: true, numeroNota: true, fornecedor: { select: { nome: true } } } },
        perda: { select: { id: true, motivo: true } },
        usuario: { select: { nome: true } },
      },
    }),
  ]);

  const [entradas, saidas] = await Promise.all([
    db.movimentoEstoque.aggregate({ where: { produtoId, quantidade: { gt: 0 } }, _sum: { quantidade: true } }),
    db.movimentoEstoque.aggregate({ where: { produtoId, quantidade: { lt: 0 } }, _sum: { quantidade: true } }),
  ]);

  return {
    produto,
    movimentos,
    total,
    pagina: paginaAtual,
    totalPaginas: Math.max(1, Math.ceil(total / MOVIMENTOS_POR_PAGINA)),
    somaEntradas: entradas._sum.quantidade ?? 0,
    somaSaidas: saidas._sum.quantidade ?? 0,
  };
}

// ---------------------------------------------------------------- entradas (leitura)

export async function listarEntradas(filtro: { de?: Date | null; ate?: Date | null } = {}) {
  const where: Prisma.EntradaEstoqueWhereInput = {};
  if (filtro.de || filtro.ate) {
    where.data = {
      ...(filtro.de ? { gte: filtro.de } : {}),
      ...(filtro.ate ? { lte: filtro.ate } : {}),
    };
  }
  const entradas = await db.entradaEstoque.findMany({
    where,
    orderBy: [{ data: "desc" }, { id: "desc" }],
    include: {
      fornecedor: { select: { nome: true } },
      usuario: { select: { nome: true } },
      estornadaPor: { select: { nome: true } },
      _count: { select: { itens: true, contas: true } },
    },
  });
  return entradas.map((e) => ({ ...e, estornada: entradaEstornada(e) }));
}

export async function obterEntradaDetalhada(id: number) {
  const entrada = await db.entradaEstoque.findUnique({
    where: { id },
    include: {
      fornecedor: true,
      usuario: { select: { nome: true } },
      estornadaPor: { select: { nome: true } },
      itens: {
        orderBy: { id: "asc" },
        include: {
          produto: {
            select: {
              id: true,
              nome: true,
              unidade: true,
              codigoBarras: true,
              codigoInterno: true,
              controlaValidade: true,
              estoque: true,
              precoCusto: true,
            },
          },
        },
      },
      lotes: {
        orderBy: { validade: "asc" },
        include: { _count: { select: { itensVenda: true, perdas: true } } },
      },
      contas: { orderBy: [{ vencimento: "asc" }, { id: "asc" }] },
      movimentos: { select: { id: true, tipo: true, quantidade: true } },
    },
  });
  if (!entrada) return null;

  const preparados = prepararItensEntrada(
    entrada.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, custoUnitario: i.custoUnitario })),
    entrada.frete,
  );
  const itens = entrada.itens.map((item, i) => ({
    ...item,
    valorItem: preparados[i].valorItem,
    freteRateado: preparados[i].freteRateado,
    custoEfetivo: preparados[i].custoEfetivo,
  }));

  const estornada = entradaEstornada(entrada);
  const bloqueios = verificarEstornoEntrada({
    estornadaEm: entrada.estornadaEm,
    itens: entrada.itens.map((i) => ({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      estoqueAtual: i.produto.estoque,
    })),
    lotes: entrada.lotes.map((l) => ({
      produtoId: l.produtoId,
      quantidade: l.quantidade,
      consumos: l._count.itensVenda + l._count.perdas,
    })),
    contas: entrada.contas.map((c) => ({ id: c.id, status: c.status })),
  });

  return {
    ...entrada,
    itens,
    estornada,
    bloqueiosEstorno: bloqueios,
    motivosBloqueio: descreverBloqueios(bloqueios, entrada.itens.map((i) => i.produto)),
    total: entrada.valorTotal + entrada.frete,
  };
}

/** Lança erro legível quando a quantidade não cabe na unidade do produto (UN só aceita inteiro). */
function exigirQuantidadeCompativel(produto: { nome: string; unidade: "UN" | "KG" }, quantidade: number) {
  if (!quantidadeCompativelComUnidade(quantidade, produto.unidade)) {
    throw new Error(`"${produto.nome}" é vendido por unidade: informe uma quantidade inteira, sem fração.`);
  }
}

function descreverBloqueios(
  bloqueios: MotivoBloqueioEstorno[],
  produtos: Array<{ id: number; nome: string; unidade: "UN" | "KG" }>,
): string[] {
  const nome = (id: number) => produtos.find((p) => p.id === id)?.nome ?? `produto ${id}`;
  const unidade = (id: number) => produtos.find((p) => p.id === id)?.unidade ?? "UN";
  return bloqueios.map((b) => {
    switch (b.tipo) {
      case "JA_ESTORNADA":
        return "Esta entrada já foi estornada.";
      case "LOTE_CONSUMIDO":
        return `Parte do lote de "${nome(b.produtoId)}" já foi vendida ou baixada como perda.`;
      case "ESTOQUE_INSUFICIENTE":
        return `"${nome(b.produtoId)}" tem ${formatarQuantidadeComUnidade(b.estoqueAtual, unidade(b.produtoId))} em estoque, menos que ${formatarQuantidadeComUnidade(b.necessario, unidade(b.produtoId))} que entraram.`;
      case "BOLETO_PAGO":
        return `O boleto nº ${b.contaId} vinculado a esta entrada já foi pago. Estorne o pagamento no Financeiro antes.`;
    }
  });
}

// ---------------------------------------------------------------- perdas (leitura)

export async function listarPerdas(filtro: { de: Date; ate: Date }) {
  return db.perda.findMany({
    where: { data: { gte: filtro.de, lte: filtro.ate } },
    orderBy: [{ data: "desc" }, { id: "desc" }],
    include: {
      produto: { select: { id: true, nome: true, unidade: true } },
      lote: { select: { id: true, validade: true, codigo: true } },
      usuario: { select: { nome: true } },
    },
  });
}

export type LoteDisponivel = {
  id: number;
  codigo: string | null;
  validade: string; // formatada dd/MM/yyyy
  validadeIso: string;
  diasRestantes: number;
  quantidade: number;
  custoUnitario: number;
};

export async function listarLotesDisponiveis(produtoId: number): Promise<LoteDisponivel[]> {
  const lotes = await db.lote.findMany({
    where: { produtoId, quantidade: { gt: 0 } },
    orderBy: [{ validade: "asc" }, { id: "asc" }],
  });
  return lotes.map((l) => ({
    id: l.id,
    codigo: l.codigo,
    validade: formatarData(l.validade),
    validadeIso: l.validade.toISOString(),
    diasRestantes: diasAte(l.validade),
    quantidade: l.quantidade,
    custoUnitario: l.custoUnitario,
  }));
}

// ---------------------------------------------------------------- vencimentos (leitura)

export type LoteVencimento = {
  id: number;
  codigo: string | null;
  validade: string;
  validadeInput: string;
  diasRestantes: number;
  faixa: FaixaVencimento;
  quantidade: number;
  custoUnitario: number;
  valorCusto: number;
  entradaId: number | null;
  produto: {
    id: number;
    nome: string;
    unidade: "UN" | "KG";
    codigoBarras: string | null;
    codigoInterno: string | null;
    categoriaNome: string | null;
    precoVenda: number;
    precoCusto: number;
    precoPromocional: number | null;
    promocaoAte: string | null;
    /** Promoção vigente agora (preço promocional preenchido e data final não passou; sem data = vale sempre). */
    emPromocao: boolean;
    estoque: number;
    controlaValidade: boolean;
  };
};

export async function listarLotesComSaldo(): Promise<LoteVencimento[]> {
  const lotes = await db.lote.findMany({
    where: { quantidade: { gt: 0 }, produto: { ativo: true } },
    orderBy: [{ validade: "asc" }, { id: "asc" }],
    include: { produto: { include: { categoria: { select: { nome: true } } } } },
  });
  const referencia = agora();
  return lotes.map((l) => {
    const dias = diasAte(l.validade);
    return {
      id: l.id,
      codigo: l.codigo,
      validade: formatarData(l.validade),
      validadeInput: paraDataInput(l.validade),
      diasRestantes: dias,
      faixa: classificarFaixaVencimento(dias),
      quantidade: l.quantidade,
      custoUnitario: l.custoUnitario,
      valorCusto: totalLinha(l.quantidade, l.custoUnitario),
      entradaId: l.entradaId,
      produto: {
        id: l.produto.id,
        nome: l.produto.nome,
        unidade: l.produto.unidade,
        codigoBarras: l.produto.codigoBarras,
        codigoInterno: l.produto.codigoInterno,
        categoriaNome: l.produto.categoria?.nome ?? null,
        precoVenda: l.produto.precoVenda,
        precoCusto: l.produto.precoCusto,
        precoPromocional: l.produto.precoPromocional,
        promocaoAte: l.produto.promocaoAte ? formatarData(l.produto.promocaoAte) : null,
        emPromocao: promocaoVigente(l.produto, referencia),
        estoque: l.produto.estoque,
        controlaValidade: l.produto.controlaValidade,
      },
    };
  });
}

// ---------------------------------------------------------------- ajuste

export async function ajustarEstoque(params: {
  produtoId: number;
  pedido: PedidoAjuste;
  motivo: string;
  usuarioId: number;
}) {
  return db.$transaction(async (tx) => {
    const produto = await tx.produto.findUnique({ where: { id: params.produtoId } });
    if (!produto || !produto.ativo) throw new Error("Produto não encontrado ou inativo.");

    const { diferenca, estoqueApos } = calcularAjuste(produto.estoque, params.pedido);
    if (diferenca === 0) throw new Error("A quantidade informada é igual ao estoque atual. Nada a ajustar.");
    exigirQuantidadeCompativel(produto, "novaQuantidade" in params.pedido ? params.pedido.novaQuantidade : diferenca);

    // Ajuste pra baixo também sai dos lotes (do que vence primeiro), senão a
    // tela de vencimentos e o FEFO da venda continuam contando o que não existe.
    const lotes = await tx.lote.findMany({
      where: { produtoId: produto.id, quantidade: { gt: 0 } },
      orderBy: [{ validade: "asc" }, { id: "asc" }],
      select: { id: true, quantidade: true },
    });
    const baixasLotes = distribuirBaixaAjuste(lotes, diferenca, estoqueApos);
    for (const baixa of baixasLotes) {
      await tx.lote.update({ where: { id: baixa.loteId }, data: { quantidade: { decrement: baixa.quantidade } } });
    }

    await tx.produto.update({ where: { id: produto.id }, data: { estoque: estoqueApos } });
    const movimento = await tx.movimentoEstoque.create({
      data: {
        produtoId: produto.id,
        tipo: "AJUSTE",
        quantidade: diferenca,
        estoqueApos,
        custoUnitario: produto.precoCusto,
        motivo: params.motivo,
        usuarioId: params.usuarioId,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: params.usuarioId,
        acao: "estoque.ajustar",
        entidade: "Produto",
        entidadeId: produto.id,
        detalhes: {
          movimentoId: movimento.id,
          estoqueAnterior: produto.estoque,
          estoqueApos,
          diferenca,
          motivo: params.motivo,
          lotesBaixados: baixasLotes,
        },
      },
      tx,
    );
    return { produtoId: produto.id, nome: produto.nome, unidade: produto.unidade, estoqueAnterior: produto.estoque, estoqueApos, diferenca };
  }, OPCOES_TRANSACAO);
}

// ---------------------------------------------------------------- entrada (escrita)

export type ItemNovaEntrada = {
  produtoId: number;
  quantidade: number; // milésimos
  custoUnitario: number; // centavos, sem frete
  validade: Date | null;
};

export type DadosNovaEntrada = {
  fornecedorId: number | null;
  numeroNota: string | null;
  data: Date;
  frete: number;
  observacao: string | null;
  itens: ItemNovaEntrada[];
  /** categoriaId null = usa a categoria "Fornecedores" (por nome, ignorando caixa e acento) se ela existir. */
  boleto: { vencimento: Date; parcelas: number; categoriaId: number | null } | null;
  usuarioId: number;
};

const NOME_CATEGORIA_COMPRAS = "Fornecedores";

/**
 * Categoria de despesa dos boletos gerados pela entrada. Se o dono escolheu
 * uma no formulário, usa essa; senão procura a categoria padrão de compras
 * pelo nome normalizado. Não cria categoria: se o dono renomeou ou apagou a
 * padrão, foi de propósito, e o boleto sai sem categoria pra ele classificar.
 */
async function resolverCategoriaBoleto(tx: ClienteDb, categoriaId: number | null): Promise<number | null> {
  if (categoriaId !== null) {
    const existe = await tx.categoriaDespesa.findUnique({ where: { id: categoriaId }, select: { id: true } });
    if (!existe) throw new Error("A categoria de despesa escolhida não existe mais. Escolha outra.");
    return existe.id;
  }
  const todas = await tx.categoriaDespesa.findMany({ select: { id: true, nome: true } });
  const alvo = normalizarTexto(NOME_CATEGORIA_COMPRAS);
  return todas.find((c) => normalizarTexto(c.nome) === alvo)?.id ?? null;
}

export async function registrarEntrada(dados: DadosNovaEntrada): Promise<{ id: number; total: number }> {
  if (dados.itens.length === 0) throw new Error("Adicione pelo menos um produto na nota.");

  return db.$transaction(async (tx) => {
    const ids = [...new Set(dados.itens.map((i) => i.produtoId))];
    const produtos = await tx.produto.findMany({ where: { id: { in: ids } } });
    const porId = new Map(produtos.map((p) => [p.id, p]));

    for (const item of dados.itens) {
      const produto = porId.get(item.produtoId);
      if (!produto) throw new Error(`Produto ${item.produtoId} não existe mais.`);
      if (!produto.ativo) throw new Error(`"${produto.nome}" está inativo. Reative o produto antes de dar entrada.`);
      if (item.quantidade <= 0) throw new Error(`Quantidade inválida em "${produto.nome}".`);
      exigirQuantidadeCompativel(produto, item.quantidade);
      if (item.custoUnitario < 0) throw new Error(`Custo inválido em "${produto.nome}".`);
      if (produto.controlaValidade && !item.validade) {
        throw new Error(`"${produto.nome}" controla validade. Informe a validade do lote.`);
      }
    }

    let fornecedorNome: string | null = null;
    if (dados.fornecedorId !== null) {
      const fornecedor = await tx.fornecedor.findUnique({ where: { id: dados.fornecedorId } });
      if (!fornecedor) throw new Error("Fornecedor não encontrado.");
      fornecedorNome = fornecedor.nome;
    }

    const preparados = prepararItensEntrada(dados.itens, dados.frete);
    const resultados = aplicarCustoMedio(
      preparados,
      new Map(produtos.map((p) => [p.id, { estoque: p.estoque, precoCusto: p.precoCusto }])),
    );
    const valorTotal = subtotalItens(dados.itens);
    const total = valorTotal + dados.frete;

    const entrada = await tx.entradaEstoque.create({
      data: {
        fornecedorId: dados.fornecedorId,
        numeroNota: dados.numeroNota,
        data: dados.data,
        valorTotal,
        frete: dados.frete,
        observacao: dados.observacao,
        usuarioId: dados.usuarioId,
        itens: {
          create: dados.itens.map((i) => ({
            produtoId: i.produtoId,
            quantidade: i.quantidade,
            custoUnitario: i.custoUnitario,
            validade: i.validade,
          })),
        },
      },
    });

    const referencia = dados.numeroNota ? `Compra, nota ${dados.numeroNota}` : `Compra, entrada nº ${entrada.id}`;
    const motivoMovimento = fornecedorNome ? `${referencia} (${fornecedorNome})` : referencia;

    for (const r of resultados) {
      const produto = porId.get(r.produtoId)!;
      const item = preparados[r.indice];

      await tx.produto.update({
        where: { id: produto.id },
        data: { estoque: r.estoqueApos, precoCusto: r.custoNovo },
      });
      await tx.movimentoEstoque.create({
        data: {
          produtoId: produto.id,
          tipo: "ENTRADA",
          quantidade: r.quantidade,
          estoqueApos: r.estoqueApos,
          custoUnitario: r.custoEfetivo,
          motivo: motivoMovimento,
          entradaId: entrada.id,
          usuarioId: dados.usuarioId,
        },
      });
      if (produto.controlaValidade && item.validade) {
        await tx.lote.create({
          data: {
            produtoId: produto.id,
            codigo: dados.numeroNota,
            validade: item.validade,
            quantidade: r.quantidade,
            custoUnitario: r.custoEfetivo,
            entradaId: entrada.id,
          },
        });
      }
      if (r.custoMudou) {
        await tx.historicoPreco.create({
          data: {
            produtoId: produto.id,
            precoVendaAnterior: produto.precoVenda,
            precoVendaNovo: produto.precoVenda,
            precoCustoAnterior: r.custoAnterior,
            precoCustoNovo: r.custoNovo,
            usuarioId: dados.usuarioId,
          },
        });
      }
    }

    if (dados.boleto) {
      const categoriaId = await resolverCategoriaBoleto(tx, dados.boleto.categoriaId);
      const parcelas = calcularParcelas(total, dados.boleto.parcelas, dados.boleto.vencimento);
      const base = fornecedorNome ? `Compra ${fornecedorNome}` : "Compra de mercadorias";
      const nota = dados.numeroNota ? ` (nota ${dados.numeroNota})` : "";
      for (const p of parcelas) {
        const sufixo = p.totalParcelas > 1 ? ` ${p.parcelaAtual}/${p.totalParcelas}` : "";
        await tx.contaPagar.create({
          data: {
            descricao: `${base}${nota}${sufixo}`,
            fornecedorId: dados.fornecedorId,
            categoriaId,
            valor: p.valor,
            vencimento: p.vencimento,
            status: "PENDENTE",
            parcelaAtual: p.totalParcelas > 1 ? p.parcelaAtual : null,
            totalParcelas: p.totalParcelas > 1 ? p.totalParcelas : null,
            diaVencimento: p.totalParcelas > 1 ? noFuso(dados.boleto.vencimento).getDate() : null,
            entradaId: entrada.id,
            observacao: `Gerado pela entrada de estoque nº ${entrada.id}.`,
          },
        });
      }
    }

    await registrarAuditoria(
      {
        usuarioId: dados.usuarioId,
        acao: "estoque.entrada.registrar",
        entidade: "EntradaEstoque",
        entidadeId: entrada.id,
        detalhes: {
          fornecedorId: dados.fornecedorId,
          numeroNota: dados.numeroNota,
          valorTotal,
          frete: dados.frete,
          itens: resultados.length,
          boleto: dados.boleto ? { parcelas: dados.boleto.parcelas, total } : null,
        },
      },
      tx,
    );

    return { id: entrada.id, total };
  }, OPCOES_TRANSACAO);
}

export async function estornarEntrada(params: {
  entradaId: number;
  motivo: string;
  usuarioId: number;
}) {
  return db.$transaction(async (tx) => {
    const entrada = await tx.entradaEstoque.findUnique({
      where: { id: params.entradaId },
      include: {
        itens: { include: { produto: true } },
        lotes: { include: { _count: { select: { itensVenda: true, perdas: true } } } },
        contas: true,
        movimentos: { where: { tipo: "ENTRADA" }, orderBy: { id: "asc" } },
      },
    });
    if (!entrada) throw new Error("Entrada não encontrada.");

    const bloqueios = verificarEstornoEntrada({
      estornadaEm: entrada.estornadaEm,
      itens: entrada.itens.map((i) => ({
        produtoId: i.produtoId,
        quantidade: i.quantidade,
        estoqueAtual: i.produto.estoque,
      })),
      lotes: entrada.lotes.map((l) => ({
        produtoId: l.produtoId,
        quantidade: l.quantidade,
        consumos: l._count.itensVenda + l._count.perdas,
      })),
      contas: entrada.contas.map((c) => ({ id: c.id, status: c.status })),
    });
    if (bloqueios.length) {
      const textos = descreverBloqueios(bloqueios, entrada.itens.map((i) => i.produto));
      throw new Error(`Não dá pra estornar esta entrada: ${textos.join(" ")}`);
    }

    // Soma por produto (mesmo produto pode aparecer em mais de uma linha).
    const porProduto = new Map<number, { produto: (typeof entrada.itens)[number]["produto"]; quantidade: number }>();
    for (const item of entrada.itens) {
      const atual = porProduto.get(item.produtoId);
      if (atual) atual.quantidade += item.quantidade;
      else porProduto.set(item.produtoId, { produto: item.produto, quantidade: item.quantidade });
    }

    const motivoMovimento = `Estorno da entrada nº ${entrada.id}${params.motivo ? `: ${params.motivo}` : ""}`;
    const revertidos: Array<{
      produtoId: number;
      quantidade: number;
      estoqueApos: number;
      custoAnterior: number;
      custoNovo: number;
      custoRevertido: boolean;
    }> = [];
    const custosMantidos: string[] = [];
    for (const { produto, quantidade } of porProduto.values()) {
      const estoqueApos = produto.estoque - quantidade;

      // Desfaz também o custo médio que esta entrada injetou (ver reverterCustoMedio).
      const linhas = entrada.movimentos
        .filter((m) => m.produtoId === produto.id)
        .map((m) => ({ quantidade: m.quantidade, custoEfetivo: m.custoUnitario ?? produto.precoCusto, estoqueApos: m.estoqueApos, id: m.id }));
      const ultimoMovimentoId = linhas.length ? linhas[linhas.length - 1].id : 0;
      const historico = await tx.historicoPreco.findMany({
        where: { produtoId: produto.id, criadoEm: { gte: entrada.criadoEm } },
        orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
        select: { precoCustoAnterior: true, precoCustoNovo: true },
      });
      const posteriores = await tx.movimentoEstoque.findMany({
        where: { produtoId: produto.id, tipo: "ENTRADA", id: { gt: ultimoMovimentoId }, NOT: { entradaId: entrada.id } },
        orderBy: { id: "asc" },
        select: { quantidade: true, custoUnitario: true, estoqueApos: true, entrada: { select: { estornadaEm: true } } },
      });
      const custo = reverterCustoMedio({
        custoAtual: produto.precoCusto,
        linhas,
        historico,
        entradasPosteriores: posteriores.map((m) => ({
          quantidade: m.quantidade,
          custoEfetivo: m.custoUnitario ?? produto.precoCusto,
          estoqueApos: m.estoqueApos,
          ativa: m.entrada === null || m.entrada.estornadaEm === null,
        })),
      });
      if (!custo.revertido) custosMantidos.push(produto.nome);

      await tx.produto.update({ where: { id: produto.id }, data: { estoque: estoqueApos, precoCusto: custo.custoNovo } });
      await tx.movimentoEstoque.create({
        data: {
          produtoId: produto.id,
          tipo: "AJUSTE",
          quantidade: -quantidade,
          estoqueApos,
          custoUnitario: custo.custoEfetivoMedio,
          motivo: motivoMovimento,
          entradaId: entrada.id,
          usuarioId: params.usuarioId,
        },
      });
      if (custo.custoMudou) {
        await tx.historicoPreco.create({
          data: {
            produtoId: produto.id,
            precoVendaAnterior: produto.precoVenda,
            precoVendaNovo: produto.precoVenda,
            precoCustoAnterior: produto.precoCusto,
            precoCustoNovo: custo.custoNovo,
            usuarioId: params.usuarioId,
          },
        });
      }
      revertidos.push({
        produtoId: produto.id,
        quantidade,
        estoqueApos,
        custoAnterior: produto.precoCusto,
        custoNovo: custo.custoNovo,
        custoRevertido: custo.revertido,
      });
    }

    await tx.lote.deleteMany({ where: { entradaId: entrada.id } });

    const pendentes = entrada.contas.filter((c) => c.status === "PENDENTE");
    for (const conta of pendentes) {
      await tx.contaPagar.update({
        where: { id: conta.id },
        data: {
          status: "CANCELADA",
          observacao: [conta.observacao, `Cancelado: entrada nº ${entrada.id} estornada em ${formatarDataHora(agora())}.`]
            .filter(Boolean)
            .join(" "),
        },
      });
    }

    // Estorno fica nos campos próprios; a observação segue legível, só ganha o motivo.
    await tx.entradaEstoque.update({
      where: { id: entrada.id },
      data: {
        estornadaEm: agora(),
        estornadaPorId: params.usuarioId,
        observacao: [entrada.observacao?.trim(), params.motivo ? `Motivo do estorno: ${params.motivo}` : null]
          .filter(Boolean)
          .join("\n"),
      },
    });

    await registrarAuditoria(
      {
        usuarioId: params.usuarioId,
        acao: "estoque.entrada.estornar",
        entidade: "EntradaEstoque",
        entidadeId: entrada.id,
        detalhes: {
          motivo: params.motivo,
          revertidos,
          lotesRemovidos: entrada.lotes.length,
          boletosCancelados: pendentes.map((c) => c.id),
          observacaoAnterior: entrada.observacao,
        },
      },
      tx,
    );

    return {
      id: entrada.id,
      produtos: revertidos.length,
      boletosCancelados: pendentes.length,
      /** Produtos cujo custo médio foi editado à mão depois da entrada e por isso ficou como estava. */
      custosMantidos,
    };
  }, OPCOES_TRANSACAO);
}

// ---------------------------------------------------------------- perdas (escrita)

export async function registrarPerda(params: {
  produtoId: number;
  loteId: number | null;
  quantidade: number;
  motivo: MotivoPerda;
  observacao: string | null;
  usuarioId: number;
}) {
  return db.$transaction(async (tx) => {
    const produto = await tx.produto.findUnique({ where: { id: params.produtoId } });
    if (!produto || !produto.ativo) throw new Error("Produto não encontrado ou inativo.");
    if (params.quantidade <= 0) throw new Error("Informe uma quantidade maior que zero.");
    exigirQuantidadeCompativel(produto, params.quantidade);

    let lote: { id: number; quantidade: number; custoUnitario: number; validade: Date } | null = null;
    if (params.loteId !== null) {
      const encontrado = await tx.lote.findUnique({ where: { id: params.loteId } });
      if (!encontrado || encontrado.produtoId !== produto.id) throw new Error("Lote não encontrado pra este produto.");
      if (encontrado.quantidade < params.quantidade) {
        throw new Error(
          `O lote tem só ${formatarQuantidade(encontrado.quantidade, produto.unidade)} restante(s). Ajuste a quantidade.`,
        );
      }
      lote = encontrado;
    }

    if (produto.estoque < params.quantidade) {
      throw new Error(
        `Quantidade maior que o estoque atual (${formatarQuantidade(produto.estoque, produto.unidade)}). Se o estoque está errado, faça um ajuste antes de registrar a perda.`,
      );
    }

    const custoUnitario = lote ? lote.custoUnitario : produto.precoCusto;
    const valorTotal = totalLinha(params.quantidade, custoUnitario);
    const estoqueApos = produto.estoque - params.quantidade;

    const perda = await tx.perda.create({
      data: {
        produtoId: produto.id,
        loteId: lote?.id ?? null,
        quantidade: params.quantidade,
        custoUnitario,
        valorTotal,
        motivo: params.motivo,
        observacao: params.observacao,
        usuarioId: params.usuarioId,
      },
    });

    const rotulo = ROTULO_MOTIVO_PERDA[params.motivo];
    await tx.movimentoEstoque.create({
      data: {
        produtoId: produto.id,
        tipo: "PERDA",
        quantidade: -params.quantidade,
        estoqueApos,
        custoUnitario,
        motivo: params.observacao ? `${rotulo}: ${params.observacao}` : rotulo,
        perdaId: perda.id,
        usuarioId: params.usuarioId,
      },
    });
    if (lote) {
      await tx.lote.update({ where: { id: lote.id }, data: { quantidade: { decrement: params.quantidade } } });
    }
    await tx.produto.update({ where: { id: produto.id }, data: { estoque: estoqueApos } });

    await registrarAuditoria(
      {
        usuarioId: params.usuarioId,
        acao: "estoque.perda.registrar",
        entidade: "Perda",
        entidadeId: perda.id,
        detalhes: {
          produtoId: produto.id,
          loteId: lote?.id ?? null,
          quantidade: params.quantidade,
          custoUnitario,
          valorTotal,
          motivo: params.motivo,
          estoqueAnterior: produto.estoque,
          estoqueApos,
        },
      },
      tx,
    );

    return { id: perda.id, nome: produto.nome, unidade: produto.unidade, quantidade: params.quantidade, valorTotal };
  }, OPCOES_TRANSACAO);
}

export async function estornarPerda(params: { perdaId: number; usuarioId: number }) {
  return db.$transaction(async (tx) => {
    const perda = await tx.perda.findUnique({
      where: { id: params.perdaId },
      include: { produto: true, lote: true, movimento: true },
    });
    if (!perda) throw new Error("Perda não encontrada. Talvez já tenha sido estornada.");

    const estoqueApos = perda.produto.estoque + perda.quantidade;
    await tx.produto.update({ where: { id: perda.produtoId }, data: { estoque: estoqueApos } });
    if (perda.lote) {
      await tx.lote.update({ where: { id: perda.lote.id }, data: { quantidade: { increment: perda.quantidade } } });
    }
    await tx.movimentoEstoque.create({
      data: {
        produtoId: perda.produtoId,
        tipo: "AJUSTE",
        quantidade: perda.quantidade,
        estoqueApos,
        custoUnitario: perda.custoUnitario,
        motivo: `Estorno da perda nº ${perda.id} (${ROTULO_MOTIVO_PERDA[perda.motivo]})`,
        usuarioId: params.usuarioId,
      },
    });
    if (perda.movimento) {
      await tx.movimentoEstoque.update({
        where: { id: perda.movimento.id },
        data: { perdaId: null, motivo: `${perda.movimento.motivo ?? ROTULO_MOTIVO_PERDA[perda.motivo]} (perda nº ${perda.id} estornada)` },
      });
    }
    await tx.perda.delete({ where: { id: perda.id } });

    await registrarAuditoria(
      {
        usuarioId: params.usuarioId,
        acao: "estoque.perda.estornar",
        entidade: "Perda",
        entidadeId: perda.id,
        detalhes: {
          produtoId: perda.produtoId,
          loteId: perda.loteId,
          quantidade: perda.quantidade,
          custoUnitario: perda.custoUnitario,
          valorTotal: perda.valorTotal,
          motivo: perda.motivo,
          observacao: perda.observacao,
          data: perda.data.toISOString(),
          estoqueApos,
        },
      },
      tx,
    );

    return { produtoId: perda.produtoId, nome: perda.produto.nome, quantidade: perda.quantidade, unidade: perda.produto.unidade };
  }, OPCOES_TRANSACAO);
}

// ---------------------------------------------------------------- promoção

export async function colocarEmPromocao(params: {
  produtoId: number;
  precoPromocional: number;
  promocaoAte: Date;
  usuarioId: number;
  /** Papel de quem está criando: operador respeita o mesmo teto de desconto do PDV. */
  papel: Papel;
}) {
  return db.$transaction(async (tx) => {
    const produto = await tx.produto.findUnique({ where: { id: params.produtoId } });
    if (!produto || !produto.ativo) throw new Error("Produto não encontrado ou inativo.");
    if (params.precoPromocional <= 0) throw new Error("Informe o preço promocional.");
    if (params.precoPromocional >= produto.precoVenda) {
      throw new Error(`O preço promocional precisa ser menor que o preço normal (${formatarReais(produto.precoVenda)}).`);
    }
    if (diasAte(params.promocaoAte) < 0) throw new Error("A data final da promoção já passou.");

    // Promoção é desconto por outro caminho: operador não pode baixar mais do
    // que o teto de desconto configurado (senão o limite do PDV vira letra morta).
    const config = await obterConfiguracao(tx);
    const teto = tetoDescontoParaPapel(params.papel, config);
    const maximo = limiteDesconto(produto.precoVenda, teto);
    if (maximo !== null && produto.precoVenda - params.precoPromocional > maximo) {
      throw new Error(
        maximo === 0
          ? "Você não tem permissão pra dar desconto. Peça a um administrador pra criar a promoção."
          : `Desconto acima do permitido pro seu perfil: o preço promocional mínimo é ${formatarReais(produto.precoVenda - maximo)} (${formatarPercentual(teto!, 0)} abaixo do preço normal). Peça a um administrador.`,
      );
    }

    await tx.produto.update({
      where: { id: produto.id },
      data: { precoPromocional: params.precoPromocional, promocaoAte: params.promocaoAte },
    });
    await registrarAuditoria(
      {
        usuarioId: params.usuarioId,
        acao: "produto.promocao",
        entidade: "Produto",
        entidadeId: produto.id,
        detalhes: {
          precoVenda: produto.precoVenda,
          precoPromocionalAnterior: produto.precoPromocional,
          promocaoAteAnterior: produto.promocaoAte?.toISOString() ?? null,
          precoPromocional: params.precoPromocional,
          promocaoAte: params.promocaoAte.toISOString(),
          origem: "vencimentos",
        },
      },
      tx,
    );
    return { produtoId: produto.id, nome: produto.nome, precoPromocional: params.precoPromocional, promocaoAte: formatarData(params.promocaoAte) };
  }, OPCOES_TRANSACAO);
}

// ---------------------------------------------------------------- fornecedor rápido

export async function criarFornecedorRapido(
  params: { nome: string; cnpj: string | null; telefone: string | null; usuarioId: number },
  tx: ClienteDb = db,
) {
  // Reaproveita fornecedor existente com o mesmo nome (ignorando acentos e caixa)
  // ou o mesmo CNPJ, pra não duplicar cadastro que o Financeiro já mantém.
  // Grava CNPJ e telefone do mesmo jeito que o Financeiro (só os caracteres,
  // sem pontuação), senão a busca por CNPJ na tela de fornecedores não acha.
  const nomeLimpo = params.nome.trim().replace(/\s+/g, " ");
  const alvo = normalizarTexto(nomeLimpo);
  const cnpj = normalizarCnpj(params.cnpj);
  if (cnpj && !cnpjValido(cnpj)) throw new Error("CNPJ inválido. Confira os números digitados.");
  const telefone = params.telefone ? params.telefone.replace(/\D/g, "") : "";
  const candidatos = await tx.fornecedor.findMany({ select: { id: true, nome: true, cnpj: true, ativo: true } });
  const existente = candidatos.find(
    (c) => normalizarTexto(c.nome) === alvo || (cnpj.length === 14 && normalizarCnpj(c.cnpj) === cnpj),
  );
  if (existente) {
    if (!existente.ativo) await tx.fornecedor.update({ where: { id: existente.id }, data: { ativo: true } });
    return { id: existente.id, nome: existente.nome };
  }
  const fornecedor = await tx.fornecedor.create({
    data: { nome: nomeLimpo, cnpj: cnpj || null, telefone: telefone || null },
  });
  await registrarAuditoria(
    { usuarioId: params.usuarioId, acao: "fornecedor.criar", entidade: "Fornecedor", entidadeId: fornecedor.id, detalhes: { origem: "entrada" } },
    tx,
  );
  return { id: fornecedor.id, nome: fornecedor.nome };
}
