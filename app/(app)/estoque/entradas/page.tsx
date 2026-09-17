import Link from "next/link";
import { CalendarRange, PackagePlus } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { agora, formatarData, formatarDataHora, limitesDoDia, limitesDoMes, paraDataInput, parseDataInput, subDays, subMonths } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { listarEntradas } from "@/lib/servicos/estoque";
import { Botao } from "@/components/ui/botao";
import { Cartao, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { Campo, Entrada } from "@/components/ui/campo";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { cn } from "@/lib/utils";
import { LinkBotao } from "../_componentes/link-botao";

export const dynamic = "force-dynamic";

function resolverPeriodo(de?: string, ate?: string) {
  if (de === "todas") return { de: null, ate: null, deInput: "", ateInput: "", todas: true };
  const mes = limitesDoMes();
  const dataDe = parseDataInput(de);
  const dataAte = parseDataInput(ate);
  const inicio = dataDe ? limitesDoDia(dataDe).inicio : mes.inicio;
  const fim = dataAte ? limitesDoDia(dataAte).fim : dataDe ? limitesDoDia(agora()).fim : mes.fim;
  return { de: inicio, ate: fim, deInput: paraDataInput(inicio), ateInput: paraDataInput(fim), todas: false };
}

export default async function PaginaEntradas({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const [, params] = await Promise.all([exigirAdmin(), searchParams]);
  const periodo = resolverPeriodo(params.de, params.ate);
  const entradas = await listarEntradas({ de: periodo.de, ate: periodo.ate });
  const validas = entradas.filter((e) => !e.estornada);
  const totalCompras = validas.reduce((acc, e) => acc + e.valorTotal + e.frete, 0);
  const totalFrete = validas.reduce((acc, e) => acc + e.frete, 0);
  const comBoleto = validas.filter((e) => e._count.contas > 0).length;

  const hoje = agora();
  const mesPassado = limitesDoMes(subMonths(hoje, 1));
  const atalhos = [
    { rotulo: "Últimos 30 dias", href: `/estoque/entradas?de=${paraDataInput(subDays(hoje, 29))}&ate=${paraDataInput(hoje)}`, ativo: periodo.deInput === paraDataInput(subDays(hoje, 29)) && periodo.ateInput === paraDataInput(hoje) },
    { rotulo: "Este mês", href: `/estoque/entradas?de=${paraDataInput(limitesDoMes().inicio)}&ate=${paraDataInput(limitesDoMes().fim)}`, ativo: !periodo.todas && periodo.deInput === paraDataInput(limitesDoMes().inicio) && periodo.ateInput === paraDataInput(limitesDoMes().fim) },
    { rotulo: "Mês passado", href: `/estoque/entradas?de=${paraDataInput(mesPassado.inicio)}&ate=${paraDataInput(mesPassado.fim)}`, ativo: periodo.deInput === paraDataInput(mesPassado.inicio) && periodo.ateInput === paraDataInput(mesPassado.fim) },
    { rotulo: "Todas", href: "/estoque/entradas?de=todas", ativo: periodo.todas },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Entradas de mercadoria"
        descricao="Compras lançadas no estoque. Cada entrada atualiza o custo médio e cria os lotes com validade."
        acoes={
          <LinkBotao href="/estoque/entradas/nova">
            <PackagePlus className="size-4" aria-hidden /> Nova entrada
          </LinkBotao>
        }
      />

      <Cartao className="mb-6">
        <CartaoConteudo className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Campo rotulo="De" htmlFor="entradas-de">
              <Entrada id="entradas-de" type="date" name="de" defaultValue={periodo.deInput} className="w-44" />
            </Campo>
            <Campo rotulo="Até" htmlFor="entradas-ate">
              <Entrada id="entradas-ate" type="date" name="ate" defaultValue={periodo.ateInput} className="w-44" />
            </Campo>
            <Botao type="submit" variante="secundaria">
              <CalendarRange className="size-4" aria-hidden /> Aplicar período
            </Botao>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {atalhos.map((a) => (
              <Link
                key={a.rotulo}
                href={a.href}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  a.ativo ? "border-primaria bg-primaria-suave text-primaria" : "border-borda text-texto-suave hover:bg-superficie-2",
                )}
              >
                {a.rotulo}
              </Link>
            ))}
          </div>
        </CartaoConteudo>
      </Cartao>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador
          rotulo="Total comprado"
          valor={formatarReais(totalCompras)}
          detalhe={periodo.todas ? "Todas as entradas" : `De ${formatarData(periodo.de!)} a ${formatarData(periodo.ate!)}`}
          tom="primaria"
        />
        <Indicador rotulo="Entradas" valor={validas.length} detalhe={entradas.length !== validas.length ? `${entradas.length - validas.length} estornada(s) fora da soma` : "Notas lançadas no período"} />
        <Indicador rotulo="Frete pago" valor={formatarReais(totalFrete)} detalhe={`${comBoleto} entrada(s) com boleto gerado`} />
      </div>

      {entradas.length === 0 ? (
        <EstadoVazio
          icone={<PackagePlus />}
          titulo="Nenhuma entrada neste período"
          descricao="Quando chegar mercadoria do fornecedor, lance a nota aqui pra atualizar estoque e custo."
          acao={
            <LinkBotao href="/estoque/entradas/nova">
              <PackagePlus className="size-4" aria-hidden /> Lançar entrada
            </LinkBotao>
          }
        />
      ) : (
        <Tabela>
          <Thead>
            <Tr>
              <Th>Data</Th>
              <Th>Fornecedor</Th>
              <Th>Nota</Th>
              <Th numerico>Itens</Th>
              <Th numerico>Mercadoria</Th>
              <Th numerico>Frete</Th>
              <Th numerico>Total</Th>
              <Th>Lançado por</Th>
              <Th className="text-right">Detalhes</Th>
            </Tr>
          </Thead>
          <Tbody>
            {entradas.map((e) => (
              <Tr key={e.id} className={cn(e.estornada && "opacity-60")}>
                <Td className="whitespace-nowrap">
                  <p className="text-texto">{formatarData(e.data)}</p>
                  <p className="text-xs text-texto-fraco">lançada {formatarDataHora(e.criadoEm)}</p>
                </Td>
                <Td>
                  <p className="font-medium text-texto">{e.fornecedor?.nome ?? <span className="font-normal text-texto-fraco">Sem fornecedor</span>}</p>
                  <div className="mt-0.5 flex gap-1">
                    {e.estornada ? <Selo tom="perigo">Estornada</Selo> : null}
                    {e._count.contas > 0 ? <Selo tom="info">Boleto</Selo> : null}
                  </div>
                  {e.estornada ? (
                    <p className="mt-0.5 text-xs text-perigo">
                      Estornada em {formatarDataHora(e.estornadaEm)}
                      {e.estornadaPor ? ` por ${e.estornadaPor.nome}` : ""}
                    </p>
                  ) : null}
                </Td>
                <Td className="text-texto-suave">{e.numeroNota ?? <span className="text-texto-fraco">–</span>}</Td>
                <Td numerico>{e._count.itens}</Td>
                <Td numerico>{formatarReais(e.valorTotal)}</Td>
                <Td numerico className="text-texto-suave">{e.frete > 0 ? formatarReais(e.frete) : "–"}</Td>
                <Td numerico className={cn("font-medium", e.estornada && "line-through")}>{formatarReais(e.valorTotal + e.frete)}</Td>
                <Td className="text-texto-suave">{e.usuario?.nome ?? "–"}</Td>
                <Td className="text-right">
                  <LinkBotao href={`/estoque/entradas/${e.id}`} variante="contorno" tamanho="sm">
                    Ver
                  </LinkBotao>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Tabela>
      )}
    </div>
  );
}
