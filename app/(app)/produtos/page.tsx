import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Pencil, Plus, ShoppingBasket, Tag, Tags, Upload, Wallet } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { listarCategorias, precoEfetivo } from "@/lib/consultas";
import { formatarPercentual, formatarQuantidadeComUnidade, formatarReais, margemPontosBase } from "@/lib/dinheiro";
import { agora } from "@/lib/datas";
import { cn } from "@/lib/utils";
import {
  estoqueAbaixoDoMinimo,
  intervaloPagina,
  lerFiltrosProdutos,
  montarQueryProdutos,
  promocaoVigente,
} from "@/lib/servicos/produtos-calculos";
import { listarProdutos, resumoProdutos } from "@/lib/servicos/produtos";
import { Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio, GradeIndicadores } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { BotaoAlternarAtivo } from "./_componentes/acoes-produto";
import { BotaoLink, classesBotao } from "./_componentes/botao-link";
import { FiltrosProdutos } from "./_componentes/filtros-produtos";

export const metadata = { title: "Produtos" };

export default async function PaginaProdutos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirSessao();
  const filtros = lerFiltrosProdutos(await searchParams);
  const [{ produtos, total, pagina, paginas }, resumo, categorias] = await Promise.all([
    listarProdutos(filtros),
    resumoProdutos(),
    listarCategorias(),
  ]);

  const referencia = agora();
  const temFiltro = filtros.busca !== "" || filtros.categoria !== "" || filtros.situacao !== "ativos";
  const semNenhumProduto = total === 0 && !temFiltro && resumo.ativos === 0;
  const { de, ate } = intervaloPagina(pagina, total);
  const queryExportar = montarQueryProdutos({ ...filtros, pagina: 1 }, true);
  const linkPagina = (p: number) => {
    const q = montarQueryProdutos({ ...filtros, pagina: p });
    return q ? `/produtos?${q}` : "/produtos";
  };

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Produtos"
        descricao="Cadastro, preços e estoque de tudo que o mercado vende."
        acoes={
          <>
            <BotaoLink href="/produtos/categorias" variante="contorno">
              <Tags className="size-4" aria-hidden />
              Categorias
            </BotaoLink>
            <BotaoLink href="/produtos/importar" variante="contorno">
              <Upload className="size-4" aria-hidden />
              Importar CSV
            </BotaoLink>
            <BotaoLink href={`/produtos/exportar${queryExportar ? `?${queryExportar}` : ""}`} variante="contorno" nativo>
              <Download className="size-4" aria-hidden />
              Exportar CSV
            </BotaoLink>
            <BotaoLink href="/produtos/novo">
              <Plus className="size-4" aria-hidden />
              Novo produto
            </BotaoLink>
          </>
        }
      />

      <GradeIndicadores>
        <Indicador rotulo="Produtos ativos" valor={resumo.ativos} icone={<ShoppingBasket className="size-4" />} />
        <Indicador
          rotulo="Abaixo do mínimo"
          valor={resumo.abaixoMinimo}
          tom={resumo.abaixoMinimo > 0 ? "perigo" : "neutro"}
          detalhe={
            resumo.abaixoMinimo > 0 ? (
              <Link href="/produtos?situacao=abaixo-minimo" className="text-primaria hover:underline">
                Ver quais precisam de reposição
              </Link>
            ) : (
              "Nenhum produto precisa de reposição"
            )
          }
          icone={<AlertTriangle className="size-4" />}
        />
        <Indicador
          rotulo="Em promoção"
          valor={resumo.emPromocao}
          tom={resumo.emPromocao > 0 ? "primaria" : "neutro"}
          detalhe={
            resumo.emPromocao > 0 ? (
              <Link href="/produtos?situacao=promocao" className="text-primaria hover:underline">
                Ver promoções ativas
              </Link>
            ) : (
              "Nenhuma promoção ativa"
            )
          }
          icone={<Tag className="size-4" />}
        />
        <Indicador
          rotulo="Estoque a preço de custo"
          valor={formatarReais(resumo.valorEstoqueCusto)}
          detalhe="Quanto há investido em mercadoria"
          icone={<Wallet className="size-4" />}
        />
      </GradeIndicadores>

      {semNenhumProduto ? (
        <EstadoVazio
          icone={<ShoppingBasket />}
          titulo="Nenhum produto cadastrado ainda"
          descricao="Cadastre um por um ou importe uma planilha CSV com o que você já tem."
          acao={
            <div className="flex flex-wrap justify-center gap-2">
              <BotaoLink href="/produtos/novo">
                <Plus className="size-4" aria-hidden />
                Cadastrar produto
              </BotaoLink>
              <BotaoLink href="/produtos/importar" variante="contorno">
                <Upload className="size-4" aria-hidden />
                Importar CSV
              </BotaoLink>
            </div>
          }
        />
      ) : (
        <>
          <FiltrosProdutos categorias={categorias} filtros={filtros} />

          <Tabela>
            <Thead>
              <tr>
                <Th>Código</Th>
                <Th>Produto</Th>
                <Th>Categoria</Th>
                <Th>Un.</Th>
                <Th numerico>Custo médio</Th>
                <Th numerico>Preço</Th>
                <Th numerico>Margem</Th>
                <Th numerico>Estoque</Th>
                <Th>Situação</Th>
                <Th className="w-24 text-right">Ações</Th>
              </tr>
            </Thead>
            <Tbody>
              {produtos.length === 0 ? (
                <LinhaVazia colunas={10} mensagem="Nenhum produto encontrado com esses filtros." />
              ) : (
                produtos.map((p) => {
                  const preco = precoEfetivo(p);
                  const emPromocao = promocaoVigente(p, referencia);
                  const margem = margemPontosBase(preco, p.precoCusto);
                  const abaixo = estoqueAbaixoDoMinimo(p.estoque, p.estoqueMinimo);
                  const codigo = p.codigoBarras ?? p.codigoInterno;
                  return (
                    <Tr key={p.id} className={cn(!p.ativo && "opacity-60")}>
                      <Td>
                        {codigo ? (
                          <span className="font-mono text-xs text-texto-suave">{codigo}</span>
                        ) : (
                          <span className="text-xs text-texto-fraco">sem código</span>
                        )}
                      </Td>
                      <Td>
                        <Link href={`/produtos/${p.id}`} className="font-medium text-texto hover:text-primaria hover:underline">
                          {p.nome}
                        </Link>
                        {p.codigoBarras && p.codigoInterno ? (
                          <p className="text-xs text-texto-fraco">Interno: {p.codigoInterno}</p>
                        ) : null}
                      </Td>
                      <Td>
                        {p.categoria ? (
                          <span className="inline-flex items-center gap-1.5 text-texto-suave">
                            {p.categoria.cor ? (
                              <span
                                className="size-2.5 shrink-0 rounded-full border border-borda"
                                style={{ backgroundColor: p.categoria.cor }}
                                aria-hidden
                              />
                            ) : null}
                            {p.categoria.nome}
                          </span>
                        ) : (
                          <span className="text-xs text-texto-fraco">sem categoria</span>
                        )}
                      </Td>
                      <Td className="text-texto-suave">{p.unidade === "KG" ? "kg" : "un"}</Td>
                      <Td numerico className="text-texto-suave">
                        {p.precoCusto > 0 ? formatarReais(p.precoCusto) : <span className="text-texto-fraco">sem custo</span>}
                      </Td>
                      <Td numerico>
                        {emPromocao ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span className="font-semibold text-primaria">{formatarReais(preco)}</span>
                            <span className="text-xs text-texto-fraco line-through">{formatarReais(p.precoVenda)}</span>
                          </div>
                        ) : (
                          <span className="font-medium">{formatarReais(preco)}</span>
                        )}
                      </Td>
                      <Td
                        numerico
                        className={cn(
                          p.precoCusto <= 0 ? "text-texto-fraco" : margem < 0 ? "text-perigo font-medium" : margem < 1500 ? "text-alerta" : "text-sucesso",
                        )}
                      >
                        {p.precoCusto > 0 ? formatarPercentual(margem) : "sem custo"}
                      </Td>
                      <Td
                        numerico
                        className={cn(abaixo && "font-semibold text-perigo")}
                        title={abaixo ? `Abaixo do mínimo (${formatarQuantidadeComUnidade(p.estoqueMinimo, p.unidade)})` : undefined}
                      >
                        {formatarQuantidadeComUnidade(p.estoque, p.unidade)}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {p.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo tom="neutro">Inativo</Selo>}
                          {emPromocao ? <Selo tom="primaria">Promoção</Selo> : null}
                          {p.ativo && abaixo ? <Selo tom="perigo">Repor</Selo> : null}
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/produtos/${p.id}`}
                            className={classesBotao("fantasma", "sm", "px-2")}
                            title={`Editar ${p.nome}`}
                            aria-label={`Editar ${p.nome}`}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Link>
                          <BotaoAlternarAtivo id={p.id} ativo={p.ativo} nome={p.nome} somenteIcone />
                        </div>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </Tbody>
          </Tabela>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-texto-suave">
            <p>
              {total === 0
                ? "Nenhum produto"
                : `Mostrando ${de} a ${ate} de ${total} ${total === 1 ? "produto" : "produtos"}`}
            </p>
            {paginas > 1 ? (
              <div className="flex items-center gap-2">
                {pagina > 1 ? (
                  <BotaoLink href={linkPagina(pagina - 1)} variante="contorno" tamanho="sm">
                    <ChevronLeft className="size-4" aria-hidden />
                    Anterior
                  </BotaoLink>
                ) : (
                  <span className={classesBotao("contorno", "sm", "opacity-50 pointer-events-none")}>
                    <ChevronLeft className="size-4" aria-hidden />
                    Anterior
                  </span>
                )}
                <span className="tabular">
                  Página {pagina} de {paginas}
                </span>
                {pagina < paginas ? (
                  <BotaoLink href={linkPagina(pagina + 1)} variante="contorno" tamanho="sm">
                    Próxima
                    <ChevronRight className="size-4" aria-hidden />
                  </BotaoLink>
                ) : (
                  <span className={classesBotao("contorno", "sm", "opacity-50 pointer-events-none")}>
                    Próxima
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
