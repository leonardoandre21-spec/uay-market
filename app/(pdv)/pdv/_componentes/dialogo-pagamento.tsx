"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormaPagamento } from "@prisma/client";
import { Banknote, CreditCard, HandCoins, Landmark, QrCode, Smartphone, Trash2, Wallet } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { CaixaSelecao, Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { Selo } from "@/components/ui/selo";
import { calcularTaxa, formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO, ROTULO_FORMA_PAGAMENTO_CURTO } from "@/lib/rotulos";
import { calcularTroco, ehMercadoPago, restantePagar, taxaDaMaquininha } from "@/lib/servicos/vendas-calculos";
import { cn } from "@/lib/utils";
import { CobrancaMaquininha } from "./cobranca-maquininha";
import { EntradaCentavos } from "./entrada-centavos";
import { PixQr } from "./pix-qr";
import { Tecla, useFocoAoAbrir } from "./util";
import {
  CHAVE_ULTIMA_MAQUININHA,
  novaChave,
  type ClientePdv,
  type DadosPdv,
  type MaquininhaPdv,
  type PagamentoUi,
} from "./tipos";

/** Última maquininha usada neste navegador (localStorage), se ainda estiver ativa. */
function lerUltimaMaquininha(maquininhas: MaquininhaPdv[]): number | null {
  try {
    const salvo = window.localStorage.getItem(CHAVE_ULTIMA_MAQUININHA);
    const id = salvo ? Number(salvo) : NaN;
    return maquininhas.some((m) => m.id === id) ? id : null;
  } catch {
    return null;
  }
}

function guardarUltimaMaquininha(id: number) {
  try {
    window.localStorage.setItem(CHAVE_ULTIMA_MAQUININHA, String(id));
  } catch {
    // navegador sem localStorage: segue sem lembrar
  }
}

/** Pré-seleção: última usada aqui, senão a padrão, senão a primeira ativa. */
function maquininhaInicial(maquininhas: MaquininhaPdv[]): number | null {
  if (maquininhas.length === 0) return null;
  return lerUltimaMaquininha(maquininhas) ?? maquininhas.find((m) => m.padrao)?.id ?? maquininhas[0].id;
}

const ICONE_FORMA: Record<FormaPagamento, typeof Banknote> = {
  DINHEIRO: Banknote,
  PIX: QrCode,
  DEBITO: Landmark,
  CREDITO: CreditCard,
  FIADO: HandCoins,
};

type OpcoesAdicionar = {
  /** cartão registrado sem passar pela integração Mercado Pago */
  manual?: boolean;
  /** cobrança aprovada pela maquininha Mercado Pago */
  mp?: { intentId: string; paymentId: string | null } | null;
};

export function DialogoPagamento({
  aberto,
  total,
  formas,
  maquininhas,
  cliente,
  config,
  sessaoId,
  pagamentos,
  aoMudarPagamentos,
  pendente,
  erro,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  total: number;
  formas: DadosPdv["formas"];
  maquininhas: MaquininhaPdv[];
  cliente: ClientePdv | null;
  config: DadosPdv["config"];
  sessaoId: number;
  /** lista vive no Pdv: sobrevive ao fechar/reabrir o diálogo e ao F5 */
  pagamentos: PagamentoUi[];
  aoMudarPagamentos: (lista: PagamentoUi[]) => void;
  pendente: boolean;
  erro: string | null;
  aoConfirmar: (pagamentos: PagamentoUi[]) => void;
  aoFechar: () => void;
}) {
  const [forma, setForma] = useState<FormaPagamento>(formas[0]?.forma ?? "DINHEIRO");
  const somaPagamentos = pagamentos.reduce((a, p) => a + p.valor, 0);
  const restante = restantePagar(total, pagamentos);
  // Total caiu depois de lançar pagamentos (item removido com o diálogo fechado): sobra a devolver ou ajustar.
  const excedente = Math.max(0, somaPagamentos - total);
  const contaFechada = restante === 0 && excedente === 0;
  const [valor, setValor] = useState(restante);
  const [valorRecebido, setValorRecebido] = useState(0);
  const [parcelas, setParcelas] = useState(1);
  const [mpOcupado, setMpOcupado] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  // Remover pagamento cobrado na maquininha Mercado Pago pede um segundo clique.
  const [confirmarRemocao, setConfirmarRemocao] = useState<string | null>(null);
  const referenciaRef = useRef(`pdv-${sessaoId}-${Date.now()}`);

  // Maquininha em que o cartão/pix passou (só quando há maquininha cadastrada).
  const [maquininhaId, setMaquininhaId] = useState<number | null>(() => maquininhaInicial(maquininhas));
  const [nsu, setNsu] = useState("");
  const [autorizacao, setAutorizacao] = useState("");
  const [pixNaMaquininha, setPixNaMaquininha] = useState(() => maquininhas.some((m) => m.taxaPix > 0));

  const valorRef = useRef<HTMLInputElement>(null);
  const recebidoRef = useRef<HTMLInputElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  useFocoAoAbrir(forma === "DINHEIRO" ? recebidoRef : valorRef, aberto);

  const cfgForma = formas.find((f) => f.forma === forma);
  const maxParcelas = cfgForma?.maxParcelas ?? 1;
  const troco = forma === "DINHEIRO" && valorRecebido > 0 ? calcularTroco(valor, valorRecebido) : 0;
  const disponivelFiado = cliente ? Math.max(0, cliente.limiteFiado - cliente.saldoFiado) : 0;

  const temMaquininhas = maquininhas.length > 0;
  const formaCartao = forma === "DEBITO" || forma === "CREDITO";
  const mostrarMaquininha = temMaquininhas && (formaCartao || (forma === "PIX" && pixNaMaquininha));
  const maquininhaSelecionada = mostrarMaquininha ? (maquininhas.find((m) => m.id === maquininhaId) ?? null) : null;
  const taxaMaquininha = (() => {
    if (!maquininhaSelecionada || valor <= 0) return null;
    const { taxaPercentual, taxaFixa } = taxaDaMaquininha(maquininhaSelecionada, forma, parcelas);
    return { taxaPercentual, taxaValor: calcularTaxa(valor, taxaPercentual, taxaFixa) };
  })();
  // Integração Mercado Pago Point: só se configurada E a maquininha escolhida for Mercado Pago
  // (ou se não houver maquininha cadastrada, que é o comportamento antigo).
  const usaMaquininha =
    config.mpConfigurado && formaCartao && (!temMaquininhas || ehMercadoPago(maquininhaSelecionada?.adquirente));

  // Mudou forma/valor/parcelas/maquininha: o erro anterior (e a remoção pendente) não valem mais.
  useEffect(() => {
    setErroLocal(null);
    setConfirmarRemocao(null);
  }, [forma, valor, parcelas, maquininhaId]);

  // Quando a lista de pagamentos muda, o próximo valor sugerido é o restante.
  useEffect(() => {
    setValor(restante);
    setValorRecebido(0);
    setParcelas(1);
    referenciaRef.current = `pdv-${sessaoId}-${Date.now()}`;
  }, [restante, sessaoId]);

  // Quando fecha a conta (inclusive venda de total zero, sem pagamento), foca o
  // botão de confirmar pra Enter finalizar.
  useEffect(() => {
    if (contaFechada) {
      const t = window.setTimeout(() => confirmarRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
  }, [contaFechada]);

  // Enquanto grava a venda ou a maquininha cobra, Esc não pode fechar o diálogo
  // (o <dialog> nativo fecha no keydown de Escape; barrar o keydown barra o fechamento).
  const ocupado = pendente || mpOcupado;
  useEffect(() => {
    if (!ocupado) return;
    const barrar = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    document.addEventListener("keydown", barrar, true);
    return () => document.removeEventListener("keydown", barrar, true);
  }, [ocupado]);

  const aoMudarOcupado = useCallback((ocupado: boolean) => setMpOcupado(ocupado), []);
  // Cobrança aprovada na Point entra na lista na hora: o cartão já foi cobrado,
  // então o registro não pode depender de um clique nem se perder se o diálogo
  // fechar. `adicionarRef` aponta pra versão mais recente de adicionar().
  const adicionarRef = useRef<(opcoes: OpcoesAdicionar) => boolean>(() => false);
  useEffect(() => {
    adicionarRef.current = adicionar;
  });
  const aoAprovarMp = useCallback((dados: { intentId: string; paymentId: string | null }) => {
    adicionarRef.current({ mp: dados });
  }, []);

  function trocarForma(f: FormaPagamento) {
    if (mpOcupado) return;
    setForma(f);
    setValor(restante);
    setValorRecebido(0);
    setParcelas(1);
    window.setTimeout(() => (f === "DINHEIRO" ? recebidoRef : valorRef).current?.focus(), 30);
  }

  function validarNovo(): string | null {
    if (valor <= 0) return "Informe o valor do pagamento.";
    if (valor > restante) return `O valor passa do que falta pagar (${formatarReais(restante)}).`;
    if (forma === "DINHEIRO" && valorRecebido > 0 && valorRecebido < valor) {
      return `O cliente entregou ${formatarReais(valorRecebido)}, menos que ${formatarReais(valor)}. Ajuste o valor do pagamento ou o recebido.`;
    }
    if (forma === "FIADO") {
      if (!cliente) return "Pra vender fiado, selecione o cliente no painel da direita antes de finalizar.";
      if (cliente.limiteFiado <= 0) return `${cliente.nome} não tem limite de fiado liberado.`;
      if (valor > disponivelFiado) {
        return `${cliente.nome} só tem ${formatarReais(disponivelFiado)} de limite disponível (deve ${formatarReais(cliente.saldoFiado)}).`;
      }
    }
    if (forma === "CREDITO" && (parcelas < 1 || parcelas > maxParcelas)) return `Parcelas entre 1 e ${maxParcelas}.`;
    if (temMaquininhas && formaCartao && !maquininhaSelecionada) return "Escolha em qual maquininha o cartão passou.";
    if (forma === "PIX" && pixNaMaquininha && temMaquininhas && !maquininhaSelecionada) {
      return "Escolha a maquininha do Pix ou desmarque a opção de que ele passou na maquininha.";
    }
    return null;
  }

  /**
   * Lança o pagamento na lista. `mp` = aprovado pela maquininha Mercado Pago (o
   * cartão já foi cobrado: entra sem revalidar, o servidor confere a soma);
   * `manual` = cartão registrado sem a integração.
   */
  function adicionar(opcoes: OpcoesAdicionar = {}): boolean {
    if (!opcoes.mp) {
      const problema = validarNovo();
      if (problema) {
        setErroLocal(problema);
        return false;
      }
    }
    const novo: PagamentoUi = {
      chave: novaChave(),
      forma,
      valor,
      valorRecebido: forma === "DINHEIRO" ? (valorRecebido > 0 ? valorRecebido : valor) : null,
      parcelas: forma === "CREDITO" ? parcelas : 1,
      maquininhaId: maquininhaSelecionada?.id ?? null,
      maquininhaNome: maquininhaSelecionada?.nome ?? null,
      nsu: maquininhaSelecionada && nsu.trim() ? nsu.trim().slice(0, 40) : null,
      autorizacao: maquininhaSelecionada && autorizacao.trim() ? autorizacao.trim().slice(0, 40) : null,
      mp: opcoes.mp ? { intentId: opcoes.mp.intentId, paymentId: opcoes.mp.paymentId, status: "APROVADO" } : null,
    };
    if (maquininhaSelecionada) guardarUltimaMaquininha(maquininhaSelecionada.id);
    aoMudarPagamentos([...pagamentos, novo]);
    setNsu("");
    setAutorizacao("");
    setErroLocal(null);
    window.setTimeout(() => (forma === "DINHEIRO" ? recebidoRef : valorRef).current?.focus(), 30);
    return true;
  }

  function remover(chave: string) {
    if (pendente) return;
    const alvo = pagamentos.find((p) => p.chave === chave);
    if (alvo?.mp && confirmarRemocao !== chave) {
      setConfirmarRemocao(chave);
      setErroLocal(
        `Esse pagamento de ${formatarReais(alvo.valor)} foi cobrado na maquininha Mercado Pago. Clique de novo na lixeira pra tirar da venda; o valor continua no cartão do cliente e precisa ser estornado no painel do Mercado Pago.`,
      );
      return;
    }
    setConfirmarRemocao(null);
    setErroLocal(null);
    aoMudarPagamentos(pagamentos.filter((p) => p.chave !== chave));
  }

  /** Enter em qualquer campo ou clique em "Confirmar venda": adiciona o pagamento ou fecha a venda. */
  function submeter() {
    if (pendente || mpOcupado) return;
    if (excedente > 0) return;
    if (restante > 0) {
      // Com a integração Mercado Pago ativa, o cartão entra pela cobrança na maquininha ou pelo registro manual explícito.
      if (usaMaquininha) {
        setErroLocal("Cobre pela integração Mercado Pago ou clique em “Registrar manualmente”.");
        return;
      }
      adicionar();
      return;
    }
    // Conta fechada: com pagamentos, ou venda de total zero (100% de desconto, brinde) sem nenhum.
    aoConfirmar(pagamentos);
  }

  function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    submeter();
  }

  const trocoTotal = useMemo(
    () => pagamentos.reduce((a, p) => a + (p.forma === "DINHEIRO" && p.valorRecebido ? calcularTroco(p.valor, p.valorRecebido) : 0), 0),
    [pagamentos],
  );

  const pixReferencia = `UAY${sessaoId}${referenciaRef.current.slice(-8)}`.replace(/[^A-Za-z0-9]/g, "");

  return (
    <Dialogo
      aberto={aberto}
      aoFechar={() => {
        if (pendente || mpOcupado) return;
        aoFechar();
      }}
      titulo="Receber pagamento"
      descricao="Escolha a forma, confira o valor e confirme. Dá pra dividir em mais de uma forma."
      largura="xl"
    >
      <form
        onSubmit={aoSubmeter}
        onKeyDown={(e) => {
          // Esc não pode fechar o diálogo enquanto a venda grava ou a maquininha está cobrando.
          if (e.key === "Escape" && (pendente || mpOcupado)) e.preventDefault();
          // Enter em qualquer campo de texto adiciona/confirma, sem depender da submissão
          // implícita do form (o HTML só a faz com um único campo de texto no form).
          if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type !== "checkbox") {
            e.preventDefault();
            submeter();
          }
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-3 gap-3 rounded-padrao bg-superficie-2 p-3 text-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Total</p>
            <p className="text-2xl font-bold tabular text-texto">{formatarReais(total)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Já pago</p>
            <p className="text-2xl font-bold tabular text-texto">{formatarReais(somaPagamentos)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Falta</p>
            <p className={cn("text-2xl font-bold tabular", restante > 0 ? "text-alerta" : "text-sucesso")}>
              {formatarReais(restante)}
            </p>
          </div>
        </div>

        {erro ? <Aviso tom="perigo" titulo="A venda não foi registrada">{erro}</Aviso> : null}
        {excedente > 0 ? (
          <Aviso tom="perigo" titulo={`Os pagamentos passam do total em ${formatarReais(excedente)}`}>
            O total da venda caiu depois de lançar os pagamentos. Remova ou ajuste um pagamento pra somar exatamente{" "}
            {formatarReais(total)}.
          </Aviso>
        ) : null}
        {formas.length === 0 ? (
          <Aviso tom="perigo" titulo="Nenhuma forma de pagamento ativa">
            Ative pelo menos uma forma de pagamento em Configurações pra conseguir fechar vendas.
          </Aviso>
        ) : null}

        {pagamentos.length > 0 ? (
          <ul className="divide-y divide-borda rounded-padrao border border-borda">
            {pagamentos.map((p) => {
              const Icone = ICONE_FORMA[p.forma];
              return (
                <li key={p.chave} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Icone className="size-4 shrink-0 text-texto-fraco" aria-hidden />
                  <span className="flex-1 text-texto">
                    {ROTULO_FORMA_PAGAMENTO[p.forma]}
                    {p.forma === "CREDITO" && p.parcelas > 1 ? ` em ${p.parcelas}x` : ""}
                    {p.forma === "DINHEIRO" && p.valorRecebido && p.valorRecebido > p.valor
                      ? ` · recebido ${formatarReais(p.valorRecebido)}, troco ${formatarReais(calcularTroco(p.valor, p.valorRecebido))}`
                      : ""}
                    {p.maquininhaNome ? (
                      <Selo tom="info" className="ml-2">
                        {p.maquininhaNome}
                        {p.nsu ? ` · NSU ${p.nsu}` : ""}
                      </Selo>
                    ) : null}
                    {p.mp ? (
                      <Selo tom="sucesso" className="ml-2">
                        cobrado pela integração
                      </Selo>
                    ) : null}
                  </span>
                  <span className="font-semibold tabular text-texto">{formatarReais(p.valor)}</span>
                  <button
                    type="button"
                    onClick={() => remover(p.chave)}
                    disabled={pendente}
                    aria-label={confirmarRemocao === p.chave ? "Confirmar remoção do pagamento" : "Remover pagamento"}
                    className={cn(
                      "rounded-md p-1.5 hover:bg-perigo-suave hover:text-perigo disabled:opacity-40",
                      confirmarRemocao === p.chave ? "bg-perigo-suave text-perigo" : "text-texto-fraco",
                    )}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {erroLocal && (excedente > 0 || restante === 0) ? <Aviso tom="perigo">{erroLocal}</Aviso> : null}

        {excedente > 0 ? null : restante > 0 ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-texto-suave">Forma de pagamento</p>
              <div className="grid grid-cols-2 gap-2">
                {formas.map((f) => {
                  const Icone = ICONE_FORMA[f.forma];
                  const ativa = forma === f.forma;
                  return (
                    <button
                      key={f.forma}
                      type="button"
                      onClick={() => trocarForma(f.forma)}
                      disabled={mpOcupado || pendente}
                      aria-pressed={ativa}
                      className={cn(
                        "flex h-16 flex-col items-center justify-center gap-1 rounded-padrao border text-sm font-medium transition-colors disabled:opacity-50",
                        ativa
                          ? "border-primaria bg-primaria-suave text-primaria"
                          : "border-borda bg-superficie text-texto hover:bg-superficie-2",
                      )}
                    >
                      <Icone className="size-5" aria-hidden />
                      {ROTULO_FORMA_PAGAMENTO_CURTO[f.forma]}
                    </button>
                  );
                })}
              </div>
              {forma === "FIADO" ? (
                cliente ? (
                  <div className="rounded-padrao border border-borda bg-fundo p-3 text-sm">
                    <p className="font-medium text-texto">{cliente.nome}</p>
                    <p className="mt-1 text-xs text-texto-suave">
                      Deve {formatarReais(cliente.saldoFiado)} de {formatarReais(cliente.limiteFiado)} · disponível{" "}
                      <span className={cn("font-semibold", disponivelFiado >= valor ? "text-sucesso" : "text-perigo")}>
                        {formatarReais(disponivelFiado)}
                      </span>
                    </p>
                  </div>
                ) : (
                  <Aviso tom="alerta">Selecione o cliente no painel da direita antes de vender fiado.</Aviso>
                )
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <Campo rotulo="Valor deste pagamento" htmlFor="valor-pagamento">
                <EntradaCentavos
                  ref={valorRef}
                  id="valor-pagamento"
                  valor={valor}
                  aoMudar={setValor}
                  disabled={mpOcupado || pendente}
                  className="text-2xl font-semibold"
                />
              </Campo>

              {forma === "DINHEIRO" ? (
                <>
                  <Campo
                    rotulo="Valor recebido do cliente"
                    htmlFor="valor-recebido"
                    ajuda="Deixe vazio se o cliente entregou o valor exato."
                  >
                    <EntradaCentavos
                      ref={recebidoRef}
                      id="valor-recebido"
                      valor={valorRecebido}
                      aoMudar={setValorRecebido}
                      disabled={pendente}
                      className="text-2xl font-semibold"
                    />
                  </Campo>
                  <div className="flex items-center justify-between rounded-padrao bg-sucesso-suave px-4 py-3">
                    <span className="text-sm font-medium text-sucesso">Troco</span>
                    <span className="text-3xl font-bold tabular text-sucesso">{formatarReais(troco)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sugestoesNotas(valor).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setValorRecebido(n)}
                        className="rounded-md border border-borda bg-superficie px-2.5 py-1 text-xs tabular text-texto-suave hover:bg-superficie-2"
                      >
                        {formatarReais(n)}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {forma === "CREDITO" && maxParcelas > 1 ? (
                <Campo rotulo="Parcelas" htmlFor="parcelas">
                  <Selecao
                    id="parcelas"
                    value={parcelas}
                    disabled={mpOcupado || pendente}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                  >
                    {Array.from({ length: maxParcelas }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}x {n > 1 ? `de ${formatarReais(Math.round(valor / n))}` : "à vista"}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
              ) : null}

              {forma === "PIX" && temMaquininhas ? (
                <CaixaSelecao
                  rotulo="O Pix passou na maquininha (QR da maquininha, com a taxa dela)"
                  checked={pixNaMaquininha}
                  disabled={mpOcupado || pendente}
                  onChange={(e) => setPixNaMaquininha(e.target.checked)}
                />
              ) : null}

              {mostrarMaquininha ? (
                <div className="flex flex-col gap-2 rounded-padrao border border-borda bg-fundo p-3">
                  <p className="text-sm font-medium text-texto-suave">
                    {formaCartao ? "Em qual maquininha o cartão passou?" : "Em qual maquininha o Pix passou?"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {maquininhas.map((m) => {
                      const ativa = maquininhaSelecionada?.id === m.id;
                      const { taxaPercentual } = taxaDaMaquininha(m, forma, parcelas);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMaquininhaId(m.id)}
                          disabled={mpOcupado || pendente}
                          aria-pressed={ativa}
                          className={cn(
                            "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-padrao border px-2 py-2 text-center text-sm font-semibold transition-colors disabled:opacity-50",
                            ativa
                              ? "border-primaria bg-primaria-suave text-primaria"
                              : "border-borda bg-superficie text-texto hover:bg-superficie-2",
                          )}
                        >
                          <span className="flex max-w-full items-center gap-1.5">
                            <Smartphone className="size-4 shrink-0" aria-hidden />
                            <span className="truncate">{m.nome}</span>
                          </span>
                          <span className={cn("text-xs font-normal", ativa ? "text-primaria/80" : "text-texto-fraco")}>
                            taxa {formatarPercentual(taxaPercentual)}
                            {m.padrao ? " · padrão" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {taxaMaquininha ? (
                    <p className="text-xs text-texto-suave">
                      Taxa de {formatarPercentual(taxaMaquininha.taxaPercentual)} = {formatarReais(taxaMaquininha.taxaValor)}.
                      Você recebe{" "}
                      <span className="font-semibold text-texto">{formatarReais(valor - taxaMaquininha.taxaValor)}</span>.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Campo rotulo="NSU / Doc (opcional)" htmlFor="pagamento-nsu">
                      <Entrada
                        id="pagamento-nsu"
                        value={nsu}
                        onChange={(e) => setNsu(e.target.value)}
                        maxLength={40}
                        autoComplete="off"
                        inputMode="numeric"
                        placeholder="Do comprovante"
                        disabled={mpOcupado || pendente}
                        className="tabular"
                      />
                    </Campo>
                    <Campo rotulo="Autorização (opcional)" htmlFor="pagamento-autorizacao">
                      <Entrada
                        id="pagamento-autorizacao"
                        value={autorizacao}
                        onChange={(e) => setAutorizacao(e.target.value)}
                        maxLength={40}
                        autoComplete="off"
                        placeholder="Do comprovante"
                        disabled={mpOcupado || pendente}
                        className="tabular"
                      />
                    </Campo>
                  </div>
                </div>
              ) : null}

              {forma === "PIX" && config.pix && valor > 0 && !mostrarMaquininha ? (
                <PixQr pix={config.pix} valorCentavos={valor} referencia={pixReferencia} />
              ) : null}
              {forma === "PIX" && !config.pix && !mostrarMaquininha ? (
                <p className="text-xs text-texto-fraco">
                  Sem chave Pix configurada: o cliente paga pelo QR da sua conta e você só registra aqui.
                </p>
              ) : null}

              {usaMaquininha && valor > restante ? (
                <Aviso tom="alerta">
                  O valor passa do que falta pagar ({formatarReais(restante)}). Ajuste antes de cobrar na maquininha.
                </Aviso>
              ) : null}
              {usaMaquininha && valor > 0 && valor <= restante ? (
                <CobrancaMaquininha
                  key={`${forma}-${parcelas}-${valor}-${referenciaRef.current}`}
                  valorCentavos={valor}
                  tipo={forma === "CREDITO" ? "credit_card" : "debit_card"}
                  parcelas={forma === "CREDITO" ? parcelas : 1}
                  descricao={`${config.nomeLoja} · venda no caixa`}
                  referencia={referenciaRef.current}
                  aoAprovar={aoAprovarMp}
                  aoMudarOcupado={aoMudarOcupado}
                />
              ) : null}

              {erroLocal ? <Aviso tom="perigo">{erroLocal}</Aviso> : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {usaMaquininha ? (
                  <Botao
                    type="button"
                    variante="contorno"
                    tamanho="lg"
                    disabled={mpOcupado || pendente}
                    onClick={() => adicionar({ manual: true })}
                  >
                    Registrar manualmente
                  </Botao>
                ) : (
                  <Botao type="button" tamanho="lg" disabled={mpOcupado || pendente} onClick={() => adicionar()}>
                    <Wallet className="size-5" aria-hidden />
                    {valor >= restante ? "Adicionar e fechar a conta" : "Adicionar pagamento"}
                    <Tecla className="ml-1">Enter</Tecla>
                  </Botao>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-padrao border border-sucesso/30 bg-sucesso-suave p-4">
            <p className="text-base font-semibold text-sucesso">
              {total === 0 ? "Venda sem cobrança (total R$ 0,00). Tudo certo pra registrar e baixar o estoque." : "Conta fechada. Tudo certo pra registrar a venda."}
            </p>
            {trocoTotal > 0 ? (
              <p className="text-sm text-texto">
                Troco pro cliente: <span className="text-2xl font-bold tabular">{formatarReais(trocoTotal)}</span>
              </p>
            ) : null}
            <Botao ref={confirmarRef} type="submit" tamanho="xl" variante="destaque" pendente={pendente} className="w-full text-lg">
              Confirmar venda <Tecla className="ml-1 border-primaria/40 bg-transparent text-primaria">Enter</Tecla>
            </Botao>
          </div>
        )}
      </form>
    </Dialogo>
  );
}

/** Notas comuns pra preencher o "recebido" com um clique. */
function sugestoesNotas(valor: number): number[] {
  if (valor <= 0) return [];
  const notas = [200, 500, 1000, 2000, 5000, 10000, 20000];
  const proximas = notas.filter((n) => n >= valor).slice(0, 3);
  const exato = valor;
  const arredondado = Math.ceil(valor / 100) * 100;
  const lista = [exato, arredondado, ...proximas];
  return Array.from(new Set(lista)).filter((n) => n >= valor).slice(0, 5);
}
