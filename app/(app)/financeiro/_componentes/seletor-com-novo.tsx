"use client";

import { useState } from "react";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import type { Opcao } from "./tipos";

const VALOR_NOVO = "__novo__";

/**
 * Seletor (categoria, fornecedor) com a opção "Cadastrar novo..." que abre um
 * campo de texto na mesma tela. Envia `name` (id ou vazio) e `nameNovo` (texto).
 */
export function SeletorComNovo({
  name,
  nameNovo,
  rotulo,
  opcoes,
  valorInicial,
  nomeInicial,
  rotuloVazio = "Nenhum",
  rotuloNovo = "Cadastrar novo...",
  placeholderNovo = "Nome",
  obrigatorio = false,
  erro,
  ajuda,
}: {
  name: string;
  nameNovo: string;
  rotulo: string;
  opcoes: Opcao[];
  valorInicial?: number | null;
  /** Nome do item inicial, usado quando ele não está mais na lista (ex.: fornecedor inativo). */
  nomeInicial?: string | null;
  rotuloVazio?: string;
  rotuloNovo?: string;
  placeholderNovo?: string;
  obrigatorio?: boolean;
  erro?: string;
  ajuda?: string;
}) {
  const [valor, setValor] = useState<string>(valorInicial ? String(valorInicial) : "");
  const criandoNovo = valor === VALOR_NOVO;
  const id = `sel-${name}`;
  const opcoesVisiveis =
    valorInicial && nomeInicial && !opcoes.some((o) => o.id === valorInicial)
      ? [...opcoes, { id: valorInicial, nome: `${nomeInicial} (inativo)` }]
      : opcoes;

  return (
    <Campo rotulo={rotulo} htmlFor={id} obrigatorio={obrigatorio} erro={erro} ajuda={criandoNovo ? undefined : ajuda}>
      <div className="flex flex-col gap-2">
        <Selecao
          id={id}
          name={criandoNovo ? undefined : name}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-invalid={erro ? true : undefined}
          required={obrigatorio && !criandoNovo}
        >
          <option value="">{obrigatorio ? "Escolha..." : rotuloVazio}</option>
          {opcoesVisiveis.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
          <option value={VALOR_NOVO}>{rotuloNovo}</option>
        </Selecao>
        {criandoNovo ? (
          <>
            <input type="hidden" name={name} value="" />
            <div className="flex items-center gap-2">
              <Entrada name={nameNovo} placeholder={placeholderNovo} autoFocus required maxLength={80} />
              <button
                type="button"
                onClick={() => setValor("")}
                className="shrink-0 text-xs text-texto-suave underline-offset-2 hover:underline"
              >
                Voltar
              </button>
            </div>
          </>
        ) : (
          <input type="hidden" name={nameNovo} value="" />
        )}
      </div>
    </Campo>
  );
}
