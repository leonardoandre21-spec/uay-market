import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tom = "info" | "sucesso" | "alerta" | "perigo";

const estilos: Record<Tom, { caixa: string; Icone: typeof Info }> = {
  info: { caixa: "bg-info-suave text-info border-info/20", Icone: Info },
  sucesso: { caixa: "bg-sucesso-suave text-sucesso border-sucesso/20", Icone: CheckCircle2 },
  alerta: { caixa: "bg-alerta-suave text-alerta border-alerta/20", Icone: AlertTriangle },
  perigo: { caixa: "bg-perigo-suave text-perigo border-perigo/20", Icone: XCircle },
};

export function Aviso({
  tom = "info",
  titulo,
  children,
  className,
}: {
  tom?: Tom;
  titulo?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { caixa, Icone } = estilos[tom];
  return (
    <div role={tom === "perigo" || tom === "alerta" ? "alert" : "status"} className={cn("flex gap-3 rounded-padrao border px-4 py-3 text-sm", caixa, className)}>
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        {children ? <div className={titulo ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}
