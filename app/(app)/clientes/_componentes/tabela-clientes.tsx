import Link from "next/link";
import { Cake, HandCoins } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import type { ClienteResumo } from "@/lib/servicos/clientes";

const COLUNAS = 8;

export function TabelaClientes({ clientes, mensagemVazia }: { clientes: ClienteResumo[]; mensagemVazia: string }) {
  return (
    <Tabela>
      <Thead>
        <Tr>
          <Th>Nome</Th>
          <Th>Telefone</Th>
          <Th>CPF</Th>
          <Th numerico>Limite fiado</Th>
          <Th numerico>Saldo devedor</Th>
          <Th>Última compra</Th>
          <Th>Situação</Th>
          <Th className="w-px" aria-label="Ações" />
        </Tr>
      </Thead>
      <Tbody>
        {clientes.length === 0 ? (
          <LinhaVazia colunas={COLUNAS} mensagem={mensagemVazia} />
        ) : (
          clientes.map((c) => {
            const acimaDoLimite = c.saldo > 0 && c.saldo > c.limiteFiado;
            return (
              <Tr key={c.id} className={cn(!c.ativo && "opacity-70")}>
                <Td>
                  <Link href={`/clientes/${c.id}`} className="group flex items-center gap-2 font-medium text-texto hover:text-primaria">
                    <span className="truncate group-hover:underline">{c.nome}</span>
                    {c.aniversarianteDoMes ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-acento-suave px-1.5 py-0.5 text-[11px] font-medium text-acento"
                        title={`Aniversário dia ${c.diaAniversario}`}
                      >
                        <Cake className="size-3" aria-hidden />
                        dia {c.diaAniversario}
                      </span>
                    ) : null}
                  </Link>
                </Td>
                <Td className="tabular text-texto-suave">{c.telefoneFormatado || <span className="text-texto-fraco">sem telefone</span>}</Td>
                <Td className="tabular text-texto-suave">{c.cpfFormatado || <span className="text-texto-fraco">sem CPF</span>}</Td>
                <Td numerico className={cn(c.limiteFiado === 0 && "text-texto-fraco")}>
                  {c.limiteFiado === 0 ? "Não compra fiado" : formatarReais(c.limiteFiado)}
                </Td>
                <Td numerico>
                  {c.saldo > 0 ? (
                    <span
                      className={cn(
                        "font-semibold text-perigo",
                        acimaDoLimite && "rounded-md bg-perigo-suave px-1.5 py-0.5",
                      )}
                      title={acimaDoLimite ? "Saldo acima do limite de fiado" : undefined}
                    >
                      {formatarReais(c.saldo)}
                    </span>
                  ) : c.saldo < 0 ? (
                    <span className="font-medium text-info" title="Crédito do cliente: a loja deve esse valor a ele">
                      crédito {formatarReais(-c.saldo)}
                    </span>
                  ) : (
                    <span className="text-texto-fraco">{formatarReais(0)}</span>
                  )}
                </Td>
                <Td className="text-texto-suave">
                  {c.ultimaCompraFormatada || <span className="text-texto-fraco">nunca comprou</span>}
                </Td>
                <Td>
                  <Selo tom={c.situacao.tom}>{c.situacao.rotulo}</Selo>
                </Td>
                <Td>
                  {c.saldo > 0 ? (
                    <Link
                      href={`/clientes/${c.id}?acao=receber`}
                      className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-padrao border border-borda bg-superficie px-2.5 text-xs font-medium text-texto hover:bg-superficie-2"
                    >
                      <HandCoins className="size-3.5" aria-hidden />
                      Receber
                    </Link>
                  ) : null}
                </Td>
              </Tr>
            );
          })
        )}
      </Tbody>
    </Tabela>
  );
}
