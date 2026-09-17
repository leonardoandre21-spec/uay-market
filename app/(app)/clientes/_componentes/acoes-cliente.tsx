"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw, Trash } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { Dialogo } from "@/components/ui/dialogo";
import { FormularioAcao } from "@/components/ui/formulario-acao";
import { formatarReais } from "@/lib/dinheiro";
import { desativarCliente, excluirClienteAcao, reativarCliente } from "../actions";

/**
 * Zona de cuidado do cadastro: desativar/reativar (qualquer usuário) e
 * excluir de verdade (só ADMIN, só sem compras nem lançamentos).
 */
export function AcoesCliente({
  clienteId,
  clienteNome,
  ativo,
  saldo,
  ehAdmin,
  podeExcluir,
}: {
  clienteId: number;
  clienteNome: string;
  ativo: boolean;
  saldo: number;
  ehAdmin: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [confirmarDesativar, setConfirmarDesativar] = useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-texto">{ativo ? "Desativar cliente" : "Reativar cliente"}</p>
          <p className="text-xs text-texto-suave">
            {ativo
              ? "Ele some da lista principal e do caixa, mas o histórico e o saldo continuam guardados."
              : "Volta a aparecer na lista principal e pode comprar fiado de novo (se tiver limite)."}
          </p>
        </div>
        {ativo ? (
          <Botao variante="contorno" onClick={() => setConfirmarDesativar(true)}>
            <Ban className="size-4" aria-hidden />
            Desativar
          </Botao>
        ) : (
          <FormularioAcao acao={reativarCliente} mensagemSucesso="Cliente reativado." aoSucesso={() => router.refresh()}>
            <input type="hidden" name="id" value={clienteId} />
            <BotaoEnviar variante="contorno">
              <RotateCcw className="size-4" aria-hidden />
              Reativar
            </BotaoEnviar>
          </FormularioAcao>
        )}
      </div>

      {ehAdmin ? (
        <div className="flex flex-col gap-3 border-t border-borda pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-texto">Excluir cadastro</p>
            <p className="text-xs text-texto-suave">
              {podeExcluir
                ? "Apaga o cliente de vez. Só é possível porque ele ainda não tem compras nem lançamentos."
                : "Não dá pra excluir: o cliente tem compras ou lançamentos de fiado. Use desativar."}
            </p>
          </div>
          <Botao variante="perigo" onClick={() => setConfirmarExcluir(true)} disabled={!podeExcluir}>
            <Trash className="size-4" aria-hidden />
            Excluir
          </Botao>
        </div>
      ) : null}

      <Dialogo
        aberto={confirmarDesativar}
        aoFechar={() => setConfirmarDesativar(false)}
        titulo="Desativar cliente?"
        descricao={`${clienteNome} deixa de aparecer na lista principal e no caixa.`}
        largura="sm"
      >
        <FormularioAcao
          acao={desativarCliente}
          mensagemSucesso="Cliente desativado."
          aoSucesso={() => {
            setConfirmarDesativar(false);
            router.refresh();
          }}
          className="flex flex-col gap-4"
        >
          {(_estado, pendente) => (
            <>
              <input type="hidden" name="id" value={clienteId} />
              {saldo > 0 ? (
                <Aviso tom="alerta" titulo={`Ainda deve ${formatarReais(saldo)}`}>
                  O saldo continua registrado e o cliente segue aparecendo no filtro &quot;Com saldo devedor&quot;. Você pode reativar quando quiser.
                </Aviso>
              ) : (
                <p className="text-sm text-texto-suave">O histórico de compras e o extrato de fiado ficam guardados. Você pode reativar quando quiser.</p>
              )}
              <div className="flex justify-end gap-2">
                <Botao type="button" variante="fantasma" onClick={() => setConfirmarDesativar(false)} disabled={pendente}>
                  Cancelar
                </Botao>
                <BotaoEnviar variante="secundaria">
                  <Ban className="size-4" aria-hidden />
                  Desativar
                </BotaoEnviar>
              </div>
            </>
          )}
        </FormularioAcao>
      </Dialogo>

      <Dialogo
        aberto={confirmarExcluir}
        aoFechar={() => setConfirmarExcluir(false)}
        titulo="Excluir cliente de vez?"
        descricao={`${clienteNome} será apagado do sistema. Isso não pode ser desfeito.`}
        largura="sm"
      >
        <FormularioAcao
          acao={excluirClienteAcao}
          mensagemSucesso="Cliente excluído."
          aoSucesso={() => {
            setConfirmarExcluir(false);
            router.replace("/clientes");
          }}
          className="flex flex-col gap-4"
        >
          {(_estado, pendente) => (
            <>
              <input type="hidden" name="id" value={clienteId} />
              <p className="text-sm text-texto-suave">Se preferir manter o histórico, desative o cadastro em vez de excluir.</p>
              <div className="flex justify-end gap-2">
                <Botao type="button" variante="fantasma" onClick={() => setConfirmarExcluir(false)} disabled={pendente}>
                  Cancelar
                </Botao>
                <BotaoEnviar variante="perigo">
                  <Trash className="size-4" aria-hidden />
                  Excluir de vez
                </BotaoEnviar>
              </div>
            </>
          )}
        </FormularioAcao>
      </Dialogo>
    </div>
  );
}
