"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormaPagamento } from "@prisma/client";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, CaixaSelecao, Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { useToast } from "@/components/ui/toast";
import { formatarData, parseDataInput } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import { diferencaPagamento, proximoVencimentoRecorrente, rotuloParcela, rotuloRecorrencia } from "@/lib/servicos/financeiro-calculos";
import { BotaoCopiar } from "../../_componentes/botao-copiar";
import type { ContaLinha } from "../../_componentes/tipos";
import { pagarContaAcao } from "../actions";

const FORMAS_BOLETO: FormaPagamento[] = ["PIX", "DINHEIRO", "DEBITO", "CREDITO"];

/** Registrar o pagamento de um boleto. Renderize só quando aberto. */
export function DialogoPagar({
  aberto,
  aoFechar,
  conta,
  caixaAberto,
  hojeInput,
}: {
  aberto: boolean;
  aoFechar: () => void;
  conta: ContaLinha;
  caixaAberto: boolean;
  hojeInput: string; // yyyy-MM-dd
}) {
  const router = useRouter();
  const toast = useToast();
  const [valorPago, setValorPago] = useState<number>(conta.valor);
  const [pagoDoCaixa, setPagoDoCaixa] = useState(false);
  const [forma, setForma] = useState<string>("PIX");

  if (!aberto) return null;

  const diferenca = diferencaPagamento(conta.valor, valorPago);
  const parcela = rotuloParcela(conta.parcelaAtual, conta.totalParcelas);
  const vencimentoData = parseDataInput(conta.vencimentoInput);
  const proximoVencimento = conta.recorrenciaMensal && vencimentoData ? formatarData(proximoVencimentoRecorrente(vencimentoData, conta.diaVencimento)) : null;
  const formaEfetiva = pagoDoCaixa ? "DINHEIRO" : forma;

  return (
    <Dialogo aberto={aberto} aoFechar={aoFechar} titulo="Registrar pagamento" largura="md">
      <FormularioAcao
        acao={pagarContaAcao}
        aoSucesso={(r) => {
          toast.sucesso(r.proximaConta ? `Pagamento registrado. A conta do mês seguinte já está cadastrada pra ${r.proximaConta}.` : "Pagamento registrado. A despesa entrou no mês.");
          aoFechar();
          router.refresh();
        }}
        className="flex flex-col gap-4"
      >
        {(estado, pendente) => (
          <>
            <input type="hidden" name="id" value={conta.id} />

            <div className="rounded-padrao border border-borda bg-superficie-2/50 p-4 text-sm">
              <p className="font-semibold text-texto">
                {conta.descricao}
                {parcela ? <span className="ml-1 font-normal text-texto-suave">(parcela {parcela})</span> : null}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-texto-suave">
                <dt>Vencimento</dt>
                <dd className={`text-right tabular ${conta.dias < 0 ? "font-medium text-perigo" : "text-texto"}`}>
                  {conta.vencimentoFormatado}
                  {conta.dias < 0 ? ` (${Math.abs(conta.dias)} ${Math.abs(conta.dias) === 1 ? "dia" : "dias"} de atraso)` : conta.dias === 0 ? " (hoje)" : ""}
                </dd>
                <dt>Valor do boleto</dt>
                <dd className="text-right tabular text-texto">{formatarReais(conta.valor)}</dd>
                {conta.fornecedorNome ? (
                  <>
                    <dt>Fornecedor</dt>
                    <dd className="truncate text-right text-texto">{conta.fornecedorNome}</dd>
                  </>
                ) : null}
              </dl>
              {conta.linhaDigitavel ? (
                <div className="mt-3 flex items-center gap-2 border-t border-borda pt-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-texto-suave" title={conta.linhaDigitavel}>
                    {conta.linhaDigitavel}
                  </code>
                  <BotaoCopiar texto={conta.linhaDigitavel} rotulo="Copiar código" mensagem="Linha digitável copiada." variante="contorno" />
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Data do pagamento" htmlFor="pagar-data" obrigatorio erro={erroCampo(estado, "dataPagamento")}>
                <Entrada id="pagar-data" name="dataPagamento" type="date" defaultValue={hojeInput} max={hojeInput} required />
              </Campo>
              <Campo
                rotulo="Valor pago"
                htmlFor="pagar-valor"
                obrigatorio
                erro={erroCampo(estado, "valorPago")}
                ajuda={
                  diferenca > 0
                    ? `Juros/multa de ${formatarReais(diferenca)} sobre o valor do boleto.`
                    : diferenca < 0
                      ? `Desconto de ${formatarReais(-diferenca)} sobre o valor do boleto.`
                      : "Altere se pagou com juros ou desconto."
                }
              >
                <EntradaMoeda id="pagar-valor" name="valorPago" valorInicial={conta.valor} required aoMudar={setValorPago} />
              </Campo>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Como foi pago" htmlFor="pagar-forma" obrigatorio erro={erroCampo(estado, "formaPagamento")}>
                <Selecao id="pagar-forma" name={pagoDoCaixa ? undefined : "formaPagamento"} value={formaEfetiva} onChange={(e) => setForma(e.target.value)} disabled={pagoDoCaixa} required>
                  {FORMAS_BOLETO.map((f) => (
                    <option key={f} value={f}>
                      {ROTULO_FORMA_PAGAMENTO[f]}
                    </option>
                  ))}
                </Selecao>
                {pagoDoCaixa ? <input type="hidden" name="formaPagamento" value="DINHEIRO" /> : null}
              </Campo>
              <Campo
                rotulo="Caixa"
                ajuda={caixaAberto ? "Marque se o dinheiro saiu da gaveta do caixa aberto." : "Só dá pra marcar com o caixa aberto."}
              >
                <div className="flex h-10 items-center">
                  <CaixaSelecao name="pagoDoCaixa" rotulo="Saiu do dinheiro do caixa" checked={pagoDoCaixa} disabled={!caixaAberto} onChange={(e) => setPagoDoCaixa(e.target.checked)} />
                </div>
              </Campo>
            </div>

            <Campo rotulo="Observação" htmlFor="pagar-observacao" erro={erroCampo(estado, "observacao")}>
              <AreaTexto id="pagar-observacao" name="observacao" maxLength={300} placeholder="Opcional (ex.: pago no app do banco, comprovante nº...)" className="min-h-16" />
            </Campo>

            {proximoVencimento ? (
              <Aviso tom="info">
                Conta mensal ({rotuloRecorrencia(conta.diaVencimento)}): ao confirmar, a do mês seguinte (vencimento {proximoVencimento}, {formatarReais(conta.valor)}) é criada automaticamente.
              </Aviso>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-borda pt-4">
              <Botao type="button" variante="fantasma" onClick={aoFechar} disabled={pendente}>
                Cancelar
              </Botao>
              <BotaoEnviar>Confirmar pagamento de {formatarReais(valorPago)}</BotaoEnviar>
            </div>
          </>
        )}
      </FormularioAcao>
    </Dialogo>
  );
}
