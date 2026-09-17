import { NextResponse } from "next/server";
import { ErroMercadoPago } from "@/lib/mercadopago";

/** Converte qualquer erro do cliente Mercado Pago em resposta JSON legível. */
export function respostaErroMp(e: unknown) {
  if (e instanceof ErroMercadoPago) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: e.status >= 400 ? 502 : 400 });
  }
  const mensagem = e instanceof Error && e.message ? e.message : "Não foi possível falar com o Mercado Pago.";
  return NextResponse.json({ ok: false, erro: mensagem }, { status: 500 });
}
