"use client";

import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Dialogo } from "@/components/ui/dialogo";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Campo, Entrada } from "@/components/ui/campo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { Botao } from "@/components/ui/botao";
import { formatarReais } from "@/lib/dinheiro";
import { registrarSangria, registrarSuprimento } from "@/app/(app)/caixa/actions";

type Tipo = "SANGRIA" | "SUPRIMENTO";

const TEXTOS: Record<
  Tipo,
  {
    titulo: string;
    descricao: string;
    rotuloValor: string;
    exemploMotivo: string;
    botao: string;
    sucesso: string;
  }
> = {
  SANGRIA: {
    titulo: "Sangria (retirar dinheiro da gaveta)",
    descricao: "Use quando tirar dinheiro do caixa pra levar ao cofre, pagar um entregador ou reduzir o risco na gaveta.",
    rotuloValor: "Quanto está saindo da gaveta?",
    exemploMotivo: "Ex.: levado ao cofre; pagamento do entregador de pão.",
    botao: "Registrar sangria",
    sucesso: "Sangria registrada.",
  },
  SUPRIMENTO: {
    titulo: "Suprimento (colocar dinheiro na gaveta)",
    descricao: "Use quando reforçar o troco com dinheiro que veio de fora do caixa.",
    rotuloValor: "Quanto está entrando na gaveta?",
    exemploMotivo: "Ex.: troco em moedas trazido do banco.",
    botao: "Registrar suprimento",
    sucesso: "Suprimento registrado.",
  },
};

/** Diálogo de sangria ou suprimento. O formulário é remontado a cada abertura. */
export function DialogoMovimento({
  tipo,
  aberto,
  aoFechar,
  sessaoId,
  dinheiroEsperado,
}: {
  tipo: Tipo;
  aberto: boolean;
  aoFechar: () => void;
  sessaoId: number;
  /** Dinheiro esperado na gaveta agora (centavos), pra orientar a sangria. */
  dinheiroEsperado: number;
}) {
  const router = useRouter();
  const t = TEXTOS[tipo];
  const Icone = tipo === "SANGRIA" ? ArrowDownToLine : ArrowUpFromLine;

  return (
    <Dialogo aberto={aberto} aoFechar={aoFechar} titulo={t.titulo} descricao={t.descricao} largura="sm">
      {aberto ? (
        <FormularioAcao
          acao={tipo === "SANGRIA" ? registrarSangria : registrarSuprimento}
          mensagemSucesso={t.sucesso}
          aoSucesso={() => {
            aoFechar();
            router.refresh();
          }}
        >
          {(estado) => (
            <div className="flex flex-col gap-4">
              <input type="hidden" name="sessaoId" value={sessaoId} />

              <div className="flex items-center justify-between rounded-padrao bg-superficie-2 px-4 py-2.5 text-sm">
                <span className="text-texto-suave">Dinheiro esperado na gaveta agora</span>
                <strong className="tabular text-texto">{formatarReais(dinheiroEsperado)}</strong>
              </div>

              <Campo rotulo={t.rotuloValor} htmlFor={`valor-${tipo}`} obrigatorio erro={erroCampo(estado, "valor")}>
                <EntradaMoeda id={`valor-${tipo}`} name="valor" className="h-12 text-right text-lg tabular" autoFocus required />
              </Campo>

              <Campo
                rotulo="Motivo"
                htmlFor={`motivo-${tipo}`}
                obrigatorio
                erro={erroCampo(estado, "motivo")}
                ajuda="Aparece no histórico e no resumo do fechamento."
              >
                <Entrada
                  id={`motivo-${tipo}`}
                  name="motivo"
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder={t.exemploMotivo}
                  autoComplete="off"
                />
              </Campo>

              <div className="mt-1 flex justify-end gap-2">
                <Botao type="button" variante="fantasma" onClick={aoFechar}>
                  Cancelar
                </Botao>
                <BotaoEnviar>
                  <Icone className="size-4" aria-hidden />
                  {t.botao}
                </BotaoEnviar>
              </div>
            </div>
          )}
        </FormularioAcao>
      ) : (
        <div className="h-4" aria-hidden />
      )}
    </Dialogo>
  );
}
