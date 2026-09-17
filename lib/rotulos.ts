// Rótulos em português pros enums do schema. Use sempre estes na interface.

import type {
  FormaPagamento,
  MotivoPerda,
  Papel,
  Recorrencia,
  StatusCaixa,
  StatusConta,
  StatusVenda,
  TipoLancamentoFiado,
  TipoMovimentoCaixa,
  TipoMovimentoEstoque,
  Unidade,
} from "@prisma/client";

export const ROTULO_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  DEBITO: "Cartão de débito",
  CREDITO: "Cartão de crédito",
  FIADO: "Fiado",
};

export const ROTULO_FORMA_PAGAMENTO_CURTO: Record<FormaPagamento, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  FIADO: "Fiado",
};

export const FORMAS_PAGAMENTO: FormaPagamento[] = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "FIADO"];

export const ROTULO_UNIDADE: Record<Unidade, string> = {
  UN: "Unidade",
  KG: "Quilo",
};

export const ROTULO_PAPEL: Record<Papel, string> = {
  ADMIN: "Administrador",
  OPERADOR: "Operador de caixa",
};

export const ROTULO_STATUS_VENDA: Record<StatusVenda, string> = {
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const ROTULO_STATUS_CAIXA: Record<StatusCaixa, string> = {
  ABERTO: "Aberto",
  FECHADO: "Fechado",
};

export const ROTULO_MOVIMENTO_CAIXA: Record<TipoMovimentoCaixa, string> = {
  SANGRIA: "Sangria (retirada)",
  SUPRIMENTO: "Suprimento (reforço)",
};

export const ROTULO_MOVIMENTO_ESTOQUE: Record<TipoMovimentoEstoque, string> = {
  ENTRADA: "Entrada",
  VENDA: "Venda",
  PERDA: "Perda",
  AJUSTE: "Ajuste",
  CANCELAMENTO_VENDA: "Cancelamento de venda",
};

export const ROTULO_MOTIVO_PERDA: Record<MotivoPerda, string> = {
  VENCIDO: "Vencido",
  AVARIA: "Avaria",
  FURTO: "Furto",
  QUEBRA: "Quebra",
  CONSUMO_INTERNO: "Consumo interno",
  OUTRO: "Outro",
};

export const MOTIVOS_PERDA: MotivoPerda[] = ["VENCIDO", "AVARIA", "FURTO", "QUEBRA", "CONSUMO_INTERNO", "OUTRO"];

export const ROTULO_STATUS_CONTA: Record<StatusConta, string> = {
  PENDENTE: "Pendente",
  PAGA: "Paga",
  CANCELADA: "Cancelada",
};

export const ROTULO_RECORRENCIA: Record<Recorrencia, string> = {
  MENSAL: "Mensal",
};

export const ROTULO_LANCAMENTO_FIADO: Record<TipoLancamentoFiado, string> = {
  DEBITO: "Compra fiado",
  PAGAMENTO: "Pagamento",
  ESTORNO: "Estorno (venda cancelada)",
};
