"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, TrendingDown } from "lucide-react";
import type { MotivoPerda } from "@prisma/client";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { Dialogo } from "@/components/ui/dialogo";
import { FormularioAcao } from "@/components/ui/formulario-acao";
import { Aviso } from "@/components/ui/aviso";
import { EstadoVazio } from "@/components/ui/pagina";
import { Selo, type TomSelo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { formatarQuantidade, formatarReais } from "@/lib/dinheiro";
import { ROTULO_MOTIVO_PERDA } from "@/lib/rotulos";
import { estornarPerdaAction } from "../actions";
import { DialogoPerda } from "./dialogo-perda";

export type PerdaLinha = {
  id: number;
  data: string;
  produtoId: number;
  produtoNome: string;
  unidade: "UN" | "KG";
  loteValidade: string | null;
  motivo: MotivoPerda;
  observacao: string | null;
  quantidade: number;
  custoUnitario: number;
  valorTotal: number;
  usuarioNome: string | null;
};

export const TOM_MOTIVO: Record<MotivoPerda, TomSelo> = {
  VENCIDO: "perigo",
  AVARIA: "alerta",
  FURTO: "perigo",
  QUEBRA: "alerta",
  CONSUMO_INTERNO: "info",
  OUTRO: "neutro",
};

/** Botão do cabeçalho que abre o diálogo de perda. */
export function BotaoRegistrarPerda() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Botao onClick={() => setAberto(true)}>
        <Plus className="size-4" aria-hidden /> Registrar perda
      </Botao>
      <DialogoPerda aberto={aberto} aoFechar={() => setAberto(false)} />
    </>
  );
}

export function TabelaPerdas({ perdas, admin }: { perdas: PerdaLinha[]; admin: boolean }) {
  const router = useRouter();
  const [estornando, setEstornando] = useState<PerdaLinha | null>(null);
  const [registrando, setRegistrando] = useState(false);

  if (perdas.length === 0) {
    return (
      <>
        <EstadoVazio
          icone={<TrendingDown />}
          titulo="Nenhuma perda neste período"
          descricao="Quando um produto vencer, quebrar ou sumir, registre aqui pra tirar do estoque e contar no lucro real."
          acao={
            <Botao onClick={() => setRegistrando(true)}>
              <Plus className="size-4" aria-hidden /> Registrar perda
            </Botao>
          }
        />
        <DialogoPerda aberto={registrando} aoFechar={() => setRegistrando(false)} />
      </>
    );
  }

  const total = perdas.reduce((acc, p) => acc + p.valorTotal, 0);

  return (
    <>
      <Tabela>
        <Thead>
          <Tr>
            <Th>Data</Th>
            <Th>Produto</Th>
            <Th>Motivo</Th>
            <Th numerico>Quantidade</Th>
            <Th numerico>Custo unit.</Th>
            <Th numerico>Valor</Th>
            <Th>Usuário</Th>
            {admin ? <Th className="text-right">Ações</Th> : null}
          </Tr>
        </Thead>
        <Tbody>
          {perdas.map((p) => (
            <Tr key={p.id}>
              <Td className="whitespace-nowrap text-texto-suave">{p.data}</Td>
              <Td>
                <p className="font-medium text-texto">{p.produtoNome}</p>
                <p className="text-xs text-texto-fraco">
                  {[p.loteValidade ? `Lote validade ${p.loteValidade}` : null, p.observacao].filter(Boolean).join(" · ")}
                </p>
              </Td>
              <Td>
                <Selo tom={TOM_MOTIVO[p.motivo]}>{ROTULO_MOTIVO_PERDA[p.motivo]}</Selo>
              </Td>
              <Td numerico>
                {formatarQuantidade(p.quantidade, p.unidade)} <span className="text-xs text-texto-fraco">{p.unidade === "KG" ? "kg" : "un"}</span>
              </Td>
              <Td numerico className="text-texto-suave">{formatarReais(p.custoUnitario)}</Td>
              <Td numerico className="font-medium text-perigo">{formatarReais(p.valorTotal)}</Td>
              <Td className="text-texto-suave">{p.usuarioNome ?? <span className="text-texto-fraco">Sistema</span>}</Td>
              {admin ? (
                <Td className="text-right">
                  <Botao variante="fantasma" tamanho="sm" onClick={() => setEstornando(p)}>
                    <RotateCcw className="size-4" aria-hidden /> Estornar
                  </Botao>
                </Td>
              ) : null}
            </Tr>
          ))}
        </Tbody>
        <tfoot className="border-t border-borda bg-superficie-2 text-sm">
          <tr>
            <td colSpan={5} className="px-4 py-2.5 font-medium text-texto">
              Total do período ({perdas.length} registro(s))
            </td>
            <td className="px-4 py-2.5 text-right font-semibold text-perigo tabular">{formatarReais(total)}</td>
            <td colSpan={admin ? 2 : 1} />
          </tr>
        </tfoot>
      </Tabela>

      <Dialogo aberto={estornando !== null} aoFechar={() => setEstornando(null)} titulo="Estornar perda" descricao="A quantidade volta pro estoque (e pro lote, se houver) e a perda deixa de contar no lucro." largura="sm">
        {estornando ? (
          <FormularioAcao
            key={estornando.id}
            acao={estornarPerdaAction}
            mensagemSucesso="Perda estornada. O estoque foi devolvido."
            aoSucesso={() => {
              router.refresh();
              setEstornando(null);
            }}
            className="flex flex-col gap-4"
          >
            {(_estado, pendente) => (
              <>
                <input type="hidden" name="perdaId" value={estornando.id} />
                <div className="rounded-padrao bg-superficie-2 px-4 py-3 text-sm">
                  <p className="font-medium text-texto">{estornando.produtoNome}</p>
                  <p className="text-texto-suave">
                    {formatarQuantidade(estornando.quantidade, estornando.unidade)} {estornando.unidade === "KG" ? "kg" : "un"} · {ROTULO_MOTIVO_PERDA[estornando.motivo]} ·{" "}
                    {formatarReais(estornando.valorTotal)} · {estornando.data}
                  </p>
                </div>
                <Aviso tom="alerta">Use só se a perda foi registrada por engano. Fica registrado quem estornou.</Aviso>
                <div className="flex justify-end gap-2">
                  <Botao type="button" variante="fantasma" onClick={() => setEstornando(null)} disabled={pendente}>
                    Cancelar
                  </Botao>
                  <BotaoEnviar variante="perigo">Estornar perda</BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        ) : null}
      </Dialogo>
    </>
  );
}
