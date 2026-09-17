"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { Entrada } from "@/components/ui/campo";
import { FormularioAcao } from "@/components/ui/formulario-acao";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { formatarReais } from "@/lib/dinheiro";
import { DialogoConfirmacao } from "../../../_componentes/dialogo-confirmacao";
import { useAcao } from "../../../_componentes/use-acao";
import { criarCategoriaAcao, excluirCategoriaAcao, renomearCategoriaAcao } from "../../actions";

export type CategoriaLinha = {
  id: number;
  nome: string;
  despesas: number;
  contas: number;
  totalMes: number;
};

export function GerenciarCategorias({ categorias, rotuloMes }: { categorias: CategoriaLinha[]; rotuloMes: string }) {
  const router = useRouter();
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [excluindo, setExcluindo] = useState<CategoriaLinha | null>(null);
  const { pendente, rodar } = useAcao();

  return (
    <div className="flex flex-col gap-4">
      <FormularioAcao
        acao={criarCategoriaAcao}
        mensagemSucesso="Categoria criada."
        limparAoSucesso
        aoSucesso={() => router.refresh()}
        className="flex flex-col gap-2 sm:flex-row sm:items-start"
      >
        <div className="flex-1">
          <Entrada name="nome" placeholder="Nova categoria (ex.: Energia, Aluguel, Embalagens)" required minLength={2} maxLength={60} aria-label="Nome da nova categoria" />
        </div>
        <BotaoEnviar>
          <Plus className="size-4" aria-hidden />
          Adicionar
        </BotaoEnviar>
      </FormularioAcao>

      <Tabela>
        <Thead>
          <Tr>
            <Th>Categoria</Th>
            <Th numerico>Despesas</Th>
            <Th numerico>Boletos</Th>
            <Th numerico>Gasto em {rotuloMes}</Th>
            <Th className="w-28 text-right">Ações</Th>
          </Tr>
        </Thead>
        <Tbody>
          {categorias.length === 0 ? (
            <LinhaVazia colunas={5} mensagem="Nenhuma categoria cadastrada. Crie a primeira acima." />
          ) : (
            categorias.map((c) => {
              const emUso = c.despesas + c.contas > 0;
              const editando = editandoId === c.id;
              return (
                <Tr key={c.id}>
                  <Td>
                    {editando ? (
                      <FormularioAcao
                        acao={renomearCategoriaAcao}
                        mensagemSucesso="Categoria renomeada."
                        aoSucesso={() => {
                          setEditandoId(null);
                          router.refresh();
                        }}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="id" value={c.id} />
                        <Entrada name="nome" defaultValue={c.nome} required minLength={2} maxLength={60} autoFocus className="h-9 max-w-xs" aria-label="Novo nome" />
                        <BotaoEnviar tamanho="sm" variante="primaria" aria-label="Salvar nome" title="Salvar">
                          <Check className="size-4" aria-hidden />
                        </BotaoEnviar>
                        <Botao type="button" tamanho="sm" variante="fantasma" onClick={() => setEditandoId(null)} aria-label="Cancelar edição" title="Cancelar">
                          <X className="size-4" aria-hidden />
                        </Botao>
                      </FormularioAcao>
                    ) : (
                      <span className="font-medium text-texto">{c.nome}</span>
                    )}
                  </Td>
                  <Td numerico>{c.despesas}</Td>
                  <Td numerico>{c.contas}</Td>
                  <Td numerico>{c.totalMes > 0 ? formatarReais(c.totalMes) : <span className="text-texto-fraco">-</span>}</Td>
                  <Td className="text-right">
                    {!editando ? (
                      <div className="flex items-center justify-end gap-1">
                        <Botao variante="fantasma" tamanho="sm" onClick={() => setEditandoId(c.id)} aria-label={`Renomear ${c.nome}`} title="Renomear">
                          <Pencil className="size-4" aria-hidden />
                        </Botao>
                        <Botao
                          variante="fantasma"
                          tamanho="sm"
                          onClick={() => setExcluindo(c)}
                          disabled={emUso}
                          aria-label={`Excluir ${c.nome}`}
                          title={emUso ? "Em uso: mude a categoria dos lançamentos antes de excluir." : "Excluir"}
                        >
                          <Trash2 className="size-4 text-perigo" aria-hidden />
                        </Botao>
                      </div>
                    ) : null}
                  </Td>
                </Tr>
              );
            })
          )}
        </Tbody>
      </Tabela>

      <DialogoConfirmacao
        aberto={excluindo !== null}
        aoFechar={() => setExcluindo(null)}
        titulo="Excluir categoria?"
        rotuloConfirmar="Excluir"
        pendente={pendente}
        aoConfirmar={() => {
          if (!excluindo) return;
          rodar(() => excluirCategoriaAcao(excluindo.id), {
            mensagemSucesso: "Categoria excluída.",
            aoSucesso: () => setExcluindo(null),
          });
        }}
      >
        <p>
          A categoria <span className="font-medium text-texto">{excluindo?.nome}</span> será removida. Ela não está em uso em nenhum lançamento.
        </p>
      </DialogoConfirmacao>
    </div>
  );
}
