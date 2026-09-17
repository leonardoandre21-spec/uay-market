import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatarQuantidade, formatarQuantidadeComUnidade, formatarReais } from "@/lib/dinheiro";
import { diasAte, formatarData, formatarDataHora } from "@/lib/datas";
import { ROTULO_MOVIMENTO_ESTOQUE } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import type { ProdutoDetalhado } from "@/lib/servicos/produtos";
import { Cartao, CartaoCabecalho } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";

// Painéis de leitura da página do produto (Server Components): histórico de
// preços, últimos movimentos de estoque e lotes com validade.

function Mudanca({ de, para }: { de: number; para: number }) {
  if (de === para) return <span className="text-texto-fraco">{formatarReais(para)}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-texto-fraco line-through">{formatarReais(de)}</span>
      <ArrowRight className="size-3 text-texto-fraco" aria-hidden />
      <span className={cn("font-medium", para > de ? "text-sucesso" : "text-alerta")}>{formatarReais(para)}</span>
    </span>
  );
}

export function HistoricoPrecos({ historico }: { historico: ProdutoDetalhado["historicoPrecos"] }) {
  return (
    <Cartao>
      <CartaoCabecalho
        titulo="Histórico de preços"
        descricao={historico.length ? `${historico.length} ${historico.length === 1 ? "alteração" : "alterações"}` : undefined}
      />
      {historico.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-texto-fraco">
          Nenhuma alteração de preço registrada ainda. Toda mudança de preço de venda ou de custo aparece aqui.
        </p>
      ) : (
        <Tabela className="rounded-t-none border-0">
          <Thead>
            <tr>
              <Th>Quando</Th>
              <Th numerico>Venda</Th>
              <Th numerico>Custo</Th>
              <Th>Quem</Th>
            </tr>
          </Thead>
          <Tbody>
            {historico.map((h) => (
              <Tr key={h.id}>
                <Td className="whitespace-nowrap text-texto-suave">{formatarDataHora(h.criadoEm)}</Td>
                <Td numerico>
                  <Mudanca de={h.precoVendaAnterior} para={h.precoVendaNovo} />
                </Td>
                <Td numerico>
                  <Mudanca de={h.precoCustoAnterior} para={h.precoCustoNovo} />
                </Td>
                <Td className="text-texto-suave">{h.usuario?.nome ?? "Sistema"}</Td>
              </Tr>
            ))}
          </Tbody>
        </Tabela>
      )}
    </Cartao>
  );
}

function origemMovimento(m: ProdutoDetalhado["movimentos"][number]): string {
  if (m.venda) return `Cupom nº ${m.venda.numero}`;
  if (m.entradaId) return `Entrada nº ${m.entradaId}`;
  if (m.perdaId) return m.motivo ? `Perda: ${m.motivo}` : "Perda";
  return m.motivo ?? "";
}

export function MovimentosEstoque({
  movimentos,
  unidade,
  produtoId,
}: {
  movimentos: ProdutoDetalhado["movimentos"];
  unidade: "UN" | "KG";
  /** Quando informado, mostra o link pro extrato completo do módulo de estoque. */
  produtoId?: number;
}) {
  return (
    <Cartao>
      <CartaoCabecalho
        titulo="Últimos movimentos de estoque"
        descricao="As 20 movimentações mais recentes: vendas, entradas, perdas e ajustes."
        acoes={
          produtoId ? (
            <Link href={`/estoque/movimentos/${produtoId}`} className="text-sm font-medium text-primaria hover:underline">
              Extrato completo
            </Link>
          ) : undefined
        }
      />
      {movimentos.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-texto-fraco">Este produto ainda não movimentou estoque.</p>
      ) : (
        <Tabela className="rounded-t-none border-0">
          <Thead>
            <tr>
              <Th>Quando</Th>
              <Th>Tipo</Th>
              <Th numerico>Quantidade</Th>
              <Th numerico>Saldo</Th>
              <Th>Origem</Th>
              <Th>Quem</Th>
            </tr>
          </Thead>
          <Tbody>
            {movimentos.map((m) => (
              <Tr key={m.id}>
                <Td className="whitespace-nowrap text-texto-suave">{formatarDataHora(m.criadoEm)}</Td>
                <Td>
                  <Selo
                    tom={
                      m.tipo === "ENTRADA" || m.tipo === "CANCELAMENTO_VENDA"
                        ? "sucesso"
                        : m.tipo === "PERDA"
                          ? "perigo"
                          : m.tipo === "VENDA"
                            ? "info"
                            : "neutro"
                    }
                  >
                    {ROTULO_MOVIMENTO_ESTOQUE[m.tipo]}
                  </Selo>
                </Td>
                <Td numerico className={cn("font-medium", m.quantidade < 0 ? "text-perigo" : "text-sucesso")}>
                  {m.quantidade > 0 ? "+" : ""}
                  {formatarQuantidade(m.quantidade, unidade)}
                </Td>
                <Td numerico className="text-texto-suave">
                  {formatarQuantidadeComUnidade(m.estoqueApos, unidade)}
                </Td>
                <Td className="max-w-56 truncate text-texto-suave" title={origemMovimento(m)}>
                  {origemMovimento(m)}
                </Td>
                <Td className="text-texto-suave">{m.usuario?.nome ?? "Sistema"}</Td>
              </Tr>
            ))}
          </Tbody>
        </Tabela>
      )}
    </Cartao>
  );
}

export function LotesProduto({ lotes, unidade }: { lotes: ProdutoDetalhado["lotes"]; unidade: "UN" | "KG" }) {
  const total = lotes.reduce((acc, l) => acc + l.quantidade, 0);
  return (
    <Cartao>
      <CartaoCabecalho
        titulo="Lotes com validade"
        descricao={
          lotes.length
            ? `${lotes.length} ${lotes.length === 1 ? "lote" : "lotes"} em estoque, ${formatarQuantidadeComUnidade(total, unidade)} no total. O que vence primeiro sai primeiro.`
            : "Os lotes são criados nas entradas de estoque com data de validade."
        }
      />
      {lotes.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-texto-fraco">Nenhum lote com saldo no momento.</p>
      ) : (
        <Tabela className="rounded-t-none border-0">
          <Thead>
            <tr>
              <Th>Validade</Th>
              <Th>Situação</Th>
              <Th>Lote</Th>
              <Th numerico>Quantidade</Th>
              <Th numerico>Custo</Th>
            </tr>
          </Thead>
          <Tbody>
            {lotes.map((l) => {
              const dias = diasAte(l.validade);
              return (
                <Tr key={l.id}>
                  <Td className="whitespace-nowrap">{formatarData(l.validade)}</Td>
                  <Td>
                    {dias < 0 ? (
                      <Selo tom="perigo">Vencido há {Math.abs(dias)} {Math.abs(dias) === 1 ? "dia" : "dias"}</Selo>
                    ) : dias === 0 ? (
                      <Selo tom="perigo">Vence hoje</Selo>
                    ) : dias <= 7 ? (
                      <Selo tom="alerta">Vence em {dias} {dias === 1 ? "dia" : "dias"}</Selo>
                    ) : (
                      <Selo tom="sucesso">Vence em {dias} dias</Selo>
                    )}
                  </Td>
                  <Td className="font-mono text-xs text-texto-suave">{l.codigo ?? "sem código"}</Td>
                  <Td numerico>{formatarQuantidadeComUnidade(l.quantidade, unidade)}</Td>
                  <Td numerico className="text-texto-suave">
                    {formatarReais(l.custoUnitario)}
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Tabela>
      )}
    </Cartao>
  );
}
