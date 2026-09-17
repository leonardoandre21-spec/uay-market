"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { CaixaSelecao, Campo, Entrada } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { EstadoVazio } from "@/components/ui/pagina";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { useToast } from "@/components/ui/toast";
import { excluirCategoria, salvarCategoria } from "../actions";

export type CategoriaDaLista = {
  id: number;
  nome: string;
  cor: string | null;
  ordem: number;
  produtos: number;
};

const COR_PADRAO = "#1f7a4d";

function FormularioCategoria({ categoria, aoSalvar }: { categoria: CategoriaDaLista | null; aoSalvar: () => void }) {
  const [usarCor, setUsarCor] = useState(categoria?.cor !== null && categoria?.cor !== undefined);
  const [cor, setCor] = useState(categoria?.cor ?? COR_PADRAO);

  return (
    <FormularioAcao
      acao={salvarCategoria}
      mensagemSucesso={categoria ? "Categoria salva." : "Categoria criada."}
      aoSucesso={aoSalvar}
      className="flex flex-col gap-4"
    >
      {(estado, pendente) => (
        <>
          {categoria ? <input type="hidden" name="id" value={categoria.id} /> : null}
          <Campo rotulo="Nome" htmlFor="nome-categoria" obrigatorio erro={erroCampo(estado, "nome")}>
            <Entrada
              id="nome-categoria"
              name="nome"
              required
              maxLength={60}
              defaultValue={categoria?.nome ?? ""}
              placeholder="Bebidas"
              autoFocus
            />
          </Campo>
          <Campo
            rotulo="Ordem"
            htmlFor="ordem-categoria"
            erro={erroCampo(estado, "ordem")}
            ajuda="Número menor aparece primeiro nas listas e no caixa."
          >
            <Entrada
              id="ordem-categoria"
              name="ordem"
              type="number"
              min={0}
              max={9999}
              step={1}
              defaultValue={categoria?.ordem ?? 0}
              className="w-32 tabular"
            />
          </Campo>
          <Campo rotulo="Cor" erro={erroCampo(estado, "cor")} ajuda="Opcional. Ajuda a achar a categoria de relance.">
            <div className="flex flex-wrap items-center gap-3">
              <CaixaSelecao rotulo="Destacar com uma cor" checked={usarCor} onChange={(e) => setUsarCor(e.target.checked)} />
              <label className="inline-flex items-center gap-2 text-sm text-texto-suave">
                <input
                  type="color"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  disabled={!usarCor}
                  aria-label="Escolher cor"
                  className="size-9 cursor-pointer rounded-md border border-borda bg-superficie p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                />
                <span className="font-mono text-xs">{usarCor ? cor : "sem cor"}</span>
              </label>
              <input type="hidden" name="cor" value={usarCor ? cor : ""} />
            </div>
          </Campo>
          <div className="flex justify-end gap-2 pt-2">
            <BotaoEnviar pendente={pendente}>{categoria ? "Salvar" : "Criar categoria"}</BotaoEnviar>
          </div>
        </>
      )}
    </FormularioAcao>
  );
}

export function GerenciadorCategorias({ categorias, admin }: { categorias: CategoriaDaLista[]; admin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editando, setEditando] = useState<CategoriaDaLista | null | "nova">(null);
  const [excluindo, setExcluindo] = useState<CategoriaDaLista | null>(null);
  const [pendente, iniciar] = useTransition();

  function fecharFormulario() {
    setEditando(null);
    router.refresh();
  }

  function confirmarExclusao() {
    if (!excluindo) return;
    const alvo = excluindo;
    iniciar(async () => {
      const r = await excluirCategoria(alvo.id);
      if (r.ok) {
        toast.sucesso(`Categoria "${alvo.nome}" excluída.`);
        setExcluindo(null);
        router.refresh();
      } else {
        toast.erro(r.erro);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Botao type="button" onClick={() => setEditando("nova")}>
          <Plus className="size-4" aria-hidden />
          Nova categoria
        </Botao>
      </div>

      {categorias.length === 0 ? (
        <EstadoVazio
          icone={<Tags />}
          titulo="Nenhuma categoria ainda"
          descricao="Categorias organizam a lista de produtos e os relatórios de venda por seção."
          acao={
            <Botao type="button" onClick={() => setEditando("nova")}>
              <Plus className="size-4" aria-hidden />
              Criar a primeira
            </Botao>
          }
        />
      ) : (
        <Tabela>
          <Thead>
            <tr>
              <Th className="w-16">Ordem</Th>
              <Th>Categoria</Th>
              <Th numerico>Produtos</Th>
              <Th className="w-32 text-right">Ações</Th>
            </tr>
          </Thead>
          <Tbody>
            {categorias.length === 0 ? (
              <LinhaVazia colunas={4} />
            ) : (
              categorias.map((c) => {
                const bloqueada = c.produtos > 0;
                return (
                  <Tr key={c.id}>
                    <Td className="tabular text-texto-suave">{c.ordem}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-2 font-medium text-texto">
                        <span
                          className="size-3 shrink-0 rounded-full border border-borda"
                          style={{ backgroundColor: c.cor ?? "transparent" }}
                          aria-hidden
                        />
                        {c.nome}
                      </span>
                    </Td>
                    <Td numerico>
                      {c.produtos > 0 ? (
                        <Link href={`/produtos?categoria=${c.id}&situacao=todos`} className="text-primaria hover:underline">
                          {c.produtos}
                        </Link>
                      ) : (
                        <span className="text-texto-fraco">0</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Botao
                          type="button"
                          variante="fantasma"
                          tamanho="sm"
                          className="px-2"
                          onClick={() => setEditando(c)}
                          title={`Editar ${c.nome}`}
                          aria-label={`Editar ${c.nome}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Botao>
                        {admin ? (
                          <Botao
                            type="button"
                            variante="fantasma"
                            tamanho="sm"
                            className="px-2 text-perigo hover:text-perigo"
                            onClick={() => setExcluindo(c)}
                            disabled={bloqueada}
                            title={
                              bloqueada
                                ? `Não dá pra excluir: ${c.produtos} ${c.produtos === 1 ? "produto usa" : "produtos usam"} esta categoria.`
                                : `Excluir ${c.nome}`
                            }
                            aria-label={`Excluir ${c.nome}`}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Botao>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </Tbody>
        </Tabela>
      )}

      <p className="text-xs text-texto-fraco">
        Categoria com produtos não pode ser excluída: mova os produtos pra outra categoria primeiro.
        {admin ? "" : " Só o administrador exclui categorias."}
      </p>

      <Dialogo
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo={editando === "nova" ? "Nova categoria" : "Editar categoria"}
        largura="sm"
      >
        {editando !== null ? (
          <FormularioCategoria
            key={editando === "nova" ? "nova" : editando.id}
            categoria={editando === "nova" ? null : editando}
            aoSalvar={fecharFormulario}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        aberto={excluindo !== null}
        aoFechar={() => setExcluindo(null)}
        titulo="Excluir categoria?"
        largura="sm"
        rodape={
          <>
            <Botao type="button" variante="secundaria" onClick={() => setExcluindo(null)} disabled={pendente}>
              Cancelar
            </Botao>
            <Botao type="button" variante="perigo" onClick={confirmarExclusao} pendente={pendente}>
              Sim, excluir
            </Botao>
          </>
        }
      >
        <p className="text-sm text-texto">
          A categoria <span className="font-semibold">{excluindo?.nome}</span> será apagada. Ela não tem produtos, então
          nada mais muda.
        </p>
      </Dialogo>
    </div>
  );
}
