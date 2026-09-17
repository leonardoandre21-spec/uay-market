// Postgres embutido pra desenvolvimento e testes na máquina (sem Docker).
// Sobe um servidor em localhost:5433 com dados em .postgres-local/ e fica rodando
// até Ctrl+C. Em produção o banco é o Neon (DATABASE_URL no Vercel).
//
// Rodar: node scripts/postgres-local.mjs
// URL:   postgresql://uay:uay@localhost:5433/uay_market
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";

const pasta = path.resolve(".postgres-local");
const primeiraVez = !fs.existsSync(path.join(pasta, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: pasta,
  user: "uay",
  password: "uay",
  port: 5433,
  persistent: true,
  onLog: () => {},
  onError: (m) => console.error(String(m).trim()),
});

if (primeiraVez) {
  console.log("Inicializando o Postgres local em", pasta);
  await pg.initialise();
}
await pg.start();
if (primeiraVez) await pg.createDatabase("uay_market");
console.log("Postgres local pronto: postgresql://uay:uay@localhost:5433/uay_market (Ctrl+C pra parar)");

const parar = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", parar);
process.on("SIGTERM", parar);
setInterval(() => {}, 1 << 30);
