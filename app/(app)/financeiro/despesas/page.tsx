import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CalendarDays, ClipboardList, Minus, PieChart, Tags, Wallet } from "lucide-react";
import type { FormaPagamento } from "@prisma/client";
import { exigirAdmin } from "@/lib/auth";
import { listarCategoriasDespesa, listarFornecedoresAtivos, obterSessaoCaixaAberta } from "@/lib/consultas";
import { agora, formatarData, paraDataInput } from "@/lib/datas";
import { formatarReais, somar } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO_CURTO } from "@/lib/rotulos";
import { listarDespesas, listarDespesasRepetiveis, somarDespesas } from "@/lib/servicos/financeiro";
import {
  dataMensal,
  diasDecorridosNoMes,
  formatarVariacao,
  mediaDiaria,
  mesAnterior,
  rotuloMes,
  totaisPorCategoria,
  variacaoPercentual,
} from "@/lib/servicos/financeiro-calculos";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio, GradeIndicadores } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { LinkBotao } from "../_componentes/link-botao";
import { NavegacaoMes } from "../_componentes/navegacao-mes";
import { mesDaUrl, parametro, parametroInteiro, type ParametrosBusca } from "../_componentes/mes-url";
import { despesaParaLinha } from "../_componentes/serializar";
import type { Opcao } from "../_componentes/tipos";
import { AcoesDespesa } from "./_componentes/acoes-despesa";
import { BotaoLancarDespesa } from "./_componentes/botao-lancar-despesa";
import { DialogoRepetir } from "./_componentes/dialogo-repetir";
import { FiltrosDespesas } from "./_componentes/filtros-despesas";
import { GraficoCategorias } from "./_componentes/grafico-categorias";

export const dynamic = "force-dynamic";

const FORMAS_VALIDAS: FormaPagamento[] = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "FIADO"];

function formaDaUrl(v: string | undefined): FormaPagamento | null {
  return v && (FORMAS_VALIDAS as string[]).includes(v) ? (v as FormaPagamento) : null;
}

export default async function PaginaDespesas({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirAdmin();
  const sp = await searchParams;
  const m = mesDaUrl(sp);
  const filtros = {
    ...m.mes,
    categoriaId: parametroInteiro(sp, "categoria"),
    fornecedorId: parametroInteiro(sp, "fornecedor"),
    forma: formaDaUrl(parametro(sp, "forma")),
  };
  const anterior = mesAnterior(m.mes);

  const [despesas, totalAnterior, categoriasDb, fornecedoresDb, caixa, repetiveisDb] = await Promise.all([
    listarDespesas(filtros),
    somarDespesas({ ...filtros, ...anterior }),
    listarCategoriasDespesa(),
    listarFornecedoresAtivos(),
    obterSessaoCaixaAberta(),
    listarDespesasRepetiveis(anterior),
  ]);

  const hoje = agora();
  const total = somar(despesas.map((d) => d.valor));
  const porCategoria = totaisPorCategoria(despesas.map((d) => ({ valor: d.valor, categoria: d.categoria?.nome ?? null })));
  const top3 = porCategoria.slice(0, 3);
  const variacao = variacaoPercentual(total, totalAnterior);
  const diasConsiderados = diasDecorridosNoMes(m.mes, hoje);
  const media = mediaDiaria(total, diasConsiderados);
  const saiuDoCaixa = somar(despesas.filter((d) => d.pagoDoCaixa).map((d) => d.valor));
  const deBoletos = despesas.filter((d) => d.contaPagarId !== null).length;

  const categorias: Opcao[] = categoriasDb.map((c) => ({ id: c.id, nome: c.nome }));
  const fornecedores: Opcao[] = fornecedoresDb.map((f) => ({ id: f.id, nome: f.nome }));
  const linhas = despesas.map(despesaParaLinha);
  const repetiveis = repetiveisDb.map((d) => ({
    id: d.id,
    descricao: d.descricao,
    valor: d.valor,
    dataFormatada: formatarData(d.data),
    categoriaNome: d.categoria?.nome ?? null,
    fornecedorNome: d.fornecedor?.nome ?? null,
  }));
  const dataPadrao = m.ehMesAtual ? paraDataInput(hoje) : paraDataInput(dataMensal(m.mes.ano, m.mes.mes - 1, 1));
  const temFiltro = filtros.categoriaId !== null || filtros.fornecedorId !== null || filtros.forma !== null;

  const propsDialogo = { categorias, fornecedores, caixaAberto: Boolean(caixa), dataPadrao };

  const tomVariacao = variacao === null ? "neutro" : variacao > 0 ? "perigo" : variacao < 0 ? "sucesso" : "neutro";
  const IconeVariacao = variacao === null || variacao === 0 ? Minus : variacao > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Despesas"
        descricao={`Gastos do mercado em ${m.rotulo}${temFiltro ? " (com filtros)" : ""}.`}
        acoes={
          <>
            <NavegacaoMes mesAtual={m.chave} mesAnterior={m.anterior} mesSeguinte={m.seguinte} mesDeHoje={m.hoje} />
            <LinkBotao href="/financeiro/despesas/categorias" variante="contorno">
              <Tags className="size-4" aria-hidden />
              Categorias
            </LinkBotao>
            <DialogoRepetir despesas={repetiveis} mesDestino={m.chave} rotuloMesOrigem={rotuloMes(anterior)} rotuloMesDestino={m.rotulo} />
            <BotaoLancarDespesa {...propsDialogo} />
          </>
        }
      />

      <GradeIndicadores>
        <Indicador
          rotulo="Total do mês"
          valor={formatarReais(total)}
          detalhe={`${despesas.length} ${despesas.length === 1 ? "lançamento" : "lançamentos"}${deBoletos ? ` · ${deBoletos} de boletos` : ""}`}
          icone={<ClipboardList className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Comparado ao mês anterior"
          valor={
            <span className="inline-flex items-center gap-1">
              <IconeVariacao className="size-5" aria-hidden />
              {formatarVariacao(variacao)}
            </span>
          }
          tom={tomVariacao}
          detalhe={`${rotuloMes(anterior)}: ${formatarReais(totalAnterior)}`}
        />
        <Indicador
          rotulo="Média por dia"
          valor={formatarReais(media)}
          detalhe={diasConsiderados > 0 ? `${diasConsiderados} ${diasConsiderados === 1 ? "dia considerado" : "dias considerados"}` : "Mês ainda não começou"}
          icone={<CalendarDays className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Maiores categorias"
          valor={top3[0] ? <span className="text-xl">{top3[0].categoria}</span> : "-"}
          detalhe={
            top3.length ? (
              <span className="flex flex-col gap-0.5">
                {top3.map((c, i) => (
                  <span key={c.categoria} className="flex justify-between gap-2">
                    <span className="truncate">
                      {i + 1}. {c.categoria}
                    </span>
                    <span className="tabular">{formatarReais(c.total)}</span>
                  </span>
                ))}
              </span>
            ) : (
              "Nenhuma despesa no mês"
            )
          }
          icone={<PieChart className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <FiltrosDespesas
            categorias={categorias}
            fornecedores={fornecedores}
            categoriaId={filtros.categoriaId}
            fornecedorId={filtros.fornecedorId}
            forma={filtros.forma}
          />

          {linhas.length === 0 && !temFiltro ? (
            <EstadoVazio
              icone={<ClipboardList aria-hidden />}
              titulo={`Nenhuma despesa em ${m.rotulo}`}
              descricao="Lance os gastos do mês pra acompanhar o lucro real. Boletos pagos em Boletos a pagar entram aqui sozinhos."
              acao={<BotaoLancarDespesa {...propsDialogo} />}
            />
          ) : (
            <Tabela>
              <Thead>
                <Tr>
                  <Th>Data</Th>
                  <Th>Descrição</Th>
                  <Th>Categoria</Th>
                  <Th>Fornecedor</Th>
                  <Th>Forma</Th>
                  <Th>Caixa</Th>
                  <Th numerico>Valor</Th>
                  <Th className="w-24 text-right">Ações</Th>
                </Tr>
              </Thead>
              <Tbody>
                {linhas.length === 0 ? (
                  <LinhaVazia colunas={8} mensagem="Nenhuma despesa com esses filtros." />
                ) : (
                  linhas.map((d) => (
                    <Tr key={d.id}>
                      <Td className="whitespace-nowrap tabular">{d.dataFormatada}</Td>
                      <Td>
                        <div className="flex flex-col">
                          <span className="font-medium text-texto">{d.descricao}</span>
                          {d.observacao ? <span className="max-w-xs truncate text-xs text-texto-fraco" title={d.observacao}>{d.observacao}</span> : null}
                        </div>
                      </Td>
                      <Td>{d.categoriaNome ? <Selo tom="neutro">{d.categoriaNome}</Selo> : <span className="text-texto-fraco">-</span>}</Td>
                      <Td className="max-w-40 truncate">
                        {d.fornecedorId ? (
                          <Link href={`/financeiro/fornecedores/${d.fornecedorId}`} className="hover:text-primaria hover:underline">
                            {d.fornecedorNome}
                          </Link>
                        ) : (
                          <span className="text-texto-fraco">-</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {d.formaPagamento ? ROTULO_FORMA_PAGAMENTO_CURTO[d.formaPagamento] : <span className="text-texto-fraco">-</span>}
                      </Td>
                      <Td>
                        {d.pagoDoCaixa ? (
                          <Selo tom="alerta">
                            <Wallet className="size-3" aria-hidden />
                            Saiu do caixa
                          </Selo>
                        ) : d.contaPagarId ? (
                          <Selo tom="info">Boleto</Selo>
                        ) : (
                          <span className="text-texto-fraco">-</span>
                        )}
                      </Td>
                      <Td numerico className="font-medium">
                        {formatarReais(d.valor)}
                      </Td>
                      <Td className="text-right">
                        <AcoesDespesa despesa={d} {...propsDialogo} />
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
              {linhas.length > 0 ? (
                <tfoot className="border-t border-borda bg-superficie-2/60 text-sm">
                  <tr>
                    <td colSpan={5} className="px-4 py-2.5 font-medium text-texto">
                      Total {temFiltro ? "filtrado" : "do mês"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-texto-suave">{saiuDoCaixa > 0 ? `${formatarReais(saiuDoCaixa)} do caixa` : ""}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular text-texto">{formatarReais(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </Tabela>
          )}
        </div>

        <Cartao className="self-start">
          <CartaoCabecalho titulo="Gastos por categoria" descricao={`${m.rotulo}${temFiltro ? ", com os filtros aplicados" : ""}`} />
          <CartaoConteudo>
            <GraficoCategorias dados={porCategoria} />
            {porCategoria.length > 0 ? (
              <ul className="mt-3 flex flex-col divide-y divide-borda text-sm">
                {porCategoria.map((c) => (
                  <li key={c.categoria} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="truncate text-texto-suave">
                      {c.categoria} <span className="text-texto-fraco">({c.quantidade})</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-texto-fraco tabular">{total > 0 ? `${Math.round((c.total / total) * 100)}%` : ""}</span>
                      <span className="font-medium tabular text-texto">{formatarReais(c.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CartaoConteudo>
        </Cartao>
      </div>
    </div>
  );
}
