import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { agora, paraDataInput } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { listarLotesComSaldo } from "@/lib/servicos/estoque";
import { FAIXAS_VENCIMENTO, ROTULO_FAIXA_VENCIMENTO, resumirLotesPorFaixa, type FaixaVencimento } from "@/lib/servicos/estoque-calculos";
import { Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, GradeIndicadores } from "@/components/ui/pagina";
import { TabelaVencimentos } from "../_componentes/tabela-vencimentos";

export const dynamic = "force-dynamic";

const TOM_FAIXA: Record<FaixaVencimento, "perigo" | "alerta" | "info" | "neutro"> = {
  VENCIDO: "perigo",
  ATE_7_DIAS: "alerta",
  DE_8_A_30_DIAS: "info",
  MAIS_DE_30_DIAS: "neutro",
};

const DICA_FAIXA: Record<FaixaVencimento, string> = {
  VENCIDO: "Tire da prateleira e registre como perda",
  ATE_7_DIAS: "Hora de colocar em promoção",
  DE_8_A_30_DIAS: "Fique de olho",
  MAIS_DE_30_DIAS: "Tranquilo por enquanto",
};

export default async function PaginaVencimentos({ searchParams }: { searchParams: Promise<{ faixa?: string }> }) {
  const [sessao, { faixa }] = await Promise.all([exigirSessao(), searchParams]);
  const lotes = await listarLotesComSaldo();
  const resumo = resumirLotesPorFaixa(lotes);
  const faixaInicial = FAIXAS_VENCIMENTO.includes(faixa as FaixaVencimento) ? (faixa as FaixaVencimento) : "";
  const totalValor = lotes.reduce((acc, l) => acc + l.valorCusto, 0);

  return (
    <div>
      <CabecalhoPagina
        titulo="Vencimentos"
        descricao={`${lotes.length} lote(s) com saldo, ${formatarReais(totalValor)} a custo. Venda antes de vencer ou registre a perda.`}
      />

      <GradeIndicadores className="mb-6">
        {FAIXAS_VENCIMENTO.map((f) => {
          const r = resumo[f];
          return (
            <Link key={f} href={faixaInicial === f ? "/estoque/vencimentos" : `/estoque/vencimentos?faixa=${f}`} className="block rounded-padrao focus-visible:outline-2 focus-visible:outline-primaria">
              <Indicador
                rotulo={ROTULO_FAIXA_VENCIMENTO[f]}
                valor={r.lotes}
                detalhe={r.lotes > 0 ? `${formatarReais(r.valorCusto)} a custo · ${DICA_FAIXA[f]}` : "Nenhum lote"}
                tom={r.lotes > 0 ? TOM_FAIXA[f] : "neutro"}
                icone={<CalendarClock className="size-4" aria-hidden />}
                className={faixaInicial === f ? "h-full border-primaria ring-2 ring-primaria/20" : "h-full transition-colors hover:bg-superficie-2"}
              />
            </Link>
          );
        })}
      </GradeIndicadores>

      <TabelaVencimentos key={faixaInicial} lotes={lotes} faixaInicial={faixaInicial} hoje={paraDataInput(agora())} admin={sessao.papel === "ADMIN"} />
    </div>
  );
}
