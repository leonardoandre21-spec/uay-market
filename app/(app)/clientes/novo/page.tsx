import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { FormularioCliente } from "../_componentes/formulario-cliente";

export const metadata: Metadata = { title: "Novo cliente" };
export const dynamic = "force-dynamic";

export default async function PaginaNovoCliente() {
  const sessao = await exigirSessao();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link href="/clientes" className="inline-flex items-center gap-1.5 text-sm text-texto-suave hover:text-texto">
          <ArrowLeft className="size-4" aria-hidden />
          Voltar pra lista de clientes
        </Link>
      </div>
      <CabecalhoPagina
        titulo="Novo cliente"
        descricao="Só o nome é obrigatório. CPF e telefone ajudam a encontrar o cliente no caixa e a cobrar pelo WhatsApp."
        className="mb-0"
      />
      <Cartao>
        <CartaoCabecalho titulo="Dados do cliente" />
        <CartaoConteudo>
          <FormularioCliente ehAdmin={sessao.papel === "ADMIN"} aoCancelarHref="/clientes" />
        </CartaoConteudo>
      </Cartao>
    </div>
  );
}
