"use client";

import { useRef, useState } from "react";
import { Scale } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { formatarQuantidade, formatarReais, totalLinha } from "@/lib/dinheiro";
import { lerQuantidade, useFocoAoAbrir } from "./util";

/**
 * Pede a quantidade de um item: peso em kg pra produto por quilo
 * (ex.: 0,350) ou unidades inteiras. Enter confirma, Esc cancela.
 */
export function DialogoQuantidade({
  aberto,
  titulo,
  nomeProduto,
  unidade,
  precoUnitario,
  quantidadeInicial,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  titulo: string;
  nomeProduto: string;
  unidade: "UN" | "KG";
  precoUnitario: number;
  quantidadeInicial: number | null;
  aoConfirmar: (milesimos: number) => void;
  aoFechar: () => void;
}) {
  const [texto, setTexto] = useState(
    quantidadeInicial !== null && quantidadeInicial > 0 ? formatarQuantidade(quantidadeInicial, unidade) : "",
  );
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useFocoAoAbrir(ref, aberto);

  const quantidade = lerQuantidade(texto, unidade);
  const previa = quantidade !== null ? totalLinha(quantidade, precoUnitario) : null;

  function confirmar(e?: React.FormEvent) {
    e?.preventDefault();
    if (quantidade === null) {
      setErro(unidade === "KG" ? "Informe o peso em kg, por exemplo 0,350." : "Informe um número inteiro de unidades.");
      ref.current?.focus();
      return;
    }
    aoConfirmar(quantidade);
  }

  return (
    <Dialogo aberto={aberto} aoFechar={aoFechar} titulo={titulo} largura="sm">
      <form onSubmit={confirmar} className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-padrao bg-superficie-2 px-3 py-2.5">
          {unidade === "KG" ? <Scale className="size-5 shrink-0 text-primaria" aria-hidden /> : null}
          <div className="min-w-0">
            <p className="truncate font-medium text-texto">{nomeProduto}</p>
            <p className="text-xs text-texto-suave">
              {formatarReais(precoUnitario)} {unidade === "KG" ? "por quilo" : "por unidade"}
            </p>
          </div>
        </div>
        <Campo
          rotulo={unidade === "KG" ? "Peso (kg)" : "Quantidade"}
          htmlFor="quantidade-dialogo"
          erro={erro ?? undefined}
          ajuda={unidade === "KG" ? "Use vírgula pra decimais: 0,350 = 350 gramas." : "Só números inteiros."}
        >
          <Entrada
            ref={ref}
            id="quantidade-dialogo"
            value={texto}
            inputMode={unidade === "KG" ? "decimal" : "numeric"}
            autoComplete="off"
            tamanho="lg"
            className="text-center text-3xl font-semibold tabular"
            placeholder={unidade === "KG" ? "0,000" : "1"}
            onChange={(e) => {
              setTexto(e.target.value.replace(/[^\d,.]/g, ""));
              setErro(null);
            }}
            onKeyDown={(e) => {
              // Confirma no Enter sem depender da submissão implícita do form.
              if (e.key === "Enter") {
                e.preventDefault();
                confirmar();
              }
            }}
          />
        </Campo>
        <div className="flex items-center justify-between rounded-padrao border border-borda px-3 py-2 text-sm">
          <span className="text-texto-suave">Total do item</span>
          <span className="text-lg font-semibold tabular text-texto">{previa !== null ? formatarReais(previa) : "-"}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="contorno" tamanho="lg" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" tamanho="lg">
            Confirmar
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}
