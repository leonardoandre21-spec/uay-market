import { exigirAdmin } from "@/lib/auth";
import { obterConfiguracao } from "@/lib/consultas";
import { FormularioMetas } from "./_componentes/formulario-metas";

export const dynamic = "force-dynamic";

export default async function PaginaMetas() {
  await exigirAdmin();
  const config = await obterConfiguracao();
  return (
    <FormularioMetas
      metas={{
        metaVendasDiaria: config.metaVendasDiaria,
        metaVendasMensal: config.metaVendasMensal,
        alertaVencimentoDias: config.alertaVencimentoDias,
        permitirVendaSemEstoque: config.permitirVendaSemEstoque,
        permitirDescontoOperador: config.permitirDescontoOperador,
        descontoMaximoPercentual: config.descontoMaximoPercentual,
      }}
    />
  );
}
