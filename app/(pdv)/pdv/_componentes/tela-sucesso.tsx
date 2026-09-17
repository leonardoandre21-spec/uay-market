"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Printer, ShoppingCart } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { formatarReais } from "@/lib/dinheiro";
import { Tecla } from "./util";
import type { VendaConcluida } from "./tipos";

/**
 * Tela pós-venda: troco enorme, número do cupom, imprimir e nova venda (Enter).
 * O foco fica num campo invisível: se o operador já bipa o primeiro produto do
 * próximo cliente aqui, o código não se perde no botão; a venda nova abre com ele.
 */
export function TelaSucesso({
  venda,
  aoNovaVenda,
  aoBipar,
}: {
  venda: VendaConcluida;
  aoNovaVenda: () => void;
  aoBipar: (codigo: string) => void;
}) {
  const leitorRef = useRef<HTMLInputElement>(null);
  const [lido, setLido] = useState("");

  const focarLeitor = () => window.setTimeout(() => leitorRef.current?.focus(), 30);

  useEffect(() => {
    const t = focarLeitor();
    return () => window.clearTimeout(t);
  }, []);

  function imprimir() {
    window.open(`/vendas/${venda.vendaId}/cupom?auto=1`, "_blank", "noopener,width=420,height=720");
    focarLeitor();
  }

  return (
    <div
      className="flex flex-1 items-center justify-center p-6"
      onMouseDown={(e) => {
        // Clique em área vazia não rouba o foco do leitor.
        const alvo = e.target as HTMLElement;
        if (!alvo.closest("input,button,a")) {
          e.preventDefault();
          leitorRef.current?.focus();
        }
      }}
    >
      <input
        ref={leitorRef}
        value={lido}
        onChange={(e) => setLido(e.target.value)}
        onKeyDown={(e) => {
          // Leitor USB digita o código e manda Enter (às vezes Tab). Enter sem código = nova venda.
          if (e.key !== "Enter" && e.key !== "Tab") return;
          const codigo = lido.trim();
          if (!codigo && e.key === "Tab") return; // Tab sem código segue navegando pros botões
          e.preventDefault();
          e.stopPropagation();
          setLido("");
          if (codigo) aoBipar(codigo);
          else aoNovaVenda();
        }}
        autoComplete="off"
        spellCheck={false}
        aria-label="Bipe o próximo produto ou aperte Enter pra nova venda"
        className="sr-only"
      />
      <div className="w-full max-w-xl rounded-padrao border border-borda bg-superficie p-8 text-center shadow-padrao">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-sucesso-suave text-sucesso">
          <CheckCircle2 className="size-9" aria-hidden />
        </span>
        <h2 className="mt-4 text-2xl font-semibold text-texto">Venda registrada</h2>
        <p className="mt-1 text-sm text-texto-suave">
          Cupom nº <span className="font-semibold tabular text-texto">{venda.numero}</span> · total{" "}
          <span className="font-semibold tabular text-texto">{formatarReais(venda.total)}</span>
        </p>

        <div
          className={
            venda.troco > 0
              ? "mt-6 rounded-padrao bg-sucesso-suave px-6 py-6"
              : "mt-6 rounded-padrao bg-superficie-2 px-6 py-6"
          }
        >
          <p className="text-xs font-medium uppercase tracking-wider text-texto-suave">Troco</p>
          <p
            className={
              venda.troco > 0
                ? "mt-1 text-7xl font-bold leading-none tabular text-sucesso"
                : "mt-1 text-5xl font-bold leading-none tabular text-texto-fraco"
            }
          >
            {formatarReais(venda.troco)}
          </p>
          {venda.troco === 0 ? <p className="mt-2 text-sm text-texto-fraco">Sem troco.</p> : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Botao variante="contorno" tamanho="xl" onClick={imprimir}>
            <Printer className="size-5" aria-hidden />
            Imprimir cupom
          </Botao>
          <Botao tamanho="xl" onClick={aoNovaVenda}>
            <ShoppingCart className="size-5" aria-hidden />
            Nova venda
            <Tecla className="ml-1 border-primaria-texto/40 bg-transparent text-primaria-texto">Enter</Tecla>
          </Botao>
        </div>
        <p className="mt-4 text-xs text-texto-fraco">Pode bipar o próximo produto direto daqui.</p>
      </div>
    </div>
  );
}
