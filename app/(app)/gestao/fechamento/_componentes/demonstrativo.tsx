import { formatarPercentual, formatarReais } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import { capitalizar, formatarVariacao, type LinhaDre } from "@/lib/servicos/gestao-calculos";

/** Cor da variação: em receita e resultado, subir é bom; em dedução, subir é ruim. */
function classeVariacao(linha: LinhaDre): string {
  if (linha.variacaoBp === null || linha.variacaoBp === 0) return "text-texto-fraco";
  const subiu = linha.variacaoBp > 0;
  const bomSubir = linha.tipo === "receita" || linha.tipo === "resultado";
  return subiu === bomSubir ? "text-sucesso" : "text-perigo";
}

/** DRE simplificada no formato de demonstrativo: mês, mês anterior, variação e margem. */
export function Demonstrativo({
  linhas,
  rotuloMes,
  rotuloMesAnterior,
}: {
  linhas: LinhaDre[];
  rotuloMes: string;
  rotuloMesAnterior: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-texto-suave">
          <tr className="border-b border-borda">
            <th className="px-4 py-2.5 text-left font-medium">Linha</th>
            <th className="px-4 py-2.5 text-right font-medium">{capitalizar(rotuloMes)}</th>
            <th className="px-4 py-2.5 text-right font-medium">{capitalizar(rotuloMesAnterior)}</th>
            <th className="px-4 py-2.5 text-right font-medium">Variação</th>
            <th className="px-4 py-2.5 text-right font-medium">Margem</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const resultado = l.tipo === "resultado";
            const detalhe = l.tipo === "detalhe";
            const negativo = resultado && l.valor < 0;
            return (
              <tr
                key={l.chave}
                className={cn(
                  "border-b border-borda last:border-0",
                  resultado && "bg-superficie-2/60 font-semibold",
                  detalhe && "text-texto-suave",
                )}
              >
                <td className={cn("px-4 py-2", detalhe ? "pl-10 text-xs" : "text-texto", resultado && "text-base")}>
                  {l.rotulo}
                </td>
                <td
                  className={cn(
                    "px-4 py-2 text-right tabular",
                    resultado ? (negativo ? "text-perigo" : "text-sucesso") : detalhe ? "" : "text-texto",
                    resultado && "text-base",
                  )}
                >
                  {formatarReais(l.valor)}
                </td>
                <td className="px-4 py-2 text-right tabular text-texto-suave">{formatarReais(l.valorAnterior)}</td>
                <td className={cn("px-4 py-2 text-right text-xs tabular", classeVariacao(l))}>{formatarVariacao(l.variacaoBp)}</td>
                <td className="px-4 py-2 text-right text-xs tabular text-texto-suave">
                  {l.margemBp !== undefined ? (
                    <>
                      <span className={cn("font-medium", l.margemBp < 0 ? "text-perigo" : "text-texto")}>{formatarPercentual(l.margemBp, 1)}</span>
                      {l.margemAnteriorBp !== undefined ? (
                        <span className="ml-1 text-texto-fraco">(antes {formatarPercentual(l.margemAnteriorBp, 1)})</span>
                      ) : null}
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
