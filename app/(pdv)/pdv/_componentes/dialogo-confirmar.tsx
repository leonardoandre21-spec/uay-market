"use client";

import { useRef } from "react";
import { Botao } from "@/components/ui/botao";
import { Dialogo } from "@/components/ui/dialogo";
import { useFocoAoAbrir } from "./util";

/**
 * Confirmação simples. Esc cancela. O foco inicial fica no botão de confirmar,
 * exceto quando a ação é destrutiva (`perigo`): aí fica em "Voltar", pra um
 * Enter acidental (o sufixo que o leitor de código de barras manda) não apagar
 * o carrinho inteiro. Confirmar exige clique ou Tab + Enter.
 */
export function DialogoConfirmar({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  perigo,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  perigo?: boolean;
  aoConfirmar: () => void;
  aoFechar: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const voltarRef = useRef<HTMLButtonElement>(null);
  useFocoAoAbrir(perigo ? voltarRef : ref, aberto);
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      largura="sm"
      rodape={
        <>
          <Botao ref={voltarRef} variante="contorno" tamanho="lg" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao ref={ref} variante={perigo ? "perigo" : "primaria"} tamanho="lg" onClick={aoConfirmar}>
            {rotuloConfirmar}
          </Botao>
        </>
      }
    >
      <p className="text-sm text-texto-suave">{descricao}</p>
    </Dialogo>
  );
}
