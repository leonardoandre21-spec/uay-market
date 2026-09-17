// Converte os estornos antigos de fiado, gravados como PAGAMENTO com observação
// "Cancelamento da venda nº X" (sem forma de pagamento, com venda), pro tipo
// próprio ESTORNO. Idempotente: roda de novo e não acha mais nada.
// Rodar: npx tsx --env-file=.env scripts/migrar-estorno-fiado.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const filtro = {
    tipo: "PAGAMENTO" as const,
    formaPagamento: null,
    vendaId: { not: null },
    observacao: { startsWith: "Cancelamento da venda" },
  };
  const candidatos = await db.lancamentoFiado.findMany({
    where: filtro,
    select: { id: true, clienteId: true, vendaId: true, valor: true, observacao: true },
    orderBy: { id: "asc" },
  });
  for (const l of candidatos) {
    console.log(`Lançamento nº ${l.id}: cliente ${l.clienteId}, venda ${l.vendaId}, ${l.valor} centavos, "${l.observacao}"`);
  }
  const resultado = await db.lancamentoFiado.updateMany({ where: filtro, data: { tipo: "ESTORNO" } });
  console.log(`${resultado.count} lançamento(s) convertido(s) de PAGAMENTO pra ESTORNO.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
