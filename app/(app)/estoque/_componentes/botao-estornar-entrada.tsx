"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { Campo, Entrada } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Aviso } from "@/components/ui/aviso";
import { useToast } from "@/components/ui/toast";
import { formatarReais } from "@/lib/dinheiro";
import { estornarEntradaAction } from "../actions";

export function BotaoEstornarEntrada({
  entradaId,
  total,
  itens,
  boletosPendentes,
  bloqueios,
}: {
  entradaId: number;
  total: number;
  itens: number;
  boletosPendentes: number;
  bloqueios: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const bloqueado = bloqueios.length > 0;

  return (
    <>
      <Botao variante="perigo" onClick={() => setAberto(true)} disabled={bloqueado} title={bloqueado ? bloqueios.join(" ") : undefined}>
        <RotateCcw className="size-4" aria-hidden /> Estornar entrada
      </Botao>
      <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo={`Estornar entrada nº ${entradaId}`} descricao="Desfaz a entrada no estoque." largura="md">
        {aberto ? (
          <FormularioAcao
            acao={estornarEntradaAction}
            mensagemSucesso="Entrada estornada. Estoque, lotes e custo médio revertidos."
            aoSucesso={(dados) => {
              if (dados.custosMantidos.length) {
                toast.notificar(
                  `O custo médio de ${dados.custosMantidos.join(", ")} foi editado à mão depois desta entrada e por isso ficou como estava. Confira no cadastro do produto.`,
                  "info",
                );
              }
              setAberto(false);
              router.refresh();
            }}
            className="flex flex-col gap-4"
          >
            {(estado, pendente) => (
              <>
                <input type="hidden" name="entradaId" value={entradaId} />
                <Aviso tom="alerta" titulo="O que acontece">
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li>
                      A quantidade dos {itens} item(ns) sai do estoque ({formatarReais(total)} em mercadoria).
                    </li>
                    <li>Os lotes criados por esta entrada são removidos.</li>
                    {boletosPendentes > 0 ? <li>{boletosPendentes} boleto(s) pendente(s) vinculado(s) são cancelados.</li> : null}
                    <li>O custo médio dos produtos volta ao que era antes desta entrada (recalculado se houve outras entradas depois).</li>
                  </ul>
                </Aviso>
                <Campo rotulo="Motivo do estorno" htmlFor="estorno-motivo" obrigatorio erro={erroCampo(estado, "motivo")}>
                  <Entrada id="estorno-motivo" name="motivo" required maxLength={200} autoFocus placeholder="Ex.: nota lançada em duplicidade" />
                </Campo>
                <div className="flex justify-end gap-2">
                  <Botao type="button" variante="fantasma" onClick={() => setAberto(false)} disabled={pendente}>
                    Cancelar
                  </Botao>
                  <BotaoEnviar variante="perigo">Confirmar estorno</BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        ) : null}
      </Dialogo>
    </>
  );
}
