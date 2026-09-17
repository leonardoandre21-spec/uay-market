"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, PackagePlus, Plus, Trash2, Truck } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, CaixaSelecao, Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Dialogo } from "@/components/ui/dialogo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Aviso } from "@/components/ui/aviso";
import { Selo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { useToast } from "@/components/ui/toast";
import { formatarData, parseDataInput } from "@/lib/datas";
import { formatarQuantidade, formatarReais, parseQuantidade, totalLinha } from "@/lib/dinheiro";
import { calcularParcelas, prepararItensEntrada, quantidadeCompativelComUnidade } from "@/lib/servicos/estoque-calculos";
import { cn, normalizarTexto } from "@/lib/utils";
import { criarFornecedorAction, registrarEntradaAction } from "../actions";
import { BuscaProduto } from "./busca-produto";
import type { CategoriaDespesaOpcao, FornecedorOpcao, ProdutoResumo } from "./tipos";

type Linha = {
  chave: number;
  produto: ProdutoResumo;
  quantidadeTexto: string;
  custoCentavos: number;
  validade: string;
};

const ID_BUSCA = "entrada-busca";

/**
 * Enter dentro de um campo de texto não confirma a nota: o leitor de código de
 * barras e o hábito de "Enter = próximo" fariam a entrada ser gravada pela
 * metade. Dentro da tabela de itens, Enter volta pra busca (próximo bipe);
 * nos outros campos só não envia. A busca trata o próprio Enter, e o botão
 * "Confirmar entrada" continua confirmando quando está com o foco.
 */
function bloquearEnvioComEnter(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter") return;
  const alvo = e.target;
  if (!(alvo instanceof HTMLInputElement) || alvo.id === ID_BUSCA) return;
  e.preventDefault();
  if (alvo.closest("tbody")) document.getElementById(ID_BUSCA)?.focus();
}

/** Categoria padrão do boleto: a de nome "Fornecedores" (ignorando caixa e acento), se existir. */
function categoriaPadraoBoleto(categorias: CategoriaDespesaOpcao[]): string {
  const alvo = normalizarTexto("Fornecedores");
  return String(categorias.find((c) => normalizarTexto(c.nome) === alvo)?.id ?? "");
}

export function FormularioEntrada({
  fornecedores: fornecedoresIniciais,
  categoriasDespesa,
  hoje,
}: {
  fornecedores: FornecedorOpcao[];
  categoriasDespesa: CategoriaDespesaOpcao[];
  hoje: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  const [fornecedorId, setFornecedorId] = useState("");
  const [novoFornecedorAberto, setNovoFornecedorAberto] = useState(false);
  const [frete, setFrete] = useState(0);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [gerarBoleto, setGerarBoleto] = useState(false);
  const [parcelas, setParcelas] = useState(1);
  const [vencimento, setVencimento] = useState("");
  const [categoriaBoleto, setCategoriaBoleto] = useState(() => categoriaPadraoBoleto(categoriasDespesa));
  const proximaChave = useRef(1);
  const refsQuantidade = useRef(new Map<number, HTMLInputElement>());

  const calculo = useMemo(() => {
    const avaliadas = linhas.map((l) => {
      const quantidade = parseQuantidade(l.quantidadeTexto);
      const quantidadeOk = quantidade !== null && quantidade > 0 && quantidadeCompativelComUnidade(quantidade, l.produto.unidade);
      const validadeOk = !l.produto.controlaValidade || /^\d{4}-\d{2}-\d{2}$/.test(l.validade);
      return {
        linha: l,
        quantidade: quantidadeOk ? quantidade : 0,
        quantidadeOk,
        validadeOk,
        total: quantidadeOk ? totalLinha(quantidade, l.custoCentavos) : 0,
      };
    });
    const preparados = prepararItensEntrada(
      avaliadas.map((a) => ({ produtoId: a.linha.produto.id, quantidade: a.quantidade, custoUnitario: a.linha.custoCentavos })),
      frete,
    );
    const subtotal = avaliadas.reduce((acc, a) => acc + a.total, 0);
    const total = subtotal + frete;
    const valido = linhas.length > 0 && avaliadas.every((a) => a.quantidadeOk && a.validadeOk);
    return { avaliadas, preparados, subtotal, total, valido };
  }, [linhas, frete]);

  const dataVencimento = parseDataInput(vencimento);
  const previaParcelas =
    gerarBoleto && dataVencimento && calculo.total > 0 ? calcularParcelas(calculo.total, parcelas, dataVencimento) : [];

  const itensJson = JSON.stringify(
    calculo.avaliadas.map((a) => ({
      produtoId: a.linha.produto.id,
      quantidade: a.quantidade,
      custoUnitario: a.linha.custoCentavos,
      validade: a.linha.produto.controlaValidade && a.linha.validade ? a.linha.validade : null,
    })),
  );

  function adicionarProduto(produto: ProdutoResumo) {
    const existente = linhas.find((l) => l.produto.id === produto.id);
    if (existente) {
      toast.notificar(`"${produto.nome}" já está na nota. Ajuste a quantidade na linha.`, "info");
      refsQuantidade.current.get(existente.chave)?.focus();
      return;
    }
    const chave = proximaChave.current++;
    setLinhas((atual) => [
      ...atual,
      {
        chave,
        produto,
        quantidadeTexto: produto.unidade === "UN" ? "1" : "",
        custoCentavos: produto.precoCusto,
        validade: "",
      },
    ]);
    window.requestAnimationFrame(() => {
      const el = refsQuantidade.current.get(chave);
      el?.focus();
      el?.select();
    });
  }

  function atualizarLinha(chave: number, mudanca: Partial<Linha>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));
  }

  function removerLinha(chave: number) {
    setLinhas((atual) => atual.filter((l) => l.chave !== chave));
    refsQuantidade.current.delete(chave);
  }

  return (
    <>
      <FormularioAcao
        acao={registrarEntradaAction}
        mensagemSucesso="Entrada registrada. Estoque e custos atualizados."
        aoSucesso={(dados) => router.push(`/estoque/entradas/${dados.id}`)}
        className="flex flex-col gap-6"
      >
        {(estado, pendente) => (
          <div className="contents" onKeyDown={bloquearEnvioComEnter}>
            <input type="hidden" name="itens" value={itensJson} />

            <Cartao>
              <CartaoCabecalho titulo="Dados da compra" descricao="De quem comprou, qual nota e quanto pagou de frete." />
              <CartaoConteudo className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Campo rotulo="Fornecedor" htmlFor="entrada-fornecedor" erro={erroCampo(estado, "fornecedorId")}>
                  <div className="flex gap-2">
                    <Selecao id="entrada-fornecedor" name="fornecedorId" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                      <option value="">Sem fornecedor</option>
                      {fornecedores.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                    </Selecao>
                    <Botao type="button" variante="contorno" onClick={() => setNovoFornecedorAberto(true)} title="Cadastrar fornecedor novo" aria-label="Cadastrar fornecedor novo">
                      <Plus className="size-4" aria-hidden />
                    </Botao>
                  </div>
                </Campo>
                <Campo rotulo="Número da nota" htmlFor="entrada-nota" erro={erroCampo(estado, "numeroNota")}>
                  <Entrada id="entrada-nota" name="numeroNota" maxLength={60} placeholder="Ex.: 12345" autoComplete="off" />
                </Campo>
                <Campo rotulo="Data da compra" htmlFor="entrada-data" obrigatorio erro={erroCampo(estado, "data")}>
                  <Entrada id="entrada-data" name="data" type="date" defaultValue={hoje} max={hoje} required />
                </Campo>
                <Campo rotulo="Frete" htmlFor="entrada-frete" ajuda="Rateado no custo dos itens pelo valor de cada um." erro={erroCampo(estado, "frete")}>
                  <EntradaMoeda id="entrada-frete" name="frete" aoMudar={setFrete} />
                </Campo>
                <Campo rotulo="Observação" htmlFor="entrada-observacao" className="md:col-span-2 xl:col-span-4" erro={erroCampo(estado, "observacao")}>
                  <AreaTexto id="entrada-observacao" name="observacao" maxLength={500} className="min-h-16" placeholder="Opcional. Ex.: pedido feito por telefone, entrega parcial." />
                </Campo>
              </CartaoConteudo>
            </Cartao>

            <Cartao>
              <CartaoCabecalho
                titulo="Itens da nota"
                descricao="Bipe o código de barras ou digite o nome. Cada linha tem quantidade, custo e validade (quando o produto controla)."
                acoes={linhas.length ? <Selo tom="primaria">{linhas.length} item(ns)</Selo> : null}
              />
              <CartaoConteudo className="flex flex-col gap-4">
                <BuscaProduto tamanho="lg" autoFocus aoSelecionar={adicionarProduto} id={ID_BUSCA} />

                {linhas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-padrao border border-dashed border-borda px-6 py-10 text-center">
                    <PackagePlus className="mb-2 size-8 text-texto-fraco" aria-hidden />
                    <p className="text-sm font-medium text-texto">Nenhum item ainda</p>
                    <p className="mt-1 max-w-sm text-xs text-texto-suave">Use o leitor de código de barras no campo acima ou digite parte do nome do produto.</p>
                  </div>
                ) : (
                  <Tabela>
                    <Thead>
                      <Tr>
                        <Th>Produto</Th>
                        <Th className="w-32">Quantidade</Th>
                        <Th className="w-36">Custo unit.</Th>
                        <Th className="w-44">Validade</Th>
                        <Th numerico>Total</Th>
                        {frete > 0 ? <Th numerico>Custo c/ frete</Th> : null}
                        <Th className="w-12" />
                      </Tr>
                    </Thead>
                    <Tbody>
                      {calculo.avaliadas.map((a, i) => {
                        const l = a.linha;
                        const un = l.produto.unidade === "KG" ? "kg" : "un";
                        return (
                          <Tr key={l.chave}>
                            <Td>
                              <p className="font-medium text-texto">{l.produto.nome}</p>
                              <p className="text-xs text-texto-fraco">
                                {[l.produto.codigoBarras ?? l.produto.codigoInterno, `estoque atual ${formatarQuantidade(l.produto.estoque, l.produto.unidade)} ${un}`, `custo médio ${formatarReais(l.produto.precoCusto)}`]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </Td>
                            <Td>
                              <div className="flex items-center gap-1.5">
                                <Entrada
                                  ref={(el) => {
                                    if (el) refsQuantidade.current.set(l.chave, el);
                                    else refsQuantidade.current.delete(l.chave);
                                  }}
                                  inputMode={l.produto.unidade === "KG" ? "decimal" : "numeric"}
                                  autoComplete="off"
                                  aria-label={`Quantidade de ${l.produto.nome}`}
                                  aria-invalid={!a.quantidadeOk}
                                  title={l.produto.unidade === "UN" ? "Produto por unidade: só quantidade inteira." : undefined}
                                  className="text-right tabular"
                                  value={l.quantidadeTexto}
                                  onChange={(e) => atualizarLinha(l.chave, { quantidadeTexto: e.target.value })}
                                />
                                <span className="text-xs text-texto-fraco">{un}</span>
                              </div>
                            </Td>
                            <Td>
                              <EntradaMoeda
                                aria-label={`Custo unitário de ${l.produto.nome}`}
                                valorInicial={l.produto.precoCusto}
                                aoMudar={(c) => atualizarLinha(l.chave, { custoCentavos: c })}
                              />
                            </Td>
                            <Td>
                              {l.produto.controlaValidade ? (
                                <Entrada
                                  type="date"
                                  aria-label={`Validade de ${l.produto.nome}`}
                                  aria-invalid={!a.validadeOk}
                                  required
                                  value={l.validade}
                                  onChange={(e) => atualizarLinha(l.chave, { validade: e.target.value })}
                                />
                              ) : (
                                <span className="text-xs text-texto-fraco">Não controla</span>
                              )}
                            </Td>
                            <Td numerico className="font-medium">{formatarReais(a.total)}</Td>
                            {frete > 0 ? (
                              <Td numerico className="text-texto-suave">
                                {a.quantidadeOk ? formatarReais(calculo.preparados[i].custoEfetivo) : "–"}
                              </Td>
                            ) : null}
                            <Td>
                              <button
                                type="button"
                                onClick={() => removerLinha(l.chave)}
                                aria-label={`Remover ${l.produto.nome}`}
                                className="rounded-md p-1.5 text-texto-fraco hover:bg-perigo-suave hover:text-perigo"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                    <tfoot className="border-t border-borda bg-superficie-2 text-sm">
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-right text-texto-suave">
                          Itens
                        </td>
                        <td className="px-4 py-2 text-right font-medium tabular">{formatarReais(calculo.subtotal)}</td>
                        <td colSpan={frete > 0 ? 2 : 1} />
                      </tr>
                      {frete > 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-2 text-right text-texto-suave">
                            Frete
                          </td>
                          <td className="px-4 py-2 text-right font-medium tabular">{formatarReais(frete)}</td>
                          <td colSpan={2} />
                        </tr>
                      ) : null}
                      <tr>
                        <td colSpan={4} className="px-4 py-2.5 text-right font-semibold text-texto">
                          Total da nota
                        </td>
                        <td className="px-4 py-2.5 text-right text-base font-semibold text-texto tabular">{formatarReais(calculo.total)}</td>
                        <td colSpan={frete > 0 ? 2 : 1} />
                      </tr>
                    </tfoot>
                  </Tabela>
                )}

                {linhas.length > 0 && !calculo.valido ? (
                  <Aviso tom="alerta">
                    Confira as linhas destacadas: toda linha precisa de quantidade maior que zero (inteira nos produtos por unidade) e, nos produtos que controlam validade, da data de validade.
                  </Aviso>
                ) : null}
                {erroCampo(estado, "itens") ? <Aviso tom="perigo">{erroCampo(estado, "itens")}</Aviso> : null}
              </CartaoConteudo>
            </Cartao>

            <Cartao>
              <CartaoCabecalho titulo="Pagamento" descricao="Se a compra ficou pra pagar depois, gere o boleto em Contas a pagar." />
              <CartaoConteudo className="flex flex-col gap-4">
                <CaixaSelecao name="gerarBoleto" rotulo="Gerar boleto a pagar pra esta compra" checked={gerarBoleto} onChange={(e) => setGerarBoleto(e.target.checked)} />
                {gerarBoleto ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <Campo rotulo="Primeiro vencimento" htmlFor="entrada-vencimento" obrigatorio erro={erroCampo(estado, "boletoVencimento")}>
                      <Entrada id="entrada-vencimento" name="boletoVencimento" type="date" min={hoje} value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />
                    </Campo>
                    <Campo rotulo="Parcelas" htmlFor="entrada-parcelas" erro={erroCampo(estado, "boletoParcelas")}>
                      <Selecao id="entrada-parcelas" name="boletoParcelas" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? "À vista (1 boleto)" : `${n} parcelas mensais`}
                          </option>
                        ))}
                      </Selecao>
                    </Campo>
                    <Campo rotulo="Categoria da despesa" htmlFor="entrada-categoria" ajuda="Como o boleto aparece nos gastos e no DRE quando for pago." erro={erroCampo(estado, "boletoCategoriaId")}>
                      <Selecao id="entrada-categoria" name="boletoCategoriaId" value={categoriaBoleto} onChange={(e) => setCategoriaBoleto(e.target.value)}>
                        <option value="">Sem categoria</option>
                        {categoriasDespesa.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </Selecao>
                    </Campo>
                    <div className="md:col-span-3">
                      {previaParcelas.length ? (
                        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          {previaParcelas.map((p) => (
                            <li key={p.parcelaAtual} className="flex items-center justify-between rounded-padrao border border-borda bg-superficie-2 px-3 py-2 text-sm">
                              <span className="flex items-center gap-1.5 text-texto-suave">
                                <CalendarDays className="size-4" aria-hidden />
                                {p.totalParcelas > 1 ? `${p.parcelaAtual}/${p.totalParcelas} · ` : ""}
                                {formatarData(p.vencimento)}
                              </span>
                              <span className="font-medium tabular">{formatarReais(p.valor)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-texto-fraco">Informe o vencimento pra ver as parcelas. O valor do boleto é o total da nota (itens + frete).</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </CartaoConteudo>
            </Cartao>

            <div className="sticky bottom-0 -mx-4 border-t border-borda bg-superficie/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-texto-suave">
                  <span className="mr-3">{linhas.length} item(ns)</span>
                  <span>
                    Total <strong className="text-base text-texto tabular">{formatarReais(calculo.total)}</strong>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Botao type="button" variante="fantasma" onClick={() => router.push("/estoque/entradas")} disabled={pendente}>
                    Cancelar
                  </Botao>
                  <BotaoEnviar tamanho="lg" disabled={!calculo.valido || (gerarBoleto && !dataVencimento)}>
                    <Truck className={cn("size-4", pendente && "hidden")} aria-hidden /> Confirmar entrada
                  </BotaoEnviar>
                </div>
              </div>
            </div>
          </div>
        )}
      </FormularioAcao>

      <DialogoNovoFornecedor
        aberto={novoFornecedorAberto}
        aoFechar={() => setNovoFornecedorAberto(false)}
        aoCriar={(f) => {
          setFornecedores((atual) => [...atual, f].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
          setFornecedorId(String(f.id));
          setNovoFornecedorAberto(false);
        }}
      />
    </>
  );
}

function DialogoNovoFornecedor({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: (fornecedor: FornecedorOpcao) => void;
}) {
  return (
    <Dialogo aberto={aberto} aoFechar={aoFechar} titulo="Novo fornecedor" descricao="Cadastro rápido. Os outros dados podem ser completados depois em Fornecedores." largura="sm">
      {aberto ? (
        <FormularioAcao acao={criarFornecedorAction} mensagemSucesso="Fornecedor cadastrado." aoSucesso={aoCriar} limparAoSucesso className="flex flex-col gap-4">
          {(estado, pendente) => (
            <>
              <Campo rotulo="Nome" htmlFor="fornecedor-nome" obrigatorio erro={erroCampo(estado, "nome")}>
                <Entrada id="fornecedor-nome" name="nome" required maxLength={120} autoFocus autoComplete="off" />
              </Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="CNPJ" htmlFor="fornecedor-cnpj" erro={erroCampo(estado, "cnpj")}>
                  <Entrada id="fornecedor-cnpj" name="cnpj" maxLength={20} inputMode="numeric" autoComplete="off" />
                </Campo>
                <Campo rotulo="Telefone" htmlFor="fornecedor-telefone" erro={erroCampo(estado, "telefone")}>
                  <Entrada id="fornecedor-telefone" name="telefone" maxLength={20} inputMode="tel" autoComplete="off" />
                </Campo>
              </div>
              <div className="flex justify-end gap-2">
                <Botao type="button" variante="fantasma" onClick={aoFechar} disabled={pendente}>
                  Cancelar
                </Botao>
                <BotaoEnviar>Cadastrar</BotaoEnviar>
              </div>
            </>
          )}
        </FormularioAcao>
      ) : null}
    </Dialogo>
  );
}
