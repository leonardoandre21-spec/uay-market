"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormaPagamento } from "@prisma/client";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, CaixaSelecao, Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Aviso } from "@/components/ui/aviso";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import { SeletorComNovo } from "../../_componentes/seletor-com-novo";
import type { DespesaLinha, Opcao } from "../../_componentes/tipos";
import { editarDespesa, lancarDespesa } from "../actions";

const FORMAS_DESPESA: FormaPagamento[] = ["DINHEIRO", "PIX", "DEBITO", "CREDITO"];

/** Diálogo de lançar / editar despesa. Renderize só quando aberto (o formulário recomeça limpo). */
export function DialogoDespesa({
  aberto,
  aoFechar,
  despesa,
  categorias,
  fornecedores,
  caixaAberto,
  dataPadrao,
}: {
  aberto: boolean;
  aoFechar: () => void;
  despesa?: DespesaLinha | null;
  categorias: Opcao[];
  fornecedores: Opcao[];
  caixaAberto: boolean;
  dataPadrao: string; // yyyy-MM-dd
}) {
  const router = useRouter();
  const editando = Boolean(despesa);
  const travadaPeloCaixa = Boolean(despesa?.pagoDoCaixa && despesa?.sessaoFechada);
  const [pagoDoCaixa, setPagoDoCaixa] = useState<boolean>(despesa?.pagoDoCaixa ?? false);
  const [forma, setForma] = useState<string>(despesa?.formaPagamento ?? "");

  if (!aberto) return null;

  const podeMarcarCaixa = travadaPeloCaixa ? false : caixaAberto || (despesa?.pagoDoCaixa ?? false);
  const formaEfetiva = pagoDoCaixa ? "DINHEIRO" : forma;

  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? "Editar despesa" : "Lançar despesa"}
      descricao={editando ? "Altere os dados e salve." : "Registre um gasto do mercado. Se saiu do dinheiro do caixa, marque a opção pra bater o fechamento."}
      largura="lg"
    >
      <FormularioAcao
        acao={editando ? editarDespesa : lancarDespesa}
        mensagemSucesso={editando ? "Despesa atualizada." : "Despesa lançada."}
        aoSucesso={() => {
          aoFechar();
          router.refresh();
        }}
        className="flex flex-col gap-4"
      >
        {(estado, pendente) => (
          <>
            {despesa ? <input type="hidden" name="id" value={despesa.id} /> : null}

            {travadaPeloCaixa ? (
              <Aviso tom="alerta" titulo="Despesa de um caixa já fechado">
                O valor e a marcação de caixa não podem mais mudar. Os outros dados podem ser corrigidos.
              </Aviso>
            ) : null}

            <Campo rotulo="Descrição" htmlFor="despesa-descricao" obrigatorio erro={erroCampo(estado, "descricao")}>
              <Entrada
                id="despesa-descricao"
                name="descricao"
                defaultValue={despesa?.descricao ?? ""}
                placeholder="Ex.: Conta de luz, gás da cozinha, sacolas..."
                required
                minLength={2}
                maxLength={120}
                autoFocus
              />
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Valor" htmlFor="despesa-valor" obrigatorio erro={erroCampo(estado, "valor")}>
                <EntradaMoeda id="despesa-valor" name="valor" valorInicial={despesa?.valor ?? null} required readOnly={travadaPeloCaixa} />
              </Campo>
              <Campo rotulo="Data" htmlFor="despesa-data" obrigatorio erro={erroCampo(estado, "data")}>
                <Entrada id="despesa-data" name="data" type="date" defaultValue={despesa?.dataInput ?? dataPadrao} required />
              </Campo>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SeletorComNovo
                name="categoriaId"
                nameNovo="novaCategoria"
                rotulo="Categoria"
                opcoes={categorias}
                valorInicial={despesa?.categoriaId ?? null}
                nomeInicial={despesa?.categoriaNome ?? null}
                rotuloVazio="Sem categoria"
                rotuloNovo="Criar nova categoria..."
                placeholderNovo="Nome da nova categoria"
                erro={erroCampo(estado, "novaCategoria") ?? erroCampo(estado, "categoriaId")}
              />
              <SeletorComNovo
                name="fornecedorId"
                nameNovo="novoFornecedor"
                rotulo="Fornecedor"
                opcoes={fornecedores}
                valorInicial={despesa?.fornecedorId ?? null}
                nomeInicial={despesa?.fornecedorNome ?? null}
                rotuloVazio="Sem fornecedor"
                rotuloNovo="Cadastrar novo fornecedor..."
                placeholderNovo="Nome do fornecedor"
                erro={erroCampo(estado, "novoFornecedor") ?? erroCampo(estado, "fornecedorId")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Forma de pagamento" htmlFor="despesa-forma" erro={erroCampo(estado, "formaPagamento")}>
                <Selecao
                  id="despesa-forma"
                  name={pagoDoCaixa ? undefined : "formaPagamento"}
                  value={formaEfetiva}
                  onChange={(e) => setForma(e.target.value)}
                  disabled={pagoDoCaixa}
                >
                  <option value="">Não informado</option>
                  {FORMAS_DESPESA.map((f) => (
                    <option key={f} value={f}>
                      {ROTULO_FORMA_PAGAMENTO[f]}
                    </option>
                  ))}
                </Selecao>
                {pagoDoCaixa ? <input type="hidden" name="formaPagamento" value="DINHEIRO" /> : null}
              </Campo>

              <Campo
                rotulo="Caixa"
                ajuda={
                  travadaPeloCaixa
                    ? "Saiu do caixa de uma sessão já fechada."
                    : podeMarcarCaixa
                      ? "Marque quando o dinheiro foi tirado da gaveta do caixa aberto. A forma vira Dinheiro."
                      : "Só dá pra marcar com o caixa aberto. Abra o caixa em Abertura e fechamento."
                }
              >
                <div className="flex h-10 items-center">
                  <CaixaSelecao
                    name={travadaPeloCaixa ? undefined : "pagoDoCaixa"}
                    rotulo="Saiu do dinheiro do caixa"
                    checked={pagoDoCaixa}
                    disabled={!podeMarcarCaixa}
                    onChange={(e) => setPagoDoCaixa(e.target.checked)}
                  />
                  {travadaPeloCaixa ? <input type="hidden" name="pagoDoCaixa" value="on" /> : null}
                </div>
              </Campo>
            </div>

            <Campo rotulo="Observação" htmlFor="despesa-observacao" erro={erroCampo(estado, "observacao")}>
              <AreaTexto id="despesa-observacao" name="observacao" defaultValue={despesa?.observacao ?? ""} maxLength={500} placeholder="Opcional" />
            </Campo>

            <div className="flex justify-end gap-2 border-t border-borda pt-4">
              <Botao type="button" variante="fantasma" onClick={aoFechar} disabled={pendente}>
                Cancelar
              </Botao>
              <BotaoEnviar>{editando ? "Salvar alterações" : "Lançar despesa"}</BotaoEnviar>
            </div>
          </>
        )}
      </FormularioAcao>
    </Dialogo>
  );
}
