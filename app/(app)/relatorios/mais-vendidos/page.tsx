import { PackageX, Percent, Receipt, ShoppingBasket, TrendingUp } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { formatarPercentual, formatarQuantidadeComUnidade, formatarReais } from "@/lib/dinheiro";
import { relatorioMaisVendidos } from "@/lib/servicos/relatorios";
import { resolverPeriodo } from "@/lib/servicos/relatorios-calculos";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { GradeIndicadores } from "@/components/ui/pagina";
import { BarraRelatorio } from "../_componentes/barra-relatorio";
import { FiltroCategoria } from "../_componentes/filtro-categoria";
import { GraficoBarrasHorizontais } from "../_componentes/graficos";
import { LinkExportar } from "../_componentes/link-exportar";
import { lerInteiro, type PropsPaginaRelatorio } from "../_componentes/parametros";
import { TabelaOrdenavel, type ColunaOrdenavel } from "../_componentes/tabela-ordenavel";

const COLUNAS_RANKING: ColunaOrdenavel[] = [
  { chave: "nome", titulo: "Produto", destaque: true },
  { chave: "categoria", titulo: "Categoria" },
  { chave: "quantidade", titulo: "Quantidade", tipo: "quantidade", ajuda: "Quantidade vendida no período" },
  { chave: "vendas", titulo: "Vendas", tipo: "inteiro", ajuda: "Em quantos cupons o produto apareceu" },
  { chave: "receita", titulo: "Receita", tipo: "reais" },
  { chave: "custo", titulo: "Custo", tipo: "reais", ajuda: "Custo das unidades vendidas (CMV)" },
  { chave: "lucroBruto", titulo: "Lucro s/ mercadorias", tipo: "reais", sinal: true, ajuda: "Lucro sobre mercadorias: receita menos custo, antes das taxas de cartão e Pix" },
  { chave: "margemBp", titulo: "Margem", tipo: "percentual", sinal: true, ajuda: "Lucro sobre mercadorias dividido pela receita" },
  { chave: "participacaoBp", titulo: "Particip.", tipo: "percentual", ajuda: "Parte da receita total do período" },
];

const COLUNAS_SEM_VENDA: ColunaOrdenavel[] = [
  { chave: "nome", titulo: "Produto", destaque: true },
  { chave: "categoria", titulo: "Categoria" },
  { chave: "estoque", titulo: "Estoque", tipo: "quantidade" },
  { chave: "precoCusto", titulo: "Custo unit.", tipo: "reais" },
  { chave: "valorImobilizado", titulo: "Dinheiro parado", tipo: "reais", ajuda: "Estoque vezes custo" },
];

export default async function PaginaMaisVendidos({ searchParams }: PropsPaginaRelatorio) {
  await exigirAdmin();
  const params = await searchParams;
  const periodo = resolverPeriodo(params);
  const dados = await relatorioMaisVendidos(periodo, lerInteiro(params.categoria));
  const extras: Record<string, string> = dados.categoriaId ? { categoria: String(dados.categoriaId) } : {};

  const top10Receita = dados.ranking.slice(0, 10).map((l) => ({
    nome: l.nome,
    valor: l.receita,
    extras: [
      { rotulo: "Quantidade", valor: formatarQuantidadeComUnidade(l.quantidade, l.unidade) },
      { rotulo: "Lucro s/ mercadorias", valor: formatarReais(l.lucroBruto) },
      { rotulo: "Margem", valor: formatarPercentual(l.margemBp, 1) },
    ],
  }));
  const top10Lucro = [...dados.ranking]
    .sort((a, b) => b.lucroBruto - a.lucroBruto)
    .slice(0, 10)
    .map((l) => ({
      nome: l.nome,
      valor: l.lucroBruto,
      extras: [
        { rotulo: "Receita", valor: formatarReais(l.receita) },
        { rotulo: "Margem", valor: formatarPercentual(l.margemBp, 1) },
      ],
    }));

  const sufixoCategoria = dados.categoriaNome ? ` em ${dados.categoriaNome}` : "";

  return (
    <>
      <BarraRelatorio
        periodo={periodo}
        titulo="Produtos mais vendidos"
        descricao="Ranking por receita, quantidade e lucro sobre mercadorias (antes das taxas). Clique no cabeçalho pra reordenar."
        exportacao="mais-vendidos"
        extras={extras}
        filtros={<FiltroCategoria categorias={dados.categorias} categoriaId={dados.categoriaId} />}
      />

      {dados.categoriaNome ? (
        <p className="mb-4 hidden text-sm text-texto-suave print:block">Categoria: {dados.categoriaNome}</p>
      ) : null}

      {dados.ranking.length === 0 ? (
        <Aviso tom="info" className="mb-5" titulo={`Nenhuma venda concluída${sufixoCategoria} neste período`}>
          Mude o período ou a categoria acima. A lista de produtos sem venda continua abaixo.
        </Aviso>
      ) : null}

      <GradeIndicadores className="mb-6">
        <Indicador
          rotulo="Produtos vendidos"
          valor={dados.totais.produtos.toLocaleString("pt-BR")}
          detalhe={dados.categoriaNome ? `Na categoria ${dados.categoriaNome}` : "Produtos diferentes com pelo menos uma venda"}
          icone={<ShoppingBasket className="size-4" aria-hidden />}
        />
        <Indicador rotulo="Receita" valor={formatarReais(dados.totais.receita)} detalhe={`Custo das mercadorias ${formatarReais(dados.totais.custo)}`} icone={<Receipt className="size-4" aria-hidden />} />
        <Indicador
          rotulo="Lucro sobre mercadorias"
          valor={formatarReais(dados.totais.lucroBruto)}
          tom={dados.totais.lucroBruto > 0 ? "sucesso" : dados.totais.lucroBruto < 0 ? "perigo" : "neutro"}
          detalhe={`Receita menos custo, antes das taxas · margem média ${formatarPercentual(dados.totais.margemBp, 1)}`}
          icone={<TrendingUp className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Sem venda no período"
          valor={dados.totais.encalhados.toLocaleString("pt-BR")}
          tom={dados.totais.encalhados > 0 ? "alerta" : "neutro"}
          detalhe={`${formatarReais(dados.totais.valorEncalhado)} parados em estoque`}
          icone={<PackageX className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <Cartao className="relatorios-quebra">
          <CartaoCabecalho titulo="Top 10 por receita" descricao="Os que mais trouxeram dinheiro pro caixa" />
          <CartaoConteudo>
            <GraficoBarrasHorizontais dados={top10Receita} formato="reais" rotuloValor="Receita" />
          </CartaoConteudo>
        </Cartao>
        <Cartao className="relatorios-quebra">
          <CartaoCabecalho titulo="Top 10 por lucro sobre mercadorias" descricao="Os que mais deixaram margem (receita menos custo, antes das taxas)" />
          <CartaoConteudo>
            <GraficoBarrasHorizontais dados={top10Lucro} formato="reais" rotuloValor="Lucro s/ mercadorias" cor="var(--acento)" />
          </CartaoConteudo>
        </Cartao>
      </div>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-texto">Ranking completo</h3>
            <p className="text-sm text-texto-suave">Todos os produtos vendidos{sufixoCategoria}. Descontos gerais do cupom já estão rateados na receita.</p>
          </div>
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_RANKING}
          linhas={dados.ranking.map((l) => ({ ...l }))}
          chaveLinha="produtoId"
          ordemInicial={{ chave: "receita", direcao: "desc" }}
          numerar
          totais={{
            nome: "Total",
            receita: dados.totais.receita,
            custo: dados.totais.custo,
            lucroBruto: dados.totais.lucroBruto,
            margemBp: dados.totais.margemBp,
          }}
          mensagemVazia="Nenhum produto vendido no período."
        />
      </section>

      <section className="relatorios-quebra">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Percent className="size-4 text-alerta" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-texto">Sem venda no período (encalhe)</h3>
              <p className="text-sm text-texto-suave">Produtos ativos com estoque que não venderam nenhuma unidade{sufixoCategoria}. Candidatos a promoção ou a sair do mix.</p>
            </div>
          </div>
          <LinkExportar tipo="sem-venda" periodo={periodo} extras={extras} rotulo="CSV do encalhe" tamanho="sm" />
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_SEM_VENDA}
          linhas={dados.semVenda.map((l) => ({ ...l }))}
          chaveLinha="produtoId"
          ordemInicial={{ chave: "valorImobilizado", direcao: "desc" }}
          limite={25}
          totais={{ nome: "Total", valorImobilizado: dados.totais.valorEncalhado }}
          mensagemVazia="Tudo que está em estoque vendeu pelo menos uma vez no período."
        />
      </section>
    </>
  );
}
