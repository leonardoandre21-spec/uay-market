import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/auth";
import { salvarEValidarRestauracao } from "@/lib/servicos/configuracoes";
import { lerContentLength, TAMANHO_MAXIMO_RESTAURACAO } from "@/lib/servicos/configuracoes-regras";

export const dynamic = "force-dynamic";

/** Cabeçalhos e limites do multipart em volta do arquivo; folga pra checagem por Content-Length. */
const FOLGA_MULTIPART = 64 * 1024;

const LIMITE_MB = Math.round(TAMANHO_MAXIMO_RESTAURACAO / (1024 * 1024));
const MENSAGEM_GRANDE_DEMAIS = `O arquivo é grande demais (limite de ${LIMITE_MB} MB). Um backup do Uay Market tem poucos MB; confira se escolheu o arquivo certo.`;

/**
 * POST /api/backup/restaurar (multipart, campo "arquivo"): guarda o .db enviado
 * em backups/restaurar-<timestamp>.db e confere se abre e está íntegro.
 * Não substitui o banco em uso (SQLite aberto); devolve as instruções.
 * É uma rota (e não server action) porque o arquivo pode passar de 1 MB.
 */
export async function POST(req: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  if (sessao.papel !== "ADMIN") {
    return NextResponse.json({ ok: false, erro: "Apenas administradores podem restaurar backups." }, { status: 403 });
  }

  // O tamanho é conferido ANTES de ler o corpo: req.formData() materializa o
  // multipart inteiro em memória, então checar arquivo.size depois seria tarde
  // demais pra um arquivo de gigabytes escolhido por engano (derruba o PDV).
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
    return NextResponse.json({ ok: false, erro: "Escolha um arquivo .db antes de enviar." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO_RESTAURACAO) {
    return NextResponse.json({ ok: false, erro: MENSAGEM_GRANDE_DEMAIS }, { status: 413 });
  }

  try {
    // Buffer.from(ArrayBuffer) compartilha a memória, não copia.
    const conteudo = Buffer.from(await arquivo.arrayBuffer());
    const resultado = await salvarEValidarRestauracao(conteudo, sessao.usuarioId);
    return NextResponse.json({ ok: true, dados: resultado });
  } catch (e) {
    const mensagem = e instanceof Error && e.message ? e.message : "Não foi possível validar o arquivo.";
    return NextResponse.json({ ok: false, erro: mensagem }, { status: 422 });
  }
}
