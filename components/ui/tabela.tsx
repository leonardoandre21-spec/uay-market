import { cn } from "@/lib/utils";

/**
 * Tabela padrão. Uso:
 * <Tabela><thead><Tr><Th>..</Th></Tr></thead><tbody><Tr><Td>..</Td></Tr></tbody></Tabela>
 * Colunas numéricas: <Td numerico>.
 */
export function Tabela({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-padrao border border-borda bg-superficie", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-suave">{children}</thead>;
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-borda">{children}</tbody>;
}

export function Tr({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("hover:bg-superficie-2/60", className)} {...props}>
      {children}
    </tr>
  );
}

export function Th({
  className,
  numerico,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numerico?: boolean }) {
  return (
    <th className={cn("px-4 py-2.5 font-medium", numerico && "text-right", className)} {...props}>
      {children}
    </th>
  );
}

export function Td({
  className,
  numerico,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numerico?: boolean }) {
  return (
    <td className={cn("px-4 py-2.5 align-middle", numerico && "text-right tabular", className)} {...props}>
      {children}
    </td>
  );
}

export function LinhaVazia({ colunas, mensagem = "Nenhum registro." }: { colunas: number; mensagem?: string }) {
  return (
    <tr>
      <td colSpan={colunas} className="px-4 py-10 text-center text-sm text-texto-fraco">
        {mensagem}
      </td>
    </tr>
  );
}
