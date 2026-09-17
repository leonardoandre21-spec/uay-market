import { NextResponse } from "next/server";
import { z } from "zod";
import { obterSessao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarIntencaoPagamento, obterCredenciaisMp } from "@/lib/mercadopago";
import { respostaErroMp } from "../_erro";

export const dynamic = "force-dynamic";

// POST /api/mp/intencao
// Cria uma cobrança na maquininha do Mercado Pago. Exige usuário logado.
// Corpo: { valorCentavos, tipo: "credit_card" | "debit_card", parcelas?, descricao?, referencia? }
// Resposta: { ok: true, dados: { id, estado } } ou { ok: false, erro }

const esquema = z.object({
  valorCentavos: z.number().int().positive(),
  tipo: z.enum(["credit_card", "debit_card"]),
  parcelas: z.number().int().min(1).max(24).optional(),
  descricao: z.string().trim().max(100).optional(),
  referencia: z.string().trim().max(64).optional(),
});

export async function POST(req: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Sessão expirada. Faça login novamente." }, { status: 401 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Dados da cobrança inválidos." }, { status: 400 });
  }
  const parsed = esquema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, erro: "Dados da cobrança inválidos." }, { status: 400 });
  }

  try {
    const { token, deviceId } = await obterCredenciaisMp();
    if (!deviceId) {
      return NextResponse.json(
        {
          ok: false,
          erro: "Nenhuma maquininha Mercado Pago selecionada. Escolha o dispositivo em Configurações > Integração Mercado Pago.",
        },
        { status: 400 },
      );
    }
    const dados = parsed.data;
    const referencia = dados.referencia || `pdv-${sessao.usuarioId}-${Date.now()}`;
    const intencao = await criarIntencaoPagamento(
      {
        deviceId,
        valorCentavos: dados.valorCentavos,
        tipo: dados.tipo,
        parcelas: dados.tipo === "credit_card" ? (dados.parcelas ?? 1) : 1,
        descricao: dados.descricao || "Venda no caixa",
        referencia,
      },
      token,
    );
    // Rastro fora da venda: se a venda não for gravada, a cobrança ainda aparece
    // na auditoria pra conciliar/estornar no painel do Mercado Pago.
    await registrarAuditoria({
      usuarioId: sessao.usuarioId,
      acao: "mp.intencao.criada",
      entidade: "PaymentIntent",
      detalhes: {
        intentId: String(intencao.id),
        valor: dados.valorCentavos,
        tipo: dados.tipo,
        parcelas: dados.tipo === "credit_card" ? (dados.parcelas ?? 1) : 1,
        referencia,
        deviceId,
      },
    });
    return NextResponse.json({ ok: true, dados: { id: String(intencao.id), estado: intencao.state ?? "OPEN" } });
  } catch (e) {
    return respostaErroMp(e);
  }
}
