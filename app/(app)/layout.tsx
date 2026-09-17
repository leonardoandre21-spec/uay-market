import { exigirSessao } from "@/lib/auth";
import { obterConfiguracao } from "@/lib/consultas";
import { CascaApp } from "@/components/casca-app";
import { ToastProvider } from "@/components/ui/toast";
import { sair } from "@/app/(auth)/login/actions";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const [sessao, config] = await Promise.all([exigirSessao(), obterConfiguracao()]);
  return (
    <ToastProvider>
      <CascaApp nomeLoja={config.nomeLoja} usuario={{ nome: sessao.nome, papel: sessao.papel }} sair={sair}>
        {children}
      </CascaApp>
    </ToastProvider>
  );
}
