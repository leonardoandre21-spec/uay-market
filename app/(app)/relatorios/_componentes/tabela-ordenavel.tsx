"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Selo, type TomSelo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { formatarPercentual, formatarQuantidade, formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

export type TipoColuna = "texto" | "reais" | "quantidade" | "percentual" | "inteiro" | "decimal" | "dias" | "selo";

export type ColunaOrdenavel = {
  chave: string;
  titulo: string;
  /** Como formatar a célula. Padrão: texto. */
  tipo?: TipoColuna;
  /** Alinha à direita. Padrão: true pros tipos numéricos. */
  numerico?: boolean;
  /** Pinta negativo em vermelho e positivo em verde. */
  sinal?: boolean;
  /** Pra tipo "selo": tom por valor bruto. */
  tonsSelo?: Record<string, TomSelo>;
  /** Troca o valor bruto por um rótulo legível (selo ou texto). */
  rotulos?: Record<string, string>;
  /** Texto exibido quando o valor é null/undefined. */
  vazio?: string;
  /** Dica no cabeçalho (title). */
  ajuda?: string;
  /** Destaque visual (negrito). */
  destaque?: boolean;
  className?: string;
};

export type ValorCelula = string | number | boolean | null | undefined;
export type LinhaOrdenavel = Record<string, ValorCelula>;

const TIPOS_NUMERICOS: TipoColuna[] = ["reais", "quantidade", "percentual", "inteiro", "decimal", "dias"];

function formatarCelula(coluna: ColunaOrdenavel, linha: LinhaOrdenavel): React.ReactNode {
  const valor = linha[coluna.chave];
  if (valor === null || valor === undefined || valor === "") {
    return <span className="text-texto-fraco">{coluna.vazio ?? "-"}</span>;
  }
  switch (coluna.tipo ?? "texto") {
    case "reais":
      return formatarReais(Number(valor));
    case "quantidade": {
      const unidade = linha.unidade === "KG" ? "KG" : "UN";
      return `${formatarQuantidade(Number(valor), unidade)} ${unidade === "KG" ? "kg" : "un"}`;
    }
    case "percentual":
      return formatarPercentual(Number(valor), 1);
    case "inteiro":
      return Number(valor).toLocaleString("pt-BR");
    case "decimal":
      return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "dias": {
      const n = Number(valor);
      return n === 1 ? "1 dia" : `${n.toLocaleString("pt-BR")} dias`;
    }
    case "selo": {
      const bruto = String(valor);
      return <Selo tom={coluna.tonsSelo?.[bruto] ?? "neutro"}>{coluna.rotulos?.[bruto] ?? bruto}</Selo>;
    }
    default:
      return coluna.rotulos?.[String(valor)] ?? String(valor);
  }
}

function comparar(a: ValorCelula, b: ValorCelula): number {
  const aVazio = a === null || a === undefined || a === "";
  const bVazio = b === null || b === undefined || b === "";
  if (aVazio && bVazio) return 0;
  if (aVazio) return 1;
  if (bVazio) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base", numeric: true });
}

/**
 * Tabela com ordenação clicável no cabeçalho, limite de linhas com botão
 * "mostrar todos" e linha de totais opcional. Recebe só dados serializáveis,
 * então pode ser montada direto por um Server Component.
 */
export function TabelaOrdenavel({
  colunas,
  linhas,
  chaveLinha,
  ordemInicial,
  limite = 50,
  numerar = false,
  totais,
  mensagemVazia = "Nenhum registro no período.",
  className,
}: {
  colunas: ColunaOrdenavel[];
  linhas: LinhaOrdenavel[];
  /** Nome do campo que identifica a linha (ex.: "produtoId"). */
  chaveLinha: string;
  ordemInicial: { chave: string; direcao: "asc" | "desc" };
  /** Quantas linhas mostrar antes do botão "Mostrar todos". 0 = sem limite. */
  limite?: number;
  /** Mostra coluna "#" com a posição na ordenação atual. */
  numerar?: boolean;
  /** Linha de rodapé com totais (mesmas chaves das colunas). */
  totais?: LinhaOrdenavel;
  mensagemVazia?: string;
  className?: string;
}) {
  const [ordem, setOrdem] = useState(ordemInicial);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const ordenadas = useMemo(() => {
    const copia = [...linhas];
    copia.sort((a, b) => {
      const r = comparar(a[ordem.chave], b[ordem.chave]);
      return ordem.direcao === "asc" ? r : -r;
    });
    return copia;
  }, [linhas, ordem]);

  // As linhas além do limite continuam no DOM escondidas, pra sair na impressão.
  const limiteAtivo = limite > 0 && !mostrarTodos && ordenadas.length > limite;
  const quantidadeVisivel = limiteAtivo ? limite : ordenadas.length;
  const ocultas = ordenadas.length - quantidadeVisivel;

  const alternar = (coluna: ColunaOrdenavel) => {
    const numerica = coluna.numerico ?? TIPOS_NUMERICOS.includes(coluna.tipo ?? "texto");
    setOrdem((atual) => {
      if (atual.chave === coluna.chave) return { chave: coluna.chave, direcao: atual.direcao === "asc" ? "desc" : "asc" };
      return { chave: coluna.chave, direcao: numerica ? "desc" : "asc" };
    });
  };

  const totalColunas = colunas.length + (numerar ? 1 : 0);

  return (
    <div className={className}>
      <Tabela>
        <Thead>
          <tr>
            {numerar ? <Th className="w-10">#</Th> : null}
            {colunas.map((c) => {
              const numerica = c.numerico ?? TIPOS_NUMERICOS.includes(c.tipo ?? "texto");
              const ativa = ordem.chave === c.chave;
              return (
                <Th key={c.chave} numerico={numerica} className={cn("p-0", c.className)} aria-sort={ativa ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"}>
                  <button
                    type="button"
                    onClick={() => alternar(c)}
                    title={c.ajuda}
                    className={cn(
                      "flex w-full items-center gap-1 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide transition-colors hover:text-texto",
                      numerica && "justify-end text-right",
                      ativa ? "text-texto" : "text-texto-suave",
                    )}
                  >
                    {c.titulo}
                    {ativa ? (
                      ordem.direcao === "asc" ? (
                        <ArrowUp className="size-3 shrink-0" aria-hidden />
                      ) : (
                        <ArrowDown className="size-3 shrink-0" aria-hidden />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 shrink-0 opacity-40" aria-hidden />
                    )}
                  </button>
                </Th>
              );
            })}
          </tr>
        </Thead>
        <Tbody>
          {ordenadas.length === 0 ? (
            <LinhaVazia colunas={totalColunas} mensagem={mensagemVazia} />
          ) : (
            ordenadas.map((linha, i) => (
              <Tr key={String(linha[chaveLinha] ?? i)} className={cn(limiteAtivo && i >= limite && "hidden print:table-row")}>
                {numerar ? <Td className="text-texto-fraco tabular">{i + 1}</Td> : null}
                {colunas.map((c) => {
                  const numerica = c.numerico ?? TIPOS_NUMERICOS.includes(c.tipo ?? "texto");
                  const valor = linha[c.chave];
                  const n = typeof valor === "number" ? valor : null;
                  return (
                    <Td
                      key={c.chave}
                      numerico={numerica}
                      className={cn(
                        c.destaque && "font-medium text-texto",
                        c.sinal && n !== null && n < 0 && "text-perigo",
                        c.sinal && n !== null && n > 0 && "text-sucesso",
                        c.className,
                      )}
                    >
                      {formatarCelula(c, linha)}
                    </Td>
                  );
                })}
              </Tr>
            ))
          )}
        </Tbody>
        {totais && ordenadas.length > 0 ? (
          <tfoot className="border-t border-borda bg-superficie-2 font-medium">
            <tr>
              {numerar ? <Td /> : null}
              {colunas.map((c) => {
                const numerica = c.numerico ?? TIPOS_NUMERICOS.includes(c.tipo ?? "texto");
                const valor = totais[c.chave];
                const n = typeof valor === "number" ? valor : null;
                return (
                  <Td
                    key={c.chave}
                    numerico={numerica}
                    className={cn(c.sinal && n !== null && n < 0 && "text-perigo", c.sinal && n !== null && n > 0 && "text-sucesso")}
                  >
                    {valor === undefined ? "" : formatarCelula(c, totais)}
                  </Td>
                );
              })}
            </tr>
          </tfoot>
        ) : null}
      </Tabela>
      {ocultas > 0 ? (
        <div className="nao-imprimir mt-3 flex items-center justify-between gap-3 text-sm text-texto-suave">
          <span>
            Mostrando {quantidadeVisivel} de {ordenadas.length}.
          </span>
          <Botao type="button" variante="fantasma" tamanho="sm" onClick={() => setMostrarTodos(true)}>
            Mostrar todos ({ordenadas.length})
          </Botao>
        </div>
      ) : null}
    </div>
  );
}
