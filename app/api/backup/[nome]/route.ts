import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerBackup } from "@/lib/servicos/configuracoes";
import { nomeBackupValido } from "@/lib/servicos/configuracoes-regras";

export const dynamic = "force-dynamic";

/** GET /api/backup/<nome>.db: baixa um backup já existente na pasta backups/. */
export async function GET(_req: Request, { params }: { params: Promise<{ nome: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  if (sessao.papel !== "ADMIN") {
    return NextResponse.json({ ok: false, erro: "Apenas administradores podem baixar backups." }, { status: 403 });
  }

  const { nome } = await params;
  // Regex fechada: nada de barras, ".." ou extensão diferente de .db.
  if (!nomeBackupValido(nome)) {
    return NextResponse.json({ ok: false, erro: "Nome de arquivo inválido." }, { status: 400 });
  }
  const arquivo = await lerBackup(nome);
  if (!arquivo) return NextResponse.json({ ok: false, erro: "Backup não encontrado." }, { status: 404 });

  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "backup.baixar",
    entidade: "Backup",
    detalhes: { nome, tamanho: arquivo.tamanho },
  });
  return new NextResponse(new Uint8Array(arquivo.conteudo), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(arquivo.tamanho),
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
