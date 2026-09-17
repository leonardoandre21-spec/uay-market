import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, History } from "lucide-react";
import type { TipoMovimentoEstoque } from "@prisma/client";
import { exigirSessao } from "@/lib/auth";
import { formatarDataHora } from "@/lib/datas";
import { formatarQuantidade, formatarQuantidadeComUnidade, formatarReais } from "@/lib/dinheiro";
import { ROTULO_MOTIVO_PERDA, ROTULO_MOVIMENTO_ESTOQUE } from "@/lib/rotulos";
import { MOVIMENTOS_POR_PAGINA, obterExtratoProduto } from "@/lib/servicos/estoque";
import { Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio, GradeIndicadores } from "@/components/ui/pagina";
import { Selo, type TomSelo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { cn } from "@/lib/utils";
import { LinkBotao } from "../../_componentes/link-botao";

export const dynamic = "force-dynamic";

const TOM_TIPO: Record<TipoMovimentoEstoque, TomSelo> = {
  ENTRADA: "sucesso",
  VENDA: "info",
  PERDA: "perigo",
  AJUSTE: "alerta",
  CANCELAMENTO_VENDA: "neutro",
};

export default async function PaginaExtratoProduto({
  params,
  searchParams,
}: {
  params: Promise<{ produtoId: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const [sessao, { produtoId }, { pagina }] = await Promise.all([exigirSessao(), params, searchParams]);
  const admin = sessao.papel === "ADMIN";
  const id = Number(produtoId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const extrato = await obterExtratoProduto(id, Number(pagina) || 1);
  if (!extrato) notFound();
  const { produto, movimentos } = extrato;
  const un = produto.unidade;

  return (
    <div>
      <Link href="/estoque" className="mb-3 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto">
        <ArrowLeft className="size-4" aria-hidden /> Voltar pro estoque
      </Link>
      <CabecalhoPagina
        titulo={produto.nome}
        descricao={
          <>
            Extrato de movimentações
            {produto.codigoBarras || produto.codigoInterno ? ` · Código ${produto.codigoBarras ?? produto.codigoInterno}` : ""}
            {produto.categoria ? ` · ${produto.categoria.nome}` : ""}
            {!produto.ativo ? " · Produto inativo" : ""}
          </>
        }
        acoes={
          <LinkBotao href={`/produtos/${produto.id}`} variante="contorno">
            Abrir cadastro
          </LinkBotao>
        }
      />

      <GradeIndicadores className="mb-6">
        <Indicador
          rotulo="Estoque atual"
          valor={formatarQuantidadeComUnidade(produto.estoque, un)}
          tom={produto.estoque < 0 ? "perigo" : produto.estoque === 0 ? "alerta" : "neutro"}
          detalhe={produto.estoqueMinimo > 0 ? `Mínimo: ${formatarQuantidade(produto.estoqueMinimo, un)}` : "Sem mínimo definido"}
        />
        <Indicador rotulo="Custo médio atual" valor={formatarReais(produto.precoCusto)} detalhe={`Preço de venda ${formatarReais(produto.precoVenda)}`} />
        <Indicador rotulo="Total que entrou" valor={formatarQuantidadeComUnidade(extrato.somaEntradas, un)} tom="sucesso" detalhe="Entradas, ajustes positivos e cancelamentos" />
        <Indicador rotulo="Total que saiu" valor={formatarQuantidadeComUnidade(Math.abs(extrato.somaSaidas), un)} tom="perigo" detalhe="Vendas, perdas e ajustes negativos" />
      </GradeIndicadores>

      {movimentos.length === 0 ? (
        <EstadoVazio
          icone={<History />}
          titulo="Nenhuma movimentação"
          descricao="Este produto ainda não teve entrada, venda, perda nem ajuste registrado."
        />
      ) : (
        <>
          <Tabela>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Tipo</Th>
                <Th numerico>Quantidade</Th>
                <Th numerico>Saldo após</Th>
                <Th numerico>Custo unit.</Th>
                <Th>Referência</Th>
                <Th>Usuário</Th>
              </Tr>
            </Thead>
            <Tbody>
              {movimentos.map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap text-texto-suave">{formatarDataHora(m.criadoEm)}</Td>
                  <Td>
                    <Selo tom={TOM_TIPO[m.tipo]}>{ROTULO_MOVIMENTO_ESTOQUE[m.tipo]}</Selo>
                  </Td>
                  <Td numerico className={cn("font-medium", m.quantidade > 0 ? "text-sucesso" : "text-perigo")}>
                    {m.quantidade > 0 ? "+" : "-"}
                    {formatarQuantidade(Math.abs(m.quantidade), un)}
                  </Td>
                  <Td numerico className={cn(m.estoqueApos < 0 && "text-perigo")}>{formatarQuantidade(m.estoqueApos, un)}</Td>
                  <Td numerico className="text-texto-suave">{m.custoUnitario !== null ? formatarReais(m.custoUnitario) : "–"}</Td>
                  <Td>
                    <Referencia movimento={m} admin={admin} />
                  </Td>
                  <Td className="text-texto-suave">{m.usuario?.nome ?? <span className="text-texto-fraco">Sistema</span>}</Td>
                </Tr>
              ))}
            </Tbody>
          </Tabela>

          <div className="mt-3 flex flex-col gap-2 text-sm text-texto-suave sm:flex-row sm:items-center sm:justify-between">
            <p>
              {extrato.total} movimentação(ões) · página {extrato.pagina} de {extrato.totalPaginas}
              {extrato.total > MOVIMENTOS_POR_PAGINA ? ` · ${MOVIMENTOS_POR_PAGINA} por página` : ""}
            </p>
            {extrato.totalPaginas > 1 ? (
              <div className="flex gap-2">
                {extrato.pagina > 1 ? (
                  <LinkBotao href={`/estoque/movimentos/${produto.id}?pagina=${extrato.pagina - 1}`} variante="contorno" tamanho="sm">
                    <ChevronLeft className="size-4" aria-hidden /> Mais recentes
                  </LinkBotao>
                ) : null}
                {extrato.pagina < extrato.totalPaginas ? (
                  <LinkBotao href={`/estoque/movimentos/${produto.id}?pagina=${extrato.pagina + 1}`} variante="contorno" tamanho="sm">
                    Mais antigas <ChevronRight className="size-4" aria-hidden />
                  </LinkBotao>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

type Movimento = NonNullable<Awaited<ReturnType<typeof obterExtratoProduto>>>["movimentos"][number];

function Referencia({ movimento: m, admin }: { movimento: Movimento; admin: boolean }) {
  const classeLink = "font-medium text-primaria hover:underline";
  const motivo = m.motivo ? <p className="text-xs text-texto-fraco">{m.motivo}</p> : null;

  if (m.venda) {
    return (
      <div>
        <Link href={`/vendas/${m.venda.id}`} className={classeLink}>
          {m.tipo === "CANCELAMENTO_VENDA" ? "Cancelamento da venda" : "Venda"} nº {m.venda.numero}
        </Link>
        {motivo}
      </div>
    );
  }
  if (m.entrada) {
    const texto = `${m.tipo === "AJUSTE" ? "Estorno da entrada" : "Entrada"} nº ${m.entrada.id}${m.entrada.numeroNota ? ` (nota ${m.entrada.numeroNota})` : ""}`;
    return (
      <div>
        {admin ? (
          <Link href={`/estoque/entradas/${m.entrada.id}`} className={classeLink}>
            {texto}
          </Link>
        ) : (
          <p className="font-medium text-texto">{texto}</p>
        )}
        {m.entrada.fornecedor ? <p className="text-xs text-texto-fraco">{m.entrada.fornecedor.nome}</p> : motivo}
      </div>
    );
  }
  if (m.perda) {
    return (
      <div>
        <Link href="/estoque/perdas" className={classeLink}>
          Perda nº {m.perda.id}: {ROTULO_MOTIVO_PERDA[m.perda.motivo]}
        </Link>
        {motivo}
      </div>
    );
  }
  return <p className="text-sm text-texto">{m.motivo ?? <span className="text-texto-fraco">Sem referência</span>}</p>;
}
