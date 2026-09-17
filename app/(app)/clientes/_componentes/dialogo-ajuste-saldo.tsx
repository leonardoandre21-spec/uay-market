"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { FormularioAcao } from "@/components/ui/formulario-acao";
import { formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import { ajustarSaldo } from "../actions";

type Tipo = "DEBITO" | "PAGAMENTO";

/**
 * Ajuste manual do saldo (só ADMIN). Lança um débito (dívida antiga do
 * caderno, por exemplo) ou um abatimento (acerto, desconto, perdão de dívida).
 * Nada disso passa pelo caixa.
 */
export function DialogoAjusteSaldo({ clienteId, clienteNome, saldo }: { clienteId: number; clienteNome: string; saldo: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("DEBITO");
  const [valor, setValor] = useState(0);
  // Remonta o formulário a cada abertura pra começar sempre limpo.
  const [chave, setChave] = useState(0);

  function abrir() {
    setTipo("DEBITO");
    setValor(0);
    setChave((k) => k + 1);
    setAberto(true);
  }

  const saldoNovo = tipo === "DEBITO" ? saldo + valor : saldo - valor;
  const abatimentoAcimaDoSaldo = tipo === "PAGAMENTO" && valor > saldo;

  return (
    <>
      <Botao variante="contorno" onClick={abrir}>
        <Scale className="size-4" aria-hidden />
        Ajuste manual
      </Botao>

      <Dialogo
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Ajuste manual de saldo"
        descricao={
          saldo < 0
            ? `${clienteNome} tem crédito de ${formatarReais(-saldo)} (a loja deve pra ele). Pra registrar a devolução em dinheiro, lance uma dívida nesse valor.`
            : `Saldo atual de ${clienteNome}: ${formatarReais(saldo)}.`
        }
        largura="md"
      >
        <FormularioAcao
          key={chave}
          acao={ajustarSaldo}
          mensagemSucesso="Ajuste lançado no extrato."
          aoSucesso={() => {
            setAberto(false);
            router.refresh();
          }}
          className="flex flex-col gap-4"
        >
          {(_estado, pendente) => (
            <>
              <input type="hidden" name="clienteId" value={clienteId} />
              <input type="hidden" name="tipo" value={tipo} />

              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo do ajuste">
                <button
                  type="button"
                  role="radio"
                  aria-checked={tipo === "DEBITO"}
                  onClick={() => setTipo("DEBITO")}
                  className={cn(
                    "rounded-padrao border px-3 py-3 text-left transition-colors",
                    tipo === "DEBITO" ? "border-perigo bg-perigo-suave" : "border-borda bg-superficie hover:bg-superficie-2",
                  )}
                >
                  <p className="text-sm font-medium text-texto">Adicionar dívida</p>
                  <p className="mt-0.5 text-xs text-texto-suave">Saldo antigo do caderno, compra que ficou sem registrar.</p>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={tipo === "PAGAMENTO"}
                  onClick={() => setTipo("PAGAMENTO")}
                  className={cn(
                    "rounded-padrao border px-3 py-3 text-left transition-colors",
                    tipo === "PAGAMENTO" ? "border-sucesso bg-sucesso-suave" : "border-borda bg-superficie hover:bg-superficie-2",
                  )}
                >
                  <p className="text-sm font-medium text-texto">Abater do saldo</p>
                  <p className="mt-0.5 text-xs text-texto-suave">Acerto, desconto ou dívida perdoada. Não passa pelo caixa.</p>
                </button>
              </div>

              <Campo
                rotulo="Valor"
                htmlFor="valor-ajuste"
                obrigatorio
                erro={abatimentoAcimaDoSaldo ? `O abatimento não pode passar do saldo devedor (${formatarReais(saldo)}).` : undefined}
                ajuda={valor > 0 && !abatimentoAcimaDoSaldo ? `O saldo vai de ${formatarReais(saldo)} para ${formatarReais(saldoNovo)}.` : undefined}
              >
                <EntradaMoeda id="valor-ajuste" name="valor" valorInicial={0} aoMudar={setValor} className="h-12 text-right text-lg tabular" />
              </Campo>

              <Campo rotulo="Motivo do ajuste" htmlFor="observacao-ajuste" obrigatorio ajuda="Fica registrado no extrato e na auditoria.">
                <AreaTexto
                  id="observacao-ajuste"
                  name="observacao"
                  required
                  minLength={5}
                  maxLength={500}
                  placeholder="Ex.: saldo antigo do caderno de fiado, conferido com o cliente em 15/09."
                />
              </Campo>

              {tipo === "PAGAMENTO" ? (
                <Aviso tom="info">
                  Se o cliente pagou de verdade (dinheiro, Pix ou cartão), use o botão <strong>Receber pagamento</strong>: ali o valor entra no caixa. O ajuste é só pra acertar o saldo.
                </Aviso>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-borda pt-4">
                <Botao type="button" variante="fantasma" onClick={() => setAberto(false)} disabled={pendente}>
                  Cancelar
                </Botao>
                <BotaoEnviar variante={tipo === "DEBITO" ? "perigo" : "primaria"} disabled={valor <= 0 || abatimentoAcimaDoSaldo}>
                  {tipo === "DEBITO" ? "Lançar dívida" : "Lançar abatimento"}
                </BotaoEnviar>
              </div>
            </>
          )}
        </FormularioAcao>
      </Dialogo>
    </>
  );
}
