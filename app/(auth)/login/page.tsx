import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { obterSessao } from "@/lib/auth";
import { db } from "@/lib/db";
import { obterConfiguracao } from "@/lib/consultas";
import { ToastProvider } from "@/components/ui/toast";
import { FormularioLogin } from "./formulario-login";

export const dynamic = "force-dynamic";

export default async function PaginaLogin() {
  const sessao = await obterSessao();
  if (sessao) redirect(sessao.papel === "ADMIN" ? "/gestao" : "/pdv");

  const [config, usuarios] = await Promise.all([
    obterConfiguracao(),
    db.usuario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, papel: true } }),
  ]);

  return (
    <ToastProvider>
      <main className="flex min-h-screen items-center justify-center bg-fundo px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-primaria text-primaria-texto shadow-padrao">
              <Store className="size-7" aria-hidden />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-texto">{config.nomeLoja}</h1>
            <p className="mt-1 text-sm text-texto-suave">Escolha seu nome e digite o PIN pra entrar.</p>
          </div>
          <FormularioLogin usuarios={usuarios} />
        </div>
      </main>
    </ToastProvider>
  );
}
