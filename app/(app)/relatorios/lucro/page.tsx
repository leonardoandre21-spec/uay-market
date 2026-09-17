import { BadgePercent, Boxes, ClipboardList, CreditCard, PackageX, Receipt, TrendingUp, Wallet } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { relatorioLucro } from "@/lib/servicos/relatorios";
import { resolverPeriodo } from "@/lib/servicos/relatorios-calculos";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { GradeIndicadores } from "@/components/ui/pagina";
import { BarraRelatorio } from "../_componentes/barra-relatorio";
import { GraficoLinhaDiaria } from "../_componentes/graficos";
import { LinkExportar } from "../_componentes/link-exportar";
import type { PropsPaginaRelatorio } from "../_componentes/parametros";
import { TabelaOrdenavel, type ColunaOrdenavel } from "../_componentes/tabela-ordenavel";

const COLUNAS_PRODUTO: ColunaOrdenavel[] = [
  { chave: "nome", titulo: "Produto", destaque: true },
  { chave: "categoria", titulo: "Categoria" },
  { chave: "quantidade", titulo: "Quantidade", tipo: "quantidade" },
  { chave: "receita", titulo: "Receita", tipo: "reais" },
  { chave: "cmv", titulo: "CMV", tipo: "reais", ajuda: "Custo das unidades vendidas" },
  { chave: "taxas", titulo: "Taxas", tipo: "reais", ajuda: "Taxas de cartão e Pix rateadas proporcionalmente à receita" },
  { chave: "perdas", titulo: "Perdas", tipo: "reais", ajuda: "Perdas registradas do produto no período" },
  { chave: "lucro", titulo: "Lucro", tipo: "reais", sinal: true },
  { chave: "margemBp", titulo: "Margem", tipo: "percentual", sinal: true },
];

const COLUNAS_CATEGORIA: ColunaOrdenavel[] = [
  { chave: "categoria", titulo: "Categoria", destaque: true },
  { chave: "produtos", titulo: "Produtos", tipo: "inteiro" },
  { chave: "receita", titulo: "Receita", tipo: "reais" },
  { chave: "cmv", titulo: "CMV", tipo: "reais" },
  { chave: "taxas", titulo: "Taxas", tipo: "reais" },
  { chave: "perdas", titulo: "Perdas", tipo: "reais" },
  { chave: "lucro", titulo: "Lucro", tipo: "reais", sinal: true },
  { chave: "margemBp", titulo: "Margem", tipo: "percentual", sinal: true },
  { chave: "participacaoBp", titulo: "Particip.", tipo: "percentual", ajuda: "Parte da receita total" },
];

function tomLucro(valor: number): "sucesso" | "perigo" | "neutro" {
  return valor > 0 ? "sucesso" : valor < 0 ? "perigo" : "neutro";
}

export default async function PaginaLucro({ searchParams }: PropsPaginaRelatorio) {
  await exigirAdmin();
  const periodo = resolverPeriodo(await searchParams);
  const { resumo, porProduto, porCategoria, diario, fiadoSemTaxa } = await relatorioLucro(periodo);

  const totaisProduto = {
    nome: "Total",
    receita: resumo.receita,
    cmv: porProduto.reduce((s, l) => s + l.cmv, 0),
    taxas: resumo.taxas,
    perdas: resumo.perdas,
    lucro: porProduto.reduce((s, l) => s + l.lucro, 0),
    margemBp: resumo.receita > 0 ? Math.round((porProduto.reduce((s, l) => s + l.lucro, 0) / resumo.receita) * 10000) : 0,
  };

  return (
    <>
      <BarraRelatorio
        periodo={periodo}
        titulo="Lucro real do período"
        descricao="Quanto sobrou de verdade depois de custo, taxas, perdas e despesas."
        exportacao="lucro-produtos"
      />

      {resumo.vendas === 0 ? (
        <Aviso tom="info" className="mb-5" titulo="Nenhuma venda concluída neste período">
          Perdas e despesas lançadas no período ainda aparecem abaixo, por isso o lucro pode ficar negativo.
        </Aviso>
      ) : null}
      {fiadoSemTaxa.quantidade > 0 ? (
        <Aviso tom="alerta" className="mb-5" titulo={`${formatarReais(fiadoSemTaxa.valor)} de fiado recebidos em cartão ou Pix sem taxa registrada`}>
          O recebimento de fiado guarda só a forma de pagamento, sem maquininha nem taxa. A taxa que a adquirente cobrou nesses{" "}
          {fiadoSemTaxa.quantidade.toLocaleString("pt-BR")} recebimento{fiadoSemTaxa.quantidade === 1 ? "" : "s"} não entra em &quot;Taxas&quot;, então o lucro
          real está um pouco acima do verdadeiro (a diferença é essa taxa). Pix direto na conta não tem taxa e não muda nada.
        </Aviso>
      ) : null}

      <GradeIndicadores className="mb-4">
        <Indicador rotulo="Receita" valor={formatarReais(resumo.receita)} detalhe={`${resumo.vendas.toLocaleString("pt-BR")} vendas · ticket médio ${formatarReais(resumo.ticketMedio)}`} icone={<Receipt className="size-4" aria-hidden />} />
        <Indicador rotulo="CMV" valor={formatarReais(resumo.cmv)} detalhe="Custo das mercadorias vendidas" icone={<Boxes className="size-4" aria-hidden />} />
        <Indicador rotulo="Lucro sobre mercadorias" valor={formatarReais(resumo.lucroBruto)} tom={tomLucro(resumo.lucroBruto)} detalhe={`Receita menos CMV, antes das taxas · margem ${formatarPercentual(resumo.margemBrutaBp, 1)}`} icone={<TrendingUp className="size-4" aria-hidden />} />
        <Indicador rotulo="Taxas de cartão e Pix" valor={formatarReais(resumo.taxas)} detalhe={resumo.receita > 0 ? `${formatarPercentual(Math.round((resumo.taxas / resumo.receita) * 10000), 2)} da receita` : "Nenhuma taxa no período"} icone={<CreditCard className="size-4" aria-hidden />} />
      </GradeIndicadores>
      <GradeIndicadores className="mb-6">
        <Indicador rotulo="Perdas" valor={formatarReais(resumo.perdas)} tom={resumo.perdas > 0 ? "alerta" : "neutro"} detalhe="Vencidos, avarias, quebras, furtos" icone={<PackageX className="size-4" aria-hidden />} />
        <Indicador rotulo="Despesas" valor={formatarReais(resumo.despesas)} detalhe="Despesas lançadas e boletos pagos no período" icone={<ClipboardList className="size-4" aria-hidden />} />
        <Indicador rotulo="Lucro real" valor={formatarReais(resumo.lucroReal)} tom={tomLucro(resumo.lucroReal)} detalhe="Receita menos CMV, taxas, perdas e despesas" icone={<Wallet className="size-4" aria-hidden />} />
        <Indicador rotulo="Margem real" valor={formatarPercentual(resumo.margemRealBp, 1)} tom={tomLucro(resumo.margemRealBp)} detalhe="Lucro real sobre a receita" icone={<BadgePercent className="size-4" aria-hidden />} />
      </GradeIndicadores>

      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        <Cartao className="relatorios-quebra lg:col-span-2">
          <CartaoCabecalho titulo="Receita e lucro sobre mercadorias por dia" descricao="Lucro antes das taxas. Dias sem venda aparecem zerados" acoes={<LinkExportar tipo="lucro-diario" periodo={periodo} rotulo="CSV" tamanho="sm" />} />
          <CartaoConteudo>
            <GraficoLinhaDiaria dados={diario.map((p) => ({ rotulo: p.rotulo, receita: p.receita, lucroBruto: p.lucroBruto, vendas: p.vendas }))} />
          </CartaoConteudo>
        </Cartao>
        <Cartao className="relatorios-quebra">
          <CartaoCabecalho titulo="Conta de chegada" descricao="Do que entrou ao que sobrou" />
          <CartaoConteudo>
            <dl className="space-y-2 text-sm">
              <LinhaConta rotulo="Receita" valor={resumo.receita} />
              <LinhaConta rotulo="CMV" valor={-resumo.cmv} />
              <LinhaConta rotulo="Lucro sobre mercadorias" valor={resumo.lucroBruto} subtotal />
              <LinhaConta rotulo="Taxas" valor={-resumo.taxas} />
              <LinhaConta rotulo="Lucro bruto (após taxas)" valor={resumo.lucroAposTaxas} subtotal />
              <LinhaConta rotulo="Perdas" valor={-resumo.perdas} />
              <LinhaConta rotulo="Despesas" valor={-resumo.despesas} />
              <LinhaConta rotulo="Lucro real" valor={resumo.lucroReal} subtotal destaque />
            </dl>
            <p className="mt-4 text-xs text-texto-fraco">
              Nas tabelas abaixo, as taxas são rateadas entre os produtos na proporção da receita de cada um. Despesas não entram por produto, porque não pertencem a um item específico.
            </p>
          </CartaoConteudo>
        </Cartao>
      </div>

      <section className="mb-8 relatorios-quebra">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-texto">Lucro por categoria</h3>
            <p className="text-sm text-texto-suave">Soma dos produtos de cada categoria.</p>
          </div>
          <LinkExportar tipo="lucro-categorias" periodo={periodo} rotulo="CSV por categoria" tamanho="sm" />
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_CATEGORIA}
          linhas={porCategoria.map((l) => ({ ...l, chave: l.categoriaId ?? "sem" }))}
          chaveLinha="chave"
          ordemInicial={{ chave: "receita", direcao: "desc" }}
          limite={0}
          totais={{
            categoria: "Total",
            produtos: porCategoria.reduce((s, l) => s + l.produtos, 0),
            receita: totaisProduto.receita,
            cmv: totaisProduto.cmv,
            taxas: totaisProduto.taxas,
            perdas: totaisProduto.perdas,
            lucro: totaisProduto.lucro,
            margemBp: totaisProduto.margemBp,
          }}
        />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-texto">Lucro por produto</h3>
            <p className="text-sm text-texto-suave">Produtos com perda mas sem venda entram com receita zero, pra não esconder prejuízo.</p>
          </div>
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_PRODUTO}
          linhas={porProduto.map((l) => ({ ...l }))}
          chaveLinha="produtoId"
          ordemInicial={{ chave: "lucro", direcao: "desc" }}
          numerar
          totais={totaisProduto}
          mensagemVazia="Nenhuma venda nem perda no período."
        />
      </section>
    </>
  );
}

function LinhaConta({ rotulo, valor, subtotal = false, destaque = false }: { rotulo: string; valor: number; subtotal?: boolean; destaque?: boolean }) {
  const texto = valor < 0 ? `- ${formatarReais(Math.abs(valor))}` : formatarReais(valor);
  const cor = destaque ? (valor > 0 ? "text-sucesso" : valor < 0 ? "text-perigo" : "text-texto") : "text-texto";
  return (
    <div className={`flex items-baseline justify-between gap-3 ${subtotal ? "border-t border-borda pt-2 font-semibold" : ""}`}>
      <dt className={subtotal ? "text-texto" : "text-texto-suave"}>{rotulo}</dt>
      <dd className={`tabular ${cor}`}>{texto}</dd>
    </div>
  );
}
