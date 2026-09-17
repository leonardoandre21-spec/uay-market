import type { FormaPagamento, Papel, StatusPagamentoMP } from "@prisma/client";
import type { ClientePdv, ProdutoPdv } from "@/lib/servicos/vendas";

export type { ClientePdv, ProdutoPdv };

/** Tudo que o Server Component entrega pro PDV (só valores serializáveis). */
export type DadosPdv = {
  sessao: { id: number; valorAbertura: number; abertoEm: string };
  config: {
    nomeLoja: string;
    permitirDescontoOperador: boolean;
    descontoMaximoPercentual: number;
    permitirVendaSemEstoque: boolean;
    pix: { chave: string; nome: string; cidade: string } | null;
    mpConfigurado: boolean;
  };
  formas: { forma: FormaPagamento; maxParcelas: number }[];
  /** maquininhas ativas (padrão primeiro); vazio = registro sem maquininha, como antes */
  maquininhas: MaquininhaPdv[];
  papel: Papel;
  usuarioNome: string;
  codigoInicial: string | null;
  erroInicial: string | null;
};

/** Maquininha ativa como o PDV vê: nome pro botão e taxas pra mostrar o líquido. */
export type MaquininhaPdv = {
  id: number;
  nome: string;
  adquirente: string | null;
  padrao: boolean;
  taxaDebito: number;
  taxaCredito: number;
  taxaCreditoParcelado: number;
  taxaPix: number;
};

/** Chave do localStorage com a última maquininha usada neste navegador. */
export const CHAVE_ULTIMA_MAQUININHA = "uay.ultimaMaquininha";

/** Linha do carrinho na tela. */
export type ItemCarrinho = {
  chave: string;
  produtoId: number;
  nome: string;
  unidade: "UN" | "KG";
  /** centavos, preço praticado */
  precoUnitario: number;
  /** centavos, preço de tabela quando em promoção */
  precoVenda: number;
  emPromocao: boolean;
  /** milésimos */
  quantidade: number;
  /** centavos */
  desconto: number;
  /** milésimos no momento do bipe */
  estoque: number;
  controlaValidade: boolean;
};

export type EstadoMp = {
  intentId: string;
  paymentId: string | null;
  status: StatusPagamentoMP;
};

/** Pagamento já adicionado no diálogo de finalização. */
export type PagamentoUi = {
  chave: string;
  forma: FormaPagamento;
  /** centavos que quitam a venda */
  valor: number;
  /** centavos entregues (só DINHEIRO) */
  valorRecebido: number | null;
  parcelas: number;
  /** em qual maquininha passou (DEBITO/CREDITO/PIX) */
  maquininhaId: number | null;
  maquininhaNome: string | null;
  /** NSU/doc e autorização do comprovante (opcionais) */
  nsu: string | null;
  autorizacao: string | null;
  mp: EstadoMp | null;
};

export type VendaConcluida = {
  vendaId: number;
  numero: number;
  troco: number;
  total: number;
};

export function novaChave(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
