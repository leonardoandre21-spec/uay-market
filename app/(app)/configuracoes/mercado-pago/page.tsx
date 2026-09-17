import { exigirAdmin } from "@/lib/auth";
import { obterConfiguracao } from "@/lib/consultas";
import { tipoTokenMercadoPago } from "@/lib/servicos/configuracoes-regras";
import { PainelMercadoPago } from "./_componentes/painel-mercado-pago";

export const dynamic = "force-dynamic";

export default async function PaginaMercadoPago() {
  await exigirAdmin();
  const config = await obterConfiguracao();
  // O token nunca vai pro navegador: só se existe e de que tipo é.
  return (
    <PainelMercadoPago
      estado={{
        tokenConfigurado: Boolean(config.mpAccessToken),
        tipoToken: tipoTokenMercadoPago(config.mpAccessToken),
        mpDeviceId: config.mpDeviceId,
        mpUserId: config.mpUserId,
      }}
    />
  );
}
