"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Search, Tag, TrendingDown } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Entrada, Selecao } from "@/components/ui/campo";
import { EstadoVazio } from "@/components/ui/pagina";
import { Selo, type TomSelo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr, LinhaVazia } from "@/components/ui/tabela";
import { formatarQuantidade, formatarReais } from "@/lib/dinheiro";
import type { LoteVencimento } from "@/lib/servicos/estoque";
import { FAIXAS_VENCIMENTO, ROTULO_FAIXA_VENCIMENTO, type FaixaVencimento } from "@/lib/servicos/estoque-calculos";
import { cn, normalizarTexto } from "@/lib/utils";
import { DialogoPerda } from "./dialogo-perda";
import { DialogoPromocao, type AlvoPromocao } from "./dialogo-promocao";
import type { PerdaPreenchida } from "./tipos";

const TOM_FAIXA: Record<FaixaVencimento, TomSelo> = {
  VENCIDO: "perigo",
  ATE_7_DIAS: "alerta",
  DE_8_A_30_DIAS: "info",
  MAIS_DE_30_DIAS: "neutro",
};

export function TabelaVencimentos({
  lotes,
  faixaInicial = "",
  hoje,
  admin,
}: {
  lotes: LoteVencimento[];
  faixaInicial?: FaixaVencimento | "";
  hoje: string;
  admin: boolean;
}) {
  const [faixa, setFaixa] = useState<FaixaVencimento | "">(faixaInicial);
  const [busca, setBusca] = useState("");
  const [perda, setPerda] = useState<PerdaPreenchida | null>(null);
  const [promocao, setPromocao] = useState<AlvoPromocao | null>(null);

  const filtrados = useMemo(() => {
    const termo = normalizarTexto(busca);
    return lotes.filter((l) => {
      if (faixa && l.faixa !== faixa) return false;
      if (!termo) return true;
      return (
        normalizarTexto(l.produto.nome).includes(termo) ||
        (l.produto.codigoBarras ?? "").includes(termo) ||
        normalizarTexto(l.produto.codigoInterno ?? "").includes(termo) ||
        normalizarTexto(l.codigo ?? "").includes(termo)
      );
    });
  }, [lotes, faixa, busca]);

  const valorFiltrado = filtrados.reduce((acc, l) => acc + l.valorCusto, 0);

  if (lotes.length === 0) {
    return (
      <EstadoVazio
        icone={<CalendarClock />}
        titulo="Nenhum lote com validade em estoque"
        descricao="Os lotes aparecem aqui quando você dá entrada em produtos que controlam validade."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
          <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por produto, código ou nota" aria-label="Buscar lote" className="pl-9" />
        </div>
        <Selecao value={faixa} onChange={(e) => setFaixa(e.target.value as FaixaVencimento | "")} aria-label="Filtrar por faixa de vencimento" className="md:w-64">
          <option value="">Todas as faixas</option>
          {FAIXAS_VENCIMENTO.map((f) => (
            <option key={f} value={f}>
              {ROTULO_FAIXA_VENCIMENTO[f]}
            </option>
          ))}
        </Selecao>
      </div>

      <Tabela>
        <Thead>
          <Tr>
            <Th>Produto</Th>
            <Th>Lote</Th>
            <Th>Validade</Th>
            <Th>Dias restantes</Th>
            <Th numerico>Quantidade</Th>
            <Th numerico>Custo unit.</Th>
            <Th numerico>Valor a custo</Th>
            <Th className="text-right">Ações</Th>
          </Tr>
        </Thead>
        <Tbody>
          {filtrados.length === 0 ? (
            <LinhaVazia colunas={8} mensagem="Nenhum lote com esses filtros." />
          ) : (
            filtrados.map((l) => {
              const un = l.produto.unidade === "KG" ? "kg" : "un";
              return (
                <Tr key={l.id} className={cn(l.faixa === "VENCIDO" && "bg-perigo-suave/30")}>
                  <Td>
                    <Link href={`/estoque/movimentos/${l.produto.id}`} className="font-medium text-texto hover:text-primaria hover:underline">
                      {l.produto.nome}
                    </Link>
                    <p className="text-xs text-texto-fraco">
                      {[l.produto.codigoBarras ?? l.produto.codigoInterno, l.produto.categoriaNome].filter(Boolean).join(" · ") || "Sem código"}
                    </p>
                    {l.produto.emPromocao && l.produto.precoPromocional ? (
                      <Selo tom="primaria" className="mt-1">
                        <Tag className="size-3" aria-hidden /> Promoção {formatarReais(l.produto.precoPromocional)}{" "}
                        {l.produto.promocaoAte ? `até ${l.produto.promocaoAte}` : "sem data pra acabar"}
                      </Selo>
                    ) : null}
                  </Td>
                  <Td className="text-texto-suave">
                    {l.entradaId && admin ? (
                      <Link href={`/estoque/entradas/${l.entradaId}`} className="hover:text-primaria hover:underline">
                        Entrada nº {l.entradaId}
                      </Link>
                    ) : l.entradaId ? (
                      <span>Entrada nº {l.entradaId}</span>
                    ) : (
                      <span className="text-texto-fraco">Sem entrada</span>
                    )}
                    {l.codigo ? <p className="text-xs text-texto-fraco">Nota {l.codigo}</p> : null}
                  </Td>
                  <Td className="whitespace-nowrap">{l.validade}</Td>
                  <Td>
                    <Selo tom={TOM_FAIXA[l.faixa]}>
                      {l.diasRestantes < 0
                        ? `Vencido há ${Math.abs(l.diasRestantes)} dia(s)`
                        : l.diasRestantes === 0
                          ? "Vence hoje"
                          : `${l.diasRestantes} dia(s)`}
                    </Selo>
                  </Td>
                  <Td numerico>
                    {formatarQuantidade(l.quantidade, l.produto.unidade)} <span className="text-xs text-texto-fraco">{un}</span>
                  </Td>
                  <Td numerico className="text-texto-suave">{formatarReais(l.custoUnitario)}</Td>
                  <Td numerico className="font-medium">{formatarReais(l.valorCusto)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Botao
                        variante="contorno"
                        tamanho="sm"
                        onClick={() =>
                          setPerda({
                            produto: {
                              id: l.produto.id,
                              nome: l.produto.nome,
                              codigoBarras: l.produto.codigoBarras,
                              codigoInterno: l.produto.codigoInterno,
                              unidade: l.produto.unidade,
                              categoriaNome: l.produto.categoriaNome,
                              precoCusto: l.produto.precoCusto,
                              precoVenda: l.produto.precoVenda,
                              estoque: l.produto.estoque,
                              controlaValidade: l.produto.controlaValidade,
                            },
                            loteId: l.id,
                            quantidade: l.quantidade,
                            motivo: "VENCIDO",
                          })
                        }
                      >
                        <TrendingDown className="size-4" aria-hidden /> Registrar perda
                      </Botao>
                      <Botao
                        variante="fantasma"
                        tamanho="sm"
                        disabled={l.faixa === "VENCIDO"}
                        title={l.faixa === "VENCIDO" ? "Produto vencido não pode ir pra promoção." : undefined}
                        onClick={() =>
                          setPromocao({
                            produtoId: l.produto.id,
                            nome: l.produto.nome,
                            precoVenda: l.produto.precoVenda,
                            precoCusto: l.produto.precoCusto,
                            precoPromocional: l.produto.precoPromocional,
                            promocaoAte: l.produto.promocaoAte,
                            emPromocao: l.produto.emPromocao,
                            validadeInput: l.validadeInput,
                            validade: l.validade,
                            hoje,
                          })
                        }
                      >
                        <Tag className="size-4" aria-hidden /> Promoção
                      </Botao>
                    </div>
                  </Td>
                </Tr>
              );
            })
          )}
        </Tbody>
      </Tabela>

      <p className="text-sm text-texto-suave tabular">
        {filtrados.length === lotes.length ? `${lotes.length} lote(s)` : `${filtrados.length} de ${lotes.length} lote(s)`} · valor a custo{" "}
        <strong className="text-texto">{formatarReais(valorFiltrado)}</strong>
      </p>

      <DialogoPerda aberto={perda !== null} aoFechar={() => setPerda(null)} preenchido={perda} />
      <DialogoPromocao alvo={promocao} aoFechar={() => setPromocao(null)} />
    </div>
  );
}
