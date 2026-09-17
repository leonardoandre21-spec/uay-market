import Link from "next/link";
import { ArrowRight, CalendarClock, LayoutDashboard } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { obterComparativo } from "@/lib/servicos/gestao";
import { capitalizar, margemBp, ticketMedio } from "@/lib/servicos/gestao-calculos";
import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { GraficoMeses } from "../_componentes/grafico-meses";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { ValorResultado } from "../_componentes/blocos";

export const dynamic = "force-dynamic";

const classeLinkAcao =
  "inline-flex h-10 items-center gap-2 rounded-padrao border border-borda bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2";

export default async function PaginaComparativo() {
  await exigirAdmin();
  const meses = await obterComparativo(12);
  const comMovimento = meses.filter((m) => m.dre.numeroVendas > 0 || m.dre.despesasTotal > 0 || m.dre.perdasTotal > 0);

  const total = comMovimento.reduce(
    (acc, m) => ({
      receita: acc.receita + m.dre.receitaBruta,
      cmv: acc.cmv + m.dre.cmv,
      lucroBruto: acc.lucroBruto + m.dre.lucroBruto,
      perdas: acc.perdas + m.dre.perdasTotal,
      despesas: acc.despesas + m.dre.despesasTotal,
      lucroLiquido: acc.lucroLiquido + m.dre.lucroLiquido,
      vendas: acc.vendas + m.dre.numeroVendas,
    }),
    { receita: 0, cmv: 0, lucroBruto: 0, perdas: 0, despesas: 0, lucroLiquido: 0, vendas: 0 },
  );

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Comparativo dos últimos 12 meses"
        descricao="Mesmo cálculo do fechamento mensal, mês a mês. Lucro líquido já desconta custo das mercadorias, taxas, perdas e despesas."
        acoes={
          <>
            <Link href="/gestao" className={classeLinkAcao}>
              <LayoutDashboard className="size-4" aria-hidden /> Painel
            </Link>
            <Link href="/gestao/fechamento" className={classeLinkAcao}>
              <CalendarClock className="size-4" aria-hidden /> Fechamento mensal
            </Link>
          </>
        }
      />

      <Cartao>
        <CartaoCabecalho titulo="Receita e lucro líquido" descricao="Do mês mais antigo pro mais recente" />
        <CartaoConteudo>
          <GraficoMeses
            dados={[...meses].reverse().map((m) => ({
              chave: m.chave,
              rotulo: capitalizar(m.rotulo),
              rotuloCurto: m.rotuloCurto,
              receita: m.dre.receitaBruta,
              lucroLiquido: m.dre.lucroLiquido,
            }))}
          />
        </CartaoConteudo>
      </Cartao>

      <Tabela>
        <Thead>
          <Tr>
            <Th>Mês</Th>
            <Th numerico>Receita</Th>
            <Th numerico>CMV</Th>
            <Th numerico>Lucro bruto</Th>
            <Th numerico>Perdas</Th>
            <Th numerico>Despesas</Th>
            <Th numerico>Lucro líquido</Th>
            <Th numerico>Margem</Th>
            <Th numerico>Vendas</Th>
            <Th numerico>Ticket</Th>
            <Th className="w-px" />
          </Tr>
        </Thead>
        <Tbody>
          {meses.map((m, i) => {
            const vazio = m.dre.numeroVendas === 0 && m.dre.despesasTotal === 0 && m.dre.perdasTotal === 0;
            return (
              <Tr key={m.chave} className={cn(vazio && "text-texto-fraco")}>
                <Td className="whitespace-nowrap font-medium text-texto">
                  {capitalizar(m.rotulo)}
                  {i === 0 ? (
                    <Selo tom="info" className="ml-2 normal-case">
                      Em andamento
                    </Selo>
                  ) : null}
                </Td>
                <Td numerico>{formatarReais(m.dre.receitaBruta)}</Td>
                <Td numerico>{formatarReais(m.dre.cmv)}</Td>
                <Td numerico>
                  <ValorResultado centavos={m.dre.lucroBruto} />
                </Td>
                <Td numerico>{formatarReais(m.dre.perdasTotal)}</Td>
                <Td numerico>{formatarReais(m.dre.despesasTotal)}</Td>
                <Td numerico className="font-semibold">
                  <ValorResultado centavos={m.dre.lucroLiquido} />
                </Td>
                <Td numerico className={cn(m.dre.margemLiquidaBp < 0 && "text-perigo")}>
                  {vazio ? "" : formatarPercentual(m.dre.margemLiquidaBp, 1)}
                </Td>
                <Td numerico>{m.dre.numeroVendas}</Td>
                <Td numerico>{formatarReais(m.dre.ticketMedio)}</Td>
                <Td>
                  <Link
                    href={`/gestao/fechamento?mes=${m.chave}`}
                    className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-primaria hover:underline"
                    aria-label={`Abrir fechamento de ${m.rotulo}`}
                  >
                    Fechamento <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
        <tfoot className="border-t-2 border-borda bg-superficie-2 font-semibold text-texto">
          <tr>
            <Td>
              Total ({comMovimento.length} {comMovimento.length === 1 ? "mês" : "meses"} com movimento)
            </Td>
            <Td numerico>{formatarReais(total.receita)}</Td>
            <Td numerico>{formatarReais(total.cmv)}</Td>
            <Td numerico>
              <ValorResultado centavos={total.lucroBruto} />
            </Td>
            <Td numerico>{formatarReais(total.perdas)}</Td>
            <Td numerico>{formatarReais(total.despesas)}</Td>
            <Td numerico>
              <ValorResultado centavos={total.lucroLiquido} />
            </Td>
            <Td numerico className={cn(margemBp(total.lucroLiquido, total.receita) < 0 && "text-perigo")}>
              {total.receita > 0 ? formatarPercentual(margemBp(total.lucroLiquido, total.receita), 1) : ""}
            </Td>
            <Td numerico>{total.vendas}</Td>
            <Td numerico>{formatarReais(ticketMedio(total.receita, total.vendas))}</Td>
            <Td />
          </tr>
        </tfoot>
      </Tabela>
    </div>
  );
}
