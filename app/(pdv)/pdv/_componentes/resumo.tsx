"use client";

import { forwardRef, useEffect, useRef, useState, type RefObject } from "react";
import { CheckCircle2, Loader2, UserRound, UserRoundX } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Entrada } from "@/components/ui/campo";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import type { ModoDesconto, TotaisCarrinho } from "@/lib/servicos/vendas-calculos";
import { cn, formatarCpf, formatarTelefone } from "@/lib/utils";
import { buscarClientes } from "../actions";
import { EntradaCentavos } from "./entrada-centavos";
import { Tecla } from "./util";
import type { ClientePdv, PagamentoUi } from "./tipos";

export function Resumo({
  totais,
  quantidadeItens,
  descontoModo,
  descontoValor,
  aoMudarDescontoModo,
  aoMudarDescontoValor,
  descontoRef,
  permitirDesconto,
  limiteDescontoCentavos,
  tetoBp,
  cliente,
  aoMudarCliente,
  pagamentosGuardados,
  aoFinalizar,
  aoConcluirEdicao,
}: {
  totais: TotaisCarrinho;
  quantidadeItens: number;
  descontoModo: ModoDesconto;
  /** VALOR: centavos; PERCENTUAL: pontos-base */
  descontoValor: number;
  aoMudarDescontoModo: (modo: ModoDesconto) => void;
  aoMudarDescontoValor: (valor: number) => void;
  descontoRef: RefObject<HTMLInputElement | null>;
  permitirDesconto: boolean;
  limiteDescontoCentavos: number | null;
  tetoBp: number | null;
  cliente: ClientePdv | null;
  aoMudarCliente: (cliente: ClientePdv | null) => void;
  /** pagamentos já lançados no diálogo de finalização (ficam guardados se ele for fechado) */
  pagamentosGuardados: PagamentoUi[];
  aoFinalizar: () => void;
  aoConcluirEdicao: () => void;
}) {
  const podeFinalizar = quantidadeItens > 0;
  const somaGuardada = pagamentosGuardados.reduce((a, p) => a + p.valor, 0);
  const temCobrancaMp = pagamentosGuardados.some((p) => p.mp);

  return (
    <aside className="flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-borda bg-superficie p-4 lg:w-[380px] xl:w-[420px]">
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-texto-suave">
            Itens <span className="text-texto-fraco">({quantidadeItens})</span>
          </dt>
          <dd className="tabular text-texto">{formatarReais(totais.bruto)}</dd>
        </div>
        {totais.descontoItens > 0 ? (
          <div className="flex items-center justify-between">
            <dt className="text-texto-suave">Descontos nos itens</dt>
            <dd className="tabular text-perigo">- {formatarReais(totais.descontoItens)}</dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <dt className="text-texto-suave">Subtotal</dt>
          <dd className="tabular font-medium text-texto">{formatarReais(totais.subtotal)}</dd>
        </div>
      </dl>

      <div className="rounded-padrao border border-borda bg-fundo p-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="desconto-geral" className="text-sm font-medium text-texto-suave">
            Desconto geral <Tecla>F8</Tecla>
          </label>
          <div className="inline-flex rounded-md border border-borda bg-superficie p-0.5 text-xs">
            {(["VALOR", "PERCENTUAL"] as ModoDesconto[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={!permitirDesconto}
                onClick={() => aoMudarDescontoModo(m)}
                className={cn(
                  "rounded px-2 py-1 font-medium transition-colors disabled:opacity-50",
                  descontoModo === m ? "bg-primaria text-primaria-texto" : "text-texto-suave hover:bg-superficie-2",
                )}
              >
                {m === "VALOR" ? "R$" : "%"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          {descontoModo === "VALOR" ? (
            <EntradaCentavos
              ref={descontoRef}
              id="desconto-geral"
              valor={descontoValor}
              aoMudar={aoMudarDescontoValor}
              disabled={!permitirDesconto}
              tamanho="md"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  aoConcluirEdicao();
                }
              }}
            />
          ) : (
            <EntradaPercentual
              ref={descontoRef}
              id="desconto-geral"
              pontosBase={descontoValor}
              aoMudar={aoMudarDescontoValor}
              disabled={!permitirDesconto}
              aoConcluir={aoConcluirEdicao}
            />
          )}
        </div>
        <p className="mt-1.5 text-xs text-texto-fraco">
          {!permitirDesconto
            ? "Seu perfil não pode dar desconto."
            : limiteDescontoCentavos !== null && tetoBp !== null
              ? `Máximo pro seu perfil: ${formatarPercentual(tetoBp)} (${formatarReais(limiteDescontoCentavos)}), somando itens e geral.`
              : totais.descontoGeral > 0
                ? `Desconto aplicado: ${formatarReais(totais.descontoGeral)}`
                : "Em R$ ou % sobre o subtotal."}
        </p>
      </div>

      <div className="faixas-marca-baixo relative overflow-hidden rounded-padrao bg-primaria px-4 py-4 text-primaria-texto shadow-padrao">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-acento">Total a pagar</p>
        <p className="fonte-marca mt-1 text-5xl font-extrabold italic leading-none tabular xl:text-6xl">{formatarReais(totais.total)}</p>
        {totais.descontoTotal > 0 ? (
          <p className="mt-2 text-sm opacity-90">Desconto total: {formatarReais(totais.descontoTotal)}</p>
        ) : null}
      </div>

      <SelecaoCliente cliente={cliente} aoMudar={aoMudarCliente} aoConcluirEdicao={aoConcluirEdicao} />

      {pagamentosGuardados.length > 0 ? (
        <Aviso tom={temCobrancaMp ? "alerta" : "info"} titulo={`${pagamentosGuardados.length === 1 ? "Pagamento já lançado" : "Pagamentos já lançados"}: ${formatarReais(somaGuardada)}`}>
          {temCobrancaMp
            ? "Inclui cobrança aprovada na maquininha Mercado Pago. Finalize a venda pra registrar; não cobre o cartão de novo."
            : "Finalize a venda pra registrar. Eles aparecem de novo na tela de pagamento."}
        </Aviso>
      ) : null}

      <div className="mt-auto">
        <Botao tamanho="xl" variante="destaque" className="w-full text-xl" disabled={!podeFinalizar} onClick={aoFinalizar}>
          <CheckCircle2 className="size-6" aria-hidden />
          Finalizar venda
          <Tecla className="ml-1 border-primaria/40 bg-transparent text-primaria">F10</Tecla>
        </Botao>
      </div>
    </aside>
  );
}


/** Percentual digitado como "10" ou "7,5" -> pontos-base. */
const EntradaPercentual = forwardRef<
  HTMLInputElement,
  {
    id?: string;
    pontosBase: number;
    aoMudar: (bp: number) => void;
    disabled?: boolean;
    aoConcluir: () => void;
  }
>(function EntradaPercentual({ id, pontosBase, aoMudar, disabled, aoConcluir }, ref) {
  const [texto, setTexto] = useState(pontosBase > 0 ? (pontosBase / 100).toString().replace(".", ",") : "");
  useEffect(() => {
    if (pontosBase === 0) setTexto("");
  }, [pontosBase]);
  return (
    <div className="relative">
      <Entrada
        ref={ref}
        id={id}
        value={texto}
        disabled={disabled}
        inputMode="decimal"
        placeholder="0"
        className="pr-8 text-right tabular"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d,.]/g, "").slice(0, 6);
          setTexto(v);
          const n = parseFloat(v.replace(",", "."));
          aoMudar(Number.isFinite(n) && n > 0 ? Math.min(10000, Math.round(n * 100)) : 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            aoConcluir();
          }
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-texto-fraco">%</span>
    </div>
  );
});

function SelecaoCliente({
  cliente,
  aoMudar,
  aoConcluirEdicao,
}: {
  cliente: ClientePdv | null;
  aoMudar: (c: ClientePdv | null) => void;
  aoConcluirEdicao: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ClientePdv[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [indice, setIndice] = useState(0);
  const ultima = useRef(0);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) {
      // Invalida a busca em voo: a resposta do termo anterior não pode reabrir a lista.
      ++ultima.current;
      setCarregando(false);
      setResultados([]);
      setAberto(false);
      return;
    }
    const id = ++ultima.current;
    const timer = window.setTimeout(async () => {
      setCarregando(true);
      const r = await buscarClientes(t);
      if (id !== ultima.current) return;
      setCarregando(false);
      if (r.ok) {
        setResultados(r.dados);
        setIndice(0);
        setAberto(true);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [termo]);

  function escolher(c: ClientePdv) {
    aoMudar(c);
    setTermo("");
    setAberto(false);
    aoConcluirEdicao();
  }

  if (cliente) {
    const disponivel = Math.max(0, cliente.limiteFiado - cliente.saldoFiado);
    return (
      <div className="rounded-padrao border border-borda p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primaria-suave text-primaria">
              <UserRound className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-texto">{cliente.nome}</p>
              <p className="truncate text-xs text-texto-fraco">
                {[cliente.cpf ? formatarCpf(cliente.cpf) : null, cliente.telefone ? formatarTelefone(cliente.telefone) : null]
                  .filter(Boolean)
                  .join(" · ") || "sem CPF ou telefone"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              aoMudar(null);
              aoConcluirEdicao();
            }}
            aria-label="Remover cliente da venda"
            className="rounded-md p-1.5 text-texto-fraco hover:bg-superficie-2 hover:text-perigo"
          >
            <UserRoundX className="size-4" aria-hidden />
          </button>
        </div>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-texto-fraco">Deve (fiado)</dt>
            <dd className={cn("tabular font-medium", cliente.saldoFiado > 0 ? "text-alerta" : "text-texto")}>
              {formatarReais(cliente.saldoFiado)}
            </dd>
          </div>
          <div>
            <dt className="text-texto-fraco">Limite</dt>
            <dd className="tabular font-medium text-texto">{formatarReais(cliente.limiteFiado)}</dd>
          </div>
          <div>
            <dt className="text-texto-fraco">Disponível</dt>
            <dd className={cn("tabular font-medium", disponivel > 0 ? "text-sucesso" : "text-perigo")}>
              {cliente.limiteFiado > 0 ? formatarReais(disponivel) : "sem fiado"}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="relative">
      <label htmlFor="busca-cliente" className="mb-1 block text-sm font-medium text-texto-suave">
        Cliente <span className="font-normal text-texto-fraco">(opcional, obrigatório pra fiado)</span>
      </label>
      <div className="relative">
        <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
        <Entrada
          id="busca-cliente"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => resultados.length && setAberto(true)}
          onBlur={() => window.setTimeout(() => setAberto(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setTermo("");
              setAberto(false);
              aoConcluirEdicao();
              return;
            }
            if (!aberto || resultados.length === 0) {
              if (e.key === "Enter") e.preventDefault();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndice((i) => (i + 1) % resultados.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndice((i) => (i - 1 + resultados.length) % resultados.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              escolher(resultados[indice]);
            }
          }}
          placeholder="Nome, CPF ou telefone"
          autoComplete="off"
          className="pl-9"
        />
        {carregando ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-texto-fraco" aria-hidden />
        ) : null}
      </div>
      {aberto ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-padrao border border-borda bg-superficie shadow-lg"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-3 text-sm text-texto-fraco">Nenhum cliente encontrado.</li>
          ) : (
            resultados.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === indice}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(c)}
                  onMouseEnter={() => setIndice(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                    i === indice ? "bg-primaria-suave" : "hover:bg-superficie-2",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-texto">{c.nome}</span>
                    <span className="block text-xs text-texto-fraco">
                      {[c.cpf ? formatarCpf(c.cpf) : null, c.telefone ? formatarTelefone(c.telefone) : null]
                        .filter(Boolean)
                        .join(" · ") || "sem CPF ou telefone"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className="block text-texto-fraco">deve {formatarReais(c.saldoFiado)}</span>
                    <span className="block text-texto-suave">limite {formatarReais(c.limiteFiado)}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
