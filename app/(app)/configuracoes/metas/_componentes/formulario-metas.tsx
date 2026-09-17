"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { CaixaSelecao, Campo, Entrada } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { formatarReais } from "@/lib/dinheiro";
import { salvarMetas } from "../actions";

export type DadosMetas = {
  metaVendasDiaria: number | null;
  metaVendasMensal: number | null;
  alertaVencimentoDias: number;
  permitirVendaSemEstoque: boolean;
  permitirDescontoOperador: boolean;
  descontoMaximoPercentual: number; // pontos-base
};

export function FormularioMetas({ metas }: { metas: DadosMetas }) {
  const router = useRouter();
  const [metaDiaria, setMetaDiaria] = useState(metas.metaVendasDiaria ?? 0);
  const [descontoOperador, setDescontoOperador] = useState(metas.permitirDescontoOperador);

  const projecaoMensal = metaDiaria * 26; // referência: 26 dias de loja aberta

  return (
    <FormularioAcao
      acao={salvarMetas}
      mensagemSucesso="Metas e regras salvas."
      aoSucesso={() => router.refresh()}
      className="flex flex-col gap-6"
    >
      {(estado, pendente) => (
        <>
          <Cartao>
            <CartaoCabecalho
              titulo="Metas de venda"
              descricao="Aparecem no painel de gestão pra comparar com o que foi vendido."
            />
            <CartaoConteudo className="grid gap-4 sm:grid-cols-2">
              <Campo
                rotulo="Meta de vendas por dia"
                htmlFor="metaVendasDiaria"
                ajuda={
                  metaDiaria > 0
                    ? `Em 26 dias de loja aberta dá ${formatarReais(projecaoMensal)}.`
                    : "Deixe em branco pra não usar."
                }
                erro={erroCampo(estado, "metaVendasDiaria")}
              >
                <EntradaMoeda
                  id="metaVendasDiaria"
                  name="metaVendasDiaria"
                  valorInicial={metas.metaVendasDiaria}
                  aoMudar={setMetaDiaria}
                />
              </Campo>
              <Campo
                rotulo="Meta de vendas por mês"
                htmlFor="metaVendasMensal"
                ajuda="Deixe em branco pra não usar."
                erro={erroCampo(estado, "metaVendasMensal")}
              >
                <EntradaMoeda id="metaVendasMensal" name="metaVendasMensal" valorInicial={metas.metaVendasMensal} />
              </Campo>
            </CartaoConteudo>
          </Cartao>

          <Cartao>
            <CartaoCabecalho
              titulo="Alertas de validade"
              descricao="Quando o sistema deve avisar que um produto está pra vencer."
            />
            <CartaoConteudo>
              <Campo
                rotulo="Avisar com quantos dias de antecedência"
                htmlFor="alertaVencimentoDias"
                ajuda="Produtos que vencem dentro deste prazo aparecem em Estoque > Vencimentos e no painel."
                erro={erroCampo(estado, "alertaVencimentoDias")}
                className="max-w-xs"
              >
                <div className="flex items-center gap-2">
                  <Entrada
                    id="alertaVencimentoDias"
                    name="alertaVencimentoDias"
                    type="number"
                    min={0}
                    max={365}
                    step={1}
                    defaultValue={metas.alertaVencimentoDias}
                    className="w-28 text-right tabular"
                  />
                  <span className="text-sm text-texto-suave">dias</span>
                </div>
              </Campo>
            </CartaoConteudo>
          </Cartao>

          <Cartao>
            <CartaoCabecalho
              titulo="Regras do caixa"
              descricao="O que o operador pode ou não fazer na hora da venda."
            />
            <CartaoConteudo className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <CaixaSelecao
                  name="permitirVendaSemEstoque"
                  rotulo="Permitir vender produto com estoque zerado"
                  defaultChecked={metas.permitirVendaSemEstoque}
                />
                <p className="pl-6 text-xs text-texto-fraco">
                  Útil quando a mercadoria chegou mas a entrada ainda não foi lançada. O estoque fica negativo até
                  acertar.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <CaixaSelecao
                  name="permitirDescontoOperador"
                  rotulo="Permitir que o operador dê desconto"
                  checked={descontoOperador}
                  onChange={(e) => setDescontoOperador(e.target.checked)}
                />
                <p className="pl-6 text-xs text-texto-fraco">Administradores sempre podem dar qualquer desconto.</p>
              </div>
              <Campo
                rotulo="Desconto máximo do operador"
                htmlFor="descontoMaximoPercentual"
                ajuda={
                  descontoOperador
                    ? "Por venda, em porcentagem do total."
                    : "Sem efeito enquanto o desconto do operador estiver desligado."
                }
                erro={erroCampo(estado, "descontoMaximoPercentual")}
                className="max-w-xs"
              >
                <div className="flex items-center gap-2">
                  <Entrada
                    id="descontoMaximoPercentual"
                    name="descontoMaximoPercentual"
                    inputMode="decimal"
                    defaultValue={(metas.descontoMaximoPercentual / 100).toFixed(2).replace(".", ",")}
                    className="w-28 text-right tabular"
                  />
                  <span className="text-sm text-texto-suave">%</span>
                </div>
              </Campo>
            </CartaoConteudo>
          </Cartao>

          <div className="flex justify-end">
            <BotaoEnviar pendente={pendente}>Salvar metas e regras</BotaoEnviar>
          </div>
        </>
      )}
    </FormularioAcao>
  );
}
