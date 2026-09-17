"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, HandCoins, Printer } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, CaixaSelecao, Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { FormularioAcao } from "@/components/ui/formulario-acao";
import { calcularTaxa, formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import { taxaDaMaquininha } from "@/lib/servicos/vendas-calculos";
import type { MaquininhaRecebimento } from "@/lib/servicos/clientes";
import { receberPagamento } from "../actions";

const FORMAS = ["DINHEIRO", "PIX", "DEBITO", "CREDITO"] as const;
type Forma = (typeof FORMAS)[number];

type Recebido = {
  lancamentoId: number;
  clienteId: number;
  saldoNovo: number;
  entrouNoCaixa: boolean;
  maquininhaNome: string | null;
  taxaValor: number;
  valor: number;
  forma: Forma;
};

function maquininhaInicial(maquininhas: MaquininhaRecebimento[]): number | null {
  if (maquininhas.length === 0) return null;
  return maquininhas.find((m) => m.padrao)?.id ?? maquininhas[0].id;
}

/**
 * Botão "Receber pagamento" + diálogo. Valor vem preenchido com o saldo
 * (pode receber parcial). Avisa quando não há caixa aberto e a forma é dinheiro.
 * Cartão e Pix pedem a maquininha como no PDV (cartão obrigatório quando há
 * maquininha cadastrada); a taxa dela vira despesa automática.
 */
export function DialogoReceberPagamento({
  clienteId,
  clienteNome,
  saldo,
  caixaAberto,
  maquininhas,
  abrirInicial = false,
  variante = "primaria",
}: {
  clienteId: number;
  clienteNome: string;
  saldo: number;
  caixaAberto: boolean;
  maquininhas: MaquininhaRecebimento[];
  abrirInicial?: boolean;
  variante?: "primaria" | "contorno";
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [forma, setForma] = useState<Forma>("DINHEIRO");
  const [valor, setValor] = useState(saldo);
  const [maquininhaId, setMaquininhaId] = useState<number | null>(() => maquininhaInicial(maquininhas));
  const [nsu, setNsu] = useState("");
  // Pix só passa na maquininha quando alguma cobra taxa de Pix; senão é o Pix da conta.
  const [pixNaMaquininha, setPixNaMaquininha] = useState(() => maquininhas.some((m) => m.taxaPix > 0));
  const [recebido, setRecebido] = useState<Recebido | null>(null);
  // chaveForm remonta o formulário a cada abertura (começa limpo);
  // chaveValor remonta só o campo de valor quando "Quitar tudo" é clicado.
  const [chaveForm, setChaveForm] = useState(0);
  const [chaveValor, setChaveValor] = useState(0);

  // Abre sozinho quando a página veio de /clientes/[id]?acao=receber (uma vez só)
  // e limpa o parâmetro da URL pra não reabrir depois de fechar.
  const jaAbriuInicial = useRef(false);
  useEffect(() => {
    if (!abrirInicial || jaAbriuInicial.current) return;
    jaAbriuInicial.current = true;
    if (saldo > 0) setAberto(true);
    router.replace(`/clientes/${clienteId}`, { scroll: false });
  }, [abrirInicial, saldo, clienteId, router]);

  function abrir() {
    setRecebido(null);
    setValor(saldo);
    setForma("DINHEIRO");
    setMaquininhaId(maquininhaInicial(maquininhas));
    setNsu("");
    setPixNaMaquininha(maquininhas.some((m) => m.taxaPix > 0));
    setChaveForm((k) => k + 1);
    setAberto(true);
  }

  function quitarTudo() {
    setValor(saldo);
    setChaveValor((k) => k + 1);
  }

  function fechar() {
    setAberto(false);
    if (recebido) router.refresh();
  }

  const semCaixaEmDinheiro = !caixaAberto && forma === "DINHEIRO";
  const parcial = valor > 0 && valor < saldo;
  const acimaDoSaldo = valor > saldo;

  const temMaquininhas = maquininhas.length > 0;
  const formaCartao = forma === "DEBITO" || forma === "CREDITO";
  const mostrarMaquininha = temMaquininhas && (formaCartao || (forma === "PIX" && pixNaMaquininha));
  const maquininhaSelecionada = mostrarMaquininha ? (maquininhas.find((m) => m.id === maquininhaId) ?? null) : null;
  const faltaMaquininha = formaCartao && temMaquininhas && !maquininhaSelecionada;
  const taxaPrevista = (() => {
    if (!maquininhaSelecionada || valor <= 0) return null;
    const { taxaPercentual, taxaFixa } = taxaDaMaquininha(maquininhaSelecionada, forma, 1);
    const taxaValor = calcularTaxa(valor, taxaPercentual, taxaFixa);
    return taxaValor > 0 ? { taxaPercentual, taxaValor } : null;
  })();
  const tituloBotao = saldo < 0 ? "Cliente com crédito: nada a receber" : saldo === 0 ? "Cliente sem saldo devedor" : undefined;

  return (
    <>
      <Botao variante={variante} onClick={abrir} disabled={saldo <= 0} title={tituloBotao}>
        <HandCoins className="size-4" aria-hidden />
        Receber pagamento
      </Botao>

      <Dialogo
        aberto={aberto}
        aoFechar={fechar}
        titulo={recebido ? "Pagamento recebido" : "Receber pagamento de fiado"}
        descricao={recebido ? undefined : `${clienteNome} deve ${formatarReais(saldo)}.`}
        largura="md"
      >
        {recebido ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-padrao bg-sucesso-suave px-4 py-3 text-sucesso">
              <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">
                  {formatarReais(recebido.valor)} recebido em {ROTULO_FORMA_PAGAMENTO[recebido.forma].toLowerCase()}
                  {recebido.maquininhaNome ? ` pela ${recebido.maquininhaNome}` : ""}.
                </p>
                <p className="mt-0.5 text-sm">
                  {recebido.saldoNovo > 0
                    ? `Ainda falta ${formatarReais(recebido.saldoNovo)}.`
                    : "O cliente está com o fiado quitado."}
                </p>
              </div>
            </div>
            {recebido.taxaValor > 0 ? (
              <Aviso tom="info" titulo={`Taxa de ${formatarReais(recebido.taxaValor)} lançada em despesas`}>
                A venda fiado não tinha taxa; a taxa deste recebimento foi registrada em Financeiro, categoria Taxas de cartão, pra entrar no lucro real. Não saiu do caixa.
              </Aviso>
            ) : null}
            {recebido.forma === "DINHEIRO" && !recebido.entrouNoCaixa ? (
              <Aviso tom="alerta" titulo="Dinheiro fora do caixa">
                Não havia caixa aberto, então esse valor não entra no fechamento do caixa de hoje. Guarde o dinheiro separado.
              </Aviso>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Botao variante="fantasma" onClick={fechar}>
                Fechar
              </Botao>
              <Link
                href={`/clientes/${clienteId}/recibo/${recebido.lancamentoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-padrao bg-primaria px-4 text-sm font-medium text-primaria-texto shadow-sm hover:bg-primaria-forte"
              >
                <Printer className="size-4" aria-hidden />
                Imprimir comprovante
              </Link>
            </div>
          </div>
        ) : (
          <FormularioAcao
            key={chaveForm}
            acao={receberPagamento}
            aoSucesso={(d) => setRecebido({ ...d, valor, forma })}
            className="flex flex-col gap-4"
          >
            {(_estado, pendente) => (
              <>
                <input type="hidden" name="clienteId" value={clienteId} />
                <input type="hidden" name="maquininhaId" value={maquininhaSelecionada ? maquininhaSelecionada.id : ""} />
                <Campo
                  rotulo="Valor recebido"
                  htmlFor="valor"
                  obrigatorio
                  ajuda={parcial ? `Pagamento parcial. Vai restar ${formatarReais(saldo - valor)}.` : "Pode receber só uma parte."}
                  erro={acimaDoSaldo ? `O valor não pode passar do saldo devedor (${formatarReais(saldo)}).` : undefined}
                >
                  <EntradaMoeda key={chaveValor} id="valor" name="valor" valorInicial={valor} aoMudar={setValor} className="h-12 text-right text-lg tabular" autoFocus />
                </Campo>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo rotulo="Como o cliente pagou" htmlFor="forma" obrigatorio>
                    <Selecao id="forma" name="forma" value={forma} onChange={(e) => setForma(e.target.value as Forma)}>
                      {FORMAS.map((f) => (
                        <option key={f} value={f}>
                          {ROTULO_FORMA_PAGAMENTO[f]}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <div className="flex items-end">
                    <Botao type="button" variante="contorno" className="w-full" onClick={quitarTudo} disabled={valor === saldo}>
                      Quitar tudo ({formatarReais(saldo)})
                    </Botao>
                  </div>
                </div>

                {forma === "PIX" && temMaquininhas ? (
                  <CaixaSelecao
                    rotulo="O Pix passou na maquininha (QR da maquininha, com a taxa dela)"
                    checked={pixNaMaquininha}
                    disabled={pendente}
                    onChange={(e) => setPixNaMaquininha(e.target.checked)}
                  />
                ) : null}

                {mostrarMaquininha ? (
                  <div className="grid gap-4 rounded-padrao border border-borda bg-fundo p-3 sm:grid-cols-2">
                    <Campo
                      rotulo={formaCartao ? "Em qual maquininha o cartão passou?" : "Em qual maquininha o Pix passou?"}
                      htmlFor="maquininha-recebimento"
                      obrigatorio={formaCartao}
                      erro={faltaMaquininha ? "Escolha a maquininha." : undefined}
                      ajuda={
                        taxaPrevista
                          ? `Taxa de ${formatarPercentual(taxaPrevista.taxaPercentual)} = ${formatarReais(taxaPrevista.taxaValor)}, lançada em despesas. Entra ${formatarReais(valor - taxaPrevista.taxaValor)}.`
                          : maquininhaSelecionada
                            ? "Sem taxa nessa maquininha pra essa forma."
                            : undefined
                      }
                    >
                      <Selecao
                        id="maquininha-recebimento"
                        value={maquininhaSelecionada ? String(maquininhaSelecionada.id) : ""}
                        onChange={(e) => setMaquininhaId(e.target.value ? Number(e.target.value) : null)}
                        disabled={pendente}
                      >
                        {!maquininhaSelecionada ? <option value="">Escolha...</option> : null}
                        {maquininhas.map((m) => {
                          const { taxaPercentual } = taxaDaMaquininha(m, forma, 1);
                          return (
                            <option key={m.id} value={m.id}>
                              {m.nome} · taxa {formatarPercentual(taxaPercentual)}
                              {m.padrao ? " · padrão" : ""}
                            </option>
                          );
                        })}
                      </Selecao>
                    </Campo>
                    <Campo rotulo="NSU / Doc (opcional)" htmlFor="nsu-recebimento" ajuda="Do comprovante, pra conferir com o extrato da maquininha.">
                      <Entrada
                        id="nsu-recebimento"
                        name="nsu"
                        value={nsu}
                        onChange={(e) => setNsu(e.target.value)}
                        maxLength={40}
                        autoComplete="off"
                        inputMode="numeric"
                        placeholder="Do comprovante"
                        disabled={pendente}
                        className="tabular"
                      />
                    </Campo>
                  </div>
                ) : null}

                <Campo rotulo="Observação" htmlFor="observacao">
                  <AreaTexto id="observacao" name="observacao" placeholder="Opcional. Ex.: pagou com o filho, combinou o resto pra sexta..." className="min-h-16" maxLength={500} />
                </Campo>

                {semCaixaEmDinheiro ? (
                  <Aviso tom="alerta" titulo="Não há caixa aberto">
                    O dinheiro recebido agora não vai entrar no fechamento do caixa de hoje. Você pode receber mesmo assim, mas guarde o valor separado ou abra o caixa antes.
                  </Aviso>
                ) : null}

                <div className="flex justify-end gap-2 border-t border-borda pt-4">
                  <Botao type="button" variante="fantasma" onClick={fechar} disabled={pendente}>
                    Cancelar
                  </Botao>
                  <BotaoEnviar disabled={valor <= 0 || acimaDoSaldo || faltaMaquininha}>
                    <HandCoins className="size-4" aria-hidden />
                    Confirmar recebimento
                  </BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        )}
      </Dialogo>
    </>
  );
}
