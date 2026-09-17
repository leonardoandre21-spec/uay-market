"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ClipboardCheck } from "lucide-react";
import { Dialogo } from "@/components/ui/dialogo";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { Campo, Entrada } from "@/components/ui/campo";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Aviso } from "@/components/ui/aviso";
import { formatarQuantidade, formatarQuantidadeComUnidade, parseQuantidade } from "@/lib/dinheiro";
import { calcularAjuste, quantidadeCompativelComUnidade } from "@/lib/servicos/estoque-calculos";
import { cn } from "@/lib/utils";
import { ajustarEstoqueAction } from "../actions";
import type { ProdutoResumo } from "./tipos";

type Modo = "CONTAGEM" | "ADICIONAR" | "RETIRAR";

const MODOS: Array<{ valor: Modo; rotulo: string; descricao: string; Icone: typeof ClipboardCheck }> = [
  { valor: "CONTAGEM", rotulo: "Contagem", descricao: "Informe quanto tem na prateleira", Icone: ClipboardCheck },
  { valor: "ADICIONAR", rotulo: "Adicionar", descricao: "Somar ao estoque atual", Icone: ArrowUp },
  { valor: "RETIRAR", rotulo: "Retirar", descricao: "Tirar do estoque atual", Icone: ArrowDown },
];

const MOTIVOS_SUGERIDOS = [
  "Contagem de inventário",
  "Erro de lançamento",
  "Devolução de cliente",
  "Produto encontrado na loja",
  "Produto extraviado",
  "Correção de cadastro",
];

export function DialogoAjuste({ produto, aoFechar }: { produto: ProdutoResumo | null; aoFechar: () => void }) {
  return (
    <Dialogo
      aberto={produto !== null}
      aoFechar={aoFechar}
      titulo="Ajustar estoque"
      descricao={produto ? produto.nome : undefined}
      largura="md"
    >
      {produto ? <ConteudoAjuste key={produto.id} produto={produto} aoFechar={aoFechar} /> : null}
    </Dialogo>
  );
}

function ConteudoAjuste({ produto, aoFechar }: { produto: ProdutoResumo; aoFechar: () => void }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("CONTAGEM");
  const [quantidadeTexto, setQuantidadeTexto] = useState("");

  const quantidade = parseQuantidade(quantidadeTexto);
  const fracaoInvalida = quantidade !== null && !quantidadeCompativelComUnidade(quantidade, produto.unidade);
  const previa =
    quantidade !== null && !fracaoInvalida
      ? calcularAjuste(
          produto.estoque,
          modo === "CONTAGEM" ? { novaQuantidade: quantidade } : { diferenca: modo === "ADICIONAR" ? quantidade : -quantidade },
        )
      : null;
  const unidade = produto.unidade;
  const passo = unidade === "KG" ? "Ex.: 2,500" : "Ex.: 12 (produto por unidade, sem fração)";

  return (
    <FormularioAcao
      acao={ajustarEstoqueAction}
      mensagemSucesso="Estoque ajustado."
      aoSucesso={() => {
        router.refresh();
        aoFechar();
      }}
      className="flex flex-col gap-4"
    >
      {(estado, pendente) => (
        <>
          <input type="hidden" name="produtoId" value={produto.id} />
          <input type="hidden" name="modo" value={modo} />

          <div className="rounded-padrao bg-superficie-2 px-4 py-3 text-sm">
            <p className="text-texto-suave">Estoque atual</p>
            <p className={cn("text-xl font-semibold tabular", produto.estoque < 0 ? "text-perigo" : "text-texto")}>
              {formatarQuantidadeComUnidade(produto.estoque, unidade)}
            </p>
          </div>

          <div role="radiogroup" aria-label="Tipo de ajuste" className="grid grid-cols-3 gap-2">
            {MODOS.map(({ valor, rotulo, descricao, Icone }) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={modo === valor}
                onClick={() => setModo(valor)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-padrao border px-3 py-2.5 text-left transition-colors",
                  modo === valor ? "border-primaria bg-primaria-suave" : "border-borda bg-superficie hover:bg-superficie-2",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-texto">
                  <Icone className="size-4" aria-hidden /> {rotulo}
                </span>
                <span className="text-xs text-texto-fraco">{descricao}</span>
              </button>
            ))}
          </div>

          <Campo
            rotulo={modo === "CONTAGEM" ? `Quantidade contada (${unidade === "KG" ? "kg" : "un"})` : `Quantidade (${unidade === "KG" ? "kg" : "un"})`}
            htmlFor="ajuste-quantidade"
            obrigatorio
            erro={erroCampo(estado, "quantidade")}
            ajuda={passo}
          >
            <Entrada
              id="ajuste-quantidade"
              name="quantidade"
              inputMode={unidade === "KG" ? "decimal" : "numeric"}
              autoComplete="off"
              autoFocus
              required
              tamanho="lg"
              className="text-right tabular"
              value={quantidadeTexto}
              onChange={(e) => setQuantidadeTexto(e.target.value)}
              aria-invalid={fracaoInvalida || undefined}
            />
          </Campo>

          {fracaoInvalida ? <Aviso tom="alerta">Produto vendido por unidade: informe uma quantidade inteira, sem fração.</Aviso> : null}

          {previa ? (
            previa.diferenca === 0 ? (
              <Aviso tom="info">A quantidade informada é igual ao estoque atual. Nada muda.</Aviso>
            ) : (
              <Aviso tom={previa.estoqueApos < 0 ? "alerta" : "info"}>
                O estoque vai de <strong className="tabular">{formatarQuantidade(produto.estoque, unidade)}</strong> para{" "}
                <strong className="tabular">{formatarQuantidade(previa.estoqueApos, unidade)}</strong> (
                <span className="tabular">
                  {previa.diferenca > 0 ? "+" : "-"}
                  {formatarQuantidade(Math.abs(previa.diferenca), unidade)}
                </span>
                ).{previa.estoqueApos < 0 ? " Atenção: o estoque ficará negativo." : ""}
              </Aviso>
            )
          ) : null}

          <Campo rotulo="Motivo" htmlFor="ajuste-motivo" obrigatorio erro={erroCampo(estado, "motivo")} ajuda="Fica registrado no extrato do produto.">
            <Entrada id="ajuste-motivo" name="motivo" list="ajuste-motivos" required maxLength={200} placeholder="Por que o estoque está sendo ajustado?" />
            <datalist id="ajuste-motivos">
              {MOTIVOS_SUGERIDOS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Campo>

          <div className="flex justify-end gap-2 pt-2">
            <Botao type="button" variante="fantasma" onClick={aoFechar} disabled={pendente}>
              Cancelar
            </Botao>
            <BotaoEnviar disabled={previa === null || previa.diferenca === 0}>Confirmar ajuste</BotaoEnviar>
          </div>
        </>
      )}
    </FormularioAcao>
  );
}
