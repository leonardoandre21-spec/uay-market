import { ArrowLeft } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { agora } from "@/lib/datas";
import { listarCategoriasDespesaComUso, somarDespesasPorCategoria } from "@/lib/servicos/financeiro";
import { mesDe, rotuloMes } from "@/lib/servicos/financeiro-calculos";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { LinkBotao } from "../../_componentes/link-botao";
import { GerenciarCategorias } from "./_componentes/gerenciar-categorias";

export const dynamic = "force-dynamic";

export default async function PaginaCategoriasDespesa() {
  await exigirAdmin();
  const mes = mesDe(agora());
  const [categorias, totaisMes] = await Promise.all([listarCategoriasDespesaComUso(), somarDespesasPorCategoria(mes)]);

  const linhas = categorias.map((c) => ({
    id: c.id,
    nome: c.nome,
    despesas: c._count.despesas,
    contas: c._count.contas,
    totalMes: totaisMes.get(c.id) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Categorias de despesa"
        descricao="Organize os gastos por tipo (aluguel, energia, embalagens...) pra enxergar onde o dinheiro vai."
        acoes={
          <LinkBotao href="/financeiro/despesas" variante="contorno">
            <ArrowLeft className="size-4" aria-hidden />
            Voltar pras despesas
          </LinkBotao>
        }
      />
      <Cartao>
        <CartaoCabecalho
          titulo={`${linhas.length} ${linhas.length === 1 ? "categoria" : "categorias"}`}
          descricao="Categorias em uso não podem ser excluídas; mude a categoria dos lançamentos antes."
        />
        <CartaoConteudo>
          <GerenciarCategorias categorias={linhas} rotuloMes={rotuloMes(mes)} />
        </CartaoConteudo>
      </Cartao>
    </div>
  );
}
