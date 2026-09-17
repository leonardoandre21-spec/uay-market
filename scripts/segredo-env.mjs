// Garante um .env pronto pra producao. Chamado pelo instalar.bat (roda na raiz do projeto):
// - sem .env: copia o .env.example;
// - SESSAO_SEGREDO ausente, curto, de exemplo ("troque-por-...") ou de desenvolvimento ("dev-..."):
//   grava um segredo novo de 64 caracteres hexadecimais.
// Sai com codigo 1 se nao conseguir deixar o .env valido.
// Mensagens sem acento de proposito: o cmd.exe do Windows embaralha UTF-8 em .bat.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";

const ARQUIVO = ".env";
const EXEMPLO = ".env.example";
const TAMANHO_MINIMO = 32;

function segredoInvalido(valor) {
  if (!valor) return true;
  const v = valor.trim().toLowerCase();
  return v.length < TAMANHO_MINIMO || v.startsWith("troque-por") || v.startsWith("dev-");
}

if (!existsSync(ARQUIVO)) {
  if (!existsSync(EXEMPLO)) {
    console.error(`[ERRO] Nem ${ARQUIVO} nem ${EXEMPLO} existem nesta pasta.`);
    process.exit(1);
  }
  copyFileSync(EXEMPLO, ARQUIVO);
  console.log(`Arquivo ${ARQUIVO} criado a partir do ${EXEMPLO}.`);
}

let conteudo = readFileSync(ARQUIVO, "utf8").replace(/^﻿/, "");
const linha = /^\s*SESSAO_SEGREDO\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\r\n#]*))/m;
const achado = conteudo.match(linha);
const atual = achado ? (achado[1] ?? achado[2] ?? achado[3] ?? "").trim() : "";

if (segredoInvalido(atual)) {
  const novo = randomBytes(32).toString("hex");
  const novaLinha = `SESSAO_SEGREDO="${novo}"`;
  if (achado) {
    conteudo = conteudo.replace(linha, novaLinha);
  } else {
    conteudo = `${conteudo.replace(/\s*$/, "")}\n${novaLinha}\n`;
  }
  writeFileSync(ARQUIVO, conteudo, "utf8");
  console.log(atual ? "SESSAO_SEGREDO era de exemplo/desenvolvimento: um segredo novo foi gravado." : "SESSAO_SEGREDO gerado.");
} else {
  console.log("SESSAO_SEGREDO ja esta definido.");
}

const conferencia = readFileSync(ARQUIVO, "utf8").match(linha);
const final = conferencia ? (conferencia[1] ?? conferencia[2] ?? conferencia[3] ?? "").trim() : "";
if (segredoInvalido(final)) {
  console.error("[ERRO] Nao foi possivel gravar um SESSAO_SEGREDO valido no .env.");
  process.exit(1);
}
