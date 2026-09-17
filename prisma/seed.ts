// Seed mínimo pra colocar o sistema em pé: administrador, categorias,
// formas de pagamento e configuração. Idempotente (pode rodar de novo).
// Rodar: npm run db:seed
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const db = new PrismaClient();

function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 64).toString("hex")}`;
}

async function main() {
  const totalUsuarios = await db.usuario.count();
  if (totalUsuarios === 0) {
    const pin = process.env.ADMIN_PIN_INICIAL ?? "1234";
    await db.usuario.create({ data: { nome: "Administrador", pinHash: hashPin(pin), papel: "ADMIN" } });
    console.log(`Administrador criado com PIN ${pin}. Troque em Configurações > Usuários.`);
  }

  await db.configuracao.upsert({ where: { id: 1 }, update: {}, create: { id: 1, nomeLoja: "Uay Market" } });

  const formas = [
    { forma: "DINHEIRO", taxaPercentual: 0, prazoRecebimentoDias: 0, maxParcelas: 1 },
    { forma: "PIX", taxaPercentual: 0, prazoRecebimentoDias: 0, maxParcelas: 1 },
    { forma: "DEBITO", taxaPercentual: 199, prazoRecebimentoDias: 1, maxParcelas: 1 },
    { forma: "CREDITO", taxaPercentual: 399, prazoRecebimentoDias: 30, maxParcelas: 12 },
    { forma: "FIADO", taxaPercentual: 0, prazoRecebimentoDias: 30, maxParcelas: 1 },
  ] as const;
  for (const f of formas) {
    await db.configuracaoPagamento.upsert({ where: { forma: f.forma }, update: {}, create: f });
  }

  const categorias = [
    "Mercearia",
    "Bebidas",
    "Frios e laticínios",
    "Hortifruti",
    "Padaria",
    "Carnes",
    "Limpeza",
    "Higiene",
    "Congelados",
    "Doces e snacks",
  ];
  for (const [i, nome] of categorias.entries()) {
    await db.categoria.upsert({ where: { nome }, update: {}, create: { nome, ordem: i } });
  }

  const categoriasDespesa = [
    "Aluguel",
    "Energia",
    "Água",
    "Internet e telefone",
    "Salários",
    "Impostos",
    "Fornecedores",
    "Manutenção",
    "Embalagens",
    "Marketing",
    "Outros",
  ];
  for (const nome of categoriasDespesa) {
    await db.categoriaDespesa.upsert({ where: { nome }, update: {}, create: { nome } });
  }

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
