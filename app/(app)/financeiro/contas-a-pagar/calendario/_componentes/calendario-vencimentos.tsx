"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Repeat } from "lucide-react";
import type { StatusConta } from "@prisma/client";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import { formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import { agruparPorDia, rotuloRecorrencia, type GradeMes } from "@/lib/servicos/financeiro-calculos";
import { SeloDias } from "../../../_componentes/selo-dias";

export type ContaCalendario = {
  id: number;
  dia: number;
  descricao: string;
  valor: number;
  status: StatusConta;
  dias: number;
  vencimentoFormatado: string;
  fornecedorNome: string | null;
  categoriaNome: string | null;
  recorrenciaMensal: boolean;
  diaVencimento: number | null;
  parcela: string;
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type TomDia = "atrasado" | "hoje" | "pendente" | "pago" | "vazio";

function tomDoDia(itens: ContaCalendario[], ehHoje: boolean): TomDia {
  if (!itens.length) return ehHoje ? "hoje" : "vazio";
  const pendentes = itens.filter((c) => c.status === "PENDENTE");
  if (pendentes.some((c) => c.dias < 0)) return "atrasado";
  if (ehHoje || pendentes.some((c) => c.dias === 0)) return "hoje";
  if (pendentes.length) return "pendente";
  return "pago";
}

const ESTILO_DIA: Record<TomDia, string> = {
  atrasado: "border-perigo/40 bg-perigo-suave/60 hover:bg-perigo-suave",
  hoje: "border-alerta/50 bg-alerta-suave/60 hover:bg-alerta-suave",
  pendente: "border-primaria/30 bg-primaria-suave/60 hover:bg-primaria-suave",
  pago: "border-sucesso/30 bg-sucesso-suave/50 hover:bg-sucesso-suave",
  vazio: "border-borda bg-superficie hover:bg-superficie-2",
};

/** Grade do mês com o total a pagar por dia; clique no dia pra ver as contas. */
export function CalendarioVencimentos({
  grade,
  contas,
  diaDeHoje,
  rotuloMes,
}: {
  grade: GradeMes;
  contas: ContaCalendario[];
  diaDeHoje: number | null; // dia do mês se o mês em tela é o atual
  rotuloMes: string;
}) {
  const grupos = useMemo(() => agruparPorDia(contas), [contas]);
  const porDia = useMemo(() => new Map(grupos.map((g) => [g.dia, g])), [grupos]);

  const diaInicial = useMemo(() => {
    if (diaDeHoje !== null && porDia.has(diaDeHoje)) return diaDeHoje;
    const proximoPendente = grupos.find((g) => g.itens.some((c) => c.status === "PENDENTE") && (diaDeHoje === null || g.dia >= diaDeHoje));
    return proximoPendente?.dia ?? grupos[0]?.dia ?? diaDeHoje;
  }, [diaDeHoje, grupos, porDia]);

  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(diaInicial);
  const selecionado = diaSelecionado !== null ? porDia.get(diaSelecionado) : undefined;

  const totalPendente = contas.filter((c) => c.status === "PENDENTE").reduce((acc, c) => acc + c.valor, 0);
  const totalPago = contas.filter((c) => c.status === "PAGA").reduce((acc, c) => acc + c.valor, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Cartao className="xl:col-span-2">
        <CartaoCabecalho
          titulo={<span className="capitalize">{rotuloMes}</span>}
          descricao={`${contas.length} ${contas.length === 1 ? "conta" : "contas"} · a pagar ${formatarReais(totalPendente)} · pago ${formatarReais(totalPago)}`}
          acoes={
            <div className="hidden items-center gap-3 text-xs text-texto-suave sm:flex">
              <Legenda cor="bg-perigo" texto="Atrasada" />
              <Legenda cor="bg-alerta" texto="Hoje" />
              <Legenda cor="bg-primaria" texto="A vencer" />
              <Legenda cor="bg-sucesso" texto="Paga" />
            </div>
          }
        />
        <CartaoConteudo>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {grade.semanas.flat().map((dia, i) => {
              if (dia === null) return <div key={`vazio-${i}`} className="min-h-20 rounded-md border border-transparent" aria-hidden />;
              const grupo = porDia.get(dia);
              const itens = grupo?.itens ?? [];
              const ehHoje = diaDeHoje === dia;
              const tom = tomDoDia(itens, ehHoje);
              const ativo = diaSelecionado === dia;
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => setDiaSelecionado(dia)}
                  aria-pressed={ativo}
                  aria-label={`Dia ${dia}${grupo ? `, ${itens.length} ${itens.length === 1 ? "conta" : "contas"}, ${formatarReais(grupo.total)}` : ", sem contas"}`}
                  className={cn(
                    "flex min-h-20 flex-col items-stretch justify-between rounded-md border p-1.5 text-left transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primaria",
                    ESTILO_DIA[tom],
                    ativo && "ring-2 ring-primaria ring-offset-1",
                  )}
                >
                  <span className={cn("text-xs font-semibold tabular", ehHoje ? "text-alerta" : "text-texto-suave")}>
                    {dia}
                    {ehHoje ? <span className="ml-1 font-normal">hoje</span> : null}
                  </span>
                  {grupo ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="truncate text-xs font-semibold tabular text-texto">{formatarReais(grupo.total, false)}</span>
                      <span className="text-[11px] text-texto-suave">
                        {itens.length} {itens.length === 1 ? "conta" : "contas"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-texto-fraco">-</span>
                  )}
                </button>
              );
            })}
          </div>
        </CartaoConteudo>
      </Cartao>

      <Cartao className="self-start">
        <CartaoCabecalho
          titulo={diaSelecionado !== null ? `Dia ${diaSelecionado}` : "Escolha um dia"}
          descricao={selecionado ? `${selecionado.itens.length} ${selecionado.itens.length === 1 ? "conta" : "contas"} · ${formatarReais(selecionado.total)}` : "Clique em um dia da grade pra ver as contas."}
        />
        <CartaoConteudo className="p-0">
          {selecionado ? (
            <ul className="divide-y divide-borda">
              {selecionado.itens.map((c) => (
                <li key={c.id} className="flex flex-col gap-1.5 px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-texto">
                        <span className="truncate">{c.descricao}</span>
                        {c.parcela ? <span className="shrink-0 text-xs text-texto-suave">({c.parcela})</span> : null}
                        {c.recorrenciaMensal ? <Repeat className="size-3.5 shrink-0 text-texto-fraco" aria-label={`Repete ${rotuloRecorrencia(c.diaVencimento)}`} /> : null}
                      </span>
                      <span className="block truncate text-xs text-texto-fraco">{[c.fornecedorNome, c.categoriaNome].filter(Boolean).join(" · ") || "Sem fornecedor"}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular text-texto">{formatarReais(c.valor)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <SeloDias dias={c.dias} status={c.status} />
                    {c.status === "PENDENTE" ? (
                      <Link href="/financeiro/contas-a-pagar" className="text-xs text-primaria underline-offset-2 hover:underline">
                        Pagar na lista
                      </Link>
                    ) : c.status === "PAGA" ? (
                      <Selo tom="sucesso">Paga</Selo>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-texto-fraco">
              {diaSelecionado !== null ? "Nenhuma conta vence neste dia." : "Nenhum dia selecionado."}
            </p>
          )}
        </CartaoConteudo>
      </Cartao>
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-full", cor)} aria-hidden />
      {texto}
    </span>
  );
}
