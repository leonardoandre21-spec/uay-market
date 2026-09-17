"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, PackageCheck, PackagePlus, ScanBarcode } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Entrada } from "@/components/ui/campo";
import { useToast } from "@/components/ui/toast";
import { formatarDataHora } from "@/lib/datas";
import { formatarQuantidadeComUnidade, formatarReais } from "@/lib/dinheiro";
import {
  brutoItem,
  calcularTotais,
  descontoGeralEmCentavos,
  limiteDesconto,
  tetoDescontoParaPapel,
  validarDescontoMaximo,
  type ModoDesconto,
} from "@/lib/servicos/vendas-calculos";
import { buscarProduto, registrarVendaAction } from "../actions";
import { BuscaProduto } from "./busca-produto";
import { Carrinho } from "./carrinho";
import { CARRINHO_VAZIO, quantidadeNoCarrinho, reduzirCarrinho } from "./carrinho-reducer";
import {
  carrinhoVazio,
  chaveCarrinho,
  gravarStorage,
  lerCarrinhoSalvo,
  lerStorage,
  serializarCarrinho,
} from "./carrinho-storage";
import { DialogoConfirmar } from "./dialogo-confirmar";
import { DialogoPagamento } from "./dialogo-pagamento";
import { DialogoQuantidade } from "./dialogo-quantidade";
import { Resumo } from "./resumo";
import { TelaSucesso } from "./tela-sucesso";
import { alvoEhCampo, Tecla } from "./util";
import type { ClientePdv, DadosPdv, PagamentoUi, ProdutoPdv, VendaConcluida } from "./tipos";

type DialogoAtivo =
  | null
  | { tipo: "peso"; produto: ProdutoPdv }
  | { tipo: "quantidade"; chave: string }
  | { tipo: "pagamento" }
  | { tipo: "limpar" };

const ATALHOS: { tecla: string; acao: string }[] = [
  { tecla: "F2", acao: "código" },
  { tecla: "F4", acao: "quantidade" },
  { tecla: "F8", acao: "desconto" },
  { tecla: "F10", acao: "finalizar" },
  { tecla: "Del", acao: "remover item" },
  { tecla: "Esc", acao: "limpar" },
];

export function Pdv({ dados }: { dados: DadosPdv }) {
  const { sessao, config, formas, maquininhas, papel } = dados;
  const toast = useToast();

  const [carrinho, dispatch] = useReducer(reduzirCarrinho, CARRINHO_VAZIO);
  const { itens, selecionada } = carrinho;
  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  // Código bipado que não entrou: produto inexistente ou desativado (aí o caixa aponta onde reativar).
  const [naoEncontrado, setNaoEncontrado] = useState<{ codigo: string; inativo: { id: number; nome: string } | null } | null>(
    null,
  );
  const [descontoModo, setDescontoModo] = useState<ModoDesconto>("VALOR");
  const [descontoValor, setDescontoValor] = useState(0);
  const [cliente, setCliente] = useState<ClientePdv | null>(null);
  // Pagamentos já lançados no diálogo. Vivem aqui, não no diálogo: uma cobrança
  // aprovada na maquininha não pode sumir só porque o operador fechou o diálogo
  // pra corrigir o carrinho depois de o servidor recusar a venda.
  const [pagamentos, setPagamentos] = useState<PagamentoUi[]>([]);
  const [dialogo, setDialogo] = useState<DialogoAtivo>(null);
  const [vendaConcluida, setVendaConcluida] = useState<VendaConcluida | null>(null);
  const [pendente, setPendente] = useState(false);
  const [erroVenda, setErroVenda] = useState<string | null>(null);

  const codigoRef = useRef<HTMLInputElement>(null);
  const descontoRef = useRef<HTMLInputElement>(null);

  const focarCodigo = useCallback(() => {
    window.setTimeout(() => {
      const el = codigoRef.current;
      if (el && !el.disabled) {
        el.focus();
        el.select();
      }
    }, 0);
  }, []);

  // ---------------------------------------------------------------- totais

  const tetoBp = useMemo(() => tetoDescontoParaPapel(papel, config), [papel, config]);
  const permitirDesconto = tetoBp === null || tetoBp > 0;

  const totais = useMemo(() => {
    const parcial = calcularTotais(itens, 0);
    let descontoGeral = descontoGeralEmCentavos(parcial.subtotal, descontoModo, descontoValor);
    const limite = limiteDesconto(parcial.bruto, tetoBp);
    if (limite !== null) descontoGeral = Math.max(0, Math.min(descontoGeral, limite - parcial.descontoItens));
    return calcularTotais(itens, descontoGeral);
  }, [itens, descontoModo, descontoValor, tetoBp]);

  const limiteDescontoCentavos = useMemo(() => limiteDesconto(totais.bruto, tetoBp), [totais.bruto, tetoBp]);

  // ---------------------------------------------------------------- carrinho

  const adicionarProduto = useCallback(
    (produto: ProdutoPdv, quantidade?: number) => {
      if (produto.unidade === "KG" && quantidade === undefined) {
        setDialogo({ tipo: "peso", produto });
        return;
      }
      const q = quantidade ?? 1000;
      const jaNoCarrinho = quantidadeNoCarrinho(itens, produto.id);
      if (!config.permitirVendaSemEstoque && jaNoCarrinho + q > produto.estoque) {
        toast.erro(
          `Sem estoque suficiente de "${produto.nome}": há ${formatarQuantidadeComUnidade(Math.max(0, produto.estoque), produto.unidade)}.`,
        );
        return;
      }
      if (config.permitirVendaSemEstoque && jaNoCarrinho + q > produto.estoque) {
        toast.notificar(
          `"${produto.nome}" vai ficar com estoque negativo (há ${formatarQuantidadeComUnidade(Math.max(0, produto.estoque), produto.unidade)}).`,
          "info",
        );
      }
      dispatch({ tipo: "ADICIONAR", produto, quantidade: q });
      setNaoEncontrado(null);
    },
    [itens, config.permitirVendaSemEstoque, toast],
  );

  const bipar = useCallback(
    async (texto: string) => {
      const c = texto.trim();
      if (!c) return;
      setCodigo("");
      setBuscando(true);
      const r = await buscarProduto(c);
      setBuscando(false);
      if (!r.ok) {
        toast.erro(r.erro);
      } else if (r.dados.tipo === "inativo") {
        setNaoEncontrado({ codigo: c, inativo: { id: r.dados.id, nome: r.dados.nome } });
        toast.erro(`"${r.dados.nome}" está desativado. Reative o produto pra vender.`);
      } else if (r.dados.tipo === "nao_encontrado") {
        setNaoEncontrado({ codigo: c, inativo: null });
        toast.erro(`Nenhum produto com o código ${c}.`);
      } else {
        adicionarProduto(r.dados.produto);
      }
      focarCodigo();
    },
    [adicionarProduto, focarCodigo, toast],
  );

  function alterarQuantidade(chave: string, quantidade: number) {
    const item = itens.find((i) => i.chave === chave);
    if (!item) return;
    const outros = quantidadeNoCarrinho(itens, item.produtoId) - item.quantidade;
    if (!config.permitirVendaSemEstoque && outros + quantidade > item.estoque) {
      toast.erro(
        `Sem estoque suficiente de "${item.nome}": há ${formatarQuantidadeComUnidade(Math.max(0, item.estoque), item.unidade)}.`,
      );
      return;
    }
    dispatch({ tipo: "ALTERAR_QUANTIDADE", chave, quantidade });
  }

  function alterarDesconto(chave: string, desconto: number) {
    const item = itens.find((i) => i.chave === chave);
    if (!item) return;
    let maximo = brutoItem(item);
    if (limiteDescontoCentavos !== null) {
      const outros = totais.descontoItens - Math.min(item.desconto, brutoItem(item));
      maximo = Math.min(maximo, Math.max(0, limiteDescontoCentavos - outros));
    }
    if (desconto > maximo) {
      toast.notificar(`Desconto limitado a ${formatarReais(maximo)} neste item.`, "info");
      desconto = maximo;
    }
    dispatch({ tipo: "ALTERAR_DESCONTO", chave, desconto });
  }

  function removerItem(chave: string) {
    dispatch({ tipo: "REMOVER", chave });
    focarCodigo();
  }

  function limparVenda() {
    dispatch({ tipo: "LIMPAR" });
    setDescontoValor(0);
    setCliente(null);
    setPagamentos([]);
    setNaoEncontrado(null);
    setErroVenda(null);
    gravarStorage(chaveCarrinho(sessao.id), null);
  }

  // ---------------------------------------------------------------- finalizar

  function finalizar() {
    if (itens.length === 0) {
      toast.erro("Bipe pelo menos um produto antes de finalizar.");
      focarCodigo();
      return;
    }
    const validacao = validarDescontoMaximo(totais.bruto, totais.descontoTotal, tetoBp);
    if (!validacao.ok) {
      toast.erro(validacao.mensagem);
      return;
    }
    setErroVenda(null);
    setDialogo({ tipo: "pagamento" });
  }

  async function confirmarVenda(pagamentos: PagamentoUi[]) {
    setPendente(true);
    setErroVenda(null);
    const r = await registrarVendaAction({
      sessaoId: sessao.id,
      itens: itens.map((i) => ({
        produtoId: i.produtoId,
        quantidade: i.quantidade,
        desconto: i.desconto,
        // só conferência: o servidor recarrega o preço e recusa se mudou desde o bipe
        precoReferencia: i.precoUnitario,
      })),
      descontoGeral: totais.descontoGeral,
      clienteId: cliente?.id ?? null,
      pagamentos: pagamentos.map((p) => ({
        forma: p.forma,
        valor: p.valor,
        valorRecebido: p.valorRecebido,
        parcelas: p.parcelas,
        maquininhaId: p.maquininhaId,
        nsu: p.nsu,
        autorizacao: p.autorizacao,
        mpPaymentIntentId: p.mp?.intentId ?? null,
        mpPaymentId: p.mp?.paymentId ?? null,
        mpStatus: p.mp?.status ?? null,
      })),
    });
    setPendente(false);
    if (!r.ok) {
      setErroVenda(r.erro);
      toast.erro(r.erro);
      return;
    }
    setDialogo(null);
    limparVenda();
    setVendaConcluida(r.dados);
  }

  function novaVenda() {
    setVendaConcluida(null);
    focarCodigo();
  }

  /** Leitor disparou na tela de sucesso: abre a venda nova já com esse produto. */
  function biparAposVenda(codigoLido: string) {
    setVendaConcluida(null);
    void bipar(codigoLido);
  }

  const fecharDialogo = useCallback(() => {
    setDialogo(null);
    focarCodigo();
  }, [focarCodigo]);

  // ---------------------------------------------------------------- teclado

  useEffect(() => {
    function aoTecla(e: KeyboardEvent) {
      if (e.key === "F2" || e.key === "F4" || e.key === "F8" || e.key === "F10") e.preventDefault();

      if (vendaConcluida) {
        if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          novaVenda();
        }
        return;
      }
      // Com diálogo aberto, o teclado é dele.
      if (dialogo !== null) return;

      switch (e.key) {
        case "F2":
          focarCodigo();
          break;
        case "F4": {
          const alvo = itens.find((i) => i.chave === selecionada) ?? itens[itens.length - 1];
          if (alvo) setDialogo({ tipo: "quantidade", chave: alvo.chave });
          break;
        }
        case "F8":
          if (permitirDesconto && descontoRef.current) {
            descontoRef.current.focus();
            descontoRef.current.select();
          }
          break;
        case "F10":
          finalizar();
          break;
        case "Escape": {
          if (alvoEhCampo(e.target) && e.target !== codigoRef.current) return;
          if (codigo) {
            setCodigo("");
            setNaoEncontrado(null);
          } else if (naoEncontrado) {
            setNaoEncontrado(null);
          } else if (itens.length > 0) {
            setDialogo({ tipo: "limpar" });
          }
          break;
        }
        case "Delete": {
          if (alvoEhCampo(e.target) && !(e.target === codigoRef.current && codigo === "")) return;
          if (selecionada) {
            e.preventDefault();
            removerItem(selecionada);
          }
          break;
        }
      }
    }
    window.addEventListener("keydown", aoTecla);
    return () => window.removeEventListener("keydown", aoTecla);
  });

  // ---------------------------------------------------------------- inicialização

  // Venda em andamento guardada no sessionStorage (chave por sessão de caixa):
  // F5, recarga do HMR ou a ida ao cadastro de produto não descartam o carrinho.
  // Só lê no efeito (nunca durante o render, pra não divergir da hidratação).
  const [hidratado, setHidratado] = useState(false);
  const inicializado = useRef(false);
  useEffect(() => {
    if (inicializado.current) return;
    inicializado.current = true;

    const salvo = lerCarrinhoSalvo(lerStorage(chaveCarrinho(sessao.id)), Date.now());
    if (salvo) {
      dispatch({ tipo: "RESTAURAR", itens: salvo.itens });
      setDescontoModo(salvo.descontoModo);
      setDescontoValor(salvo.descontoValor);
      setCliente(salvo.cliente);
      setPagamentos(salvo.pagamentos);
      const n = salvo.itens.length;
      const np = salvo.pagamentos.length;
      toast.notificar(
        `Venda recuperada: ${n} ${n === 1 ? "item" : "itens"}${np > 0 ? ` e ${np} pagamento${np === 1 ? "" : "s"} já lançado${np === 1 ? "" : "s"}` : ""}.`,
        "info",
      );
    }
    setHidratado(true);

    if (dados.erroInicial) toast.erro(dados.erroInicial);
    if (dados.codigoInicial) {
      window.history.replaceState(null, "", "/pdv");
      void bipar(dados.codigoInicial);
    } else {
      focarCodigo();
    }
  }, [dados.codigoInicial, dados.erroInicial, bipar, focarCodigo, toast, sessao.id]);

  useEffect(() => {
    if (!hidratado) return;
    const atual = { itens, descontoModo, descontoValor, cliente, pagamentos };
    gravarStorage(chaveCarrinho(sessao.id), carrinhoVazio(atual) ? null : serializarCarrinho(atual, Date.now()));
  }, [hidratado, itens, descontoModo, descontoValor, cliente, pagamentos, sessao.id]);

  // ---------------------------------------------------------------- render

  const itemDialogoQuantidade = dialogo?.tipo === "quantidade" ? itens.find((i) => i.chave === dialogo.chave) : undefined;

  if (vendaConcluida) {
    return (
      <div className="flex h-[calc(100dvh-49px)] flex-col">
        <TelaSucesso venda={vendaConcluida} aoNovaVenda={novaVenda} aoBipar={biparAposVenda} />
      </div>
    );
  }

  return (
    <div
      className="flex h-[calc(100dvh-49px)] flex-col lg:flex-row"
      onMouseDown={(e) => {
        // Clique em área vazia não rouba o foco do leitor.
        const alvo = e.target as HTMLElement;
        if (!alvo.closest("input,select,textarea,button,a,[role=option],dialog")) {
          e.preventDefault();
          focarCodigo();
        }
      }}
    >
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 border-b border-borda bg-superficie p-4">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="relative flex-1">
              <ScanBarcode
                className="pointer-events-none absolute left-4 top-1/2 size-7 -translate-y-1/2 text-primaria"
                aria-hidden
              />
              <Entrada
                ref={codigoRef}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => {
                  // Leitor USB digita o código e manda Enter (às vezes Tab).
                  if (e.key === "Enter" || e.key === "Tab") {
                    if (!codigo.trim()) {
                      if (e.key === "Enter") e.preventDefault();
                      return;
                    }
                    e.preventDefault();
                    void bipar(codigo);
                  }
                }}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                aria-label="Código de barras ou código interno"
                placeholder="Passe o produto no leitor ou digite o código e aperte Enter"
                className="h-16 pl-14 pr-14 text-2xl font-semibold tabular"
              />
              {buscando ? (
                <Loader2
                  className="absolute right-4 top-1/2 size-6 -translate-y-1/2 animate-spin text-texto-fraco"
                  aria-hidden
                />
              ) : (
                <span className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Tecla>F2</Tecla>
                </span>
              )}
            </div>
            <div className="xl:w-96">
              <BuscaProduto
                aoEscolher={(p) => {
                  adicionarProduto(p);
                  if (p.unidade === "UN") focarCodigo();
                }}
                aoSair={focarCodigo}
              />
            </div>
          </div>

          {naoEncontrado?.inativo ? (
            <Aviso tom="alerta" titulo={`"${naoEncontrado.inativo.nome}" está desativado`}>
              <div className="flex flex-wrap items-center gap-3">
                <span>O código {naoEncontrado.codigo} é desse produto. Reative o cadastro pra voltar a vender.</span>
                <Link
                  href={`/produtos/${naoEncontrado.inativo.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-alerta px-3 py-1.5 text-sm font-medium text-white hover:brightness-95"
                >
                  <PackageCheck className="size-4" aria-hidden />
                  Abrir o produto pra reativar
                </Link>
              </div>
            </Aviso>
          ) : naoEncontrado ? (
            <Aviso tom="alerta" titulo={`Nenhum produto com o código ${naoEncontrado.codigo}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span>Confira se o código está certo ou cadastre o produto agora. O carrinho fica guardado enquanto isso.</span>
                <Link
                  href={`/produtos/novo?codigo=${encodeURIComponent(naoEncontrado.codigo)}&voltar=${encodeURIComponent(`/pdv?codigo=${naoEncontrado.codigo}`)}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-alerta px-3 py-1.5 text-sm font-medium text-white hover:brightness-95"
                >
                  <PackagePlus className="size-4" aria-hidden />
                  Cadastrar produto
                </Link>
              </div>
            </Aviso>
          ) : null}
        </div>

        <Carrinho
          itens={itens}
          selecionada={selecionada}
          aoSelecionar={(chave) => dispatch({ tipo: "SELECIONAR", chave })}
          aoAlterarQuantidade={alterarQuantidade}
          aoAlterarDesconto={alterarDesconto}
          aoRemover={removerItem}
          aoConcluirEdicao={focarCodigo}
          permitirDesconto={permitirDesconto}
          permitirVendaSemEstoque={config.permitirVendaSemEstoque}
        />

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-borda bg-superficie px-4 py-2 text-xs text-texto-fraco">
          <div className="flex flex-wrap items-center gap-3">
            {ATALHOS.map((a) => (
              <span key={a.tecla} className="inline-flex items-center gap-1">
                <Tecla>{a.tecla}</Tecla> {a.acao}
              </span>
            ))}
          </div>
          <span>
            Caixa aberto às {formatarDataHora(new Date(sessao.abertoEm))} · {dados.usuarioNome}
          </span>
        </footer>
      </section>

      <Resumo
        totais={totais}
        quantidadeItens={itens.length}
        descontoModo={descontoModo}
        descontoValor={descontoValor}
        aoMudarDescontoModo={(m) => {
          setDescontoModo(m);
          setDescontoValor(0);
        }}
        aoMudarDescontoValor={setDescontoValor}
        descontoRef={descontoRef}
        permitirDesconto={permitirDesconto}
        limiteDescontoCentavos={limiteDescontoCentavos}
        tetoBp={tetoBp}
        cliente={cliente}
        aoMudarCliente={setCliente}
        pagamentosGuardados={pagamentos}
        aoFinalizar={finalizar}
        aoConcluirEdicao={focarCodigo}
      />

      {dialogo?.tipo === "peso" ? (
        <DialogoQuantidade
          aberto
          titulo="Informe o peso"
          nomeProduto={dialogo.produto.nome}
          unidade="KG"
          precoUnitario={dialogo.produto.precoUnitario}
          quantidadeInicial={null}
          aoConfirmar={(q) => {
            const produto = dialogo.produto;
            setDialogo(null);
            adicionarProduto(produto, q);
            focarCodigo();
          }}
          aoFechar={fecharDialogo}
        />
      ) : null}

      {dialogo?.tipo === "quantidade" && itemDialogoQuantidade ? (
        <DialogoQuantidade
          aberto
          titulo={itemDialogoQuantidade.unidade === "KG" ? "Alterar peso" : "Alterar quantidade"}
          nomeProduto={itemDialogoQuantidade.nome}
          unidade={itemDialogoQuantidade.unidade}
          precoUnitario={itemDialogoQuantidade.precoUnitario}
          quantidadeInicial={itemDialogoQuantidade.quantidade}
          aoConfirmar={(q) => {
            setDialogo(null);
            alterarQuantidade(itemDialogoQuantidade.chave, q);
            focarCodigo();
          }}
          aoFechar={fecharDialogo}
        />
      ) : null}

      {dialogo?.tipo === "limpar" ? (
        <DialogoConfirmar
          aberto
          titulo="Cancelar esta venda?"
          descricao={
            `Os ${itens.length} ${itens.length === 1 ? "item" : "itens"} do carrinho (${formatarReais(totais.total)}) serão descartados. Nada foi registrado ainda.` +
            (pagamentos.some((p) => p.mp)
              ? ` Atenção: há cobrança aprovada na maquininha Mercado Pago (${formatarReais(pagamentos.filter((p) => p.mp).reduce((a, p) => a + p.valor, 0))}) que continua no cartão do cliente e precisa ser estornada no painel do Mercado Pago.`
              : "")
          }
          rotuloConfirmar="Sim, limpar carrinho"
          perigo
          aoConfirmar={() => {
            setDialogo(null);
            limparVenda();
            focarCodigo();
          }}
          aoFechar={fecharDialogo}
        />
      ) : null}

      {dialogo?.tipo === "pagamento" ? (
        <DialogoPagamento
          aberto
          total={totais.total}
          formas={formas}
          maquininhas={maquininhas}
          cliente={cliente}
          config={config}
          sessaoId={sessao.id}
          pagamentos={pagamentos}
          aoMudarPagamentos={setPagamentos}
          pendente={pendente}
          erro={erroVenda}
          aoConfirmar={confirmarVenda}
          aoFechar={fecharDialogo}
        />
      ) : null}
    </div>
  );
}
