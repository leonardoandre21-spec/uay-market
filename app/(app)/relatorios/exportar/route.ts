import { NextResponse, type NextRequest } from "next/server";
import { obterSessao } from "@/lib/auth";
import { ehTipoExportacao, exportarCsv } from "@/lib/servicos/relatorios";
import { resolverPeriodo } from "@/lib/servicos/relatorios-calculos";

export const dynamic = "force-dynamic";

/**
 * GET /relatorios/exportar?tipo=&de=&ate=[&categoria=][&maquininha=]
 * Devolve o CSV (BOM + ";") do relatório pedido, pronto pro Excel.
 */
export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }
  if (sessao.papel !== "ADMIN") {
    return NextResponse.json({ ok: false, erro: "Apenas administradores podem exportar relatórios." }, { status: 403 });
  }

  const parametros = req.nextUrl.searchParams;
  const tipo = parametros.get("tipo");
  if (!ehTipoExportacao(tipo)) {
    return NextResponse.json({ ok: false, erro: "Relatório desconhecido." }, { status: 400 });
  }

  const periodo = resolverPeriodo({ de: parametros.get("de") ?? undefined, ate: parametros.get("ate") ?? undefined });
  const categoriaParam = parametros.get("categoria");
  const categoriaId = categoriaParam && /^\d+$/.test(categoriaParam) ? Number(categoriaParam) : null;
  const maquininhaParam = parametros.get("maquininha");
  const maquininhaId = maquininhaParam && /^\d+$/.test(maquininhaParam) ? Number(maquininhaParam) : null;

  const { nomeArquivo, conteudo } = await exportarCsv(tipo, periodo, { categoriaId, maquininhaId });

  return new NextResponse(conteudo, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
