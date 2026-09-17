import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  ExternalLink,
  HandCoins,
  Receipt,
} from "lucide-react";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { GradeIndicadores } from "@/components/ui/pagina";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { Selo } from "@/components/ui/selo";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataHora, formatarHora } from "@/lib/datas";
import {
  FORMAS_PAGAMENTO,
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_FORMA_PAGAMENTO_CURTO,
  ROTULO_STATUS_CAIXA,
  ROTULO_STATUS_VENDA,
} from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { descreverDiferenca, tomDiferenca, type ResumoSessao } from "@/lib/servicos/caixa-calculos";
import type { SessaoCompleta, VendaDaSessao } from "@/lib/servicos/caixa";

const COR_TEXTO = { sucesso: "text-sucesso", alerta: "text-alerta", perigo: "text-perigo" } as const;

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/**
 * Painel completo de uma sessão de caixa (aberta ou fechada): dados da sessão,
 * indicadores, vendas por forma, composição do dinheiro, movimentos e últimas vendas.
 * Server Component: recebe os dados prontos e não tem interação própria.
 */
export function PainelSessao({
  sessao,
  resumo,
  vendas,
  acoes,
}: {
  sessao: SessaoCompleta;
  resumo: ResumoSessao;
  vendas: VendaDaSessao[];
  /** Botões de ação (só no caixa aberto). */
  acoes?: React.ReactNode;
}) {
  const fechada = sessao.status === "FECHADO";
  const tomFechamento = sessao.diferenca === null ? null : tomDiferenca(sessao.diferenca);

  return (
    <div className="flex flex-col gap-6">
      <Cartao>
        <CartaoCabecalho
          titulo={
            <span className="flex items-center gap-2">
              Caixa nº {sessao.id}
              <Selo tom={fechada ? "neutro" : "sucesso"}>{ROTULO_STATUS_CAIXA[sessao.status]}</Selo>
            </span>
          }
          descricao={
            fechada
              ? `Aberto ${formatarDataHora(sessao.abertoEm)} · fechado ${formatarDataHora(sessao.fechadoEm)}`
              : `Aberto desde ${formatarDataHora(sessao.abertoEm)}`
          }
          acoes={acoes}
        />
        <CartaoConteudo>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Aberto por</dt>
              <dd className="mt-0.5 font-medium text-texto">{sessao.usuarioAbertura.nome}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Fundo de troco</dt>
              <dd className="mt-0.5 font-medium tabular text-texto">{formatarReais(sessao.valorAbertura)}</dd>
            </div>
            {fechada ? (
              <>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Fechado por</dt>
                  <dd className="mt-0.5 font-medium text-texto">{sessao.usuarioFechamento?.nome ?? "Não informado"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Resultado</dt>
                  <dd className="mt-0.5">
                    {sessao.diferenca !== null && tomFechamento ? (
                      <Selo tom={tomFechamento}>{descreverDiferenca(sessao.diferenca)}</Selo>
                    ) : (
                      <Selo tom="neutro">Sem conferência</Selo>
                    )}
                  </dd>
                </div>
              </>
            ) : (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Obs. abertura</dt>
                <dd className="mt-0.5 whitespace-pre-line text-texto-suave">{sessao.observacao || "Nenhuma."}</dd>
              </div>
            )}
          </dl>
          {fechada && (sessao.observacao || sessao.observacaoFechamento) ? (
            <div className="mt-4 grid gap-3 rounded-padrao bg-superficie-2 px-4 py-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Obs. abertura</p>
                <p className="mt-1 whitespace-pre-line text-texto-suave">{sessao.observacao || "Nenhuma."}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Obs. fechamento</p>
                <p className="mt-1 whitespace-pre-line text-texto-suave">{sessao.observacaoFechamento || "Nenhuma."}</p>
              </div>
            </div>
          ) : null}
        </CartaoConteudo>
      </Cartao>

      {fechada ? (
        <GradeIndicadores className="xl:grid-cols-3">
          <Indicador
            rotulo="Dinheiro esperado"
            valor={formatarReais(sessao.valorFechamentoEsperado ?? resumo.dinheiroEsperado)}
            detalhe="Calculado pelo sistema no fechamento"
            icone={<Banknote className="size-4" aria-hidden />}
          />
          <Indicador
            rotulo="Dinheiro contado"
            valor={formatarReais(sessao.valorFechamentoContado ?? 0)}
            detalhe="Informado por quem fechou"
            icone={<HandCoins className="size-4" aria-hidden />}
          />
          <Indicador
            rotulo="Diferença"
            valor={`${(sessao.diferenca ?? 0) > 0 ? "+" : ""}${formatarReais(sessao.diferenca ?? 0)}`}
            detalhe={sessao.diferenca !== null ? descreverDiferenca(sessao.diferenca) : undefined}
            tom={tomFechamento ?? "neutro"}
          />
        </GradeIndicadores>
      ) : null}

      <GradeIndicadores>
        <Indicador
          rotulo={fechada ? "Dinheiro esperado (recalculado agora)" : "Dinheiro esperado na gaveta"}
          valor={formatarReais(resumo.dinheiroEsperado)}
          tom="primaria"
          detalhe={
            fechada && sessao.valorFechamentoEsperado !== null && sessao.valorFechamentoEsperado !== resumo.dinheiroEsperado
              ? `No fechamento era ${formatarReais(sessao.valorFechamentoEsperado)}. Mudou depois (venda cancelada ou lançamento posterior).`
              : `Fundo de troco ${formatarReais(resumo.valorAbertura)} + vendas em dinheiro ${formatarReais(resumo.porForma.DINHEIRO.valor)}`
          }
          icone={<Banknote className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Vendas concluídas"
          valor={formatarReais(resumo.vendas.total)}
          detalhe={
            resumo.vendas.canceladas > 0
              ? `${plural(resumo.vendas.quantidade, "venda", "vendas")} · ${plural(resumo.vendas.canceladas, "cancelada", "canceladas")} (fora do total)`
              : plural(resumo.vendas.quantidade, "venda", "vendas")
          }
          icone={<Receipt className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Sangrias"
          valor={formatarReais(resumo.sangrias.total)}
          detalhe={plural(resumo.sangrias.quantidade, "retirada", "retiradas")}
          tom={resumo.sangrias.total > 0 ? "alerta" : "neutro"}
          icone={<ArrowDownToLine className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Suprimentos"
          valor={formatarReais(resumo.suprimentos.total)}
          detalhe={plural(resumo.suprimentos.quantidade, "reforço", "reforços")}
          icone={<ArrowUpFromLine className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao>
          <CartaoCabecalho titulo="Vendas por forma de pagamento" descricao="Só vendas concluídas. Dinheiro pelo valor da venda, sem o troco." />
          <Tabela className="rounded-none border-0 border-t">
            <Thead>
              <Tr>
                <Th>Forma</Th>
                <Th numerico>Pagamentos</Th>
                <Th numerico>Valor</Th>
              </Tr>
            </Thead>
            <Tbody>
              {FORMAS_PAGAMENTO.map((forma) => {
                const f = resumo.porForma[forma];
                return (
                  <Tr key={forma} className={f.quantidade === 0 ? "text-texto-fraco" : undefined}>
                    <Td>{ROTULO_FORMA_PAGAMENTO[forma]}</Td>
                    <Td numerico>{f.quantidade}</Td>
                    <Td numerico className={f.quantidade > 0 ? "font-medium" : undefined}>
                      {formatarReais(f.valor)}
                    </Td>
                  </Tr>
                );
              })}
              <Tr className="bg-superficie-2/60 font-semibold">
                <Td>Total vendido</Td>
                <Td numerico>{resumo.vendas.quantidade}</Td>
                <Td numerico>{formatarReais(resumo.vendas.total)}</Td>
              </Tr>
            </Tbody>
          </Tabela>
          <CartaoConteudo className="border-t border-borda text-sm text-texto-suave">
            Troco devolvido aos clientes: <strong className="tabular text-texto">{formatarReais(resumo.trocoTotal)}</strong>.
            {resumo.recebimentosFiado.total > 0 ? (
              <>
                {" "}
                Fiado recebido na sessão: <strong className="tabular text-texto">{formatarReais(resumo.recebimentosFiado.total)}</strong>{" "}
                ({formatarReais(resumo.recebimentosFiado.dinheiro)} em dinheiro).
              </>
            ) : null}
          </CartaoConteudo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho titulo="Como o dinheiro esperado é calculado" descricao="Só o que entra e sai da gaveta em dinheiro vivo." />
          <CartaoConteudo className="p-0">
            <ul className="divide-y divide-borda text-sm">
              <LinhaComposicao sinal="+" rotulo="Fundo de troco (abertura)" valor={resumo.valorAbertura} />
              <LinhaComposicao
                sinal="+"
                rotulo="Vendas em dinheiro"
                detalhe={plural(resumo.porForma.DINHEIRO.quantidade, "pagamento", "pagamentos")}
                valor={resumo.porForma.DINHEIRO.valor}
              />
              <LinhaComposicao
                sinal="+"
                rotulo="Suprimentos"
                detalhe={plural(resumo.suprimentos.quantidade, "reforço", "reforços")}
                valor={resumo.suprimentos.total}
              />
              <LinhaComposicao
                sinal="+"
                rotulo="Fiado recebido em dinheiro"
                valor={resumo.recebimentosFiado.dinheiro}
              />
              <LinhaComposicao
                sinal="-"
                rotulo="Sangrias"
                detalhe={plural(resumo.sangrias.quantidade, "retirada", "retiradas")}
                valor={resumo.sangrias.total}
              />
              <LinhaComposicao
                sinal="-"
                rotulo="Despesas pagas com dinheiro do caixa"
                detalhe={plural(resumo.despesasCaixa.quantidade, "despesa", "despesas")}
                valor={resumo.despesasCaixa.total}
              />
              <li className="flex items-center justify-between gap-4 bg-primaria-suave px-5 py-3 font-semibold text-primaria">
                <span>= Dinheiro esperado na gaveta</span>
                <span className="tabular text-base">{formatarReais(resumo.dinheiroEsperado)}</span>
              </li>
            </ul>
          </CartaoConteudo>
        </Cartao>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao>
          <CartaoCabecalho
            titulo="Sangrias e suprimentos"
            descricao={
              sessao.movimentos.length
                ? plural(sessao.movimentos.length, "movimento registrado", "movimentos registrados")
                : "Nenhum movimento de gaveta nesta sessão."
            }
          />
          <Tabela className="rounded-none border-0 border-t">
            <Thead>
              <Tr>
                <Th>Hora</Th>
                <Th>Tipo</Th>
                <Th>Motivo</Th>
                <Th>Quem</Th>
                <Th numerico>Valor</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sessao.movimentos.length === 0 ? (
                <LinhaVazia colunas={5} mensagem="Nenhuma sangria ou suprimento até agora." />
              ) : (
                sessao.movimentos.map((m) => (
                  <Tr key={m.id}>
                    <Td className="tabular whitespace-nowrap">{formatarDataHora(m.criadoEm)}</Td>
                    <Td>
                      <Selo tom={m.tipo === "SANGRIA" ? "alerta" : "info"}>
                        {m.tipo === "SANGRIA" ? "Sangria" : "Suprimento"}
                      </Selo>
                    </Td>
                    <Td className="max-w-xs text-texto-suave">{m.motivo || "Sem motivo informado"}</Td>
                    <Td className="whitespace-nowrap">{m.usuario?.nome ?? "Não informado"}</Td>
                    <Td numerico className={cn("font-medium", m.tipo === "SANGRIA" ? "text-alerta" : "text-texto")}>
                      {m.tipo === "SANGRIA" ? "-" : "+"}
                      {formatarReais(m.valor)}
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Tabela>
        </Cartao>

        <Cartao>
          <CartaoCabecalho
            titulo="Últimas vendas da sessão"
            descricao="As 10 mais recentes. Clique no cupom pra ver os itens."
            acoes={
              <Link href="/vendas" className="text-sm font-medium text-primaria hover:underline">
                Todas as vendas
              </Link>
            }
          />
          <Tabela className="rounded-none border-0 border-t">
            <Thead>
              <Tr>
                <Th>Hora</Th>
                <Th>Cupom</Th>
                <Th>Pagamento</Th>
                <Th>Situação</Th>
                <Th numerico>Total</Th>
              </Tr>
            </Thead>
            <Tbody>
              {vendas.length === 0 ? (
                <LinhaVazia colunas={5} mensagem="Nenhuma venda nesta sessão ainda." />
              ) : (
                vendas.map((v) => {
                  const formas = Array.from(new Set(v.pagamentos.map((p) => p.forma)));
                  const cancelada = v.status === "CANCELADA";
                  return (
                    <Tr key={v.id} className={cancelada ? "text-texto-fraco" : undefined}>
                      <Td className="tabular whitespace-nowrap">{formatarHora(v.criadoEm)}</Td>
                      <Td>
                        <Link
                          href={`/vendas/${v.id}`}
                          className="inline-flex items-center gap-1 font-medium text-primaria hover:underline"
                        >
                          nº {v.numero}
                          <ExternalLink className="size-3.5" aria-hidden />
                        </Link>
                        {v.cliente ? <span className="block text-xs text-texto-fraco">{v.cliente.nome}</span> : null}
                      </Td>
                      <Td className="text-texto-suave">
                        {formas.length ? formas.map((f) => ROTULO_FORMA_PAGAMENTO_CURTO[f]).join(" + ") : "Sem pagamento"}
                      </Td>
                      <Td>
                        <Selo tom={cancelada ? "perigo" : "sucesso"}>{ROTULO_STATUS_VENDA[v.status]}</Selo>
                      </Td>
                      <Td numerico className={cn("font-medium", cancelada && "line-through")}>
                        {formatarReais(v.total)}
                      </Td>
                    </Tr>
                  );
                })
              )}
            </Tbody>
          </Tabela>
        </Cartao>
      </div>
    </div>
  );
}

function LinhaComposicao({
  sinal,
  rotulo,
  detalhe,
  valor,
}: {
  sinal: "+" | "-";
  rotulo: string;
  detalhe?: string;
  valor: number;
}) {
  const zerado = valor === 0;
  return (
    <li className={cn("flex items-center justify-between gap-4 px-5 py-2.5", zerado && "text-texto-fraco")}>
      <span className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs font-bold",
            sinal === "+" ? "bg-sucesso-suave text-sucesso" : "bg-perigo-suave text-perigo",
            zerado && "opacity-50",
          )}
          aria-label={sinal === "+" ? "soma" : "subtrai"}
        >
          {sinal}
        </span>
        <span>
          {rotulo}
          {detalhe ? <span className="ml-1.5 text-xs text-texto-fraco">({detalhe})</span> : null}
        </span>
      </span>
      <span className={cn("tabular font-medium", !zerado && sinal === "-" && COR_TEXTO.perigo)}>
        {sinal === "-" && !zerado ? "-" : ""}
        {formatarReais(valor)}
      </span>
    </li>
  );
}
