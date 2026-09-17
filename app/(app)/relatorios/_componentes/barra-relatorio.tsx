import { agora, formatarDataHora } from "@/lib/datas";
import { atalhosComIntervalo, type Periodo } from "@/lib/servicos/relatorios-calculos";
import type { TipoExportacao } from "@/lib/servicos/relatorios";
import { BotaoImprimir } from "./botao-imprimir";
import { FiltroPeriodo } from "./filtro-periodo";
import { LinkExportar } from "./link-exportar";

/**
 * Topo comum de cada relatório: filtro de período, título, período legível e
 * botões de exportar/imprimir. Na impressão só título e período aparecem.
 */
export function BarraRelatorio({
  periodo,
  titulo,
  descricao,
  exportacao,
  extras = {},
  filtros,
}: {
  periodo: Periodo;
  titulo: string;
  descricao: string;
  /** Tipo do CSV principal deste relatório. Sem valor, o botão não aparece. */
  exportacao?: TipoExportacao;
  /** Parâmetros da página que precisam sobreviver à troca de período e ir pro CSV. */
  extras?: Record<string, string>;
  /** Filtros específicos da página (ex.: categoria), renderizados ao lado dos botões. */
  filtros?: React.ReactNode;
}) {
  return (
    <>
      <FiltroPeriodo de={periodo.de} ate={periodo.ate} atalhoAtivo={periodo.atalho} atalhos={atalhosComIntervalo()} extras={extras} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-texto">{titulo}</h2>
          <p className="mt-0.5 text-sm text-texto-suave">
            <span className="font-medium text-texto">{periodo.rotulo}</span>
            <span aria-hidden> · </span>
            {periodo.dias === 1 ? "1 dia" : `${periodo.dias} dias`}
            <span className="nao-imprimir">
              <span aria-hidden> · </span>
              {descricao}
            </span>
          </p>
          <p className="hidden text-xs text-texto-fraco print:block">Gerado em {formatarDataHora(agora())}.</p>
        </div>
        <div className="nao-imprimir flex flex-wrap items-center gap-2">
          {filtros}
          {exportacao ? <LinkExportar tipo={exportacao} periodo={periodo} extras={extras} /> : null}
          <BotaoImprimir />
        </div>
      </div>
    </>
  );
}
