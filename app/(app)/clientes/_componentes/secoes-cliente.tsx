import Link from "next/link";
import { Cake, ExternalLink, Mail, MapPin, Phone, Printer, Receipt, ShoppingBag } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { EstadoVazio, GradeIndicadores } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { formatarData } from "@/lib/datas";
import { formatarQuantidadeComUnidade, formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO_CURTO, ROTULO_LANCAMENTO_FIADO, ROTULO_STATUS_VENDA } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { DIAS_FIADO_VENCIDO, EXTRATO_POR_PAGINA, fiadoVencido } from "@/lib/servicos/clientes-calculos";
import type { ClienteCompleto } from "@/lib/servicos/clientes";

// Seções da página do cliente. Todas são Server Components: só leitura.

export function SecaoResumo({ cliente }: { cliente: ClienteCompleto }) {
  const vencido = cliente.saldo > 0 && fiadoVencido(cliente.diasAtraso);
  const acimaDoLimite = cliente.saldo > 0 && cliente.saldo > cliente.limiteFiado;
  // Saldo negativo = crédito do cliente (venda fiado já paga que foi cancelada).
  const credito = cliente.saldo < 0;

  return (
    <>
      <GradeIndicadores>
        <Indicador
          rotulo={credito ? "Crédito do cliente" : "Saldo devedor"}
          valor={formatarReais(Math.abs(cliente.saldo))}
          tom={cliente.saldo > 0 ? "perigo" : credito ? "info" : "sucesso"}
          detalhe={
            cliente.saldo > 0
              ? `${cliente.itensEmAberto.length} compra(s) em aberto`
              : credito
                ? "A loja deve esse valor ao cliente"
                : "Nada pendente"
          }
        />
        <Indicador
          rotulo="Limite de fiado"
          valor={cliente.limiteFiado === 0 ? <span className="text-lg">Não compra fiado</span> : formatarReais(cliente.limiteFiado)}
          tom={cliente.limiteFiado === 0 ? "neutro" : "info"}
          detalhe={cliente.limiteFiado === 0 ? "O administrador define o limite" : undefined}
        />
        <Indicador
          rotulo="Disponível pra fiado"
          valor={formatarReais(cliente.disponivel)}
          tom={cliente.disponivel > 0 ? "primaria" : "neutro"}
          detalhe={acimaDoLimite ? `Passou ${formatarReais(cliente.saldo - cliente.limiteFiado)} do limite` : undefined}
        />
        <Indicador
          rotulo="Compra mais antiga em aberto"
          valor={cliente.saldo > 0 ? `${cliente.diasAtraso} dia(s)` : "Em dia"}
          tom={vencido ? "perigo" : cliente.saldo > 0 ? "alerta" : "sucesso"}
          detalhe={cliente.saldo > 0 ? `Vence com ${DIAS_FIADO_VENCIDO} dias` : undefined}
        />
      </GradeIndicadores>

      {!cliente.ativo ? (
        <Aviso tom="info" titulo="Cliente inativo">
          Este cadastro está desativado: não aparece no caixa nem na lista principal. Reative na aba Cadastro.
        </Aviso>
      ) : null}
      {vencido ? (
        <Aviso tom="perigo" titulo={`Fiado vencido há ${cliente.diasAtraso} dias`}>
          A compra mais antiga sem pagamento é de {formatarData(new Date(cliente.itensEmAberto[0]?.data ?? cliente.criadoEm))}. Vale lembrar o cliente pelo WhatsApp.
        </Aviso>
      ) : null}
      {acimaDoLimite ? (
        <Aviso tom="alerta" titulo="Saldo acima do limite">
          O caixa não vai liberar novas compras fiado até o saldo baixar de {formatarReais(cliente.limiteFiado)}.
        </Aviso>
      ) : null}
      {credito ? (
        <Aviso tom="info" titulo={`Crédito de ${formatarReais(-cliente.saldo)}`}>
          Uma venda fiado que o cliente já tinha pago foi cancelada, então a loja deve esse valor a ele. O caixa desconta o crédito na próxima compra fiado. Pra devolver em dinheiro, o administrador lança uma dívida no Ajuste manual com o motivo da devolução.
        </Aviso>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao>
          <CartaoCabecalho titulo="Contato" />
          <CartaoConteudo className="flex flex-col gap-3 text-sm">
            <LinhaContato icone={<Phone className="size-4" aria-hidden />} rotulo="Telefone">
              {cliente.telefoneFormatado || <Vazio>não informado</Vazio>}
            </LinhaContato>
            <LinhaContato icone={<Mail className="size-4" aria-hidden />} rotulo="E-mail">
              {cliente.email || <Vazio>não informado</Vazio>}
            </LinhaContato>
            <LinhaContato icone={<MapPin className="size-4" aria-hidden />} rotulo="Endereço">
              {cliente.endereco || <Vazio>não informado</Vazio>}
            </LinhaContato>
            <LinhaContato icone={<Cake className="size-4" aria-hidden />} rotulo="Nascimento">
              {cliente.dataNascimentoFormatada ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {cliente.dataNascimentoFormatada}
                  {cliente.idade !== null ? <span className="text-texto-fraco">({cliente.idade} anos)</span> : null}
                  {cliente.aniversarianteDoMes ? <Selo tom="primaria">Aniversariante do mês</Selo> : null}
                </span>
              ) : (
                <Vazio>não informado</Vazio>
              )}
            </LinhaContato>
            {cliente.observacao ? (
              <div className="rounded-padrao bg-superficie-2 px-3 py-2 text-texto-suave">
                <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Observação</p>
                <p className="mt-0.5 whitespace-pre-wrap text-texto">{cliente.observacao}</p>
              </div>
            ) : null}
            <p className="text-xs text-texto-fraco">Cliente desde {cliente.criadoEmFormatado}.</p>
          </CartaoConteudo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho
            titulo="Compras em aberto"
            descricao={
              cliente.saldo > 0
                ? "Pagamentos quitam as compras mais antigas primeiro."
                : "Nenhuma compra fiado pendente."
            }
          />
          <CartaoConteudo className="p-0">
            {cliente.itensEmAberto.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-texto-fraco">Tudo quitado.</p>
            ) : (
              <ul className="divide-y divide-borda">
                {cliente.itensEmAberto.map((item, i) => (
                  <li key={`${item.data}-${i}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="text-texto">{formatarData(new Date(item.data))}</p>
                      <p className="text-xs text-texto-fraco">{item.numeroVenda ? `Cupom nº ${item.numeroVenda}` : "Lançamento manual"}</p>
                    </div>
                    <span className="tabular font-medium text-perigo">{formatarReais(item.valor)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 bg-superficie-2 px-5 py-2.5 text-sm font-semibold">
                  <span>Total em aberto</span>
                  <span className="tabular text-perigo">{formatarReais(cliente.saldo)}</span>
                </li>
              </ul>
            )}
          </CartaoConteudo>
        </Cartao>
      </div>
    </>
  );
}

function LinhaContato({ icone, rotulo, children }: { icone: React.ReactNode; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-texto-fraco">{icone}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">{rotulo}</p>
        <div className="mt-0.5 text-texto">{children}</div>
      </div>
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <span className="text-texto-fraco">{children}</span>;
}

// ---------------------------------------------------------------- extrato

export function SecaoExtrato({ cliente }: { cliente: ClienteCompleto }) {
  if (cliente.extrato.length === 0) {
    return (
      <EstadoVazio
        icone={<Receipt />}
        titulo="Nenhum lançamento de fiado"
        descricao="Quando o cliente comprar fiado no caixa ou pagar uma conta, aparece aqui."
      />
    );
  }
  // O saldo usa todos os lançamentos; a tabela mostra só os mais recentes e oferece "ver mais".
  const exibidos = cliente.extrato.length;
  const total = cliente.totalLancamentos;
  const truncado = exibidos < total;
  const linkMais = (limite: number | "todos") => `/clientes/${cliente.id}?aba=extrato&extrato=${limite}#extrato`;
  return (
    <div className="flex flex-col gap-2">
      <Tabela>
        <Thead>
          <Tr>
            <Th>Data</Th>
            <Th>Tipo</Th>
            <Th>Venda</Th>
            <Th>Forma</Th>
            <Th numerico>Valor</Th>
            <Th numerico>Saldo</Th>
            <Th className="w-px" aria-label="Ações" />
          </Tr>
        </Thead>
        <Tbody>
          {cliente.extrato.map((l) => {
            const debito = l.tipo === "DEBITO";
            // ESTORNO reduz o saldo como um pagamento, mas não é dinheiro recebido: cor neutra.
            const estorno = l.tipo === "ESTORNO";
            return (
              <Tr key={l.id}>
                <Td className="whitespace-nowrap tabular text-texto-suave">{l.dataHoraFormatada}</Td>
                <Td>
                  <div className="flex flex-col">
                    <span className="inline-flex items-center gap-2">
                      <Selo tom={debito ? "perigo" : estorno ? "neutro" : "sucesso"}>{ROTULO_LANCAMENTO_FIADO[l.tipo]}</Selo>
                      {l.ajusteManual ? <Selo tom="neutro">Ajuste manual</Selo> : null}
                    </span>
                    {l.observacao ? <span className="mt-1 text-xs text-texto-suave">{l.observacao}</span> : null}
                    {l.usuarioNome ? <span className="text-xs text-texto-fraco">por {l.usuarioNome}</span> : null}
                  </div>
                </Td>
                <Td>
                  {l.vendaId ? (
                    <Link href={`/vendas/${l.vendaId}`} className="inline-flex items-center gap-1 text-primaria hover:underline">
                      nº {l.numeroVenda ?? l.vendaId}
                      <ExternalLink className="size-3" aria-hidden />
                    </Link>
                  ) : (
                    <span className="text-texto-fraco">-</span>
                  )}
                </Td>
                <Td className="text-texto-suave">{l.formaPagamento ? ROTULO_FORMA_PAGAMENTO_CURTO[l.formaPagamento] : <span className="text-texto-fraco">-</span>}</Td>
                <Td numerico className={cn("font-medium", debito ? "text-perigo" : estorno ? "text-texto-suave" : "text-sucesso")}>
                  {debito ? "+" : "-"} {formatarReais(l.valor)}
                </Td>
                <Td numerico className={cn(l.saldoApos > 0 ? "text-texto" : "text-texto-fraco")}>
                  {formatarReais(l.saldoApos)}
                </Td>
                <Td>
                  {l.tipo === "PAGAMENTO" ? (
                    <Link
                      href={`/clientes/${cliente.id}/recibo/${l.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-padrao border border-borda bg-superficie px-2.5 text-xs font-medium text-texto hover:bg-superficie-2"
                      title="Abrir comprovante pra imprimir"
                    >
                      <Printer className="size-3.5" aria-hidden />
                      Recibo
                    </Link>
                  ) : null}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Tabela>
      {truncado ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-fraco">
          <span>
            Mostrando os {exibidos} lançamentos mais recentes de {total}. O saldo considera todos.
          </span>
          <Link href={linkMais(exibidos + EXTRATO_POR_PAGINA)} className="font-medium text-primaria hover:underline">
            Ver mais {Math.min(EXTRATO_POR_PAGINA, total - exibidos)}
          </Link>
          <Link href={linkMais("todos")} className="font-medium text-primaria hover:underline">
            Ver todos
          </Link>
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- compras

export function SecaoCompras({ cliente }: { cliente: ClienteCompleto }) {
  if (cliente.compras.length === 0) {
    return (
      <EstadoVazio
        icone={<ShoppingBag />}
        titulo="Nenhuma compra registrada"
        descricao="As vendas feitas no caixa com este cliente identificado aparecem aqui."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Tabela>
        <Thead>
          <Tr>
            <Th>Cupom</Th>
            <Th>Data</Th>
            <Th numerico>Itens</Th>
            <Th>Pagamento</Th>
            <Th>Situação</Th>
            <Th numerico>Total</Th>
          </Tr>
        </Thead>
        <Tbody>
          {cliente.compras.map((v) => (
            <Tr key={v.id} className={cn(v.status === "CANCELADA" && "opacity-60")}>
              <Td>
                <Link href={`/vendas/${v.id}`} className="inline-flex items-center gap-1 font-medium text-primaria hover:underline">
                  nº {v.numero}
                  <ExternalLink className="size-3" aria-hidden />
                </Link>
              </Td>
              <Td className="whitespace-nowrap tabular text-texto-suave">{v.dataHoraFormatada}</Td>
              <Td numerico>{v.quantidadeItens}</Td>
              <Td className="text-texto-suave">
                {v.formas.length === 0 ? <span className="text-texto-fraco">-</span> : v.formas.map((f) => ROTULO_FORMA_PAGAMENTO_CURTO[f]).join(" + ")}
              </Td>
              <Td>
                <Selo tom={v.status === "CONCLUIDA" ? "sucesso" : "neutro"}>{ROTULO_STATUS_VENDA[v.status]}</Selo>
              </Td>
              <Td numerico className={cn("font-medium", v.status === "CANCELADA" && "line-through text-texto-fraco")}>
                {formatarReais(v.total)}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Tabela>
      {cliente.compras.length >= 30 ? (
        <p className="text-xs text-texto-fraco">Mostrando as 30 compras mais recentes. O histórico completo está em Vendas.</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- estatísticas

export function SecaoEstatisticas({ cliente }: { cliente: ClienteCompleto }) {
  const e = cliente.estatisticas;
  return (
    <>
      <GradeIndicadores>
        <Indicador rotulo="Total gasto" valor={formatarReais(e.totalGasto)} detalhe={e.comprasConcluidas > 0 ? `${e.comprasConcluidas} compra(s) concluída(s)` : "Ainda não comprou"} tom="primaria" />
        <Indicador rotulo="Ticket médio" valor={formatarReais(e.ticketMedio)} detalhe="Por compra concluída" />
        <Indicador
          rotulo="Comprou fiado"
          valor={formatarReais(e.totalFiadoComprado)}
          detalhe={
            e.totalFiadoAbatido > 0
              ? `Pagou ${formatarReais(e.totalFiadoPago)} até agora · ${formatarReais(e.totalFiadoAbatido)} em descontos e acertos`
              : `Pagou ${formatarReais(e.totalFiadoPago)} até agora`
          }
          tom={e.totalFiadoComprado > 0 ? "alerta" : "neutro"}
        />
        <Indicador
          rotulo="Período"
          valor={e.primeiraCompra ? <span className="text-lg">{e.primeiraCompra}</span> : "-"}
          detalhe={e.ultimaCompra ? `Última compra em ${e.ultimaCompra}` : "Sem compras"}
        />
      </GradeIndicadores>

      <Cartao>
        <CartaoCabecalho titulo="Produtos que mais compra" descricao="Os 5 produtos com maior valor gasto nas compras concluídas." />
        <CartaoConteudo className="p-0">
          {e.produtosMaisComprados.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-texto-fraco">Sem compras concluídas ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <Thead>
                <Tr>
                  <Th>#</Th>
                  <Th>Produto</Th>
                  <Th numerico>Quantidade</Th>
                  <Th numerico>Vezes</Th>
                  <Th numerico>Total gasto</Th>
                </Tr>
              </Thead>
              <Tbody>
                {e.produtosMaisComprados.map((p, i) => (
                  <Tr key={p.produtoId}>
                    <Td className="w-10 text-texto-fraco">{i + 1}º</Td>
                    <Td className="font-medium">
                      <Link href={`/produtos/${p.produtoId}`} className="hover:text-primaria hover:underline">
                        {p.nome}
                      </Link>
                    </Td>
                    <Td numerico>{formatarQuantidadeComUnidade(p.quantidade, p.unidade)}</Td>
                    <Td numerico>{p.vezes}</Td>
                    <Td numerico className="font-medium">
                      {formatarReais(p.total)}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </table>
          )}
        </CartaoConteudo>
      </Cartao>
    </>
  );
}
