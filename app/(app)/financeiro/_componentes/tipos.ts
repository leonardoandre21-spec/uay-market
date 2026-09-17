// Tipos serializáveis que as páginas (Server) passam pros componentes de
// interação (Client). Datas viajam como "yyyy-MM-dd" ou já formatadas.

import type { FormaPagamento, StatusConta } from "@prisma/client";

export type Opcao = { id: number; nome: string };

export type DespesaLinha = {
  id: number;
  descricao: string;
  categoriaId: number | null;
  categoriaNome: string | null;
  fornecedorId: number | null;
  fornecedorNome: string | null;
  valor: number;
  dataInput: string; // yyyy-MM-dd
  dataFormatada: string; // dd/MM/yyyy
  formaPagamento: FormaPagamento | null;
  pagoDoCaixa: boolean;
  sessaoFechada: boolean;
  contaPagarId: number | null;
  observacao: string | null;
};

export type ContaLinha = {
  id: number;
  descricao: string;
  fornecedorId: number | null;
  fornecedorNome: string | null;
  categoriaId: number | null;
  categoriaNome: string | null;
  valor: number;
  vencimentoInput: string; // yyyy-MM-dd
  vencimentoFormatado: string;
  dias: number; // dias até o vencimento (negativo = atrasada)
  status: StatusConta;
  dataPagamentoFormatada: string | null;
  valorPago: number | null;
  formaPagamento: FormaPagamento | null;
  linhaDigitavel: string | null;
  recorrenciaMensal: boolean;
  diaVencimento: number | null; // dia original da recorrência / do carnê
  parcelaAtual: number | null;
  totalParcelas: number | null;
  observacao: string | null;
  despesaId: number | null;
  pagaDoCaixa: boolean;
};

export type FornecedorLinha = {
  id: number;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  contato: string | null;
  observacao: string | null;
  ativo: boolean;
};
