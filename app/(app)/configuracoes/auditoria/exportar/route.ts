import { NextResponse, type NextRequest } from "next/server";
import { obterSessao } from "@/lib/auth";
import { agora, formatarDataHora } from "@/lib/datas";
import { format } from "date-fns";
import { registrarAuditoria } from "@/lib/auditoria";
import { listarAuditoriaCompleta } from "@/lib/servicos/configuracoes";
import { celulaCsv } from "@/lib/servicos/configuracoes-regras";
import { lerFiltrosAuditoria, type ParametrosAuditoria } from "../_filtros";
import { rotuloAcaoAuditoria, rotuloEntidadeAuditoria } from "../_rotulos";

export const dynamic = "force-dynamic";

/**
 * GET /configuracoes/auditoria/exportar?usuario=&acao=&de=&ate=
 * CSV com ponto e vírgula e BOM (abre direto no Excel em português).
 */
export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao || sessao.papel !== "ADMIN") {
    return NextResponse.json(
      { ok: false, erro: "Apenas administradores podem exportar a auditoria." },
      { status: 403 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const params: ParametrosAuditoria = {
    usuario: sp.get("usuario") ?? undefined,
    acao: sp.get("acao") ?? undefined,
    de: sp.get("de") ?? undefined,
    ate: sp.get("ate") ?? undefined,
  };
  const { filtros } = lerFiltrosAuditoria(params);
  const linhas = await listarAuditoriaCompleta(filtros);

  const cabecalho = ["Data e hora", "Usuário", "Ação", "Código da ação", "Registro", "Id do registro", "Detalhes"];
  const corpo = linhas.map((l) =>
    [
      formatarDataHora(l.criadoEm),
      l.usuario?.nome ?? "Sistema",
      rotuloAcaoAuditoria(l.acao),
      l.acao,
      rotuloEntidadeAuditoria(l.entidade),
      l.entidadeId,
      l.detalhes,
    ]
      .map(celulaCsv)
      .join(";"),
  );
  const csv = `﻿${[cabecalho.join(";"), ...corpo].join("\r\n")}\r\n`;

  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "auditoria.exportar",
    entidade: "Auditoria",
    detalhes: { linhas: linhas.length, filtros: params },
  });

  const nome = `auditoria-${format(agora(), "yyyyMMdd-HHmm")}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
