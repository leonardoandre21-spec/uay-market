"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormaPagamento } from "@prisma/client";
import { Aviso } from "@/components/ui/aviso";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { CaixaSelecao, Entrada } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { calcularTaxa, formatarReais, parsePercentual } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import { salvarPagamentos } from "../actions";

export type FormaSerializada = {
  forma: FormaPagamento;
  ativo: boolean;
  taxaPercentual: number; // pontos-base
  taxaFixa: number; // centavos
  prazoRecebimentoDias: number;
  maxParcelas: number;
};

const EXEMPLO_CENTAVOS = 10000; // R$ 100,00

const DESCRICAO_FORMA: Record<FormaPagamento, string> = {
  DINHEIRO: "Sem taxa. Entra no caixa na hora.",
  PIX: "Bancos costumam cobrar de 0% a 1%. Cai na conta na hora.",
  DEBITO: "Taxa da maquininha. Cai em 1 dia útil, normalmente.",
  CREDITO: "Taxa maior e prazo de 30 dias se não antecipar.",
  FIADO: "Sem taxa. O dinheiro entra quando o cliente paga.",
};

function percentualParaTexto(bp: number): string {
  return (bp / 100).toFixed(2).replace(".", ",");
}

export function FormularioPagamentos({ formas }: { formas: FormaSerializada[] }) {
  const router = useRouter();
  const [taxas, setTaxas] = useState<Record<string, { bp: number; fixa: number }>>(() =>
    Object.fromEntries(formas.map((f) => [f.forma, { bp: f.taxaPercentual, fixa: f.taxaFixa }])),
  );

  function atualizar(forma: FormaPagamento, parte: Partial<{ bp: number; fixa: number }>) {
    setTaxas((t) => ({ ...t, [forma]: { ...t[forma], ...parte } }));
  }

  return (
    <Cartao>
      <CartaoCabecalho
        titulo="Formas de pagamento"
        descricao="Taxas e prazos de cada forma. Tudo é salvo de uma vez."
      />
      <CartaoConteudo className="flex flex-col gap-4">
        <Aviso tom="info" titulo="Por que informar as taxas?">
          A taxa da maquininha e do Pix sai do seu bolso em cada venda. Ao cadastrar aqui, o sistema desconta
          automaticamente no cálculo do lucro real de cada venda e de cada dia. A coluna &quot;Você recebe&quot; mostra
          quanto sobra de uma venda de {formatarReais(EXEMPLO_CENTAVOS)}.
        </Aviso>
        <Aviso tom="alerta" titulo="Tem maquininha cadastrada?">
          Se houver maquininhas cadastradas, a taxa de débito/crédito vem da maquininha escolhida na venda; as taxas
          abaixo valem só quando nenhuma maquininha for informada.{" "}
          <Link href="/configuracoes/maquininhas" className="font-medium underline">
            Cadastrar maquininhas
          </Link>
        </Aviso>

        <FormularioAcao
          acao={salvarPagamentos}
          mensagemSucesso="Formas de pagamento salvas."
          aoSucesso={() => router.refresh()}
          className="flex flex-col gap-4"
        >
          {(estado, pendente) => (
            <>
              <Tabela>
                <Thead>
                  <Tr>
                    <Th>Forma</Th>
                    <Th>Ativa</Th>
                    <Th>Taxa %</Th>
                    <Th>Taxa fixa</Th>
                    <Th>Recebe em (dias)</Th>
                    <Th>Máx. parcelas</Th>
                    <Th numerico>Você recebe</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {formas.map((f) => {
                    const atual = taxas[f.forma] ?? { bp: 0, fixa: 0 };
                    const liquido = EXEMPLO_CENTAVOS - calcularTaxa(EXEMPLO_CENTAVOS, atual.bp, atual.fixa);
                    const erroLinha =
                      erroCampo(estado, `taxaPercentual_${f.forma}`) ??
                      erroCampo(estado, `taxaFixa_${f.forma}`) ??
                      erroCampo(estado, `prazoRecebimentoDias_${f.forma}`) ??
                      erroCampo(estado, `maxParcelas_${f.forma}`);
                    return (
                      <Tr key={f.forma} className="align-top">
                        <Td>
                          <p className="font-medium text-texto">{ROTULO_FORMA_PAGAMENTO[f.forma]}</p>
                          <p className="text-xs text-texto-fraco">{DESCRICAO_FORMA[f.forma]}</p>
                          {erroLinha ? <p className="mt-1 text-xs text-perigo">{erroLinha}</p> : null}
                        </Td>
                        <Td>
                          <CaixaSelecao
                            name={`ativo_${f.forma}`}
                            rotulo=""
                            defaultChecked={f.ativo}
                            aria-label={`${ROTULO_FORMA_PAGAMENTO[f.forma]} ativa`}
                          />
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            <Entrada
                              name={`taxaPercentual_${f.forma}`}
                              inputMode="decimal"
                              defaultValue={percentualParaTexto(f.taxaPercentual)}
                              className="w-24 text-right tabular"
                              aria-invalid={erroCampo(estado, `taxaPercentual_${f.forma}`) ? true : undefined}
                              onChange={(e) => atualizar(f.forma, { bp: parsePercentual(e.target.value) ?? 0 })}
                            />
                            <span className="text-sm text-texto-fraco">%</span>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-texto-fraco">R$</span>
                            <EntradaMoeda
                              name={`taxaFixa_${f.forma}`}
                              valorInicial={f.taxaFixa}
                              className="w-24"
                              aoMudar={(centavos) => atualizar(f.forma, { fixa: centavos })}
                            />
                          </div>
                        </Td>
                        <Td>
                          <Entrada
                            name={`prazoRecebimentoDias_${f.forma}`}
                            type="number"
                            min={0}
                            max={365}
                            step={1}
                            defaultValue={f.prazoRecebimentoDias}
                            className="w-24 text-right tabular"
                          />
                        </Td>
                        <Td>
                          {f.forma === "CREDITO" ? (
                            <Entrada
                              name={`maxParcelas_${f.forma}`}
                              type="number"
                              min={1}
                              max={24}
                              step={1}
                              defaultValue={f.maxParcelas}
                              className="w-24 text-right tabular"
                            />
                          ) : (
                            <span className="inline-flex h-10 items-center text-sm text-texto-fraco">1 (à vista)</span>
                          )}
                        </Td>
                        <Td numerico>
                          <span className={liquido < EXEMPLO_CENTAVOS ? "text-alerta" : "text-sucesso"}>
                            {formatarReais(liquido)}
                          </span>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Tabela>
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-texto-fraco">
                  Vendas já feitas guardam a taxa da época; mudar aqui vale só pras próximas vendas.
                </p>
                <BotaoEnviar pendente={pendente}>Salvar formas de pagamento</BotaoEnviar>
              </div>
            </>
          )}
        </FormularioAcao>
      </CartaoConteudo>
    </Cartao>
  );
}
