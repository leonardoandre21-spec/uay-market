import { CalendarDays, Clock, CreditCard, Receipt, Ticket, Users } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO, ROTULO_FORMA_PAGAMENTO_CURTO } from "@/lib/rotulos";
import { relatorioPagamentos } from "@/lib/servicos/relatorios";
import { resolverPeriodo } from "@/lib/servicos/relatorios-calculos";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { GradeIndicadores } from "@/components/ui/pagina";
import { BarraRelatorio } from "../_componentes/barra-relatorio";
import { GraficoBarras, GraficoRosca } from "../_componentes/graficos";
import { LinkExportar } from "../_componentes/link-exportar";
import type { PropsPaginaRelatorio } from "../_componentes/parametros";
import { TabelaOrdenavel, type ColunaOrdenavel } from "../_componentes/tabela-ordenavel";

const COLUNAS_FORMAS: ColunaOrdenavel[] = [
  { chave: "formaRotulo", titulo: "Forma de pagamento", destaque: true },
  { chave: "quantidade", titulo: "Pagamentos", tipo: "inteiro", ajuda: "Uma venda pode ter mais de um pagamento" },
  { chave: "bruto", titulo: "Valor bruto", tipo: "reais" },
  { chave: "taxas", titulo: "Taxas", tipo: "reais" },
  { chave: "liquido", titulo: "Valor líquido", tipo: "reais", ajuda: "Bruto menos taxas" },
  { chave: "participacaoBp", titulo: "% do total", tipo: "percentual" },
];

const COLUNAS_OPERADORES: ColunaOrdenavel[] = [
  { chave: "nome", titulo: "Operador", destaque: true },
  { chave: "quantidade", titulo: "Vendas", tipo: "inteiro" },
  { chave: "total", titulo: "Total vendido", tipo: "reais" },
  { chave: "ticketMedio", titulo: "Ticket médio", tipo: "reais" },
  { chave: "participacaoBp", titulo: "% do total", tipo: "percentual" },
];

const COLUNAS_DIAS: ColunaOrdenavel[] = [
  { chave: "rotulo", titulo: "Dia da semana", destaque: true },
  { chave: "quantidade", titulo: "Vendas", tipo: "inteiro" },
  { chave: "total", titulo: "Total", tipo: "reais" },
  { chave: "ticketMedio", titulo: "Ticket médio", tipo: "reais" },
];

export default async function PaginaPagamentos({ searchParams }: PropsPaginaRelatorio) {
  await exigirAdmin();
  const periodo = resolverPeriodo(await searchParams);
  const { formas, recebimentosFiado, fiadoSemTaxa, operadores, horas, diasSemana, resumo } = await relatorioPagamentos(periodo);
  const totalFiadoRecebido = recebimentosFiado.reduce((s, r) => s + r.valor, 0);

  const horasComVenda = horas.filter((h) => h.quantidade > 0);
  const primeiraHora = horasComVenda[0];
  const ultimaHora = horasComVenda[horasComVenda.length - 1];
  // Mostra da primeira à última hora com venda (mínimo 6h às 22h), pra não sobrar madrugada vazia.
  const horaInicio = Math.min(6, primeiraHora?.hora ?? 6);
  const horaFim = Math.max(22, ultimaHora?.hora ?? 22);
  const horasVisiveis = horas.filter((h) => h.hora >= horaInicio && h.hora <= horaFim);

  return (
    <>
      <BarraRelatorio
        periodo={periodo}
        titulo="Pagamentos e movimento"
        descricao="Como o cliente paga, quanto vai em taxa, quem vende e quando o mercado enche."
        exportacao="pagamentos"
      />

      {resumo.vendas === 0 ? (
        <Aviso tom="info" className="mb-5" titulo="Nenhuma venda concluída neste período">
          Escolha outro período acima.
        </Aviso>
      ) : null}

      <GradeIndicadores className="mb-6">
        <Indicador rotulo="Vendas" valor={resumo.vendas.toLocaleString("pt-BR")} detalhe={`${resumo.pagamentos.toLocaleString("pt-BR")} pagamentos registrados`} icone={<Receipt className="size-4" aria-hidden />} />
        <Indicador rotulo="Ticket médio" valor={formatarReais(resumo.ticketMedio)} detalhe="Valor médio por venda" icone={<Ticket className="size-4" aria-hidden />} />
        <Indicador
          rotulo="Taxas pagas"
          valor={formatarReais(resumo.taxas)}
          tom={resumo.taxas > 0 ? "alerta" : "neutro"}
          detalhe={`Líquido recebido ${formatarReais(resumo.liquido)}${resumo.receita > 0 ? ` · ${formatarPercentual(Math.round((resumo.taxas / resumo.receita) * 10000), 2)} da receita` : ""}`}
          icone={<CreditCard className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Pico de movimento"
          valor={resumo.horaPico ? `${resumo.horaPico.rotulo} às ${String(resumo.horaPico.hora + 1).padStart(2, "0")}h` : "Sem dados"}
          detalhe={resumo.diaPico ? `Melhor dia: ${resumo.diaPico.rotulo.toLowerCase()} (${formatarReais(resumo.diaPico.total)})` : "Sem vendas no período"}
          icone={<Clock className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <div className="mb-6 grid gap-5 lg:grid-cols-5">
        <Cartao className="relatorios-quebra lg:col-span-2">
          <CartaoCabecalho titulo="Formas de pagamento" descricao="Participação no valor bruto" />
          <CartaoConteudo>
            <GraficoRosca dados={formas.map((f) => ({ nome: ROTULO_FORMA_PAGAMENTO_CURTO[f.forma], valor: f.bruto }))} formato="reais" />
          </CartaoConteudo>
        </Cartao>
        <div className="lg:col-span-3">
          <TabelaOrdenavel
            colunas={COLUNAS_FORMAS}
            linhas={formas.map((f) => ({ ...f, formaRotulo: ROTULO_FORMA_PAGAMENTO[f.forma] }))}
            chaveLinha="forma"
            ordemInicial={{ chave: "bruto", direcao: "desc" }}
            limite={0}
            totais={{
              formaRotulo: "Total",
              quantidade: resumo.pagamentos,
              bruto: formas.reduce((s, f) => s + f.bruto, 0),
              taxas: resumo.taxas,
              liquido: formas.reduce((s, f) => s + f.liquido, 0),
              participacaoBp: formas.length ? 10000 : 0,
            }}
            mensagemVazia="Nenhum pagamento no período."
          />
          <p className="mt-2 text-xs text-texto-fraco">
            Fiado entra como forma de pagamento no dia da venda. O recebimento depois não soma na tabela (a venda já contou), mas aparece abaixo pra conferência.
          </p>
          {recebimentosFiado.length > 0 ? (
            <div className="mt-3 rounded-padrao border border-borda bg-superficie-2 px-4 py-3 text-sm">
              <p className="font-medium text-texto">
                Fiado recebido no período: {formatarReais(totalFiadoRecebido)}{" "}
                <span className="font-normal text-texto-suave">(informativo, fora dos totais acima)</span>
              </p>
              <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {recebimentosFiado.map((r) => (
                  <div key={r.forma} className="flex items-baseline justify-between gap-3">
                    <dt className="text-texto-suave">
                      {ROTULO_FORMA_PAGAMENTO[r.forma]} · {r.quantidade.toLocaleString("pt-BR")} recebimento{r.quantidade === 1 ? "" : "s"}
                    </dt>
                    <dd className="tabular text-texto">{formatarReais(r.valor)}</dd>
                  </div>
                ))}
              </dl>
              {fiadoSemTaxa.quantidade > 0 ? (
                <p className="mt-2 text-xs text-alerta">
                  {formatarReais(fiadoSemTaxa.valor)} recebidos em cartão ou Pix sem taxa nem maquininha registradas: essa taxa fica fora de &quot;Taxas pagas&quot; e do
                  lucro real, e a transação não aparece na conciliação de maquininhas.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <section className="mb-6 relatorios-quebra">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-texto-fraco" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-texto">Vendas por operador</h3>
              <p className="text-sm text-texto-suave">Quem passou cada venda no caixa.</p>
            </div>
          </div>
          <LinkExportar tipo="operadores" periodo={periodo} rotulo="CSV" tamanho="sm" />
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_OPERADORES}
          linhas={operadores.map((o) => ({ ...o }))}
          chaveLinha="usuarioId"
          ordemInicial={{ chave: "total", direcao: "desc" }}
          limite={0}
          totais={{ nome: "Total", quantidade: resumo.vendas, total: resumo.receita, ticketMedio: resumo.ticketMedio, participacaoBp: operadores.length ? 10000 : 0 }}
          mensagemVazia="Nenhuma venda no período."
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao className="relatorios-quebra">
          <CartaoCabecalho
            titulo="Vendas por hora do dia"
            descricao="Quantidade de vendas em cada hora, somando todos os dias do período"
            acoes={<LinkExportar tipo="horas" periodo={periodo} rotulo="CSV" tamanho="sm" />}
          />
          <CartaoConteudo>
            <GraficoBarras
              dados={horasVisiveis.map((h) => ({ rotulo: h.rotulo, valor: h.quantidade, secundario: h.total }))}
              formato="inteiro"
              rotuloValor="Vendas"
              rotuloSecundario="Total vendido"
            />
            <p className="mt-2 text-xs text-texto-fraco">A barra laranja é a hora de maior movimento. Use pra planejar a escala do caixa.</p>
          </CartaoConteudo>
        </Cartao>
        <Cartao className="relatorios-quebra">
          <CartaoCabecalho
            titulo="Vendas por dia da semana"
            descricao="Total vendido em cada dia da semana no período"
            acoes={<LinkExportar tipo="dias-semana" periodo={periodo} rotulo="CSV" tamanho="sm" />}
          />
          <CartaoConteudo>
            <GraficoBarras
              dados={diasSemana.map((d) => ({ rotulo: d.rotuloCurto, valor: d.total, secundario: d.quantidade }))}
              formato="reais"
              rotuloValor="Total vendido"
              rotuloSecundario="Vendas"
              formatoSecundario="inteiro"
              altura={200}
            />
            <div className="mt-4 flex items-center gap-2 text-sm font-medium text-texto">
              <CalendarDays className="size-4 text-texto-fraco" aria-hidden />
              Detalhe por dia
            </div>
            <TabelaOrdenavel
              className="mt-2"
              colunas={COLUNAS_DIAS}
              linhas={diasSemana.map((d) => ({ ...d }))}
              chaveLinha="dia"
              ordemInicial={{ chave: "total", direcao: "desc" }}
              limite={0}
              mensagemVazia="Nenhuma venda no período."
            />
          </CartaoConteudo>
        </Cartao>
      </div>
    </>
  );
}
