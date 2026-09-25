import { cn } from "@/lib/utils";

export function Cartao({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-padrao border border-borda bg-superficie shadow-padrao", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CartaoCabecalho({
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
    <div className={cn("flex items-start justify-between gap-4 border-b border-borda px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-texto">{titulo}</h2>
        {descricao ? <p className="mt-0.5 text-sm text-texto-suave">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex shrink-0 items-center gap-2">{acoes}</div> : null}
    </div>
  );
}

export function CartaoConteudo({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

/** Bloco de indicador (KPI): rótulo pequeno em cima, valor grande embaixo. */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  tom = "neutro",
  icone,
  className,
}: {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  tom?: "neutro" | "sucesso" | "alerta" | "perigo" | "info" | "primaria";
  icone?: React.ReactNode;
  className?: string;
}) {
  const cores: Record<string, string> = {
    neutro: "text-texto",
    sucesso: "text-sucesso",
    alerta: "text-alerta",
    perigo: "text-perigo",
    info: "text-info",
    primaria: "text-primaria",
  };
  return (
    <Cartao className={cn("px-5 py-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-fraco">{rotulo}</p>
        {icone ? <span className="text-texto-fraco">{icone}</span> : null}
      </div>
      <p className={cn("fonte-marca mt-1.5 text-[1.6rem] font-bold leading-tight tabular", cores[tom])}>{valor}</p>
      {detalhe ? <p className="mt-1 text-xs text-texto-suave">{detalhe}</p> : null}
    </Cartao>
  );
}
