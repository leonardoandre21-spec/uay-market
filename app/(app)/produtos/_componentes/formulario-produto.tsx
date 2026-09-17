"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Papel, Unidade } from "@prisma/client";
import { Calculator, Lightbulb, Lock } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, CaixaSelecao, Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import {
  formatarPercentual,
  formatarQuantidadeComUnidade,
  formatarReais,
  margemPontosBase,
  markupPontosBase,
  parsePercentual,
} from "@/lib/dinheiro";
import { ROTULO_UNIDADE } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { sugerirPrecoPorMargem } from "@/lib/servicos/produtos-calculos";
import { classesBotao } from "./botao-link";
import { salvarProduto } from "../actions";

/** Produto já serializado pro cliente (datas como "yyyy-MM-dd"). */
export type ProdutoDoFormulario = {
  id: number;
  codigoBarras: string | null;
  codigoInterno: string | null;
  nome: string;
  descricao: string | null;
  categoriaId: number | null;
  unidade: Unidade;
  precoVenda: number;
  precoCusto: number;
  precoPromocional: number | null;
  promocaoAte: string | null;
  estoque: number;
  estoqueMinimo: number;
  controlaValidade: boolean;
  ativo: boolean;
};

function textoQuantidade(milesimos: number, unidade: Unidade): string {
  if (unidade === "UN") return String(Math.round(milesimos / 1000));
  return (milesimos / 1000).toFixed(3).replace(".", ",");
}

function tomMargem(margemBp: number, custo: number): string {
  if (custo <= 0) return "text-texto-suave";
  if (margemBp < 0) return "text-perigo";
  if (margemBp < 1500) return "text-alerta";
  return "text-sucesso";
}

export function FormularioProduto({
  produto,
  categorias,
  papel,
  codigoInicial,
  voltar,
}: {
  produto?: ProdutoDoFormulario;
  categorias: { id: number; nome: string }[];
  papel: Papel;
  /** Código bipado no PDV que ainda não existe (?codigo=). */
  codigoInicial?: string;
  /** Pra onde voltar depois de salvar um produto novo (?voltar=). */
  voltar?: string;
}) {
  const router = useRouter();
  const admin = papel === "ADMIN";
  const novo = !produto;

  const [precoVenda, setPrecoVenda] = useState(produto?.precoVenda ?? 0);
  const [precoCusto, setPrecoCusto] = useState(produto?.precoCusto ?? 0);
  const [chavePreco, setChavePreco] = useState(0);
  const [unidade, setUnidade] = useState<Unidade>(produto?.unidade ?? "UN");
  const [margemDesejada, setMargemDesejada] = useState("30");
  const [temPromocao, setTemPromocao] = useState((produto?.precoPromocional ?? 0) > 0);

  const margem = margemPontosBase(precoVenda, precoCusto);
  const markup = markupPontosBase(precoVenda, precoCusto);
  const lucro = precoVenda - precoCusto;

  const sugestao = useMemo(() => {
    const bp = parsePercentual(margemDesejada);
    return bp === null ? null : sugerirPrecoPorMargem(precoCusto, bp);
  }, [margemDesejada, precoCusto]);

  const destinoCancelar = voltar ?? "/produtos";
  const sufixoUnidade = unidade === "KG" ? "kg" : "un";

  return (
    <FormularioAcao
      acao={salvarProduto}
      mensagemSucesso={novo ? "Produto cadastrado." : "Produto salvo."}
      aoSucesso={(d) => {
        if (d.destino) router.push(d.destino);
        router.refresh();
      }}
      className="flex flex-col gap-5"
    >
      {(estado, pendente) => (
        <>
          {produto ? <input type="hidden" name="id" value={produto.id} /> : null}
          {voltar ? <input type="hidden" name="voltar" value={voltar} /> : null}

          <Cartao>
            <CartaoCabecalho titulo="Identificação" descricao="Como o produto aparece no caixa e nos relatórios." />
            <CartaoConteudo className="grid gap-4 sm:grid-cols-2">
              <Campo
                rotulo="Código de barras"
                htmlFor="codigoBarras"
                erro={erroCampo(estado, "codigoBarras")}
                ajuda="Bipe com o leitor ou digite. Pode ficar vazio pra produtos sem código (pão, frutas)."
              >
                <Entrada
                  id="codigoBarras"
                  name="codigoBarras"
                  inputMode="numeric"
                  autoComplete="off"
                  defaultValue={produto?.codigoBarras ?? codigoInicial ?? ""}
                  placeholder="7891234567895"
                  className="font-mono"
                  autoFocus={novo && !codigoInicial}
                />
              </Campo>
              <Campo
                rotulo="Código interno"
                htmlFor="codigoInterno"
                erro={erroCampo(estado, "codigoInterno")}
                ajuda="Código curto seu, pra digitar no caixa (ex.: 101 pro pão francês)."
              >
                <Entrada
                  id="codigoInterno"
                  name="codigoInterno"
                  autoComplete="off"
                  defaultValue={produto?.codigoInterno ?? ""}
                  placeholder="101"
                  className="font-mono"
                  maxLength={30}
                />
              </Campo>
              <Campo rotulo="Nome" htmlFor="nome" obrigatorio erro={erroCampo(estado, "nome")} className="sm:col-span-2">
                <Entrada
                  id="nome"
                  name="nome"
                  required
                  maxLength={120}
                  defaultValue={produto?.nome ?? ""}
                  placeholder="Arroz branco tipo 1 5kg"
                  autoFocus={novo && !!codigoInicial}
                  tamanho="lg"
                />
              </Campo>
              <Campo rotulo="Descrição" htmlFor="descricao" erro={erroCampo(estado, "descricao")} className="sm:col-span-2">
                <AreaTexto
                  id="descricao"
                  name="descricao"
                  maxLength={500}
                  defaultValue={produto?.descricao ?? ""}
                  placeholder="Marca, sabor, tamanho da embalagem ou qualquer detalhe que ajude a diferenciar."
                />
              </Campo>
              <Campo rotulo="Categoria" htmlFor="categoriaId" erro={erroCampo(estado, "categoriaId")}>
                <Selecao id="categoriaId" name="categoriaId" defaultValue={produto?.categoriaId ?? ""}>
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Selecao>
                <Link href="/produtos/categorias" className="text-xs text-primaria hover:underline">
                  Gerenciar categorias
                </Link>
              </Campo>
              <Campo
                rotulo="Vendido por"
                htmlFor="unidade"
                obrigatorio
                erro={erroCampo(estado, "unidade")}
                ajuda={unidade === "KG" ? "Preço por quilo. No caixa a quantidade vem da balança." : "Preço por unidade ou pacote."}
              >
                <Selecao id="unidade" name="unidade" value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade)}>
                  <option value="UN">{ROTULO_UNIDADE.UN}</option>
                  <option value="KG">{ROTULO_UNIDADE.KG}</option>
                </Selecao>
              </Campo>
            </CartaoConteudo>
          </Cartao>

          <Cartao>
            <CartaoCabecalho titulo="Preços" descricao="Margem e markup são recalculados enquanto você digita." />
            <CartaoConteudo className="grid gap-4 lg:grid-cols-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
                <Campo
                  rotulo={`Preço de venda (por ${sufixoUnidade})`}
                  htmlFor="precoVenda"
                  obrigatorio
                  erro={erroCampo(estado, "precoVenda")}
                >
                  <EntradaMoeda
                    key={`preco-${chavePreco}`}
                    id="precoVenda"
                    name="precoVenda"
                    valorInicial={precoVenda}
                    aoMudar={setPrecoVenda}
                    className="h-12 text-base text-right tabular"
                    required
                  />
                </Campo>
                <Campo
                  rotulo={`Preço de custo (por ${sufixoUnidade})`}
                  htmlFor="precoCusto"
                  erro={erroCampo(estado, "precoCusto")}
                  ajuda={
                    admin
                      ? "Custo médio atual. As entradas de estoque recalculam esse valor automaticamente."
                      : "Só o administrador altera o custo. As entradas de estoque atualizam o custo médio."
                  }
                >
                  <div className="relative">
                    <EntradaMoeda
                      id="precoCusto"
                      name="precoCusto"
                      valorInicial={precoCusto}
                      aoMudar={setPrecoCusto}
                      className={cn("h-12 text-base text-right tabular", !admin && "pl-9")}
                      disabled={!admin}
                    />
                    {!admin ? (
                      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
                    ) : null}
                  </div>
                </Campo>

                <div className="rounded-padrao border border-borda bg-superficie-2/60 p-4 sm:col-span-2">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-texto">
                    <Calculator className="size-4 text-primaria" aria-hidden />
                    Resultado por {sufixoUnidade} vendido
                  </div>
                  {precoCusto <= 0 ? (
                    <p className="text-sm text-texto-suave">
                      Informe o preço de custo pra ver a margem e o markup. Sem custo, todo o preço aparece como lucro.
                    </p>
                  ) : (
                    <dl className="grid grid-cols-3 gap-3">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-texto-fraco">Margem</dt>
                        <dd className={cn("mt-0.5 text-xl font-semibold tabular", tomMargem(margem, precoCusto))}>
                          {formatarPercentual(margem)}
                        </dd>
                        <dd className="text-xs text-texto-fraco">sobre a venda</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-texto-fraco">Markup</dt>
                        <dd className={cn("mt-0.5 text-xl font-semibold tabular", tomMargem(margem, precoCusto))}>
                          {formatarPercentual(markup)}
                        </dd>
                        <dd className="text-xs text-texto-fraco">sobre o custo</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-texto-fraco">Lucro</dt>
                        <dd className={cn("mt-0.5 text-xl font-semibold tabular", tomMargem(margem, precoCusto))}>
                          {formatarReais(lucro)}
                        </dd>
                        <dd className="text-xs text-texto-fraco">por {sufixoUnidade}</dd>
                      </div>
                    </dl>
                  )}
                  {precoCusto > 0 && margem < 0 ? (
                    <p className="mt-3 text-xs font-medium text-perigo">Atenção: você está vendendo abaixo do custo.</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-padrao border border-dashed border-borda p-4 lg:col-span-2">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-texto">
                  <Lightbulb className="size-4 text-acento" aria-hidden />
                  Sugerir preço pela margem
                </div>
                <Campo rotulo="Margem desejada (%)" htmlFor="margemDesejada">
                  <Entrada
                    id="margemDesejada"
                    inputMode="decimal"
                    value={margemDesejada}
                    onChange={(e) => setMargemDesejada(e.target.value)}
                    className="tabular"
                    placeholder="30"
                  />
                </Campo>
                <div className="mt-3">
                  {precoCusto <= 0 ? (
                    <p className="text-xs text-texto-suave">Preencha o custo pra calcular a sugestão.</p>
                  ) : sugestao === null ? (
                    <p className="text-xs text-perigo">Margem inválida. Use um valor entre 0 e 99,99.</p>
                  ) : (
                    <>
                      <p className="text-xs text-texto-fraco">Preço sugerido</p>
                      <p className="text-2xl font-semibold tabular text-texto">{formatarReais(sugestao)}</p>
                      <Botao
                        type="button"
                        variante="contorno"
                        tamanho="sm"
                        className="mt-2"
                        onClick={() => {
                          setPrecoVenda(sugestao);
                          setChavePreco((k) => k + 1);
                        }}
                      >
                        Usar este preço
                      </Botao>
                    </>
                  )}
                </div>
              </div>
            </CartaoConteudo>
          </Cartao>

          <Cartao>
            <CartaoCabecalho
              titulo="Promoção"
              descricao="Enquanto a promoção valer, o caixa cobra o preço promocional no lugar do preço normal."
            />
            <CartaoConteudo className="flex flex-col gap-4">
              <CaixaSelecao
                rotulo="Este produto está em promoção"
                checked={temPromocao}
                onChange={(e) => setTemPromocao(e.target.checked)}
              />
              <div className={cn("grid gap-4 sm:grid-cols-2", !temPromocao && "hidden")}>
                <Campo rotulo="Preço promocional" htmlFor="precoPromocional" erro={erroCampo(estado, "precoPromocional")}>
                  <EntradaMoeda
                    key={`promo-${temPromocao}`}
                    id="precoPromocional"
                    name="precoPromocional"
                    valorInicial={temPromocao ? produto?.precoPromocional ?? null : null}
                    disabled={!temPromocao}
                  />
                </Campo>
                <Campo
                  rotulo="Promoção válida até"
                  htmlFor="promocaoAte"
                  erro={erroCampo(estado, "promocaoAte")}
                  ajuda="Vazio = promoção sem data pra acabar. O dia informado ainda conta."
                >
                  <Entrada
                    id="promocaoAte"
                    name="promocaoAte"
                    type="date"
                    defaultValue={produto?.promocaoAte ?? ""}
                    disabled={!temPromocao}
                  />
                </Campo>
              </div>
            </CartaoConteudo>
          </Cartao>

          <Cartao>
            <CartaoCabecalho titulo="Estoque" descricao="Quantidades sempre na unidade de venda escolhida acima." />
            <CartaoConteudo className="grid gap-4 sm:grid-cols-2">
              {!produto ? (
                <Campo
                  rotulo={`Estoque inicial (${sufixoUnidade})`}
                  htmlFor="estoqueInicial"
                  erro={erroCampo(estado, "estoqueInicial")}
                  ajuda="Quanto você já tem na loja. Entra como um ajuste de estoque com o custo informado."
                >
                  <Entrada
                    id="estoqueInicial"
                    name="estoqueInicial"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={unidade === "KG" ? "0,000" : "0"}
                    className="tabular"
                  />
                </Campo>
              ) : (
                <Campo rotulo="Estoque atual" ajuda="Pra mudar a quantidade, registre uma entrada, uma perda ou um ajuste em Estoque.">
                  <div className="flex h-10 items-center rounded-padrao border border-borda bg-superficie-2 px-3 text-sm tabular text-texto-suave">
                    {formatarQuantidadeComUnidade(produto.estoque, produto.unidade)}
                  </div>
                </Campo>
              )}
              <Campo
                rotulo={`Estoque mínimo (${sufixoUnidade})`}
                htmlFor="estoqueMinimo"
                erro={erroCampo(estado, "estoqueMinimo")}
                ajuda="Quando o estoque chegar nesse valor, o produto aparece em vermelho na lista."
              >
                <Entrada
                  id="estoqueMinimo"
                  name="estoqueMinimo"
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={produto ? textoQuantidade(produto.estoqueMinimo, produto.unidade) : ""}
                  placeholder={unidade === "KG" ? "0,000" : "0"}
                  className="tabular"
                />
              </Campo>
              <div className="flex flex-col gap-3 sm:col-span-2">
                <CaixaSelecao
                  name="controlaValidade"
                  rotulo="Controlar validade por lote (vence primeiro, sai primeiro)"
                  defaultChecked={produto?.controlaValidade ?? false}
                />
                <CaixaSelecao
                  name="ativo"
                  rotulo="Produto ativo (aparece no caixa)"
                  defaultChecked={produto?.ativo ?? true}
                />
              </div>
            </CartaoConteudo>
          </Cartao>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href={destinoCancelar} className={classesBotao("fantasma", "lg")}>
              Cancelar
            </Link>
            <BotaoEnviar tamanho="lg" pendente={pendente}>
              {novo ? "Cadastrar produto" : "Salvar alterações"}
            </BotaoEnviar>
          </div>
        </>
      )}
    </FormularioAcao>
  );
}
