"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { History, Search, SlidersHorizontal } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Entrada, Selecao } from "@/components/ui/campo";
import { Selo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr, LinhaVazia } from "@/components/ui/tabela";
import { formatarQuantidade, formatarReais } from "@/lib/dinheiro";
import { cn, normalizarTexto } from "@/lib/utils";
import type { ProdutoEstoque } from "@/lib/servicos/estoque";
import { DialogoAjuste } from "./dialogo-ajuste";
import type { ProdutoResumo } from "./tipos";

export type FiltroEstoque = "TODOS" | "ABAIXO_MINIMO" | "ZERADOS" | "NEGATIVOS" | "REPOR" | "VALIDADE";

const ROTULO_FILTRO: Record<FiltroEstoque, string> = {
  TODOS: "Todos os produtos",
  REPOR: "Precisa repor (abaixo do mínimo, zerados e negativos)",
  ABAIXO_MINIMO: "Abaixo do mínimo",
  ZERADOS: "Zerados",
  NEGATIVOS: "Negativos",
  VALIDADE: "Controlam validade",
};

const LIMITE_LINHAS = 300;

export function TabelaEstoque({
  produtos,
  categorias,
  filtroInicial = "TODOS",
}: {
  produtos: ProdutoEstoque[];
  categorias: Array<{ id: number; nome: string }>;
  filtroInicial?: FiltroEstoque;
}) {
  const [busca, setBusca] = useState("");
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [filtro, setFiltro] = useState<FiltroEstoque>(filtroInicial);
  const [ajustando, setAjustando] = useState<ProdutoResumo | null>(null);

  const filtrados = useMemo(() => {
    const termo = normalizarTexto(busca);
    return produtos.filter((p) => {
      if (categoriaId && String(p.categoriaId ?? "") !== categoriaId) return false;
      switch (filtro) {
        case "ABAIXO_MINIMO":
          if (p.situacao !== "ABAIXO_MINIMO") return false;
          break;
        case "ZERADOS":
          if (p.situacao !== "ZERADO") return false;
          break;
        case "NEGATIVOS":
          if (p.situacao !== "NEGATIVO") return false;
          break;
        case "REPOR":
          if (p.situacao === "OK") return false;
          break;
        case "VALIDADE":
          if (!p.controlaValidade) return false;
          break;
      }
      if (!termo) return true;
      return (
        normalizarTexto(p.nome).includes(termo) ||
        (p.codigoBarras ?? "").includes(termo) ||
        normalizarTexto(p.codigoInterno ?? "").includes(termo)
      );
    });
  }, [produtos, busca, categoriaId, filtro]);

  const totais = useMemo(
    () => ({
      valorCusto: filtrados.reduce((acc, p) => acc + p.valorCusto, 0),
      valorVenda: filtrados.reduce((acc, p) => acc + p.valorVenda, 0),
    }),
    [filtrados],
  );

  const visiveis = filtrados.slice(0, LIMITE_LINHAS);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
          <Entrada
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou código"
            aria-label="Buscar produto"
            className="pl-9"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative">
            <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
            <Selecao value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroEstoque)} aria-label="Filtrar situação" className="pl-9 md:w-72">
              {(Object.keys(ROTULO_FILTRO) as FiltroEstoque[]).map((f) => (
                <option key={f} value={f}>
                  {ROTULO_FILTRO[f]}
                </option>
              ))}
            </Selecao>
          </div>
          <Selecao value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} aria-label="Filtrar categoria" className="md:w-52">
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        </div>
      </div>

      <Tabela>
        <Thead>
          <Tr>
            <Th>Produto</Th>
            <Th>Categoria</Th>
            <Th numerico>Estoque</Th>
            <Th numerico>Mínimo</Th>
            <Th numerico>Custo unit.</Th>
            <Th numerico>Valor em estoque</Th>
            <Th numerico>Preço de venda</Th>
            <Th className="text-right">Ações</Th>
          </Tr>
        </Thead>
        <Tbody>
          {visiveis.length === 0 ? (
            <LinhaVazia colunas={8} mensagem={produtos.length === 0 ? "Nenhum produto ativo cadastrado." : "Nenhum produto com esses filtros."} />
          ) : (
            visiveis.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <p className="font-medium text-texto">{p.nome}</p>
                  <p className="text-xs text-texto-fraco">
                    {[p.codigoBarras ?? p.codigoInterno, p.controlaValidade ? "controla validade" : null].filter(Boolean).join(" · ") || "Sem código"}
                  </p>
                </Td>
                <Td className="text-texto-suave">{p.categoriaNome ?? <span className="text-texto-fraco">Sem categoria</span>}</Td>
                <Td numerico>
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn("font-medium", p.estoque < 0 && "text-perigo")}>
                      {formatarQuantidade(p.estoque, p.unidade)} <span className="text-xs text-texto-fraco">{p.unidade === "KG" ? "kg" : "un"}</span>
                    </span>
                    <SeloSituacao situacao={p.situacao} />
                  </div>
                </Td>
                <Td numerico className="text-texto-suave">
                  {p.estoqueMinimo > 0 ? formatarQuantidade(p.estoqueMinimo, p.unidade) : <span className="text-texto-fraco">–</span>}
                </Td>
                <Td numerico>{formatarReais(p.precoCusto)}</Td>
                <Td numerico className="font-medium">{formatarReais(p.valorCusto)}</Td>
                <Td numerico className="text-texto-suave">{formatarReais(p.precoVenda)}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Botao
                      variante="contorno"
                      tamanho="sm"
                      onClick={() =>
                        setAjustando({
                          id: p.id,
                          nome: p.nome,
                          codigoBarras: p.codigoBarras,
                          codigoInterno: p.codigoInterno,
                          unidade: p.unidade,
                          categoriaNome: p.categoriaNome,
                          precoCusto: p.precoCusto,
                          precoVenda: p.precoVenda,
                          estoque: p.estoque,
                          controlaValidade: p.controlaValidade,
                        })
                      }
                    >
                      Ajustar
                    </Botao>
                    <Link
                      href={`/estoque/movimentos/${p.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-padrao px-3 text-sm text-texto-suave hover:bg-superficie-2 hover:text-texto"
                    >
                      <History className="size-4" aria-hidden /> Extrato
                    </Link>
                  </div>
                </Td>
              </Tr>
            ))
          )}
        </Tbody>
      </Tabela>

      <div className="flex flex-col gap-1 text-sm text-texto-suave sm:flex-row sm:items-center sm:justify-between">
        <p>
          {filtrados.length === produtos.length
            ? `${produtos.length} produto(s).`
            : `${filtrados.length} de ${produtos.length} produto(s).`}
          {filtrados.length > LIMITE_LINHAS ? ` Mostrando os primeiros ${LIMITE_LINHAS}; refine a busca pra ver o resto.` : ""}
        </p>
        <p className="tabular">
          Valor a custo: <strong className="text-texto">{formatarReais(totais.valorCusto)}</strong>
          <span className="mx-2 text-texto-fraco">·</span>
          A preço de venda: <strong className="text-texto">{formatarReais(totais.valorVenda)}</strong>
        </p>
      </div>

      <DialogoAjuste produto={ajustando} aoFechar={() => setAjustando(null)} />
    </div>
  );
}

function SeloSituacao({ situacao }: { situacao: ProdutoEstoque["situacao"] }) {
  switch (situacao) {
    case "NEGATIVO":
      return <Selo tom="perigo">Negativo</Selo>;
    case "ZERADO":
      return <Selo tom="alerta">Zerado</Selo>;
    case "ABAIXO_MINIMO":
      return <Selo tom="alerta">Abaixo do mínimo</Selo>;
    default:
      return null;
  }
}
