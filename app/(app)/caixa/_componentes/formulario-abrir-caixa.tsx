"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Wallet } from "lucide-react";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { Botao } from "@/components/ui/botao";
import { formatarReais } from "@/lib/dinheiro";
import { abrirCaixa } from "@/app/(app)/caixa/actions";

/**
 * Formulário de abertura do caixa. O campo de valor já vem com foco pra o
 * operador só digitar o fundo de troco e apertar Enter.
 */
export function FormularioAbrirCaixa({
  sugestao,
}: {
  /** Valor contado no fechamento da última sessão (centavos) ou null se não houver. */
  sugestao: { valor: number; fechadoEm: string; fechadoPor: string | null } | null;
}) {
  const router = useRouter();
  // Trocar a chave remonta o EntradaMoeda com o valor sugerido.
  const [chave, setChave] = useState(0);
  const [valorInicial, setValorInicial] = useState<number | null>(null);

  function usarSugestao() {
    if (!sugestao) return;
    setValorInicial(sugestao.valor);
    setChave((c) => c + 1);
  }

  return (
    <FormularioAcao acao={abrirCaixa} mensagemSucesso="Caixa aberto. Boas vendas!" aoSucesso={() => router.push("/pdv")}>
      {(estado) => (
        <div className="flex flex-col gap-5">
          <Campo
            rotulo="Fundo de troco (dinheiro que já está na gaveta)"
            htmlFor="valorAbertura"
            obrigatorio
            erro={erroCampo(estado, "valorAbertura")}
            ajuda="Digite como numa calculadora: 15000 vira 150,00."
          >
            <EntradaMoeda
              key={chave}
              id="valorAbertura"
              name="valorAbertura"
              valorInicial={valorInicial}
              className="h-12 text-right text-lg tabular"
              autoFocus
              required
              aria-describedby={sugestao ? "sugestao-abertura" : undefined}
            />
          </Campo>

          {sugestao ? (
            <div
              id="sugestao-abertura"
              className="flex flex-wrap items-center justify-between gap-3 rounded-padrao bg-superficie-2 px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-2 text-texto-suave">
                <LockKeyhole className="size-4 shrink-0 text-texto-fraco" aria-hidden />
                <span>
                  Última sessão fechou com{" "}
                  <strong className="tabular text-texto">{formatarReais(sugestao.valor)}</strong> em dinheiro
                  {sugestao.fechadoPor ? ` (${sugestao.fechadoPor}, ${sugestao.fechadoEm})` : ` (${sugestao.fechadoEm})`}.
                </span>
              </div>
              <Botao type="button" variante="contorno" tamanho="sm" onClick={usarSugestao}>
                Usar esse valor
              </Botao>
            </div>
          ) : null}

          <Campo rotulo="Observação (opcional)" htmlFor="observacao" erro={erroCampo(estado, "observacao")}>
            <AreaTexto
              id="observacao"
              name="observacao"
              maxLength={500}
              placeholder="Ex.: troco conferido com o gerente; faltam moedas de 0,10."
            />
          </Campo>

          <BotaoEnviar tamanho="lg" variante="destaque" className="w-full sm:w-auto">
            <Wallet className="size-5" aria-hidden />
            Abrir caixa e ir para o PDV
          </BotaoEnviar>
        </div>
      )}
    </FormularioAcao>
  );
}
