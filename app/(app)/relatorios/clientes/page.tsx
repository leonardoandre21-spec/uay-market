import { HandCoins, Receipt, UserCheck, Users } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { formatarTelefone } from "@/lib/utils";
import { relatorioClientes } from "@/lib/servicos/relatorios";
import { resolverPeriodo } from "@/lib/servicos/relatorios-calculos";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { GradeIndicadores } from "@/components/ui/pagina";
import { BarraRelatorio } from "../_componentes/barra-relatorio";
import { GraficoBarrasHorizontais } from "../_componentes/graficos";
import { LinkExportar } from "../_componentes/link-exportar";
import type { PropsPaginaRelatorio } from "../_componentes/parametros";
import { TabelaOrdenavel, type ColunaOrdenavel } from "../_componentes/tabela-ordenavel";

const COLUNAS_RANKING: ColunaOrdenavel[] = [
  { chave: "nome", titulo: "Cliente", destaque: true },
  { chave: "compras", titulo: "Compras", tipo: "inteiro" },
  { chave: "total", titulo: "Total gasto", tipo: "reais" },
  { chave: "ticketMedio", titulo: "Ticket médio", tipo: "reais" },
  { chave: "participacaoBp", titulo: "% do identificado", tipo: "percentual", ajuda: "Parte da receita das vendas com cliente identificado" },
];

const COLUNAS_FIADO: ColunaOrdenavel[] = [
  { chave: "nome", titulo: "Cliente", destaque: true },
  { chave: "telefoneFormatado", titulo: "Telefone", vazio: "Sem telefone" },
  { chave: "saldo", titulo: "Saldo em aberto", tipo: "reais" },
  { chave: "limite", titulo: "Limite", tipo: "reais" },
  { chave: "usoLimite", titulo: "Uso do limite", tipo: "selo", numerico: false, tonsSelo: { "Sem limite": "perigo", Estourado: "perigo", Alto: "alerta", Normal: "sucesso" } },
  { chave: "usoLimiteBp", titulo: "% usado", tipo: "percentual" },
];

function faixaUsoLimite(saldo: number, limite: number): "Sem limite" | "Estourado" | "Alto" | "Normal" {
  if (limite <= 0) return "Sem limite";
  if (saldo > limite) return "Estourado";
  if (saldo * 10 >= limite * 8) return "Alto";
  return "Normal";
}

export default async function PaginaClientes({ searchParams }: PropsPaginaRelatorio) {
  await exigirAdmin();
  const periodo = resolverPeriodo(await searchParams);
  const { ranking, fiado, resumo } = await relatorioClientes(periodo);

  const top10 = ranking.slice(0, 10).map((c) => ({
    nome: c.nome,
    valor: c.total,
    extras: [
      { rotulo: "Compras", valor: c.compras.toLocaleString("pt-BR") },
      { rotulo: "Ticket médio", valor: formatarReais(c.ticketMedio) },
    ],
  }));

  return (
    <>
      <BarraRelatorio
        periodo={periodo}
        titulo="Clientes"
        descricao="Quem mais compra no período e quanto cada um deve no fiado hoje."
        exportacao="clientes"
      />

      {resumo.vendas === 0 ? (
        <Aviso tom="info" className="mb-5" titulo="Nenhuma venda concluída neste período">
          O fiado em aberto não depende do período e continua listado abaixo.
        </Aviso>
      ) : resumo.vendasIdentificadas === 0 ? (
        <Aviso tom="info" className="mb-5" titulo="Nenhuma venda com cliente identificado">
          Pra este relatório funcionar, informe o cliente no caixa na hora da venda (obrigatório só no fiado).
        </Aviso>
      ) : null}

      <GradeIndicadores className="mb-6">
        <Indicador
          rotulo="Clientes que compraram"
          valor={resumo.clientesDistintos.toLocaleString("pt-BR")}
          detalhe="Clientes diferentes identificados nas vendas"
          icone={<Users className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Vendas identificadas"
          valor={formatarPercentual(resumo.percentualIdentificadasBp, 0)}
          detalhe={`${resumo.vendasIdentificadas.toLocaleString("pt-BR")} de ${resumo.vendas.toLocaleString("pt-BR")} vendas tinham cliente`}
          icone={<UserCheck className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Receita identificada"
          valor={formatarReais(resumo.receitaIdentificada)}
          detalhe="Total das vendas com cliente informado"
          icone={<Receipt className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Fiado em aberto"
          valor={formatarReais(resumo.fiadoEmAberto)}
          tom={resumo.fiadoEmAberto > 0 ? "alerta" : "neutro"}
          detalhe={`${resumo.clientesComFiado.toLocaleString("pt-BR")} clientes devendo · saldo de hoje, sem filtro de período`}
          icone={<HandCoins className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <div className="mb-6 grid gap-5 lg:grid-cols-5">
        <Cartao className="relatorios-quebra lg:col-span-2">
          <CartaoCabecalho titulo="Top 10 clientes" descricao="Por total gasto no período" />
          <CartaoConteudo>
            <GraficoBarrasHorizontais dados={top10} formato="reais" rotuloValor="Total gasto" />
          </CartaoConteudo>
        </Cartao>
        <div className="lg:col-span-3">
          <div className="mb-3">
            <h3 className="text-base font-semibold text-texto">Clientes que mais compram</h3>
            <p className="text-sm text-texto-suave">Só vendas em que o cliente foi informado no caixa.</p>
          </div>
          <TabelaOrdenavel
            colunas={COLUNAS_RANKING}
            linhas={ranking.map((c) => ({ ...c }))}
            chaveLinha="clienteId"
            ordemInicial={{ chave: "total", direcao: "desc" }}
            numerar
            limite={25}
            totais={{
              nome: "Total",
              compras: resumo.vendasIdentificadas,
              total: resumo.receitaIdentificada,
              ticketMedio: resumo.vendasIdentificadas > 0 ? Math.round(resumo.receitaIdentificada / resumo.vendasIdentificadas) : 0,
              participacaoBp: ranking.length ? 10000 : 0,
            }}
            mensagemVazia="Nenhuma venda com cliente identificado no período."
          />
        </div>
      </div>

      <section className="relatorios-quebra">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-texto">Fiado em aberto por cliente</h3>
            <p className="text-sm text-texto-suave">Saldo devedor de hoje (compras fiado menos pagamentos), independente do período escolhido.</p>
          </div>
          <LinkExportar tipo="fiado" periodo={periodo} rotulo="CSV do fiado" tamanho="sm" />
        </div>
        <TabelaOrdenavel
          colunas={COLUNAS_FIADO}
          linhas={fiado.map((f) => ({
            ...f,
            telefoneFormatado: f.telefone ? formatarTelefone(f.telefone) : null,
            usoLimite: faixaUsoLimite(f.saldo, f.limite),
            usoLimiteBp: f.limite > 0 ? f.usoLimiteBp : null,
          }))}
          chaveLinha="clienteId"
          ordemInicial={{ chave: "saldo", direcao: "desc" }}
          limite={0}
          totais={{ nome: "Total", saldo: resumo.fiadoEmAberto }}
          mensagemVazia="Nenhum cliente com fiado em aberto."
        />
      </section>
    </>
  );
}
