"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, QrCode } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { Campo, Entrada } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { useToast } from "@/components/ui/toast";
import { gerarPayloadPix } from "@/lib/pix";
import { normalizarChavePix } from "../_payload";
import { salvarPix } from "../actions";

export type DadosPixSalvos = {
  pixChave: string | null;
  pixNomeRecebedor: string | null;
  pixCidade: string | null;
};

export function FormularioPix({ pix }: { pix: DadosPixSalvos }) {
  const router = useRouter();
  const toast = useToast();
  const [chave, setChave] = useState(pix.pixChave ?? "");
  const [nome, setNome] = useState(pix.pixNomeRecebedor ?? "");
  const [cidade, setCidade] = useState(pix.pixCidade ?? "");
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const chaveNormalizada = normalizarChavePix(chave);
  let payload: string | null = null;
  if (chaveNormalizada) {
    try {
      // Mesmo gerador que o caixa usa (lib/pix.ts): a prévia sai igual ao QR da venda.
      payload = gerarPayloadPix({ chave: chaveNormalizada, nome, cidade });
    } catch {
      payload = null;
    }
  }

  useEffect(() => {
    let cancelado = false;
    if (!payload) {
      setQr(null);
      return;
    }
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(payload, { width: 240, margin: 1, errorCorrectionLevel: "M" }))
      .then((url) => {
        if (!cancelado) setQr(url);
      })
      .catch(() => {
        if (!cancelado) setQr(null);
      });
    return () => {
      cancelado = true;
    };
  }, [payload]);

  async function copiar() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopiado(true);
      toast.sucesso("Código Pix copiado.");
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.erro("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Cartao>
        <CartaoCabecalho
          titulo="Pix da loja"
          descricao="Com a chave cadastrada, o caixa mostra um QR Code pro cliente pagar direto na sua conta, sem taxa de maquininha."
        />
        <CartaoConteudo>
          <FormularioAcao
            acao={salvarPix}
            mensagemSucesso="Dados do Pix salvos."
            aoSucesso={() => router.refresh()}
            className="flex flex-col gap-4"
          >
            {(estado, pendente) => (
              <>
                <Campo
                  rotulo="Chave Pix"
                  htmlFor="pixChave"
                  ajuda="CPF ou CNPJ (só números), celular no formato +5535999999999, e-mail ou chave aleatória."
                  erro={erroCampo(estado, "pixChave")}
                >
                  <Entrada
                    id="pixChave"
                    name="pixChave"
                    value={chave}
                    onChange={(e) => setChave(e.target.value)}
                    placeholder="Ex.: 12345678000199"
                    autoComplete="off"
                  />
                </Campo>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo
                    rotulo="Nome de quem recebe"
                    htmlFor="pixNomeRecebedor"
                    ajuda={`Aparece no app do cliente. ${nome.length}/25 letras, sem acentos.`}
                    erro={erroCampo(estado, "pixNomeRecebedor")}
                  >
                    <Entrada
                      id="pixNomeRecebedor"
                      name="pixNomeRecebedor"
                      maxLength={25}
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="UAY MARKET"
                    />
                  </Campo>
                  <Campo
                    rotulo="Cidade"
                    htmlFor="pixCidade"
                    ajuda={`${cidade.length}/15 letras.`}
                    erro={erroCampo(estado, "pixCidade")}
                  >
                    <Entrada
                      id="pixCidade"
                      name="pixCidade"
                      maxLength={15}
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      placeholder="EXTREMA"
                    />
                  </Campo>
                </div>
                <Aviso tom="info">
                  O QR gerado é estático (sem valor): o cliente digita o valor no app do banco. No caixa, o sistema gera
                  um QR com o valor da venda usando estes mesmos dados. Confira se a chave está certa fazendo um Pix de
                  teste de R$ 0,01.
                </Aviso>
                <div className="flex justify-end">
                  <BotaoEnviar pendente={pendente}>Salvar dados do Pix</BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        </CartaoConteudo>
      </Cartao>

      <Cartao className="self-start">
        <CartaoCabecalho titulo="Prévia do QR Code" descricao="Atualiza enquanto você digita." />
        <CartaoConteudo className="flex flex-col items-center gap-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="QR Code Pix da loja"
              width={240}
              height={240}
              className="rounded-md border border-borda bg-white"
            />
          ) : (
            <div className="flex size-60 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-borda text-center text-xs text-texto-fraco">
              <QrCode className="size-8" aria-hidden />
              {chave ? "Chave ainda inválida." : "Digite a chave Pix pra ver o QR."}
            </div>
          )}
          {payload ? (
            <>
              <p className="w-full break-all rounded-md bg-superficie-2 p-2 font-mono text-[10px] leading-snug text-texto-suave">
                {payload}
              </p>
              <Botao type="button" variante="contorno" onClick={copiar} className="w-full">
                {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copiado ? "Copiado" : "Copiar código Pix"}
              </Botao>
            </>
          ) : null}
        </CartaoConteudo>
      </Cartao>
    </div>
  );
}
