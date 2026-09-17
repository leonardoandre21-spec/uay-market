import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/auth";
import { importarBackup } from "@/lib/servicos/backup";
import { lerContentLength, TAMANHO_MAXIMO_RESTAURACAO } from "@/lib/servicos/configuracoes-regras";

export const dynamic = "force-dynamic";
// A importação apaga e regrava o banco inteiro; no Vercel a função precisa de
// mais que o padrão. 60 s é o teto aceito em todos os planos (o banco de um
// mercado importa em poucos segundos).
export const maxDuration = 60;

/** Cabeçalhos e limites do multipart em volta do arquivo; folga pra checagem por Content-Length. */
const FOLGA_MULTIPART = 64 * 1024;

const LIMITE_MB = Math.round(TAMANHO_MAXIMO_RESTAURACAO / (1024 * 1024));
const MENSAGEM_GRANDE_DEMAIS = `O arquivo é grande demais (limite de ${LIMITE_MB} MB). Um backup do Uay Market tem poucos MB; confira se escolheu o arquivo certo.`;

/**
 * POST /api/backup/restaurar (multipart, campo "arquivo"): lê o .json enviado
 * e SUBSTITUI todos os dados do banco pelos do arquivo, numa transação só.
 * Devolve { ok: true, contagens } ou { ok: false, erro }. É uma rota (e não
 * server action) porque o arquivo pode passar do limite das actions.
 */
export async function POST(req: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  if (sessao.papel !== "ADMIN") {
    return NextResponse.json({ ok: false, erro: "Apenas administradores podem restaurar backups." }, { status: 403 });
  }

  // O tamanho é conferido ANTES de ler o corpo: req.formData() materializa o
  // multipart inteiro em memória, então checar arquivo.size depois seria tarde
  // demais pra um arquivo de gigabytes escolhido por engano.
  // O navegador sempre manda Content-Length num fetch com FormData.
  const tamanhoCorpo = lerContentLength(req.headers.get("content-length"));
  if (tamanhoCorpo === null) {
    return NextResponse.json(
      { ok: false, erro: "O envio veio sem o tamanho do arquivo. Use o botão da página de backup." },
      { status: 411 },
    );
  }
  if (tamanhoCorpo > TAMANHO_MAXIMO_RESTAURACAO + FOLGA_MULTIPART) {
    return NextResponse.json({ ok: false, erro: MENSAGEM_GRANDE_DEMAIS }, { status: 413 });
  }

  let arquivo: File | null = null;
  try {
    const form = await req.formData();
    const campo = form.get("arquivo");
    arquivo = campo instanceof File ? campo : null;
  } catch {
    return NextResponse.json({ ok: false, erro: "Não foi possível ler o arquivo enviado." }, { status: 400 });
  }
  if (!arquivo || arquivo.size === 0) {
    return NextResponse.json({ ok: false, erro: "Escolha um arquivo .json antes de enviar." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO_RESTAURACAO) {
    return NextResponse.json({ ok: false, erro: MENSAGEM_GRANDE_DEMAIS }, { status: 413 });
  }
  if (!/\.json$/i.test(arquivo.name)) {
    return NextResponse.json(
      { ok: false, erro: "O backup do Uay Market é um arquivo .json. Envie o arquivo baixado em Configurações > Backup." },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(await arquivo.text());
  } catch {
    return NextResponse.json(
      { ok: false, erro: "O arquivo não é um JSON válido (pode estar corrompido ou incompleto). Não use este backup." },
      { status: 422 },
    );
  }

  try {
    const contagens = await importarBackup(json, sessao.usuarioId);
    return NextResponse.json({ ok: true, contagens });
  } catch (e) {
    console.error("Falha ao restaurar backup", e);
    const mensagem = e instanceof Error && e.message ? e.message : "Não foi possível restaurar o backup.";
    return NextResponse.json({ ok: false, erro: mensagem }, { status: 422 });
  }
}
