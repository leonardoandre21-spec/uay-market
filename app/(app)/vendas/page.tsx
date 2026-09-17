import Link from "next/link";
import type { FormaPagamento, StatusVenda } from "@prisma/client";
import { ChevronLeft, ChevronRight, Receipt, ScanBarcode } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { listarUsuariosAtivos } from "@/lib/consultas";
import { formatarDataHora, limitesDoDia, paraDataInput, parseDataInput, subDays } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO, ROTULO_FORMA_PAGAMENTO, ROTULO_FORMA_PAGAMENTO_CURTO, ROTULO_STATUS_VENDA } from "@/lib/rotulos";
import { listarMaquininhas } from "@/lib/servicos/maquininhas";
import { listarVendas, type FiltrosVendas } from "@/lib/servicos/vendas";
import { contarProdutosDistintos } from "@/lib/servicos/vendas-calculos";
import { BotaoLink } from "@/app/(app)/produtos/_componentes/botao-link";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, GradeIndicadores } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vendas" };

type Params = {
  de?: string;
  ate?: string;
  forma?: string;
  status?: string;
  usuarioId?: string;
  cliente?: string;
  numero?: string;
  /** id da maquininha em que algum pagamento passou */
  maquininha?: string;
  pagina?: string;
};

const STATUS_VALIDOS: StatusVenda[] = ["CONCLUIDA", "CANCELADA"];

export default async function PaginaVendas({ searchParams }: { searchParams: Promise<Params> }) {
  const [sessao, params] = await Promise.all([exigirSessao(), searchParams]);
  const ehAdmin = sessao.papel === "ADMIN";

  // Sem nenhum filtro, mostra o dia de hoje.
  const semFiltro =
    !params.de && !params.ate && !params.forma && !params.status && !params.usuarioId && !params.cliente && !params.numero && !params.maquininha;
  const hoje = limitesDoDia();
  const de = semFiltro ? hoje.inicio : parseDataInput(params.de);
  const ateDia = semFiltro ? hoje.fim : parseDataInput(params.ate);
  const ate = ateDia ? limitesDoDia(ateDia).fim : null;

  const forma = FORMAS_PAGAMENTO.includes(params.forma as FormaPagamento) ? (params.forma as FormaPagamento) : null;
  const status = STATUS_VALIDOS.includes(params.status as StatusVenda) ? (params.status as StatusVenda) : null;
  const usuarioId = params.usuarioId && /^\d+$/.test(params.usuarioId) ? Number(params.usuarioId) : null;
  const numero = params.numero && /^\d+$/.test(params.numero) ? Number(params.numero) : null;
  const maquininhaId = params.maquininha && /^\d+$/.test(params.maquininha) ? Number(params.maquininha) : null;
  const pagina = params.pagina && /^\d+$/.test(params.pagina) ? Number(params.pagina) : 1;

  const filtros: FiltrosVendas = { de, ate, forma, status, usuarioId, cliente: params.cliente ?? null, numero, maquininhaId };
  const [{ vendas, totais, totalPaginas, totalRegistros }, usuarios, maquininhas] = await Promise.all([
    listarVendas(filtros, pagina),
    listarUsuariosAtivos(),
    listarMaquininhas(),
  ]);

  const query = new URLSearchParams();
  if (de) query.set("de", paraDataInput(de));
  if (ateDia) query.set("ate", paraDataInput(ateDia));
  if (forma) query.set("forma", forma);
  if (status) query.set("status", status);
  if (usuarioId) query.set("usuarioId", String(usuarioId));
  if (params.cliente) query.set("cliente", params.cliente);
  if (numero) query.set("numero", String(numero));
  if (maquininhaId) query.set("maquininha", String(maquininhaId));
  const linkPagina = (p: number) => {
    const q = new URLSearchParams(query);
    q.set("pagina", String(p));
    return `/vendas?${q.toString()}`;
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Vendas"
        descricao="Histórico de cupons do caixa. Clique numa venda pra ver os itens, imprimir o cupom ou cancelar."
        acoes={
          <BotaoLink href="/pdv" variante="contorno">
            <ScanBarcode className="size-4" aria-hidden />
            Ir pro caixa
          </BotaoLink>
        }
      />

      <Cartao className="mb-6">
        <CartaoConteudo>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <Campo rotulo="De" htmlFor="de">
              <Entrada id="de" name="de" type="date" defaultValue={de ? paraDataInput(de) : ""} />
            </Campo>
            <Campo rotulo="Até" htmlFor="ate">
              <Entrada id="ate" name="ate" type="date" defaultValue={ateDia ? paraDataInput(ateDia) : ""} />
            </Campo>
            <Campo rotulo="Forma de pagamento" htmlFor="forma">
              <Selecao id="forma" name="forma" defaultValue={forma ?? ""}>
                <option value="">Todas</option>
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_FORMA_PAGAMENTO[f]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Situação" htmlFor="status">
              <Selecao id="status" name="status" defaultValue={status ?? ""}>
                <option value="">Todas</option>
                {STATUS_VALIDOS.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_VENDA[s]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Operador" htmlFor="usuarioId">
              <Selecao id="usuarioId" name="usuarioId" defaultValue={usuarioId ? String(usuarioId) : ""}>
                <option value="">Todos</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Cliente" htmlFor="cliente">
              <Entrada id="cliente" name="cliente" placeholder="Nome" defaultValue={params.cliente ?? ""} />
            </Campo>
            <Campo rotulo="Nº do cupom" htmlFor="numero">
              <Entrada id="numero" name="numero" inputMode="numeric" placeholder="Ex.: 1024" defaultValue={numero ?? ""} />
            </Campo>
            {maquininhas.length > 0 ? (
              <Campo rotulo="Maquininha" htmlFor="maquininha">
                <Selecao id="maquininha" name="maquininha" defaultValue={maquininhaId ? String(maquininhaId) : ""}>
                  <option value="">Todas</option>
                  {maquininhas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                      {m.ativo ? "" : " (desativada)"}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            ) : null}
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-8">
              <Botao type="submit">Filtrar</Botao>
              <BotaoLink href="/vendas" variante="fantasma">
                Hoje
              </BotaoLink>
              <BotaoLink
                href={`/vendas?de=${paraDataInput(subDays(hoje.inicio, 29))}&ate=${paraDataInput(hoje.fim)}`}
                variante="fantasma"
              >
                Últimos 30 dias
              </BotaoLink>
            </div>
          </form>
        </CartaoConteudo>
      </Cartao>

      <GradeIndicadores className={ehAdmin ? "mb-6 xl:grid-cols-5" : "mb-6 xl:grid-cols-3"}>
        <Indicador
          rotulo="Vendas concluídas"
          valor={totais.quantidade}
          detalhe={totais.canceladas > 0 ? `${totais.canceladas} cancelada${totais.canceladas > 1 ? "s" : ""} no período` : "Nenhuma cancelada"}
          icone={<Receipt className="size-4" aria-hidden />}
        />
        <Indicador rotulo="Receita" valor={formatarReais(totais.receita)} tom="primaria" detalhe="Total das vendas concluídas" />
        <Indicador rotulo="Taxas de cartão e Pix" valor={formatarReais(totais.taxas)} tom={totais.taxas > 0 ? "alerta" : "neutro"} detalhe="Descontadas pelas operadoras" />
        {ehAdmin ? (
          <>
            <Indicador rotulo="Custo da mercadoria (CMV)" valor={formatarReais(totais.cmv)} detalhe="Custo médio no momento da venda" />
            <Indicador
              rotulo="Lucro bruto"
              valor={formatarReais(totais.lucroBruto)}
              tom={totais.lucroBruto >= 0 ? "sucesso" : "perigo"}
              detalhe={
                totais.receita > 0
                  ? `${((totais.lucroBruto / totais.receita) * 100).toFixed(1).replace(".", ",")}% da receita`
                  : "Receita menos custo e taxas"
              }
            />
          </>
        ) : null}
      </GradeIndicadores>

      <Tabela>
        <Thead>
          <tr>
            <Th>Nº</Th>
            <Th>Data e hora</Th>
            <Th>Operador</Th>
            <Th>Cliente</Th>
            <Th numerico>Itens</Th>
            <Th>Formas</Th>
            <Th numerico>Total</Th>
            <Th>Situação</Th>
          </tr>
        </Thead>
        <Tbody>
          {vendas.length === 0 ? (
            <LinhaVazia colunas={8} mensagem="Nenhuma venda nesse filtro." />
          ) : (
            vendas.map((v) => (
              <Tr key={v.id} className={v.status === "CANCELADA" ? "text-texto-fraco" : undefined}>
                <Td>
                  <Link href={`/vendas/${v.id}`} className="font-semibold tabular text-primaria hover:underline">
                    {v.numero}
                  </Link>
                </Td>
                <Td className="tabular">{formatarDataHora(v.criadoEm)}</Td>
                <Td>{v.usuario.nome}</Td>
                <Td>{v.cliente?.nome ?? <span className="text-texto-fraco">-</span>}</Td>
                <Td numerico>{contarProdutosDistintos(v.itens)}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {resumirFormas(v.pagamentos).map((f) => (
                      <Selo key={f} tom="neutro">
                        {f}
                      </Selo>
                    ))}
                  </span>
                </Td>
                <Td numerico className={v.status === "CANCELADA" ? "line-through" : "font-semibold"}>
                  {formatarReais(v.total)}
                </Td>
                <Td>
                  <Selo tom={v.status === "CONCLUIDA" ? "sucesso" : "perigo"}>{ROTULO_STATUS_VENDA[v.status]}</Selo>
                </Td>
              </Tr>
            ))
          )}
        </Tbody>
      </Tabela>

      {totalPaginas > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-texto-suave">
          <span>
            {totalRegistros} venda{totalRegistros === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 ? (
              <BotaoLink href={linkPagina(pagina - 1)} variante="contorno" tamanho="sm">
                <ChevronLeft className="size-4" aria-hidden /> Anterior
              </BotaoLink>
            ) : null}
            {pagina < totalPaginas ? (
              <BotaoLink href={linkPagina(pagina + 1)} variante="contorno" tamanho="sm">
                Próxima <ChevronRight className="size-4" aria-hidden />
              </BotaoLink>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** "Dinheiro", "Pix + Crédito"... sem repetir forma. */
function resumirFormas(pagamentos: { forma: FormaPagamento }[]): string[] {
  const vistas = new Set<FormaPagamento>();
  const lista: string[] = [];
  for (const p of pagamentos) {
    if (vistas.has(p.forma)) continue;
    vistas.add(p.forma);
    lista.push(ROTULO_FORMA_PAGAMENTO_CURTO[p.forma]);
  }
  return lista.length ? lista : ["sem pagamento"];
}
