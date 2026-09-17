import { ArrowLeft } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { listarCategoriasComContagem } from "@/lib/servicos/produtos";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { BotaoLink } from "../_componentes/botao-link";
import { GerenciadorCategorias } from "../_componentes/gerenciador-categorias";

export const metadata = { title: "Categorias" };

export default async function PaginaCategorias() {
  const [sessao, categorias] = await Promise.all([exigirSessao(), listarCategoriasComContagem()]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <CabecalhoPagina
        titulo="Categorias"
        descricao="Seções do mercado usadas pra organizar produtos, filtros e relatórios."
        acoes={
          <BotaoLink href="/produtos" variante="fantasma">
            <ArrowLeft className="size-4" aria-hidden />
            Voltar pra produtos
          </BotaoLink>
        }
      />
      <GerenciadorCategorias
        admin={sessao.papel === "ADMIN"}
        categorias={categorias.map((c) => ({
          id: c.id,
          nome: c.nome,
          cor: c.cor,
          ordem: c.ordem,
          produtos: c._count.produtos,
        }))}
      />
    </div>
  );
}
