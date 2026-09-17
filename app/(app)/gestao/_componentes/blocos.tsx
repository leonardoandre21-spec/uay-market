// Blocos visuais de servidor usados no painel e no fechamento (sem interação).
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Cartao } from "@/components/ui/cartao";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO_CURTO } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import type { ProgressoMeta } from "@/lib/servicos/gestao-calculos";
import type { ResumoForma } from "@/lib/servicos/gestao";

/** Valor monetário colorido pelo sinal: lucro verde, prejuízo vermelho. */
export function ValorResultado({ centavos, className }: { centavos: number; className?: string }) {
  return (
    <span className={cn("tabular", centavos > 0 ? "text-sucesso" : centavos < 0 ? "text-perigo" : "text-texto", className)}>
      {formatarReais(centavos)}
    </span>
  );
}

/** Barra de progresso da meta mensal. */
export function BarraMeta({ progresso }: { progresso: ProgressoMeta }) {
  const largura = progresso.percentualLimitadoBp / 100;
  return (
    <div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-superficie-2" role="progressbar" aria-valuenow={Math.round(largura)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn("h-full rounded-full transition-[width]", progresso.atingida ? "bg-sucesso" : "bg-primaria")}
          style={{ width: `${largura}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-texto-suave">
        <span className="tabular">{formatarPercentual(progresso.percentualBp, 0)} da meta</span>
        <span className="tabular">
          {progresso.atingida ? "Meta atingida" : `Faltam ${formatarReais(progresso.falta)}`}
        </span>
      </div>
    </div>
  );
}

/** Mini barras horizontais com a participação de cada forma de pagamento. */
export function MiniBarrasFormas({ formas }: { formas: ResumoForma[] }) {
  if (formas.length === 0) {
    return <p className="py-6 text-center text-sm text-texto-fraco">Nenhum pagamento no período.</p>;
  }
  const maior = Math.max(...formas.map((f) => f.valor), 1);
  return (
    <ul className="space-y-3">
      {formas.map((f) => (
        <li key={f.forma}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-texto">{ROTULO_FORMA_PAGAMENTO_CURTO[f.forma]}</span>
            <span className="tabular text-texto">
              {formatarReais(f.valor)}{" "}
              <span className="text-xs text-texto-fraco">({formatarPercentual(f.participacaoBp, 0)})</span>
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-superficie-2">
            <div className="h-full rounded-full bg-primaria" style={{ width: `${Math.max(2, (f.valor / maior) * 100)}%` }} />
          </div>
          <p className="mt-0.5 text-xs text-texto-fraco">
            {f.quantidade} {f.quantidade === 1 ? "pagamento" : "pagamentos"}
            {f.taxas > 0 ? ` · taxas ${formatarReais(f.taxas)}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

const tonsAlerta = {
  alerta: { borda: "border-alerta/40", fundo: "bg-alerta-suave", texto: "text-alerta" },
  perigo: { borda: "border-perigo/40", fundo: "bg-perigo-suave", texto: "text-perigo" },
  info: { borda: "border-info/40", fundo: "bg-info-suave", texto: "text-info" },
};

/** Cartão de alerta: só é renderizado pela página quando há o que avisar. */
export function CartaoAlerta({
  tom,
  Icone,
  titulo,
  destaque,
  descricao,
  href,
  rotuloLink,
}: {
  tom: keyof typeof tonsAlerta;
  Icone: LucideIcon;
  titulo: string;
  destaque: string;
  descricao: string;
  href: string;
  rotuloLink: string;
}) {
  const t = tonsAlerta[tom];
  return (
    <Cartao className={cn("flex flex-col gap-2 border px-4 py-3", t.borda)}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md", t.fundo, t.texto)}>
          <Icone className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-texto">{titulo}</p>
          <p className={cn("text-lg font-semibold tabular", t.texto)}>{destaque}</p>
          <p className="text-xs text-texto-suave">{descricao}</p>
        </div>
      </div>
      <Link href={href} className={cn("inline-flex items-center gap-1 self-end text-xs font-medium hover:underline", t.texto)}>
        {rotuloLink} <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </Cartao>
  );
}

/** Linha "rótulo ..... valor" usada nos blocos de resumo. */
export function LinhaResumo({
  rotulo,
  valor,
  detalhe,
  destaque = false,
  className,
}: {
  rotulo: React.ReactNode;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  destaque?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", destaque && "font-semibold", className)}>
      <div className="min-w-0">
        <p className={cn("text-sm", destaque ? "text-texto" : "text-texto-suave")}>{rotulo}</p>
        {detalhe ? <p className="text-xs text-texto-fraco">{detalhe}</p> : null}
      </div>
      <p className="shrink-0 text-sm tabular text-texto">{valor}</p>
    </div>
  );
}
