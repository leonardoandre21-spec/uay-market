import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { cancelarIntencao, consultarIntencao, obterCredenciaisMp } from "@/lib/mercadopago";
import { respostaErroMp } from "../../_erro";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

// GET /api/mp/intencao/[id]
// Consulta o estado da cobrança na maquininha (o PDV chama a cada 2 segundos).
// Resposta: { ok: true, dados: { id, estado, pagamentoId } }
export async function GET(_req: Request, { params }: Contexto) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, erro: "Cobrança não informada." }, { status: 400 });
  try {
    const { token } = await obterCredenciaisMp();
    const intencao = await consultarIntencao(id, token);
    const pagamentoId = intencao.payment?.id != null ? String(intencao.payment.id) : null;
    // O PDV para de consultar no primeiro FINISHED, então isso grava uma vez por
    // cobrança aprovada: o rastro existe mesmo que a venda nunca seja registrada.
    if (intencao.state === "FINISHED") {
      await registrarAuditoria({
        usuarioId: sessao.usuarioId,
        acao: "mp.intencao.aprovada",
        entidade: "PaymentIntent",
        detalhes: {
          intentId: String(intencao.id),
          paymentId: pagamentoId,
          valor: intencao.amount ?? null,
          referencia: intencao.additional_info?.external_reference ?? null,
        },
      });
    }
    return NextResponse.json({
      ok: true,
      dados: { id: String(intencao.id), estado: intencao.state ?? "OPEN", pagamentoId },
    });
  } catch (e) {
    return respostaErroMp(e);
  }
}

// DELETE /api/mp/intencao/[id]
// Cancela a cobrança que ainda está aberta na maquininha.
export async function DELETE(_req: Request, { params }: Contexto) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, erro: "Cobrança não informada." }, { status: 400 });
  try {
    const { token, deviceId } = await obterCredenciaisMp();
    if (!deviceId) {
      return NextResponse.json(
        { ok: false, erro: "Nenhuma maquininha Mercado Pago selecionada em Configurações > Integração Mercado Pago." },
        { status: 400 },
      );
    }
    await cancelarIntencao(deviceId, id, token);
    await registrarAuditoria({
      usuarioId: sessao.usuarioId,
      acao: "mp.intencao.cancelada",
      entidade: "PaymentIntent",
      detalhes: { intentId: id },
    });
    return NextResponse.json({ ok: true, dados: { id } });
  } catch (e) {
    return respostaErroMp(e);
  }
}
