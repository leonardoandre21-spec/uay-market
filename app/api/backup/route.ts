import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/auth";
import { agora } from "@/lib/datas";
import { exportarBackup } from "@/lib/servicos/backup";
import { nomeArquivoBackup } from "@/lib/servicos/backup-calculos";

export const dynamic = "force-dynamic";

/**
 * GET /api/backup: exporta todas as tabelas em JSON e devolve como download
 * uay-market-AAAAMMDD-HHMM.json. Só administrador (o middleware garante login;
 * o papel é conferido aqui porque /api não está na lista de rotas só-admin).
 */
export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  if (sessao.papel !== "ADMIN") {
    return NextResponse.json({ ok: false, erro: "Apenas administradores podem baixar o backup." }, { status: 403 });
  }

  try {
    const arquivo = await exportarBackup(sessao.usuarioId);
    const nome = nomeArquivoBackup(agora());
    const corpo = JSON.stringify(arquivo);
    return new NextResponse(corpo, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(corpo, "utf8")),
        "Content-Disposition": `attachment; filename="${nome}"`,
        "Cache-Control": "no-store",
        "X-Backup-Nome": nome,
      },
    });
  } catch (e) {
    console.error("Falha ao exportar backup", e);
    const mensagem = e instanceof Error && e.message ? e.message : "Não foi possível gerar o backup.";
    return NextResponse.json({ ok: false, erro: mensagem }, { status: 500 });
  }
}
