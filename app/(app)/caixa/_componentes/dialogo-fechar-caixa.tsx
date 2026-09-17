"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Dialogo } from "@/components/ui/dialogo";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { Aviso } from "@/components/ui/aviso";
import { formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import { calcularDiferenca, descreverDiferenca, tomDiferenca } from "@/lib/servicos/caixa-calculos";
import { fecharCaixa } from "@/app/(app)/caixa/actions";

const COR_TEXTO = { sucesso: "text-sucesso", alerta: "text-alerta", perigo: "text-perigo" } as const;

/**
 * Diálogo de fechamento: mostra o esperado, recebe o contado e calcula a
 * diferença ao vivo. Observação vira obrigatória quando não bate.
 */
export function DialogoFecharCaixa({
  aberto,
  aoFechar,
  sessaoId,
  dinheiroEsperado,
  resumo,
}: {
  aberto: boolean;
  aoFechar: () => void;
  sessaoId: number;
  dinheiroEsperado: number;
  resumo: { vendasQuantidade: number; vendasTotal: number; sangrias: number; suprimentos: number };
}) {
  const router = useRouter();
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Fechar caixa"
      descricao="Conte o dinheiro da gaveta e informe o total. O sistema compara com o que era esperado."
    >
      {aberto ? (
        <ConteudoFechar
          sessaoId={sessaoId}
          dinheiroEsperado={dinheiroEsperado}
          resumo={resumo}
          aoCancelar={aoFechar}
          aoConcluir={(id) => {
            aoFechar();
            router.push(`/caixa/${id}?fechado=1`);
          }}
        />
      ) : (
        <div className="h-4" aria-hidden />
      )}
    </Dialogo>
  );
}

function ConteudoFechar({
  sessaoId,
  dinheiroEsperado,
  resumo,
  aoCancelar,
  aoConcluir,
}: {
  sessaoId: number;
  dinheiroEsperado: number;
  resumo: { vendasQuantidade: number; vendasTotal: number; sangrias: number; suprimentos: number };
  aoCancelar: () => void;
  aoConcluir: (sessaoId: number) => void;
}) {
  const [contado, setContado] = useState<number | null>(null);
  const diferenca = contado === null ? null : calcularDiferenca(contado, dinheiroEsperado);
  const precisaJustificar = diferenca !== null && diferenca !== 0;
  const tom = diferenca === null ? null : tomDiferenca(diferenca);

  return (
    <FormularioAcao
      acao={fecharCaixa}
      mensagemSucesso="Caixa fechado."
      aoSucesso={(dados) => aoConcluir(dados.sessaoId)}
    >
      {(estado) => (
        <div className="flex flex-col gap-4">
          <input type="hidden" name="sessaoId" value={sessaoId} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-padrao border border-borda bg-superficie-2 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Dinheiro esperado na gaveta</p>
              <p className="mt-1 text-2xl font-semibold tabular text-texto">{formatarReais(dinheiroEsperado)}</p>
            </div>
            <div className="rounded-padrao border border-borda px-4 py-3 text-sm">
              <dl className="grid grid-cols-2 gap-y-1">
                <dt className="text-texto-suave">Vendas</dt>
                <dd className="text-right tabular">
                  {resumo.vendasQuantidade} · {formatarReais(resumo.vendasTotal)}
                </dd>
                <dt className="text-texto-suave">Sangrias</dt>
                <dd className="text-right tabular">{formatarReais(resumo.sangrias)}</dd>
                <dt className="text-texto-suave">Suprimentos</dt>
                <dd className="text-right tabular">{formatarReais(resumo.suprimentos)}</dd>
              </dl>
            </div>
          </div>

          <Campo
            rotulo="Quanto tem na gaveta? (dinheiro contado)"
            htmlFor="valorContado"
            obrigatorio
            erro={erroCampo(estado, "valorContado")}
            ajuda="Conte notas e moedas. Digite 0 se a gaveta estiver vazia."
          >
            <EntradaMoeda id="valorContado" name="valorContado" className="h-12 text-right text-lg tabular" autoFocus required aoMudar={setContado} />
          </Campo>

          <div
            className={cn(
              "flex items-center justify-between rounded-padrao border px-4 py-3",
              tom === "sucesso" && "border-sucesso/30 bg-sucesso-suave",
              tom === "alerta" && "border-alerta/30 bg-alerta-suave",
              tom === "perigo" && "border-perigo/30 bg-perigo-suave",
              tom === null && "border-dashed border-borda",
            )}
            aria-live="polite"
          >
            <span className="text-sm font-medium text-texto-suave">Diferença (contado − esperado)</span>
            {diferenca === null ? (
              <span className="text-sm text-texto-fraco">Digite o valor contado</span>
            ) : (
              <span className="flex items-center gap-2">
                <Selo tom={tom ?? "neutro"}>{descreverDiferenca(diferenca)}</Selo>
                <strong className={cn("text-lg font-semibold tabular", tom ? COR_TEXTO[tom] : "")}>
                  {diferenca > 0 ? "+" : ""}
                  {formatarReais(diferenca)}
                </strong>
              </span>
            )}
          </div>

          {precisaJustificar ? (
            <Aviso tom={tom === "perigo" ? "perigo" : "alerta"}>
              O valor contado não bate com o esperado. Explique o motivo na observação antes de fechar.
            </Aviso>
          ) : null}

          <Campo
            rotulo={precisaJustificar ? "Observação (obrigatória quando há diferença)" : "Observação (opcional)"}
            htmlFor="observacao-fechamento"
            obrigatorio={precisaJustificar}
            erro={erroCampo(estado, "observacao")}
          >
            <AreaTexto
              id="observacao-fechamento"
              name="observacao"
              required={precisaJustificar}
              maxLength={500}
              placeholder={
                precisaJustificar
                  ? "Ex.: troco dado errado na venda 123; nota de 50 rasgada trocada no banco."
                  : "Ex.: gaveta conferida junto com o gerente."
              }
            />
          </Campo>

          <div className="mt-1 flex justify-end gap-2">
            <Botao type="button" variante="fantasma" onClick={aoCancelar}>
              Voltar
            </Botao>
            <BotaoEnviar variante="primaria" tamanho="lg">
              <LockKeyhole className="size-4" aria-hidden />
              Confirmar fechamento
            </BotaoEnviar>
          </div>
        </div>
      )}
    </FormularioAcao>
  );
}
