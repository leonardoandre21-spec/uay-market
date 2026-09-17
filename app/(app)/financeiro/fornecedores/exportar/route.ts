import { obterSessao } from "@/lib/auth";
import { gerarCsvFornecedores, nomeArquivoCsvFornecedores } from "@/lib/servicos/fornecedores";

export const dynamic = "force-dynamic";

/** Download da lista de fornecedores em CSV (abre no Excel). Só ADMIN. */
export async function GET(): Promise<Response> {
  const sessao = await obterSessao();
  if (!sessao) return new Response("Faça login pra exportar.", { status: 401 });
  if (sessao.papel !== "ADMIN") return new Response("Apenas administradores podem exportar.", { status: 403 });

  const csv = await gerarCsvFornecedores();
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivoCsvFornecedores()}"`,
      "Cache-Control": "no-store",
    },
  });
}
