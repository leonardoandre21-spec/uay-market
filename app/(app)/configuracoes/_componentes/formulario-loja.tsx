"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { AreaTexto, Campo, Entrada } from "@/components/ui/campo";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { formatarCnpj, formatarTelefone } from "@/lib/utils";
import { salvarLoja } from "../actions";

export type DadosLoja = {
  nomeLoja: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  mensagemCupom: string | null;
};

export function FormularioLoja({ loja }: { loja: DadosLoja }) {
  const router = useRouter();
  const [previa, setPrevia] = useState<DadosLoja>(loja);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Cartao>
        <CartaoCabecalho
          titulo="Dados da loja"
          descricao="Aparecem no topo do menu e no cabeçalho do cupom impresso."
        />
        <CartaoConteudo>
          <FormularioAcao
            acao={salvarLoja}
            mensagemSucesso="Dados da loja salvos."
            aoSucesso={() => router.refresh()}
            className="flex flex-col gap-4"
          >
            {(estado, pendente) => (
              <>
                <Campo rotulo="Nome da loja" htmlFor="nomeLoja" obrigatorio erro={erroCampo(estado, "nomeLoja")}>
                  <Entrada
                    id="nomeLoja"
                    name="nomeLoja"
                    required
                    maxLength={60}
                    defaultValue={loja.nomeLoja}
                    onChange={(e) => setPrevia((p) => ({ ...p, nomeLoja: e.target.value }))}
                  />
                </Campo>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo
                    rotulo="CNPJ"
                    htmlFor="cnpj"
                    ajuda="Só números; a formatação é automática."
                    erro={erroCampo(estado, "cnpj")}
                  >
                    <Entrada
                      id="cnpj"
                      name="cnpj"
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                      defaultValue={formatarCnpj(loja.cnpj)}
                      onChange={(e) => setPrevia((p) => ({ ...p, cnpj: e.target.value }))}
                    />
                  </Campo>
                  <Campo rotulo="Telefone" htmlFor="telefone" erro={erroCampo(estado, "telefone")}>
                    <Entrada
                      id="telefone"
                      name="telefone"
                      inputMode="tel"
                      placeholder="(35) 99999-9999"
                      defaultValue={formatarTelefone(loja.telefone)}
                      onChange={(e) => setPrevia((p) => ({ ...p, telefone: e.target.value }))}
                    />
                  </Campo>
                </div>
                <Campo rotulo="Endereço" htmlFor="endereco" erro={erroCampo(estado, "endereco")}>
                  <Entrada
                    id="endereco"
                    name="endereco"
                    maxLength={160}
                    placeholder="Rua, número, bairro, cidade"
                    defaultValue={loja.endereco ?? ""}
                    onChange={(e) => setPrevia((p) => ({ ...p, endereco: e.target.value }))}
                  />
                </Campo>
                <Campo
                  rotulo="Mensagem no rodapé do cupom"
                  htmlFor="mensagemCupom"
                  ajuda="Um agradecimento, horário de funcionamento ou aviso de troca. Até 300 letras."
                  erro={erroCampo(estado, "mensagemCupom")}
                >
                  <AreaTexto
                    id="mensagemCupom"
                    name="mensagemCupom"
                    maxLength={300}
                    placeholder="Obrigado pela preferência! Volte sempre."
                    defaultValue={loja.mensagemCupom ?? ""}
                    onChange={(e) => setPrevia((p) => ({ ...p, mensagemCupom: e.target.value }))}
                  />
                </Campo>
                <div className="flex justify-end">
                  <BotaoEnviar pendente={pendente}>Salvar dados da loja</BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        </CartaoConteudo>
      </Cartao>

      <Cartao className="self-start">
        <CartaoCabecalho titulo="Prévia do cupom" descricao="Como o cabeçalho e o rodapé vão sair na impressora." />
        <CartaoConteudo>
          <div className="mx-auto w-full max-w-[260px] rounded-md border border-dashed border-borda bg-fundo px-3 py-4 font-mono text-[11px] leading-snug text-texto">
            <p className="text-center text-xs font-bold uppercase">{previa.nomeLoja || "Nome da loja"}</p>
            {previa.cnpj ? <p className="text-center">CNPJ {formatarCnpj(previa.cnpj)}</p> : null}
            {previa.endereco ? <p className="text-center">{previa.endereco}</p> : null}
            {previa.telefone ? <p className="text-center">Tel. {formatarTelefone(previa.telefone)}</p> : null}
            <p className="my-2 border-t border-dashed border-borda" />
            <p className="text-texto-fraco">1x Produto exemplo ............ 5,00</p>
            <p className="text-texto-fraco">TOTAL ........................ 5,00</p>
            <p className="my-2 border-t border-dashed border-borda" />
            <p className="whitespace-pre-wrap text-center">{previa.mensagemCupom || "Obrigado pela preferência!"}</p>
          </div>
        </CartaoConteudo>
      </Cartao>
    </div>
  );
}
