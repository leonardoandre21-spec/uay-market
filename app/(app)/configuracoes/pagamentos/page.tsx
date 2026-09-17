import { exigirAdmin } from "@/lib/auth";
import { obterConfiguracoesPagamento } from "@/lib/consultas";
import { FORMAS_PAGAMENTO } from "@/lib/rotulos";
import { FormularioPagamentos, type FormaSerializada } from "./_componentes/formulario-pagamentos";

export const dynamic = "force-dynamic";

export default async function PaginaPagamentos() {
  await exigirAdmin();
  const configs = await obterConfiguracoesPagamento();
  // Ordem fixa das cinco formas, como o operador vê no caixa.
  const formas: FormaSerializada[] = FORMAS_PAGAMENTO.map((forma) => {
    const c = configs.find((x) => x.forma === forma);
    return {
      forma,
      ativo: c?.ativo ?? true,
      taxaPercentual: c?.taxaPercentual ?? 0,
      taxaFixa: c?.taxaFixa ?? 0,
      prazoRecebimentoDias: c?.prazoRecebimentoDias ?? 0,
      maxParcelas: c?.maxParcelas ?? 1,
    };
  });
  return <FormularioPagamentos formas={formas} />;
}
