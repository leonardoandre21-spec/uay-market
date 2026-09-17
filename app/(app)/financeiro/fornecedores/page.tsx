import Link from "next/link";
import { Download, Truck } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { formatarReais, somar } from "@/lib/dinheiro";
import { formatarCnpj, formatarTelefone } from "@/lib/utils";
import { listarFornecedores } from "@/lib/servicos/fornecedores";
import { Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio, GradeIndicadores } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { LinkBotao } from "../_componentes/link-botao";
import { parametro, type ParametrosBusca } from "../_componentes/mes-url";
import type { FornecedorLinha } from "../_componentes/tipos";
import { AcoesFornecedor } from "./_componentes/acoes-fornecedor";
import { BotaoNovoFornecedor } from "./_componentes/botao-novo-fornecedor";
import { BuscaFornecedores } from "./_componentes/busca-fornecedores";

export const dynamic = "force-dynamic";

export default async function PaginaFornecedores({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirAdmin();
  const sp = await searchParams;
  const busca = parametro(sp, "busca") ?? "";
  const incluirInativos = parametro(sp, "inativos") === "1";
  const fornecedores = await listarFornecedores({ busca, incluirInativos });

  const ativos = fornecedores.filter((f) => f.ativo).length;
  const comPendencia = fornecedores.filter((f) => f.pendentes.quantidade > 0);
  const totalPendente = somar(comPendencia.map((f) => f.pendentes.total));

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Fornecedores"
        descricao="Quem vende pro mercado. Cada ficha mostra as compras (entradas de estoque) e os boletos."
        acoes={
          <>
            <LinkBotao href="/financeiro/fornecedores/exportar" variante="contorno" nativo title="Baixar a lista completa em CSV (abre no Excel)">
              <Download className="size-4" aria-hidden />
              Exportar CSV
            </LinkBotao>
            <BotaoNovoFornecedor />
          </>
        }
      />

      <GradeIndicadores>
        <Indicador rotulo="Fornecedores ativos" valor={ativos} detalhe={incluirInativos ? `${fornecedores.length - ativos} inativos na lista` : "Inativos ficam escondidos"} icone={<Truck className="size-4" aria-hidden />} />
        <Indicador
          rotulo="Com boletos pendentes"
          valor={comPendencia.length}
          tom={comPendencia.length > 0 ? "alerta" : "neutro"}
          detalhe={comPendencia.length > 0 ? `${formatarReais(totalPendente)} em aberto` : "Nenhum boleto em aberto"}
        />
      </GradeIndicadores>

      <BuscaFornecedores busca={busca} incluirInativos={incluirInativos} />

      {fornecedores.length === 0 && !busca ? (
        <EstadoVazio
          icone={<Truck aria-hidden />}
          titulo="Nenhum fornecedor cadastrado"
          descricao="Cadastre quem vende pro mercado pra vincular entradas de estoque e boletos."
          acao={<BotaoNovoFornecedor />}
        />
      ) : (
        <Tabela>
          <Thead>
            <Tr>
              <Th>Fornecedor</Th>
              <Th>CNPJ</Th>
              <Th>Contato</Th>
              <Th numerico>Entradas</Th>
              <Th numerico>Boletos pendentes</Th>
              <Th>Situação</Th>
              <Th className="text-right">Ações</Th>
            </Tr>
          </Thead>
          <Tbody>
            {fornecedores.length === 0 ? (
              <LinhaVazia colunas={7} mensagem={`Nenhum fornecedor encontrado pra "${busca}".`} />
            ) : (
              fornecedores.map((f) => {
                const linha: FornecedorLinha = {
                  id: f.id,
                  nome: f.nome,
                  cnpj: f.cnpj,
                  telefone: f.telefone,
                  email: f.email,
                  contato: f.contato,
                  observacao: f.observacao,
                  ativo: f.ativo,
                };
                const vinculos = f._count.entradas + f._count.contas + f._count.despesas;
                return (
                  <Tr key={f.id} className={!f.ativo ? "opacity-60" : undefined}>
                    <Td>
                      <Link href={`/financeiro/fornecedores/${f.id}`} className="font-medium text-texto hover:text-primaria hover:underline">
                        {f.nome}
                      </Link>
                      {f.email ? <span className="block truncate text-xs text-texto-fraco">{f.email}</span> : null}
                    </Td>
                    <Td className="whitespace-nowrap tabular">{f.cnpj ? formatarCnpj(f.cnpj) : <span className="text-texto-fraco">-</span>}</Td>
                    <Td>
                      {f.contato || f.telefone ? (
                        <span className="flex flex-col">
                          {f.contato ? <span>{f.contato}</span> : null}
                          {f.telefone ? <span className="text-xs text-texto-suave tabular">{formatarTelefone(f.telefone)}</span> : null}
                        </span>
                      ) : (
                        <span className="text-texto-fraco">-</span>
                      )}
                    </Td>
                    <Td numerico>{f._count.entradas}</Td>
                    <Td numerico>
                      {f.pendentes.quantidade > 0 ? (
                        <span className="flex flex-col items-end">
                          <span className="font-medium text-alerta">{formatarReais(f.pendentes.total)}</span>
                          <span className="text-xs text-texto-fraco">
                            {f.pendentes.quantidade} {f.pendentes.quantidade === 1 ? "boleto" : "boletos"}
                          </span>
                        </span>
                      ) : (
                        <span className="text-texto-fraco">-</span>
                      )}
                    </Td>
                    <Td>{f.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo tom="neutro">Inativo</Selo>}</Td>
                    <Td className="text-right">
                      <AcoesFornecedor fornecedor={linha} vinculos={vinculos} />
                    </Td>
                  </Tr>
                );
              })
            )}
          </Tbody>
        </Tabela>
      )}
    </div>
  );
}
