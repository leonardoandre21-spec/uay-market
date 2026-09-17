import { MIL, totalLinha } from "@/lib/dinheiro";
import { novaChave, type ItemCarrinho, type ProdutoPdv } from "./tipos";

/** Estado do carrinho: itens + qual linha está selecionada (pra Delete/F4). */
export type EstadoCarrinho = {
  itens: ItemCarrinho[];
  selecionada: string | null;
};

export type AcaoCarrinho =
  | { tipo: "ADICIONAR"; produto: ProdutoPdv; quantidade: number }
  | { tipo: "ALTERAR_QUANTIDADE"; chave: string; quantidade: number }
  | { tipo: "ALTERAR_DESCONTO"; chave: string; desconto: number }
  | { tipo: "REMOVER"; chave: string }
  | { tipo: "SELECIONAR"; chave: string }
  | { tipo: "LIMPAR" }
  /** venda em andamento recuperada do sessionStorage (F5, volta do cadastro) */
  | { tipo: "RESTAURAR"; itens: ItemCarrinho[] };

export const CARRINHO_VAZIO: EstadoCarrinho = { itens: [], selecionada: null };

export function reduzirCarrinho(estado: EstadoCarrinho, acao: AcaoCarrinho): EstadoCarrinho {
  switch (acao.tipo) {
    case "ADICIONAR": {
      const { produto, quantidade } = acao;
      // Bipar de novo o mesmo produto por unidade só soma na linha existente.
      if (produto.unidade === "UN") {
        const idx = estado.itens.findIndex((i) => i.produtoId === produto.id);
        if (idx >= 0) {
          const itens = estado.itens.slice();
          itens[idx] = { ...itens[idx], quantidade: itens[idx].quantidade + quantidade };
          return { itens, selecionada: itens[idx].chave };
        }
      }
      const novo: ItemCarrinho = {
        chave: novaChave(),
        produtoId: produto.id,
        nome: produto.nome,
        unidade: produto.unidade,
        precoUnitario: produto.precoUnitario,
        precoVenda: produto.precoVenda,
        emPromocao: produto.emPromocao,
        quantidade,
        desconto: 0,
        estoque: produto.estoque,
        controlaValidade: produto.controlaValidade,
      };
      return { itens: [...estado.itens, novo], selecionada: novo.chave };
    }
    case "ALTERAR_QUANTIDADE": {
      if (acao.quantidade <= 0) return reduzirCarrinho(estado, { tipo: "REMOVER", chave: acao.chave });
      return {
        ...estado,
        itens: estado.itens.map((i) => {
          if (i.chave !== acao.chave) return i;
          const quantidade = i.unidade === "UN" ? Math.round(acao.quantidade / MIL) * MIL : acao.quantidade;
          // Diminuir a quantidade não pode deixar o desconto maior que a linha:
          // a tela mascararia (total 0) e o servidor recusaria a venda.
          const desconto = Math.min(i.desconto, totalLinha(quantidade, i.precoUnitario));
          return { ...i, quantidade, desconto };
        }),
      };
    }
    case "ALTERAR_DESCONTO":
      return {
        ...estado,
        itens: estado.itens.map((i) => (i.chave === acao.chave ? { ...i, desconto: Math.max(0, acao.desconto) } : i)),
      };
    case "REMOVER": {
      const idx = estado.itens.findIndex((i) => i.chave === acao.chave);
      if (idx < 0) return estado;
      const itens = estado.itens.filter((i) => i.chave !== acao.chave);
      const proxima = itens[Math.min(idx, itens.length - 1)]?.chave ?? null;
      return { itens, selecionada: estado.selecionada === acao.chave ? proxima : estado.selecionada };
    }
    case "SELECIONAR":
      return { ...estado, selecionada: acao.chave };
    case "LIMPAR":
      return CARRINHO_VAZIO;
    case "RESTAURAR":
      return { itens: acao.itens, selecionada: acao.itens[acao.itens.length - 1]?.chave ?? null };
    default:
      return estado;
  }
}

/** Quantidade total já no carrinho de um produto (pra conferir estoque antes de somar). */
export function quantidadeNoCarrinho(itens: ItemCarrinho[], produtoId: number): number {
  return itens.filter((i) => i.produtoId === produtoId).reduce((a, i) => a + i.quantidade, 0);
}
