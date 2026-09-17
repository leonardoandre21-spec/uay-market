import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, PackagePlus, ShoppingCart } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { agora, formatarData, formatarDataHora, noFuso } from "@/lib/datas";
import { formatarReais, somar } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO_CURTO } from "@/lib/rotulos";
import { formatarCnpj, formatarTelefone } from "@/lib/utils";
import { obterFichaFornecedor } from "@/lib/servicos/fornecedores";
import { diasAteVencimento, rotuloParcela } from "@/lib/servicos/financeiro-calculos";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, GradeIndicadores } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { LinkBotao } from "../../_componentes/link-botao";
import { SeloDias } from "../../_componentes/selo-dias";
import type { FornecedorLinha } from "../../_componentes/tipos";
import { AcoesFornecedor } from "../_componentes/acoes-fornecedor";

export const dynamic = "force-dynamic";

export default async function PaginaFichaFornecedor({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const ficha = await obterFichaFornecedor(id);
  if (!ficha) notFound();
  const { fornecedor, entradas, contas, compradoNoAno, ano, totalEntradas, totalDespesas } = ficha;

  const hoje = agora();
  const pendentes = contas.filter((c) => c.status === "PENDENTE");
  const pagas = contas.filter((c) => c.status === "PAGA");
  const canceladas = contas.length - pendentes.length - pagas.length;
  const totalPendente = somar(pendentes.map((c) => c.valor));
  const pagasNoAno = pagas.filter((c) => c.dataPagamento && noFuso(c.dataPagamento).getFullYear() === ano);
  const totalPagoNoAno = somar(pagasNoAno.map((c) => c.valorPago ?? c.valor));
  const atrasadas = pendentes.filter((c) => diasAteVencimento(c.vencimento, hoje) < 0).length;
  const ultimaEntrada = entradas.find((e) => e.estornadaEm === null);

  const linha: FornecedorLinha = {
    id: fornecedor.id,
    nome: fornecedor.nome,
    cnpj: fornecedor.cnpj,
    telefone: fornecedor.telefone,
    email: fornecedor.email,
    contato: fornecedor.contato,
    observacao: fornecedor.observacao,
    ativo: fornecedor.ativo,
  };
  const vinculos = totalEntradas + contas.length + totalDespesas;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo={
          <span className="inline-flex flex-wrap items-center gap-2">
            {fornecedor.nome}
            {fornecedor.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo tom="neutro">Inativo</Selo>}
          </span>
        }
        descricao={`Cadastrado em ${formatarData(fornecedor.criadoEm)}${fornecedor.cnpj ? ` · CNPJ ${formatarCnpj(fornecedor.cnpj)}` : ""}`}
        acoes={
          <>
            <LinkBotao href="/financeiro/fornecedores" variante="fantasma">
              <ArrowLeft className="size-4" aria-hidden />
              Fornecedores
            </LinkBotao>
            <AcoesFornecedor fornecedor={linha} vinculos={vinculos} comRotulos />
          </>
        }
      />

      <GradeIndicadores>
        <Indicador
          rotulo={`Comprado em ${ano}`}
          valor={formatarReais(compradoNoAno.total)}
          detalhe={
            compradoNoAno.quantidade > 0
              ? `${compradoNoAno.quantidade} ${compradoNoAno.quantidade === 1 ? "entrada" : "entradas"}${compradoNoAno.frete > 0 ? ` · frete ${formatarReais(compradoNoAno.frete)}` : ""}`
              : "Nenhuma entrada de estoque no ano"
          }
          icone={<ShoppingCart className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Boletos pendentes"
          valor={formatarReais(totalPendente)}
          tom={atrasadas > 0 ? "perigo" : pendentes.length > 0 ? "alerta" : "neutro"}
          detalhe={pendentes.length > 0 ? `${pendentes.length} ${pendentes.length === 1 ? "boleto" : "boletos"}${atrasadas > 0 ? ` · ${atrasadas} ${atrasadas === 1 ? "atrasado" : "atrasados"}` : ""}` : "Nada em aberto"}
          icone={<FileText className="size-4" aria-hidden />}
        />
        <Indicador rotulo={`Pago em boletos em ${ano}`} valor={formatarReais(totalPagoNoAno)} detalhe={`${pagasNoAno.length} ${pagasNoAno.length === 1 ? "pagamento" : "pagamentos"} no ano`} tom={totalPagoNoAno > 0 ? "sucesso" : "neutro"} />
        <Indicador
          rotulo="Última compra"
          valor={ultimaEntrada ? formatarData(ultimaEntrada.data) : "-"}
          detalhe={ultimaEntrada ? `${formatarReais(ultimaEntrada.valorTotal + ultimaEntrada.frete)}${ultimaEntrada.numeroNota ? ` · nota ${ultimaEntrada.numeroNota}` : ""}` : "Nenhuma entrada registrada"}
          icone={<PackagePlus className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <div className="grid gap-6 xl:grid-cols-3">
        <Cartao className="self-start">
          <CartaoCabecalho titulo="Dados de contato" />
          <CartaoConteudo>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-texto-suave">CNPJ</dt>
              <dd className="tabular text-texto">{fornecedor.cnpj ? formatarCnpj(fornecedor.cnpj) : "-"}</dd>
              <dt className="text-texto-suave">Telefone</dt>
              <dd className="tabular text-texto">
                {fornecedor.telefone ? (
                  <a href={`tel:${fornecedor.telefone}`} className="hover:text-primaria hover:underline">
                    {formatarTelefone(fornecedor.telefone)}
                  </a>
                ) : (
                  "-"
                )}
              </dd>
              <dt className="text-texto-suave">E-mail</dt>
              <dd className="break-all text-texto">
                {fornecedor.email ? (
                  <a href={`mailto:${fornecedor.email}`} className="hover:text-primaria hover:underline">
                    {fornecedor.email}
                  </a>
                ) : (
                  "-"
                )}
              </dd>
              <dt className="text-texto-suave">Contato</dt>
              <dd className="text-texto">{fornecedor.contato ?? "-"}</dd>
            </dl>
            {fornecedor.observacao ? (
              <div className="mt-4 border-t border-borda pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Observação</p>
                <p className="mt-1 whitespace-pre-line text-sm text-texto">{fornecedor.observacao}</p>
              </div>
            ) : null}
          </CartaoConteudo>
        </Cartao>

        <Cartao className="xl:col-span-2">
          <CartaoCabecalho
            titulo="Últimas entradas de estoque"
            descricao={totalEntradas > entradas.length ? `Mostrando ${entradas.length} de ${totalEntradas}` : `${totalEntradas} ${totalEntradas === 1 ? "entrada registrada" : "entradas registradas"}`}
            acoes={
              <LinkBotao href="/estoque/entradas" variante="fantasma" tamanho="sm">
                Ver entradas
              </LinkBotao>
            }
          />
          <CartaoConteudo className="p-0">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <Thead>
                <Tr>
                  <Th>Data</Th>
                  <Th>Nota</Th>
                  <Th numerico>Itens</Th>
                  <Th numerico>Mercadorias</Th>
                  <Th numerico>Frete</Th>
                  <Th>Registrado por</Th>
                </Tr>
              </Thead>
              <Tbody>
                {entradas.length === 0 ? (
                  <LinhaVazia colunas={6} mensagem="Nenhuma entrada de estoque deste fornecedor." />
                ) : (
                  entradas.map((e) => (
                    <Tr key={e.id} className={e.estornadaEm ? "opacity-60" : undefined}>
                      <Td className="whitespace-nowrap tabular">{formatarDataHora(e.data)}</Td>
                      <Td>
                        {e.numeroNota ?? <span className="text-texto-fraco">-</span>}
                        {e.estornadaEm ? (
                          <Selo tom="perigo" className="ml-2">
                            Estornada
                          </Selo>
                        ) : null}
                      </Td>
                      <Td numerico>{e._count.itens}</Td>
                      <Td numerico className="font-medium">
                        {formatarReais(e.valorTotal)}
                      </Td>
                      <Td numerico>{e.frete > 0 ? formatarReais(e.frete) : <span className="text-texto-fraco">-</span>}</Td>
                      <Td className="text-texto-suave">{e.usuario?.nome ?? "-"}</Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </table></div>
          </CartaoConteudo>
        </Cartao>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Cartao>
          <CartaoCabecalho
            titulo="Boletos pendentes"
            descricao={pendentes.length ? `${pendentes.length} em aberto · ${formatarReais(totalPendente)}` : "Nada em aberto"}
            acoes={
              <LinkBotao href="/financeiro/contas-a-pagar" variante="fantasma" tamanho="sm">
                Pagar na lista
              </LinkBotao>
            }
          />
          <CartaoConteudo className="p-0">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <Thead>
                <Tr>
                  <Th>Vencimento</Th>
                  <Th>Situação</Th>
                  <Th>Descrição</Th>
                  <Th numerico>Valor</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pendentes.length === 0 ? (
                  <LinhaVazia colunas={4} mensagem="Nenhum boleto pendente." />
                ) : (
                  pendentes
                    .slice()
                    .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())
                    .map((c) => {
                      const dias = diasAteVencimento(c.vencimento, hoje);
                      const parcela = rotuloParcela(c.parcelaAtual, c.totalParcelas);
                      return (
                        <Tr key={c.id}>
                          <Td className="whitespace-nowrap tabular">{formatarData(c.vencimento)}</Td>
                          <Td>
                            <SeloDias dias={dias} status={c.status} />
                          </Td>
                          <Td>
                            <span className="font-medium text-texto">{c.descricao}</span>
                            {parcela ? <span className="ml-1 text-xs text-texto-suave">({parcela})</span> : null}
                            {c.categoria ? <span className="block text-xs text-texto-fraco">{c.categoria.nome}</span> : null}
                          </Td>
                          <Td numerico className="font-medium">
                            {formatarReais(c.valor)}
                          </Td>
                        </Tr>
                      );
                    })
                )}
              </Tbody>
            </table></div>
          </CartaoConteudo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho
            titulo="Boletos pagos"
            descricao={`${pagas.length} ${pagas.length === 1 ? "pagamento" : "pagamentos"} no total${canceladas > 0 ? ` · ${canceladas} ${canceladas === 1 ? "cancelado" : "cancelados"}` : ""}`}
            acoes={
              <Link href="/financeiro/contas-a-pagar?visao=pagas" className="text-sm text-texto-suave hover:text-primaria hover:underline">
                Ver todos
              </Link>
            }
          />
          <CartaoConteudo className="p-0">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <Thead>
                <Tr>
                  <Th>Pago em</Th>
                  <Th>Descrição</Th>
                  <Th>Forma</Th>
                  <Th numerico>Valor pago</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pagas.length === 0 ? (
                  <LinhaVazia colunas={4} mensagem="Nenhum boleto pago ainda." />
                ) : (
                  pagas
                    .slice()
                    .sort((a, b) => (b.dataPagamento?.getTime() ?? 0) - (a.dataPagamento?.getTime() ?? 0))
                    .slice(0, 12)
                    .map((c) => {
                      const parcela = rotuloParcela(c.parcelaAtual, c.totalParcelas);
                      return (
                        <Tr key={c.id}>
                          <Td className="whitespace-nowrap tabular">{c.dataPagamento ? formatarData(c.dataPagamento) : "-"}</Td>
                          <Td>
                            <span className="font-medium text-texto">{c.descricao}</span>
                            {parcela ? <span className="ml-1 text-xs text-texto-suave">({parcela})</span> : null}
                            <span className="block text-xs text-texto-fraco">vencia em {formatarData(c.vencimento)}</span>
                          </Td>
                          <Td>{c.formaPagamento ? ROTULO_FORMA_PAGAMENTO_CURTO[c.formaPagamento] : <span className="text-texto-fraco">-</span>}</Td>
                          <Td numerico className="font-medium">
                            {formatarReais(c.valorPago ?? c.valor)}
                            {c.valorPago !== null && c.valorPago !== c.valor ? (
                              <span className={`block text-xs ${c.valorPago > c.valor ? "text-perigo" : "text-sucesso"}`}>
                                {c.valorPago > c.valor ? `+${formatarReais(c.valorPago - c.valor)} juros` : `-${formatarReais(c.valor - c.valorPago)} desconto`}
                              </span>
                            ) : null}
                          </Td>
                        </Tr>
                      );
                    })
                )}
              </Tbody>
            </table></div>
          </CartaoConteudo>
        </Cartao>
      </div>
    </div>
  );
}
