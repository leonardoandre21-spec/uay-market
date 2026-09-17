import "server-only";
import type { FormaPagamento, Papel, Prisma, StatusPagamentoMP, StatusVenda } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  obterConfiguracao,
  obterConfiguracoesPagamento,
  obterSessaoCaixaAberta,
  precoEfetivo,
  proximoNumeroVenda,
  saldoFiado,
  type ClienteDb,
} from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatarQuantidadeComUnidade, formatarReais } from "@/lib/dinheiro";
import { agora } from "@/lib/datas";
import { consultarIntencao, ErroMercadoPago, obterCredenciaisMp } from "@/lib/mercadopago";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import {
  calcularTaxasPagamentos,
  calcularTotais,
  calcularTroco,
  conferirIntencaoMp,
  conferirPrecoReferencia,
  custoItem,
  distribuirFefo,
  dividirItemPorLotes,
  erroDeConcorrencia,
  podeCancelarVenda,
  quantidadeValida,
  tetoDescontoParaPapel,
  validarDescontoMaximo,
  validarPagamentos,
  type ItemCalculo,
} from "@/lib/servicos/vendas-calculos";

// Escrita e leitura de vendas. Toda escrita roda em transação e o estoque só
// muda acompanhado de MovimentoEstoque, como manda o contrato.

// ---------------------------------------------------------------- entrada

export const FORMAS_VALIDAS = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "FIADO"] as const;
const STATUS_MP = ["PENDENTE", "APROVADO", "CANCELADO", "ERRO"] as const;

export const esquemaItemVenda = z.object({
  produtoId: z.number().int().positive(),
  quantidade: z.number().int().positive().max(999_999_000),
  desconto: z.number().int().min(0).default(0),
  /**
   * Preço que o PDV mostrou na tela, só pra conferência: se divergir do preço
   * recarregado do banco, a venda é recusada nomeando o produto. Nunca é o
   * preço praticado.
   */
  precoReferencia: z.number().int().min(0).nullable().optional(),
});

export const esquemaPagamentoVenda = z.object({
  forma: z.enum(FORMAS_VALIDAS),
  valor: z.number().int().positive(),
  valorRecebido: z.number().int().min(0).nullable().optional(),
  parcelas: z.number().int().min(1).max(24).default(1),
  /** em qual maquininha o cartão/pix passou (obrigatório em DEBITO/CREDITO se houver maquininha ativa) */
  maquininhaId: z.number().int().positive().nullable().optional(),
  /** NSU / doc do comprovante, pra bater com o extrato da adquirente */
  nsu: z.string().trim().max(40).nullable().optional(),
  /** código de autorização do comprovante */
  autorizacao: z.string().trim().max(40).nullable().optional(),
  mpPaymentIntentId: z.string().trim().max(120).nullable().optional(),
  mpPaymentId: z.string().trim().max(120).nullable().optional(),
  mpStatus: z.enum(STATUS_MP).nullable().optional(),
});

export const esquemaVenda = z.object({
  sessaoId: z.number().int().positive(),
  itens: z.array(esquemaItemVenda).min(1, "Adicione pelo menos um produto."),
  descontoGeral: z.number().int().min(0).default(0),
  clienteId: z.number().int().positive().nullable().optional(),
  pagamentos: z.array(esquemaPagamentoVenda),
  observacao: z.string().trim().max(300).nullable().optional(),
});

export type EntradaVenda = z.infer<typeof esquemaVenda>;
export type EntradaPagamentoVenda = z.infer<typeof esquemaPagamentoVenda>;

export type ResultadoRegistroVenda = {
  vendaId: number;
  numero: number;
  troco: number;
  total: number;
};

type UsuarioAtuante = { usuarioId: number; papel: Papel };

type LinhaPreparada = {
  produtoId: number;
  descricao: string;
  unidade: "UN" | "KG";
  controlaValidade: boolean;
  quantidade: number;
  precoUnitario: number;
  custoUnitario: number;
  desconto: number;
  estoqueApos: number;
};

// ---------------------------------------------------------------- registrar

/**
 * Registra a venda inteira em UMA transação: revalida caixa, recarrega cada
 * produto do banco (preço e custo nunca vêm do cliente), confere estoque e
 * desconto, baixa estoque com FEFO nos lotes, grava pagamentos com snapshot
 * de taxa e lança o fiado quando houver.
 */
export async function registrarVenda(entrada: EntradaVenda, usuario: UsuarioAtuante): Promise<ResultadoRegistroVenda> {
  // Cobranças do Mercado Pago são conferidas na API ANTES da transação: chamada
  // HTTP dentro do $transaction seguraria o lock de escrita do SQLite.
  const pagamentos = await verificarPagamentosMp(entrada.pagamentos, usuario.usuarioId);
  const entradaVerificada: EntradaVenda = { ...entrada, pagamentos };

  // Dois caixas gravando no mesmo instante podem disputar o número do cupom
  // (único) ou o lock de escrita do SQLite. Se acontecer, tenta de novo.
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await gravarVenda(entradaVerificada, usuario);
    } catch (e) {
      const codigo = e && typeof e === "object" && "code" in e ? (e as { code: string }).code : null;
      if (codigo === "P2002" && tentativa < 3) continue;
      if (erroDeConcorrencia(e)) {
        if (tentativa < 3) {
          await new Promise((r) => setTimeout(r, 200 * tentativa));
          continue;
        }
        throw new Error("O sistema estava ocupado gravando outra operação. Confirme a venda de novo.");
      }
      throw e;
    }
  }
}

/**
 * Pagamento em cartão que diz ter sido cobrado pela maquininha Mercado Pago:
 * o servidor consulta a intenção na API e exige estado FINISHED e valor igual
 * ao do pagamento; `mpPaymentId` e `mpStatus` passam a vir da resposta, não do
 * cliente. Se a API do Mercado Pago não responder, a venda segue com o que o
 * PDV informou (o comprovante saiu na maquininha) e fica registrada em
 * auditoria como não conferida.
 */
async function verificarPagamentosMp(
  pagamentos: EntradaPagamentoVenda[],
  usuarioId: number,
): Promise<EntradaPagamentoVenda[]> {
  const resultado: EntradaPagamentoVenda[] = [];
  const vistos = new Set<string>();
  for (const p of pagamentos) {
    const intentId = (p.forma === "DEBITO" || p.forma === "CREDITO") && p.mpPaymentIntentId ? p.mpPaymentIntentId : null;
    if (!intentId) {
      resultado.push(p);
      continue;
    }
    if (vistos.has(intentId)) throw new Error("A mesma cobrança do Mercado Pago aparece duas vezes nos pagamentos.");
    vistos.add(intentId);

    const credenciais = await obterCredenciaisMp().catch((e: unknown) => {
      if (e instanceof ErroMercadoPago) {
        throw new Error(
          "O Mercado Pago não está mais configurado, mas há um pagamento cobrado pela maquininha. Registre o cartão manualmente.",
        );
      }
      throw e;
    });
    try {
      const intencao = await consultarIntencao(intentId, credenciais.token);
      const conferencia = conferirIntencaoMp(intencao, p.valor);
      if (!conferencia.ok) throw new Error(conferencia.mensagem);
      resultado.push({
        ...p,
        mpPaymentId: intencao.payment?.id != null ? String(intencao.payment.id) : (p.mpPaymentId ?? null),
        mpStatus: "APROVADO",
      });
    } catch (e) {
      // Só falha de comunicação (sem rede, 5xx, 429) deixa passar sem conferir;
      // 404 (cobrança inexistente) e afins recusam a venda com a mensagem do MP.
      const indisponivel = e instanceof ErroMercadoPago && (e.status === 0 || e.status === 429 || e.status >= 500);
      if (!indisponivel) throw e;
      await registrarAuditoria({
        usuarioId,
        acao: "mp.intencao.nao_conferida",
        entidade: "PaymentIntent",
        detalhes: { intentId, valor: p.valor, erro: (e as Error).message },
      });
      resultado.push(p);
    }
  }
  return resultado;
}

async function gravarVenda(entrada: EntradaVenda, usuario: UsuarioAtuante): Promise<ResultadoRegistroVenda> {
  return db.$transaction(
    async (tx) => {
      const sessao = await obterSessaoCaixaAberta(tx);
      if (!sessao) throw new Error("O caixa está fechado. Abra o caixa antes de vender.");
      if (sessao.id !== entrada.sessaoId) {
        throw new Error("A sessão de caixa mudou desde que a tela foi aberta. Recarregue o PDV.");
      }

      const [config, configsPagamento] = await Promise.all([obterConfiguracao(tx), obterConfiguracoesPagamento(tx)]);

      // ---- itens: recarrega do banco e confere estoque
      const linhas: LinhaPreparada[] = [];
      const estoqueAtual = new Map<number, number>();
      for (const item of entrada.itens) {
        const produto = await tx.produto.findUnique({ where: { id: item.produtoId } });
        if (!produto || !produto.ativo) {
          throw new Error("Um dos produtos do carrinho não existe mais ou foi desativado. Remova e bipe de novo.");
        }
        if (!quantidadeValida(item.quantidade, produto.unidade)) {
          throw new Error(
            produto.unidade === "UN"
              ? `"${produto.nome}" é vendido por unidade inteira.`
              : `Quantidade inválida em "${produto.nome}".`,
          );
        }
        const precoUnitario = precoEfetivo(produto);
        const precoMudou = conferirPrecoReferencia(produto.nome, item.precoReferencia, precoUnitario);
        if (precoMudou) throw new Error(precoMudou);
        const bruto = Math.round((item.quantidade * precoUnitario) / 1000);
        if (item.desconto > bruto) {
          throw new Error(`O desconto de "${produto.nome}" é maior que o valor do item.`);
        }
        const disponivel = estoqueAtual.get(produto.id) ?? produto.estoque;
        if (!config.permitirVendaSemEstoque && disponivel < item.quantidade) {
          throw new Error(
            `Estoque insuficiente de "${produto.nome}": há ${formatarQuantidadeComUnidade(Math.max(0, disponivel), produto.unidade)}.`,
          );
        }
        const estoqueApos = disponivel - item.quantidade;
        estoqueAtual.set(produto.id, estoqueApos);
        linhas.push({
          produtoId: produto.id,
          descricao: produto.nome,
          unidade: produto.unidade,
          controlaValidade: produto.controlaValidade,
          quantidade: item.quantidade,
          precoUnitario,
          custoUnitario: produto.precoCusto,
          desconto: item.desconto,
          estoqueApos,
        });
      }

      // ---- totais e desconto
      const itensCalculo: ItemCalculo[] = linhas.map((l) => ({
        quantidade: l.quantidade,
        precoUnitario: l.precoUnitario,
        desconto: l.desconto,
      }));
      const totais = calcularTotais(itensCalculo, entrada.descontoGeral);
      if (entrada.descontoGeral > totais.subtotal) {
        throw new Error("O desconto geral é maior que o valor da compra.");
      }
      const teto = tetoDescontoParaPapel(usuario.papel, config);
      const validacaoDesconto = validarDescontoMaximo(totais.bruto, totais.descontoTotal, teto);
      if (!validacaoDesconto.ok) throw new Error(validacaoDesconto.mensagem);

      // ---- pagamentos
      const validacaoPag = validarPagamentos(totais.total, entrada.pagamentos);
      if (!validacaoPag.ok) throw new Error(validacaoPag.mensagem);
      // Maquininhas: se existe ao menos uma ativa, cartão precisa dizer em qual passou.
      // Só DEBITO/CREDITO/PIX passam na maquininha; nas outras formas o campo é ignorado.
      const maquininhasAtivas = await tx.maquininha.findMany({ where: { ativo: true } });
      const mapaMaquininhas = new Map(maquininhasAtivas.map((m) => [m.id, m]));
      const pagamentosNormalizados = entrada.pagamentos.map((p) => ({
        ...p,
        maquininhaId: p.forma === "DEBITO" || p.forma === "CREDITO" || p.forma === "PIX" ? (p.maquininhaId ?? null) : null,
      }));
      for (const p of pagamentosNormalizados) {
        const cfg = configsPagamento.find((c) => c.forma === p.forma);
        if (!cfg || !cfg.ativo) {
          throw new Error(`A forma de pagamento "${ROTULO_FORMA_PAGAMENTO[p.forma]}" não está ativa.`);
        }
        if (p.forma === "CREDITO" && p.parcelas > Math.max(1, cfg.maxParcelas)) {
          throw new Error(`Cartão de crédito aceita no máximo ${Math.max(1, cfg.maxParcelas)}x.`);
        }
        if (p.maquininhaId !== null && !mapaMaquininhas.has(p.maquininhaId)) {
          throw new Error("A maquininha escolhida não existe mais ou foi desativada. Recarregue o PDV e escolha de novo.");
        }
        if ((p.forma === "DEBITO" || p.forma === "CREDITO") && p.maquininhaId === null && maquininhasAtivas.length > 0) {
          throw new Error(`Informe em qual maquininha passou o ${ROTULO_FORMA_PAGAMENTO[p.forma].toLowerCase()}.`);
        }
        // Uma cobrança da maquininha Mercado Pago só pode quitar uma venda.
        if ((p.forma === "DEBITO" || p.forma === "CREDITO") && p.mpPaymentIntentId) {
          const jaUsada = await tx.pagamento.findFirst({
            where: { mpPaymentIntentId: p.mpPaymentIntentId },
            select: { venda: { select: { numero: true } } },
          });
          if (jaUsada) {
            throw new Error(
              `Essa cobrança do Mercado Pago já está registrada na venda nº ${jaUsada.venda.numero}. Cobre de novo na maquininha ou registre o cartão manualmente.`,
            );
          }
        }
      }
      const { taxas, total: taxasTotal } = calcularTaxasPagamentos(pagamentosNormalizados, configsPagamento, mapaMaquininhas);

      // ---- fiado
      const valorFiado = entrada.pagamentos.filter((p) => p.forma === "FIADO").reduce((a, p) => a + p.valor, 0);
      const clienteId: number | null = entrada.clienteId ?? null;
      if (clienteId !== null) {
        const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
        if (!cliente || !cliente.ativo) throw new Error("Cliente não encontrado ou inativo.");
      }
      if (valorFiado > 0) {
        if (clienteId === null) throw new Error("Venda fiado precisa de um cliente identificado.");
        const cliente = (await tx.cliente.findUnique({ where: { id: clienteId } }))!;
        if (cliente.limiteFiado <= 0) throw new Error(`${cliente.nome} não tem limite de fiado liberado.`);
        const saldo = await saldoFiado(clienteId, tx);
        if (saldo + valorFiado > cliente.limiteFiado) {
          const disponivel = Math.max(0, cliente.limiteFiado - saldo);
          throw new Error(
            `${cliente.nome} só tem ${formatarReais(disponivel)} de limite disponível (deve ${formatarReais(saldo)} de ${formatarReais(cliente.limiteFiado)}).`,
          );
        }
      }

      // ---- grava a venda
      const custoTotal = linhas.reduce((a, l) => a + custoItem(l.quantidade, l.custoUnitario), 0);
      const numero = await proximoNumeroVenda(tx);
      const venda = await tx.venda.create({
        data: {
          numero,
          status: "CONCLUIDA",
          sessaoId: sessao.id,
          usuarioId: usuario.usuarioId,
          clienteId,
          subtotal: totais.subtotal,
          desconto: totais.descontoGeral,
          total: totais.total,
          custoTotal,
          taxasTotal,
          observacao: entrada.observacao ?? null,
        },
      });

      // ---- itens, FEFO, movimentos de estoque
      const lotesCache = new Map<number, { id: number; quantidade: number }[]>();
      for (const linha of linhas) {
        let lotes: { id: number; quantidade: number }[] = [];
        if (linha.controlaValidade) {
          if (!lotesCache.has(linha.produtoId)) {
            const encontrados = await tx.lote.findMany({
              where: { produtoId: linha.produtoId, quantidade: { gt: 0 } },
              orderBy: [{ validade: "asc" }, { id: "asc" }],
              select: { id: true, quantidade: true },
            });
            lotesCache.set(linha.produtoId, encontrados);
          }
          lotes = lotesCache.get(linha.produtoId)!;
        }
        const distribuicao = distribuirFefo(lotes, linha.quantidade);
        const { partes } = dividirItemPorLotes(
          { quantidade: linha.quantidade, precoUnitario: linha.precoUnitario, desconto: linha.desconto },
          distribuicao,
        );
        for (const parte of partes) {
          await tx.itemVenda.create({
            data: {
              vendaId: venda.id,
              produtoId: linha.produtoId,
              descricao: linha.descricao,
              unidade: linha.unidade,
              quantidade: parte.quantidade,
              precoUnitario: linha.precoUnitario,
              custoUnitario: linha.custoUnitario,
              desconto: parte.desconto,
              total: parte.total,
              loteId: parte.loteId,
            },
          });
          if (parte.loteId !== null) {
            await tx.lote.update({
              where: { id: parte.loteId },
              data: { quantidade: { decrement: parte.quantidade } },
            });
            // mantém o cache coerente pra próxima linha do mesmo produto
            const lote = lotes.find((l) => l.id === parte.loteId);
            if (lote) lote.quantidade -= parte.quantidade;
          }
        }
        await tx.produto.update({
          where: { id: linha.produtoId },
          data: { estoque: { decrement: linha.quantidade } },
        });
        await tx.movimentoEstoque.create({
          data: {
            produtoId: linha.produtoId,
            tipo: "VENDA",
            quantidade: -linha.quantidade,
            estoqueApos: linha.estoqueApos,
            custoUnitario: linha.custoUnitario,
            vendaId: venda.id,
            usuarioId: usuario.usuarioId,
            motivo: `Venda nº ${numero}`,
          },
        });
      }

      // ---- pagamentos
      let troco = 0;
      for (let i = 0; i < pagamentosNormalizados.length; i++) {
        const p = pagamentosNormalizados[i];
        const taxa = taxas[i];
        const valorRecebido = p.forma === "DINHEIRO" ? (p.valorRecebido ?? p.valor) : null;
        const trocoPagamento = p.forma === "DINHEIRO" ? calcularTroco(p.valor, valorRecebido!) : 0;
        troco += trocoPagamento;
        const usaMp = (p.forma === "DEBITO" || p.forma === "CREDITO") && p.mpPaymentIntentId;
        const passaEmMaquininha = p.forma === "DEBITO" || p.forma === "CREDITO" || p.forma === "PIX";
        await tx.pagamento.create({
          data: {
            vendaId: venda.id,
            forma: p.forma,
            valor: p.valor,
            valorRecebido,
            troco: trocoPagamento,
            parcelas: p.forma === "CREDITO" ? p.parcelas : 1,
            taxaPercentual: taxa.taxaPercentual,
            taxaFixa: taxa.taxaFixa,
            taxaValor: taxa.taxaValor,
            maquininhaId: p.maquininhaId,
            nsu: passaEmMaquininha && p.nsu ? p.nsu : null,
            autorizacao: passaEmMaquininha && p.autorizacao ? p.autorizacao : null,
            mpPaymentIntentId: usaMp ? p.mpPaymentIntentId : null,
            mpPaymentId: usaMp ? (p.mpPaymentId ?? null) : null,
            mpStatus: usaMp ? ((p.mpStatus ?? "APROVADO") as StatusPagamentoMP) : null,
          },
        });
      }

      // ---- fiado: um débito por venda
      if (valorFiado > 0 && clienteId !== null) {
        await tx.lancamentoFiado.create({
          data: {
            clienteId,
            tipo: "DEBITO",
            valor: valorFiado,
            vendaId: venda.id,
            usuarioId: usuario.usuarioId,
            observacao: `Venda nº ${numero}`,
          },
        });
      }

      return { vendaId: venda.id, numero, troco, total: totais.total };
    },
    { maxWait: 5000, timeout: 20000 },
  );
}

// ---------------------------------------------------------------- cancelar

/**
 * Cancela uma venda concluída: marca CANCELADA, devolve o estoque (com
 * MovimentoEstoque CANCELAMENTO_VENDA) e os lotes, e estorna o fiado com um
 * lançamento ESTORNO do valor do débito (mantém o rastro em vez de apagar o
 * débito; nunca PAGAMENTO, pra não contar como dinheiro recebido).
 */
export async function cancelarVenda(
  params: { vendaId: number; motivo: string },
  usuario: UsuarioAtuante,
): Promise<{ numero: number }> {
  const motivo = params.motivo.trim();
  if (motivo.length < 3) throw new Error("Informe o motivo do cancelamento.");

  return db.$transaction(
    async (tx) => {
      const venda = await tx.venda.findUnique({
        where: { id: params.vendaId },
        include: { itens: true, pagamentos: true, lancamentosFiado: { where: { tipo: "DEBITO" } } },
      });
      if (!venda) throw new Error("Venda não encontrada.");

      const sessaoAberta = await obterSessaoCaixaAberta(tx);
      const permissao = podeCancelarVenda(venda, usuario, sessaoAberta?.id ?? null, agora());
      if (!permissao.ok) throw new Error(permissao.motivo);

      const quando = agora();
      await tx.venda.update({
        where: { id: venda.id },
        data: {
          status: "CANCELADA",
          canceladaEm: quando,
          canceladaPorId: usuario.usuarioId,
          motivoCancelamento: motivo,
        },
      });

      // devolve estoque, agrupando por produto pra ter um movimento por produto
      const porProduto = new Map<number, { quantidade: number; custoUnitario: number }>();
      for (const item of venda.itens) {
        const atual = porProduto.get(item.produtoId) ?? { quantidade: 0, custoUnitario: item.custoUnitario };
        atual.quantidade += item.quantidade;
        porProduto.set(item.produtoId, atual);
        if (item.loteId !== null) {
          await tx.lote.update({ where: { id: item.loteId }, data: { quantidade: { increment: item.quantidade } } });
        }
      }
      for (const [produtoId, dados] of porProduto) {
        const produto = await tx.produto.update({
          where: { id: produtoId },
          data: { estoque: { increment: dados.quantidade } },
          select: { estoque: true },
        });
        await tx.movimentoEstoque.create({
          data: {
            produtoId,
            tipo: "CANCELAMENTO_VENDA",
            quantidade: dados.quantidade,
            estoqueApos: produto.estoque,
            custoUnitario: dados.custoUnitario,
            vendaId: venda.id,
            usuarioId: usuario.usuarioId,
            motivo: `Cancelamento da venda nº ${venda.numero}`,
          },
        });
      }

      // estorna fiado: ESTORNO do valor do débito da venda (sem forma e sem sessão de caixa)
      const debitoFiado = venda.lancamentosFiado[0] ?? null;
      const valorFiado =
        debitoFiado?.valor ?? venda.pagamentos.filter((p) => p.forma === "FIADO").reduce((a, p) => a + p.valor, 0);
      const clienteFiadoId = debitoFiado?.clienteId ?? venda.clienteId;
      if (valorFiado > 0 && clienteFiadoId !== null) {
        await tx.lancamentoFiado.create({
          data: {
            clienteId: clienteFiadoId,
            tipo: "ESTORNO",
            valor: valorFiado,
            vendaId: venda.id,
            usuarioId: usuario.usuarioId,
            observacao: `Cancelamento da venda nº ${venda.numero}`,
          },
        });
      }

      await registrarAuditoria(
        {
          usuarioId: usuario.usuarioId,
          acao: "venda.cancelar",
          entidade: "Venda",
          entidadeId: venda.id,
          detalhes: { numero: venda.numero, total: venda.total, motivo, valorFiadoEstornado: valorFiado },
        },
        tx,
      );

      return { numero: venda.numero };
    },
    { maxWait: 5000, timeout: 20000 },
  );
}

// ---------------------------------------------------------------- leitura

export type FiltrosVendas = {
  de?: Date | null;
  ate?: Date | null;
  forma?: FormaPagamento | null;
  status?: StatusVenda | null;
  usuarioId?: number | null;
  cliente?: string | null;
  numero?: number | null;
  /** só vendas com algum pagamento nessa maquininha */
  maquininhaId?: number | null;
};

export const VENDAS_POR_PAGINA = 50;

function montarWhere(filtros: FiltrosVendas): Prisma.VendaWhereInput {
  const where: Prisma.VendaWhereInput = {};
  if (filtros.numero) where.numero = filtros.numero;
  if (filtros.de || filtros.ate) {
    where.criadoEm = {
      ...(filtros.de ? { gte: filtros.de } : {}),
      ...(filtros.ate ? { lte: filtros.ate } : {}),
    };
  }
  if (filtros.status) where.status = filtros.status;
  if (filtros.usuarioId) where.usuarioId = filtros.usuarioId;
  if (filtros.forma || filtros.maquininhaId) {
    where.pagamentos = {
      some: {
        ...(filtros.forma ? { forma: filtros.forma } : {}),
        ...(filtros.maquininhaId ? { maquininhaId: filtros.maquininhaId } : {}),
      },
    };
  }
  if (filtros.cliente?.trim()) where.cliente = { nome: { contains: filtros.cliente.trim(), mode: "insensitive" } };
  return where;
}

export type TotaisVendas = {
  quantidade: number;
  canceladas: number;
  receita: number;
  cmv: number;
  taxas: number;
  lucroBruto: number;
};

/** Lista paginada + totais do filtro (totais só contam vendas concluídas). */
export async function listarVendas(filtros: FiltrosVendas, pagina = 1, tx: ClienteDb = db) {
  const where = montarWhere(filtros);
  const paginaAtual = Math.max(1, pagina);
  const [vendas, totalRegistros, agregadoConcluidas, canceladas] = await Promise.all([
    tx.venda.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip: (paginaAtual - 1) * VENDAS_POR_PAGINA,
      take: VENDAS_POR_PAGINA,
      include: {
        usuario: { select: { id: true, nome: true } },
        cliente: { select: { id: true, nome: true } },
        pagamentos: { select: { forma: true, valor: true } },
        // só o produtoId: a lista conta produtos distintos, não linhas por lote (FEFO)
        itens: { select: { produtoId: true } },
      },
    }),
    tx.venda.count({ where }),
    tx.venda.aggregate({
      where: { ...where, status: "CONCLUIDA" },
      _count: { _all: true },
      _sum: { total: true, custoTotal: true, taxasTotal: true },
    }),
    tx.venda.count({ where: { ...where, status: "CANCELADA" } }),
  ]);
  const receita = agregadoConcluidas._sum.total ?? 0;
  const cmv = agregadoConcluidas._sum.custoTotal ?? 0;
  const taxas = agregadoConcluidas._sum.taxasTotal ?? 0;
  const totais: TotaisVendas = {
    quantidade: agregadoConcluidas._count._all,
    canceladas,
    receita,
    cmv,
    taxas,
    lucroBruto: receita - cmv - taxas,
  };
  return {
    vendas,
    totais,
    pagina: paginaAtual,
    totalPaginas: Math.max(1, Math.ceil(totalRegistros / VENDAS_POR_PAGINA)),
    totalRegistros,
  };
}

/** Venda completa pro detalhe e pro cupom. */
export async function obterVenda(id: number, tx: ClienteDb = db) {
  return tx.venda.findUnique({
    where: { id },
    include: {
      itens: { orderBy: { id: "asc" }, include: { lote: { select: { id: true, codigo: true, validade: true } } } },
      pagamentos: { orderBy: { id: "asc" }, include: { maquininha: { select: { id: true, nome: true, adquirente: true } } } },
      usuario: { select: { id: true, nome: true } },
      cliente: { select: { id: true, nome: true, cpf: true, telefone: true } },
      sessao: { select: { id: true, abertoEm: true, status: true } },
      canceladaPor: { select: { id: true, nome: true } },
    },
  });
}

export type VendaDetalhe = NonNullable<Awaited<ReturnType<typeof obterVenda>>>;

// ---------------------------------------------------------------- buscas do PDV

export type ProdutoPdv = {
  id: number;
  nome: string;
  unidade: "UN" | "KG";
  codigoBarras: string | null;
  codigoInterno: string | null;
  /** centavos, já com promoção */
  precoUnitario: number;
  /** centavos, preço de tabela (pra mostrar quando há promoção) */
  precoVenda: number;
  emPromocao: boolean;
  /** milésimos */
  estoque: number;
  controlaValidade: boolean;
  categoria: string | null;
};

export function paraProdutoPdv(produto: {
  id: number;
  nome: string;
  unidade: "UN" | "KG";
  codigoBarras: string | null;
  codigoInterno: string | null;
  precoVenda: number;
  precoPromocional: number | null;
  promocaoAte: Date | null;
  estoque: number;
  controlaValidade: boolean;
  categoria?: { nome: string } | null;
}): ProdutoPdv {
  const precoUnitario = precoEfetivo(produto);
  return {
    id: produto.id,
    nome: produto.nome,
    unidade: produto.unidade,
    codigoBarras: produto.codigoBarras,
    codigoInterno: produto.codigoInterno,
    precoUnitario,
    precoVenda: produto.precoVenda,
    emPromocao: precoUnitario !== produto.precoVenda,
    estoque: produto.estoque,
    controlaValidade: produto.controlaValidade,
    categoria: produto.categoria?.nome ?? null,
  };
}

/**
 * Produto DESATIVADO que bate com o código bipado (mesmas variantes de EAN de
 * buscarProdutoPorCodigo, que só enxerga ativos). Serve pro caixa avisar que o
 * produto existe e onde reativar, em vez de mandar cadastrar de novo.
 */
export async function buscarProdutoInativoPorCodigo(
  codigo: string,
  tx: ClienteDb = db,
): Promise<{ id: number; nome: string } | null> {
  const c = codigo.trim();
  if (!c) return null;
  const variantes = [c];
  if (/^\d{12}$/.test(c)) variantes.push(`0${c}`);
  if (/^0\d{12}$/.test(c)) variantes.push(c.slice(1));
  return tx.produto.findFirst({
    where: {
      ativo: false,
      OR: [{ codigoInterno: c }, { codigoBarras: { in: variantes } }],
    },
    select: { id: true, nome: true },
  });
}

export type ClientePdv = {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  /** centavos */
  limiteFiado: number;
  /** centavos, quanto já deve */
  saldoFiado: number;
};

/** Busca cliente por nome, CPF ou telefone (só dígitos) pro PDV, com saldo fiado. */
export async function buscarClientesPdv(termo: string, limite = 8, tx: ClienteDb = db): Promise<ClientePdv[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const digitos = t.replace(/\D/g, "");
  const condicoes: Prisma.ClienteWhereInput[] = [{ nome: { contains: t, mode: "insensitive" } }];
  if (digitos.length >= 3) {
    condicoes.push({ cpf: { contains: digitos, mode: "insensitive" } }, { telefone: { contains: digitos, mode: "insensitive" } });
  }
  const clientes = await tx.cliente.findMany({
    where: { ativo: true, OR: condicoes },
    orderBy: { nome: "asc" },
    take: limite,
    select: { id: true, nome: true, cpf: true, telefone: true, limiteFiado: true },
  });
  const saldos = await Promise.all(clientes.map((c) => saldoFiado(c.id, tx)));
  return clientes.map((c, i) => ({ ...c, saldoFiado: saldos[i] }));
}

/** Um cliente específico com saldo (pra reconferir no PDV antes do fiado). */
export async function obterClientePdv(id: number, tx: ClienteDb = db): Promise<ClientePdv | null> {
  const c = await tx.cliente.findUnique({
    where: { id },
    select: { id: true, nome: true, cpf: true, telefone: true, limiteFiado: true, ativo: true },
  });
  if (!c || !c.ativo) return null;
  return { id: c.id, nome: c.nome, cpf: c.cpf, telefone: c.telefone, limiteFiado: c.limiteFiado, saldoFiado: await saldoFiado(c.id, tx) };
}
