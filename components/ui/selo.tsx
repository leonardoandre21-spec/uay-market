import { cn } from "@/lib/utils";

export type TomSelo = "neutro" | "sucesso" | "alerta" | "perigo" | "info" | "primaria";

const tons: Record<TomSelo, string> = {
  neutro: "bg-superficie-2 text-texto-suave",
  sucesso: "bg-sucesso-suave text-sucesso",
  alerta: "bg-alerta-suave text-alerta",
  perigo: "bg-perigo-suave text-perigo",
  info: "bg-info-suave text-info",
  primaria: "bg-primaria-suave text-primaria",
};

export function Selo({
  tom = "neutro",
  className,
  children,
}: {
  tom?: TomSelo;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tons[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}
