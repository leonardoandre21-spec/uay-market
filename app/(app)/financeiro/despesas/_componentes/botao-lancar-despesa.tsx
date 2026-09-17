"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import type { Opcao } from "../../_componentes/tipos";
import { DialogoDespesa } from "./dialogo-despesa";

export function BotaoLancarDespesa({
  categorias,
  fornecedores,
  caixaAberto,
  dataPadrao,
  variante = "primaria",
}: {
  categorias: Opcao[];
  fornecedores: Opcao[];
  caixaAberto: boolean;
  dataPadrao: string;
  variante?: "primaria" | "contorno";
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Botao variante={variante} onClick={() => setAberto(true)}>
        <Plus className="size-4" aria-hidden />
        Lançar despesa
      </Botao>
      {aberto ? (
        <DialogoDespesa
          aberto={aberto}
          aoFechar={() => setAberto(false)}
          categorias={categorias}
          fornecedores={fornecedores}
          caixaAberto={caixaAberto}
          dataPadrao={dataPadrao}
        />
      ) : null}
    </>
  );
}
