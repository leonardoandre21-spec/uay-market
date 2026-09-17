"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { formatarReais } from "@/lib/dinheiro";
import { DialogoConfirmacao } from "../../_componentes/dialogo-confirmacao";
import { useAcao } from "../../_componentes/use-acao";
import type { DespesaLinha, Opcao } from "../../_componentes/tipos";
import { DialogoDespesa } from "./dialogo-despesa";
import { excluirDespesaAcao } from "../actions";

export function AcoesDespesa({
  despesa,
  categorias,
  fornecedores,
  caixaAberto,
  dataPadrao,
}: {
  despesa: DespesaLinha;
  categorias: Opcao[];
  fornecedores: Opcao[];
  caixaAberto: boolean;
  dataPadrao: string;
}) {
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const { pendente, rodar } = useAcao();

  if (despesa.contaPagarId) {
    return (
      <Link
        href={`/financeiro/contas-a-pagar?visao=pagas&mes=${despesa.dataInput.slice(0, 7)}`}
        className="inline-flex items-center gap-1 text-xs text-texto-suave underline-offset-2 hover:text-primaria hover:underline"
        title="Essa despesa veio de um boleto pago. Alterações só pelo boleto."
      >
        <FileText className="size-3.5" aria-hidden />
        Ver boleto
      </Link>
    );
  }

  const travada = despesa.pagoDoCaixa && despesa.sessaoFechada;

  return (
    <div className="flex items-center justify-end gap-1">
      <Botao variante="fantasma" tamanho="sm" onClick={() => setEditando(true)} aria-label="Editar despesa" title="Editar">
        <Pencil className="size-4" aria-hidden />
      </Botao>
      <Botao
        variante="fantasma"
        tamanho="sm"
        onClick={() => setExcluindo(true)}
        aria-label="Excluir despesa"
        title={travada ? "Saiu de um caixa já fechado; não pode ser excluída." : "Excluir"}
        disabled={travada}
      >
        <Trash2 className="size-4 text-perigo" aria-hidden />
      </Botao>

      {editando ? (
        <DialogoDespesa
          key={despesa.id}
          aberto={editando}
          aoFechar={() => setEditando(false)}
          despesa={despesa}
          categorias={categorias}
          fornecedores={fornecedores}
          caixaAberto={caixaAberto}
          dataPadrao={dataPadrao}
        />
      ) : null}

      <DialogoConfirmacao
        aberto={excluindo}
        aoFechar={() => setExcluindo(false)}
        titulo="Excluir despesa?"
        descricao="Essa ação não pode ser desfeita."
        rotuloConfirmar="Excluir"
        pendente={pendente}
        aoConfirmar={() =>
          rodar(() => excluirDespesaAcao(despesa.id), {
            mensagemSucesso: "Despesa excluída.",
            aoSucesso: () => setExcluindo(false),
          })
        }
      >
        <p>
          <span className="font-medium text-texto">{despesa.descricao}</span> de {despesa.dataFormatada}, no valor de{" "}
          <span className="font-medium text-texto tabular">{formatarReais(despesa.valor)}</span>.
        </p>
        {despesa.pagoDoCaixa ? <p>Ela está marcada como saída do dinheiro do caixa; ao excluir, o caixa deixa de contar esse valor.</p> : null}
      </DialogoConfirmacao>
    </div>
  );
}
