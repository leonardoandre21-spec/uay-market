"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, QrCode } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { formatarReais } from "@/lib/dinheiro";
import { gerarPayloadPix } from "@/lib/pix";
import { useToast } from "@/components/ui/toast";

/**
 * QR Code do Pix estático com o valor do pagamento. A imagem é gerada no
 * navegador (import dinâmico do qrcode) e o texto pode ser copiado pro
 * cliente colar no app do banco.
 */
export function PixQr({
  pix,
  valorCentavos,
  referencia,
}: {
  pix: { chave: string; nome: string; cidade: string };
  valorCentavos: number;
  referencia: string;
}) {
  const toast = useToast();
  const [imagem, setImagem] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const payload = useMemo(() => {
    try {
      return gerarPayloadPix({
        chave: pix.chave,
        nome: pix.nome,
        cidade: pix.cidade,
        valorCentavos,
        txid: referencia,
      });
    } catch {
      return null;
    }
  }, [pix, valorCentavos, referencia]);

  useEffect(() => {
    let cancelado = false;
    if (!payload) {
      setImagem(null);
      return;
    }
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(payload, { margin: 1, width: 260, errorCorrectionLevel: "M" }))
      .then((url) => {
        if (!cancelado) setImagem(url);
      })
      .catch(() => {
        if (!cancelado) setImagem(null);
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
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.erro("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  if (!payload) {
    return <p className="text-sm text-perigo">Não foi possível gerar o Pix. Confira a chave em Configurações.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-padrao border border-borda bg-fundo p-4">
      {imagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagem} alt={`QR Code Pix de ${formatarReais(valorCentavos)}`} width={220} height={220} className="rounded-md bg-white p-1" />
      ) : (
        <span className="flex size-[220px] items-center justify-center rounded-md bg-superficie text-texto-fraco">
          <QrCode className="size-12 animate-pulse" aria-hidden />
        </span>
      )}
      <p className="text-center text-sm text-texto-suave">
        Pix de <span className="font-semibold tabular text-texto">{formatarReais(valorCentavos)}</span> para{" "}
        <span className="font-medium text-texto">{pix.nome}</span>
      </p>
      <textarea
        readOnly
        value={payload}
        aria-label="Código Pix copia e cola"
        onFocus={(e) => e.target.select()}
        className="h-16 w-full resize-none rounded-md border border-borda bg-superficie p-2 font-mono text-[11px] leading-tight text-texto-suave"
      />
      <Botao type="button" variante="contorno" tamanho="lg" onClick={copiar} className="w-full">
        {copiado ? <Check className="size-4 text-sucesso" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copiado ? "Copiado" : "Copiar código Pix"}
      </Botao>
    </div>
  );
}
