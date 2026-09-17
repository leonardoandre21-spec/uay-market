"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { Aviso } from "@/components/ui/aviso";
import { erroCampo, FormularioAcao } from "@/components/ui/formulario-acao";
import { formatarReais } from "@/lib/dinheiro";
import { cancelarVendaAction } from "../../actions";

/** Abre o diálogo de cancelamento com motivo obrigatório. */
export function BotaoCancelarVenda({
  vendaId,
  numero,
  total,
  temFiado,
}: {
  vendaId: number;
  numero: number;
  total: number;
  temFiado: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();

  return (
    <>
      <Botao variante="perigo" onClick={() => setAberto(true)}>
        <Ban className="size-4" aria-hidden />
        Cancelar venda
      </Botao>
      <Dialogo
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Cancelar a venda nº ${numero}?`}
        descricao="O estoque volta pros produtos e o valor sai do caixa. Isso fica registrado com seu nome."
      >
        <FormularioAcao
          acao={cancelarVendaAction}
          mensagemSucesso={`Venda nº ${numero} cancelada.`}
          aoSucesso={() => {
            setAberto(false);
            router.refresh();
          }}
          className="flex flex-col gap-4"
        >
          {(estado, pendente) => (
            <>
              <input type="hidden" name="vendaId" value={vendaId} />
              <Aviso tom="alerta">
                Total de {formatarReais(total)} será estornado.
                {temFiado ? " O valor fiado será abatido da conta do cliente." : ""}
              </Aviso>
              <Campo rotulo="Motivo do cancelamento" htmlFor="motivo" obrigatorio erro={erroCampo(estado, "motivo")}>
                <AreaTexto
                  id="motivo"
                  name="motivo"
                  required
                  minLength={3}
                  maxLength={300}
                  autoFocus
                  placeholder="Ex.: cliente desistiu, produto bipado errado, valor lançado errado..."
                />
              </Campo>
              <div className="flex justify-end gap-2">
                <Botao type="button" variante="contorno" onClick={() => setAberto(false)} disabled={pendente}>
                  Voltar
                </Botao>
                <BotaoEnviar variante="perigo">Confirmar cancelamento</BotaoEnviar>
              </div>
            </>
          )}
        </FormularioAcao>
      </Dialogo>
    </>
  );
}
