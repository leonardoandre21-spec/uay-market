import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { agora, formatarData, formatarDataHora, limitesDoDia, limitesDoMes, paraDataInput, parseDataInput, subDays, subMonths } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { MOTIVOS_PERDA, ROTULO_MOTIVO_PERDA } from "@/lib/rotulos";
import { listarPerdas } from "@/lib/servicos/estoque";
import { totalizarPerdasPorMotivo } from "@/lib/servicos/estoque-calculos";
import { Botao } from "@/components/ui/botao";
import { Cartao, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { Campo, Entrada } from "@/components/ui/campo";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { cn } from "@/lib/utils";
import { BotaoRegistrarPerda, TabelaPerdas, type PerdaLinha } from "../_componentes/tabela-perdas";

export const dynamic = "force-dynamic";

function resolverPeriodo(de?: string, ate?: string): { de: Date; ate: Date; deInput: string; ateInput: string } {
  const mes = limitesDoMes();
  const dataDe = parseDataInput(de);
  const dataAte = parseDataInput(ate);
  const inicio = dataDe ? limitesDoDia(dataDe).inicio : mes.inicio;
  const fim = dataAte ? limitesDoDia(dataAte).fim : dataDe ? limitesDoDia(agora()).fim : mes.fim;
  return { de: inicio, ate: fim, deInput: paraDataInput(inicio), ateInput: paraDataInput(fim) };
}

export default async function PaginaPerdas({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const [sessao, params] = await Promise.all([exigirSessao(), searchParams]);
  const periodo = resolverPeriodo(params.de, params.ate);
  const perdas = await listarPerdas({ de: periodo.de, ate: periodo.ate });
  const totais = totalizarPerdasPorMotivo(perdas);
  const totalValor = perdas.reduce((acc, p) => acc + p.valorTotal, 0);
  const motivosComValor = MOTIVOS_PERDA.filter((m) => totais[m].registros > 0);

  const linhas: PerdaLinha[] = perdas.map((p) => ({
    id: p.id,
    data: formatarDataHora(p.data),
    produtoId: p.produto.id,
    produtoNome: p.produto.nome,
    unidade: p.produto.unidade,
    loteValidade: p.lote ? formatarData(p.lote.validade) : null,
    motivo: p.motivo,
    observacao: p.observacao,
    quantidade: p.quantidade,
    custoUnitario: p.custoUnitario,
    valorTotal: p.valorTotal,
    usuarioNome: p.usuario?.nome ?? null,
  }));

  const hoje = agora();
  const mesPassado = limitesDoMes(subMonths(hoje, 1));
  const atalhos = [
    { rotulo: "Hoje", de: paraDataInput(hoje), ate: paraDataInput(hoje) },
    { rotulo: "Últimos 7 dias", de: paraDataInput(subDays(hoje, 6)), ate: paraDataInput(hoje) },
    { rotulo: "Últimos 30 dias", de: paraDataInput(subDays(hoje, 29)), ate: paraDataInput(hoje) },
    { rotulo: "Este mês", de: paraDataInput(limitesDoMes().inicio), ate: paraDataInput(limitesDoMes().fim) },
    { rotulo: "Mês passado", de: paraDataInput(mesPassado.inicio), ate: paraDataInput(mesPassado.fim) },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Perdas"
        descricao="Produtos vencidos, quebrados, furtados ou consumidos. Tudo aqui sai do lucro real."
        acoes={<BotaoRegistrarPerda />}
      />

      <Cartao className="mb-6">
        <CartaoConteudo className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Campo rotulo="De" htmlFor="perdas-de">
              <Entrada id="perdas-de" type="date" name="de" defaultValue={periodo.deInput} className="w-44" />
            </Campo>
            <Campo rotulo="Até" htmlFor="perdas-ate">
              <Entrada id="perdas-ate" type="date" name="ate" defaultValue={periodo.ateInput} className="w-44" />
            </Campo>
            <Botao type="submit" variante="secundaria">
              <CalendarRange className="size-4" aria-hidden /> Aplicar período
            </Botao>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {atalhos.map((a) => {
              const ativo = a.de === periodo.deInput && a.ate === periodo.ateInput;
              return (
                <Link
                  key={a.rotulo}
                  href={`/estoque/perdas?de=${a.de}&ate=${a.ate}`}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    ativo ? "border-primaria bg-primaria-suave text-primaria" : "border-borda text-texto-suave hover:bg-superficie-2",
                  )}
                >
                  {a.rotulo}
                </Link>
              );
            })}
          </div>
        </CartaoConteudo>
      </Cartao>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo="Total de perdas no período"
          valor={formatarReais(totalValor)}
          detalhe={`${perdas.length} registro(s) de ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`}
          tom={totalValor > 0 ? "perigo" : "neutro"}
        />
        {motivosComValor.map((m) => (
          <Indicador
            key={m}
            rotulo={ROTULO_MOTIVO_PERDA[m]}
            valor={formatarReais(totais[m].valor)}
            detalhe={`${totais[m].registros} registro(s)`}
            tom="neutro"
          />
        ))}
      </div>

      <TabelaPerdas perdas={linhas} admin={sessao.papel === "ADMIN"} />
    </div>
  );
}
