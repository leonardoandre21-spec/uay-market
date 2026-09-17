"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MotivoPerda } from "@prisma/client";
import { exigirAdminAcao, exigirSessaoAcao } from "@/lib/auth";
import { buscarProdutoPorCodigo, buscarProdutosPorNome } from "@/lib/consultas";
import { campo, campoBooleano, campoInteiro, campoOpcional, executar, type Resultado } from "@/lib/acao";
import { limitesDoDia, parseDataInput } from "@/lib/datas";
import { parseQuantidade, parseReais } from "@/lib/dinheiro";
import { MOTIVOS_PERDA } from "@/lib/rotulos";
import { cnpjValido } from "@/lib/utils";
import {
  ajustarEstoque,
  colocarEmPromocao,
  criarFornecedorRapido,
  estornarEntrada,
  estornarPerda,
  listarLotesDisponiveis,
  registrarEntrada,
  registrarPerda,
  type LoteDisponivel,
} from "@/lib/servicos/estoque";
import type { FornecedorOpcao, ProdutoResumo } from "./_componentes/tipos";

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

function revalidarEstoque() {
  revalidatePath("/estoque", "layout");
  revalidatePath("/produtos", "layout");
}

function paraResumo(p: {
  id: number;
  nome: string;
  codigoBarras: string | null;
  codigoInterno: string | null;
  unidade: "UN" | "KG";
  categoria: { nome: string } | null;
  precoCusto: number;
  precoVenda: number;
  estoque: number;
  controlaValidade: boolean;
}): ProdutoResumo {
  return {
    id: p.id,
    nome: p.nome,
    codigoBarras: p.codigoBarras,
    codigoInterno: p.codigoInterno,
    unidade: p.unidade,
    categoriaNome: p.categoria?.nome ?? null,
    precoCusto: p.precoCusto,
    precoVenda: p.precoVenda,
    estoque: p.estoque,
    controlaValidade: p.controlaValidade,
  };
}

// ---------------------------------------------------------------- busca de produto

/** Busca pelo que o leitor bipou (código de barras ou interno). Null = não achou. */
export async function buscarProdutoPorCodigoAction(codigo: string): Promise<Resultado<ProdutoResumo | null>> {
  return executar(async () => {
    await exigirSessaoAcao();
    const produto = await buscarProdutoPorCodigo(String(codigo ?? ""));
    return produto ? paraResumo(produto) : null;
  });
}

/** Autocomplete por nome. */
export async function buscarProdutosPorNomeAction(termo: string): Promise<Resultado<ProdutoResumo[]>> {
  return executar(async () => {
    await exigirSessaoAcao();
    const t = String(termo ?? "").trim();
    if (t.length < 2) return [];
    const produtos = await buscarProdutosPorNome(t, 12);
    return produtos.map(paraResumo);
  });
}

/** Lotes com saldo de um produto, do que vence primeiro pro que vence depois. */
export async function listarLotesProdutoAction(produtoId: number): Promise<Resultado<LoteDisponivel[]>> {
  return executar(async () => {
    await exigirSessaoAcao();
    const id = Number(produtoId);
    if (!Number.isInteger(id) || id <= 0) return [];
    return listarLotesDisponiveis(id);
  });
}

// ---------------------------------------------------------------- ajuste

const esquemaAjuste = z.object({
  produtoId: z.number({ error: "Selecione o produto." }).int().positive("Selecione o produto."),
  modo: z.enum(["CONTAGEM", "ADICIONAR", "RETIRAR"], { error: "Escolha o tipo de ajuste." }),
  quantidade: z.number({ error: "Informe a quantidade." }).int().min(0, "A quantidade não pode ser negativa."),
  motivo: z.string().trim().min(3, "Informe o motivo do ajuste (mínimo 3 letras).").max(200, "Motivo muito longo."),
});

export async function ajustarEstoqueAction(form: FormData) {
  return executar(async () => {
    const sessao = await exigirSessaoAcao();
    const dados = esquemaAjuste.parse({
      produtoId: campoInteiro(form, "produtoId") ?? undefined,
      modo: campo(form, "modo"),
      quantidade: parseQuantidade(campo(form, "quantidade")) ?? undefined,
      motivo: campo(form, "motivo"),
    });
    if (dados.modo !== "CONTAGEM" && dados.quantidade === 0) {
      throw new Error("Informe uma quantidade maior que zero.");
    }
    const pedido =
      dados.modo === "CONTAGEM"
        ? { novaQuantidade: dados.quantidade }
        : { diferenca: dados.modo === "ADICIONAR" ? dados.quantidade : -dados.quantidade };
    const resultado = await ajustarEstoque({
      produtoId: dados.produtoId,
      pedido,
      motivo: dados.motivo,
      usuarioId: sessao.usuarioId,
    });
    revalidarEstoque();
    return resultado;
  });
}

// ---------------------------------------------------------------- fornecedor rápido

const esquemaFornecedor = z.object({
  nome: z.string().trim().min(2, "Informe o nome do fornecedor.").max(120, "Nome muito longo."),
  cnpj: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .refine((v) => v === null || cnpjValido(v), "CNPJ inválido. Confira os números digitados."),
  telefone: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .refine((v) => v === null || /^\d{10,13}$/.test(v.replace(/\D/g, "")), "Telefone inválido. Use DDD + número."),
});

export async function criarFornecedorAction(form: FormData): Promise<Resultado<FornecedorOpcao>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const dados = esquemaFornecedor.parse({
      nome: campo(form, "nome"),
      cnpj: campoOpcional(form, "cnpj"),
      telefone: campoOpcional(form, "telefone"),
    });
    const fornecedor = await criarFornecedorRapido({ ...dados, usuarioId: sessao.usuarioId });
    revalidatePath("/financeiro/fornecedores");
    revalidatePath("/estoque/entradas/nova");
    return fornecedor;
  });
}

// ---------------------------------------------------------------- entrada

const esquemaItemEntrada = z.object({
  produtoId: z.number().int().positive(),
  quantidade: z.number({ error: "Informe a quantidade." }).int().positive("A quantidade precisa ser maior que zero."),
  custoUnitario: z.number({ error: "Informe o custo." }).int().min(0, "O custo não pode ser negativo."),
  validade: z.string().regex(REGEX_DATA, "Validade inválida.").nullable(),
});

const esquemaEntrada = z
  .object({
    fornecedorId: z.number().int().positive().nullable(),
    numeroNota: z.string().trim().max(60, "Número da nota muito longo.").nullable(),
    data: z.string().regex(REGEX_DATA, "Informe a data da compra."),
    frete: z.number({ error: "Frete inválido." }).int().min(0, "O frete não pode ser negativo."),
    observacao: z.string().trim().max(500, "Observação muito longa.").nullable(),
    itens: z.array(esquemaItemEntrada).min(1, "Adicione pelo menos um produto na nota."),
    gerarBoleto: z.boolean(),
    boletoVencimento: z.string().nullable(),
    boletoParcelas: z.number().int().min(1, "Mínimo de 1 parcela.").max(24, "Máximo de 24 parcelas."),
    boletoCategoriaId: z.number().int().positive().nullable(),
  })
  .superRefine((d, ctx) => {
    if (d.gerarBoleto && !(d.boletoVencimento && REGEX_DATA.test(d.boletoVencimento))) {
      ctx.addIssue({ code: "custom", path: ["boletoVencimento"], message: "Informe o vencimento do boleto." });
    }
  });

function lerItensJson(texto: string): unknown {
  if (!texto) return [];
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error("Não foi possível ler os itens da nota. Recarregue a página e tente de novo.");
  }
}

export async function registrarEntradaAction(form: FormData): Promise<Resultado<{ id: number; total: number }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const dados = esquemaEntrada.parse({
      fornecedorId: campoInteiro(form, "fornecedorId"),
      numeroNota: campoOpcional(form, "numeroNota"),
      data: campo(form, "data"),
      frete: parseReais(campo(form, "frete")) ?? 0,
      observacao: campoOpcional(form, "observacao"),
      itens: lerItensJson(campo(form, "itens")),
      gerarBoleto: campoBooleano(form, "gerarBoleto"),
      boletoVencimento: campoOpcional(form, "boletoVencimento"),
      boletoParcelas: campoInteiro(form, "boletoParcelas") ?? 1,
      boletoCategoriaId: campoInteiro(form, "boletoCategoriaId"),
    });

    const data = parseDataInput(dados.data);
    if (!data) throw new Error("Data da compra inválida.");
    if (data.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new Error("A data da compra não pode estar no futuro.");

    const itens = dados.itens.map((i, indice) => {
      const validade = i.validade ? parseDataInput(i.validade) : null;
      if (i.validade && !validade) throw new Error(`Validade inválida no item ${indice + 1}.`);
      return { produtoId: i.produtoId, quantidade: i.quantidade, custoUnitario: i.custoUnitario, validade };
    });

    let boleto: { vencimento: Date; parcelas: number; categoriaId: number | null } | null = null;
    if (dados.gerarBoleto) {
      const vencimento = parseDataInput(dados.boletoVencimento);
      if (!vencimento) throw new Error("Vencimento do boleto inválido.");
      boleto = { vencimento, parcelas: dados.boletoParcelas, categoriaId: dados.boletoCategoriaId };
    }

    const resultado = await registrarEntrada({
      fornecedorId: dados.fornecedorId,
      numeroNota: dados.numeroNota,
      data,
      frete: dados.frete,
      observacao: dados.observacao,
      itens,
      boleto,
      usuarioId: sessao.usuarioId,
    });
    revalidarEstoque();
    revalidatePath("/financeiro", "layout");
    return resultado;
  });
}

const esquemaEstornoEntrada = z.object({
  entradaId: z.number({ error: "Entrada inválida." }).int().positive(),
  motivo: z.string().trim().min(3, "Explique o motivo do estorno (mínimo 3 letras).").max(200, "Motivo muito longo."),
});

export async function estornarEntradaAction(form: FormData) {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const dados = esquemaEstornoEntrada.parse({
      entradaId: campoInteiro(form, "entradaId") ?? undefined,
      motivo: campo(form, "motivo"),
    });
    const resultado = await estornarEntrada({
      entradaId: dados.entradaId,
      motivo: dados.motivo,
      usuarioId: sessao.usuarioId,
    });
    revalidarEstoque();
    revalidatePath("/financeiro", "layout");
    return resultado;
  });
}

// ---------------------------------------------------------------- perdas

const esquemaPerda = z.object({
  produtoId: z.number({ error: "Selecione o produto." }).int().positive("Selecione o produto."),
  loteId: z.number().int().positive().nullable(),
  quantidade: z.number({ error: "Informe a quantidade." }).int().positive("A quantidade precisa ser maior que zero."),
  motivo: z.enum(MOTIVOS_PERDA as [MotivoPerda, ...MotivoPerda[]], { error: "Escolha o motivo da perda." }),
  observacao: z.string().trim().max(300, "Observação muito longa.").nullable(),
});

export async function registrarPerdaAction(form: FormData) {
  return executar(async () => {
    const sessao = await exigirSessaoAcao();
    const dados = esquemaPerda.parse({
      produtoId: campoInteiro(form, "produtoId") ?? undefined,
      loteId: campoInteiro(form, "loteId"),
      quantidade: parseQuantidade(campo(form, "quantidade")) ?? undefined,
      motivo: campo(form, "motivo"),
      observacao: campoOpcional(form, "observacao"),
    });
    const resultado = await registrarPerda({ ...dados, usuarioId: sessao.usuarioId });
    revalidarEstoque();
    return resultado;
  });
}

export async function estornarPerdaAction(form: FormData) {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const perdaId = campoInteiro(form, "perdaId");
    if (!perdaId || perdaId <= 0) throw new Error("Perda inválida.");
    const resultado = await estornarPerda({ perdaId, usuarioId: sessao.usuarioId });
    revalidarEstoque();
    return resultado;
  });
}

// ---------------------------------------------------------------- promoção

const esquemaPromocao = z.object({
  produtoId: z.number({ error: "Produto inválido." }).int().positive(),
  precoPromocional: z.number({ error: "Informe o preço promocional." }).int().positive("Informe o preço promocional."),
  promocaoAte: z.string().regex(REGEX_DATA, "Informe até quando vale a promoção."),
});

export async function colocarEmPromocaoAction(form: FormData) {
  return executar(async () => {
    const sessao = await exigirSessaoAcao();
    const dados = esquemaPromocao.parse({
      produtoId: campoInteiro(form, "produtoId") ?? undefined,
      precoPromocional: parseReais(campo(form, "precoPromocional")) ?? undefined,
      promocaoAte: campo(form, "promocaoAte"),
    });
    const diaFinal = parseDataInput(dados.promocaoAte);
    if (!diaFinal) throw new Error("Data final da promoção inválida.");
    // A promoção vale até o fim do dia escolhido (precoEfetivo compara com o horário atual).
    const promocaoAte = limitesDoDia(diaFinal).fim;
    const resultado = await colocarEmPromocao({
      produtoId: dados.produtoId,
      precoPromocional: dados.precoPromocional,
      promocaoAte,
      usuarioId: sessao.usuarioId,
      papel: sessao.papel,
    });
    revalidarEstoque();
    revalidatePath("/pdv");
    return resultado;
  });
}
