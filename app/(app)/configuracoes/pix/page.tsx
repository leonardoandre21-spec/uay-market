import { exigirAdmin } from "@/lib/auth";
import { obterConfiguracao } from "@/lib/consultas";
import { FormularioPix } from "./_componentes/formulario-pix";

export const dynamic = "force-dynamic";

export default async function PaginaPix() {
  await exigirAdmin();
  const config = await obterConfiguracao();
  return (
    <FormularioPix
      pix={{ pixChave: config.pixChave, pixNomeRecebedor: config.pixNomeRecebedor, pixCidade: config.pixCidade }}
    />
  );
}
