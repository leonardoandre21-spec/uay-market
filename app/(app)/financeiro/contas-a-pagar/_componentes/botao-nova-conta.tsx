"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import type { Opcao } from "../../_componentes/tipos";
import { DialogoConta } from "./dialogo-conta";

export function BotaoNovaConta({
  fornecedores,
  categorias,
  vencimentoPadrao,
  variante = "primaria",
}: {
  fornecedores: Opcao[];
  categorias: Opcao[];
  vencimentoPadrao: string;
  variante?: "primaria" | "contorno";
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Botao variante={variante} onClick={() => setAberto(true)}>
        <Plus className="size-4" aria-hidden />
        Novo boleto
      </Botao>
      {aberto ? (
        <DialogoConta aberto={aberto} aoFechar={() => setAberto(false)} fornecedores={fornecedores} categorias={categorias} vencimentoPadrao={vencimentoPadrao} />
      ) : null}
    </>
  );
}
