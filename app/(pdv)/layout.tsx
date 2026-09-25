import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { LogoUay } from "@/components/marca";
import { exigirSessao } from "@/lib/auth";
import { obterConfiguracao } from "@/lib/consultas";
import { ROTULO_PAPEL } from "@/lib/rotulos";

export const dynamic = "force-dynamic";

/**
 * Layout enxuto do caixa: sem barra lateral, só um cabeçalho fino.
 * O operador fica nesta tela o dia inteiro; o resto do sistema é acessório aqui.
 */
export default async function LayoutPdv({ children }: { children: React.ReactNode }) {
  const [sessao, config] = await Promise.all([exigirSessao(), obterConfiguracao()]);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="nao-imprimir flex items-center justify-between gap-4 border-b-2 border-acento bg-primaria px-4 py-1.5">
        <Link href="/" className="flex items-center" aria-label={config.nomeLoja}>
          <LogoUay variante="clara" className="h-10" prioridade />
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white/85">
            {sessao.nome} <span className="text-white/50">· {ROTULO_PAPEL[sessao.papel]}</span>
          </span>
          <Link
            href={sessao.papel === "ADMIN" ? "/gestao" : "/caixa"}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-white/75 hover:bg-white/10 hover:text-acento"
          >
            <LayoutDashboard className="size-4" aria-hidden />
            {sessao.papel === "ADMIN" ? "Painel" : "Caixa"}
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
