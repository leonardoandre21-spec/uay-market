import { exigirAdmin } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { NavConfiguracoes } from "./_componentes/nav-configuracoes";

export default async function LayoutConfiguracoes({ children }: { children: React.ReactNode }) {
  await exigirAdmin();
  return (
    <div>
      <CabecalhoPagina
        titulo="Configurações"
        descricao="Ajustes da loja, usuários, pagamentos, metas e segurança dos dados."
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="shrink-0 lg:sticky lg:top-6 lg:w-60">
          <NavConfiguracoes />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
