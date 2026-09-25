import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
import { db } from "@/lib/db";
import { obterConfiguracao } from "@/lib/consultas";
import { LogoUay } from "@/components/marca";
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
    <main className="grid min-h-screen bg-fundo lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Painel da marca: azul-marinho com as faixas douradas da logo. */}
      <section className="faixas-marca relative flex flex-col items-center justify-center overflow-hidden bg-primaria px-6 py-10 lg:py-16">
        <LogoUay variante="clara" prioridade className="h-28 sm:h-36 lg:h-60" />
        <p className="mt-6 hidden max-w-sm text-center text-base text-white/70 lg:block">
          Caixa, estoque, fiado, boletos e lucro real do mercado, num lugar só.
        </p>
      </section>

      <section className="flex items-start justify-center px-4 py-10 lg:items-center lg:py-16">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <span className="traco-marca mb-2" aria-hidden />
            <h1 className="text-2xl font-bold italic tracking-tight text-texto">Entrar no sistema</h1>
            <p className="mt-1 text-sm text-texto-suave">
              {config.nomeLoja !== "Uay Market" ? `${config.nomeLoja} · ` : ""}Escolha seu nome e digite o PIN.
            </p>
          </div>
          <FormularioLogin usuarios={usuarios} />
        </div>
      </section>
    </main>
  );
}
