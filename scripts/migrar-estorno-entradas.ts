// Migra entradas estornadas do marcador antigo "[ESTORNADA em ... por ...]"
// (gravado na observação) pros campos próprios EntradaEstoque.estornadaEm e
// estornadaPorId, limpando o marcador da observação. Idempotente: entradas
// sem marcador ou já migradas ficam como estão.
// Rodar: npx tsx --env-file=.env scripts/migrar-estorno-entradas.ts
import { PrismaClient } from "@prisma/client";
import { lerMarcadorEstornoAntigo, MARCADOR_ESTORNO_ENTRADA } from "@/lib/servicos/estoque-calculos";

const db = new PrismaClient();

async function main() {
  const candidatas = await db.entradaEstoque.findMany({
    where: { observacao: { contains: MARCADOR_ESTORNO_ENTRADA } },
    select: { id: true, observacao: true, criadoEm: true, estornadaEm: true, estornadaPorId: true },
    orderBy: { id: "asc" },
  });
  const usuarios = await db.usuario.findMany({ select: { id: true, nome: true } });

  let migradas = 0;
  for (const entrada of candidatas) {
    const marcador = lerMarcadorEstornoAntigo(entrada.observacao);
    if (!marcador) continue;

    const porQuem = marcador.porQuem ? usuarios.find((u) => u.nome === marcador.porQuem) : undefined;
    const estornadaEm = entrada.estornadaEm ?? marcador.quando ?? entrada.criadoEm;
    const estornadaPorId = entrada.estornadaPorId ?? porQuem?.id ?? null;

    await db.entradaEstoque.update({
      where: { id: entrada.id },
      data: { estornadaEm, estornadaPorId, observacao: marcador.observacaoLimpa },
    });
    migradas += 1;
    console.log(
      `Entrada nº ${entrada.id}: estornadaEm=${estornadaEm.toISOString()} estornadaPorId=${estornadaPorId ?? "null"}` +
        `${marcador.porQuem && !porQuem ? ` (usuário "${marcador.porQuem}" não encontrado)` : ""}`,
    );
  }

  console.log(`${migradas} entrada(s) migrada(s) de ${candidatas.length} candidata(s).`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
