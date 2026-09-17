"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import { formatarEixoReais } from "./formatos-grafico";

export type PontoMes = {
  chave: string;
  rotulo: string; // "setembro de 2026"
  rotuloCurto: string; // "set/26"
  receita: number;
  lucroLiquido: number;
};

function Dica({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const ponto = payload[0]?.payload as PontoMes | undefined;
  if (!ponto) return null;
  const prejuizo = ponto.lucroLiquido < 0;
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
            <span className={cn("inline-block size-2 rounded-sm", prejuizo ? "bg-perigo" : "bg-acento")} aria-hidden />
            {prejuizo ? "Prejuízo" : "Lucro líquido"}
          </dt>
          <dd className={cn("tabular", prejuizo ? "text-perigo" : "text-texto")}>{formatarReais(ponto.lucroLiquido)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Receita e lucro líquido dos últimos meses em barras lado a lado. Prejuízo aparece em vermelho, abaixo de zero. */
export function GraficoMeses({ dados }: { dados: PontoMes[] }) {
  const temMovimento = dados.some((d) => d.receita !== 0 || d.lucroLiquido !== 0);
  if (!temMovimento) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-texto-fraco">
        Ainda não há movimento nos últimos meses.
      </div>
    );
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 288 }}>
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%" barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--borda)" />
          <XAxis
            dataKey="rotuloCurto"
            tick={{ fontSize: 12, fill: "var(--texto-fraco)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--borda)" }}
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
          <ReferenceLine y={0} stroke="var(--texto-fraco)" />
          <Bar dataKey="receita" name="Receita" fill="var(--primaria)" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Bar dataKey="lucroLiquido" name="Lucro líquido" fill="var(--acento)" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {dados.map((d) => (
              <Cell key={d.chave} fill={d.lucroLiquido < 0 ? "var(--perigo)" : "var(--acento)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
