// Preenche ContaPagar.diaVencimento nas contas antigas com recorrência ou
// parcelamento que ainda não têm o dia guardado, usando o dia do vencimento atual.
// Idempotente: só toca em quem está com diaVencimento nulo.
// Rodar: npx tsx --env-file=.env scripts/preencher-dia-vencimento.ts

import { PrismaClient } from "@prisma/client";
import { diaDoMes } from "../lib/servicos/financeiro-calculos";

const db = new PrismaClient();

async function main() {
  const contas = await db.contaPagar.findMany({
    where: { diaVencimento: null, OR: [{ recorrencia: { not: null } }, { totalParcelas: { gt: 1 } }] },
    select: { id: true, descricao: true, vencimento: true, recorrencia: true, parcelaAtual: true, totalParcelas: true },
    orderBy: { id: "asc" },
  });
  if (!contas.length) {
    console.log("Nenhuma conta recorrente/parcelada sem diaVencimento. Nada a fazer.");
    return;
  }
  let atualizadas = 0;
  for (const c of contas) {
    const dia = diaDoMes(c.vencimento);
    await db.contaPagar.update({ where: { id: c.id }, data: { diaVencimento: dia } });
    atualizadas++;
    const tipo = c.recorrencia ? "mensal" : `parcela ${c.parcelaAtual}/${c.totalParcelas}`;
    console.log(`#${c.id} ${c.descricao} (${tipo}) vencimento ${c.vencimento.toISOString().slice(0, 10)} -> diaVencimento ${dia}`);
  }
  console.log(`${atualizadas} conta(s) atualizada(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
