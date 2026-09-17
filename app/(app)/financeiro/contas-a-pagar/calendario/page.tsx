import { ArrowLeft } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { agora, formatarData } from "@/lib/datas";
import { listarContasDoMesParaCalendario } from "@/lib/servicos/financeiro";
import { diaDoMes, diasAteVencimento, gradeDoMes, rotuloParcela } from "@/lib/servicos/financeiro-calculos";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { LinkBotao } from "../../_componentes/link-botao";
import { mesDaUrl, type ParametrosBusca } from "../../_componentes/mes-url";
import { NavegacaoMes } from "../../_componentes/navegacao-mes";
import { CalendarioVencimentos, type ContaCalendario } from "./_componentes/calendario-vencimentos";

export const dynamic = "force-dynamic";

export default async function PaginaCalendarioVencimentos({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirAdmin();
  const sp = await searchParams;
  const m = mesDaUrl(sp);
  const hoje = agora();
  const contasDb = await listarContasDoMesParaCalendario(m.mes);

  const contas: ContaCalendario[] = contasDb.map((c) => ({
    id: c.id,
    dia: diaDoMes(c.vencimento),
    descricao: c.descricao,
    valor: c.status === "PAGA" ? (c.valorPago ?? c.valor) : c.valor,
    status: c.status,
    dias: diasAteVencimento(c.vencimento, hoje),
    vencimentoFormatado: formatarData(c.vencimento),
    fornecedorNome: c.fornecedor?.nome ?? null,
    categoriaNome: c.categoria?.nome ?? null,
    recorrenciaMensal: c.recorrencia === "MENSAL",
    diaVencimento: c.diaVencimento,
    parcela: rotuloParcela(c.parcelaAtual, c.totalParcelas),
  }));

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Calendário de vencimentos"
        descricao="Quanto vence em cada dia do mês. Clique no dia pra ver as contas."
        acoes={
          <>
            <NavegacaoMes mesAtual={m.chave} mesAnterior={m.anterior} mesSeguinte={m.seguinte} mesDeHoje={m.hoje} />
            <LinkBotao href={`/financeiro/contas-a-pagar${m.ehMesAtual ? "" : `?mes=${m.chave}`}`} variante="contorno">
              <ArrowLeft className="size-4" aria-hidden />
              Lista de boletos
            </LinkBotao>
          </>
        }
      />
      <CalendarioVencimentos
        key={m.chave}
        grade={gradeDoMes(m.mes)}
        contas={contas}
        diaDeHoje={m.ehMesAtual ? diaDoMes(hoje) : null}
        rotuloMes={m.rotulo}
      />
    </div>
  );
}
