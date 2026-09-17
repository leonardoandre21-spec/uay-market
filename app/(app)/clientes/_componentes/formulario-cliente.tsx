"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { AreaTexto, CaixaSelecao, Campo, Entrada } from "@/components/ui/campo";
import { EntradaMoeda } from "@/components/ui/entrada-moeda";
import { erroCampo, FormularioAcao } from "@/components/ui/formulario-acao";
import { formatarReais } from "@/lib/dinheiro";
import { salvarCliente } from "../actions";

export type ClienteFormulario = {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  dataNascimentoInput: string;
  limiteFiado: number;
  observacao: string | null;
  ativo: boolean;
};

function mascaraCpf(texto: string): string {
  const d = texto.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function mascaraTelefone(texto: string): string {
  const d = texto.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Cadastro e edição de cliente. Operador usa tudo, menos o limite de fiado
 * (só ADMIN). O campo "ativo" só aparece na edição.
 */
export function FormularioCliente({
  cliente,
  ehAdmin,
  aoCancelarHref,
}: {
  cliente?: ClienteFormulario;
  ehAdmin: boolean;
  aoCancelarHref?: string;
}) {
  const router = useRouter();
  const edicao = Boolean(cliente);
  const [cpf, setCpf] = useState(cliente?.cpf ? mascaraCpf(cliente.cpf) : "");
  const [telefone, setTelefone] = useState(cliente?.telefone ? mascaraTelefone(cliente.telefone) : "");

  return (
    <FormularioAcao
      acao={salvarCliente}
      mensagemSucesso={edicao ? "Cadastro atualizado." : "Cliente cadastrado."}
      aoSucesso={(d) => {
        if (d.criado) router.push(`/clientes/${d.id}`);
        else router.refresh();
      }}
      className="flex flex-col gap-5"
    >
      {(estado, pendente) => (
        <>
          {cliente ? <input type="hidden" name="id" value={cliente.id} /> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Campo rotulo="Nome completo" htmlFor="nome" obrigatorio erro={erroCampo(estado, "nome")} className="md:col-span-2">
              <Entrada
                id="nome"
                name="nome"
                defaultValue={cliente?.nome ?? ""}
                placeholder="Como o cliente é conhecido no mercado"
                autoComplete="off"
                autoFocus={!edicao}
                required
                maxLength={120}
              />
            </Campo>

            <Campo rotulo="CPF" htmlFor="cpf" ajuda="Opcional. Evita cadastro duplicado." erro={erroCampo(estado, "cpf")}>
              <Entrada
                id="cpf"
                name="cpf"
                value={cpf}
                onChange={(e) => setCpf(mascaraCpf(e.target.value))}
                inputMode="numeric"
                placeholder="000.000.000-00"
                autoComplete="off"
                className="tabular"
              />
            </Campo>

            <Campo rotulo="Telefone (WhatsApp)" htmlFor="telefone" ajuda="Com DDD. Usado pra cobrar pelo WhatsApp." erro={erroCampo(estado, "telefone")}>
              <Entrada
                id="telefone"
                name="telefone"
                value={telefone}
                onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                inputMode="tel"
                placeholder="(35) 99999-9999"
                autoComplete="off"
                className="tabular"
              />
            </Campo>

            <Campo rotulo="E-mail" htmlFor="email" erro={erroCampo(estado, "email")}>
              <Entrada id="email" name="email" type="email" defaultValue={cliente?.email ?? ""} placeholder="opcional" autoComplete="off" />
            </Campo>

            <Campo rotulo="Data de nascimento" htmlFor="dataNascimento" ajuda="Pra lembrar do aniversário." erro={erroCampo(estado, "dataNascimento")}>
              <Entrada id="dataNascimento" name="dataNascimento" type="date" defaultValue={cliente?.dataNascimentoInput ?? ""} max="9999-12-31" />
            </Campo>

            <Campo rotulo="Endereço" htmlFor="endereco" erro={erroCampo(estado, "endereco")} className="md:col-span-2">
              <Entrada id="endereco" name="endereco" defaultValue={cliente?.endereco ?? ""} placeholder="Rua, número, bairro" autoComplete="off" maxLength={200} />
            </Campo>

            {ehAdmin ? (
              <Campo
                rotulo="Limite de fiado"
                htmlFor="limiteFiado"
                ajuda="Quanto o cliente pode dever no total. Deixe 0,00 pra não vender fiado."
                erro={erroCampo(estado, "limiteFiado")}
              >
                <EntradaMoeda id="limiteFiado" name="limiteFiado" valorInicial={cliente?.limiteFiado ?? 0} />
              </Campo>
            ) : (
              <Campo rotulo="Limite de fiado" ajuda="Só o administrador altera o limite de fiado.">
                <div className="flex h-10 items-center justify-between rounded-padrao border border-borda bg-superficie-2 px-3 text-sm text-texto-suave">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="size-3.5 text-texto-fraco" aria-hidden />
                    {cliente ? (cliente.limiteFiado === 0 ? "Não compra fiado" : formatarReais(cliente.limiteFiado)) : "Definido pelo administrador"}
                  </span>
                </div>
              </Campo>
            )}

            <Campo rotulo="Observação" htmlFor="observacao" erro={erroCampo(estado, "observacao")} className="md:col-span-2">
              <AreaTexto
                id="observacao"
                name="observacao"
                defaultValue={cliente?.observacao ?? ""}
                placeholder="Ex.: mora na rua de trás, paga todo dia 5, prefere ser chamado de Zé..."
                maxLength={1000}
              />
            </Campo>

            {edicao ? (
              <div className="md:col-span-2">
                <input type="hidden" name="ativoPresente" value="1" />
                <CaixaSelecao name="ativo" rotulo="Cliente ativo (aparece no caixa e na lista principal)" defaultChecked={cliente?.ativo ?? true} />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-borda pt-4">
            {aoCancelarHref ? (
              <Botao type="button" variante="fantasma" onClick={() => router.push(aoCancelarHref)} disabled={pendente}>
                Cancelar
              </Botao>
            ) : null}
            <BotaoEnviar>{edicao ? "Salvar alterações" : "Cadastrar cliente"}</BotaoEnviar>
          </div>
        </>
      )}
    </FormularioAcao>
  );
}
