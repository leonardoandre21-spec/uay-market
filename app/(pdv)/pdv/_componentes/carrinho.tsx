"use client";

import { useEffect, useRef, useState } from "react";
import { PackageOpen, Trash2 } from "lucide-react";
import { Entrada } from "@/components/ui/campo";
import { Selo } from "@/components/ui/selo";
import { formatarQuantidade, formatarQuantidadeComUnidade, formatarReais } from "@/lib/dinheiro";
import { totalItem } from "@/lib/servicos/vendas-calculos";
import { cn } from "@/lib/utils";
import { EntradaCentavos } from "./entrada-centavos";
import { lerQuantidade, Tecla } from "./util";
import type { ItemCarrinho } from "./tipos";

export function Carrinho({
  itens,
  selecionada,
  aoSelecionar,
  aoAlterarQuantidade,
  aoAlterarDesconto,
  aoRemover,
  aoConcluirEdicao,
  permitirDesconto,
  permitirVendaSemEstoque,
}: {
  itens: ItemCarrinho[];
  selecionada: string | null;
  aoSelecionar: (chave: string) => void;
  aoAlterarQuantidade: (chave: string, milesimos: number) => void;
  aoAlterarDesconto: (chave: string, centavos: number) => void;
  aoRemover: (chave: string) => void;
  aoConcluirEdicao: () => void;
  permitirDesconto: boolean;
  permitirVendaSemEstoque: boolean;
}) {
  const fimRef = useRef<HTMLDivElement>(null);
  const quantidadeAnterior = useRef(itens.length);

  // Rola pro final quando entra item novo (o operador quer ver o que acabou de bipar).
  useEffect(() => {
    if (itens.length > quantidadeAnterior.current) {
      fimRef.current?.scrollIntoView({ block: "nearest" });
    }
    quantidadeAnterior.current = itens.length;
  }, [itens.length]);

  if (itens.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-superficie-2 text-texto-fraco">
          <PackageOpen className="size-10" aria-hidden />
        </span>
        <p className="text-lg font-medium text-texto">Carrinho vazio</p>
        <p className="max-w-xs text-sm text-texto-suave">
          Passe o produto no leitor ou digite o código e aperte <Tecla>Enter</Tecla>. Também dá pra buscar pelo nome.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-suave">
          <tr>
            <th className="w-10 px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Produto</th>
            <th className="w-28 px-3 py-2 text-right font-medium">Qtd</th>
            <th className="w-28 px-3 py-2 text-right font-medium">Unitário</th>
            {permitirDesconto ? <th className="w-28 px-3 py-2 text-right font-medium">Desconto</th> : null}
            <th className="w-32 px-3 py-2 text-right font-medium">Total</th>
            <th className="w-12 px-2 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {itens.map((item, i) => (
            <LinhaItem
              key={item.chave}
              indice={i + 1}
              item={item}
              selecionada={item.chave === selecionada}
              aoSelecionar={() => aoSelecionar(item.chave)}
              aoAlterarQuantidade={(q) => aoAlterarQuantidade(item.chave, q)}
              aoAlterarDesconto={(d) => aoAlterarDesconto(item.chave, d)}
              aoRemover={() => aoRemover(item.chave)}
              aoConcluirEdicao={aoConcluirEdicao}
              permitirDesconto={permitirDesconto}
              permitirVendaSemEstoque={permitirVendaSemEstoque}
            />
          ))}
        </tbody>
      </table>
      <div ref={fimRef} />
    </div>
  );
}

function LinhaItem({
  indice,
  item,
  selecionada,
  aoSelecionar,
  aoAlterarQuantidade,
  aoAlterarDesconto,
  aoRemover,
  aoConcluirEdicao,
  permitirDesconto,
  permitirVendaSemEstoque,
}: {
  indice: number;
  item: ItemCarrinho;
  selecionada: boolean;
  aoSelecionar: () => void;
  aoAlterarQuantidade: (milesimos: number) => void;
  aoAlterarDesconto: (centavos: number) => void;
  aoRemover: () => void;
  aoConcluirEdicao: () => void;
  permitirDesconto: boolean;
  permitirVendaSemEstoque: boolean;
}) {
  const [textoQtd, setTextoQtd] = useState(formatarQuantidade(item.quantidade, item.unidade));
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!editando) setTextoQtd(formatarQuantidade(item.quantidade, item.unidade));
  }, [item.quantidade, item.unidade, editando]);

  const semEstoque = item.quantidade > item.estoque;
  const total = totalItem(item);

  function confirmarQuantidade() {
    const q = lerQuantidade(textoQtd, item.unidade);
    if (q !== null && q !== item.quantidade) aoAlterarQuantidade(q);
    else setTextoQtd(formatarQuantidade(item.quantidade, item.unidade));
    setEditando(false);
  }

  return (
    <tr
      onClick={aoSelecionar}
      aria-selected={selecionada}
      className={cn("cursor-default transition-colors", selecionada ? "bg-primaria-suave/70" : "hover:bg-superficie-2/60")}
    >
      <td className="px-3 py-2 text-texto-fraco tabular">{indice}</td>
      <td className="px-3 py-2">
        <p className="font-medium text-texto">{item.nome}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-texto-fraco">
          <span>{item.unidade === "KG" ? "por quilo" : "por unidade"}</span>
          {item.emPromocao ? (
            <Selo tom="alerta">
              promoção · de {formatarReais(item.precoVenda)}
            </Selo>
          ) : null}
          {semEstoque ? (
            <Selo tom={permitirVendaSemEstoque ? "alerta" : "perigo"}>
              estoque: {formatarQuantidadeComUnidade(Math.max(0, item.estoque), item.unidade)}
            </Selo>
          ) : null}
        </p>
      </td>
      <td className="px-3 py-2 text-right">
        <Entrada
          value={textoQtd}
          inputMode={item.unidade === "KG" ? "decimal" : "numeric"}
          aria-label={`Quantidade de ${item.nome}`}
          onFocus={(e) => {
            setEditando(true);
            e.target.select();
          }}
          onChange={(e) => setTextoQtd(e.target.value)}
          onBlur={confirmarQuantidade}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmarQuantidade();
              aoConcluirEdicao();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setTextoQtd(formatarQuantidade(item.quantidade, item.unidade));
              setEditando(false);
              aoConcluirEdicao();
            }
          }}
          className="h-9 w-24 text-right tabular"
        />
      </td>
      <td className="px-3 py-2 text-right tabular text-texto-suave">
        {formatarReais(item.precoUnitario)}
        {item.unidade === "KG" ? <span className="text-xs">/kg</span> : null}
      </td>
      {permitirDesconto ? (
        <td className="px-3 py-2 text-right">
          <EntradaCentavos
            valor={item.desconto}
            aoMudar={aoAlterarDesconto}
            tamanho="md"
            aria-label={`Desconto em ${item.nome}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                aoConcluirEdicao();
              }
            }}
            className="h-9 w-24"
          />
        </td>
      ) : null}
      <td className="px-3 py-2 text-right text-base font-semibold tabular text-texto">{formatarReais(total)}</td>
      <td className="px-2 py-2 text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            aoRemover();
          }}
          aria-label={`Remover ${item.nome}`}
          className="rounded-md p-2 text-texto-fraco hover:bg-perigo-suave hover:text-perigo"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </td>
    </tr>
  );
}
