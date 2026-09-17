import "server-only";
import type { FormaPagamento, TipoLancamentoFiado } from "@prisma/client";
import { db } from "@/lib/db";
import {
  obterConfiguracao,
  obterConfiguracoesPagamento,
  obterSessaoCaixaAberta,
  saldoFiado,
  type ClienteDb,
} from "@/lib/consultas";
import { registrarAuditoria } from "@/lib/auditoria";
import { agora, formatarData, formatarDataHora, paraDataInput } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import { formatarCpf, formatarTelefone, normalizarTexto } from "@/lib/utils";
import { listarMaquininhasAtivas } from "@/lib/servicos/maquininhas";
import { calcularTaxasPagamentos, type TaxasMaquininha } from "@/lib/servicos/vendas-calculos";
import {
  aniversarianteDoMes,
  calcularExtrato,
  calcularSaldo,
  CATEGORIA_DESPESA_TAXAS,
  debitosEmAberto,
  diaDoAniversario,
  diasEmAtraso,
  ehAjusteManual,
  EXTRATO_POR_PAGINA,
  fiadoVencido,
  filtrarAniversariantesDoMes,
  formaPassaNaMaquininha,
  idadeEmAnos,
  montarCsvClientes,
  montarDespesaTaxaFiado,
  montarLinkWhatsApp,
  montarMensagemCobranca,
  montarObservacaoRecebimento,
  situacaoCliente,
  somenteDigitos,
  totaisFiado,
  type SituacaoCliente,
  type TipoAjusteFiado,
} from "@/lib/servicos/clientes-calculos";

// ---------------------------------------------------------------- tipos

export type FiltroClientes = "todos" | "devendo" | "inativos" | "aniversariantes";

export const FILTROS_CLIENTES: { valor: FiltroClientes; rotulo: string }[] = [
  { valor: "todos", rotulo: "Ativos" },
  { valor: "devendo", rotulo: "Com saldo devedor" },
  { valor: "aniversariantes", rotulo: "Aniversariantes do mês" },
  { valor: "inativos", rotulo: "Inativos" },
];

export function normalizarFiltro(valor: string | null | undefined): FiltroClientes {
  if (valor === "devendo" || valor === "inativos" || valor === "aniversariantes") return valor;
  return "todos";
}

/** Linha da tabela de clientes, já serializável pro client. */
export type ClienteResumo = {
  id: number;
  nome: string;
  cpf: string | null;
  cpfFormatado: string;
  telefone: string | null;
  telefoneFormatado: string;
  email: string | null;
  endereco: string | null;
  dataNascimento: string | null; // ISO
  dataNascimentoFormatada: string;
  limiteFiado: number;
  saldo: number;
  diasAtraso: number;
  ultimaCompra: string | null; // ISO
  ultimaCompraFormatada: string;
  ativo: boolean;
  aniversarianteDoMes: boolean;
  diaAniversario: number | null;
  situacao: SituacaoCliente;
};

export type IndicadoresClientes = {
  clientesAtivos: number;
  totalAReceber: number;
  clientesDevendo: number;
  clientesVencidos: number;
  aniversariantes: number;
};

export type DadosCliente = {
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  dataNascimento: Date | null;
  limiteFiado?: number; // só ADMIN envia
  observacao: string | null;
  ativo?: boolean;
};

// ---------------------------------------------------------------- listagem

/** `abatimentos` = PAGAMENTO + ESTORNO (tudo que reduz a dívida). Saldo = debitos − abatimentos. */
type SaldoPorCliente = Map<number, { debitos: number; abatimentos: number }>;

async function somarLancamentosPorCliente(tx: ClienteDb = db): Promise<SaldoPorCliente> {
  const grupos = await tx.lancamentoFiado.groupBy({
    by: ["clienteId", "tipo"],
    _sum: { valor: true },
  });
  const mapa: SaldoPorCliente = new Map();
  for (const g of grupos) {
    const atual = mapa.get(g.clienteId) ?? { debitos: 0, abatimentos: 0 };
    if (g.tipo === "DEBITO") atual.debitos += g._sum.valor ?? 0;
    else atual.abatimentos += g._sum.valor ?? 0;
    mapa.set(g.clienteId, atual);
  }
  return mapa;
}

async function ultimaCompraPorCliente(tx: ClienteDb = db): Promise<Map<number, Date>> {
  const grupos = await tx.venda.groupBy({
    by: ["clienteId"],
    where: { status: "CONCLUIDA", clienteId: { not: null } },
    _max: { criadoEm: true },
  });
  const mapa = new Map<number, Date>();
  for (const g of grupos) {
    if (g.clienteId !== null && g._max.criadoEm) mapa.set(g.clienteId, g._max.criadoEm);
  }
  return mapa;
}

/**
 * Dias em atraso (FIFO) só pra quem tem saldo > 0, pra não carregar todo o histórico.
 * `vendaId` é obrigatório no select: sem ele o ESTORNO de uma venda cancelada
 * vira crédito genérico e abate o débito mais antigo, e a lista discorda da ficha.
 */
async function diasAtrasoPorCliente(idsComSaldo: number[], hoje: Date, tx: ClienteDb = db): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  if (idsComSaldo.length === 0) return mapa;
  const lancamentos = await tx.lancamentoFiado.findMany({
    where: { clienteId: { in: idsComSaldo } },
    select: { id: true, clienteId: true, tipo: true, valor: true, criadoEm: true, vendaId: true },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
  });
  const porCliente = new Map<number, typeof lancamentos>();
  for (const l of lancamentos) {
    const lista = porCliente.get(l.clienteId) ?? [];
    lista.push(l);
    porCliente.set(l.clienteId, lista);
  }
  for (const [clienteId, lista] of porCliente) {
    mapa.set(clienteId, diasEmAtraso(lista, hoje));
  }
  return mapa;
}

/** Todos os clientes com saldo, atraso, última compra e situação. */
export async function listarClientesComResumo(tx: ClienteDb = db): Promise<ClienteResumo[]> {
  const hoje = agora();
  const [clientes, saldos, ultimas] = await Promise.all([
    tx.cliente.findMany({ orderBy: { nome: "asc" } }),
    somarLancamentosPorCliente(tx),
    ultimaCompraPorCliente(tx),
  ]);

  const saldoDe = (id: number) => {
    const s = saldos.get(id);
    return s ? s.debitos - s.abatimentos : 0;
  };
  const idsComSaldo = clientes.filter((c) => saldoDe(c.id) > 0).map((c) => c.id);
  const atrasos = await diasAtrasoPorCliente(idsComSaldo, hoje, tx);

  return clientes.map((c) => {
    const saldo = saldoDe(c.id);
    const diasAtraso = atrasos.get(c.id) ?? 0;
    const ultima = ultimas.get(c.id) ?? null;
    return {
      id: c.id,
      nome: c.nome,
      cpf: c.cpf,
      cpfFormatado: formatarCpf(c.cpf),
      telefone: c.telefone,
      telefoneFormatado: formatarTelefone(c.telefone),
      email: c.email,
      endereco: c.endereco,
      dataNascimento: c.dataNascimento ? c.dataNascimento.toISOString() : null,
      dataNascimentoFormatada: formatarData(c.dataNascimento),
      limiteFiado: c.limiteFiado,
      saldo,
      diasAtraso,
      ultimaCompra: ultima ? ultima.toISOString() : null,
      ultimaCompraFormatada: ultima ? formatarData(ultima) : "",
      ativo: c.ativo,
      aniversarianteDoMes: aniversarianteDoMes(c.dataNascimento, hoje),
      diaAniversario: diaDoAniversario(c.dataNascimento),
      situacao: situacaoCliente({ ativo: c.ativo, saldo, limiteFiado: c.limiteFiado, diasAtraso }),
    };
  });
}

/** Aplica busca (nome, CPF, telefone) e filtro sobre a lista já resumida. */
export function filtrarClientes(lista: ClienteResumo[], busca: string, filtro: FiltroClientes): ClienteResumo[] {
  const termo = normalizarTexto(busca ?? "");
  const digitos = termo.replace(/\D/g, "");

  let resultado = lista;
  switch (filtro) {
    case "devendo":
      resultado = resultado.filter((c) => c.saldo > 0);
      break;
    case "inativos":
      resultado = resultado.filter((c) => !c.ativo);
      break;
    case "aniversariantes":
      resultado = filtrarAniversariantesDoMes(resultado.filter((c) => c.ativo));
      break;
    default:
      resultado = resultado.filter((c) => c.ativo);
  }

  if (termo) {
    resultado = resultado.filter((c) => {
      if (normalizarTexto(c.nome).includes(termo)) return true;
      if (digitos.length >= 3) {
        if (c.cpf && c.cpf.includes(digitos)) return true;
        if (c.telefone && c.telefone.replace(/\D/g, "").includes(digitos)) return true;
      }
      return false;
    });
  }
  return resultado;
}

export function calcularIndicadores(lista: ClienteResumo[]): IndicadoresClientes {
  const devendo = lista.filter((c) => c.saldo > 0);
  return {
    clientesAtivos: lista.filter((c) => c.ativo).length,
    totalAReceber: devendo.reduce((acc, c) => acc + c.saldo, 0),
    clientesDevendo: devendo.length,
    clientesVencidos: devendo.filter((c) => fiadoVencido(c.diasAtraso)).length,
    aniversariantes: lista.filter((c) => c.ativo && c.aniversarianteDoMes).length,
  };
}

/** CSV da lista (respeita busca e filtro da tela). */
export async function gerarCsvClientes(busca: string, filtro: FiltroClientes): Promise<string> {
  const lista = filtrarClientes(await listarClientesComResumo(), busca, filtro);
  return montarCsvClientes(
    lista.map((c) => ({
      nome: c.nome,
      cpf: c.cpfFormatado,
      telefone: c.telefoneFormatado,
      email: c.email ?? "",
      endereco: c.endereco ?? "",
      dataNascimento: c.dataNascimentoFormatada,
      limiteFiado: c.limiteFiado,
      saldo: c.saldo,
      diasAtraso: c.diasAtraso,
      ultimaCompra: c.ultimaCompraFormatada,
      situacao: c.situacao.rotulo,
      ativo: c.ativo,
    })),
  );
}

// ---------------------------------------------------------------- cadastro

export async function obterCliente(id: number, tx: ClienteDb = db) {
  return tx.cliente.findUnique({ where: { id } });
}

async function garantirCpfDisponivel(cpf: string | null, ignorarId: number | null, tx: ClienteDb) {
  if (!cpf) return;
  const existente = await tx.cliente.findFirst({
    where: { cpf, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true, nome: true },
  });
  if (existente) {
    throw new Error(`Já existe um cliente com esse CPF: ${existente.nome}.`);
  }
}

export async function criarCliente(dados: DadosCliente, usuarioId: number) {
  return db.$transaction(async (tx) => {
    const cpf = somenteDigitos(dados.cpf);
    await garantirCpfDisponivel(cpf, null, tx);
    const cliente = await tx.cliente.create({
      data: {
        nome: dados.nome.trim(),
        cpf,
        telefone: somenteDigitos(dados.telefone),
        email: dados.email?.trim().toLowerCase() || null,
        endereco: dados.endereco?.trim() || null,
        dataNascimento: dados.dataNascimento,
        limiteFiado: dados.limiteFiado ?? 0,
        observacao: dados.observacao?.trim() || null,
        ativo: dados.ativo ?? true,
      },
    });
    await registrarAuditoria(
      {
        usuarioId,
        acao: "cliente.criar",
        entidade: "Cliente",
        entidadeId: cliente.id,
        detalhes: { nome: cliente.nome, limiteFiado: cliente.limiteFiado },
      },
      tx,
    );
    return cliente;
  });
}

export async function atualizarCliente(id: number, dados: DadosCliente, usuarioId: number, ehAdmin: boolean) {
  return db.$transaction(async (tx) => {
    const atual = await tx.cliente.findUnique({ where: { id } });
    if (!atual) throw new Error("Cliente não encontrado.");
    const cpf = somenteDigitos(dados.cpf);
    await garantirCpfDisponivel(cpf, id, tx);

    const limiteFiado = ehAdmin && dados.limiteFiado !== undefined ? dados.limiteFiado : atual.limiteFiado;
    const ativo = dados.ativo ?? atual.ativo;

    const cliente = await tx.cliente.update({
      where: { id },
      data: {
        nome: dados.nome.trim(),
        cpf,
        telefone: somenteDigitos(dados.telefone),
        email: dados.email?.trim().toLowerCase() || null,
        endereco: dados.endereco?.trim() || null,
        dataNascimento: dados.dataNascimento,
        limiteFiado,
        observacao: dados.observacao?.trim() || null,
        ativo,
      },
    });

    const mudancas: Record<string, { de: unknown; para: unknown }> = {};
    if (atual.nome !== cliente.nome) mudancas.nome = { de: atual.nome, para: cliente.nome };
    if (atual.limiteFiado !== cliente.limiteFiado) mudancas.limiteFiado = { de: atual.limiteFiado, para: cliente.limiteFiado };
    if (atual.ativo !== cliente.ativo) mudancas.ativo = { de: atual.ativo, para: cliente.ativo };
    if (atual.cpf !== cliente.cpf) mudancas.cpf = { de: atual.cpf, para: cliente.cpf };
    if (atual.telefone !== cliente.telefone) mudancas.telefone = { de: atual.telefone, para: cliente.telefone };

    await registrarAuditoria(
      { usuarioId, acao: "cliente.editar", entidade: "Cliente", entidadeId: id, detalhes: mudancas },
      tx,
    );
    return cliente;
  });
}

export async function alterarAtivoCliente(id: number, ativo: boolean, usuarioId: number) {
  return db.$transaction(async (tx) => {
    const atual = await tx.cliente.findUnique({ where: { id } });
    if (!atual) throw new Error("Cliente não encontrado.");
    const cliente = await tx.cliente.update({ where: { id }, data: { ativo } });
    await registrarAuditoria(
      {
        usuarioId,
        acao: ativo ? "cliente.reativar" : "cliente.desativar",
        entidade: "Cliente",
        entidadeId: id,
        detalhes: { nome: atual.nome },
      },
      tx,
    );
    return cliente;
  });
}

/** Exclui de verdade só quando não há vendas nem lançamentos. Senão, orienta a desativar. */
export async function excluirCliente(id: number, usuarioId: number) {
  return db.$transaction(async (tx) => {
    const cliente = await tx.cliente.findUnique({
      where: { id },
      include: { _count: { select: { vendas: true, lancamentosFiado: true } } },
    });
    if (!cliente) throw new Error("Cliente não encontrado.");
    if (cliente._count.vendas > 0 || cliente._count.lancamentosFiado > 0) {
      throw new Error(
        "Este cliente tem compras ou lançamentos de fiado registrados e não pode ser excluído. Desative o cadastro em vez de excluir.",
      );
    }
    await tx.cliente.delete({ where: { id } });
    await registrarAuditoria(
      {
        usuarioId,
        acao: "cliente.excluir",
        entidade: "Cliente",
        entidadeId: id,
        detalhes: { nome: cliente.nome, cpf: cliente.cpf, telefone: cliente.telefone },
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------- página do cliente

export type LinhaExtrato = {
  id: number;
  criadoEm: string; // ISO
  dataHoraFormatada: string;
  tipo: TipoLancamentoFiado;
  valor: number;
  valorComSinal: number;
  saldoApos: number;
  vendaId: number | null;
  numeroVenda: number | null;
  formaPagamento: FormaPagamento | null;
  observacao: string | null;
  usuarioNome: string | null;
  ajusteManual: boolean;
};

export type CompraResumo = {
  id: number;
  numero: number;
  criadoEm: string;
  dataHoraFormatada: string;
  status: "CONCLUIDA" | "CANCELADA";
  total: number;
  quantidadeItens: number;
  formas: FormaPagamento[];
};

export type ProdutoMaisComprado = {
  produtoId: number;
  nome: string;
  unidade: "UN" | "KG";
  quantidade: number; // milésimos
  total: number; // centavos
  vezes: number;
};

export type EstatisticasCliente = {
  totalGasto: number;
  comprasConcluidas: number;
  ticketMedio: number;
  totalFiadoComprado: number;
  /** Só PAGAMENTO com forma de pagamento: dinheiro que entrou de fato. */
  totalFiadoPago: number;
  /** Abatimentos manuais do ADMIN (desconto, acerto, dívida perdoada): não é dinheiro recebido. */
  totalFiadoAbatido: number;
  primeiraCompra: string;
  ultimaCompra: string;
  produtosMaisComprados: ProdutoMaisComprado[];
};

/** Maquininha ativa, com as taxas, pro diálogo de recebimento mostrar a taxa antes de confirmar. */
export type MaquininhaRecebimento = TaxasMaquininha & {
  id: number;
  nome: string;
  padrao: boolean;
};

export type ClienteCompleto = {
  id: number;
  nome: string;
  cpf: string | null;
  cpfFormatado: string;
  telefone: string | null;
  telefoneFormatado: string;
  email: string | null;
  endereco: string | null;
  dataNascimento: string | null;
  dataNascimentoInput: string;
  dataNascimentoFormatada: string;
  idade: number | null;
  aniversarianteDoMes: boolean;
  limiteFiado: number;
  observacao: string | null;
  ativo: boolean;
  criadoEm: string;
  criadoEmFormatado: string;
  saldo: number;
  disponivel: number;
  diasAtraso: number;
  situacao: SituacaoCliente;
  temMovimento: boolean;
  /** Lançamentos mais recentes (até `limiteExtrato`); saldo e atraso usam todos. */
  extrato: LinhaExtrato[];
  /** Quantos lançamentos o cliente tem no total (pra mostrar "ver mais"). */
  totalLancamentos: number;
  compras: CompraResumo[];
  estatisticas: EstatisticasCliente;
  itensEmAberto: { data: string; valor: number; numeroVenda: number | null }[];
  linkWhatsApp: string | null;
  mensagemCobranca: string;
  caixaAberto: boolean;
  nomeLoja: string;
  maquininhas: MaquininhaRecebimento[];
};

/**
 * Ficha completa. `limiteExtrato` corta só a lista exibida (null = todos);
 * saldo, atraso e compras em aberto sempre usam o histórico inteiro.
 */
export async function obterClienteCompleto(
  id: number,
  limiteExtrato: number | null = EXTRATO_POR_PAGINA,
): Promise<ClienteCompleto | null> {
  const cliente = await db.cliente.findUnique({ where: { id } });
  if (!cliente) return null;

  const [lancamentos, vendas, config, sessaoAberta, contagemVendas, gruposItens, maquininhas] = await Promise.all([
    db.lancamentoFiado.findMany({
      where: { clienteId: id },
      include: { venda: { select: { numero: true } }, usuario: { select: { nome: true } } },
      orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
    }),
    db.venda.findMany({
      where: { clienteId: id },
      orderBy: { criadoEm: "desc" },
      take: 30,
      include: { pagamentos: { select: { forma: true } }, _count: { select: { itens: true } } },
    }),
    obterConfiguracao(),
    obterSessaoCaixaAberta(),
    db.venda.aggregate({
      where: { clienteId: id, status: "CONCLUIDA" },
      _sum: { total: true },
      _count: { _all: true },
      _min: { criadoEm: true },
      _max: { criadoEm: true },
    }),
    db.itemVenda.groupBy({
      by: ["produtoId"],
      where: { venda: { clienteId: id, status: "CONCLUIDA" } },
      _sum: { quantidade: true, total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
    listarMaquininhasAtivas(),
  ]);

  const produtos = gruposItens.length
    ? await db.produto.findMany({
        where: { id: { in: gruposItens.map((g) => g.produtoId) } },
        select: { id: true, nome: true, unidade: true },
      })
    : [];
  const nomeProduto = new Map(produtos.map((p) => [p.id, p]));

  const hoje = agora();
  const saldo = calcularSaldo(lancamentos);
  const diasAtraso = diasEmAtraso(lancamentos, hoje);
  const abertos = debitosEmAberto(lancamentos);

  // Extrato completo (saldo acumulado precisa da ordem cronológica inteira); a tela mostra só os mais recentes.
  const extratoCompleto = calcularExtrato(lancamentos);
  const extrato: LinhaExtrato[] = (limiteExtrato === null ? extratoCompleto : extratoCompleto.slice(0, limiteExtrato)).map((l) => ({
    id: l.id,
    criadoEm: l.criadoEm.toISOString(),
    dataHoraFormatada: formatarDataHora(l.criadoEm),
    tipo: l.tipo,
    valor: l.valor,
    valorComSinal: l.valorComSinal,
    saldoApos: l.saldoApos,
    vendaId: l.vendaId,
    numeroVenda: l.venda?.numero ?? null,
    formaPagamento: l.formaPagamento,
    observacao: l.observacao,
    usuarioNome: l.usuario?.nome ?? null,
    ajusteManual: ehAjusteManual(l),
  }));

  const compras: CompraResumo[] = vendas.map((v) => ({
    id: v.id,
    numero: v.numero,
    criadoEm: v.criadoEm.toISOString(),
    dataHoraFormatada: formatarDataHora(v.criadoEm),
    status: v.status,
    total: v.total,
    quantidadeItens: v._count.itens,
    formas: Array.from(new Set(v.pagamentos.map((p) => p.forma))),
  }));

  const totalGasto = contagemVendas._sum.total ?? 0;
  const comprasConcluidas = contagemVendas._count._all;
  // Comprou = DEBITO − ESTORNO; pagou = PAGAMENTO com forma; abatido = ajuste manual (não é dinheiro recebido).
  const totaisDoFiado = totaisFiado(lancamentos);
  const estatisticas: EstatisticasCliente = {
    totalGasto,
    comprasConcluidas,
    ticketMedio: comprasConcluidas > 0 ? Math.round(totalGasto / comprasConcluidas) : 0,
    totalFiadoComprado: totaisDoFiado.comprado,
    totalFiadoPago: totaisDoFiado.pago,
    totalFiadoAbatido: totaisDoFiado.abatido,
    primeiraCompra: formatarData(contagemVendas._min.criadoEm),
    ultimaCompra: formatarData(contagemVendas._max.criadoEm),
    produtosMaisComprados: gruposItens.map((g) => {
      const p = nomeProduto.get(g.produtoId);
      return {
        produtoId: g.produtoId,
        nome: p?.nome ?? `Produto #${g.produtoId}`,
        unidade: p?.unidade ?? "UN",
        quantidade: g._sum.quantidade ?? 0,
        total: g._sum.total ?? 0,
        vezes: g._count._all,
      };
    }),
  };

  const itensEmAberto = abertos.map((a) => ({
    data: a.lancamento.criadoEm.toISOString(),
    valor: a.valorEmAberto,
    numeroVenda: a.lancamento.venda?.numero ?? null,
  }));

  const mensagemCobranca = montarMensagemCobranca({
    nomeLoja: config.nomeLoja,
    nomeCliente: cliente.nome,
    saldo,
    itensEmAberto: abertos.map((a) => ({
      data: a.lancamento.criadoEm,
      valor: a.valorEmAberto,
      numeroVenda: a.lancamento.venda?.numero ?? null,
    })),
  });

  return {
    id: cliente.id,
    nome: cliente.nome,
    cpf: cliente.cpf,
    cpfFormatado: formatarCpf(cliente.cpf),
    telefone: cliente.telefone,
    telefoneFormatado: formatarTelefone(cliente.telefone),
    email: cliente.email,
    endereco: cliente.endereco,
    dataNascimento: cliente.dataNascimento ? cliente.dataNascimento.toISOString() : null,
    dataNascimentoInput: paraDataInput(cliente.dataNascimento),
    dataNascimentoFormatada: formatarData(cliente.dataNascimento),
    idade: idadeEmAnos(cliente.dataNascimento, hoje),
    aniversarianteDoMes: aniversarianteDoMes(cliente.dataNascimento, hoje),
    limiteFiado: cliente.limiteFiado,
    observacao: cliente.observacao,
    ativo: cliente.ativo,
    criadoEm: cliente.criadoEm.toISOString(),
    criadoEmFormatado: formatarData(cliente.criadoEm),
    saldo,
    disponivel: Math.max(0, cliente.limiteFiado - saldo),
    diasAtraso,
    situacao: situacaoCliente({ ativo: cliente.ativo, saldo, limiteFiado: cliente.limiteFiado, diasAtraso }),
    temMovimento: lancamentos.length > 0 || vendas.length > 0,
    extrato,
    totalLancamentos: lancamentos.length,
    compras,
    estatisticas,
    itensEmAberto,
    linkWhatsApp: montarLinkWhatsApp(cliente.telefone, mensagemCobranca),
    mensagemCobranca,
    caixaAberto: sessaoAberta !== null,
    nomeLoja: config.nomeLoja,
    maquininhas: maquininhas.map((m) => ({
      id: m.id,
      nome: m.nome,
      padrao: m.padrao,
      taxaDebito: m.taxaDebito,
      taxaCredito: m.taxaCredito,
      taxaCreditoParcelado: m.taxaCreditoParcelado,
      taxaPix: m.taxaPix,
    })),
  };
}

// ---------------------------------------------------------------- fiado

export type FormaRecebimento = Exclude<FormaPagamento, "FIADO">;

/**
 * Recebe pagamento de fiado (total ou parcial). Roda em transação: relê o
 * saldo com tx pra evitar receber mais do que o devido em cliques duplos.
 *
 * Cartão e Pix seguem a mesma regra do PDV: se existe maquininha ativa, o
 * cartão precisa dizer em qual passou (Pix é opcional). A taxa vem da
 * maquininha (à vista) ou da configuração da forma, e vira uma Despesa
 * automática na categoria "Taxas de cartão": a venda original foi FIADO
 * (taxa zero), então sem isso a taxa sumiria do lucro real. `LancamentoFiado`
 * não tem maquininhaId/taxaValor/nsu no schema; maquininha e NSU ficam na
 * observação e na auditoria.
 */
export async function receberPagamentoFiado(params: {
  clienteId: number;
  valor: number;
  forma: FormaRecebimento;
  maquininhaId?: number | null;
  nsu?: string | null;
  observacao: string | null;
  usuarioId: number;
}) {
  const { clienteId, valor, forma, observacao, usuarioId } = params;
  return db.$transaction(async (tx) => {
    const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new Error("Cliente não encontrado.");
    const saldo = await saldoFiado(clienteId, tx);
    if (saldo <= 0) throw new Error("Este cliente não tem saldo devedor pra receber.");
    if (valor <= 0) throw new Error("Informe um valor maior que zero.");
    if (valor > saldo) {
      throw new Error(`O valor não pode passar do saldo devedor (${formatarReais(saldo)}).`);
    }

    // ---- maquininha e taxa (só PIX/DEBITO/CREDITO; dinheiro não tem taxa)
    const comTaxa = formaPassaNaMaquininha(forma);
    const maquininhasAtivas = comTaxa ? await listarMaquininhasAtivas(tx) : [];
    const maquininhaId = comTaxa ? (params.maquininhaId ?? null) : null;
    const maquininha = maquininhaId !== null ? (maquininhasAtivas.find((m) => m.id === maquininhaId) ?? null) : null;
    if (maquininhaId !== null && !maquininha) {
      throw new Error("A maquininha escolhida não existe mais ou foi desativada. Recarregue a página e escolha de novo.");
    }
    if ((forma === "DEBITO" || forma === "CREDITO") && !maquininha && maquininhasAtivas.length > 0) {
      throw new Error(`Informe em qual maquininha passou o ${ROTULO_FORMA_PAGAMENTO[forma].toLowerCase()}.`);
    }
    let taxa = { taxaPercentual: 0, taxaFixa: 0, taxaValor: 0 };
    if (comTaxa) {
      const configs = await obterConfiguracoesPagamento(tx);
      const { taxas } = calcularTaxasPagamentos(
        [{ forma, valor, parcelas: 1, maquininhaId: maquininha?.id ?? null }],
        configs,
        new Map(maquininhasAtivas.map((m) => [m.id, m])),
      );
      taxa = { taxaPercentual: taxas[0].taxaPercentual, taxaFixa: taxas[0].taxaFixa, taxaValor: taxas[0].taxaValor };
    }
    const nsu = maquininha && params.nsu?.trim() ? params.nsu.trim().slice(0, 40) : null;

    const sessao = await obterSessaoCaixaAberta(tx);
    const lancamento = await tx.lancamentoFiado.create({
      data: {
        clienteId,
        tipo: "PAGAMENTO",
        valor,
        formaPagamento: forma,
        sessaoId: sessao?.id ?? null,
        observacao: montarObservacaoRecebimento({ observacao, maquininhaNome: maquininha?.nome ?? null, nsu }),
        usuarioId,
      },
    });

    // ---- taxa vira despesa (não sai do caixa: pagoDoCaixa false, sem sessão)
    let despesaId: number | null = null;
    if (comTaxa && taxa.taxaValor > 0) {
      const categoria = await tx.categoriaDespesa.upsert({
        where: { nome: CATEGORIA_DESPESA_TAXAS },
        update: {},
        create: { nome: CATEGORIA_DESPESA_TAXAS },
      });
      const textos = montarDespesaTaxaFiado({
        forma,
        rotuloForma: ROTULO_FORMA_PAGAMENTO[forma],
        clienteNome: cliente.nome,
        maquininhaNome: maquininha?.nome ?? null,
        valorRecebido: valor,
        taxaPercentual: taxa.taxaPercentual,
        taxaFixa: taxa.taxaFixa,
        taxaValor: taxa.taxaValor,
        lancamentoId: lancamento.id,
        nsu,
      });
      const despesa = await tx.despesa.create({
        data: {
          descricao: textos.descricao,
          categoriaId: categoria.id,
          valor: taxa.taxaValor,
          data: agora(),
          formaPagamento: forma,
          pagoDoCaixa: false,
          sessaoId: null,
          observacao: textos.observacao,
          usuarioId,
        },
      });
      despesaId = despesa.id;
    }

    await registrarAuditoria(
      {
        usuarioId,
        acao: "fiado.receber",
        entidade: "LancamentoFiado",
        entidadeId: lancamento.id,
        detalhes: {
          clienteId,
          cliente: cliente.nome,
          valor,
          forma,
          sessaoId: sessao?.id ?? null,
          maquininhaId: maquininha?.id ?? null,
          maquininha: maquininha?.nome ?? null,
          nsu,
          taxaPercentual: taxa.taxaPercentual,
          taxaFixa: taxa.taxaFixa,
          taxaValor: taxa.taxaValor,
          despesaId,
          saldoAnterior: saldo,
          saldoNovo: saldo - valor,
        },
      },
      tx,
    );
    return {
      lancamentoId: lancamento.id,
      saldoNovo: saldo - valor,
      entrouNoCaixa: sessao !== null,
      maquininhaNome: maquininha?.nome ?? null,
      taxaValor: taxa.taxaValor,
      despesaId,
    };
  });
}

/**
 * Ajuste manual de saldo (ADMIN): DEBITO pra dívida antiga (caderno) ou
 * PAGAMENTO pra acerto/desconto. Não entra no caixa (sem forma e sem sessão).
 * ESTORNO não passa por aqui: só o cancelamento de venda cria.
 */
export async function ajustarSaldoFiado(params: {
  clienteId: number;
  tipo: TipoAjusteFiado;
  valor: number;
  observacao: string;
  usuarioId: number;
}) {
  const { clienteId, tipo, valor, observacao, usuarioId } = params;
  return db.$transaction(async (tx) => {
    const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new Error("Cliente não encontrado.");
    if (tipo !== "DEBITO" && tipo !== "PAGAMENTO") throw new Error("Tipo de ajuste inválido.");
    if (valor <= 0) throw new Error("Informe um valor maior que zero.");
    const saldo = await saldoFiado(clienteId, tx);
    if (tipo === "PAGAMENTO" && valor > saldo) {
      throw new Error(`O abatimento não pode passar do saldo devedor (${formatarReais(saldo)}).`);
    }
    const lancamento = await tx.lancamentoFiado.create({
      data: {
        clienteId,
        tipo,
        valor,
        formaPagamento: null,
        sessaoId: null,
        observacao: observacao.trim(),
        usuarioId,
      },
    });
    const saldoNovo = tipo === "DEBITO" ? saldo + valor : saldo - valor;
    await registrarAuditoria(
      {
        usuarioId,
        acao: "fiado.ajustar",
        entidade: "LancamentoFiado",
        entidadeId: lancamento.id,
        detalhes: { clienteId, cliente: cliente.nome, tipo, valor, observacao: observacao.trim(), saldoAnterior: saldo, saldoNovo },
      },
      tx,
    );
    return { lancamentoId: lancamento.id, saldoNovo };
  });
}

// ---------------------------------------------------------------- recibo

export type Recibo = {
  lancamentoId: number;
  clienteId: number;
  clienteNome: string;
  clienteCpf: string;
  clienteTelefone: string;
  tipo: TipoLancamentoFiado;
  valor: number;
  formaPagamento: FormaPagamento | null;
  dataHora: string;
  observacao: string | null;
  recebidoPor: string | null;
  saldoAnterior: number;
  saldoApos: number;
  loja: { nome: string; cnpj: string; endereco: string; telefone: string; mensagem: string | null };
};

export async function obterRecibo(clienteId: number, lancamentoId: number): Promise<Recibo | null> {
  const lancamento = await db.lancamentoFiado.findFirst({
    where: { id: lancamentoId, clienteId, tipo: "PAGAMENTO" },
    include: { cliente: true, usuario: { select: { nome: true } } },
  });
  if (!lancamento) return null;

  const [todos, config] = await Promise.all([
    db.lancamentoFiado.findMany({
      where: { clienteId },
      select: { id: true, tipo: true, valor: true, criadoEm: true },
    }),
    obterConfiguracao(),
  ]);
  const extrato = calcularExtrato(todos);
  const linha = extrato.find((l) => l.id === lancamentoId);
  const saldoApos = linha?.saldoApos ?? 0;

  return {
    lancamentoId: lancamento.id,
    clienteId,
    clienteNome: lancamento.cliente.nome,
    clienteCpf: formatarCpf(lancamento.cliente.cpf),
    clienteTelefone: formatarTelefone(lancamento.cliente.telefone),
    tipo: lancamento.tipo,
    valor: lancamento.valor,
    formaPagamento: lancamento.formaPagamento,
    dataHora: formatarDataHora(lancamento.criadoEm),
    observacao: lancamento.observacao,
    recebidoPor: lancamento.usuario?.nome ?? null,
    saldoAnterior: saldoApos + lancamento.valor,
    saldoApos,
    loja: {
      nome: config.nomeLoja,
      cnpj: config.cnpj ?? "",
      endereco: config.endereco ?? "",
      telefone: config.telefone ?? "",
      mensagem: config.mensagemCupom,
    },
  };
}
