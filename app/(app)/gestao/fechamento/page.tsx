import Link from "next/link";
import { ArrowRight, CalendarDays, Receipt, Star, TrendingUp } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { obterConfiguracao } from "@/lib/consultas";
import { mesAtual, obterFechamento } from "@/lib/servicos/gestao";
import { capitalizar, rotuloDiaCurto } from "@/lib/servicos/gestao-calculos";
import { formatarReais } from "@/lib/dinheiro";
import { agora, formatarData, formatarDataHora, parseMesInput } from "@/lib/datas";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { GraficoMeses } from "../_componentes/grafico-meses";
import { LinhaResumo, MiniBarrasFormas, ValorResultado } from "../_componentes/blocos";
import { Demonstrativo } from "./_componentes/demonstrativo";
import { SeletorMes } from "./_componentes/seletor-mes";
import { BotoesFechamento } from "./_componentes/botoes-fechamento";

export const dynamic = "force-dynamic";

const CSS_IMPRESSAO = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  body { background: white; }
  aside, header, .nao-imprimir { display: none !important; }
  main { padding: 0 !important; }
  .fechamento-impressao { max-width: none; }
  .fechamento-impressao .shadow-padrao { box-shadow: none; }
  .fechamento-impressao .quebra-evitar { break-inside: avoid; }
  .fechamento-impressao .so-impressao { display: block !important; }
}
`;

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export default async function PaginaFechamento({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await exigirAdmin();
  const { mes: mesParam } = await searchParams;
  const pedido = parseMesInput(mesParam) ?? mesAtual();
  const [dados, config] = await Promise.all([obterFechamento(pedido.ano, pedido.mes), obterConfiguracao()]);
  const { dre, indicadores, compras, boletos, caixa, fiado, comparacao } = dados;
  const rotuloColunaMes = dados.ehMesAtual ? `${dados.rotulo} até hoje` : dados.rotulo;
  const referenciaBoletos = formatarData(new Date(boletos.referencia));

  return (
    <div className="fechamento-impressao space-y-6">
      <style>{CSS_IMPRESSAO}</style>

      <CabecalhoPagina
        titulo={
          <span>
            Fechamento de {dados.rotulo}
            {dados.ehMesAtual ? (
              <Selo tom="info" className="ml-2 align-middle">
                Mês em andamento
              </Selo>
            ) : null}
          </span>
        }
        descricao={
          comparacao.parcial
            ? `Resultado do mês até hoje comparado com o mesmo trecho do mês anterior (até o dia ${comparacao.ateDia}). Vendas concluídas, custo das mercadorias, taxas, perdas e despesas.`
            : "Resultado do mês comparado com o mês anterior. Vendas concluídas, custo das mercadorias, taxas, perdas e despesas."
        }
        acoes={
          <div className="nao-imprimir flex flex-wrap items-center gap-2">
            <SeletorMes atual={dados.chave} anterior={dados.anterior} proximo={dados.proximo} meses={dados.mesesDisponiveis} />
            <BotoesFechamento mes={dados.chave} />
          </div>
        }
      />

      {/* Cabeçalho só na impressão */}
      <div className="so-impressao hidden text-sm text-texto-suave">
        {config.nomeLoja} · Fechamento de {dados.rotulo} · Emitido em {formatarDataHora(agora())}
      </div>

      {/* Indicadores */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Indicador rotulo="Vendas" valor={indicadores.numeroVendas} detalhe="cupons concluídos" icone={<Receipt className="size-4" aria-hidden />} />
        <Indicador rotulo="Ticket médio" valor={formatarReais(indicadores.ticketMedio)} detalhe="por cupom" />
        <Indicador
          rotulo="Dias com venda"
          valor={indicadores.diasComVenda}
          detalhe={dados.ehMesAtual ? "até hoje" : "no mês"}
          icone={<CalendarDays className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Melhor dia"
          valor={indicadores.melhorDia ? formatarReais(indicadores.melhorDia.receita) : "Sem vendas"}
          detalhe={indicadores.melhorDia ? `em ${rotuloDiaCurto(indicadores.melhorDia.dia)}` : "nenhum dia com venda"}
          icone={<Star className="size-4" aria-hidden />}
          tom={indicadores.melhorDia ? "primaria" : "neutro"}
        />
        <Indicador
          rotulo="Média por dia"
          valor={formatarReais(indicadores.mediaPorDia)}
          detalhe="considerando só dias com venda"
          icone={<TrendingUp className="size-4" aria-hidden />}
        />
      </div>

      {/* DRE */}
      <Cartao className="quebra-evitar">
        <CartaoCabecalho
          titulo="Demonstrativo de resultado"
          descricao={`Valores de ${rotuloColunaMes} comparados com ${comparacao.rotulo}.`}
          acoes={
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-texto-fraco">Lucro líquido</p>
              <ValorResultado centavos={dre.lucroLiquido} className="text-xl font-semibold" />
            </div>
          }
        />
        <Demonstrativo linhas={dados.linhas} rotuloMes={rotuloColunaMes} rotuloMesAnterior={comparacao.rotulo} />
      </Cartao>

      {/* Blocos complementares */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Cartao className="quebra-evitar">
          <CartaoCabecalho
            titulo="Compras do mês"
            descricao="Entradas de estoque"
            acoes={
              <Link href="/estoque/entradas" className="nao-imprimir inline-flex items-center gap-1 text-sm text-primaria hover:underline">
                Ver <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <CartaoConteudo className="divide-y divide-borda">
            <LinhaResumo rotulo="Notas de entrada" valor={compras.notas} />
            <LinhaResumo rotulo="Mercadorias" valor={formatarReais(compras.mercadorias)} />
            {compras.frete > 0 ? <LinhaResumo rotulo="Frete" valor={formatarReais(compras.frete)} /> : null}
            <LinhaResumo rotulo="Total comprado" valor={formatarReais(compras.total)} destaque />
            {compras.fornecedores.length > 0 ? (
              <div className="pt-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-texto-fraco">Maiores fornecedores</p>
                {compras.fornecedores.map((f) => (
                  <LinhaResumo
                    key={f.nome}
                    rotulo={f.nome}
                    detalhe={plural(f.notas, "nota", "notas")}
                    valor={formatarReais(f.total)}
                    className="py-1"
                  />
                ))}
              </div>
            ) : null}
          </CartaoConteudo>
        </Cartao>

        <Cartao className="quebra-evitar">
          <CartaoCabecalho
            titulo="Boletos"
            descricao={boletos.mesEncerrado ? `Contas a pagar, situação em ${referenciaBoletos}` : "Contas a pagar, situação de hoje"}
            acoes={
              <Link href="/financeiro/contas-a-pagar" className="nao-imprimir inline-flex items-center gap-1 text-sm text-primaria hover:underline">
                Ver <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <CartaoConteudo className="divide-y divide-borda">
            <LinhaResumo
              rotulo="Pagos no mês"
              detalhe={plural(boletos.pagos.quantidade, "boleto", "boletos")}
              valor={formatarReais(boletos.pagos.total)}
            />
            <LinhaResumo
              rotulo="Pendentes com vencimento no mês"
              detalhe={`${plural(boletos.pendentesNoMes.quantidade, "boleto", "boletos")} sem pagamento ${boletos.mesEncerrado ? `até ${referenciaBoletos}` : "até hoje"}`}
              valor={formatarReais(boletos.pendentesNoMes.total)}
            />
            <LinhaResumo
              rotulo={
                <span className={boletos.atrasados.quantidade > 0 ? "text-perigo" : undefined}>
                  {boletos.mesEncerrado ? "Atrasados no fim do mês" : "Atrasados"}
                </span>
              }
              detalhe={
                boletos.atrasados.quantidade > 0
                  ? `${plural(boletos.atrasados.quantidade, "boleto vencido", "boletos vencidos")} sem pagamento ${boletos.mesEncerrado ? `em ${referenciaBoletos}` : "até hoje"}`
                  : boletos.mesEncerrado
                    ? `nenhum boleto vencido sem pagamento em ${referenciaBoletos}`
                    : "nenhum boleto vencido"
              }
              valor={
                <span className={boletos.atrasados.quantidade > 0 ? "font-semibold text-perigo" : undefined}>
                  {formatarReais(boletos.atrasados.total)}
                </span>
              }
            />
          </CartaoConteudo>
        </Cartao>

        <Cartao className="quebra-evitar">
          <CartaoCabecalho titulo="Vendas por forma de pagamento" descricao="Como os clientes pagaram" />
          <CartaoConteudo>
            <MiniBarrasFormas formas={dados.formasPagamento} />
          </CartaoConteudo>
        </Cartao>

        <Cartao className="quebra-evitar">
          <CartaoCabecalho
            titulo="Caixa"
            descricao="Sessões de caixa do mês"
            acoes={
              <Link href="/caixa" className="nao-imprimir inline-flex items-center gap-1 text-sm text-primaria hover:underline">
                Ver <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <CartaoConteudo className="divide-y divide-borda">
            <LinhaResumo rotulo="Caixas abertos no mês" valor={caixa.sessoes} />
            <LinhaResumo
              rotulo="Caixas fechados no mês"
              detalhe={caixa.comDiferenca > 0 ? `${plural(caixa.comDiferenca, "fechamento", "fechamentos")} com diferença` : "todos bateram"}
              valor={caixa.fechadas}
            />
            <LinhaResumo
              rotulo="Soma das diferenças"
              detalhe="contado menos esperado"
              valor={<ValorResultado centavos={caixa.somaDiferencas} />}
              destaque
            />
          </CartaoConteudo>
        </Cartao>

        <Cartao className="quebra-evitar">
          <CartaoCabecalho
            titulo="Fiado"
            descricao="Compras a prazo dos clientes"
            acoes={
              <Link href="/clientes" className="nao-imprimir inline-flex items-center gap-1 text-sm text-primaria hover:underline">
                Ver <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <CartaoConteudo className="divide-y divide-borda">
            <LinhaResumo
              rotulo="Fiado novo no mês"
              detalhe="compras fiado menos as canceladas do próprio mês"
              valor={formatarReais(fiado.novo)}
            />
            {fiado.dividaAntigaLancada > 0 ? (
              <LinhaResumo
                rotulo="Dívida antiga lançada à mão"
                detalhe="ajuste manual, sem venda no sistema"
                valor={formatarReais(fiado.dividaAntigaLancada)}
              />
            ) : null}
            <LinhaResumo
              rotulo="Recebido no mês"
              detalhe="só o que os clientes pagaram de verdade"
              valor={formatarReais(fiado.recebido)}
            />
            {fiado.abatimentos > 0 ? (
              <LinhaResumo
                rotulo="Descontos e dívidas perdoadas"
                detalhe="ajuste manual, nenhum dinheiro entrou"
                valor={formatarReais(-fiado.abatimentos)}
              />
            ) : null}
            {fiado.cancelamentosAntigos > 0 ? (
              <LinhaResumo
                rotulo="Cancelamentos de fiado de meses anteriores"
                detalhe="vendas antigas canceladas neste mês"
                valor={formatarReais(-fiado.cancelamentosAntigos)}
              />
            ) : null}
            <LinhaResumo
              rotulo="Saldo em aberto no fim do mês"
              detalhe="tudo que os clientes ainda devem"
              valor={formatarReais(fiado.saldoFinal)}
              destaque
            />
          </CartaoConteudo>
        </Cartao>

        <Cartao className="quebra-evitar">
          <CartaoCabecalho titulo="Resumo do lucro" descricao="De onde vem e pra onde vai o dinheiro" />
          <CartaoConteudo className="divide-y divide-borda">
            <LinhaResumo rotulo="Receita bruta" valor={formatarReais(dre.receitaBruta)} />
            <LinhaResumo rotulo="Custo das mercadorias" valor={formatarReais(-dre.cmv)} />
            <LinhaResumo rotulo="Taxas" valor={formatarReais(-dre.taxas)} />
            <LinhaResumo rotulo="Perdas" valor={formatarReais(-dre.perdasTotal)} />
            <LinhaResumo rotulo="Despesas" valor={formatarReais(-dre.despesasTotal)} />
            <LinhaResumo
              rotulo={dre.lucroLiquido < 0 ? "Prejuízo do mês" : "Lucro líquido do mês"}
              valor={<ValorResultado centavos={dre.lucroLiquido} className="text-base" />}
              destaque
            />
          </CartaoConteudo>
        </Cartao>
      </div>

      {/* Gráfico 6 meses */}
      <Cartao className="quebra-evitar">
        <CartaoCabecalho
          titulo="Últimos 6 meses"
          descricao="Receita e lucro líquido mês a mês. Prejuízo aparece em vermelho."
          acoes={
            <Link href="/gestao/comparativo" className="nao-imprimir inline-flex items-center gap-1 text-sm text-primaria hover:underline">
              Comparativo 12 meses <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        <CartaoConteudo>
          <GraficoMeses
            dados={dados.ultimosMeses.map((m) => ({
              chave: m.chave,
              rotulo: capitalizar(m.rotulo),
              rotuloCurto: m.rotuloCurto,
              receita: m.dre.receitaBruta,
              lucroLiquido: m.dre.lucroLiquido,
            }))}
          />
        </CartaoConteudo>
      </Cartao>
    </div>
  );
}
