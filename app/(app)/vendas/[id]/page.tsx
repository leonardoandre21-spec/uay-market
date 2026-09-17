import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { obterSessaoCaixaAberta } from "@/lib/consultas";
import { agora, formatarData, formatarDataHora } from "@/lib/datas";
import { formatarPercentual, formatarQuantidadeComUnidade, formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO, ROTULO_STATUS_VENDA } from "@/lib/rotulos";
import { obterVenda } from "@/lib/servicos/vendas";
import { contarProdutosDistintos, podeCancelarVenda } from "@/lib/servicos/vendas-calculos";
import { formatarCpf, formatarTelefone } from "@/lib/utils";
import { BotaoLink } from "@/app/(app)/produtos/_componentes/botao-link";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, GradeIndicadores } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { BotaoCancelarVenda } from "./_componentes/botao-cancelar";

export const dynamic = "force-dynamic";

export default async function PaginaDetalheVenda({ params }: { params: Promise<{ id: string }> }) {
  const [sessao, { id }] = await Promise.all([exigirSessao(), params]);
  if (!/^\d+$/.test(id)) notFound();
  const [venda, sessaoAberta] = await Promise.all([obterVenda(Number(id)), obterSessaoCaixaAberta()]);
  if (!venda) notFound();

  const ehAdmin = sessao.papel === "ADMIN";
  const permissaoCancelar = podeCancelarVenda(venda, sessao, sessaoAberta?.id ?? null, agora());
  const lucro = venda.total - venda.custoTotal - venda.taxasTotal;
  const temFiado = venda.pagamentos.some((p) => p.forma === "FIADO");
  const trocoTotal = venda.pagamentos.reduce((a, p) => a + p.troco, 0);
  const produtosDistintos = contarProdutosDistintos(venda.itens);

  return (
    <>
      <CabecalhoPagina
        titulo={
          <span className="flex items-center gap-3">
            Venda nº {venda.numero}
            <Selo tom={venda.status === "CONCLUIDA" ? "sucesso" : "perigo"} className="text-sm">
              {ROTULO_STATUS_VENDA[venda.status]}
            </Selo>
          </span>
        }
        descricao={`${formatarDataHora(venda.criadoEm)} · operador ${venda.usuario.nome}${venda.cliente ? ` · cliente ${venda.cliente.nome}` : ""}`}
        acoes={
          <>
            <BotaoLink href="/vendas" variante="fantasma">
              <ArrowLeft className="size-4" aria-hidden />
              Voltar
            </BotaoLink>
            <BotaoLink href={`/vendas/${venda.id}/cupom?auto=1`} variante="contorno" nativo target="_blank" rel="noopener">
              <Printer className="size-4" aria-hidden />
              Imprimir cupom
            </BotaoLink>
            {permissaoCancelar.ok ? (
              <BotaoCancelarVenda vendaId={venda.id} numero={venda.numero} total={venda.total} temFiado={temFiado} />
            ) : null}
          </>
        }
      />

      {venda.status === "CANCELADA" ? (
        <Aviso tom="perigo" titulo="Venda cancelada" className="mb-6">
          Cancelada em {formatarDataHora(venda.canceladaEm)}
          {venda.canceladaPor ? ` por ${venda.canceladaPor.nome}` : ""}. Motivo: {venda.motivoCancelamento ?? "não informado"}.
          O estoque foi devolvido{temFiado ? " e o fiado, abatido da conta do cliente" : ""}.
        </Aviso>
      ) : !permissaoCancelar.ok && !ehAdmin ? (
        <p className="mb-6 text-xs text-texto-fraco">{permissaoCancelar.motivo}</p>
      ) : null}

      <GradeIndicadores className={ehAdmin ? "mb-6" : "mb-6 xl:grid-cols-2"}>
        <Indicador rotulo="Total da venda" valor={formatarReais(venda.total)} tom="primaria" detalhe={venda.desconto > 0 ? `Subtotal ${formatarReais(venda.subtotal)} − desconto ${formatarReais(venda.desconto)}` : `${produtosDistintos} ${produtosDistintos === 1 ? "produto" : "produtos"}`} />
        <Indicador rotulo="Taxas" valor={formatarReais(venda.taxasTotal)} tom={venda.taxasTotal > 0 ? "alerta" : "neutro"} detalhe="Cartão, Pix e outras" />
        {ehAdmin ? (
          <>
            <Indicador rotulo="Custo (CMV)" valor={formatarReais(venda.custoTotal)} detalhe="Custo médio no momento" />
            <Indicador
              rotulo="Lucro da venda"
              valor={formatarReais(lucro)}
              tom={lucro >= 0 ? "sucesso" : "perigo"}
              detalhe={venda.total > 0 ? `${((lucro / venda.total) * 100).toFixed(1).replace(".", ",")}% do total` : undefined}
            />
          </>
        ) : null}
      </GradeIndicadores>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Cartao>
            <CartaoCabecalho titulo="Itens" descricao="Preço praticado no momento da venda, já com promoção." />
            <Tabela className="rounded-none border-0">
              <Thead>
                <tr>
                  <Th>Produto</Th>
                  <Th numerico>Qtd</Th>
                  <Th numerico>Unitário</Th>
                  <Th numerico>Desconto</Th>
                  <Th numerico>Total</Th>
                  {ehAdmin ? <Th numerico>Custo</Th> : null}
                </tr>
              </Thead>
              <Tbody>
                {venda.itens.map((item) => (
                  <Tr key={item.id}>
                    <Td>
                      <Link href={`/produtos/${item.produtoId}`} className="font-medium text-texto hover:text-primaria hover:underline">
                        {item.descricao}
                      </Link>
                      {item.lote ? (
                        <p className="text-xs text-texto-fraco">
                          Lote {item.lote.codigo ?? `#${item.lote.id}`} · vence {formatarData(item.lote.validade)}
                        </p>
                      ) : null}
                    </Td>
                    <Td numerico>{formatarQuantidadeComUnidade(item.quantidade, item.unidade)}</Td>
                    <Td numerico>{formatarReais(item.precoUnitario)}</Td>
                    <Td numerico className={item.desconto > 0 ? "text-perigo" : "text-texto-fraco"}>
                      {item.desconto > 0 ? `- ${formatarReais(item.desconto)}` : "-"}
                    </Td>
                    <Td numerico className="font-semibold">{formatarReais(item.total)}</Td>
                    {ehAdmin ? (
                      <Td numerico className="text-texto-suave">
                        {formatarReais(Math.round((item.quantidade * item.custoUnitario) / 1000))}
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </Tbody>
            </Tabela>
            <CartaoConteudo className="border-t border-borda">
              <dl className="ml-auto flex max-w-xs flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-texto-suave">Subtotal</dt>
                  <dd className="tabular">{formatarReais(venda.subtotal)}</dd>
                </div>
                {venda.desconto > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-texto-suave">Desconto geral</dt>
                    <dd className="tabular text-perigo">- {formatarReais(venda.desconto)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-borda pt-1 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular">{formatarReais(venda.total)}</dd>
                </div>
              </dl>
            </CartaoConteudo>
          </Cartao>

          <Cartao>
            <CartaoCabecalho titulo="Pagamentos" descricao="Taxas registradas na hora: da maquininha em que o cartão passou ou da configuração da forma." />
            <Tabela className="rounded-none border-0">
              <Thead>
                <tr>
                  <Th>Forma</Th>
                  <Th numerico>Valor</Th>
                  <Th numerico>Taxa</Th>
                  <Th>Detalhes</Th>
                </tr>
              </Thead>
              <Tbody>
                {venda.pagamentos.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium">
                      {ROTULO_FORMA_PAGAMENTO[p.forma]}
                      {p.forma === "CREDITO" && p.parcelas > 1 ? ` em ${p.parcelas}x` : ""}
                    </Td>
                    <Td numerico className="font-semibold">{formatarReais(p.valor)}</Td>
                    <Td numerico className={p.taxaValor > 0 ? "text-alerta" : "text-texto-fraco"}>
                      {p.taxaValor > 0
                        ? `${formatarReais(p.taxaValor)} (${formatarPercentual(p.taxaPercentual)}${p.taxaFixa > 0 ? ` + ${formatarReais(p.taxaFixa)}` : ""})`
                        : "-"}
                    </Td>
                    <Td className="text-texto-suave">
                      {p.forma === "DINHEIRO" && p.valorRecebido !== null
                        ? `Recebido ${formatarReais(p.valorRecebido)} · troco ${formatarReais(p.troco)}`
                        : null}
                      {p.maquininha || p.nsu || p.autorizacao ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          {p.maquininha ? <Selo tom="info">{p.maquininha.nome}</Selo> : null}
                          {p.nsu ? <span className="text-xs tabular">NSU {p.nsu}</span> : null}
                          {p.autorizacao ? <span className="text-xs tabular">Aut. {p.autorizacao}</span> : null}
                        </span>
                      ) : null}
                      {p.mpPaymentIntentId ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Selo tom={p.mpStatus === "APROVADO" ? "sucesso" : "neutro"}>Maquininha Mercado Pago</Selo>
                          <span className="text-xs">
                            {p.mpPaymentId ? `pagamento ${p.mpPaymentId}` : `intenção ${p.mpPaymentIntentId}`}
                          </span>
                        </span>
                      ) : null}
                      {p.forma === "FIADO" ? "Lançado na conta do cliente" : null}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Tabela>
            {trocoTotal > 0 ? (
              <CartaoConteudo className="border-t border-borda text-sm text-texto-suave">
                Troco entregue: <span className="font-semibold tabular text-texto">{formatarReais(trocoTotal)}</span>
              </CartaoConteudo>
            ) : null}
          </Cartao>
        </div>

        <div className="flex flex-col gap-6">
          <Cartao>
            <CartaoCabecalho titulo="Dados da venda" />
            <CartaoConteudo>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-texto-fraco">Data e hora</dt>
                  <dd className="tabular">{formatarDataHora(venda.criadoEm)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-texto-fraco">Operador</dt>
                  <dd>{venda.usuario.nome}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-texto-fraco">Sessão de caixa</dt>
                  <dd>
                    {venda.sessao ? (
                      <Link href={`/caixa/${venda.sessao.id}`} className="text-primaria hover:underline">
                        Caixa #{venda.sessao.id} · aberto {formatarDataHora(venda.sessao.abertoEm)}
                        {venda.sessao.status === "ABERTO" ? " (ainda aberto)" : ""}
                      </Link>
                    ) : (
                      <span className="text-texto-fraco">sem sessão de caixa</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-texto-fraco">Cliente</dt>
                  <dd>
                    {venda.cliente ? (
                      <>
                        <Link href={`/clientes/${venda.cliente.id}`} className="font-medium text-primaria hover:underline">
                          {venda.cliente.nome}
                        </Link>
                        <p className="text-xs text-texto-fraco">
                          {[venda.cliente.cpf ? formatarCpf(venda.cliente.cpf) : null, venda.cliente.telefone ? formatarTelefone(venda.cliente.telefone) : null]
                            .filter(Boolean)
                            .join(" · ") || "sem CPF ou telefone"}
                        </p>
                      </>
                    ) : (
                      <span className="text-texto-fraco">Consumidor não identificado</span>
                    )}
                  </dd>
                </div>
                {venda.observacao ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-texto-fraco">Observação</dt>
                    <dd>{venda.observacao}</dd>
                  </div>
                ) : null}
              </dl>
            </CartaoConteudo>
          </Cartao>

          {venda.status === "CANCELADA" ? (
            <Cartao>
              <CartaoCabecalho titulo="Cancelamento" />
              <CartaoConteudo>
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-texto-fraco">Quando</dt>
                    <dd className="tabular">{formatarDataHora(venda.canceladaEm)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-texto-fraco">Por</dt>
                    <dd>{venda.canceladaPor?.nome ?? "não informado"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-texto-fraco">Motivo</dt>
                    <dd>{venda.motivoCancelamento ?? "não informado"}</dd>
                  </div>
                </dl>
              </CartaoConteudo>
            </Cartao>
          ) : null}
        </div>
      </div>
    </>
  );
}
