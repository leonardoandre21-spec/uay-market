// Converte registros do Prisma (com Date) nos tipos serializáveis da interface.

import { formatarData, paraDataInput } from "@/lib/datas";
import { diasAteVencimento } from "@/lib/servicos/financeiro-calculos";
import type { ContaCompleta, DespesaCompleta } from "@/lib/servicos/financeiro";
import type { ContaLinha, DespesaLinha } from "./tipos";

export function despesaParaLinha(d: DespesaCompleta): DespesaLinha {
  return {
    id: d.id,
    descricao: d.descricao,
    categoriaId: d.categoriaId,
    categoriaNome: d.categoria?.nome ?? null,
    fornecedorId: d.fornecedorId,
    fornecedorNome: d.fornecedor?.nome ?? null,
    valor: d.valor,
    dataInput: paraDataInput(d.data),
    dataFormatada: formatarData(d.data),
    formaPagamento: d.formaPagamento,
    pagoDoCaixa: d.pagoDoCaixa,
    sessaoFechada: d.sessao?.status === "FECHADO",
    contaPagarId: d.contaPagarId,
    observacao: d.observacao,
  };
}

export function contaParaLinha(c: ContaCompleta, referencia: Date): ContaLinha {
  return {
    id: c.id,
    descricao: c.descricao,
    fornecedorId: c.fornecedorId,
    fornecedorNome: c.fornecedor?.nome ?? null,
    categoriaId: c.categoriaId,
    categoriaNome: c.categoria?.nome ?? null,
    valor: c.valor,
    vencimentoInput: paraDataInput(c.vencimento),
    vencimentoFormatado: formatarData(c.vencimento),
    dias: diasAteVencimento(c.vencimento, referencia),
    status: c.status,
    dataPagamentoFormatada: c.dataPagamento ? formatarData(c.dataPagamento) : null,
    valorPago: c.valorPago,
    formaPagamento: c.formaPagamento,
    linhaDigitavel: c.linhaDigitavel,
    recorrenciaMensal: c.recorrencia === "MENSAL",
    diaVencimento: c.diaVencimento,
    parcelaAtual: c.parcelaAtual,
    totalParcelas: c.totalParcelas,
    observacao: c.observacao,
    despesaId: c.despesa?.id ?? null,
    pagaDoCaixa: Boolean(c.despesa?.sessaoId),
  };
}
