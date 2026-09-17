"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Smartphone, Star, Trash2 } from "lucide-react";
import type { Resultado } from "@/lib/acao";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, CaixaSelecao, Campo, Entrada } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Dialogo } from "@/components/ui/dialogo";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { useToast } from "@/components/ui/toast";
import { formatarPercentual } from "@/lib/dinheiro";
import { ADQUIRENTES_SUGERIDAS } from "@/lib/servicos/vendas-calculos";
import { criarMaquininhaAcao, editarMaquininhaAcao, excluirMaquininhaAcao } from "../actions";

export type MaquininhaSerializada = {
  id: number;
  nome: string;
  adquirente: string | null;
  ativo: boolean;
  padrao: boolean;
  taxaDebito: number; // pontos-base
  taxaCredito: number;
  taxaCreditoParcelado: number;
  taxaPix: number;
  prazoDebitoDias: number;
  prazoCreditoDias: number;
  prazoPixDias: number;
  observacao: string | null;
  /** quantos pagamentos já passaram nela (bloqueia exclusão) */
  pagamentos: number;
};

const ID_LISTA_ADQUIRENTES = "adquirentes-sugeridas";

function percentualParaTexto(bp: number): string {
  return (bp / 100).toFixed(2).replace(".", ",");
}

function CampoTaxa({
  nome,
  rotulo,
  valor,
  estado,
  ajuda,
}: {
  nome: string;
  rotulo: string;
  valor: number;
  estado: Resultado<unknown> | null;
  ajuda?: string;
}) {
  return (
    <Campo rotulo={rotulo} htmlFor={nome} ajuda={ajuda} erro={erroCampo(estado, nome)}>
      <div className="flex items-center gap-1">
        <Entrada
          id={nome}
          name={nome}
          inputMode="decimal"
          defaultValue={percentualParaTexto(valor)}
          className="text-right tabular"
          aria-invalid={erroCampo(estado, nome) ? true : undefined}
        />
        <span className="text-sm text-texto-fraco">%</span>
      </div>
    </Campo>
  );
}

function CampoPrazo({
  nome,
  rotulo,
  valor,
  estado,
}: {
  nome: string;
  rotulo: string;
  valor: number;
  estado: Resultado<unknown> | null;
}) {
  return (
    <Campo rotulo={rotulo} htmlFor={nome} erro={erroCampo(estado, nome)}>
      <div className="flex items-center gap-1">
        <Entrada
          id={nome}
          name={nome}
          type="number"
          min={0}
          max={365}
          step={1}
          defaultValue={valor}
          className="text-right tabular"
        />
        <span className="text-sm text-texto-fraco">dias</span>
      </div>
    </Campo>
  );
}

const VAZIA: MaquininhaSerializada = {
  id: 0,
  nome: "",
  adquirente: null,
  ativo: true,
  padrao: false,
  taxaDebito: 0,
  taxaCredito: 0,
  taxaCreditoParcelado: 0,
  taxaPix: 0,
  prazoDebitoDias: 1,
  prazoCreditoDias: 30,
  prazoPixDias: 0,
  observacao: null,
  pagamentos: 0,
};

/** Campos do formulário de criar/editar (mesmos nomes que a action lê). */
function CamposMaquininha({
  estado,
  valores,
  primeiraPadrao,
}: {
  estado: Resultado<unknown> | null;
  valores: MaquininhaSerializada;
  primeiraPadrao: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" htmlFor="nome" obrigatorio ajuda="Como aparece no botão do caixa." erro={erroCampo(estado, "nome")}>
          <Entrada
            id="nome"
            name="nome"
            required
            maxLength={60}
            defaultValue={valores.nome}
            autoFocus
            placeholder="Ex.: InfinitePay (Gustavo)"
          />
        </Campo>
        <Campo rotulo="Adquirente" htmlFor="adquirente" ajuda="Escolha da lista ou digite outra." erro={erroCampo(estado, "adquirente")}>
          <Entrada
            id="adquirente"
            name="adquirente"
            list={ID_LISTA_ADQUIRENTES}
            maxLength={40}
            defaultValue={valores.adquirente ?? ""}
            placeholder="InfinitePay, Sipag, Stone..."
            autoComplete="off"
          />
          <datalist id={ID_LISTA_ADQUIRENTES}>
            {ADQUIRENTES_SUGERIDAS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Campo>
      </div>

      <fieldset className="rounded-padrao border border-borda p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-texto-fraco">Taxas do contrato</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CampoTaxa nome="taxaDebito" rotulo="Débito" valor={valores.taxaDebito} estado={estado} />
          <CampoTaxa nome="taxaCredito" rotulo="Crédito à vista" valor={valores.taxaCredito} estado={estado} />
          <CampoTaxa nome="taxaCreditoParcelado" rotulo="Crédito parcelado" valor={valores.taxaCreditoParcelado} estado={estado} ajuda="2x ou mais" />
          <CampoTaxa nome="taxaPix" rotulo="Pix" valor={valores.taxaPix} estado={estado} ajuda="Só se o Pix passar pela maquininha" />
        </div>
      </fieldset>

      <fieldset className="rounded-padrao border border-borda p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-texto-fraco">Prazo pra cair na conta</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <CampoPrazo nome="prazoDebitoDias" rotulo="Débito" valor={valores.prazoDebitoDias} estado={estado} />
          <CampoPrazo nome="prazoCreditoDias" rotulo="Crédito" valor={valores.prazoCreditoDias} estado={estado} />
          <CampoPrazo nome="prazoPixDias" rotulo="Pix" valor={valores.prazoPixDias} estado={estado} />
        </div>
        <p className="mt-2 text-xs text-texto-fraco">Dias corridos depois da venda. Usado no relatório de conciliação pra prever quando o dinheiro entra.</p>
      </fieldset>

      <Campo rotulo="Observação" htmlFor="observacao" erro={erroCampo(estado, "observacao")}>
        <AreaTexto id="observacao" name="observacao" maxLength={300} defaultValue={valores.observacao ?? ""} placeholder="Ex.: fica no caixa 1; conta Sicoob" />
      </Campo>

      <div className="flex flex-wrap gap-4">
        <CaixaSelecao name="ativo" rotulo="Ativa (aparece no caixa)" defaultChecked={valores.ativo} />
        <CaixaSelecao name="padrao" rotulo="Padrão (pré-selecionada no caixa)" defaultChecked={valores.padrao || primeiraPadrao} />
      </div>
    </>
  );
}

export function GerenciarMaquininhas({ maquininhas }: { maquininhas: MaquininhaSerializada[] }) {
  const router = useRouter();
  const toast = useToast();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<MaquininhaSerializada | null>(null);
  const [excluindo, setExcluindo] = useState<MaquininhaSerializada | null>(null);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState(false);

  const ativas = maquininhas.filter((m) => m.ativo);
  const temPadrao = ativas.some((m) => m.padrao);

  function concluir() {
    setCriando(false);
    setEditando(null);
    setExcluindo(null);
    setErroExclusao(null);
    router.refresh();
  }

  function abrirExclusao(m: MaquininhaSerializada) {
    setErroExclusao(null);
    setExcluindo(m);
  }

  function fecharExclusao() {
    if (ocupada) return;
    setExcluindo(null);
    setErroExclusao(null);
  }

  async function excluir() {
    if (!excluindo) return;
    setOcupada(true);
    setErroExclusao(null);
    const form = new FormData();
    form.set("maquininhaId", String(excluindo.id));
    const r = await excluirMaquininhaAcao(form);
    setOcupada(false);
    if (r.ok) {
      toast.sucesso(`Maquininha "${r.dados.nome}" excluída.`);
      concluir();
    } else {
      // O <dialog> modal fica na top layer, acima do toast e do resto da página:
      // um toast aqui apareceria escurecido atrás do fundo e sem poder ser fechado.
      // O erro precisa aparecer dentro do próprio diálogo.
      setErroExclusao(r.erro);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <CartaoCabecalho
          titulo="Maquininhas"
          descricao="Cadastre cada maquininha com as taxas do contrato. No caixa o operador escolhe em qual passou o cartão; as taxas entram no lucro real e no relatório de conciliação."
          acoes={
            <Botao onClick={() => setCriando(true)}>
              <Plus className="size-4" aria-hidden /> Nova maquininha
            </Botao>
          }
        />
        <CartaoConteudo>
          <Tabela>
            <Thead>
              <Tr>
                <Th>Maquininha</Th>
                <Th>Situação</Th>
                <Th numerico>Débito</Th>
                <Th numerico>Crédito</Th>
                <Th numerico>Parcelado</Th>
                <Th numerico>Pix</Th>
                <Th>Prazos (déb/créd/pix)</Th>
                <Th numerico>Pagamentos</Th>
                <Th className="text-right">Ações</Th>
              </Tr>
            </Thead>
            <Tbody>
              {maquininhas.length === 0 ? (
                <LinhaVazia
                  colunas={9}
                  mensagem="Nenhuma maquininha cadastrada. Sem cadastro, o caixa usa as taxas de Formas de pagamento."
                />
              ) : null}
              {maquininhas.map((m) => (
                <Tr key={m.id} className={m.ativo ? undefined : "text-texto-fraco"}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Smartphone className="size-4 shrink-0 text-texto-fraco" aria-hidden />
                      <div className="min-w-0">
                        <p className="font-medium text-texto">
                          {m.nome}
                          {m.padrao && m.ativo ? (
                            <Selo tom="primaria" className="ml-2">
                              <Star className="size-3" aria-hidden /> padrão
                            </Selo>
                          ) : null}
                        </p>
                        <p className="text-xs text-texto-fraco">{m.adquirente ?? "Adquirente não informada"}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Selo tom={m.ativo ? "sucesso" : "neutro"}>{m.ativo ? "Ativa" : "Desativada"}</Selo>
                  </Td>
                  <Td numerico>{formatarPercentual(m.taxaDebito)}</Td>
                  <Td numerico>{formatarPercentual(m.taxaCredito)}</Td>
                  <Td numerico>{formatarPercentual(m.taxaCreditoParcelado)}</Td>
                  <Td numerico>{formatarPercentual(m.taxaPix)}</Td>
                  <Td className="tabular text-texto-suave">
                    {m.prazoDebitoDias}d / {m.prazoCreditoDias}d / {m.prazoPixDias}d
                  </Td>
                  <Td numerico>{m.pagamentos.toLocaleString("pt-BR")}</Td>
                  <Td className="text-right">
                    <div className="inline-flex gap-1">
                      <Botao variante="fantasma" tamanho="sm" onClick={() => setEditando(m)}>
                        <Pencil className="size-3.5" aria-hidden /> Editar
                      </Botao>
                      {m.pagamentos === 0 ? (
                        <Botao variante="fantasma" tamanho="sm" onClick={() => abrirExclusao(m)}>
                          <Trash2 className="size-3.5" aria-hidden /> Excluir
                        </Botao>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Tabela>
        </CartaoConteudo>
      </Cartao>

      {ativas.length > 0 && !temPadrao ? (
        <Aviso tom="info">
          Nenhuma maquininha está marcada como padrão. O caixa vai pré-selecionar a primeira da lista (ou a última usada
          naquele computador).
        </Aviso>
      ) : null}
      <Aviso tom="info" titulo="Maquininha com histórico não pode ser excluída">
        Se ela já registrou pagamentos, desative em vez de excluir: as vendas antigas continuam apontando pra ela na
        conciliação. InfinitePay e Sipag não têm integração com o PDV no computador; o operador digita o valor na
        maquininha e registra aqui em qual passou.
      </Aviso>

      {/* Criar */}
      <Dialogo
        aberto={criando}
        aoFechar={() => setCriando(false)}
        titulo="Nova maquininha"
        descricao="Pegue as taxas no contrato ou no app da adquirente."
        largura="lg"
      >
        {criando ? (
          <FormularioAcao
            acao={criarMaquininhaAcao}
            mensagemSucesso="Maquininha cadastrada."
            aoSucesso={concluir}
            className="flex flex-col gap-4"
          >
            {(estado, pendente) => (
              <>
                <CamposMaquininha estado={estado} valores={VAZIA} primeiraPadrao={ativas.length === 0} />
                <div className="flex justify-end gap-2 pt-2">
                  <Botao type="button" variante="secundaria" onClick={() => setCriando(false)}>
                    Cancelar
                  </Botao>
                  <BotaoEnviar pendente={pendente}>Cadastrar maquininha</BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        ) : null}
      </Dialogo>

      {/* Editar */}
      <Dialogo
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo={editando ? `Editar ${editando.nome}` : "Editar maquininha"}
        descricao="Vendas já feitas guardam a taxa da época; mudar aqui vale só pras próximas."
        largura="lg"
      >
        {editando ? (
          <FormularioAcao
            key={editando.id}
            acao={editarMaquininhaAcao}
            mensagemSucesso="Maquininha atualizada."
            aoSucesso={concluir}
            className="flex flex-col gap-4"
          >
            {(estado, pendente) => (
              <>
                <input type="hidden" name="maquininhaId" value={editando.id} />
                <CamposMaquininha estado={estado} valores={editando} primeiraPadrao={false} />
                {editando.pagamentos > 0 ? (
                  <p className="text-xs text-texto-fraco">
                    {editando.pagamentos.toLocaleString("pt-BR")} pagamento{editando.pagamentos === 1 ? "" : "s"} já
                    passaram nesta maquininha, por isso ela não pode ser excluída, só desativada.
                  </p>
                ) : null}
                <div className="flex justify-end gap-2 pt-2">
                  <Botao type="button" variante="secundaria" onClick={() => setEditando(null)}>
                    Cancelar
                  </Botao>
                  <BotaoEnviar pendente={pendente}>Salvar</BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        ) : null}
      </Dialogo>

      {/* Excluir */}
      <Dialogo
        aberto={excluindo !== null}
        aoFechar={fecharExclusao}
        titulo={excluindo ? `Excluir ${excluindo.nome}?` : "Excluir maquininha"}
        descricao="Só é possível porque nenhum pagamento passou nela ainda."
        largura="sm"
        rodape={
          <>
            <Botao type="button" variante="secundaria" onClick={fecharExclusao} disabled={ocupada}>
              Cancelar
            </Botao>
            <Botao type="button" variante="perigo" onClick={excluir} pendente={ocupada}>
              <Trash2 className="size-4" aria-hidden /> Excluir
            </Botao>
          </>
        }
      >
        <p className="text-sm text-texto-suave">
          A maquininha sai da lista do caixa e das configurações. Se preferir manter o cadastro, edite e desmarque
          &quot;Ativa&quot;.
        </p>
        {erroExclusao ? (
          <Aviso tom="perigo" titulo="Não foi possível excluir" className="mt-3">
            {erroExclusao}
          </Aviso>
        ) : null}
      </Dialogo>
    </div>
  );
}
