import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Percent, Tag, Wallet } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { listarCategorias, precoEfetivo } from "@/lib/consultas";
import { formatarPercentual, formatarQuantidadeComUnidade, formatarReais, margemPontosBase } from "@/lib/dinheiro";
import { agora, formatarData, formatarDataHora, paraDataInput } from "@/lib/datas";
import { estoqueAbaixoDoMinimo, promocaoVigente } from "@/lib/servicos/produtos-calculos";
import { obterProdutoDetalhado, produtoPodeSerExcluido } from "@/lib/servicos/produtos";
import { Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { BotaoAlternarAtivo, BotaoExcluirProduto } from "../_componentes/acoes-produto";
import { BotaoLink } from "../_componentes/botao-link";
import { FormularioProduto } from "../_componentes/formulario-produto";
import { HistoricoPrecos, LotesProduto, MovimentosEstoque } from "../_componentes/paineis-produto";

export const metadata = { title: "Produto" };

export default async function PaginaProduto({ params }: { params: Promise<{ id: string }> }) {
  const [sessao, { id: idTexto }] = await Promise.all([exigirSessao(), params]);
  const id = Number(idTexto);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [produto, categorias] = await Promise.all([obterProdutoDetalhado(id), listarCategorias()]);
  if (!produto) notFound();

  const referencia = agora();
  const emPromocao = promocaoVigente(produto, referencia);
  const preco = precoEfetivo(produto);
  const margem = margemPontosBase(preco, produto.precoCusto);
  const abaixo = estoqueAbaixoDoMinimo(produto.estoque, produto.estoqueMinimo);
  const podeExcluir = produtoPodeSerExcluido(produto);
  const codigo = produto.codigoBarras ?? produto.codigoInterno;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo={
          <span className="inline-flex flex-wrap items-center gap-2">
            {produto.nome}
            {produto.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo tom="neutro">Inativo</Selo>}
            {emPromocao ? <Selo tom="primaria">Promoção</Selo> : null}
          </span>
        }
        descricao={
          <>
            {codigo ? <span className="font-mono">{codigo}</span> : "Sem código"}
            {produto.categoria ? ` · ${produto.categoria.nome}` : ""}
            {` · Cadastrado em ${formatarData(produto.criadoEm)}`}
            {` · Última alteração ${formatarDataHora(produto.atualizadoEm)}`}
          </>
        }
        acoes={
          <>
            <BotaoLink href="/produtos" variante="fantasma">
              <ArrowLeft className="size-4" aria-hidden />
              Voltar pra lista
            </BotaoLink>
            <BotaoAlternarAtivo id={produto.id} ativo={produto.ativo} nome={produto.nome} tamanho="md" variante="contorno" />
            {sessao.papel === "ADMIN" ? (
              <BotaoExcluirProduto id={produto.id} nome={produto.nome} podeExcluir={podeExcluir} />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo="Estoque atual"
          valor={formatarQuantidadeComUnidade(produto.estoque, produto.unidade)}
          tom={abaixo ? "perigo" : "neutro"}
          detalhe={
            abaixo
              ? `Abaixo do mínimo de ${formatarQuantidadeComUnidade(produto.estoqueMinimo, produto.unidade)}`
              : produto.estoqueMinimo > 0
                ? `Mínimo: ${formatarQuantidadeComUnidade(produto.estoqueMinimo, produto.unidade)}`
                : "Sem mínimo definido"
          }
          icone={<Boxes className="size-4" />}
        />
        <Indicador
          rotulo="Preço no caixa"
          valor={formatarReais(preco)}
          tom={emPromocao ? "primaria" : "neutro"}
          detalhe={
            emPromocao
              ? `Promoção${produto.promocaoAte ? ` até ${formatarData(produto.promocaoAte)}` : " sem data pra acabar"}. Preço normal ${formatarReais(produto.precoVenda)}`
              : "Preço de venda normal"
          }
          icone={<Tag className="size-4" />}
        />
        <Indicador
          rotulo="Custo médio"
          valor={produto.precoCusto > 0 ? formatarReais(produto.precoCusto) : "sem custo"}
          detalhe={`Por ${produto.unidade === "KG" ? "quilo" : "unidade"}, atualizado pelas entradas`}
          icone={<Wallet className="size-4" />}
        />
        <Indicador
          rotulo="Margem atual"
          valor={produto.precoCusto > 0 ? formatarPercentual(margem) : "sem custo"}
          tom={produto.precoCusto <= 0 ? "neutro" : margem < 0 ? "perigo" : margem < 1500 ? "alerta" : "sucesso"}
          detalhe={produto.precoCusto > 0 ? `Lucro de ${formatarReais(preco - produto.precoCusto)} por ${produto.unidade === "KG" ? "kg" : "un"}` : "Informe o custo pra calcular"}
          icone={<Percent className="size-4" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <FormularioProduto
            produto={{
              id: produto.id,
              codigoBarras: produto.codigoBarras,
              codigoInterno: produto.codigoInterno,
              nome: produto.nome,
              descricao: produto.descricao,
              categoriaId: produto.categoriaId,
              unidade: produto.unidade,
              precoVenda: produto.precoVenda,
              precoCusto: produto.precoCusto,
              precoPromocional: produto.precoPromocional,
              promocaoAte: produto.promocaoAte ? paraDataInput(produto.promocaoAte) : null,
              estoque: produto.estoque,
              estoqueMinimo: produto.estoqueMinimo,
              controlaValidade: produto.controlaValidade,
              ativo: produto.ativo,
            }}
            categorias={categorias}
            papel={sessao.papel}
          />
        </div>
        <div className="flex flex-col gap-6 xl:col-span-2">
          <HistoricoPrecos historico={produto.historicoPrecos} />
          <MovimentosEstoque movimentos={produto.movimentos} unidade={produto.unidade} produtoId={produto.id} />
          {produto.controlaValidade ? <LotesProduto lotes={produto.lotes} unidade={produto.unidade} /> : null}
        </div>
      </div>
    </div>
  );
}
