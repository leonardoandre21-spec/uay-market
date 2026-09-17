import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CreditCard,
  HandCoins,
  PieChart,
  Receipt,
  Smartphone,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { resumoHub } from "@/lib/servicos/relatorios";
import { resolverPeriodo, type Periodo } from "@/lib/servicos/relatorios-calculos";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, Indicador } from "@/components/ui/cartao";
import { GradeIndicadores } from "@/components/ui/pagina";
import { BarraRelatorio } from "./_componentes/barra-relatorio";
import type { PropsPaginaRelatorio } from "./_componentes/parametros";

function CartaoRelatorio({
  href,
  periodo,
  titulo,
  descricao,
  destaque,
  Icone,
}: {
  href: string;
  periodo: Periodo;
  titulo: string;
  descricao: string;
  destaque: string;
  Icone: typeof Trophy;
}) {
  return (
    <Link
      href={`${href}?de=${periodo.de}&ate=${periodo.ate}`}
      className="group flex h-full flex-col rounded-padrao border border-borda bg-superficie p-5 shadow-padrao transition-colors hover:border-primaria/40 hover:bg-primaria-suave/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primaria-suave text-primaria">
          <Icone className="size-5" aria-hidden />
        </span>
        <ArrowRight className="size-4 text-texto-fraco transition-transform group-hover:translate-x-0.5 group-hover:text-primaria" aria-hidden />
      </div>
      <h3 className="mt-4 text-base font-semibold text-texto">{titulo}</h3>
      <p className="mt-1 flex-1 text-sm text-texto-suave">{descricao}</p>
      <p className="mt-3 text-sm font-medium text-texto">{destaque}</p>
    </Link>
  );
}

export default async function PaginaRelatorios({ searchParams }: PropsPaginaRelatorio) {
  await exigirAdmin();
  const periodo = resolverPeriodo(await searchParams);
  const resumo = await resumoHub(periodo);

  const tomLucro = resumo.lucroReal > 0 ? "sucesso" : resumo.lucroReal < 0 ? "perigo" : "neutro";
  const plural = (n: number, singular: string, pluralTexto: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? singular : pluralTexto}`;

  return (
    <>
      <BarraRelatorio
        periodo={periodo}
        titulo="Resumo do período"
        descricao="Visão geral. Abra cada relatório pra ver os detalhes."
      />

      {resumo.vendas === 0 ? (
        <Aviso tom="info" className="mb-5 nao-imprimir" titulo="Nenhuma venda concluída neste período">
          Escolha outro período acima. Estoque parado e fiado em aberto não dependem do período e continuam valendo.
        </Aviso>
      ) : null}

      <GradeIndicadores className="mb-6">
        <Indicador
          rotulo="Receita"
          valor={formatarReais(resumo.receita)}
          detalhe={`${plural(resumo.vendas, "venda", "vendas")} · ticket médio ${formatarReais(resumo.ticketMedio)}`}
          icone={<Receipt className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Lucro bruto"
          valor={formatarReais(resumo.lucroAposTaxas)}
          detalhe={`Receita menos custo das mercadorias (${formatarReais(resumo.cmv)}) e taxas (${formatarReais(resumo.taxas)})`}
          icone={<TrendingUp className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Lucro real"
          valor={formatarReais(resumo.lucroReal)}
          tom={tomLucro}
          detalhe={`Margem ${formatarPercentual(resumo.margemRealBp, 1)} · já tirando taxas, perdas e despesas`}
          icone={<Wallet className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Fiado em aberto"
          valor={formatarReais(resumo.fiadoEmAberto)}
          tom={resumo.fiadoEmAberto > 0 ? "alerta" : "neutro"}
          detalhe={`Saldo atual de ${plural(resumo.clientesDevendo, "cliente devendo", "clientes devendo")}${
            resumo.creditoClientes > 0 ? ` · ${formatarReais(resumo.creditoClientes)} de crédito a favor de clientes` : ""
          }`}
          icone={<HandCoins className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <Cartao className="mb-6 px-5 py-4">
        <h3 className="text-sm font-semibold text-texto">Como o lucro real foi calculado</h3>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <LinhaConta rotulo="Receita das vendas" valor={resumo.receita} />
          <LinhaConta rotulo="Custo das mercadorias (CMV)" valor={-resumo.cmv} />
          <LinhaConta rotulo="Taxas de cartão e Pix" valor={-resumo.taxas} />
          <LinhaConta rotulo="Perdas (vencidos, avarias...)" valor={-resumo.perdas} />
          <LinhaConta rotulo="Despesas e boletos pagos" valor={-resumo.despesas} />
          <LinhaConta rotulo="Lucro real" valor={resumo.lucroReal} destaque />
        </dl>
      </Cartao>

      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-fraco nao-imprimir">Relatórios</h3>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 nao-imprimir">
        <CartaoRelatorio
          href="/relatorios/mais-vendidos"
          periodo={periodo}
          Icone={Trophy}
          titulo="Mais vendidos"
          descricao="Ranking por quantidade, receita e lucro, com filtro por categoria. Mostra também o que não vendeu nada."
          destaque={`${plural(resumo.produtosDistintos, "produto vendido", "produtos vendidos")} · ${plural(resumo.encalhados, "sem venda", "sem venda")}`}
        />
        <CartaoRelatorio
          href="/relatorios/lucro"
          periodo={periodo}
          Icone={TrendingUp}
          titulo="Lucro"
          descricao="Receita, custo, taxas, perdas e despesas. Lucro por produto, por categoria e por dia."
          destaque={`Lucro real ${formatarReais(resumo.lucroReal)}`}
        />
        <CartaoRelatorio
          href="/relatorios/pagamentos"
          periodo={periodo}
          Icone={CreditCard}
          titulo="Pagamentos e movimento"
          descricao="Formas de pagamento e taxas, vendas por operador, horários e dias de maior movimento."
          destaque={`Taxas pagas ${formatarReais(resumo.taxas)}`}
        />
        <CartaoRelatorio
          href="/relatorios/abc"
          periodo={periodo}
          Icone={PieChart}
          titulo="Curva ABC"
          descricao="Quais produtos concentram a receita (A), quais ajudam (B) e quais quase não pesam (C)."
          destaque="Priorize compras e reposição"
        />
        <CartaoRelatorio
          href="/relatorios/estoque"
          periodo={periodo}
          Icone={Boxes}
          titulo="Giro de estoque"
          descricao="Quanto cada produto gira, quantos dias o estoque dura e quanto dinheiro está parado na prateleira."
          destaque={`${plural(resumo.encalhados, "produto parado", "produtos parados")}`}
        />
        <CartaoRelatorio
          href="/relatorios/clientes"
          periodo={periodo}
          Icone={Users}
          titulo="Clientes"
          descricao="Quem mais compra, ticket médio por cliente e o fiado em aberto de cada um."
          destaque={`Fiado em aberto ${formatarReais(resumo.fiadoEmAberto)}`}
        />
        <CartaoRelatorio
          href="/relatorios/conciliacao"
          periodo={periodo}
          Icone={Smartphone}
          titulo="Conciliação de maquininhas"
          descricao="Quanto passou em cada maquininha (InfinitePay, Sipag...), taxas, líquido e a data prevista de cair na conta. Transações com NSU pra bater com o extrato."
          destaque={`Taxas pagas ${formatarReais(resumo.taxas)}`}
        />
      </div>
    </>
  );
}

function LinhaConta({ rotulo, valor, destaque = false }: { rotulo: string; valor: number; destaque?: boolean }) {
  const cor = destaque ? (valor > 0 ? "text-sucesso" : valor < 0 ? "text-perigo" : "text-texto") : "text-texto";
  return (
    <div className={`flex items-baseline justify-between gap-3 ${destaque ? "border-t border-borda pt-2 font-semibold sm:col-span-2 lg:col-span-3" : ""}`}>
      <dt className={destaque ? "text-texto" : "text-texto-suave"}>{rotulo}</dt>
      <dd className={`tabular ${cor}`}>{valor < 0 ? `- ${formatarReais(Math.abs(valor))}` : formatarReais(valor)}</dd>
    </div>
  );
}
