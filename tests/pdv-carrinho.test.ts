import { describe, expect, it } from "vitest";
import { CARRINHO_VAZIO, quantidadeNoCarrinho, reduzirCarrinho } from "@/app/(pdv)/pdv/_componentes/carrinho-reducer";
import {
  carrinhoVazio,
  chaveCarrinho,
  lerCarrinhoSalvo,
  serializarCarrinho,
  VALIDADE_CARRINHO_MS,
  type CarrinhoSalvo,
} from "@/app/(pdv)/pdv/_componentes/carrinho-storage";
import type { ItemCarrinho, PagamentoUi, ProdutoPdv } from "@/app/(pdv)/pdv/_componentes/tipos";

const pao: ProdutoPdv = {
  id: 1,
  nome: "Pão",
  unidade: "UN",
  codigoBarras: "7890000000017",
  codigoInterno: null,
  precoUnitario: 100,
  precoVenda: 100,
  emPromocao: false,
  estoque: 50_000,
  controlaValidade: false,
  categoria: null,
};

const queijo: ProdutoPdv = { ...pao, id: 2, nome: "Queijo", unidade: "KG", precoUnitario: 3990, precoVenda: 3990, controlaValidade: true };

describe("reduzirCarrinho", () => {
  it("bipar o mesmo produto por unidade soma na linha existente", () => {
    let estado = reduzirCarrinho(CARRINHO_VAZIO, { tipo: "ADICIONAR", produto: pao, quantidade: 1000 });
    estado = reduzirCarrinho(estado, { tipo: "ADICIONAR", produto: pao, quantidade: 2000 });
    expect(estado.itens).toHaveLength(1);
    expect(estado.itens[0].quantidade).toBe(3000);
    expect(quantidadeNoCarrinho(estado.itens, pao.id)).toBe(3000);
  });

  it("produto por quilo abre uma linha por pesagem", () => {
    let estado = reduzirCarrinho(CARRINHO_VAZIO, { tipo: "ADICIONAR", produto: queijo, quantidade: 400 });
    estado = reduzirCarrinho(estado, { tipo: "ADICIONAR", produto: queijo, quantidade: 300 });
    expect(estado.itens).toHaveLength(2);
  });

  it("reduzir a quantidade limita o desconto ao novo valor da linha (servidor recusaria desconto > bruto)", () => {
    let estado = reduzirCarrinho(CARRINHO_VAZIO, { tipo: "ADICIONAR", produto: pao, quantidade: 3000 });
    const chave = estado.itens[0].chave;
    estado = reduzirCarrinho(estado, { tipo: "ALTERAR_DESCONTO", chave, desconto: 200 }); // 3 × R$ 1,00, desconto R$ 2,00
    estado = reduzirCarrinho(estado, { tipo: "ALTERAR_QUANTIDADE", chave, quantidade: 1000 }); // cliente devolveu 2
    expect(estado.itens[0].quantidade).toBe(1000);
    expect(estado.itens[0].desconto).toBe(100); // R$ 1,00, nunca maior que a linha
  });

  it("aumentar a quantidade preserva o desconto", () => {
    let estado = reduzirCarrinho(CARRINHO_VAZIO, { tipo: "ADICIONAR", produto: pao, quantidade: 1000 });
    const chave = estado.itens[0].chave;
    estado = reduzirCarrinho(estado, { tipo: "ALTERAR_DESCONTO", chave, desconto: 50 });
    estado = reduzirCarrinho(estado, { tipo: "ALTERAR_QUANTIDADE", chave, quantidade: 5000 });
    expect(estado.itens[0].desconto).toBe(50);
  });

  it("quantidade por unidade é arredondada pra inteiro e o desconto acompanha", () => {
    let estado = reduzirCarrinho(CARRINHO_VAZIO, { tipo: "ADICIONAR", produto: pao, quantidade: 2000 });
    const chave = estado.itens[0].chave;
    estado = reduzirCarrinho(estado, { tipo: "ALTERAR_DESCONTO", chave, desconto: 150 });
    estado = reduzirCarrinho(estado, { tipo: "ALTERAR_QUANTIDADE", chave, quantidade: 1400 });
    expect(estado.itens[0].quantidade).toBe(1000);
    expect(estado.itens[0].desconto).toBe(100);
  });

  it("quantidade zero remove a linha", () => {
    let estado = reduzirCarrinho(CARRINHO_VAZIO, { tipo: "ADICIONAR", produto: pao, quantidade: 1000 });
    estado = reduzirCarrinho(estado, { tipo: "ALTERAR_QUANTIDADE", chave: estado.itens[0].chave, quantidade: 0 });
    expect(estado.itens).toHaveLength(0);
    expect(estado.selecionada).toBeNull();
  });

  it("RESTAURAR repõe os itens e seleciona o último", () => {
    const itens: ItemCarrinho[] = [
      { chave: "a", produtoId: 1, nome: "Pão", unidade: "UN", precoUnitario: 100, precoVenda: 100, emPromocao: false, quantidade: 2000, desconto: 0, estoque: 10_000, controlaValidade: false },
      { chave: "b", produtoId: 2, nome: "Queijo", unidade: "KG", precoUnitario: 3990, precoVenda: 3990, emPromocao: false, quantidade: 400, desconto: 0, estoque: 5000, controlaValidade: true },
    ];
    const estado = reduzirCarrinho(CARRINHO_VAZIO, { tipo: "RESTAURAR", itens });
    expect(estado.itens).toEqual(itens);
    expect(estado.selecionada).toBe("b");
  });
});

describe("carrinho guardado no sessionStorage", () => {
  const agora = 1_800_000_000_000;
  const itens: ItemCarrinho[] = [
    { chave: "a", produtoId: 1, nome: "Pão", unidade: "UN", precoUnitario: 100, precoVenda: 100, emPromocao: false, quantidade: 2000, desconto: 0, estoque: 10_000, controlaValidade: false },
  ];
  const pagamentoMp: PagamentoUi = {
    chave: "p1",
    forma: "CREDITO",
    valor: 8000,
    valorRecebido: null,
    parcelas: 1,
    maquininhaId: 3,
    maquininhaNome: "Point",
    nsu: null,
    autorizacao: null,
    mp: { intentId: "abc", paymentId: "123", status: "APROVADO" },
  };
  const carrinho: CarrinhoSalvo = {
    itens,
    descontoModo: "VALOR",
    descontoValor: 50,
    cliente: { id: 7, nome: "Maria", cpf: null, telefone: "31999990000", limiteFiado: 20_000, saldoFiado: 0 },
    pagamentos: [pagamentoMp],
  };

  it("a chave é por sessão de caixa", () => {
    expect(chaveCarrinho(12)).toBe("uay.carrinho.12");
    expect(chaveCarrinho(13)).not.toBe(chaveCarrinho(12));
  });

  it("vai e volta sem perder itens, desconto, cliente nem a cobrança aprovada na maquininha", () => {
    const json = serializarCarrinho(carrinho, agora);
    expect(lerCarrinhoSalvo(json, agora + 60_000)).toEqual(carrinho);
  });

  it("descarta registro vencido, de outra versão, corrompido ou ausente", () => {
    const json = serializarCarrinho(carrinho, agora);
    expect(lerCarrinhoSalvo(json, agora + VALIDADE_CARRINHO_MS + 1)).toBeNull();
    expect(lerCarrinhoSalvo(json.replace('"versao":1', '"versao":99'), agora)).toBeNull();
    expect(lerCarrinhoSalvo("{isso não é json", agora)).toBeNull();
    expect(lerCarrinhoSalvo(null, agora)).toBeNull();
    expect(lerCarrinhoSalvo("", agora)).toBeNull();
    expect(lerCarrinhoSalvo("42", agora)).toBeNull();
  });

  it("descarta item ou pagamento com formato inválido em vez de restaurar lixo", () => {
    const comItemQuebrado = serializarCarrinho(carrinho, agora).replace('"quantidade":2000', '"quantidade":"dois"');
    expect(lerCarrinhoSalvo(comItemQuebrado, agora)).toBeNull();
    const comFormaInvalida = serializarCarrinho(carrinho, agora).replace('"forma":"CREDITO"', '"forma":"CHEQUE"');
    expect(lerCarrinhoSalvo(comFormaInvalida, agora)).toBeNull();
  });

  it("carrinho vazio não é restaurado (nem guardado)", () => {
    const vazio: CarrinhoSalvo = { itens: [], descontoModo: "VALOR", descontoValor: 0, cliente: null, pagamentos: [] };
    expect(carrinhoVazio(vazio)).toBe(true);
    expect(carrinhoVazio(carrinho)).toBe(false);
    expect(lerCarrinhoSalvo(serializarCarrinho(vazio, agora), agora)).toBeNull();
  });
});
