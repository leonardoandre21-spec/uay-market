import { ArrowLeft } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { BotaoLink } from "../_componentes/botao-link";
import { ImportadorCsv } from "../_componentes/importador-csv";

export const metadata = { title: "Importar produtos" };

export default async function PaginaImportarProdutos() {
  await exigirAdmin();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <CabecalhoPagina
        titulo="Importar produtos por CSV"
        descricao="Traga a planilha do seu sistema antigo ou do fornecedor. Você confere tudo antes de gravar."
        acoes={
          <BotaoLink href="/produtos" variante="fantasma">
            <ArrowLeft className="size-4" aria-hidden />
            Voltar pra produtos
          </BotaoLink>
        }
      />
      <ImportadorCsv />
    </div>
  );
}
