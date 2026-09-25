import { cn } from "@/lib/utils";

/** Cabeçalho padrão de página: título, descrição e ações à direita. */
export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
  className,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <span className="traco-marca mb-2" aria-hidden />
        <h1 className="text-[1.75rem] font-bold italic leading-tight tracking-tight text-texto">{titulo}</h1>
        {descricao ? <p className="mt-1 text-sm text-texto-suave">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </div>
  );
}

/** Estado vazio com ícone opcional e ação. */
export function EstadoVazio({
  icone,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone?: React.ReactNode;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-padrao border border-dashed border-borda bg-superficie px-6 py-14 text-center",
        className,
      )}
    >
      {icone ? <div className="mb-3 text-texto-fraco [&>svg]:size-10">{icone}</div> : null}
      <p className="text-base font-medium text-texto">{titulo}</p>
      {descricao ? <p className="mt-1 max-w-sm text-sm text-texto-suave">{descricao}</p> : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}

/** Grade responsiva de indicadores (KPIs). */
export function GradeIndicadores({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}
