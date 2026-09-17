// Cálculos puros do módulo de clientes e fiado. Sem banco, sem Next.
// Tudo aqui tem teste em tests/clientes.test.ts.

import { differenceInCalendarDays } from "date-fns";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { agora, formatarData, noFuso } from "@/lib/datas";

/**
 * DEBITO aumenta a dívida; PAGAMENTO (dinheiro que entrou) e ESTORNO (venda
 * fiado cancelada) reduzem. Só PAGAMENTO conta como "recebido".
 */
export type TipoLancamento = "DEBITO" | "PAGAMENTO" | "ESTORNO";

/** Tipos que o ADMIN pode lançar à mão; ESTORNO só nasce do cancelamento de venda. */
export type TipoAjusteFiado = Exclude<TipoLancamento, "ESTORNO">;

/** Formato mínimo de um lançamento pra cálculo (aceita Date ou ISO). */
export type LancamentoBase = {
  id: number;
  tipo: TipoLancamento;
  valor: number; // centavos, sempre positivo
  criadoEm: Date | string;
  vendaId?: number | null;
};

export type LancamentoComSaldo<T extends LancamentoBase> = T & {
  /** Valor com sinal: DEBITO positivo (aumenta a dívida), PAGAMENTO e ESTORNO negativos. */
  valorComSinal: number;
  /** Saldo devedor logo após este lançamento. */
  saldoApos: number;
};

export type DebitoEmAberto<T extends LancamentoBase> = {
  lancamento: T;
  /** Parte do débito que ainda não foi coberta por pagamentos (centavos). */
  valorEmAberto: number;
};

function paraDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/** Ordena do mais antigo pro mais novo (data, depois id). Não altera a lista original. */
export function ordenarCronologico<T extends LancamentoBase>(lancamentos: T[]): T[] {
  return [...lancamentos].sort((a, b) => {
    const diff = paraDate(a.criadoEm).getTime() - paraDate(b.criadoEm).getTime();
    return diff !== 0 ? diff : a.id - b.id;
  });
}

/** Saldo devedor = DEBITO − PAGAMENTO − ESTORNO. */
export function calcularSaldo(lancamentos: LancamentoBase[]): number {
  return lancamentos.reduce((acc, l) => acc + (l.tipo === "DEBITO" ? l.valor : -l.valor), 0);
}

/**
 * Campos que distinguem pagamento de verdade de ajuste manual. `vendaId` e
 * `formaPagamento` são obrigatórios de propósito: se a consulta não trouxer
 * um deles, o tipo acusa em vez de calcular errado em silêncio.
 */
export type LancamentoComOrigem = LancamentoBase & {
  vendaId: number | null;
  formaPagamento: string | null;
};

/**
 * Ajuste manual (ADMIN): DEBITO ou PAGAMENTO sem venda e sem forma de pagamento.
 * ESTORNO nunca é manual (só o cancelamento de venda cria).
 */
export function ehAjusteManual(l: Pick<LancamentoComOrigem, "tipo" | "vendaId" | "formaPagamento">): boolean {
  if (l.tipo === "ESTORNO" || l.vendaId !== null) return false;
  return l.tipo === "DEBITO" || l.formaPagamento === null;
}

export type TotaisFiado = {
  /** DEBITO − ESTORNO: venda cancelada não conta como compra. */
  comprado: number;
  /** PAGAMENTO com forma de pagamento: dinheiro que entrou de fato. */
  pago: number;
  /** PAGAMENTO manual (desconto, acerto, dívida perdoada): reduz o saldo sem entrar dinheiro. */
  abatido: number;
};

/** Totais do histórico de fiado do cliente, separando o que foi pago do que foi só abatido. */
export function totaisFiado(lancamentos: LancamentoComOrigem[]): TotaisFiado {
  const totais: TotaisFiado = { comprado: 0, pago: 0, abatido: 0 };
  for (const l of lancamentos) {
    if (l.tipo === "DEBITO") totais.comprado += l.valor;
    else if (l.tipo === "ESTORNO") totais.comprado -= l.valor;
    else if (ehAjusteManual(l)) totais.abatido += l.valor;
    else totais.pago += l.valor;
  }
  return totais;
}

/**
 * Extrato com saldo acumulado. Calcula em ordem cronológica e devolve do
 * mais recente pro mais antigo (como a tela mostra).
 */
export function calcularExtrato<T extends LancamentoBase>(lancamentos: T[]): LancamentoComSaldo<T>[] {
  let saldo = 0;
  const cronologico = ordenarCronologico(lancamentos).map((l) => {
    const valorComSinal = l.tipo === "DEBITO" ? l.valor : -l.valor;
    saldo += valorComSinal;
    return { ...l, valorComSinal, saldoApos: saldo };
  });
  return cronologico.reverse();
}

/**
 * Débitos ainda não quitados. Um ESTORNO quita o débito da própria venda
 * (mesmo `vendaId`); o que não casar com nenhum débito vira crédito genérico.
 * Pagamentos e créditos genéricos cobrem os débitos mais antigos primeiro (FIFO).
 * Devolve em ordem cronológica (mais antigo primeiro).
 */
export function debitosEmAberto<T extends LancamentoBase>(lancamentos: T[]): DebitoEmAberto<T>[] {
  const cronologico = ordenarCronologico(lancamentos);

  // 1) Separa o que abate: estorno com venda fica reservado pro débito daquela venda.
  const estornoPorVenda = new Map<number, number>();
  let creditoGenerico = 0;
  for (const l of cronologico) {
    if (l.tipo === "PAGAMENTO") creditoGenerico += l.valor;
    if (l.tipo === "ESTORNO") {
      if (l.vendaId != null) estornoPorVenda.set(l.vendaId, (estornoPorVenda.get(l.vendaId) ?? 0) + l.valor);
      else creditoGenerico += l.valor;
    }
  }

  // 2) Cada débito é abatido primeiro pelo estorno da própria venda.
  const debitos = cronologico
    .filter((l) => l.tipo === "DEBITO")
    .map((l) => {
      let restante = l.valor;
      if (l.vendaId != null) {
        const estorno = estornoPorVenda.get(l.vendaId) ?? 0;
        const abatido = Math.min(restante, estorno);
        restante -= abatido;
        estornoPorVenda.set(l.vendaId, estorno - abatido);
      }
      return { lancamento: l, restante };
    });
  // Estorno que sobrou (sem débito correspondente) vale como pagamento genérico.
  for (const sobra of estornoPorVenda.values()) creditoGenerico += sobra;

  // 3) FIFO: o crédito genérico cobre os débitos mais antigos primeiro.
  const abertos: DebitoEmAberto<T>[] = [];
  for (const d of debitos) {
    const coberto = Math.min(d.restante, creditoGenerico);
    creditoGenerico -= coberto;
    const restante = d.restante - coberto;
    if (restante > 0) abertos.push({ lancamento: d.lancamento, valorEmAberto: restante });
  }
  return abertos;
}

/**
 * Dias corridos desde o débito mais antigo ainda em aberto (FIFO).
 * 0 se não há dívida.
 */
export function diasEmAtraso(lancamentos: LancamentoBase[], hoje: Date = agora()): number {
  const abertos = debitosEmAberto(lancamentos);
  if (abertos.length === 0) return 0;
  const maisAntigo = paraDate(abertos[0].lancamento.criadoEm);
  const dias = differenceInCalendarDays(noFuso(hoje), noFuso(maisAntigo));
  return Math.max(0, dias);
}

/** Limite de dias a partir do qual o fiado é considerado vencido. */
export const DIAS_FIADO_VENCIDO = 30;

export function fiadoVencido(diasAtraso: number, limiteDias = DIAS_FIADO_VENCIDO): boolean {
  return diasAtraso > limiteDias;
}

// ---------------------------------------------------------------- aniversariantes

/** Verdadeiro se a data de nascimento cai no mesmo mês da referência (no fuso do mercado). */
export function aniversarianteDoMes(dataNascimento: Date | string | null | undefined, referencia: Date = agora()): boolean {
  if (!dataNascimento) return false;
  const nasc = noFuso(paraDate(dataNascimento));
  if (Number.isNaN(nasc.getTime())) return false;
  return nasc.getMonth() === noFuso(referencia).getMonth();
}

/** Dia do mês do aniversário (no fuso), ou null. */
export function diaDoAniversario(dataNascimento: Date | string | null | undefined): number | null {
  if (!dataNascimento) return null;
  const nasc = noFuso(paraDate(dataNascimento));
  return Number.isNaN(nasc.getTime()) ? null : nasc.getDate();
}

/** Filtra aniversariantes do mês e ordena pelo dia do aniversário. */
export function filtrarAniversariantesDoMes<T extends { dataNascimento: Date | string | null }>(
  clientes: T[],
  referencia: Date = agora(),
): T[] {
  return clientes
    .filter((c) => aniversarianteDoMes(c.dataNascimento, referencia))
    .sort((a, b) => (diaDoAniversario(a.dataNascimento) ?? 0) - (diaDoAniversario(b.dataNascimento) ?? 0));
}

/** Idade completa em anos na data de referência, ou null. */
export function idadeEmAnos(dataNascimento: Date | string | null | undefined, referencia: Date = agora()): number | null {
  if (!dataNascimento) return null;
  const nasc = noFuso(paraDate(dataNascimento));
  const ref = noFuso(referencia);
  if (Number.isNaN(nasc.getTime())) return null;
  let idade = ref.getFullYear() - nasc.getFullYear();
  const aindaNaoFezAniversario =
    ref.getMonth() < nasc.getMonth() || (ref.getMonth() === nasc.getMonth() && ref.getDate() < nasc.getDate());
  if (aindaNaoFezAniversario) idade -= 1;
  return idade < 0 ? null : idade;
}

// ---------------------------------------------------------------- situação

export type SituacaoCliente = {
  codigo: "inativo" | "credito" | "atrasado" | "acima-do-limite" | "devendo" | "sem-fiado" | "em-dia";
  rotulo: string;
  tom: "neutro" | "sucesso" | "alerta" | "perigo" | "info" | "primaria";
};

/**
 * Situação resumida do cliente pra tabela e pro CSV. Saldo negativo é crédito
 * do cliente (venda fiado já paga que foi cancelada): a loja deve pra ele.
 */
export function situacaoCliente(params: {
  ativo: boolean;
  saldo: number;
  limiteFiado: number;
  diasAtraso: number;
}): SituacaoCliente {
  const { ativo, saldo, limiteFiado, diasAtraso } = params;
  if (!ativo) return { codigo: "inativo", rotulo: "Inativo", tom: "neutro" };
  if (saldo < 0) return { codigo: "credito", rotulo: `Crédito de ${formatarReais(-saldo)}`, tom: "info" };
  if (saldo > 0 && fiadoVencido(diasAtraso)) {
    return { codigo: "atrasado", rotulo: `Atrasado há ${diasAtraso} dias`, tom: "perigo" };
  }
  if (saldo > 0 && saldo > limiteFiado) return { codigo: "acima-do-limite", rotulo: "Acima do limite", tom: "perigo" };
  if (saldo > 0) return { codigo: "devendo", rotulo: "Devendo", tom: "alerta" };
  if (limiteFiado <= 0) return { codigo: "sem-fiado", rotulo: "Sem fiado", tom: "neutro" };
  return { codigo: "em-dia", rotulo: "Em dia", tom: "sucesso" };
}

// ---------------------------------------------------------------- WhatsApp

/**
 * Telefone -> só dígitos com DDI 55 na frente, pronto pro wa.me.
 * Aceita "(35) 99217-3959", "35992173959", "+55 35 9921-3959". null se não der pra usar.
 */
export function telefoneParaWhatsApp(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  let d = telefone.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (/^55\d{10,11}$/.test(d)) return d;
  if (/^\d{10,11}$/.test(d)) return `55${d}`;
  return null;
}

export type ItemCobranca = {
  data: Date | string;
  valor: number; // centavos em aberto
  numeroVenda?: number | null;
};

/** Texto da mensagem de cobrança amigável (sem codificação de URL). */
export function montarMensagemCobranca(params: {
  nomeLoja: string;
  nomeCliente: string;
  saldo: number;
  itensEmAberto: ItemCobranca[];
}): string {
  const { nomeLoja, nomeCliente, saldo, itensEmAberto } = params;
  const primeiroNome = nomeCliente.trim().split(/\s+/)[0] || nomeCliente;
  const linhas: string[] = [];
  linhas.push(`Olá, ${primeiroNome}! Aqui é do ${nomeLoja}.`);
  linhas.push(`Passando pra lembrar que o seu saldo de fiado está em ${formatarReais(saldo)}.`);
  if (itensEmAberto.length > 0) {
    linhas.push("");
    linhas.push("Compras em aberto:");
    const maximo = 10;
    for (const item of itensEmAberto.slice(0, maximo)) {
      const cupom = item.numeroVenda ? ` (cupom nº ${item.numeroVenda})` : "";
      linhas.push(`- ${formatarData(paraDate(item.data))}: ${formatarReais(item.valor)}${cupom}`);
    }
    if (itensEmAberto.length > maximo) {
      linhas.push(`- e mais ${itensEmAberto.length - maximo} lançamento(s)`);
    }
  }
  linhas.push("");
  linhas.push("Quando puder, dá uma passadinha pra acertar. Muito obrigado!");
  return linhas.join("\n");
}

/** Link wa.me com a mensagem já codificada. null se o telefone não serve. */
export function montarLinkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const numero = telefoneParaWhatsApp(telefone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

// ---------------------------------------------------------------- CSV

/** Escapa um valor pra CSV com separador ";" (aspas quando precisa). */
export function escaparCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const s = String(valor);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function linhaCsv(valores: Array<string | number | null | undefined>): string {
  return valores.map(escaparCsv).join(";");
}

export type ClienteParaCsv = {
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  endereco: string;
  dataNascimento: string;
  limiteFiado: number;
  saldo: number;
  diasAtraso: number;
  ultimaCompra: string;
  situacao: string;
  ativo: boolean;
};

export const CABECALHO_CSV_CLIENTES = [
  "Nome",
  "CPF",
  "Telefone",
  "E-mail",
  "Endereço",
  "Data de nascimento",
  "Limite de fiado (R$)",
  "Saldo devedor (R$)",
  "Dias em atraso",
  "Última compra",
  "Situação",
  "Ativo",
];

/** CSV completo com BOM (Excel em português abre certo) e separador ";". */
export function montarCsvClientes(clientes: ClienteParaCsv[]): string {
  const linhas = [linhaCsv(CABECALHO_CSV_CLIENTES)];
  for (const c of clientes) {
    linhas.push(
      linhaCsv([
        c.nome,
        c.cpf,
        c.telefone,
        c.email,
        c.endereco,
        c.dataNascimento,
        formatarReais(c.limiteFiado, false),
        formatarReais(c.saldo, false),
        c.diasAtraso,
        c.ultimaCompra,
        c.situacao,
        c.ativo ? "Sim" : "Não",
      ]),
    );
  }
  return `﻿${linhas.join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------- recebimento em cartão/Pix

/** Formas de recebimento de fiado que podem passar na maquininha (e ter taxa). */
export type FormaComTaxa = "PIX" | "DEBITO" | "CREDITO";

export function formaPassaNaMaquininha(forma: string): forma is FormaComTaxa {
  return forma === "PIX" || forma === "DEBITO" || forma === "CREDITO";
}

/** Categoria de despesa em que a taxa do recebimento de fiado é lançada (criada se não existir). */
export const CATEGORIA_DESPESA_TAXAS = "Taxas de cartão";

/**
 * Observação do lançamento: maquininha e NSU na frente (pra bater com o
 * extrato da adquirente), texto do operador depois. null se não há nada.
 */
export function montarObservacaoRecebimento(params: {
  observacao: string | null | undefined;
  maquininhaNome: string | null;
  nsu: string | null;
}): string | null {
  const partes: string[] = [];
  if (params.maquininhaNome) {
    partes.push(params.nsu ? `${params.maquininhaNome} · NSU ${params.nsu}` : params.maquininhaNome);
  }
  const texto = params.observacao?.trim();
  if (texto) partes.push(texto);
  return partes.length ? partes.join(" · ") : null;
}

/**
 * Despesa que representa a taxa descontada pela maquininha (ou pelo banco, no
 * Pix sem maquininha) sobre um recebimento de fiado. A venda original foi FIADO
 * (taxa zero), então é só por aqui que essa taxa entra no lucro real.
 */
export function montarDespesaTaxaFiado(params: {
  forma: FormaComTaxa;
  rotuloForma: string;
  clienteNome: string;
  maquininhaNome: string | null;
  valorRecebido: number;
  taxaPercentual: number;
  taxaFixa: number;
  taxaValor: number;
  lancamentoId: number;
  nsu: string | null;
}): { descricao: string; observacao: string } {
  const origem = params.maquininhaNome ? `pela ${params.maquininhaNome}` : "pela configuração da forma de pagamento";
  const partesTaxa: string[] = [];
  if (params.taxaPercentual > 0) partesTaxa.push(formatarPercentual(params.taxaPercentual));
  if (params.taxaFixa > 0) partesTaxa.push(`${formatarReais(params.taxaFixa)} fixo`);
  const taxa = partesTaxa.length ? partesTaxa.join(" + ") : formatarReais(params.taxaValor);
  const nsu = params.nsu ? `, NSU ${params.nsu}` : "";
  return {
    descricao: `Taxa de ${params.rotuloForma.toLowerCase()} · fiado de ${params.clienteNome}`,
    observacao: `Descontada ${origem} sobre ${formatarReais(params.valorRecebido)} (taxa de ${taxa}). Recebimento de fiado nº ${params.lancamentoId}${nsu}. Lançada automaticamente; não saiu do caixa.`,
  };
}

// ---------------------------------------------------------------- extrato paginado

/** Quantos lançamentos o extrato da ficha mostra por vez (o saldo usa todos). */
export const EXTRATO_POR_PAGINA = 50;

/** Lê "?extrato=" da ficha: número de lançamentos a mostrar, ou null pra todos. Inválido cai no padrão. */
export function lerLimiteExtrato(valor: string | null | undefined): number | null {
  if (valor === "todos") return null;
  if (valor && /^\d+$/.test(valor)) {
    const n = Number(valor);
    if (n > 0) return n;
  }
  return EXTRATO_POR_PAGINA;
}

// ---------------------------------------------------------------- normalização de cadastro

/** Só dígitos, ou null se vazio. Usado pra CPF e telefone antes de salvar. */
export function somenteDigitos(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const d = texto.replace(/\D/g, "");
  return d === "" ? null : d;
}

/** Nome inicial pra avatar: "Maria da Silva" -> "MS". */
export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}
