import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Layers, Receipt } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { diasAte, formatarData, formatarDataHora } from "@/lib/datas";
import { formatarQuantidade, formatarReais } from "@/lib/dinheiro";
import { ROTULO_STATUS_CONTA } from "@/lib/rotulos";
import { obterEntradaDetalhada } from "@/lib/servicos/estoque";
import { formatarCnpj, formatarTelefone } from "@/lib/utils";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, GradeIndicadores } from "@/components/ui/pagina";
import { Selo, type TomSelo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { BotaoEstornarEntrada } from "../../_componentes/botao-estornar-entrada";
import { LinkBotao } from "../../_componentes/link-botao";

export const dynamic = "force-dynamic";

const TOM_STATUS_CONTA: Record<"PENDENTE" | "PAGA" | "CANCELADA", TomSelo> = {
  PENDENTE: "alerta",
  PAGA: "sucesso",
  CANCELADA: "neutro",
};

export default async function PaginaDetalheEntrada({ params }: { params: Promise<{ id: string }> }) {
  const [, { id }] = await Promise.all([exigirAdmin(), params]);
  const entradaId = Number(id);
  if (!Number.isInteger(entradaId) || entradaId <= 0) notFound();

  const entrada = await obterEntradaDetalhada(entradaId);
  if (!entrada) notFound();

  const boletosPendentes = entrada.contas.filter((c) => c.status === "PENDENTE").length;
  const totalBoletos = entrada.contas.filter((c) => c.status !== "CANCELADA").reduce((acc, c) => acc + c.valor, 0);

  return (
    <div>
      <Link href="/estoque/entradas" className="mb-3 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto">
        <ArrowLeft className="size-4" aria-hidden /> Voltar pras entradas
      </Link>
      <CabecalhoPagina
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            Entrada nº {entrada.id}
            {entrada.estornada ? <Selo tom="perigo">Estornada</Selo> : null}
          </span>
        }
        descricao={`Compra de ${formatarData(entrada.data)} · lançada em ${formatarDataHora(entrada.criadoEm)}${entrada.usuario ? ` por ${entrada.usuario.nome}` : ""}`}
        acoes={
          <>
            <LinkBotao href="/estoque/entradas/nova" variante="contorno">
              Nova entrada
            </LinkBotao>
            {!entrada.estornada ? (
              <BotaoEstornarEntrada
                entradaId={entrada.id}
                total={entrada.valorTotal}
                itens={entrada.itens.length}
                boletosPendentes={boletosPendentes}
                bloqueios={entrada.motivosBloqueio}
              />
            ) : null}
          </>
        }
      />

      {entrada.estornada ? (
        <Aviso tom="perigo" titulo="Esta entrada foi estornada" className="mb-6">
          <p className="font-medium">
            Estornada em {formatarDataHora(entrada.estornadaEm)}
            {entrada.estornadaPor ? ` por ${entrada.estornadaPor.nome}` : ""}.
          </p>
          <p className="mt-1">
            As quantidades foram retiradas do estoque e os lotes removidos. O registro fica aqui só pra consulta e não entra nas somas de compras.
          </p>
        </Aviso>
      ) : entrada.motivosBloqueio.length ? (
        <Aviso tom="info" titulo="Estorno indisponível" className="mb-6">
          <ul className="list-disc pl-4">
            {entrada.motivosBloqueio.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Aviso>
      ) : null}

      <GradeIndicadores className="mb-6">
        <Indicador rotulo="Mercadoria" valor={formatarReais(entrada.valorTotal)} detalhe={`${entrada.itens.length} item(ns)`} />
        <Indicador rotulo="Frete" valor={formatarReais(entrada.frete)} detalhe={entrada.frete > 0 ? "Rateado no custo pelos valores dos itens" : "Sem frete"} />
        <Indicador rotulo="Total da nota" valor={formatarReais(entrada.total)} tom="primaria" detalhe={entrada.numeroNota ? `Nota ${entrada.numeroNota}` : "Sem número de nota"} />
        <Indicador
          rotulo="Boletos"
          valor={entrada.contas.length ? formatarReais(totalBoletos) : "Nenhum"}
          detalhe={entrada.contas.length ? `${entrada.contas.length} parcela(s) · ${boletosPendentes} pendente(s)` : "Pago sem gerar boleto"}
          tom={boletosPendentes > 0 ? "alerta" : "neutro"}
        />
      </GradeIndicadores>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Cartao>
            <CartaoCabecalho titulo="Itens" descricao="Custo efetivo = custo unitário + frete rateado. É esse que entrou no custo médio." />
            <Tabela className="rounded-t-none border-0">
              <Thead>
                <Tr>
                  <Th>Produto</Th>
                  <Th numerico>Quantidade</Th>
                  <Th numerico>Custo unit.</Th>
                  {entrada.frete > 0 ? <Th numerico>Frete rateado</Th> : null}
                  {entrada.frete > 0 ? <Th numerico>Custo efetivo</Th> : null}
                  <Th>Validade</Th>
                  <Th numerico>Total</Th>
                </Tr>
              </Thead>
              <Tbody>
                {entrada.itens.map((item) => (
                  <Tr key={item.id}>
                    <Td>
                      <Link href={`/estoque/movimentos/${item.produtoId}`} className="font-medium text-texto hover:text-primaria hover:underline">
                        {item.produto.nome}
                      </Link>
                      <p className="text-xs text-texto-fraco">
                        {item.produto.codigoBarras ?? item.produto.codigoInterno ?? "Sem código"} · custo médio hoje {formatarReais(item.produto.precoCusto)}
                      </p>
                    </Td>
                    <Td numerico>
                      {formatarQuantidade(item.quantidade, item.produto.unidade)} <span className="text-xs text-texto-fraco">{item.produto.unidade === "KG" ? "kg" : "un"}</span>
                    </Td>
                    <Td numerico>{formatarReais(item.custoUnitario)}</Td>
                    {entrada.frete > 0 ? <Td numerico className="text-texto-suave">{formatarReais(item.freteRateado)}</Td> : null}
                    {entrada.frete > 0 ? <Td numerico className="font-medium">{formatarReais(item.custoEfetivo)}</Td> : null}
                    <Td>
                      {item.validade ? (
                        <span className="text-texto">{formatarData(item.validade)}</span>
                      ) : (
                        <span className="text-xs text-texto-fraco">{item.produto.controlaValidade ? "Não informada" : "Não controla"}</span>
                      )}
                    </Td>
                    <Td numerico className="font-medium">{formatarReais(item.valorItem)}</Td>
                  </Tr>
                ))}
              </Tbody>
              <tfoot className="border-t border-borda bg-superficie-2 text-sm">
                <tr>
                  <td colSpan={entrada.frete > 0 ? 6 : 4} className="px-4 py-2.5 text-right font-semibold text-texto">
                    Total da nota (itens + frete)
                  </td>
                  <td className="px-4 py-2.5 text-right text-base font-semibold text-texto tabular">{formatarReais(entrada.total)}</td>
                </tr>
              </tfoot>
            </Tabela>
          </Cartao>

          {entrada.lotes.length > 0 ? (
            <Cartao>
              <CartaoCabecalho titulo="Lotes criados" descricao="Saldo atual de cada lote desta entrada. A venda baixa primeiro o que vence antes." />
              <Tabela className="rounded-t-none border-0">
                <Thead>
                  <Tr>
                    <Th>Produto</Th>
                    <Th>Validade</Th>
                    <Th numerico>Saldo</Th>
                    <Th numerico>Custo</Th>
                    <Th>Uso</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {entrada.lotes.map((lote) => {
                    const produto = entrada.itens.find((i) => i.produtoId === lote.produtoId)?.produto;
                    const dias = diasAte(lote.validade);
                    const consumos = lote._count.itensVenda + lote._count.perdas;
                    return (
                      <Tr key={lote.id}>
                        <Td className="font-medium text-texto">{produto?.nome ?? `Produto ${lote.produtoId}`}</Td>
                        <Td>
                          <span className="mr-2">{formatarData(lote.validade)}</span>
                          <Selo tom={dias < 0 ? "perigo" : dias <= 7 ? "alerta" : "neutro"}>
                            {dias < 0 ? `vencido há ${Math.abs(dias)} dia(s)` : dias === 0 ? "vence hoje" : `${dias} dia(s)`}
                          </Selo>
                        </Td>
                        <Td numerico>{formatarQuantidade(lote.quantidade, produto?.unidade ?? "UN")}</Td>
                        <Td numerico className="text-texto-suave">{formatarReais(lote.custoUnitario)}</Td>
                        <Td className="text-xs text-texto-suave">
                          {consumos > 0 ? `${lote._count.itensVenda} venda(s) · ${lote._count.perdas} perda(s)` : "Sem movimento"}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Tabela>
            </Cartao>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Cartao>
            <CartaoCabecalho titulo="Fornecedor" />
            <CartaoConteudo className="text-sm">
              {entrada.fornecedor ? (
                <dl className="space-y-1.5">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-texto-fraco">Nome</dt>
                    <dd className="font-medium text-texto">{entrada.fornecedor.nome}</dd>
                  </div>
                  {entrada.fornecedor.cnpj ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-texto-fraco">CNPJ</dt>
                      <dd className="tabular">{formatarCnpj(entrada.fornecedor.cnpj)}</dd>
                    </div>
                  ) : null}
                  {entrada.fornecedor.telefone ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-texto-fraco">Telefone</dt>
                      <dd className="tabular">{formatarTelefone(entrada.fornecedor.telefone)}</dd>
                    </div>
                  ) : null}
                  {entrada.fornecedor.contato ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-texto-fraco">Contato</dt>
                      <dd>{entrada.fornecedor.contato}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-texto-fraco">Entrada lançada sem fornecedor.</p>
              )}
            </CartaoConteudo>
          </Cartao>

          <Cartao>
            <CartaoCabecalho titulo="Boletos gerados" acoes={entrada.contas.length ? <Link href="/financeiro/contas-a-pagar" className="text-sm font-medium text-primaria hover:underline">Ver contas a pagar</Link> : null} />
            <CartaoConteudo>
              {entrada.contas.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-texto-fraco">
                  <Receipt className="size-4" aria-hidden /> Nenhum boleto vinculado a esta entrada.
                </p>
              ) : (
                <ul className="divide-y divide-borda text-sm">
                  {entrada.contas.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-texto">{c.descricao}</p>
                        <p className="text-xs text-texto-fraco">
                          Vence {formatarData(c.vencimento)}
                          {c.status === "PAGA" && c.dataPagamento ? ` · pago em ${formatarData(c.dataPagamento)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-medium tabular">{formatarReais(c.valorPago ?? c.valor)}</span>
                        <Selo tom={TOM_STATUS_CONTA[c.status]}>{ROTULO_STATUS_CONTA[c.status]}</Selo>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CartaoConteudo>
          </Cartao>

          {entrada.observacao ? (
            <Cartao>
              <CartaoCabecalho titulo="Observação" />
              <CartaoConteudo className="flex gap-2 text-sm text-texto">
                <FileText className="mt-0.5 size-4 shrink-0 text-texto-fraco" aria-hidden />
                <p className="whitespace-pre-wrap">{entrada.observacao}</p>
              </CartaoConteudo>
            </Cartao>
          ) : null}

          <Cartao>
            <CartaoCabecalho titulo="Movimentações" />
            <CartaoConteudo className="flex items-center gap-2 text-sm text-texto-suave">
              <Layers className="size-4 shrink-0 text-texto-fraco" aria-hidden />
              <span>
                {entrada.movimentos.filter((m) => m.tipo === "ENTRADA").length} entrada(s) no estoque
                {entrada.movimentos.some((m) => m.tipo === "AJUSTE") ? ` · ${entrada.movimentos.filter((m) => m.tipo === "AJUSTE").length} reversão(ões) por estorno` : ""}
              </span>
            </CartaoConteudo>
          </Cartao>
        </div>
      </div>
    </div>
  );
}
