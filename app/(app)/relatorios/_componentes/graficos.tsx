"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatarPercentual, formatarQuantidade, formatarReais } from "@/lib/dinheiro";

// Gráficos dos relatórios (recharts). Cores sempre via tokens do tema.

export type FormatoValor = "reais" | "inteiro" | "percentual" | "quantidade" | "decimal";

export const CORES_SERIE = [
  "var(--primaria)",
  "var(--acento)",
  "var(--info)",
  "var(--sucesso)",
  "var(--alerta)",
  "var(--perigo)",
  "var(--texto-fraco)",
] as const;

function formatarValor(valor: unknown, formato: FormatoValor): string {
  const n = typeof valor === "number" ? valor : Number(valor ?? 0);
  if (!Number.isFinite(n)) return "";
  switch (formato) {
    case "reais":
      return formatarReais(n);
    case "percentual":
      return formatarPercentual(n, 1);
    case "quantidade":
      return formatarQuantidade(n, n % 1000 === 0 ? "UN" : "KG");
    case "decimal":
      return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    default:
      return n.toLocaleString("pt-BR");
  }
}

/** Valor curto pro eixo: "R$ 1,2 mil", "12 mil", "3,4%". */
function formatarEixo(valor: unknown, formato: FormatoValor): string {
  const n = typeof valor === "number" ? valor : Number(valor ?? 0);
  if (!Number.isFinite(n)) return "";
  if (formato === "percentual") return `${Math.round(n / 100)}%`;
  if (formato === "reais") {
    const reais = n / 100;
    const abs = Math.abs(reais);
    if (abs >= 1_000_000) return `R$ ${(reais / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
    if (abs >= 1_000) return `R$ ${(reais / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
    return `R$ ${reais.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  }
  if (formato === "quantidade") return formatarQuantidade(n, "UN");
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString("pt-BR");
}

const ESTILO_EIXO = { fontSize: 12, fill: "var(--texto-suave)" } as const;

type Formatos = Record<string, { rotulo: string; formato: FormatoValor }>;

/** Caixa de dica padrão: título + uma linha por série, com cor e valor formatado. */
function DicaGrafico({
  active,
  payload,
  label,
  formatos,
  titulo,
  extras,
}: Pick<TooltipContentProps, "active" | "payload" | "label"> & {
  formatos: Formatos;
  titulo?: (datum: Record<string, unknown>) => string;
  extras?: (datum: Record<string, unknown>) => Array<{ rotulo: string; valor: string }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = (payload[0]?.payload ?? {}) as Record<string, unknown>;
  const cabecalho = titulo ? titulo(datum) : label;
  return (
    <div className="min-w-40 rounded-padrao border border-borda bg-superficie px-3 py-2 text-sm shadow-lg">
      {cabecalho !== undefined && cabecalho !== "" ? <p className="mb-1 font-medium text-texto">{String(cabecalho)}</p> : null}
      <ul className="space-y-0.5">
        {payload.map((entrada, i) => {
          const chave = String(entrada.dataKey ?? entrada.name ?? i);
          const def = formatos[chave];
          const cor = typeof entrada.color === "string" ? entrada.color : (entrada.payload as { fill?: string } | undefined)?.fill;
          return (
            <li key={chave} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-texto-suave">
                <span className="inline-block size-2.5 rounded-sm" style={{ background: cor ?? "var(--primaria)" }} aria-hidden />
                {def?.rotulo ?? String(entrada.name ?? chave)}
              </span>
              <span className="tabular font-medium text-texto">{formatarValor(entrada.value, def?.formato ?? "inteiro")}</span>
            </li>
          );
        })}
        {extras
          ? extras(datum).map((e) => (
              <li key={e.rotulo} className="flex items-center justify-between gap-4">
                <span className="text-texto-suave">{e.rotulo}</span>
                <span className="tabular font-medium text-texto">{e.valor}</span>
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}

function Vazio({ altura, mensagem }: { altura: number; mensagem: string }) {
  return (
    <div style={{ height: altura }} className="flex items-center justify-center rounded-padrao border border-dashed border-borda text-sm text-texto-fraco">
      {mensagem}
    </div>
  );
}

// ---------------------------------------------------------------- barras horizontais

export type DadoBarraHorizontal = {
  nome: string;
  valor: number;
  /** Linhas extras da dica (já formatadas). */
  extras?: Array<{ rotulo: string; valor: string }>;
};

/** Ranking em barras horizontais (top N). */
export function GraficoBarrasHorizontais({
  dados,
  formato = "reais",
  rotuloValor = "Receita",
  cor = "var(--primaria)",
  altura,
}: {
  dados: DadoBarraHorizontal[];
  formato?: FormatoValor;
  rotuloValor?: string;
  cor?: string;
  altura?: number;
}) {
  const alturaFinal = altura ?? Math.max(160, dados.length * 34 + 30);
  if (dados.length === 0) return <Vazio altura={alturaFinal} mensagem="Sem dados no período." />;
  return (
    <ResponsiveContainer width="100%" height={alturaFinal}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="var(--borda)" strokeDasharray="3 3" />
        <XAxis type="number" tick={ESTILO_EIXO} tickLine={false} axisLine={false} tickFormatter={(v) => formatarEixo(v, formato)} />
        <YAxis
          type="category"
          dataKey="nome"
          width={150}
          tick={{ ...ESTILO_EIXO, fill: "var(--texto)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: "var(--superficie-2)" }}
          content={(p) => (
            <DicaGrafico
              {...p}
              formatos={{ valor: { rotulo: rotuloValor, formato } }}
              titulo={(d) => String(d.nome ?? "")}
              extras={(d) => (Array.isArray(d.extras) ? (d.extras as Array<{ rotulo: string; valor: string }>) : [])}
            />
          )}
        />
        <Bar dataKey="valor" fill={cor} radius={[0, 6, 6, 0]} maxBarSize={26} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- linha diária

export type DadoLinhaDiaria = { rotulo: string; receita: number; lucroBruto: number; vendas: number };

/** Receita x lucro bruto por dia. */
export function GraficoLinhaDiaria({ dados, altura = 280 }: { dados: DadoLinhaDiaria[]; altura?: number }) {
  if (dados.length === 0) return <Vazio altura={altura} mensagem="Sem dados no período." />;
  const intervalo = dados.length > 45 ? Math.ceil(dados.length / 15) - 1 : dados.length > 20 ? 1 : 0;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--borda)" strokeDasharray="3 3" />
        <XAxis dataKey="rotulo" tick={ESTILO_EIXO} tickLine={false} axisLine={{ stroke: "var(--borda)" }} interval={intervalo} />
        <YAxis tick={ESTILO_EIXO} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => formatarEixo(v, "reais")} />
        <Tooltip
          cursor={{ stroke: "var(--borda)" }}
          content={(p) => (
            <DicaGrafico
              {...p}
              formatos={{
                receita: { rotulo: "Receita", formato: "reais" },
                lucroBruto: { rotulo: "Lucro antes das taxas", formato: "reais" },
              }}
              extras={(d) => [{ rotulo: "Vendas", valor: String(d.vendas ?? 0) }]}
            />
          )}
        />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
          formatter={(valor: string) => (valor === "receita" ? "Receita" : "Lucro antes das taxas")}
        />
        <Line type="monotone" dataKey="receita" stroke="var(--primaria)" strokeWidth={2.5} dot={dados.length <= 31} activeDot={{ r: 5 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="lucroBruto" stroke="var(--acento)" strokeWidth={2.5} dot={dados.length <= 31} activeDot={{ r: 5 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- rosca

export type DadoRosca = { nome: string; valor: number };

/** Participação em rosca com legenda à direita. */
export function GraficoRosca({ dados, formato = "reais", altura = 260 }: { dados: DadoRosca[]; formato?: FormatoValor; altura?: number }) {
  const validos = dados.filter((d) => d.valor > 0);
  if (validos.length === 0) return <Vazio altura={altura} mensagem="Sem dados no período." />;
  const total = validos.reduce((s, d) => s + d.valor, 0);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Pie
          data={validos}
          dataKey="valor"
          nameKey="nome"
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
          stroke="var(--superficie)"
          isAnimationActive={false}
        >
          {validos.map((d, i) => (
            <Cell key={d.nome} fill={CORES_SERIE[i % CORES_SERIE.length]} />
          ))}
        </Pie>
        <Tooltip
          content={(p) => (
            <DicaGrafico
              {...p}
              formatos={{ valor: { rotulo: "Valor", formato } }}
              titulo={(d) => String(d.nome ?? "")}
              extras={(d) => [{ rotulo: "Participação", valor: total > 0 ? formatarPercentual(Math.round((Number(d.valor) / total) * 10000), 1) : "0%" }]}
            />
          )}
        />
        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, lineHeight: "22px" }}
          formatter={(nome: string) => {
            const d = validos.find((x) => x.nome === nome);
            const pct = d && total > 0 ? formatarPercentual(Math.round((d.valor / total) * 10000), 0) : "";
            return `${nome} ${pct}`;
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- barras verticais

export type DadoBarra = {
  rotulo: string;
  valor: number;
  /** Segundo valor, mostrado só na dica. */
  secundario?: number;
};

/** Barras verticais simples (horas, dias da semana, categorias). Destaca a maior. */
export function GraficoBarras({
  dados,
  formato = "inteiro",
  rotuloValor = "Vendas",
  rotuloSecundario,
  formatoSecundario = "reais",
  altura = 240,
  destacarMaior = true,
}: {
  dados: DadoBarra[];
  formato?: FormatoValor;
  rotuloValor?: string;
  rotuloSecundario?: string;
  formatoSecundario?: FormatoValor;
  altura?: number;
  destacarMaior?: boolean;
}) {
  if (dados.length === 0 || dados.every((d) => d.valor === 0)) return <Vazio altura={altura} mensagem="Sem dados no período." />;
  const maior = Math.max(...dados.map((d) => d.valor));
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={dados.length > 12 ? 2 : 8}>
        <CartesianGrid vertical={false} stroke="var(--borda)" strokeDasharray="3 3" />
        <XAxis dataKey="rotulo" tick={ESTILO_EIXO} tickLine={false} axisLine={{ stroke: "var(--borda)" }} interval={dados.length > 12 ? 1 : 0} />
        <YAxis tick={ESTILO_EIXO} tickLine={false} axisLine={false} width={formato === "reais" ? 72 : 40} allowDecimals={false} tickFormatter={(v) => formatarEixo(v, formato)} />
        <Tooltip
          cursor={{ fill: "var(--superficie-2)" }}
          content={(p) => (
            <DicaGrafico
              {...p}
              formatos={{ valor: { rotulo: rotuloValor, formato } }}
              extras={(d) =>
                rotuloSecundario && typeof d.secundario === "number" ? [{ rotulo: rotuloSecundario, valor: formatarValor(d.secundario, formatoSecundario) }] : []
              }
            />
          )}
        />
        <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={false}>
          {dados.map((d) => (
            <Cell key={d.rotulo} fill={destacarMaior && d.valor === maior && maior > 0 ? "var(--acento)" : "var(--primaria)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- pareto (ABC)

export type DadoPareto = { nome: string; participacaoBp: number; acumuladoBp: number; classe: "A" | "B" | "C" };

const COR_CLASSE: Record<DadoPareto["classe"], string> = {
  A: "var(--primaria)",
  B: "var(--acento)",
  C: "var(--texto-fraco)",
};

/** Barras de participação por produto com a linha do acumulado (curva ABC). */
export function GraficoPareto({ dados, altura = 300 }: { dados: DadoPareto[]; altura?: number }) {
  if (dados.length === 0) return <Vazio altura={altura} mensagem="Sem vendas no período." />;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke="var(--borda)" strokeDasharray="3 3" />
        <XAxis dataKey="nome" tick={false} tickLine={false} axisLine={{ stroke: "var(--borda)" }} label={{ value: "Produtos, do que mais vende pro que menos vende", position: "insideBottom", offset: -2, fontSize: 12, fill: "var(--texto-fraco)" }} height={28} />
        <YAxis yAxisId="barras" tick={ESTILO_EIXO} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatarEixo(v, "percentual")} />
        <YAxis yAxisId="linha" orientation="right" domain={[0, 10000]} ticks={[0, 2500, 5000, 8000, 9500, 10000]} tick={ESTILO_EIXO} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatarEixo(v, "percentual")} />
        <Tooltip
          cursor={{ fill: "var(--superficie-2)" }}
          content={(p) => (
            <DicaGrafico
              {...p}
              formatos={{
                participacaoBp: { rotulo: "Participação", formato: "percentual" },
                acumuladoBp: { rotulo: "Acumulado", formato: "percentual" },
              }}
              titulo={(d) => `${String(d.nome ?? "")} (classe ${String(d.classe ?? "")})`}
            />
          )}
        />
        <Bar yAxisId="barras" dataKey="participacaoBp" isAnimationActive={false} maxBarSize={24}>
          {dados.map((d) => (
            <Cell key={d.nome} fill={COR_CLASSE[d.classe]} />
          ))}
        </Bar>
        <Line yAxisId="linha" type="monotone" dataKey="acumuladoBp" stroke="var(--info)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
