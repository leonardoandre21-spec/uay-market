import { Selo, type TomSelo } from "@/components/ui/selo";
import type { StatusConta } from "@prisma/client";
import { ROTULO_STATUS_CONTA } from "@/lib/rotulos";

/** Selo dos dias até o vencimento: atrasada em vermelho, hoje em âmbar. */
export function SeloDias({ dias, status }: { dias: number; status: StatusConta }) {
  if (status === "PAGA") return <Selo tom="sucesso">Paga</Selo>;
  if (status === "CANCELADA") return <Selo tom="neutro">Cancelada</Selo>;
  if (dias < 0) {
    const n = Math.abs(dias);
    return <Selo tom="perigo">{n === 1 ? "Atrasada há 1 dia" : `Atrasada há ${n} dias`}</Selo>;
  }
  if (dias === 0) return <Selo tom="alerta">Vence hoje</Selo>;
  if (dias === 1) return <Selo tom="info">Vence amanhã</Selo>;
  if (dias <= 7) return <Selo tom="info">Em {dias} dias</Selo>;
  return <Selo tom="neutro">Em {dias} dias</Selo>;
}

export function SeloStatusConta({ status, dias }: { status: StatusConta; dias: number }) {
  const tom: TomSelo = status === "PAGA" ? "sucesso" : status === "CANCELADA" ? "neutro" : dias < 0 ? "perigo" : dias === 0 ? "alerta" : "info";
  const texto = status === "PENDENTE" && dias < 0 ? "Atrasada" : ROTULO_STATUS_CONTA[status];
  return <Selo tom={tom}>{texto}</Selo>;
}
