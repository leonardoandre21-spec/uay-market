import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirAdmin } from "@/lib/auth";
import { listarCategoriasDespesa, listarFornecedoresAtivos } from "@/lib/consultas";
import { agora, paraDataInput } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { FormularioEntrada } from "../../_componentes/formulario-entrada";

export const dynamic = "force-dynamic";

export default async function PaginaNovaEntrada() {
  await exigirAdmin();
  const [fornecedores, categoriasDespesa] = await Promise.all([listarFornecedoresAtivos(), listarCategoriasDespesa()]);

  return (
    <div>
      <Link href="/estoque/entradas" className="mb-3 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto">
        <ArrowLeft className="size-4" aria-hidden /> Voltar pras entradas
      </Link>
      <CabecalhoPagina
        titulo="Nova entrada de mercadoria"
        descricao="Lance a nota do fornecedor: o estoque sobe, o custo médio é recalculado e os lotes com validade ficam registrados."
      />
      <FormularioEntrada
        fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
        categoriasDespesa={categoriasDespesa.map((c) => ({ id: c.id, nome: c.nome }))}
        hoje={paraDataInput(agora())}
      />
    </div>
  );
}
