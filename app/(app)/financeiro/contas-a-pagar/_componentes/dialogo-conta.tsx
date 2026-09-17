"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, CaixaSelecao, Campo, Entrada } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { useToast } from "@/components/ui/toast";
import type { Resultado } from "@/lib/acao";
import { formatarData, parseDataInput } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { diaDoMes, gerarParcelas, rotuloRecorrencia } from "@/lib/servicos/financeiro-calculos";
import { BotaoCopiar } from "../../_componentes/botao-copiar";
import { SeletorComNovo } from "../../_componentes/seletor-com-novo";
import type { ContaLinha, Opcao } from "../../_componentes/tipos";
import { cadastrarConta, editarConta } from "../actions";

type Resposta = { id: number } | { quantidade: number; primeiroVencimento: string };

function salvarConta(editando: boolean) {
  return (form: FormData): Promise<Resultado<Resposta>> => (editando ? editarConta(form) : cadastrarConta(form));
}

/** Cadastro / edição de boleto. Renderize só quando aberto. */
export function DialogoConta({
  aberto,
  aoFechar,
  conta,
  fornecedores,
  categorias,
  vencimentoPadrao,
}: {
  aberto: boolean;
  aoFechar: () => void;
  conta?: ContaLinha | null;
  fornecedores: Opcao[];
  categorias: Opcao[];
  vencimentoPadrao: string; // yyyy-MM-dd
}) {
  const router = useRouter();
  const toast = useToast();
  const editando = Boolean(conta);
  const [valor, setValor] = useState<number>(conta?.valor ?? 0);
  const [vencimento, setVencimento] = useState<string>(conta?.vencimentoInput ?? vencimentoPadrao);
  const [linha, setLinha] = useState<string>(conta?.linhaDigitavel ?? "");
  const [parcelas, setParcelas] = useState<number>(1);
  const [mensal, setMensal] = useState<boolean>(conta?.recorrenciaMensal ?? false);

  const previaParcelas = useMemo(() => {
    if (editando || parcelas <= 1) return [];
    const d = parseDataInput(vencimento);
    if (!d) return [];
    return gerarParcelas(d, Math.min(parcelas, 60)).map(formatarData);
  }, [editando, parcelas, vencimento]);

  // Dia do vencimento digitado: no cadastro vira o dia da recorrência; na edição é só o valor inicial do campo.
  const diaDoVencimento = useMemo(() => {
    const d = parseDataInput(vencimento);
    return d ? diaDoMes(d) : null;
  }, [vencimento]);

  if (!aberto) return null;

  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? "Editar boleto" : "Novo boleto a pagar"}
      descricao={
        editando
          ? conta?.totalParcelas
            ? `Parcela ${conta.parcelaAtual}/${conta.totalParcelas}. A alteração vale só pra esta parcela.`
            : "Altere os dados e salve."
          : "Cadastre a conta pra ela aparecer nos vencimentos. Ao pagar, ela vira despesa do mês sozinha."
      }
      largura="lg"
    >
      <FormularioAcao
        acao={salvarConta(editando)}
        aoSucesso={(r) => {
          if ("quantidade" in r) {
            toast.sucesso(r.quantidade > 1 ? `${r.quantidade} parcelas cadastradas. A primeira vence em ${r.primeiroVencimento}.` : "Boleto cadastrado.");
          } else {
            toast.sucesso("Boleto atualizado.");
          }
          aoFechar();
          router.refresh();
        }}
        className="flex flex-col gap-4"
      >
        {(estado, pendente) => (
          <>
            {conta ? <input type="hidden" name="id" value={conta.id} /> : null}

            <Campo rotulo="Descrição" htmlFor="conta-descricao" obrigatorio erro={erroCampo(estado, "descricao")}>
              <Entrada
                id="conta-descricao"
                name="descricao"
                defaultValue={conta?.descricao ?? ""}
                placeholder="Ex.: Aluguel, Energia, Nota fiscal 1234 do fornecedor..."
                required
                minLength={2}
                maxLength={120}
                autoFocus
              />
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo={parcelas > 1 && !editando ? "Valor de cada parcela" : "Valor"} htmlFor="conta-valor" obrigatorio erro={erroCampo(estado, "valor")}>
                <EntradaMoeda id="conta-valor" name="valor" valorInicial={conta?.valor ?? null} required aoMudar={setValor} />
              </Campo>
              <Campo rotulo={parcelas > 1 && !editando ? "Primeiro vencimento" : "Vencimento"} htmlFor="conta-vencimento" obrigatorio erro={erroCampo(estado, "vencimento")}>
                <Entrada id="conta-vencimento" name="vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />
              </Campo>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SeletorComNovo
                name="fornecedorId"
                nameNovo="novoFornecedor"
                rotulo="Fornecedor"
                opcoes={fornecedores}
                valorInicial={conta?.fornecedorId ?? null}
                nomeInicial={conta?.fornecedorNome ?? null}
                rotuloVazio="Sem fornecedor"
                rotuloNovo="Cadastrar novo fornecedor..."
                placeholderNovo="Nome do fornecedor"
                erro={erroCampo(estado, "novoFornecedor") ?? erroCampo(estado, "fornecedorId")}
              />
              <SeletorComNovo
                name="categoriaId"
                nameNovo="novaCategoria"
                rotulo="Categoria"
                opcoes={categorias}
                valorInicial={conta?.categoriaId ?? null}
                nomeInicial={conta?.categoriaNome ?? null}
                rotuloVazio="Sem categoria"
                rotuloNovo="Criar nova categoria..."
                placeholderNovo="Nome da nova categoria"
                erro={erroCampo(estado, "novaCategoria") ?? erroCampo(estado, "categoriaId")}
              />
            </div>

            <Campo rotulo="Linha digitável / código do boleto" htmlFor="conta-linha" erro={erroCampo(estado, "linhaDigitavel")} ajuda="Cole aqui o código do boleto pra copiar na hora de pagar no banco.">
              <div className="flex items-start gap-2">
                <AreaTexto
                  id="conta-linha"
                  name="linhaDigitavel"
                  value={linha}
                  onChange={(e) => setLinha(e.target.value)}
                  maxLength={200}
                  className="min-h-16 font-mono text-xs tabular"
                  placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
                  spellCheck={false}
                />
                <BotaoCopiar texto={linha.trim()} rotulo="Copiar" mensagem="Linha digitável copiada." somenteIcone variante="contorno" tamanho="md" disabled={!linha.trim()} className="shrink-0" />
              </div>
            </Campo>

            <div className="grid gap-4 rounded-padrao border border-borda bg-superficie-2/50 p-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <CaixaSelecao
                  name="recorrenciaMensal"
                  rotulo="Repete todo mês"
                  checked={mensal}
                  disabled={!editando && parcelas > 1}
                  onChange={(e) => setMensal(e.target.checked)}
                />
                <p className="text-xs text-texto-fraco">
                  {editando && conta?.totalParcelas
                    ? "Parcelas não repetem."
                    : !editando && mensal && diaDoVencimento
                      ? `Vence ${rotuloRecorrencia(diaDoVencimento)}. Quando o mês não tem esse dia, cai no último dia (31 vira 28, 29 ou 30) e volta pro ${diaDoVencimento} no mês seguinte.`
                      : "Ao pagar, a conta do mês seguinte é criada com o mesmo valor (aluguel, internet, contador...)."}
                </p>
              </div>
              {editando && mensal ? (
                <Campo rotulo="Vence todo dia" htmlFor="conta-dia-vencimento" erro={erroCampo(estado, "diaVencimento")} ajuda="Quando o mês não tem esse dia, cai no último dia (31 vira 28, 29 ou 30).">
                  <div className="flex items-center gap-2">
                    <Entrada
                      id="conta-dia-vencimento"
                      name="diaVencimento"
                      type="number"
                      min={1}
                      max={31}
                      step={1}
                      inputMode="numeric"
                      defaultValue={conta?.diaVencimento ?? diaDoVencimento ?? ""}
                      className="w-24 text-center tabular"
                    />
                    <span className="text-sm text-texto-suave">de cada mês</span>
                  </div>
                </Campo>
              ) : null}
              {!editando ? (
                <Campo rotulo="Parcelar em" htmlFor="conta-parcelas" erro={erroCampo(estado, "totalParcelas")} ajuda={mensal ? "Conta mensal não parcela." : "1 = conta única. Acima disso, cria uma conta por mês com o mesmo dia."}>
                  <div className="flex items-center gap-2">
                    <Entrada
                      id="conta-parcelas"
                      name="totalParcelas"
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      inputMode="numeric"
                      value={parcelas}
                      onChange={(e) => setParcelas(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                      disabled={mensal}
                      className="w-24 text-center tabular"
                    />
                    <span className="text-sm text-texto-suave">{parcelas === 1 ? "vez (conta única)" : "parcelas mensais"}</span>
                  </div>
                </Campo>
              ) : null}
              {previaParcelas.length > 1 ? (
                <div className="text-xs text-texto-suave sm:col-span-2">
                  <p className="font-medium text-texto">
                    {previaParcelas.length} parcelas de {formatarReais(valor)} = {formatarReais(valor * previaParcelas.length)}
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Vencimentos: {previaParcelas.slice(0, 6).join(", ")}
                    {previaParcelas.length > 6 ? ` e mais ${previaParcelas.length - 6}` : ""}.
                  </p>
                </div>
              ) : null}
            </div>

            <Campo rotulo="Observação" htmlFor="conta-observacao" erro={erroCampo(estado, "observacao")}>
              <AreaTexto id="conta-observacao" name="observacao" defaultValue={conta?.observacao ?? ""} maxLength={500} placeholder="Opcional" />
            </Campo>

            <div className="flex justify-end gap-2 border-t border-borda pt-4">
              <Botao type="button" variante="fantasma" onClick={aoFechar} disabled={pendente}>
                Cancelar
              </Botao>
              <BotaoEnviar>{editando ? "Salvar alterações" : previaParcelas.length > 1 ? `Cadastrar ${previaParcelas.length} parcelas` : "Cadastrar boleto"}</BotaoEnviar>
            </div>
          </>
        )}
      </FormularioAcao>
    </Dialogo>
  );
}
