"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { DialogoFornecedor } from "./dialogo-fornecedor";

export function BotaoNovoFornecedor({ variante = "primaria" }: { variante?: "primaria" | "contorno" }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Botao variante={variante} onClick={() => setAberto(true)}>
        <Plus className="size-4" aria-hidden />
        Novo fornecedor
      </Botao>
      {aberto ? <DialogoFornecedor aberto={aberto} aoFechar={() => setAberto(false)} /> : null}
    </>
  );
}
