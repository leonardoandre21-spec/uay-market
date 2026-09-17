"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatarReais } from "@/lib/dinheiro";
import { formatarEixoReais } from "./formatos-grafico";

export type PontoGrafico = {
  dia: string;
  rotulo: string;
  receita: number;
  lucroBruto: number;
  vendas: number;
};

function Dica({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const ponto = payload[0]?.payload as PontoGrafico | undefined;
  if (!ponto) return null;
  return (
    <div className="rounded-padrao border border-borda bg-superficie px-3 py-2 text-sm shadow-padrao">
      <p className="font-medium text-texto">{ponto.rotulo}</p>
      <dl className="mt-1 space-y-0.5 text-texto-suave">
        <div className="flex justify-between gap-4">
          <dt className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-sm bg-primaria" aria-hidden /> Receita
          </dt>
          <dd className="tabular text-texto">{formatarReais(ponto.receita)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-sm bg-acento" aria-hidden /> Lucro bruto
          </dt>
          <dd className="tabular text-texto">{formatarReais(ponto.lucroBruto)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Cupons</dt>
          <dd className="tabular text-texto">{ponto.vendas}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Receita e lucro bruto por dia (últimos 30 dias), com linha da meta diária quando existir. */
export function GraficoReceitaDiaria({ dados, metaDiaria }: { dados: PontoGrafico[]; metaDiaria: number | null }) {
  const temMovimento = dados.some((d) => d.receita !== 0 || d.lucroBruto !== 0);
  if (!temMovimento) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-texto-fraco">
        Nenhuma venda registrada nos últimos 30 dias.
      </div>
    );
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 288 }}>
        <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke="var(--borda)" />
          <XAxis
            dataKey="rotulo"
            tick={{ fontSize: 11, fill: "var(--texto-fraco)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--borda)" }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickFormatter={formatarEixoReais}
            tick={{ fontSize: 11, fill: "var(--texto-fraco)" }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip content={Dica} cursor={{ fill: "var(--superficie-2)" }} />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="square"
            iconSize={10}
            wrapperStyle={{ fontSize: 12, color: "var(--texto-suave)", paddingBottom: 8 }}
          />
          {metaDiaria ? (
            <ReferenceLine
              y={metaDiaria}
              stroke="var(--texto-fraco)"
              strokeDasharray="4 4"
              label={{ value: "Meta do dia", position: "insideTopRight", fontSize: 11, fill: "var(--texto-fraco)" }}
            />
          ) : null}
          <Bar dataKey="receita" name="Receita" fill="var(--primaria)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line
            type="monotone"
            dataKey="lucroBruto"
            name="Lucro bruto"
            stroke="var(--acento)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--superficie)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
