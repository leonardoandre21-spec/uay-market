import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ClienteDb } from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";
import { agora, formatarData, limitesDoMesAnoMes, noFuso } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { cnpjValido, formatarCnpj, formatarTelefone, normalizarCnpj, normalizarTexto } from "@/lib/utils";

// Fornecedores: cadastro, consulta detalhada e exportação. Outros módulos
// (estoque, por exemplo) podem importar criarFornecedorRapido; a assinatura
// é estável: (nome, tx?) -> { id, nome }.

export type DadosFornecedor = {
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  contato: string | null;
  observacao: string | null;
  ativo: boolean;
};

/** Guarda só dígitos (CNPJ e telefone), ou null quando vazio. */
function somenteDigitos(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const d = texto.replace(/\D/g, "");
  return d === "" ? null : d;
}

/**
 * Cria um fornecedor só com o nome (ou devolve o existente com o mesmo nome,
 * ignorando acentos e caixa). Pode receber a transação em andamento.
 */
export async function criarFornecedorRapido(
  nome: string,
  tx: ClienteDb = db,
): Promise<{ id: number; nome: string }> {
  const limpo = nome.trim().replace(/\s+/g, " ");
  if (limpo.length < 2) throw new Error("Informe o nome do fornecedor (pelo menos 2 letras).");
  const alvo = normalizarTexto(limpo);
  const candidatos = await tx.fornecedor.findMany({ select: { id: true, nome: true, ativo: true } });
  const existente = candidatos.find((c) => normalizarTexto(c.nome) === alvo);
  if (existente) {
    if (!existente.ativo) {
      await tx.fornecedor.update({ where: { id: existente.id }, data: { ativo: true } });
    }
    return { id: existente.id, nome: existente.nome };
  }
  const criado = await tx.fornecedor.create({ data: { nome: limpo }, select: { id: true, nome: true } });
  return criado;
}

export type FiltrosFornecedores = { busca?: string | null; incluirInativos?: boolean };

export async function listarFornecedores(filtros: FiltrosFornecedores = {}) {
  const busca = filtros.busca?.trim() ?? "";
  const where: Prisma.FornecedorWhereInput = {
    ...(filtros.incluirInativos ? {} : { ativo: true }),
    ...(busca
      ? {
          OR: [
            { nome: { contains: busca, mode: "insensitive" } },
            { cnpj: { contains: normalizarCnpj(busca) || busca, mode: "insensitive" } },
            { contato: { contains: busca, mode: "insensitive" } },
            { telefone: { contains: busca.replace(/\D/g, "") || busca, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const fornecedores = await db.fornecedor.findMany({
    where,
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    include: {
      _count: { select: { entradas: true, contas: true, despesas: true } },
    },
  });
  // Pendências por fornecedor (boletos ainda em aberto).
  const pendentes = await db.contaPagar.groupBy({
    by: ["fornecedorId"],
    where: { status: "PENDENTE", fornecedorId: { in: fornecedores.map((f) => f.id) } },
    _sum: { valor: true },
    _count: { _all: true },
  });
  const mapaPendentes = new Map(pendentes.map((p) => [p.fornecedorId, { total: p._sum.valor ?? 0, quantidade: p._count._all }]));
  return fornecedores.map((f) => ({
    ...f,
    pendentes: mapaPendentes.get(f.id) ?? { total: 0, quantidade: 0 },
  }));
}

export async function obterFornecedor(id: number) {
  return db.fornecedor.findUnique({ where: { id } });
}

/** Ficha completa: dados, últimas entradas, boletos e total comprado no ano. */
export async function obterFichaFornecedor(id: number) {
  const fornecedor = await db.fornecedor.findUnique({ where: { id } });
  if (!fornecedor) return null;
  const hoje = agora();
  const inicioAno = new Date(limitesDoMesAnoMes(hoje.getFullYear(), 1).inicio.getTime());
  const fimAno = new Date(limitesDoMesAnoMes(hoje.getFullYear(), 12).fim.getTime());

  const [entradas, contas, compradoNoAno, totalEntradas, totalDespesas] = await Promise.all([
    db.entradaEstoque.findMany({
      where: { fornecedorId: id },
      orderBy: [{ data: "desc" }, { id: "desc" }],
      take: 15,
      include: { _count: { select: { itens: true } }, usuario: { select: { nome: true } } },
    }),
    db.contaPagar.findMany({
      where: { fornecedorId: id },
      orderBy: [{ vencimento: "desc" }, { id: "desc" }],
      include: { categoria: true },
    }),
    db.entradaEstoque.aggregate({
      where: { fornecedorId: id, data: { gte: inicioAno, lte: fimAno }, estornadaEm: null },
      _sum: { valorTotal: true, frete: true },
      _count: { _all: true },
    }),
    db.entradaEstoque.count({ where: { fornecedorId: id } }),
    db.despesa.count({ where: { fornecedorId: id } }),
  ]);

  return {
    fornecedor,
    entradas,
    contas,
    ano: hoje.getFullYear(),
    compradoNoAno: {
      total: (compradoNoAno._sum.valorTotal ?? 0) + (compradoNoAno._sum.frete ?? 0),
      mercadorias: compradoNoAno._sum.valorTotal ?? 0,
      frete: compradoNoAno._sum.frete ?? 0,
      quantidade: compradoNoAno._count._all,
    },
    totalEntradas,
    totalDespesas,
  };
}

export async function salvarFornecedor(id: number | null, dados: DadosFornecedor, usuarioId: number) {
  const registro = {
    nome: dados.nome.trim().replace(/\s+/g, " "),
    cnpj: normalizarCnpj(dados.cnpj) || null,
    telefone: somenteDigitos(dados.telefone),
    email: dados.email?.trim().toLowerCase() || null,
    contato: dados.contato?.trim() || null,
    observacao: dados.observacao?.trim() || null,
    ativo: dados.ativo,
  };
  if (registro.cnpj && registro.cnpj.length !== 14) {
    throw new Error("O CNPJ precisa ter 14 caracteres.");
  }
  if (registro.cnpj && !cnpjValido(registro.cnpj)) {
    throw new Error("CNPJ inválido. Confira os números digitados.");
  }
  if (id === null) {
    // Evita duplicar fornecedor com o mesmo nome.
    const candidatos = await db.fornecedor.findMany({ select: { nome: true } });
    if (candidatos.some((c) => normalizarTexto(c.nome) === normalizarTexto(registro.nome))) {
      throw new Error("Já existe um fornecedor com esse nome.");
    }
    return db.fornecedor.create({ data: registro });
  }
  const atual = await db.fornecedor.findUnique({ where: { id } });
  if (!atual) throw new Error("Fornecedor não encontrado.");
  const outros = await db.fornecedor.findMany({ where: { id: { not: id } }, select: { nome: true } });
  if (outros.some((c) => normalizarTexto(c.nome) === normalizarTexto(registro.nome))) {
    throw new Error("Já existe outro fornecedor com esse nome.");
  }
  const atualizado = await db.fornecedor.update({ where: { id }, data: registro });
  await registrarAuditoria({
    usuarioId,
    acao: "fornecedor.editar",
    entidade: "Fornecedor",
    entidadeId: id,
    detalhes: { antes: atual, depois: atualizado },
  });
  return atualizado;
}

export async function alternarAtivoFornecedor(id: number, ativo: boolean, usuarioId: number) {
  const atualizado = await db.fornecedor.update({ where: { id }, data: { ativo } });
  await registrarAuditoria({
    usuarioId,
    acao: ativo ? "fornecedor.reativar" : "fornecedor.desativar",
    entidade: "Fornecedor",
    entidadeId: id,
  });
  return atualizado;
}

/** Exclui de verdade só quando não há nada vinculado; senão orienta a desativar. */
export async function excluirFornecedor(id: number, usuarioId: number) {
  const f = await db.fornecedor.findUnique({
    where: { id },
    include: { _count: { select: { entradas: true, contas: true, despesas: true } } },
  });
  if (!f) throw new Error("Fornecedor não encontrado.");
  const vinculos = f._count.entradas + f._count.contas + f._count.despesas;
  if (vinculos > 0) {
    throw new Error(
      `Esse fornecedor tem ${vinculos} registro(s) vinculado(s) (entradas, boletos ou despesas). Em vez de excluir, marque como inativo.`,
    );
  }
  await db.fornecedor.delete({ where: { id } });
  await registrarAuditoria({
    usuarioId,
    acao: "fornecedor.excluir",
    entidade: "Fornecedor",
    entidadeId: id,
    detalhes: { nome: f.nome, cnpj: f.cnpj },
  });
}

/** CSV com separador ";" (abre direto no Excel em português) e BOM pra acentos. */
export async function gerarCsvFornecedores(): Promise<string> {
  const lista = await listarFornecedores({ incluirInativos: true });
  const escapar = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cabecalho = [
    "Nome",
    "CNPJ",
    "Telefone",
    "E-mail",
    "Contato",
    "Situação",
    "Entradas de estoque",
    "Boletos",
    "Boletos pendentes",
    "Valor pendente",
    "Cadastrado em",
    "Observação",
  ];
  const linhas = lista.map((f) =>
    [
      f.nome,
      formatarCnpj(f.cnpj),
      formatarTelefone(f.telefone),
      f.email,
      f.contato,
      f.ativo ? "Ativo" : "Inativo",
      f._count.entradas,
      f._count.contas,
      f.pendentes.quantidade,
      formatarReais(f.pendentes.total, false),
      formatarData(f.criadoEm),
      f.observacao,
    ]
      .map(escapar)
      .join(";"),
  );
  return `﻿${[cabecalho.join(";"), ...linhas].join("\r\n")}\r\n`;
}

/** Nome do arquivo de exportação com a data de hoje. */
export function nomeArquivoCsvFornecedores(): string {
  const d = noFuso(agora());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `fornecedores-${y}-${m}-${dd}.csv`;
}
