import { obterSessao } from "@/lib/auth";
import { agora, paraDataInput } from "@/lib/datas";
import { listarProdutosParaExportar } from "@/lib/servicos/produtos";
import {
  CABECALHO_EXPORTACAO,
  CABECALHO_MODELO,
  LINHAS_EXEMPLO_MODELO,
  gerarCsv,
  lerFiltrosProdutos,
  linhaExportacao,
} from "@/lib/servicos/produtos-calculos";

// GET /produtos/exportar            -> todos os produtos (ativos e inativos)
// GET /produtos/exportar?situacao=..&categoria=..&busca=.. -> respeita os filtros da lista
// GET /produtos/exportar?modelo=1   -> planilha modelo pra importação
//
// CSV com ; e BOM UTF-8 pra abrir direto no Excel em português.

export const dynamic = "force-dynamic";

function respostaCsv(csv: string, nomeArquivo: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const sessao = await obterSessao();
  if (!sessao) return new Response("Faça login pra exportar.", { status: 401 });

  const url = new URL(request.url);
  const hoje = paraDataInput(agora());

  if (url.searchParams.get("modelo") === "1") {
    const csv = gerarCsv([[...CABECALHO_MODELO], ...LINHAS_EXEMPLO_MODELO], ";", true);
    return respostaCsv(csv, "modelo-produtos.csv");
  }

  const filtros = lerFiltrosProdutos(Object.fromEntries(url.searchParams.entries()), "todos");
  const produtos = await listarProdutosParaExportar({ ...filtros, pagina: 1 });
  const linhas = [
    [...CABECALHO_EXPORTACAO],
    ...produtos.map((p) => linhaExportacao({ ...p, categoria: p.categoria?.nome ?? null })),
  ];
  return respostaCsv(gerarCsv(linhas, ";", true), `produtos-${hoje}.csv`);
}
