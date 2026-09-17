import Link from "next/link";
import { ChevronLeft, ChevronRight, FileDown, Search } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { formatarDataHora } from "@/lib/datas";
import { listarAcoesAuditoria, listarAuditoria, listarUsuariosParaFiltro } from "@/lib/servicos/configuracoes";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { cn } from "@/lib/utils";
import { lerFiltrosAuditoria, montarQuery, type ParametrosAuditoria } from "./_filtros";
import { formatarDetalhesAuditoria, rotuloAcaoAuditoria, rotuloEntidadeAuditoria } from "./_rotulos";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

export default async function PaginaAuditoria({ searchParams }: { searchParams: Promise<ParametrosAuditoria> }) {
  await exigirAdmin();
  const params = await searchParams;
  const { filtros, pagina } = lerFiltrosAuditoria(params);
  const [resultado, acoes, usuarios] = await Promise.all([
    listarAuditoria(filtros, pagina, POR_PAGINA),
    listarAcoesAuditoria(),
    listarUsuariosParaFiltro(),
  ]);

  const temFiltro = Boolean(params.usuario || params.acao || params.de || params.ate);
  const inicio = resultado.total === 0 ? 0 : (resultado.pagina - 1) * POR_PAGINA + 1;
  const fim = Math.min(resultado.total, resultado.pagina * POR_PAGINA);

  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <CartaoCabecalho
          titulo="Auditoria"
          descricao="Registro de quem fez o quê no sistema: logins, trocas de PIN, cancelamentos, mudanças de preço e de configuração."
          acoes={
            <a
              href={`/configuracoes/auditoria/exportar${montarQuery(params, { pagina: undefined })}`}
              className="inline-flex h-10 items-center gap-2 rounded-padrao border border-borda bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2"
            >
              <FileDown className="size-4" aria-hidden /> Exportar CSV
            </a>
          }
        />
        <CartaoConteudo>
          <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_160px_160px_auto] xl:items-end">
            <Campo rotulo="Usuário" htmlFor="usuario">
              <Selecao id="usuario" name="usuario" defaultValue={params.usuario ?? ""}>
                <option value="">Todos</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                    {u.ativo ? "" : " (desativado)"}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Ação" htmlFor="acao">
              <Selecao id="acao" name="acao" defaultValue={params.acao ?? ""}>
                <option value="">Todas</option>
                {acoes.map((a) => (
                  <option key={a} value={a}>
                    {rotuloAcaoAuditoria(a)}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="De" htmlFor="de">
              <Entrada id="de" name="de" type="date" defaultValue={params.de ?? ""} />
            </Campo>
            <Campo rotulo="Até" htmlFor="ate">
              <Entrada id="ate" name="ate" type="date" defaultValue={params.ate ?? ""} />
            </Campo>
            <div className="flex gap-2">
              <Botao type="submit" variante="secundaria">
                <Search className="size-4" aria-hidden /> Filtrar
              </Botao>
              {temFiltro ? (
                <Link
                  href="/configuracoes/auditoria"
                  className="inline-flex h-10 items-center rounded-padrao px-3 text-sm text-texto-suave hover:bg-superficie-2 hover:text-texto"
                >
                  Limpar
                </Link>
              ) : null}
            </div>
          </form>
        </CartaoConteudo>
        <CartaoConteudo className="pt-0">
          <Tabela>
            <Thead>
              <Tr>
                <Th>Data e hora</Th>
                <Th>Usuário</Th>
                <Th>Ação</Th>
                <Th>Registro</Th>
                <Th>Detalhes</Th>
              </Tr>
            </Thead>
            <Tbody>
              {resultado.linhas.length === 0 ? (
                <LinhaVazia
                  colunas={5}
                  mensagem={temFiltro ? "Nenhum registro com esses filtros." : "Nenhum registro de auditoria ainda."}
                />
              ) : null}
              {resultado.linhas.map((l) => {
                const detalhes = formatarDetalhesAuditoria(l.detalhes);
                return (
                  <Tr key={l.id} className="align-top">
                    <Td className="whitespace-nowrap tabular">{formatarDataHora(l.criadoEm)}</Td>
                    <Td>{l.usuario ? l.usuario.nome : <span className="text-texto-fraco">Sistema</span>}</Td>
                    <Td>
                      <p className="font-medium text-texto">{rotuloAcaoAuditoria(l.acao)}</p>
                      <p className="font-mono text-[11px] text-texto-fraco">{l.acao}</p>
                    </Td>
                    <Td>
                      <Selo tom="neutro">{rotuloEntidadeAuditoria(l.entidade)}</Selo>
                      {l.entidadeId !== null ? (
                        <span className="ml-1.5 text-xs tabular text-texto-suave">#{l.entidadeId}</span>
                      ) : null}
                    </Td>
                    <Td className="max-w-md">
                      {detalhes ? (
                        <details className="group">
                          <summary className="cursor-pointer select-none text-sm text-primaria hover:underline">
                            <span className="group-open:hidden">Ver detalhes</span>
                            <span className="hidden group-open:inline">Ocultar</span>
                          </summary>
                          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-superficie-2 p-2 font-mono text-[11px] leading-snug text-texto-suave">
                            {detalhes}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-xs text-texto-fraco">Sem detalhes</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Tabela>
        </CartaoConteudo>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda px-5 py-3 text-sm text-texto-suave">
          <p className="tabular">
            {resultado.total === 0
              ? "Nenhum registro"
              : `Mostrando ${inicio} a ${fim} de ${resultado.total.toLocaleString("pt-BR")} registros`}
          </p>
          <div className="flex items-center gap-1">
            <LinkPagina
              href={`/configuracoes/auditoria${montarQuery(params, { pagina: String(resultado.pagina - 1) })}`}
              desabilitado={resultado.pagina <= 1}
              rotulo="Página anterior"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </LinkPagina>
            <span className="px-2 tabular">
              Página {resultado.pagina} de {resultado.totalPaginas}
            </span>
            <LinkPagina
              href={`/configuracoes/auditoria${montarQuery(params, { pagina: String(resultado.pagina + 1) })}`}
              desabilitado={resultado.pagina >= resultado.totalPaginas}
              rotulo="Próxima página"
            >
              <ChevronRight className="size-4" aria-hidden />
            </LinkPagina>
          </div>
        </div>
      </Cartao>
    </div>
  );
}

function LinkPagina({
  href,
  desabilitado,
  rotulo,
  children,
}: {
  href: string;
  desabilitado: boolean;
  rotulo: string;
  children: React.ReactNode;
}) {
  const classe = cn(
    "inline-flex size-9 items-center justify-center rounded-padrao border border-borda",
    desabilitado ? "pointer-events-none opacity-40" : "hover:bg-superficie-2",
  );
  if (desabilitado) {
    return (
      <span className={classe} aria-disabled="true" aria-label={rotulo}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={classe} aria-label={rotulo}>
      {children}
    </Link>
  );
}
