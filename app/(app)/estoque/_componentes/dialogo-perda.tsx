"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import type { MotivoPerda } from "@prisma/client";
import { Dialogo } from "@/components/ui/dialogo";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, Campo, Entrada, Selecao } from "@/components/ui/campo";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Aviso } from "@/components/ui/aviso";
import { Selo } from "@/components/ui/selo";
import { formatarQuantidade, formatarQuantidadeComUnidade, formatarReais, parseQuantidade, totalLinha } from "@/lib/dinheiro";
import { MOTIVOS_PERDA, ROTULO_MOTIVO_PERDA } from "@/lib/rotulos";
import type { LoteDisponivel } from "@/lib/servicos/estoque";
import { quantidadeCompativelComUnidade } from "@/lib/servicos/estoque-calculos";
import { cn } from "@/lib/utils";
import { listarLotesProdutoAction, registrarPerdaAction } from "../actions";
import { BuscaProduto } from "./busca-produto";
import type { PerdaPreenchida, ProdutoResumo } from "./tipos";

/**
 * Diálogo de registro de perda. Serve tanto pra "Registrar perda" avulso
 * quanto pra "Registrar como perda" a partir de um lote na tela de vencimentos
 * (nesse caso vem pré-preenchido).
 */
export function DialogoPerda({
  aberto,
  aoFechar,
  preenchido = null,
}: {
  aberto: boolean;
  aoFechar: () => void;
  preenchido?: PerdaPreenchida | null;
}) {
  const [aberturas, setAberturas] = useState(0);
  const estavaAberto = useRef(false);
  useEffect(() => {
    if (aberto && !estavaAberto.current) setAberturas((n) => n + 1);
    estavaAberto.current = aberto;
  }, [aberto]);

  return (
    <Dialogo aberto={aberto} aoFechar={aoFechar} titulo="Registrar perda" descricao="Produto que estragou, quebrou, venceu ou sumiu. Sai do estoque e entra no cálculo do lucro." largura="md">
      {aberto ? <ConteudoPerda key={`${aberturas}-${preenchido?.produto.id ?? "novo"}-${preenchido?.loteId ?? ""}`} preenchido={preenchido} aoFechar={aoFechar} /> : null}
    </Dialogo>
  );
}

function ConteudoPerda({ preenchido, aoFechar }: { preenchido: PerdaPreenchida | null; aoFechar: () => void }) {
  const router = useRouter();
  const [produto, setProduto] = useState<ProdutoResumo | null>(preenchido?.produto ?? null);
  const [lotes, setLotes] = useState<LoteDisponivel[]>([]);
  const [carregandoLotes, setCarregandoLotes] = useState(false);
  const [loteId, setLoteId] = useState<string>(preenchido?.loteId ? String(preenchido.loteId) : "");
  const [quantidadeTexto, setQuantidadeTexto] = useState(
    preenchido ? formatarQuantidade(preenchido.quantidade, preenchido.produto.unidade) : "",
  );
  const [motivo, setMotivo] = useState<MotivoPerda>(preenchido?.motivo ?? "VENCIDO");

  useEffect(() => {
    if (!produto || !produto.controlaValidade) {
      setLotes([]);
      return;
    }
    let ativo = true;
    setCarregandoLotes(true);
    listarLotesProdutoAction(produto.id).then((r) => {
      if (!ativo) return;
      setCarregandoLotes(false);
      if (r.ok) setLotes(r.dados);
    });
    return () => {
      ativo = false;
    };
  }, [produto]);

  const lote = lotes.find((l) => String(l.id) === loteId) ?? null;
  const quantidade = parseQuantidade(quantidadeTexto);
  const custoUnitario = lote ? lote.custoUnitario : (produto?.precoCusto ?? 0);
  const valor = quantidade !== null ? totalLinha(quantidade, custoUnitario) : null;
  const unidade = produto?.unidade ?? "UN";
  const excedeLote = lote !== null && quantidade !== null && quantidade > lote.quantidade;
  const excedeEstoque = produto !== null && quantidade !== null && quantidade > produto.estoque;
  const fracaoInvalida = produto !== null && quantidade !== null && !quantidadeCompativelComUnidade(quantidade, produto.unidade);

  return (
    <FormularioAcao
      acao={registrarPerdaAction}
      mensagemSucesso="Perda registrada."
      aoSucesso={() => {
        router.refresh();
        aoFechar();
      }}
      className="flex flex-col gap-4"
    >
      {(estado, pendente) => (
        <>
          <input type="hidden" name="produtoId" value={produto?.id ?? ""} />
          <input type="hidden" name="loteId" value={loteId} />

          {produto ? (
            <div className="flex items-start justify-between gap-3 rounded-padrao border border-borda bg-superficie-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-texto">{produto.nome}</p>
                <p className="text-xs text-texto-suave">
                  Estoque atual {formatarQuantidadeComUnidade(produto.estoque, produto.unidade)} · custo médio {formatarReais(produto.precoCusto)}
                  {produto.controlaValidade ? " · controla validade" : ""}
                </p>
              </div>
              {!preenchido ? (
                <button
                  type="button"
                  onClick={() => {
                    setProduto(null);
                    setLoteId("");
                  }}
                  aria-label="Trocar produto"
                  className="rounded-md p-1 text-texto-fraco hover:bg-superficie hover:text-texto"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ) : (
            <Campo rotulo="Produto" obrigatorio erro={erroCampo(estado, "produtoId")}>
              <BuscaProduto
                autoFocus
                aoSelecionar={(p) => {
                  setProduto(p);
                  setLoteId("");
                }}
              />
            </Campo>
          )}

          {produto?.controlaValidade ? (
            <Campo rotulo="Lote" htmlFor="perda-lote" ajuda="Do que vence primeiro pro que vence depois. Sem lote, baixa só do estoque geral.">
              <div className="relative">
                <Selecao id="perda-lote" value={loteId} onChange={(e) => setLoteId(e.target.value)} disabled={carregandoLotes}>
                  <option value="">{carregandoLotes ? "Carregando lotes..." : lotes.length ? "Sem lote específico" : "Nenhum lote com saldo"}</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>
                      Validade {l.validade}
                      {l.diasRestantes < 0 ? " (vencido)" : l.diasRestantes === 0 ? " (vence hoje)" : ` (${l.diasRestantes} dias)`} · restam{" "}
                      {formatarQuantidade(l.quantidade, unidade)}
                      {l.codigo ? ` · nota ${l.codigo}` : ""}
                    </option>
                  ))}
                </Selecao>
                {carregandoLotes ? <Loader2 className="absolute right-8 top-1/2 size-4 -translate-y-1/2 animate-spin text-texto-fraco" aria-hidden /> : null}
              </div>
              {lote ? (
                <div className="mt-1 flex items-center gap-2 text-xs text-texto-suave">
                  <Selo tom={lote.diasRestantes < 0 ? "perigo" : lote.diasRestantes <= 7 ? "alerta" : "neutro"}>
                    {lote.diasRestantes < 0 ? `Vencido há ${Math.abs(lote.diasRestantes)} dia(s)` : `Vence em ${lote.diasRestantes} dia(s)`}
                  </Selo>
                  <span>Custo do lote {formatarReais(lote.custoUnitario)}</span>
                  <button
                    type="button"
                    className="ml-auto font-medium text-primaria hover:underline"
                    onClick={() => setQuantidadeTexto(formatarQuantidade(lote.quantidade, unidade))}
                  >
                    Usar todo o lote
                  </button>
                </div>
              ) : null}
            </Campo>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo={`Quantidade (${unidade === "KG" ? "kg" : "un"})`} htmlFor="perda-quantidade" obrigatorio erro={erroCampo(estado, "quantidade")}>
              <Entrada
                id="perda-quantidade"
                name="quantidade"
                inputMode={unidade === "KG" ? "decimal" : "numeric"}
                autoComplete="off"
                required
                tamanho="lg"
                className="text-right tabular"
                value={quantidadeTexto}
                onChange={(e) => setQuantidadeTexto(e.target.value)}
                disabled={!produto}
                aria-invalid={excedeLote || excedeEstoque || fracaoInvalida ? true : undefined}
              />
            </Campo>
            <Campo rotulo="Motivo" htmlFor="perda-motivo" obrigatorio erro={erroCampo(estado, "motivo")}>
              <Selecao id="perda-motivo" name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoPerda)} className="h-12 text-base">
                {MOTIVOS_PERDA.map((m) => (
                  <option key={m} value={m}>
                    {ROTULO_MOTIVO_PERDA[m]}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </div>

          {fracaoInvalida ? (
            <Aviso tom="alerta">Produto vendido por unidade: informe uma quantidade inteira, sem fração.</Aviso>
          ) : excedeLote ? (
            <Aviso tom="alerta">O lote escolhido tem só {formatarQuantidade(lote.quantidade, unidade)} restante(s).</Aviso>
          ) : excedeEstoque ? (
            <Aviso tom="alerta">Quantidade maior que o estoque atual ({formatarQuantidade(produto.estoque, unidade)}). Se o estoque está errado, faça um ajuste antes.</Aviso>
          ) : valor !== null && produto ? (
            <div className="flex items-center justify-between rounded-padrao bg-perigo-suave px-4 py-3 text-sm text-perigo">
              <span>Valor da perda (a custo)</span>
              <span className={cn("text-lg font-semibold tabular")}>{formatarReais(valor)}</span>
            </div>
          ) : null}

          <Campo rotulo="Observação" htmlFor="perda-observacao" erro={erroCampo(estado, "observacao")}>
            <AreaTexto id="perda-observacao" name="observacao" maxLength={300} placeholder="Opcional. Ex.: embalagem rasgada na prateleira de baixo." className="min-h-16" />
          </Campo>

          <div className="flex justify-end gap-2 pt-1">
            <Botao type="button" variante="fantasma" onClick={aoFechar} disabled={pendente}>
              Cancelar
            </Botao>
            <BotaoEnviar variante="perigo" disabled={!produto || quantidade === null || quantidade <= 0 || excedeLote || excedeEstoque || fracaoInvalida}>
              Registrar perda
            </BotaoEnviar>
          </div>
        </>
      )}
    </FormularioAcao>
  );
}
