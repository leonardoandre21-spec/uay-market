import type { FormaPagamento } from "@prisma/client";
import type { ModoDesconto } from "@/lib/servicos/vendas-calculos";
import type { ClientePdv, ItemCarrinho, PagamentoUi } from "./tipos";

// Venda em andamento guardada no sessionStorage do navegador, chaveada pela
// sessão de caixa. Um F5, o recarregamento do HMR ou a ida ao cadastro de
// produto não podem jogar fora o carrinho com o cliente esperando. Só o
// que está na tela é guardado: preço, estoque e saldo são reconferidos no
// servidor ao registrar a venda.

/** Versão do formato; mudou o formato, muda o número e o registro antigo é ignorado. */
const VERSAO = 1;

/** Registro mais velho que isso é descartado (caixa que ficou aberto de um dia pro outro). */
export const VALIDADE_CARRINHO_MS = 24 * 60 * 60 * 1000;

export type CarrinhoSalvo = {
  itens: ItemCarrinho[];
  descontoModo: ModoDesconto;
  descontoValor: number;
  cliente: ClientePdv | null;
  pagamentos: PagamentoUi[];
};

type Registro = CarrinhoSalvo & { versao: number; salvoEm: number };

export function chaveCarrinho(sessaoId: number): string {
  return `uay.carrinho.${sessaoId}`;
}

/** Nada pra guardar: carrinho vazio, sem desconto, sem cliente e sem pagamento. */
export function carrinhoVazio(c: CarrinhoSalvo): boolean {
  return c.itens.length === 0 && c.descontoValor === 0 && c.cliente === null && c.pagamentos.length === 0;
}

export function serializarCarrinho(c: CarrinhoSalvo, agoraMs: number): string {
  const registro: Registro = { versao: VERSAO, salvoEm: agoraMs, ...c };
  return JSON.stringify(registro);
}

const FORMAS: FormaPagamento[] = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "FIADO"];

function inteiro(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function texto(v: unknown): v is string {
  return typeof v === "string";
}

function textoOuNulo(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function itemValido(v: unknown): v is ItemCarrinho {
  if (!v || typeof v !== "object") return false;
  const i = v as Record<string, unknown>;
  return (
    texto(i.chave) &&
    i.chave.length > 0 &&
    inteiro(i.produtoId) &&
    i.produtoId > 0 &&
    texto(i.nome) &&
    (i.unidade === "UN" || i.unidade === "KG") &&
    inteiro(i.precoUnitario) &&
    i.precoUnitario >= 0 &&
    inteiro(i.precoVenda) &&
    typeof i.emPromocao === "boolean" &&
    inteiro(i.quantidade) &&
    i.quantidade > 0 &&
    inteiro(i.desconto) &&
    i.desconto >= 0 &&
    inteiro(i.estoque) &&
    typeof i.controlaValidade === "boolean"
  );
}

function clienteValido(v: unknown): v is ClientePdv {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    inteiro(c.id) &&
    c.id > 0 &&
    texto(c.nome) &&
    textoOuNulo(c.cpf) &&
    textoOuNulo(c.telefone) &&
    inteiro(c.limiteFiado) &&
    inteiro(c.saldoFiado)
  );
}

function pagamentoValido(v: unknown): v is PagamentoUi {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  const mpOk =
    p.mp === null ||
    (!!p.mp &&
      typeof p.mp === "object" &&
      texto((p.mp as Record<string, unknown>).intentId) &&
      textoOuNulo((p.mp as Record<string, unknown>).paymentId) &&
      texto((p.mp as Record<string, unknown>).status));
  return (
    texto(p.chave) &&
    FORMAS.includes(p.forma as FormaPagamento) &&
    inteiro(p.valor) &&
    p.valor > 0 &&
    (p.valorRecebido === null || inteiro(p.valorRecebido)) &&
    inteiro(p.parcelas) &&
    p.parcelas >= 1 &&
    (p.maquininhaId === null || inteiro(p.maquininhaId)) &&
    textoOuNulo(p.maquininhaNome) &&
    textoOuNulo(p.nsu) &&
    textoOuNulo(p.autorizacao) &&
    mpOk
  );
}

/**
 * Lê o registro guardado. Devolve null se estiver ausente, corrompido, de outra
 * versão, vencido ou vazio; nunca lança.
 */
export function lerCarrinhoSalvo(json: string | null | undefined, agoraMs: number): CarrinhoSalvo | null {
  if (!json) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return null;
  }
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;
  if (r.versao !== VERSAO) return null;
  if (!inteiro(r.salvoEm) || agoraMs - r.salvoEm > VALIDADE_CARRINHO_MS || r.salvoEm > agoraMs + 60_000) return null;
  if (!Array.isArray(r.itens) || !r.itens.every(itemValido)) return null;
  if (r.descontoModo !== "VALOR" && r.descontoModo !== "PERCENTUAL") return null;
  if (!inteiro(r.descontoValor) || r.descontoValor < 0) return null;
  if (r.cliente !== null && !clienteValido(r.cliente)) return null;
  if (!Array.isArray(r.pagamentos) || !r.pagamentos.every(pagamentoValido)) return null;
  const carrinho: CarrinhoSalvo = {
    itens: r.itens,
    descontoModo: r.descontoModo,
    descontoValor: r.descontoValor,
    cliente: r.cliente as ClientePdv | null,
    pagamentos: r.pagamentos,
  };
  return carrinhoVazio(carrinho) ? null : carrinho;
}

/** Acesso ao sessionStorage que nunca lança (janela privada, storage bloqueado, SSR). */
export function lerStorage(chave: string): string | null {
  try {
    return window.sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function gravarStorage(chave: string, valor: string | null): void {
  try {
    if (valor === null) window.sessionStorage.removeItem(chave);
    else window.sessionStorage.setItem(chave, valor);
  } catch {
    // sem storage: a venda segue só em memória, como antes
  }
}
