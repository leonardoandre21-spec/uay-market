import Link from "next/link";
import { AlertTriangle, Boxes, CalendarClock, PackagePlus, Tag, TrendingDown } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { formatarReais } from "@/lib/dinheiro";
import { obterVisaoGeralEstoque } from "@/lib/servicos/estoque";
import { Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { LinkBotao } from "./_componentes/link-botao";
import { TabelaEstoque, type FiltroEstoque } from "./_componentes/tabela-estoque";

export const dynamic = "force-dynamic";

const FILTROS_VALIDOS: FiltroEstoque[] = ["TODOS", "ABAIXO_MINIMO", "ZERADOS", "NEGATIVOS", "REPOR", "VALIDADE"];

export default async function PaginaEstoque({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const [sessao, { filtro }] = await Promise.all([exigirSessao(), searchParams]);
  const visao = await obterVisaoGeralEstoque();
  const { indicadores } = visao;
  const filtroInicial = FILTROS_VALIDOS.includes(filtro as FiltroEstoque) ? (filtro as FiltroEstoque) : "TODOS";
  const zeradosOuNegativos = indicadores.zerados + indicadores.negativos;

  return (
    <div>
      <CabecalhoPagina
        titulo="Estoque"
        descricao="Quanto tem de cada produto, quanto vale e o que precisa de atenção."
        acoes={
          <>
            <LinkBotao href="/estoque/perdas" variante="contorno">
              <TrendingDown className="size-4" aria-hidden /> Perdas
            </LinkBotao>
            <LinkBotao href="/estoque/vencimentos" variante="contorno">
              <CalendarClock className="size-4" aria-hidden /> Vencimentos
            </LinkBotao>
            {sessao.papel === "ADMIN" ? (
              <LinkBotao href="/estoque/entradas/nova">
                <PackagePlus className="size-4" aria-hidden /> Nova entrada
              </LinkBotao>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Indicador
          rotulo="Estoque a custo"
          valor={formatarReais(indicadores.valorCusto)}
          detalhe={`${indicadores.totalProdutos} produto(s) ativo(s)`}
          icone={<Boxes className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Estoque a preço de venda"
          valor={formatarReais(indicadores.valorVenda)}
          detalhe={
            indicadores.valorCusto > 0
              ? `Margem potencial de ${formatarReais(indicadores.valorVenda - indicadores.valorCusto)}`
              : "Sem custo cadastrado"
          }
          tom="primaria"
          icone={<Tag className="size-4" aria-hidden />}
        />
        <Link href="/estoque?filtro=ABAIXO_MINIMO" className="block rounded-padrao focus-visible:outline-2 focus-visible:outline-primaria">
          <Indicador
            rotulo="Abaixo do mínimo"
            valor={indicadores.abaixoMinimo}
            detalhe="Precisam de reposição"
            tom={indicadores.abaixoMinimo > 0 ? "alerta" : "neutro"}
            icone={<AlertTriangle className="size-4" aria-hidden />}
            className="h-full transition-colors hover:bg-superficie-2"
          />
        </Link>
        <Link href="/estoque?filtro=REPOR" className="block rounded-padrao focus-visible:outline-2 focus-visible:outline-primaria">
          <Indicador
            rotulo="Zerados ou negativos"
            valor={zeradosOuNegativos}
            detalhe={`${indicadores.zerados} zerado(s) · ${indicadores.negativos} negativo(s)`}
            tom={indicadores.negativos > 0 ? "perigo" : zeradosOuNegativos > 0 ? "alerta" : "neutro"}
            icone={<TrendingDown className="size-4" aria-hidden />}
            className="h-full transition-colors hover:bg-superficie-2"
          />
        </Link>
        <Link href="/estoque/vencimentos" className="block rounded-padrao focus-visible:outline-2 focus-visible:outline-primaria">
          <Indicador
            rotulo={`Vencendo em ${indicadores.vencendo.dias} dias`}
            valor={indicadores.vencendo.lotes}
            detalhe={
              indicadores.vencendo.lotes > 0
                ? `${formatarReais(indicadores.vencendo.valorCusto)} a custo · ${indicadores.vencendo.vencidos} já vencido(s)`
                : "Nenhum lote vencendo"
            }
            tom={indicadores.vencendo.vencidos > 0 ? "perigo" : indicadores.vencendo.lotes > 0 ? "alerta" : "neutro"}
            icone={<CalendarClock className="size-4" aria-hidden />}
            className="h-full transition-colors hover:bg-superficie-2"
          />
        </Link>
      </div>

      <TabelaEstoque key={filtroInicial} produtos={visao.produtos} categorias={visao.categorias} filtroInicial={filtroInicial} />
    </div>
  );
}
