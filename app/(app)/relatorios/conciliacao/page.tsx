import { CalendarCheck, CreditCard, Landmark, ReceiptText, Smartphone } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { agora, formatarDataHora, paraDataInput } from "@/lib/datas";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO_CURTO } from "@/lib/rotulos";
import { relatorioConciliacao } from "@/lib/servicos/relatorios";
import { INTERVALO_PARCELAS_DIAS, PRAZO_SEM_ANTECIPACAO_DIAS, resolverPeriodo, SEM_MAQUININHA_ID } from "@/lib/servicos/relatorios-calculos";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { GradeIndicadores } from "@/components/ui/pagina";
import { BarraRelatorio } from "../_componentes/barra-relatorio";
import { GraficoRosca } from "../_componentes/graficos";
import { LinkExportar } from "../_componentes/link-exportar";
import type { PropsPaginaRelatorio } from "../_componentes/parametros";
import { TabelaOrdenavel, type ColunaOrdenavel } from "../_componentes/tabela-ordenavel";
import { FiltroMaquininha } from "./_componentes/filtro-maquininha";

const COLUNAS_MAQUININHAS: ColunaOrdenavel[] = [
  { chave: "nome", titulo: "Maquininha", destaque: true },
  { chave: "quantidade", titulo: "Transações", tipo: "inteiro" },
  { chave: "bruto", titulo: "Bruto", tipo: "reais" },
  { chave: "taxas", titulo: "Taxas", tipo: "reais" },
  { chave: "liquido", titulo: "Líquido", tipo: "reais", ajuda: "Bruto menos taxas: o que cai na conta" },
  { chave: "debitoBruto", titulo: "Débito", tipo: "reais" },
  { chave: "creditoBruto", titulo: "Crédito", tipo: "reais" },
  { chave: "pixBruto", titulo: "Pix", tipo: "reais" },
  { chave: "participacaoBp", titulo: "% do total", tipo: "percentual" },
];

const COLUNAS_DIAS: ColunaOrdenavel[] = [
  { chave: "diaRotulo", titulo: "Dia", destaque: true },
  { chave: "nome", titulo: "Maquininha" },
  { chave: "quantidade", titulo: "Transações", tipo: "inteiro" },
  { chave: "bruto", titulo: "Bruto", tipo: "reais" },
  { chave: "taxas", titulo: "Taxas", tipo: "reais" },
  { chave: "liquido", titulo: "Líquido", tipo: "reais" },
  { chave: "debitoLiquido", titulo: "Débito líq.", tipo: "reais", ajuda: "Líquido só do débito" },
  { chave: "creditoLiquido", titulo: "Crédito líq.", tipo: "reais", ajuda: "Líquido só do crédito" },
  { chave: "pixLiquido", titulo: "Pix líq.", tipo: "reais", ajuda: "Líquido só do Pix na maquininha" },
];

const COLUNAS_RECEBER: ColunaOrdenavel[] = [
  { chave: "dataPrevistaRotulo", titulo: "Previsto pra", destaque: true },
  { chave: "nome", titulo: "Maquininha" },
  { chave: "quantidade", titulo: "Lançamentos", tipo: "inteiro", ajuda: "Um por pagamento; crédito parcelado que cai parcela a parcela conta uma vez por parcela" },
  { chave: "bruto", titulo: "Bruto", tipo: "reais" },
  { chave: "taxas", titulo: "Taxas", tipo: "reais" },
  { chave: "liquido", titulo: "Líquido a receber", tipo: "reais" },
];

const COLUNAS_TRANSACOES: ColunaOrdenavel[] = [
  { chave: "dataHora", titulo: "Data e hora", destaque: true },
  { chave: "vendaNumero", titulo: "Cupom nº", tipo: "inteiro" },
  { chave: "nome", titulo: "Maquininha" },
  { chave: "forma", titulo: "Forma", rotulos: ROTULO_FORMA_PAGAMENTO_CURTO },
  { chave: "parcelas", titulo: "Parc.", tipo: "inteiro" },
  { chave: "bruto", titulo: "Bruto", tipo: "reais" },
  { chave: "taxa", titulo: "Taxa", tipo: "reais" },
  { chave: "liquido", titulo: "Líquido", tipo: "reais" },
  { chave: "nsu", titulo: "NSU", vazio: "-", className: "tabular" },
  { chave: "autorizacao", titulo: "Autorização", vazio: "-", className: "tabular" },
  { chave: "dataPrevistaRotulo", titulo: "Previsto pra", ajuda: "Crédito parcelado que cai parcela a parcela mostra a primeira e a última data" },
];

export default async function PaginaConciliacao({ searchParams }: PropsPaginaRelatorio) {
  await exigirAdmin();
  const params = await searchParams;
  const periodo = resolverPeriodo(params);
  const maquininhaParam = Array.isArray(params.maquininha) ? params.maquininha[0] : params.maquininha;
  const maquininhaId = maquininhaParam && /^\d+$/.test(maquininhaParam) ? Number(maquininhaParam) : null;
  const r = await relatorioConciliacao(periodo, maquininhaId);

  const extras: Record<string, string> = r.maquininhaId !== null ? { maquininha: String(r.maquininhaId) } : {};
  const hoje = paraDataInput(agora());
  const aReceberFuturo = r.aReceber.filter((a) => a.dataPrevista >= hoje);
  const liquidoFuturo = aReceberFuturo.reduce((s, a) => s + a.liquido, 0);
  const lancamentosReceber = r.aReceber.reduce((s, a) => s + a.quantidade, 0);
  const taxaMediaBp = r.totais.bruto > 0 ? Math.round((r.totais.taxas / r.totais.bruto) * 10000) : 0;

  return (
    <>
      <BarraRelatorio
        periodo={periodo}
        titulo="Conciliação de maquininhas"
        descricao="Quanto passou em cada maquininha, a taxa que ela ficou e quando o líquido cai na conta. Use a lista de transações pra bater com o extrato da adquirente."
        exportacao="conciliacao"
        extras={extras}
        filtros={
          <FiltroMaquininha
            maquininhas={r.maquininhas}
            maquininhaId={r.maquininhaId}
            temSemMaquininha={r.semMaquininha > 0}
          />
        }
      />

      {r.maquininhas.length === 0 ? (
        <Aviso tom="alerta" className="mb-5" titulo="Nenhuma maquininha cadastrada">
          Cadastre as maquininhas em Configurações. Enquanto isso, os cartões aparecem aqui como &quot;Sem maquininha&quot;
          com a taxa das Formas de pagamento.
        </Aviso>
      ) : null}
      {r.totais.quantidade === 0 ? (
        <Aviso tom="info" className="mb-5" titulo="Nenhum pagamento em maquininha neste período">
          Escolha outro período ou outra maquininha acima.
        </Aviso>
      ) : null}
      {r.semMaquininha > 0 && r.maquininhaId === null ? (
        <Aviso tom="info" className="mb-5">
          {r.semMaquininha.toLocaleString("pt-BR")} pagamento{r.semMaquininha === 1 ? "" : "s"} em cartão foi
          {r.semMaquininha === 1 ? "" : "ram"} registrado{r.semMaquininha === 1 ? "" : "s"} sem maquininha (antes do
          cadastro). Eles aparecem como &quot;Sem maquininha&quot;, com prazo zero.
        </Aviso>
      ) : null}
      {r.fiadoSemTaxa.quantidade > 0 ? (
        <Aviso tom="alerta" className="mb-5" titulo={`${formatarReais(r.fiadoSemTaxa.valor)} de fiado recebidos em cartão ou Pix não estão nesta lista`}>
          {r.fiadoSemTaxa.quantidade.toLocaleString("pt-BR")} recebimento{r.fiadoSemTaxa.quantidade === 1 ? "" : "s"} de fiado no período
          {r.fiadoSemTaxa.quantidade === 1 ? " foi feito" : " foram feitos"} em cartão ou Pix. O recebimento de fiado guarda só a forma, sem maquininha,
          NSU nem taxa, então esse valor aparece no extrato da adquirente sem linha aqui pra bater. Confira pelo extrato do cliente em Clientes.
        </Aviso>
      ) : null}

      <GradeIndicadores className="mb-6">
        <Indicador
          rotulo="Passou nas maquininhas"
          valor={formatarReais(r.totais.bruto)}
          detalhe={`${r.totais.quantidade.toLocaleString("pt-BR")} transaç${r.totais.quantidade === 1 ? "ão" : "ões"}${r.maquininhaNome ? ` · ${r.maquininhaNome}` : ""}`}
          icone={<Smartphone className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Taxas das maquininhas"
          valor={formatarReais(r.totais.taxas)}
          tom={r.totais.taxas > 0 ? "alerta" : "neutro"}
          detalhe={`Taxa média ${formatarPercentual(taxaMediaBp)} · débito ${formatarReais(r.totais.debitoTaxas)} · crédito ${formatarReais(r.totais.creditoTaxas)}`}
          icone={<CreditCard className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Líquido do período"
          valor={formatarReais(r.totais.liquido)}
          tom="primaria"
          detalhe="Bruto menos taxas: o que a adquirente repassa"
          icone={<Landmark className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Ainda a receber"
          valor={formatarReais(liquidoFuturo)}
          tom={liquidoFuturo > 0 ? "sucesso" : "neutro"}
          detalhe={
            aReceberFuturo.length
              ? `Previsto de hoje em diante, em ${aReceberFuturo.length} data${aReceberFuturo.length === 1 ? "" : "s"}`
              : "Tudo deste período já deve ter caído"
          }
          icone={<CalendarCheck className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <div className="mb-6 grid gap-5 lg:grid-cols-5">
        <Cartao className="relatorios-quebra lg:col-span-2">
          <CartaoCabecalho titulo="Por maquininha" descricao="Participação no valor bruto" />
          <CartaoConteudo>
            <GraficoRosca dados={r.porMaquininha.map((m) => ({ nome: m.nome, valor: m.bruto }))} formato="reais" />
          </CartaoConteudo>
        </Cartao>
        <div className="lg:col-span-3">
          <TabelaOrdenavel
            colunas={COLUNAS_MAQUININHAS}
            linhas={r.porMaquininha.map((m) => ({ ...m }))}
            chaveLinha="maquininhaId"
            ordemInicial={{ chave: "bruto", direcao: "desc" }}
            limite={0}
            totais={{
              nome: "Total",
              quantidade: r.totais.quantidade,
              bruto: r.totais.bruto,
              taxas: r.totais.taxas,
              liquido: r.totais.liquido,
              debitoBruto: r.totais.debitoBruto,
              creditoBruto: r.totais.creditoBruto,
              pixBruto: r.totais.pixBruto,
              participacaoBp: r.porMaquininha.length ? 10000 : 0,
            }}
            mensagemVazia="Nenhum pagamento em maquininha no período."
          />
          <p className="mt-2 text-xs text-texto-fraco">
            Débito, crédito e Pix mostram o valor bruto de cada forma. A taxa de cada transação é a que valia na hora da
            venda (contrato da maquininha).
          </p>
        </div>
      </div>

      <section className="mb-6 relatorios-quebra">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-texto-fraco" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-texto">A receber por data prevista</h3>
              <p className="text-sm text-texto-suave">
                Dia da venda mais o prazo da maquininha (dias corridos). Crédito parcelado com prazo de {PRAZO_SEM_ANTECIPACAO_DIAS} dias ou mais
                (sem antecipação) é dividido em parcelas iguais, uma a cada {INTERVALO_PARCELAS_DIAS} dias; com prazo menor (antecipação automática)
                cai inteiro na primeira data. Confira no extrato se caiu o líquido.
              </p>
            </div>
          </div>
          <LinkExportar tipo="conciliacao-receber" periodo={periodo} extras={extras} rotulo="CSV" tamanho="sm" />
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_RECEBER}
          linhas={r.aReceber.map((a) => ({ ...a, chave: `${a.dataPrevista}|${a.maquininhaId}` }))}
          chaveLinha="chave"
          ordemInicial={{ chave: "dataPrevista", direcao: "asc" }}
          limite={30}
          totais={{
            dataPrevistaRotulo: "Total",
            quantidade: lancamentosReceber,
            bruto: r.totais.bruto,
            taxas: r.totais.taxas,
            liquido: r.totais.liquido,
          }}
          mensagemVazia="Nada a receber no período."
        />
        {r.parcelados > 0 ? (
          <p className="mt-2 text-xs text-texto-fraco">
            {r.parcelados.toLocaleString("pt-BR")} pagamento{r.parcelados === 1 ? "" : "s"} em crédito parcelado {r.parcelados === 1 ? "foi dividido" : "foram divididos"}{" "}
            parcela a parcela. Se a maquininha antecipa o parcelado, cadastre o prazo real do crédito (ex.: 1 dia) em Configurações e o valor passa a cair
            inteiro na primeira data.
          </p>
        ) : null}
      </section>

      <section className="mb-6 relatorios-quebra">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Smartphone className="size-4 text-texto-fraco" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-texto">Por maquininha e dia</h3>
              <p className="text-sm text-texto-suave">Fechamento diário de cada maquininha, com o líquido por forma.</p>
            </div>
          </div>
          <LinkExportar tipo="conciliacao-dias" periodo={periodo} extras={extras} rotulo="CSV" tamanho="sm" />
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_DIAS}
          linhas={r.porDia.map((d) => ({ ...d, chave: `${d.dia}|${d.maquininhaId}` }))}
          chaveLinha="chave"
          ordemInicial={{ chave: "dia", direcao: "desc" }}
          limite={31}
          totais={{
            diaRotulo: "Total",
            quantidade: r.totais.quantidade,
            bruto: r.totais.bruto,
            taxas: r.totais.taxas,
            liquido: r.totais.liquido,
            debitoLiquido: r.totais.debitoLiquido,
            creditoLiquido: r.totais.creditoLiquido,
            pixLiquido: r.totais.pixLiquido,
          }}
          mensagemVazia="Nenhum pagamento em maquininha no período."
        />
      </section>

      <section className="relatorios-quebra">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ReceiptText className="size-4 text-texto-fraco" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-texto">Transações</h3>
              <p className="text-sm text-texto-suave">
                Uma linha por pagamento, com NSU e autorização do comprovante, pra bater com o extrato da adquirente.
              </p>
            </div>
          </div>
          <LinkExportar tipo="conciliacao" periodo={periodo} extras={extras} rotulo="CSV" tamanho="sm" />
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_TRANSACOES}
          linhas={r.transacoes.map((t) => ({
            pagamentoId: t.pagamentoId,
            dataHora: formatarDataHora(t.criadoEm),
            ordem: t.criadoEm.getTime(),
            vendaNumero: t.vendaNumero,
            nome: t.nome,
            forma: t.forma,
            parcelas: t.parcelas,
            bruto: t.bruto,
            taxa: t.taxa,
            liquido: t.liquido,
            nsu: t.nsu,
            autorizacao: t.autorizacao,
            dataPrevistaRotulo: t.parcelado
              ? `${t.dataPrevista.split("-").reverse().join("/")} a ${t.dataPrevistaFinal.split("-").reverse().join("/")} (${t.parcelas}x)`
              : t.dataPrevista.split("-").reverse().join("/"),
          }))}
          chaveLinha="pagamentoId"
          ordemInicial={{ chave: "ordem", direcao: "desc" }}
          limite={100}
          totais={{
            dataHora: "Total",
            bruto: r.totais.bruto,
            taxa: r.totais.taxas,
            liquido: r.totais.liquido,
          }}
          mensagemVazia="Nenhuma transação em maquininha no período."
        />
        {r.porMaquininha.some((m) => m.maquininhaId === SEM_MAQUININHA_ID) ? (
          <p className="mt-2 text-xs text-texto-fraco">
            &quot;Sem maquininha&quot; agrupa cartões registrados antes do cadastro das maquininhas; a taxa deles veio de
            Formas de pagamento e a data prevista é o próprio dia da venda.
          </p>
        ) : null}
      </section>
    </>
  );
}
