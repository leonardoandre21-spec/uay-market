import { exigirAdmin } from "@/lib/auth";
import { obterConfiguracao } from "@/lib/consultas";
import { FormularioLoja } from "./_componentes/formulario-loja";

export const dynamic = "force-dynamic";

export default async function PaginaLoja() {
  await exigirAdmin();
  const config = await obterConfiguracao();
  return (
    <FormularioLoja
      loja={{
        nomeLoja: config.nomeLoja,
        cnpj: config.cnpj,
        endereco: config.endereco,
        telefone: config.telefone,
        mensagemCupom: config.mensagemCupom,
      }}
    />
  );
}
