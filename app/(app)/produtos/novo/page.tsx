import { ArrowLeft, ScanBarcode } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { listarCategorias } from "@/lib/consultas";
import { destinoSeguro, normalizarCodigo } from "@/lib/servicos/produtos-calculos";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { BotaoLink } from "../_componentes/botao-link";
import { FormularioProduto } from "../_componentes/formulario-produto";

export const metadata = { title: "Novo produto" };

export default async function PaginaNovoProduto({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sessao, categorias, params] = await Promise.all([exigirSessao(), listarCategorias(), searchParams]);

  const um = (chave: string) => {
    const v = params[chave];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const codigoBruto = normalizarCodigo(um("codigo"));
  const codigoInicial = /^\d{1,20}$/.test(codigoBruto) ? codigoBruto : undefined;
  const voltarBruto = um("voltar").trim();
  const voltar = voltarBruto ? destinoSeguro(voltarBruto, "/produtos") : undefined;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <CabecalhoPagina
        titulo="Novo produto"
        descricao="Preencha o básico e o produto já pode ser vendido no caixa."
        acoes={
          <BotaoLink href={voltar ?? "/produtos"} variante="fantasma">
            <ArrowLeft className="size-4" aria-hidden />
            {voltar?.startsWith("/pdv") ? "Voltar pro caixa" : "Voltar pra lista"}
          </BotaoLink>
        }
      />

      {codigoInicial ? (
        <Aviso tom="info" titulo="Código lido no caixa e ainda não cadastrado">
          <span className="inline-flex items-center gap-1.5">
            <ScanBarcode className="size-4" aria-hidden />
            O código <span className="font-mono font-medium">{codigoInicial}</span> já está preenchido. Complete o
            nome e o preço pra vender agora mesmo.
          </span>
        </Aviso>
      ) : null}

      <FormularioProduto categorias={categorias} papel={sessao.papel} codigoInicial={codigoInicial} voltar={voltar} />
    </div>
  );
}
