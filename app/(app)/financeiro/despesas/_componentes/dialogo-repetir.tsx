"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { CaixaSelecao } from "@/components/ui/campo";
import { Dialogo } from "@/components/ui/dialogo";
import { FormularioAcao } from "@/components/ui/formulario-acao";
import { useToast } from "@/components/ui/toast";
import { formatarReais } from "@/lib/dinheiro";
import { repetirDespesasAcao } from "../actions";

export type DespesaRepetivel = {
  id: number;
  descricao: string;
  valor: number;
  dataFormatada: string;
  categoriaNome: string | null;
  fornecedorNome: string | null;
};

/**
 * "Repetir do mês anterior": lista as despesas do mês anterior (sem as de
 * boleto) com checklist e copia as marcadas pro mês em tela.
 */
export function DialogoRepetir({
  despesas,
  mesDestino,
  rotuloMesOrigem,
  rotuloMesDestino,
}: {
  despesas: DespesaRepetivel[];
  mesDestino: string; // yyyy-MM
  rotuloMesOrigem: string;
  rotuloMesDestino: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());

  const total = useMemo(
    () => despesas.filter((d) => marcadas.has(d.id)).reduce((acc, d) => acc + d.valor, 0),
    [despesas, marcadas],
  );
  const todasMarcadas = despesas.length > 0 && marcadas.size === despesas.length;

  function alternar(id: number, marcar: boolean) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (marcar) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  function abrir() {
    setMarcadas(new Set(despesas.map((d) => d.id)));
    setAberto(true);
  }

  return (
    <>
      <Botao
        variante="contorno"
        onClick={abrir}
        disabled={!despesas.length}
        title={despesas.length ? `Copiar despesas de ${rotuloMesOrigem} pra ${rotuloMesDestino}` : `Não há despesas em ${rotuloMesOrigem} pra repetir`}
      >
        <CopyPlus className="size-4" aria-hidden />
        Repetir do mês anterior
      </Botao>

      {aberto ? (
        <Dialogo
          aberto={aberto}
          aoFechar={() => setAberto(false)}
          titulo="Repetir despesas do mês anterior"
          descricao={`Marque o que se repete em ${rotuloMesDestino}. As cópias entram no mesmo dia do mês, sem marcação de caixa; as que já existem com a mesma descrição e valor são puladas.`}
          largura="lg"
        >
          <FormularioAcao
            acao={repetirDespesasAcao}
            aoSucesso={(r) => {
              const partes = [`${r.criadas} ${r.criadas === 1 ? "despesa copiada" : "despesas copiadas"} pra ${rotuloMesDestino}.`];
              if (r.ignoradas > 0) partes.push(`${r.ignoradas} já ${r.ignoradas === 1 ? "existia" : "existiam"} e ${r.ignoradas === 1 ? "foi pulada" : "foram puladas"}.`);
              toast.sucesso(partes.join(" "));
              setAberto(false);
              router.refresh();
            }}
            className="flex flex-col gap-4"
          >
            {(_estado, pendente) => (
              <>
                <input type="hidden" name="mesDestino" value={mesDestino} />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <CaixaSelecao
                    rotulo={todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
                    checked={todasMarcadas}
                    onChange={(e) => setMarcadas(e.target.checked ? new Set(despesas.map((d) => d.id)) : new Set())}
                  />
                  <span className="text-texto-suave">
                    {marcadas.size} de {despesas.length} · <span className="font-medium text-texto tabular">{formatarReais(total)}</span>
                  </span>
                </div>

                <ul className="max-h-80 divide-y divide-borda overflow-y-auto rounded-padrao border border-borda">
                  {despesas.map((d) => {
                    const marcada = marcadas.has(d.id);
                    return (
                      <li key={d.id} className="flex items-center gap-3 px-3 py-2 hover:bg-superficie-2/60">
                        <input
                          id={`rep-${d.id}`}
                          type="checkbox"
                          name="ids"
                          value={d.id}
                          checked={marcada}
                          onChange={(e) => alternar(d.id, e.target.checked)}
                          className="size-4 accent-primaria"
                        />
                        <label htmlFor={`rep-${d.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-texto">{d.descricao}</span>
                            <span className="block truncate text-xs text-texto-fraco">
                              {[d.dataFormatada, d.categoriaNome, d.fornecedorNome].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm tabular text-texto">{formatarReais(d.valor)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex justify-end gap-2 border-t border-borda pt-4">
                  <Botao type="button" variante="fantasma" onClick={() => setAberto(false)} disabled={pendente}>
                    Cancelar
                  </Botao>
                  <BotaoEnviar disabled={marcadas.size === 0}>
                    Copiar {marcadas.size > 0 ? `${marcadas.size} ` : ""}pra {rotuloMesDestino}
                  </BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        </Dialogo>
      ) : null}
    </>
  );
}
