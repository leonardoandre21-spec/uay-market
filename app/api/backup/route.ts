import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { gerarBackup, lerBackup } from "@/lib/servicos/configuracoes";

export const dynamic = "force-dynamic";

/**
 * GET /api/backup: gera um backup íntegro agora (VACUUM INTO) e devolve o
 * arquivo pra download. Só administrador (o middleware garante login; o papel
 * é conferido aqui porque /api não está na lista de rotas só-admin).
 */
export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  if (sessao.papel !== "ADMIN") {
    return NextResponse.json({ ok: false, erro: "Apenas administradores podem baixar o backup." }, { status: 403 });
  }

  try {
    const info = await gerarBackup("manual", sessao.usuarioId);
    const arquivo = await lerBackup(info.nome);
    if (!arquivo) throw new Error("O backup foi gerado, mas não pôde ser lido.");
    await registrarAuditoria({
      usuarioId: sessao.usuarioId,
      acao: "backup.baixar",
      entidade: "Backup",
      detalhes: { nome: info.nome, tamanho: arquivo.tamanho },
    });
    return new NextResponse(new Uint8Array(arquivo.conteudo), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Length": String(arquivo.tamanho),
        "Content-Disposition": `attachment; filename="${info.nome}"`,
        "Cache-Control": "no-store",
        "X-Backup-Nome": info.nome,
      },
    });
  } catch (e) {
    console.error("Falha ao gerar backup", e);
    const mensagem = e instanceof Error && e.message ? e.message : "Não foi possível gerar o backup.";
    return NextResponse.json({ ok: false, erro: mensagem }, { status: 500 });
  }
}
