import { NextResponse, type NextRequest } from "next/server";
import { obterSessao } from "@/lib/auth";
import { agora, paraDataInput } from "@/lib/datas";
import { gerarCsvClientes, normalizarFiltro } from "@/lib/servicos/clientes";

export const dynamic = "force-dynamic";

/**
 * GET /clientes/exportar?busca=&filtro=
 * Baixa a lista de clientes (com o mesmo filtro da tela) em CSV com BOM e
 * separador ";", que o Excel em português abre direto.
 */
export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const busca = (req.nextUrl.searchParams.get("busca") ?? "").trim();
  const filtro = normalizarFiltro(req.nextUrl.searchParams.get("filtro"));
  const csv = await gerarCsvClientes(busca, filtro);

  const sufixo = filtro === "todos" ? "" : `-${filtro}`;
  const nomeArquivo = `clientes${sufixo}-${paraDataInput(agora())}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
