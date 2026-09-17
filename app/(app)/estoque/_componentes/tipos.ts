// Tipos compartilhados entre as actions e os Client Components do módulo de
// estoque. Só dados serializáveis (nada de Date nem função).

export type ProdutoResumo = {
  id: number;
  nome: string;
  codigoBarras: string | null;
  codigoInterno: string | null;
  unidade: "UN" | "KG";
  categoriaNome: string | null;
  precoCusto: number;
  precoVenda: number;
  estoque: number;
  controlaValidade: boolean;
};

export type FornecedorOpcao = { id: number; nome: string };

export type CategoriaDespesaOpcao = { id: number; nome: string };

/** Pré-preenchimento do diálogo de perda (vindo da tela de vencimentos). */
export type PerdaPreenchida = {
  produto: ProdutoResumo;
  loteId: number | null;
  quantidade: number;
  motivo: "VENCIDO" | "AVARIA" | "FURTO" | "QUEBRA" | "CONSUMO_INTERNO" | "OUTRO";
};
