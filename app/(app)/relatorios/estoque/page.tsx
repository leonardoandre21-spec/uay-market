import { AlertTriangle, Boxes, PackageX, Warehouse } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { relatorioEstoque } from "@/lib/servicos/relatorios";
import { resolverPeriodo, ROTULO_SITUACAO_ESTOQUE, type SituacaoEstoque } from "@/lib/servicos/relatorios-calculos";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { GradeIndicadores } from "@/components/ui/pagina";
import type { TomSelo } from "@/components/ui/selo";
import { BarraRelatorio } from "../_componentes/barra-relatorio";
import { GraficoBarrasHorizontais } from "../_componentes/graficos";
import { LinkExportar } from "../_componentes/link-exportar";
import type { PropsPaginaRelatorio } from "../_componentes/parametros";
import { TabelaOrdenavel, type ColunaOrdenavel } from "../_componentes/tabela-ordenavel";

const TOM_SITUACAO: Record<SituacaoEstoque, TomSelo> = {
  "sem-estoque": "perigo",
  zerado: "neutro",
  parado: "alerta",
  critico: "perigo",
  atencao: "alerta",
  normal: "sucesso",
  excesso: "info",
};

const COLUNAS_GIRO: ColunaOrdenavel[] = [
  { chave: "nome", titulo: "Produto", destaque: true },
  { chave: "categoria", titulo: "Categoria" },
  { chave: "estoqueAtual", titulo: "Estoque atual", tipo: "quantidade" },
  { chave: "quantidadeVendida", titulo: "Vendido", tipo: "quantidade", ajuda: "Quantidade vendida no período" },
  { chave: "giro", titulo: "Giro", tipo: "decimal", vazio: "Sem dado", ajuda: "Vendido dividido pelo estoque médio ((atual + vendido) / 2). Quanto maior, mais rápido roda." },
  { chave: "cobertura", titulo: "Cobertura", tipo: "dias", vazio: "Sem saída", ajuda: "Quantos dias o estoque atual dura no ritmo de venda do período" },
  { chave: "valorImobilizado", titulo: "Valor em estoque", tipo: "reais", ajuda: "Estoque atual vezes custo" },
  {
    chave: "situacao",
    titulo: "Situação",
    tipo: "selo",
    tonsSelo: TOM_SITUACAO,
    rotulos: ROTULO_SITUACAO_ESTOQUE,
    numerico: false,
    ajuda: "Sem estoque: esgotou vendendo ou ficou negativo. Zerado: sem estoque e sem venda no período. Parado: tem estoque e não vendeu.",
  },
];

/** O gráfico mostra só as maiores categorias; a tabela ao lado tem todas. */
const LIMITE_GRAFICO_CATEGORIAS = 12;

const COLUNAS_PARADOS: ColunaOrdenavel[] = [
  { chave: "nome", titulo: "Produto", destaque: true },
  { chave: "categoria", titulo: "Categoria" },
  { chave: "estoque", titulo: "Estoque", tipo: "quantidade" },
  { chave: "precoCusto", titulo: "Custo unit.", tipo: "reais" },
  { chave: "valorImobilizado", titulo: "Dinheiro parado", tipo: "reais" },
];

const COLUNAS_IMOBILIZADO: ColunaOrdenavel[] = [
  { chave: "categoria", titulo: "Categoria", destaque: true },
  { chave: "produtos", titulo: "Produtos com estoque", tipo: "inteiro" },
  { chave: "parados", titulo: "Parados", tipo: "inteiro", ajuda: "Sem nenhuma venda no período" },
  { chave: "valor", titulo: "Valor em estoque", tipo: "reais" },
  { chave: "valorParado", titulo: "Valor parado", tipo: "reais" },
  { chave: "participacaoBp", titulo: "% do total", tipo: "percentual" },
];

export default async function PaginaEstoque({ searchParams }: PropsPaginaRelatorio) {
  await exigirAdmin();
  const periodo = resolverPeriodo(await searchParams);
  const { giro, parados, imobilizado, resumo } = await relatorioEstoque(periodo);

  const houveVenda = giro.some((l) => l.quantidadeVendida > 0);
  const percentualParado = resumo.valorImobilizado > 0 ? Math.round((resumo.valorParado / resumo.valorImobilizado) * 10000) : 0;

  return (
    <>
      <BarraRelatorio
        periodo={periodo}
        titulo="Giro de estoque"
        descricao="Quanto cada produto roda, quantos dias o estoque dura e quanto dinheiro está parado."
        exportacao="estoque-giro"
      />

      {!houveVenda ? (
        <Aviso tom="info" className="mb-5" titulo="Nenhuma venda concluída neste período">
          Sem vendas não dá pra calcular giro nem cobertura. O valor em estoque por categoria continua valendo.
        </Aviso>
      ) : null}

      <GradeIndicadores className="mb-6">
        <Indicador
          rotulo="Valor em estoque"
          valor={formatarReais(resumo.valorImobilizado)}
          detalhe={`${resumo.produtosComEstoque.toLocaleString("pt-BR")} produtos com estoque, a preço de custo`}
          icone={<Warehouse className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Parado sem vender"
          valor={formatarReais(resumo.valorParado)}
          tom={resumo.valorParado > 0 ? "alerta" : "neutro"}
          detalhe={`${resumo.parados.toLocaleString("pt-BR")} produtos · ${formatarPercentual(percentualParado, 0)} do valor em estoque`}
          icone={<PackageX className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Cobertura crítica"
          valor={resumo.criticos.toLocaleString("pt-BR")}
          tom={resumo.criticos > 0 ? "perigo" : "neutro"}
          detalhe="Produtos com menos de 7 dias de estoque no ritmo atual"
          icone={<AlertTriangle className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Em falta / excesso"
          valor={`${resumo.semEstoque.toLocaleString("pt-BR")} / ${resumo.excesso.toLocaleString("pt-BR")}`}
          tom={resumo.semEstoque > 0 ? "perigo" : "neutro"}
          detalhe="Esgotou vendendo ou ficou negativo / mais de 60 dias de cobertura"
          icone={<Boxes className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <div className="mb-6 grid gap-5 lg:grid-cols-5">
        <Cartao className="relatorios-quebra lg:col-span-2">
          <CartaoCabecalho
            titulo="Valor em estoque por categoria"
            descricao={
              imobilizado.length > LIMITE_GRAFICO_CATEGORIAS
                ? `Onde o dinheiro está parado na prateleira (mostrando as ${LIMITE_GRAFICO_CATEGORIAS} maiores de ${imobilizado.length} categorias; a tabela ao lado tem todas)`
                : "Onde o dinheiro está parado na prateleira"
            }
          />
          <CartaoConteudo>
            <GraficoBarrasHorizontais
              dados={imobilizado.slice(0, LIMITE_GRAFICO_CATEGORIAS).map((c) => ({
                nome: c.categoria,
                valor: c.valor,
                extras: [
                  { rotulo: "Produtos", valor: c.produtos.toLocaleString("pt-BR") },
                  { rotulo: "Parado", valor: formatarReais(c.valorParado) },
                ],
              }))}
              formato="reais"
              rotuloValor="Valor em estoque"
            />
          </CartaoConteudo>
        </Cartao>
        <div className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-texto">Por categoria</h3>
            <LinkExportar tipo="estoque-imobilizado" periodo={periodo} rotulo="CSV" tamanho="sm" />
          </div>
          <TabelaOrdenavel
            colunas={COLUNAS_IMOBILIZADO}
            linhas={imobilizado.map((c) => ({ ...c, chave: c.categoriaId ?? "sem" }))}
            chaveLinha="chave"
            ordemInicial={{ chave: "valor", direcao: "desc" }}
            limite={0}
            totais={{
              categoria: "Total",
              produtos: resumo.produtosComEstoque,
              parados: imobilizado.reduce((s, c) => s + c.parados, 0),
              valor: resumo.valorImobilizado,
              valorParado: imobilizado.reduce((s, c) => s + c.valorParado, 0),
              participacaoBp: imobilizado.length ? 10000 : 0,
            }}
            mensagemVazia="Nenhum produto ativo com estoque."
          />
        </div>
      </div>

      <section className="mb-8">
        <div className="mb-3">
          <h3 className="text-base font-semibold text-texto">Giro e cobertura por produto</h3>
          <p className="text-sm text-texto-suave">
            Período de {resumo.dias === 1 ? "1 dia" : `${resumo.dias} dias`}. Giro alto e cobertura curta pedem reposição; giro baixo e cobertura longa indicam excesso de compra.
          </p>
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_GIRO}
          linhas={giro.map((l) => ({ ...l }))}
          chaveLinha="produtoId"
          ordemInicial={{ chave: "giro", direcao: "desc" }}
          numerar
          mensagemVazia="Nenhum produto ativo cadastrado."
        />
      </section>

      <section className="relatorios-quebra">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-texto">Produtos parados</h3>
            <p className="text-sm text-texto-suave">Com estoque e nenhuma venda no período. Avalie promoção, troca com o fornecedor ou tirar do mix.</p>
          </div>
          <LinkExportar tipo="estoque-parados" periodo={periodo} rotulo="CSV dos parados" tamanho="sm" />
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_PARADOS}
          linhas={parados.map((l) => ({ ...l }))}
          chaveLinha="produtoId"
          ordemInicial={{ chave: "valorImobilizado", direcao: "desc" }}
          limite={25}
          totais={{ nome: "Total", valorImobilizado: resumo.valorParado }}
          mensagemVazia="Nenhum produto parado: tudo que está em estoque vendeu no período."
        />
      </section>
    </>
  );
}
