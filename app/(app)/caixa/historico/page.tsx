import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Banknote, Receipt, Scale, Wallet } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import {
  agora,
  formatarData,
  formatarDataHora,
  limitesDoDia,
  limitesDoMes,
  paraDataInput,
  parseDataInput,
  subDays,
} from "@/lib/datas";
import { formatarReais, somar } from "@/lib/dinheiro";
import { cn, truncar } from "@/lib/utils";
import { CabecalhoPagina, GradeIndicadores } from "@/components/ui/pagina";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { Campo, Entrada } from "@/components/ui/campo";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { Aviso } from "@/components/ui/aviso";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { descreverDiferenca, tomDiferenca } from "@/lib/servicos/caixa-calculos";
import { listarSessoesFechadas } from "@/lib/servicos/caixa";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Histórico de caixas" };

type Parametros = { de?: string; ate?: string };

/** Resolve o período a partir da URL. Sem parâmetros: o mês atual. */
function resolverPeriodo(params: Parametros) {
  const hoje = agora();
  const mes = limitesDoMes(hoje);
  const de = parseDataInput(params.de);
  const ate = parseDataInput(params.ate);
  const inicio = de ? limitesDoDia(de).inicio : mes.inicio;
  let fim = ate ? limitesDoDia(ate).fim : de ? limitesDoDia(hoje).fim : mes.fim;
  if (fim < inicio) fim = limitesDoDia(inicio).fim;
  return { inicio, fim, filtrado: Boolean(de || ate) };
}

export default async function PaginaHistorico({ searchParams }: { searchParams: Promise<Parametros> }) {
  const [usuario, params] = await Promise.all([exigirSessao(), searchParams]);
  const admin = usuario.papel === "ADMIN";
  const { inicio, fim, filtrado } = resolverPeriodo(params);

  const sessoes = await listarSessoesFechadas({
    inicio,
    fim,
    usuarioId: admin ? undefined : usuario.usuarioId,
  });

  const totais = {
    sessoes: sessoes.length,
    vendas: somar(sessoes.map((s) => s.vendasTotal)),
    vendasQuantidade: somar(sessoes.map((s) => s.vendasQuantidade)),
    esperado: somar(sessoes.map((s) => s.valorFechamentoEsperado)),
    contado: somar(sessoes.map((s) => s.valorFechamentoContado)),
    diferenca: somar(sessoes.map((s) => s.diferenca)),
    sobras: sessoes.filter((s) => (s.diferenca ?? 0) > 0).length,
    faltas: sessoes.filter((s) => (s.diferenca ?? 0) < 0).length,
  };

  const hoje = agora();
  const atalhos = [
    { rotulo: "Hoje", href: `/caixa/historico?de=${paraDataInput(hoje)}&ate=${paraDataInput(hoje)}` },
    { rotulo: "Últimos 7 dias", href: `/caixa/historico?de=${paraDataInput(subDays(hoje, 6))}&ate=${paraDataInput(hoje)}` },
    { rotulo: "Últimos 30 dias", href: `/caixa/historico?de=${paraDataInput(subDays(hoje, 29))}&ate=${paraDataInput(hoje)}` },
    { rotulo: "Este mês", href: "/caixa/historico" },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Histórico de caixas"
        descricao={
          admin
            ? "Todas as sessões fechadas, com esperado, contado e diferença de cada uma."
            : "Suas sessões de caixa fechadas. Um administrador vê as de todos os operadores."
        }
        acoes={
          <Link
            href="/caixa"
            className="inline-flex h-10 items-center gap-2 rounded-padrao border border-borda bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Voltar ao caixa
          </Link>
        }
      />

      <Cartao className="mb-6">
        <CartaoConteudo className="flex flex-col gap-4">
          <form method="get" action="/caixa/historico" className="flex flex-wrap items-end gap-3">
            <Campo rotulo="De" htmlFor="de" className="w-full sm:w-44">
              <Entrada id="de" name="de" type="date" defaultValue={paraDataInput(inicio)} max={paraDataInput(hoje)} />
            </Campo>
            <Campo rotulo="Até" htmlFor="ate" className="w-full sm:w-44">
              <Entrada id="ate" name="ate" type="date" defaultValue={paraDataInput(fim)} max={paraDataInput(hoje)} />
            </Campo>
            <Botao type="submit" variante="secundaria">
              Filtrar
            </Botao>
          </form>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-texto-fraco">Atalhos:</span>
            {atalhos.map((a) => (
              <Link
                key={a.rotulo}
                href={a.href}
                className="rounded-full border border-borda px-3 py-1 text-texto-suave hover:bg-superficie-2 hover:text-texto"
              >
                {a.rotulo}
              </Link>
            ))}
            <span className="ml-auto text-texto-fraco">
              Período: {formatarData(inicio)} a {formatarData(fim)}
              {filtrado ? "" : " (mês atual)"}
            </span>
          </div>
        </CartaoConteudo>
      </Cartao>

      <GradeIndicadores className="mb-6">
        <Indicador
          rotulo="Caixas fechados"
          valor={totais.sessoes}
          detalhe={`${totais.vendasQuantidade} ${totais.vendasQuantidade === 1 ? "venda" : "vendas"} no período`}
          icone={<Wallet className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Total vendido"
          valor={formatarReais(totais.vendas)}
          detalhe="Vendas concluídas dessas sessões"
          tom="primaria"
          icone={<Receipt className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Dinheiro contado"
          valor={formatarReais(totais.contado)}
          detalhe={`Esperado: ${formatarReais(totais.esperado)}`}
          icone={<Banknote className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Diferença acumulada"
          valor={`${totais.diferenca > 0 ? "+" : ""}${formatarReais(totais.diferenca)}`}
          detalhe={
            totais.sessoes === 0
              ? "Nenhum caixa no período"
              : `${totais.sobras} com sobra · ${totais.faltas} com falta · ${totais.sessoes - totais.sobras - totais.faltas} exato(s)`
          }
          tom={totais.sessoes === 0 ? "neutro" : tomDiferenca(totais.diferenca)}
          icone={<Scale className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      {totais.faltas > 0 && admin ? (
        <Aviso tom="alerta" className="mb-6">
          {totais.faltas === 1 ? "Um caixa fechou com falta" : `${totais.faltas} caixas fecharam com falta`} de dinheiro no período.
          Clique no número do caixa pra ver a observação de quem fechou.
        </Aviso>
      ) : null}

      <Cartao>
        <CartaoCabecalho
          titulo="Sessões fechadas"
          descricao={sessoes.length ? `${sessoes.length} ${sessoes.length === 1 ? "sessão" : "sessões"}, da mais recente pra mais antiga.` : undefined}
        />
        <Tabela className="rounded-none border-0 border-t">
          <Thead>
            <Tr>
              <Th>Caixa</Th>
              <Th>Abertura</Th>
              <Th>Fechamento</Th>
              <Th>Operador</Th>
              <Th numerico>Fundo de troco</Th>
              <Th numerico>Vendas</Th>
              <Th numerico>Esperado</Th>
              <Th numerico>Contado</Th>
              <Th>Diferença</Th>
              <Th>Observações</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sessoes.length === 0 ? (
              <LinhaVazia colunas={10} mensagem="Nenhum caixa fechado neste período." />
            ) : (
              sessoes.map((s) => {
                const diferenca = s.diferenca ?? 0;
                const tom = tomDiferenca(diferenca);
                return (
                  <Tr key={s.id}>
                    <Td>
                      <Link href={`/caixa/${s.id}`} className="font-medium text-primaria hover:underline">
                        nº {s.id}
                      </Link>
                    </Td>
                    <Td className="tabular whitespace-nowrap">{formatarDataHora(s.abertoEm)}</Td>
                    <Td className="tabular whitespace-nowrap">{formatarDataHora(s.fechadoEm)}</Td>
                    <Td>
                      <span className="block">{s.usuarioAbertura.nome}</span>
                      {s.usuarioFechamento && s.usuarioFechamento.nome !== s.usuarioAbertura.nome ? (
                        <span className="block text-xs text-texto-fraco">fechado por {s.usuarioFechamento.nome}</span>
                      ) : null}
                    </Td>
                    <Td numerico>{formatarReais(s.valorAbertura)}</Td>
                    <Td numerico>
                      <span className="font-medium">{formatarReais(s.vendasTotal)}</span>
                      <span className="block text-xs text-texto-fraco">{s.vendasQuantidade} {s.vendasQuantidade === 1 ? "venda" : "vendas"}</span>
                    </Td>
                    <Td numerico>{formatarReais(s.valorFechamentoEsperado ?? 0)}</Td>
                    <Td numerico className="font-medium">{formatarReais(s.valorFechamentoContado ?? 0)}</Td>
                    <Td>
                      <Selo tom={tom} className={cn(diferenca !== 0 && "font-semibold")}>
                        {descreverDiferenca(diferenca)}
                      </Selo>
                    </Td>
                    <Td className="max-w-xs text-xs text-texto-suave">
                      {!s.observacao && !s.observacaoFechamento ? <span className="text-texto-fraco">Nenhuma</span> : null}
                      {s.observacao ? (
                        <span className="block" title={s.observacao}>
                          <span className="font-medium text-texto-fraco">Obs. abertura:</span> {truncar(s.observacao, 60)}
                        </span>
                      ) : null}
                      {s.observacaoFechamento ? (
                        <span className="block" title={s.observacaoFechamento}>
                          <span className="font-medium text-texto-fraco">Obs. fechamento:</span>{" "}
                          {truncar(s.observacaoFechamento, 60)}
                        </span>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })
            )}
            {sessoes.length > 1 ? (
              <Tr className="bg-superficie-2/60 font-semibold">
                <Td colSpan={4}>Totais do período</Td>
                <Td numerico>{formatarReais(somar(sessoes.map((s) => s.valorAbertura)))}</Td>
                <Td numerico>{formatarReais(totais.vendas)}</Td>
                <Td numerico>{formatarReais(totais.esperado)}</Td>
                <Td numerico>{formatarReais(totais.contado)}</Td>
                <Td>
                  <Selo tom={tomDiferenca(totais.diferenca)}>{descreverDiferenca(totais.diferenca)}</Selo>
                </Td>
                <Td />
              </Tr>
            ) : null}
          </Tbody>
        </Tabela>
      </Cartao>
    </>
  );
}
