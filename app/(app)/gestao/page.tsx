import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  FileText,
  HandCoins,
  PackageMinus,
  Receipt,
  Scale,
  Target,
  XCircle,
} from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { obterPainel } from "@/lib/servicos/gestao";
import { formatarVariacao } from "@/lib/servicos/gestao-calculos";
import { formatarReais, formatarQuantidadeComUnidade } from "@/lib/dinheiro";
import { addDays, agora, formatarData, formatarDataHora, formatarHora } from "@/lib/datas";
import { ROTULO_FORMA_PAGAMENTO_CURTO } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, GradeIndicadores } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { Tbody, Td, Th, Thead, Tr, LinhaVazia } from "@/components/ui/tabela";
import { GraficoReceitaDiaria } from "./_componentes/grafico-receita-diaria";
import { BarraMeta, CartaoAlerta, MiniBarrasFormas, ValorResultado } from "./_componentes/blocos";

export const dynamic = "force-dynamic";

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function TextoVariacao({ bp, sufixo }: { bp: number | null; sufixo: string }) {
  if (bp === null) return <span>sem base de comparação</span>;
  return (
    <span className={cn("tabular", bp > 0 && "text-sucesso", bp < 0 && "text-perigo")}>
      {formatarVariacao(bp)} {sufixo}
    </span>
  );
}

export default async function PaginaPainel() {
  await exigirAdmin();
  const dados = await obterPainel();
  const { hoje, caixa, mes, alertas } = dados;
  const hojeData = agora();

  const cartoesAlerta: React.ReactNode[] = [];
  if (alertas.boletos.atrasados > 0) {
    cartoesAlerta.push(
      <CartaoAlerta
        key="boletos-atrasados"
        tom="perigo"
        Icone={FileText}
        titulo="Boletos atrasados"
        destaque={formatarReais(alertas.boletos.atrasadosTotal)}
        descricao={`${plural(alertas.boletos.atrasados, "boleto venceu", "boletos venceram")} e ainda não ${alertas.boletos.atrasados === 1 ? "foi pago" : "foram pagos"}.`}
        href="/financeiro/contas-a-pagar"
        rotuloLink="Ver boletos"
      />,
    );
  }
  if (alertas.boletos.vencendo > 0) {
    cartoesAlerta.push(
      <CartaoAlerta
        key="boletos-vencendo"
        tom="alerta"
        Icone={FileText}
        titulo={`Boletos vencendo em ${alertas.boletos.dias} dias`}
        destaque={formatarReais(alertas.boletos.vencendoTotal)}
        descricao={`${plural(alertas.boletos.vencendo, "boleto vence", "boletos vencem")} até ${formatarData(addDays(hojeData, alertas.boletos.dias))}.`}
        href="/financeiro/contas-a-pagar"
        rotuloLink="Ver boletos"
      />,
    );
  }
  if (alertas.lotes.vencidos > 0 || alertas.lotes.vencendo > 0) {
    const partes: string[] = [];
    if (alertas.lotes.vencidos > 0) partes.push(plural(alertas.lotes.vencidos, "lote já vencido", "lotes já vencidos"));
    if (alertas.lotes.vencendo > 0) {
      partes.push(`${plural(alertas.lotes.vencendo, "lote vence", "lotes vencem")} em até ${alertas.lotes.dias} dias`);
    }
    const totalLotes = alertas.lotes.vencidos + alertas.lotes.vencendo;
    cartoesAlerta.push(
      <CartaoAlerta
        key="lotes"
        tom={alertas.lotes.vencidos > 0 ? "perigo" : "alerta"}
        Icone={CalendarClock}
        titulo="Validade de produtos"
        destaque={plural(totalLotes, "lote", "lotes")}
        descricao={`${partes.join("; ")}.`}
        href="/estoque/vencimentos"
        rotuloLink="Ver vencimentos"
      />,
    );
  }
  if (alertas.produtosAbaixoMinimo > 0) {
    cartoesAlerta.push(
      <CartaoAlerta
        key="minimo"
        tom="alerta"
        Icone={PackageMinus}
        titulo="Produtos abaixo do mínimo"
        destaque={plural(alertas.produtosAbaixoMinimo, "produto", "produtos")}
        descricao="Estoque abaixo do mínimo cadastrado. Hora de repor."
        href="/estoque?filtro=ABAIXO_MINIMO"
        rotuloLink="Ver produtos"
      />,
    );
  }
  if (alertas.fiadoAntigo.total > 0) {
    cartoesAlerta.push(
      <CartaoAlerta
        key="fiado"
        tom="alerta"
        Icone={HandCoins}
        titulo={`Fiado aberto há mais de ${alertas.fiadoAntigo.dias} dias`}
        destaque={formatarReais(alertas.fiadoAntigo.total)}
        descricao={`${plural(alertas.fiadoAntigo.clientes, "cliente deve", "clientes devem")} de compras antigas.`}
        href="/clientes?filtro=devendo"
        rotuloLink="Ver devedores"
      />,
    );
  }
  if (alertas.diferencasCaixa.sessoes > 0) {
    cartoesAlerta.push(
      <CartaoAlerta
        key="caixa"
        tom="perigo"
        Icone={Scale}
        titulo="Diferença no fechamento de caixa"
        destaque={formatarReais(alertas.diferencasCaixa.total)}
        descricao={`${plural(alertas.diferencasCaixa.sessoes, "caixa fechou", "caixas fecharam")} com diferença nos últimos ${alertas.diferencasCaixa.dias} dias (contado menos esperado).`}
        href="/caixa"
        rotuloLink="Ver caixa"
      />,
    );
  }
  if (alertas.canceladasHoje.quantidade > 0) {
    cartoesAlerta.push(
      <CartaoAlerta
        key="canceladas"
        tom="info"
        Icone={XCircle}
        titulo="Vendas canceladas hoje"
        destaque={formatarReais(alertas.canceladasHoje.total)}
        descricao={`${plural(alertas.canceladasHoje.quantidade, "venda foi cancelada", "vendas foram canceladas")} hoje.`}
        href="/vendas"
        rotuloLink="Ver vendas"
      />,
    );
  }

  const classeLinkAcao =
    "inline-flex h-10 items-center gap-2 rounded-padrao border border-borda bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2";

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Painel"
        descricao={`Como está o mercado hoje, ${formatarData(hojeData)}. Atualizado às ${formatarHora(hojeData)}.`}
        acoes={
          <>
            <Link href="/gestao/fechamento" className={classeLinkAcao}>
              <CalendarClock className="size-4" aria-hidden /> Fechamento mensal
            </Link>
            <Link href="/gestao/comparativo" className={classeLinkAcao}>
              <BarChart3 className="size-4" aria-hidden /> Comparativo 12 meses
            </Link>
          </>
        }
      />

      {/* Linha 1: hoje */}
      <section aria-labelledby="titulo-hoje">
        <h2 id="titulo-hoje" className="mb-3 text-xs font-semibold uppercase tracking-wider text-texto-fraco">
          Hoje
        </h2>
        <GradeIndicadores>
          <Indicador
            rotulo="Vendas de hoje"
            valor={formatarReais(hoje.receita)}
            icone={<Receipt className="size-4" aria-hidden />}
            detalhe={
              <>
                {plural(hoje.cupons, "cupom", "cupons")} · <TextoVariacao bp={hoje.variacaoReceitaBp} sufixo="vs. semana passada até este horário" />
              </>
            }
          />
          <Indicador
            rotulo="Lucro bruto de hoje"
            valor={<ValorResultado centavos={hoje.lucroBruto} />}
            detalhe="Vendas menos custo das mercadorias e taxas"
          />
          <Indicador
            rotulo="Ticket médio"
            valor={formatarReais(hoje.ticketMedio)}
            detalhe={
              hoje.semanaPassada.cupons > 0 ? (
                <>
                  Cupons: <TextoVariacao bp={hoje.variacaoCuponsBp} sufixo="vs. semana passada até este horário" />
                </>
              ) : (
                "Valor médio por cupom fechado hoje"
              )
            }
          />
          {caixa.aberto ? (
            <Indicador
              rotulo="Caixa"
              tom="sucesso"
              valor="Aberto"
              detalhe={
                <>
                  Há {caixa.abertoHa}, desde {formatarHora(new Date(caixa.desde))} ({caixa.operador}).
                  <br />
                  Dinheiro esperado na gaveta:{" "}
                  <span className="font-medium tabular text-texto">{formatarReais(caixa.dinheiroEsperado)}</span>.{" "}
                  <Link href="/caixa" className="text-primaria hover:underline">
                    Ver caixa
                  </Link>
                </>
              }
            />
          ) : (
            <Indicador
              rotulo="Caixa"
              valor="Fechado"
              detalhe={
                <>
                  Nenhum caixa aberto agora.{" "}
                  <Link href="/caixa" className="text-primaria hover:underline">
                    Abrir caixa
                  </Link>
                </>
              }
            />
          )}
        </GradeIndicadores>
      </section>

      {/* Linha 2: mês atual */}
      <section aria-labelledby="titulo-mes">
        <h2 id="titulo-mes" className="mb-3 text-xs font-semibold uppercase tracking-wider text-texto-fraco">
          Este mês ({mes.rotulo})
        </h2>
        <GradeIndicadores>
          <Cartao className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Faturamento do mês</p>
              <Target className="size-4 text-texto-fraco" aria-hidden />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular text-texto">{formatarReais(mes.receita)}</p>
            {mes.progresso ? (
              <div className="mt-2">
                <p className="mb-1.5 text-xs text-texto-suave">Meta do mês: {formatarReais(mes.progresso.meta)}</p>
                <BarraMeta progresso={mes.progresso} />
              </div>
            ) : (
              <p className="mt-1 text-xs text-texto-suave">
                Sem meta mensal cadastrada.{" "}
                <Link href="/configuracoes" className="text-primaria hover:underline">
                  Definir meta
                </Link>
              </p>
            )}
          </Cartao>
          <Indicador
            rotulo="Lucro real do mês"
            valor={<ValorResultado centavos={mes.lucroReal} />}
            detalhe={`Já descontadas perdas (${formatarReais(mes.perdas)}) e despesas`}
          />
          <Indicador
            rotulo="Despesas do mês"
            valor={formatarReais(mes.despesas)}
            detalhe="Inclui boletos pagos, exceto os de compra de mercadoria (já contados no custo das vendas)"
          />
          <Indicador
            rotulo="Compras do mês"
            valor={formatarReais(mes.compras)}
            detalhe={plural(mes.comprasNotas, "entrada de estoque", "entradas de estoque")}
          />
        </GradeIndicadores>
      </section>

      {/* Alertas */}
      {cartoesAlerta.length > 0 ? (
        <section aria-labelledby="titulo-alertas">
          <h2
            id="titulo-alertas"
            className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-texto-fraco"
          >
            <AlertTriangle className="size-3.5" aria-hidden /> Precisa de atenção
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cartoesAlerta}</div>
        </section>
      ) : null}

      {/* Gráfico 30 dias */}
      <Cartao>
        <CartaoCabecalho
          titulo="Últimos 30 dias"
          descricao={
            mes.metaDiaria
              ? `Receita e lucro bruto por dia. A linha tracejada é a meta diária de ${formatarReais(mes.metaDiaria)}.`
              : "Receita e lucro bruto por dia."
          }
        />
        <CartaoConteudo>
          <GraficoReceitaDiaria dados={dados.serie30Dias} metaDiaria={mes.metaDiaria} />
        </CartaoConteudo>
      </Cartao>

      {/* Linha inferior */}
      <div className="grid gap-4 xl:grid-cols-4">
        <Cartao>
          <CartaoCabecalho titulo="Top 5 produtos do mês" descricao="Os que mais faturaram, já com descontos" />
          <CartaoConteudo className="px-0 py-0">
            {dados.topProdutos.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-texto-fraco">Nenhuma venda neste mês ainda.</p>
            ) : (
              <ol className="divide-y divide-borda">
                {dados.topProdutos.map((p, i) => (
                  <li key={p.produtoId} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primaria-suave text-xs font-semibold text-primaria">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-texto">{p.nome}</p>
                      <p className="text-xs text-texto-fraco">
                        {formatarQuantidadeComUnidade(p.quantidade, p.unidade)} vendidos
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium tabular text-texto">{formatarReais(p.receita)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CartaoConteudo>
        </Cartao>

        <Cartao className="xl:col-span-2">
          <CartaoCabecalho
            titulo="Últimas vendas"
            acoes={
              <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-primaria hover:underline">
                Todas <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <CartaoConteudo className="px-0 py-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <Thead>
                <Tr>
                  <Th>Cupom</Th>
                  <Th>Hora</Th>
                  <Th>Pagamento</Th>
                  <Th numerico>Total</Th>
                </Tr>
              </Thead>
              <Tbody>
                {dados.ultimasVendas.length === 0 ? (
                  <LinhaVazia colunas={4} mensagem="Nenhuma venda registrada." />
                ) : (
                  dados.ultimasVendas.map((v) => (
                    <Tr key={v.id}>
                      <Td>
                        <Link href={`/vendas/${v.id}`} className="font-medium text-primaria hover:underline">
                          nº {v.numero}
                        </Link>
                        {v.status === "CANCELADA" ? (
                          <Selo tom="perigo" className="ml-1.5">
                            Cancelada
                          </Selo>
                        ) : null}
                        {v.cliente ? <p className="text-xs text-texto-fraco">{v.cliente}</p> : null}
                      </Td>
                      <Td className="text-texto-suave" title={formatarDataHora(new Date(v.horario))}>
                        {formatarHora(new Date(v.horario))}
                      </Td>
                      <Td className="text-texto-suave">
                        {v.formas.length
                          ? v.formas.map((f) => ROTULO_FORMA_PAGAMENTO_CURTO[f]).join(" + ")
                          : "Sem pagamento"}
                      </Td>
                      <Td numerico className={cn(v.status === "CANCELADA" && "text-texto-fraco line-through")}>
                        {formatarReais(v.total)}
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
              </table>
            </div>
          </CartaoConteudo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho titulo="Formas de pagamento do mês" descricao="Quanto entrou por cada forma" />
          <CartaoConteudo>
            <MiniBarrasFormas formas={dados.formasPagamento} />
          </CartaoConteudo>
        </Cartao>
      </div>
    </div>
  );
}
