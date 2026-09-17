"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, LockKeyhole } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { DialogoMovimento } from "@/app/(app)/caixa/_componentes/dialogo-movimento";
import { DialogoFecharCaixa } from "@/app/(app)/caixa/_componentes/dialogo-fechar-caixa";

type Dialogo = "SANGRIA" | "SUPRIMENTO" | "FECHAR" | null;

/** Botões do painel do caixa aberto: sangria, suprimento e fechamento, cada um com seu diálogo. */
export function AcoesSessao({
  sessaoId,
  dinheiroEsperado,
  podeFechar,
  resumo,
}: {
  sessaoId: number;
  dinheiroEsperado: number;
  podeFechar: boolean;
  resumo: { vendasQuantidade: number; vendasTotal: number; sangrias: number; suprimentos: number };
}) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const fechar = () => setDialogo(null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Botao variante="contorno" onClick={() => setDialogo("SANGRIA")}>
          <ArrowDownToLine className="size-4" aria-hidden />
          Sangria
        </Botao>
        <Botao variante="contorno" onClick={() => setDialogo("SUPRIMENTO")}>
          <ArrowUpFromLine className="size-4" aria-hidden />
          Suprimento
        </Botao>
        <Botao
          variante="primaria"
          onClick={() => setDialogo("FECHAR")}
          disabled={!podeFechar}
          title={podeFechar ? undefined : "Este caixa foi aberto por outro usuário. Só um administrador pode fechá-lo."}
        >
          <LockKeyhole className="size-4" aria-hidden />
          Fechar caixa
        </Botao>
      </div>

      <DialogoMovimento
        tipo="SANGRIA"
        aberto={dialogo === "SANGRIA"}
        aoFechar={fechar}
        sessaoId={sessaoId}
        dinheiroEsperado={dinheiroEsperado}
      />
      <DialogoMovimento
        tipo="SUPRIMENTO"
        aberto={dialogo === "SUPRIMENTO"}
        aoFechar={fechar}
        sessaoId={sessaoId}
        dinheiroEsperado={dinheiroEsperado}
      />
      {podeFechar ? (
        <DialogoFecharCaixa
          aberto={dialogo === "FECHAR"}
          aoFechar={fechar}
          sessaoId={sessaoId}
          dinheiroEsperado={dinheiroEsperado}
          resumo={resumo}
        />
      ) : null}
    </>
  );
}
