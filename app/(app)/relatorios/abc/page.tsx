import { exigirAdmin } from "@/lib/auth";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { relatorioAbc } from "@/lib/servicos/relatorios";
import { resolverPeriodo, type ClasseAbc } from "@/lib/servicos/relatorios-calculos";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import type { TomSelo } from "@/components/ui/selo";
import { BarraRelatorio } from "../_componentes/barra-relatorio";
import { GraficoPareto } from "../_componentes/graficos";
import type { PropsPaginaRelatorio } from "../_componentes/parametros";
import { TabelaOrdenavel, type ColunaOrdenavel } from "../_componentes/tabela-ordenavel";

const TOM_CLASSE: Record<ClasseAbc, TomSelo> = { A: "sucesso", B: "alerta", C: "neutro" };
const COR_CLASSE: Record<ClasseAbc, string> = { A: "bg-primaria", B: "bg-acento", C: "bg-texto-fraco" };
const TITULO_CLASSE: Record<ClasseAbc, string> = {
  A: "Classe A: os que sustentam o mercado",
  B: "Classe B: os que ajudam",
  C: "Classe C: os que quase não pesam",
};
const FAIXA_CLASSE: Record<ClasseAbc, string> = {
  A: "Juntos fazem os primeiros 80% da receita",
  B: "Dos 80% aos 95% da receita",
  C: "Os últimos 5% da receita",
};

const COLUNAS: ColunaOrdenavel[] = [
  { chave: "classe", titulo: "Classe", tipo: "selo", tonsSelo: TOM_CLASSE, numerico: false },
  { chave: "nome", titulo: "Produto", destaque: true },
  { chave: "categoria", titulo: "Categoria" },
  { chave: "quantidade", titulo: "Quantidade", tipo: "quantidade" },
  { chave: "receita", titulo: "Receita", tipo: "reais" },
  { chave: "participacaoBp", titulo: "% da receita", tipo: "percentual" },
  { chave: "acumuladoBp", titulo: "% acumulado", tipo: "percentual", ajuda: "Soma da participação deste produto e de todos acima dele" },
  { chave: "margemBp", titulo: "Margem", tipo: "percentual", sinal: true },
];

const LIMITE_GRAFICO = 60;

export default async function PaginaAbc({ searchParams }: PropsPaginaRelatorio) {
  await exigirAdmin();
  const periodo = resolverPeriodo(await searchParams);
  const { linhas, resumo, receitaTotal, totalItens } = await relatorioAbc(periodo);

  const dadosGrafico = linhas.slice(0, LIMITE_GRAFICO).map((l) => ({
    nome: l.nome,
    participacaoBp: l.participacaoBp,
    acumuladoBp: l.acumuladoBp,
    classe: l.classe,
  }));

  return (
    <>
      <BarraRelatorio
        periodo={periodo}
        titulo="Curva ABC de produtos"
        descricao="Separa os produtos pelo peso na receita pra você saber onde concentrar atenção e compra."
        exportacao="abc"
      />

      {totalItens === 0 ? (
        <Aviso tom="info" className="mb-5" titulo="Nenhuma venda concluída neste período">
          A curva ABC precisa de vendas. Escolha outro período acima.
        </Aviso>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {resumo.map((r) => (
          <Cartao key={r.classe} className="relatorios-quebra overflow-hidden">
            <div className={`h-1.5 ${COR_CLASSE[r.classe]}`} aria-hidden />
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">{FAIXA_CLASSE[r.classe]}</p>
                  <h3 className="mt-1 text-base font-semibold text-texto">{TITULO_CLASSE[r.classe]}</h3>
                </div>
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white ${COR_CLASSE[r.classe]}`}>{r.classe}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-texto-fraco">Produtos</dt>
                  <dd className="tabular text-xl font-semibold text-texto">
                    {r.itens.toLocaleString("pt-BR")} <span className="text-sm font-normal text-texto-suave">({formatarPercentual(r.percentualItensBp, 0)})</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-texto-fraco">Receita</dt>
                  <dd className="tabular text-xl font-semibold text-texto">
                    {formatarPercentual(r.percentualReceitaBp, 0)} <span className="block text-xs font-normal text-texto-suave">{formatarReais(r.receita)}</span>
                  </dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-borda pt-3 text-sm text-texto-suave">{r.sugestao}</p>
            </div>
          </Cartao>
        ))}
      </div>

      <Cartao className="mb-6 relatorios-quebra">
        <CartaoCabecalho
          titulo="Curva de concentração"
          descricao={
            totalItens > LIMITE_GRAFICO
              ? `Barras: participação de cada produto (mostrando os ${LIMITE_GRAFICO} primeiros de ${totalItens}). Linha azul: acumulado.`
              : "Barras: participação de cada produto na receita. Linha azul: acumulado, da esquerda pra direita."
          }
        />
        <CartaoConteudo>
          <GraficoPareto dados={dadosGrafico} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-texto-suave">
            <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-primaria" aria-hidden /> Classe A</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-acento" aria-hidden /> Classe B</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-texto-fraco" aria-hidden /> Classe C</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-info" aria-hidden /> Acumulado</span>
          </div>
        </CartaoConteudo>
      </Cartao>

      <section>
        <div className="mb-3">
          <h3 className="text-base font-semibold text-texto">Classe de cada produto</h3>
          <p className="text-sm text-texto-suave">
            {totalItens.toLocaleString("pt-BR")} produtos vendidos somando {formatarReais(receitaTotal)}. O produto que cruza a faixa fica na classe de cima.
          </p>
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS}
          linhas={linhas.map((l) => ({ ...l }))}
          chaveLinha="produtoId"
          ordemInicial={{ chave: "posicao", direcao: "asc" }}
          numerar
          mensagemVazia="Nenhum produto vendido no período."
        />
      </section>
    </>
  );
}
