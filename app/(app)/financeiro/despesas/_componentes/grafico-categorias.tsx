"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatarReais } from "@/lib/dinheiro";
import { truncar } from "@/lib/utils";

export type DadoCategoria = { categoria: string; total: number; quantidade: number };

/** Barras horizontais: total gasto por categoria no mês. A maior ganha a cor de destaque. */
export function GraficoCategorias({ dados }: { dados: DadoCategoria[] }) {
  if (!dados.length) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-texto-fraco">
        Sem despesas neste mês pra montar o gráfico.
      </div>
    );
  }
  const visiveis = dados.slice(0, 8).map((d) => ({ ...d, rotulo: truncar(d.categoria, 18) }));
  const altura = Math.max(200, 36 * visiveis.length + 40);

  return (
    <div style={{ height: altura }} role="img" aria-label="Gráfico de despesas por categoria">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={visiveis} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--borda)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatarReais(v, false)}
            tick={{ fill: "var(--texto-fraco)", fontSize: 11 }}
            axisLine={{ stroke: "var(--borda)" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="rotulo"
            width={120}
            tick={{ fill: "var(--texto-suave)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--superficie-2)" }}
            contentStyle={{
              background: "var(--superficie)",
              border: "1px solid var(--borda)",
              borderRadius: "var(--raio)",
              boxShadow: "var(--sombra)",
              fontSize: 12,
              padding: "8px 10px",
            }}
            labelStyle={{ color: "var(--texto)", fontWeight: 600, marginBottom: 2 }}
            itemStyle={{ color: "var(--texto-suave)" }}
            formatter={(valor, _nome, item) => {
              const qtd = (item?.payload as DadoCategoria | undefined)?.quantidade ?? 0;
              return [`${formatarReais(Number(valor ?? 0))} em ${qtd} ${qtd === 1 ? "lançamento" : "lançamentos"}`, "Total"];
            }}
            labelFormatter={(_rotulo, payload) => (payload?.[0]?.payload as DadoCategoria | undefined)?.categoria ?? String(_rotulo)}
          />
          <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={28} isAnimationActive={false}>
            {visiveis.map((d, i) => (
              <Cell key={d.categoria} fill={i === 0 ? "var(--acento)" : "var(--primaria)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
