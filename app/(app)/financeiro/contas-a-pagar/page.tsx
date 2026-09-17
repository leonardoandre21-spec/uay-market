import Link from "next/link";
import { AlertTriangle, CalendarDays, CalendarRange, CheckCircle2, FileText, Repeat } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { listarCategoriasDespesa, listarFornecedoresAtivos, obterSessaoCaixaAberta } from "@/lib/consultas";
import { agora, paraDataInput } from "@/lib/datas";
import { formatarReais, somar } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO_CURTO } from "@/lib/rotulos";
import { ehVisaoContas, listarContas, resumoContas, type VisaoContas } from "@/lib/servicos/financeiro";
import { rotuloParcela, rotuloRecorrencia } from "@/lib/servicos/financeiro-calculos";
import { Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio, GradeIndicadores } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { AbasLinks, type AbaLink } from "../_componentes/abas-links";
import { LinkBotao } from "../_componentes/link-botao";
import { mesDaUrl, montarQuery, parametro, type ParametrosBusca } from "../_componentes/mes-url";
import { SeloDias, SeloStatusConta } from "../_componentes/selo-dias";
import { contaParaLinha } from "../_componentes/serializar";
import type { Opcao } from "../_componentes/tipos";
import { AcoesConta } from "./_componentes/acoes-conta";
import { BotaoNovaConta } from "./_componentes/botao-nova-conta";

export const dynamic = "force-dynamic";

const ROTULO_VISAO: Record<VisaoContas, string> = {
  atrasadas: "Atrasadas",
  hoje: "Vencem hoje",
  "7d": "Próximos 7 dias",
  "30d": "Próximos 30 dias",
  pendentes: "Todas pendentes",
  pagas: "Pagas",
  canceladas: "Canceladas",
};

const VAZIO_VISAO: Record<VisaoContas, string> = {
  atrasadas: "Nenhuma conta atrasada. Tudo em dia.",
  hoje: "Nenhuma conta vence hoje.",
  "7d": "Nenhuma conta vence nos próximos 7 dias.",
  "30d": "Nenhuma conta vence nos próximos 30 dias.",
  pendentes: "Nenhuma conta pendente. Cadastre os boletos pra não perder vencimento.",
  pagas: "Nenhuma conta paga neste mês.",
  canceladas: "Nenhuma conta cancelada com vencimento neste mês.",
};

export default async function PaginaContasAPagar({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirAdmin();
  const sp = await searchParams;
  const m = mesDaUrl(sp);
  const visaoParam = parametro(sp, "visao");
  const visao: VisaoContas = ehVisaoContas(visaoParam) ? visaoParam : "pendentes";

  const [contas, resumo, fornecedoresDb, categoriasDb, caixa] = await Promise.all([
    listarContas(visao, m.mes),
    resumoContas(m.mes),
    listarFornecedoresAtivos(),
    listarCategoriasDespesa(),
    obterSessaoCaixaAberta(),
  ]);

  const hoje = agora();
  const hojeInput = paraDataInput(hoje);
  const linhas = contas.map((c) => contaParaLinha(c, hoje));
  const fornecedores: Opcao[] = fornecedoresDb.map((f) => ({ id: f.id, nome: f.nome }));
  const categorias: Opcao[] = categoriasDb.map((c) => ({ id: c.id, nome: c.nome }));
  const totalLista = somar(linhas.map((l) => (l.status === "PAGA" ? (l.valorPago ?? l.valor) : l.valor)));
  const mostraMes = visao === "pagas" || visao === "canceladas";
  const p = resumo.pendentes;

  const abas: AbaLink[] = [
    { chave: "atrasadas", contagem: p.atrasada.quantidade, tom: "perigo" as const },
    { chave: "hoje", contagem: p.hoje.quantidade, tom: "alerta" as const },
    { chave: "7d", contagem: p.proximos7.quantidade, tom: "neutro" as const },
    { chave: "30d", contagem: p.proximos30.quantidade, tom: "neutro" as const },
    { chave: "pendentes", contagem: p.todas.quantidade, tom: "neutro" as const },
    { chave: "pagas", contagem: resumo.pagasNoMes.quantidade, tom: "neutro" as const },
    { chave: "canceladas", contagem: resumo.canceladasNoMes, tom: "neutro" as const },
  ].map((a) => ({
    href: `/financeiro/contas-a-pagar${montarQuery({ visao: a.chave === "pendentes" ? null : a.chave, mes: m.ehMesAtual ? null : m.chave })}`,
    rotulo: ROTULO_VISAO[a.chave as VisaoContas],
    ativa: visao === a.chave,
    contagem: a.contagem,
    tom: a.tom,
  }));

  const propsAcoes = { fornecedores, categorias, caixaAberto: Boolean(caixa), hojeInput };

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Boletos a pagar"
        descricao="Contas com vencimento. Ao registrar o pagamento, a despesa entra no mês automaticamente."
        acoes={
          <>
            <LinkBotao href={`/financeiro/contas-a-pagar/calendario${m.ehMesAtual ? "" : `?mes=${m.chave}`}`} variante="contorno">
              <CalendarDays className="size-4" aria-hidden />
              Calendário
            </LinkBotao>
            <BotaoNovaConta fornecedores={fornecedores} categorias={categorias} vencimentoPadrao={hojeInput} />
          </>
        }
      />

      <GradeIndicadores>
        <Indicador
          rotulo="Atrasado"
          valor={formatarReais(p.atrasada.total)}
          tom={p.atrasada.quantidade > 0 ? "perigo" : "neutro"}
          detalhe={p.atrasada.quantidade > 0 ? `${p.atrasada.quantidade} ${p.atrasada.quantidade === 1 ? "conta vencida" : "contas vencidas"}` : "Nenhuma conta vencida"}
          icone={<AlertTriangle className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Vence em 7 dias"
          valor={formatarReais(p.proximos7.total)}
          tom={p.hoje.quantidade > 0 ? "alerta" : "neutro"}
          detalhe={p.hoje.quantidade > 0 ? `${p.hoje.quantidade} ${p.hoje.quantidade === 1 ? "vence" : "vencem"} hoje · ${p.proximos7.quantidade} no total` : `${p.proximos7.quantidade} ${p.proximos7.quantidade === 1 ? "conta" : "contas"}`}
          icone={<CalendarRange className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo={`Total de ${m.rotulo}`}
          valor={formatarReais(resumo.doMes.total)}
          detalhe={`${resumo.doMes.quantidade} ${resumo.doMes.quantidade === 1 ? "conta com vencimento" : "contas com vencimento"} no mês`}
          icone={<FileText className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo={`Pago em ${m.rotulo}`}
          valor={formatarReais(resumo.pagasNoMes.total)}
          tom={resumo.pagasNoMes.quantidade > 0 ? "sucesso" : "neutro"}
          detalhe={`${resumo.pagasNoMes.quantidade} ${resumo.pagasNoMes.quantidade === 1 ? "pagamento" : "pagamentos"}`}
          icone={<CheckCircle2 className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AbasLinks abas={abas} />
        {mostraMes ? <MesLinks chave={m.chave} anterior={m.anterior} seguinte={m.seguinte} hoje={m.hoje} rotulo={m.rotulo} visao={visao} /> : null}
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio
          icone={<FileText aria-hidden />}
          titulo={VAZIO_VISAO[visao]}
          descricao={visao === "pendentes" ? "Boletos de fornecedor, aluguel, energia, internet: tudo que tem data pra pagar." : undefined}
          acao={visao === "pendentes" ? <BotaoNovaConta fornecedores={fornecedores} categorias={categorias} vencimentoPadrao={hojeInput} /> : undefined}
        />
      ) : (
        <Tabela>
          <Thead>
            <Tr>
              <Th>Vencimento</Th>
              <Th>Situação</Th>
              <Th>Descrição</Th>
              <Th>Fornecedor</Th>
              <Th>Categoria</Th>
              <Th className="text-center">Parcela</Th>
              <Th numerico>Valor</Th>
              {visao === "pagas" ? <Th>Pagamento</Th> : null}
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </Tr>
          </Thead>
          <Tbody>
            {linhas.length === 0 ? (
              <LinhaVazia colunas={visao === "pagas" ? 10 : 9} />
            ) : (
              linhas.map((c) => {
                const parcela = rotuloParcela(c.parcelaAtual, c.totalParcelas);
                return (
                  <Tr key={c.id} className={c.status === "PENDENTE" && c.dias < 0 ? "bg-perigo-suave/30" : undefined}>
                    <Td className="whitespace-nowrap tabular">{c.vencimentoFormatado}</Td>
                    <Td>
                      <SeloDias dias={c.dias} status={c.status} />
                    </Td>
                    <Td>
                      <div className="flex flex-col">
                        <span className="inline-flex items-center gap-1.5 font-medium text-texto">
                          {c.descricao}
                          {c.recorrenciaMensal ? (
                            <span title={`Repete ${rotuloRecorrencia(c.diaVencimento)}`} className="inline-flex items-center gap-1 text-xs font-normal text-texto-fraco">
                              <Repeat className="size-3.5" aria-hidden />
                              {rotuloRecorrencia(c.diaVencimento)}
                            </span>
                          ) : null}
                        </span>
                        {c.observacao ? <span className="max-w-xs truncate text-xs text-texto-fraco" title={c.observacao}>{c.observacao}</span> : null}
                      </div>
                    </Td>
                    <Td className="max-w-40 truncate">
                      {c.fornecedorId ? (
                        <Link href={`/financeiro/fornecedores/${c.fornecedorId}`} className="hover:text-primaria hover:underline">
                          {c.fornecedorNome}
                        </Link>
                      ) : (
                        <span className="text-texto-fraco">-</span>
                      )}
                    </Td>
                    <Td>{c.categoriaNome ? <Selo tom="neutro">{c.categoriaNome}</Selo> : <span className="text-texto-fraco">-</span>}</Td>
                    <Td className="text-center tabular">{parcela || <span className="text-texto-fraco">-</span>}</Td>
                    <Td numerico className="font-medium">
                      {formatarReais(c.valor)}
                    </Td>
                    {visao === "pagas" ? (
                      <Td className="whitespace-nowrap text-xs text-texto-suave">
                        <span className="block tabular text-texto">{formatarReais(c.valorPago ?? c.valor)}</span>
                        <span>
                          {c.dataPagamentoFormatada}
                          {c.formaPagamento ? ` · ${ROTULO_FORMA_PAGAMENTO_CURTO[c.formaPagamento]}` : ""}
                          {c.pagaDoCaixa ? " · do caixa" : ""}
                        </span>
                      </Td>
                    ) : null}
                    <Td>
                      <SeloStatusConta status={c.status} dias={c.dias} />
                    </Td>
                    <Td className="text-right">
                      <AcoesConta conta={c} {...propsAcoes} />
                    </Td>
                  </Tr>
                );
              })
            )}
          </Tbody>
          <tfoot className="border-t border-borda bg-superficie-2/60 text-sm">
            <tr>
              <td colSpan={6} className="px-4 py-2.5 font-medium text-texto">
                {linhas.length} {linhas.length === 1 ? "conta" : "contas"} · {ROTULO_VISAO[visao].toLowerCase()}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold tabular text-texto">{formatarReais(totalLista)}</td>
              <td colSpan={visao === "pagas" ? 3 : 2} />
            </tr>
          </tfoot>
        </Tabela>
      )}
    </div>
  );
}

/** Navegação de mês por links (só nas visões que dependem do mês). */
function MesLinks({ chave, anterior, seguinte, hoje, rotulo, visao }: { chave: string; anterior: string; seguinte: string; hoje: string; rotulo: string; visao: VisaoContas }) {
  const href = (mes: string) => `/financeiro/contas-a-pagar${montarQuery({ visao, mes: mes === hoje ? null : mes })}`;
  return (
    <div className="flex items-center gap-1 text-sm">
      <LinkBotao href={href(anterior)} variante="contorno" tamanho="sm" aria-label="Mês anterior">
        ‹
      </LinkBotao>
      <span className="min-w-36 text-center font-medium capitalize text-texto">{rotulo}</span>
      <LinkBotao href={href(seguinte)} variante="contorno" tamanho="sm" aria-label="Próximo mês">
        ›
      </LinkBotao>
      {chave !== hoje ? (
        <LinkBotao href={href(hoje)} variante="fantasma" tamanho="sm">
          Mês atual
        </LinkBotao>
      ) : null}
    </div>
  );
}
