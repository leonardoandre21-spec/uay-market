"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, PowerOff, Trash2 } from "lucide-react";
import { Botao, type TamanhoBotao, type VarianteBotao } from "@/components/ui/botao";
import { Dialogo } from "@/components/ui/dialogo";
import { useToast } from "@/components/ui/toast";
import { alternarAtivoProduto, excluirProduto } from "../actions";

/** Desativa/reativa o produto (soft delete). Serve na lista e na página do produto. */
export function BotaoAlternarAtivo({
  id,
  ativo,
  nome,
  tamanho = "sm",
  variante = "fantasma",
  somenteIcone = false,
}: {
  id: number;
  ativo: boolean;
  nome: string;
  tamanho?: TamanhoBotao;
  variante?: VarianteBotao;
  somenteIcone?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const rotulo = ativo ? "Desativar" : "Reativar";

  function executar() {
    iniciar(async () => {
      const r = await alternarAtivoProduto(id, !ativo);
      if (r.ok) {
        toast.sucesso(r.dados.ativo ? `"${nome}" voltou pro caixa.` : `"${nome}" foi desativado e não aparece mais no caixa.`);
        router.refresh();
      } else {
        toast.erro(r.erro);
      }
    });
  }

  return (
    <Botao
      type="button"
      variante={variante}
      tamanho={tamanho}
      pendente={pendente}
      onClick={executar}
      title={`${rotulo} ${nome}`}
      aria-label={somenteIcone ? `${rotulo} ${nome}` : undefined}
      className={somenteIcone ? "px-2" : undefined}
    >
      {pendente ? null : ativo ? <PowerOff className="size-4" aria-hidden /> : <Power className="size-4" aria-hidden />}
      {somenteIcone ? null : rotulo}
    </Botao>
  );
}

/** Exclusão definitiva com confirmação. Só aparece pra ADMIN; fica bloqueado se o produto já movimentou. */
export function BotaoExcluirProduto({
  id,
  nome,
  podeExcluir,
}: {
  id: number;
  nome: string;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  function confirmar() {
    iniciar(async () => {
      const r = await excluirProduto(id);
      if (r.ok) {
        toast.sucesso(`"${nome}" foi excluído.`);
        setAberto(false);
        router.push(r.dados.destino);
        router.refresh();
      } else {
        toast.erro(r.erro);
      }
    });
  }

  return (
    <>
      <Botao
        type="button"
        variante="contorno"
        tamanho="sm"
        onClick={() => setAberto(true)}
        disabled={!podeExcluir}
        title={
          podeExcluir
            ? "Apagar o produto de vez"
            : "Este produto já tem vendas ou movimentos de estoque. Use Desativar em vez de excluir."
        }
        className="text-perigo"
      >
        <Trash2 className="size-4" aria-hidden />
        Excluir
      </Botao>
      <Dialogo
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Excluir produto de vez?"
        descricao="Essa ação não pode ser desfeita."
        largura="sm"
        rodape={
          <>
            <Botao type="button" variante="secundaria" onClick={() => setAberto(false)} disabled={pendente}>
              Cancelar
            </Botao>
            <Botao type="button" variante="perigo" onClick={confirmar} pendente={pendente}>
              Sim, excluir
            </Botao>
          </>
        }
      >
        <p className="text-sm text-texto">
          O produto <span className="font-semibold">{nome}</span> será apagado do cadastro. Se ele ainda for vendido
          algum dia, prefira <span className="font-medium">Desativar</span>, que tira do caixa mas guarda o histórico.
        </p>
      </Dialogo>
    </>
  );
}
