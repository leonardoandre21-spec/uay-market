"use client";

import { useState } from "react";
import { Ban, CheckCircle2, Pencil, RotateCcw, Undo2 } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { useToast } from "@/components/ui/toast";
import { formatarReais } from "@/lib/dinheiro";
import { BotaoCopiar } from "../../_componentes/botao-copiar";
import { DialogoConfirmacao } from "../../_componentes/dialogo-confirmacao";
import { useAcao } from "../../_componentes/use-acao";
import type { ContaLinha, Opcao } from "../../_componentes/tipos";
import { DialogoConta } from "./dialogo-conta";
import { DialogoPagar } from "./dialogo-pagar";
import { cancelarContaAcao, desfazerPagamentoAcao, reativarContaAcao } from "../actions";

export function AcoesConta({
  conta,
  fornecedores,
  categorias,
  caixaAberto,
  hojeInput,
}: {
  conta: ContaLinha;
  fornecedores: Opcao[];
  categorias: Opcao[];
  caixaAberto: boolean;
  hojeInput: string;
}) {
  const toast = useToast();
  const [pagando, setPagando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const { pendente, rodar } = useAcao();

  if (conta.status === "PAGA") {
    return (
      <div className="flex items-center justify-end gap-1">
        <Botao variante="fantasma" tamanho="sm" onClick={() => setDesfazendo(true)} title="Desfazer pagamento" aria-label="Desfazer pagamento">
          <Undo2 className="size-4" aria-hidden />
          Desfazer
        </Botao>
        <DialogoConfirmacao
          aberto={desfazendo}
          aoFechar={() => setDesfazendo(false)}
          titulo="Desfazer pagamento?"
          rotuloConfirmar="Desfazer pagamento"
          pendente={pendente}
          aoConfirmar={() =>
            rodar(() => desfazerPagamentoAcao(conta.id), {
              aoSucesso: (r) => {
                toast.sucesso("Pagamento desfeito. A conta voltou pra pendente.");
                if (r.aviso) toast.notificar(r.aviso, "info");
                setDesfazendo(false);
              },
            })
          }
        >
          <p>
            <span className="font-medium text-texto">{conta.descricao}</span>, paga em {conta.dataPagamentoFormatada} por{" "}
            <span className="font-medium text-texto tabular">{formatarReais(conta.valorPago ?? conta.valor)}</span>.
          </p>
          <p>A despesa gerada por esse pagamento será apagada e a conta volta pra pendente.</p>
          {conta.pagaDoCaixa ? <p>O valor saiu do dinheiro do caixa: só dá pra desfazer enquanto aquela sessão de caixa estiver aberta.</p> : null}
          {conta.recorrenciaMensal ? <p>A conta do mês seguinte, criada no pagamento, também é removida (se você já tiver alterado essa conta, ela fica).</p> : null}
        </DialogoConfirmacao>
      </div>
    );
  }

  if (conta.status === "CANCELADA") {
    return (
      <div className="flex items-center justify-end gap-1">
        <Botao
          variante="fantasma"
          tamanho="sm"
          pendente={pendente}
          onClick={() => rodar(() => reativarContaAcao(conta.id), { mensagemSucesso: "Conta reativada." })}
          title="Reativar conta"
        >
          <RotateCcw className="size-4" aria-hidden />
          Reativar
        </Botao>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Botao variante="primaria" tamanho="sm" onClick={() => setPagando(true)} title="Registrar pagamento">
        <CheckCircle2 className="size-4" aria-hidden />
        Pagar
      </Botao>
      {conta.linhaDigitavel ? (
        <BotaoCopiar texto={conta.linhaDigitavel} rotulo="Copiar linha digitável" mensagem="Linha digitável copiada." somenteIcone />
      ) : null}
      <Botao variante="fantasma" tamanho="sm" onClick={() => setEditando(true)} aria-label="Editar conta" title="Editar">
        <Pencil className="size-4" aria-hidden />
      </Botao>
      <Botao variante="fantasma" tamanho="sm" onClick={() => setCancelando(true)} aria-label="Cancelar conta" title="Cancelar conta">
        <Ban className="size-4 text-perigo" aria-hidden />
      </Botao>

      {pagando ? <DialogoPagar key={`pagar-${conta.id}`} aberto={pagando} aoFechar={() => setPagando(false)} conta={conta} caixaAberto={caixaAberto} hojeInput={hojeInput} /> : null}

      {editando ? (
        <DialogoConta key={`editar-${conta.id}`} aberto={editando} aoFechar={() => setEditando(false)} conta={conta} fornecedores={fornecedores} categorias={categorias} vencimentoPadrao={hojeInput} />
      ) : null}

      <DialogoConfirmacao
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        titulo="Cancelar esta conta?"
        descricao="Ela sai dos vencimentos, mas fica no histórico como cancelada e pode ser reativada."
        rotuloConfirmar="Cancelar conta"
        pedirMotivo
        pendente={pendente}
        aoConfirmar={(motivo) =>
          rodar(() => cancelarContaAcao(conta.id, motivo), {
            mensagemSucesso: "Conta cancelada.",
            aoSucesso: () => setCancelando(false),
          })
        }
      >
        <p>
          <span className="font-medium text-texto">{conta.descricao}</span>, vencimento {conta.vencimentoFormatado}, {formatarReais(conta.valor)}.
        </p>
      </DialogoConfirmacao>
    </div>
  );
}
