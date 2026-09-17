"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, CaixaSelecao, Campo, Entrada } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { formatarCnpj, formatarTelefone } from "@/lib/utils";
import type { FornecedorLinha } from "../../_componentes/tipos";
import { salvarFornecedorAcao } from "../actions";

/** Cadastro / edição de fornecedor. Renderize só quando aberto. */
export function DialogoFornecedor({
  aberto,
  aoFechar,
  fornecedor,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  fornecedor?: FornecedorLinha | null;
  aoSalvar?: (dados: { id: number; nome: string }) => void;
}) {
  const router = useRouter();
  const editando = Boolean(fornecedor);
  const [cnpj, setCnpj] = useState(formatarCnpj(fornecedor?.cnpj));
  const [telefone, setTelefone] = useState(formatarTelefone(fornecedor?.telefone));

  if (!aberto) return null;

  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? "Editar fornecedor" : "Novo fornecedor"}
      descricao={editando ? "Altere os dados e salve." : "Só o nome é obrigatório. Os outros dados ajudam na hora de ligar ou conferir nota."}
      largura="lg"
    >
      <FormularioAcao
        acao={salvarFornecedorAcao}
        mensagemSucesso={editando ? "Fornecedor atualizado." : "Fornecedor cadastrado."}
        aoSucesso={(d) => {
          aoSalvar?.(d);
          aoFechar();
          router.refresh();
        }}
        className="flex flex-col gap-4"
      >
        {(estado, pendente) => (
          <>
            {fornecedor ? <input type="hidden" name="id" value={fornecedor.id} /> : null}

            <Campo rotulo="Nome" htmlFor="forn-nome" obrigatorio erro={erroCampo(estado, "nome")}>
              <Entrada id="forn-nome" name="nome" defaultValue={fornecedor?.nome ?? ""} required minLength={2} maxLength={100} autoFocus placeholder="Razão social ou nome fantasia" />
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="CNPJ" htmlFor="forn-cnpj" erro={erroCampo(estado, "cnpj")}>
                <Entrada
                  id="forn-cnpj"
                  name="cnpj"
                  inputMode="numeric"
                  value={cnpj}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(0, 14);
                    setCnpj(d.length === 14 ? formatarCnpj(d) : d);
                  }}
                  placeholder="00.000.000/0000-00"
                  className="tabular"
                />
              </Campo>
              <Campo rotulo="Telefone / WhatsApp" htmlFor="forn-telefone" erro={erroCampo(estado, "telefone")}>
                <Entrada
                  id="forn-telefone"
                  name="telefone"
                  inputMode="tel"
                  value={telefone}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(0, 13);
                    setTelefone(d.length >= 10 ? formatarTelefone(d) : d);
                  }}
                  placeholder="(35) 99999-9999"
                  className="tabular"
                />
              </Campo>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="E-mail" htmlFor="forn-email" erro={erroCampo(estado, "email")}>
                <Entrada id="forn-email" name="email" type="email" defaultValue={fornecedor?.email ?? ""} placeholder="pedidos@fornecedor.com.br" />
              </Campo>
              <Campo rotulo="Pessoa de contato" htmlFor="forn-contato" erro={erroCampo(estado, "contato")}>
                <Entrada id="forn-contato" name="contato" defaultValue={fornecedor?.contato ?? ""} maxLength={80} placeholder="Vendedor, representante..." />
              </Campo>
            </div>

            <Campo rotulo="Observação" htmlFor="forn-observacao" erro={erroCampo(estado, "observacao")}>
              <AreaTexto id="forn-observacao" name="observacao" defaultValue={fornecedor?.observacao ?? ""} maxLength={500} placeholder="Dia de entrega, prazo de pagamento, pedido mínimo..." />
            </Campo>

            {editando ? (
              <CaixaSelecao name="ativo" rotulo="Fornecedor ativo (aparece nos seletores de compra e boleto)" defaultChecked={fornecedor?.ativo ?? true} />
            ) : null}

            <div className="flex justify-end gap-2 border-t border-borda pt-4">
              <Botao type="button" variante="fantasma" onClick={aoFechar} disabled={pendente}>
                Cancelar
              </Botao>
              <BotaoEnviar>{editando ? "Salvar alterações" : "Cadastrar fornecedor"}</BotaoEnviar>
            </div>
          </>
        )}
      </FormularioAcao>
    </Dialogo>
  );
}
