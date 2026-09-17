import Link from "next/link";
import { LayoutDashboard, Store } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { obterConfiguracao } from "@/lib/consultas";
import { ToastProvider } from "@/components/ui/toast";
import { ROTULO_PAPEL } from "@/lib/rotulos";

export const dynamic = "force-dynamic";

/**
 * Layout enxuto do caixa: sem barra lateral, só um cabeçalho fino.
 * O operador fica nesta tela o dia inteiro; o resto do sistema é acessório aqui.
 */
export default async function LayoutPdv({ children }: { children: React.ReactNode }) {
  const [sessao, config] = await Promise.all([exigirSessao(), obterConfiguracao()]);
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <header className="nao-imprimir flex items-center justify-between gap-4 border-b border-borda bg-superficie px-4 py-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primaria text-primaria-texto">
              <Store className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-texto">{config.nomeLoja}</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-texto-suave">
              {sessao.nome} <span className="text-texto-fraco">· {ROTULO_PAPEL[sessao.papel]}</span>
            </span>
            <Link
              href={sessao.papel === "ADMIN" ? "/gestao" : "/caixa"}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-texto-suave hover:bg-superficie-2 hover:text-texto"
            >
              <LayoutDashboard className="size-4" aria-hidden />
              {sessao.papel === "ADMIN" ? "Painel" : "Caixa"}
            </Link>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </ToastProvider>
  );
}
