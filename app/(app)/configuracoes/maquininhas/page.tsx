import { exigirAdmin } from "@/lib/auth";
import { listarMaquininhas } from "@/lib/servicos/maquininhas";
import { GerenciarMaquininhas, type MaquininhaSerializada } from "./_componentes/gerenciar-maquininhas";

export const dynamic = "force-dynamic";

export default async function PaginaMaquininhas() {
  await exigirAdmin();
  const lista = await listarMaquininhas();
  const maquininhas: MaquininhaSerializada[] = lista.map((m) => ({
    id: m.id,
    nome: m.nome,
    adquirente: m.adquirente,
    ativo: m.ativo,
    padrao: m.padrao,
    taxaDebito: m.taxaDebito,
    taxaCredito: m.taxaCredito,
    taxaCreditoParcelado: m.taxaCreditoParcelado,
    taxaPix: m.taxaPix,
    prazoDebitoDias: m.prazoDebitoDias,
    prazoCreditoDias: m.prazoCreditoDias,
    prazoPixDias: m.prazoPixDias,
    observacao: m.observacao,
    pagamentos: m._count.pagamentos,
  }));
  return <GerenciarMaquininhas maquininhas={maquininhas} />;
}
