"use client";

import { useState } from "react";
import { Pencil, Power, Trash2 } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { DialogoConfirmacao } from "../../_componentes/dialogo-confirmacao";
import { useAcao } from "../../_componentes/use-acao";
import type { FornecedorLinha } from "../../_componentes/tipos";
import { DialogoFornecedor } from "./dialogo-fornecedor";
import { alternarAtivoFornecedorAcao, excluirFornecedorAcao } from "../actions";

export function AcoesFornecedor({
  fornecedor,
  vinculos,
  comRotulos = false,
}: {
  fornecedor: FornecedorLinha;
  vinculos: number; // entradas + boletos + despesas
  comRotulos?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const { pendente, rodar } = useAcao();
  const podeExcluir = vinculos === 0;

  return (
    <div className="flex items-center justify-end gap-1">
      <Botao variante={comRotulos ? "contorno" : "fantasma"} tamanho="sm" onClick={() => setEditando(true)} aria-label="Editar fornecedor" title="Editar">
        <Pencil className="size-4" aria-hidden />
        {comRotulos ? "Editar" : null}
      </Botao>
      <Botao
        variante={comRotulos ? "contorno" : "fantasma"}
        tamanho="sm"
        pendente={pendente}
        onClick={() =>
          rodar(() => alternarAtivoFornecedorAcao(fornecedor.id, !fornecedor.ativo), {
            mensagemSucesso: fornecedor.ativo ? "Fornecedor marcado como inativo." : "Fornecedor reativado.",
          })
        }
        aria-label={fornecedor.ativo ? "Marcar como inativo" : "Reativar fornecedor"}
        title={fornecedor.ativo ? "Marcar como inativo" : "Reativar"}
      >
        <Power className="size-4" aria-hidden />
        {comRotulos ? (fornecedor.ativo ? "Inativar" : "Reativar") : null}
      </Botao>
      <Botao
        variante={comRotulos ? "contorno" : "fantasma"}
        tamanho="sm"
        onClick={() => setExcluindo(true)}
        disabled={!podeExcluir}
        aria-label="Excluir fornecedor"
        title={podeExcluir ? "Excluir" : "Tem entradas, boletos ou despesas vinculadas. Marque como inativo em vez de excluir."}
      >
        <Trash2 className="size-4 text-perigo" aria-hidden />
        {comRotulos ? "Excluir" : null}
      </Botao>

      {editando ? <DialogoFornecedor key={fornecedor.id} aberto={editando} aoFechar={() => setEditando(false)} fornecedor={fornecedor} /> : null}

      <DialogoConfirmacao
        aberto={excluindo}
        aoFechar={() => setExcluindo(false)}
        titulo="Excluir fornecedor?"
        descricao="Essa ação não pode ser desfeita."
        rotuloConfirmar="Excluir"
        pendente={pendente}
        aoConfirmar={() =>
          rodar(() => excluirFornecedorAcao(fornecedor.id), {
            mensagemSucesso: "Fornecedor excluído.",
            aoSucesso: () => setExcluindo(false),
          })
        }
      >
        <p>
          <span className="font-medium text-texto">{fornecedor.nome}</span> não tem entradas, boletos nem despesas vinculadas e será removido do cadastro.
        </p>
      </DialogoConfirmacao>
    </div>
  );
}
