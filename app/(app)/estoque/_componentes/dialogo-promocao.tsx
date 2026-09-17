"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialogo } from "@/components/ui/dialogo";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { Campo, Entrada } from "@/components/ui/campo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Aviso } from "@/components/ui/aviso";
import { formatarPercentual, formatarReais, margemPontosBase } from "@/lib/dinheiro";
import { colocarEmPromocaoAction } from "../actions";

export type AlvoPromocao = {
  produtoId: number;
  nome: string;
  precoVenda: number;
  precoCusto: number;
  precoPromocional: number | null;
  promocaoAte: string | null; // formatada dd/MM/yyyy
  emPromocao: boolean; // promoção vigente hoje (calculado no servidor)
  validadeInput: string; // yyyy-MM-dd do lote
  validade: string; // dd/MM/yyyy
  hoje: string; // yyyy-MM-dd
};

export function DialogoPromocao({ alvo, aoFechar }: { alvo: AlvoPromocao | null; aoFechar: () => void }) {
  return (
    <Dialogo aberto={alvo !== null} aoFechar={aoFechar} titulo="Colocar em promoção" descricao={alvo?.nome} largura="sm">
      {alvo ? <ConteudoPromocao key={`${alvo.produtoId}-${alvo.validadeInput}`} alvo={alvo} aoFechar={aoFechar} /> : null}
    </Dialogo>
  );
}

function ConteudoPromocao({ alvo, aoFechar }: { alvo: AlvoPromocao; aoFechar: () => void }) {
  const router = useRouter();
  const sugestao = Math.max(1, Math.round(alvo.precoVenda * 0.7));
  const [preco, setPreco] = useState(alvo.emPromocao && alvo.precoPromocional ? alvo.precoPromocional : sugestao);
  const desconto = alvo.precoVenda > 0 ? Math.round(((alvo.precoVenda - preco) / alvo.precoVenda) * 10000) : 0;
  const abaixoDoCusto = preco > 0 && preco < alvo.precoCusto;
  const semDesconto = preco >= alvo.precoVenda;
  const dataPadrao = alvo.validadeInput >= alvo.hoje ? alvo.validadeInput : alvo.hoje;

  return (
    <FormularioAcao
      acao={colocarEmPromocaoAction}
      mensagemSucesso="Promoção ativada. O caixa já usa o preço novo."
      aoSucesso={() => {
        router.refresh();
        aoFechar();
      }}
      className="flex flex-col gap-4"
    >
      {(estado, pendente) => (
        <>
          <input type="hidden" name="produtoId" value={alvo.produtoId} />

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-padrao bg-superficie-2 px-3 py-2">
              <p className="text-xs text-texto-fraco">Preço normal</p>
              <p className="font-semibold tabular">{formatarReais(alvo.precoVenda)}</p>
            </div>
            <div className="rounded-padrao bg-superficie-2 px-3 py-2">
              <p className="text-xs text-texto-fraco">Custo médio</p>
              <p className="font-semibold tabular">{formatarReais(alvo.precoCusto)}</p>
            </div>
          </div>

          {alvo.emPromocao && alvo.precoPromocional ? (
            <Aviso tom="info">
              Já está em promoção por {formatarReais(alvo.precoPromocional)} {alvo.promocaoAte ? `até ${alvo.promocaoAte}` : "sem data pra acabar"}. Salvar substitui a promoção atual.
            </Aviso>
          ) : null}

          <Campo rotulo="Preço promocional" htmlFor="promo-preco" obrigatorio erro={erroCampo(estado, "precoPromocional")} ajuda="Sugestão: 30% abaixo do preço normal.">
            <EntradaMoeda id="promo-preco" name="precoPromocional" valorInicial={preco} aoMudar={setPreco} autoFocus required className="h-12 text-right text-lg tabular" />
          </Campo>

          {semDesconto ? (
            <Aviso tom="alerta">O preço promocional precisa ser menor que o preço normal.</Aviso>
          ) : preco > 0 ? (
            <Aviso tom={abaixoDoCusto ? "alerta" : "sucesso"}>
              Desconto de {formatarPercentual(desconto, 0)} sobre o preço normal.{" "}
              {abaixoDoCusto
                ? `Fica abaixo do custo: perde ${formatarReais(alvo.precoCusto - preco)} por unidade, mas ainda é melhor que jogar fora.`
                : `Margem de ${formatarPercentual(margemPontosBase(preco, alvo.precoCusto), 0)} sobre o preço promocional.`}
            </Aviso>
          ) : null}

          <Campo rotulo="Vale até" htmlFor="promo-ate" obrigatorio erro={erroCampo(estado, "promocaoAte")} ajuda={`Validade do lote: ${alvo.validade}. Depois dessa data o preço normal volta sozinho.`}>
            <Entrada id="promo-ate" name="promocaoAte" type="date" defaultValue={dataPadrao} min={alvo.hoje} required />
          </Campo>

          <div className="flex justify-end gap-2 pt-1">
            <Botao type="button" variante="fantasma" onClick={aoFechar} disabled={pendente}>
              Cancelar
            </Botao>
            <BotaoEnviar disabled={preco <= 0 || semDesconto}>Ativar promoção</BotaoEnviar>
          </div>
        </>
      )}
    </FormularioAcao>
  );
}
