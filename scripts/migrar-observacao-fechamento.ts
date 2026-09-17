// Migração de dados única: sessões de caixa fechadas antes da coluna
// `observacaoFechamento` guardavam o fechamento dentro de `observacao`, com o
// prefixo "Fechamento: ". Este script separa o texto nas duas colunas.
// Idempotente: sessões já separadas (sem o prefixo) não são tocadas.
// Rodar: npx tsx --env-file=.env scripts/migrar-observacao-fechamento.ts
import { PrismaClient } from "@prisma/client";
import { separarObservacaoLegada } from "@/lib/servicos/caixa-calculos";

const db = new PrismaClient();

async function main() {
  const candidatas = await db.sessaoCaixa.findMany({
    where: { observacao: { contains: "Fechamento:" } },
    select: { id: true, observacao: true, observacaoFechamento: true },
    orderBy: { id: "asc" },
  });

  let migradas = 0;
  let puladas = 0;
  for (const sessao of candidatas) {
    const { abertura, fechamento } = separarObservacaoLegada(sessao.observacao);
    if (!fechamento) {
      puladas += 1; // a palavra aparece no meio do texto, não é o prefixo legado
      continue;
    }
    // Se já houver observação de fechamento, preserva e junta a legada abaixo.
    const observacaoFechamento = [sessao.observacaoFechamento, fechamento]
      .filter((t): t is string => Boolean(t))
      .join("\n");
    await db.sessaoCaixa.update({
      where: { id: sessao.id },
      data: { observacao: abertura, observacaoFechamento },
    });
    migradas += 1;
    console.log(`Caixa nº ${sessao.id}: abertura="${abertura ?? ""}" | fechamento="${fechamento}"`);
  }

  console.log(
    `Sessões com "Fechamento:" na observação: ${candidatas.length}. Migradas: ${migradas}. Sem prefixo legado (mantidas): ${puladas}.`,
  );
}

main()
  .catch((erro) => {
    console.error("Falha na migração:", erro);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
