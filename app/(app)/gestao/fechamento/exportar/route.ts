import { NextResponse, type NextRequest } from "next/server";
import { obterSessao } from "@/lib/auth";
import { parseMesInput } from "@/lib/datas";
import { coletarEntradasDre, mesAtual, periodosDoFechamento } from "@/lib/servicos/gestao";
import { chaveMes, linhasDre, montarCsvDre, montarDre, rotuloMes } from "@/lib/servicos/gestao-calculos";

export const dynamic = "force-dynamic";

/** GET /gestao/fechamento/exportar?mes=yyyy-MM -> CSV do demonstrativo do mês (Excel em português). */
export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  if (sessao.papel !== "ADMIN") {
    return NextResponse.json({ ok: false, erro: "Apenas administradores podem exportar o fechamento." }, { status: 403 });
  }

  const { ano, mes } = parseMesInput(req.nextUrl.searchParams.get("mes")) ?? mesAtual();
  // Mesma comparação da tela: mês em andamento compara com o mês anterior até o mesmo dia.
  const { periodo, periodoAnterior, ehMesAtual, comparacao } = periodosDoFechamento(ano, mes);
  const [entradas, entradasAnterior] = await Promise.all([
    coletarEntradasDre(periodo),
    coletarEntradasDre(periodoAnterior),
  ]);
  const linhas = linhasDre(montarDre(entradas), montarDre(entradasAnterior));
  const rotuloAtual = ehMesAtual ? `${rotuloMes(ano, mes)} até hoje` : rotuloMes(ano, mes);
  const csv = montarCsvDre(linhas, rotuloAtual, comparacao.rotulo);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fechamento-${chaveMes(ano, mes)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
