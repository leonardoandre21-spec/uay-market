// Regras puras do módulo de configurações (sem banco, sem Next). Tudo aqui
// tem teste em tests/configuracoes.test.ts.

import { format } from "date-fns";
import type { Papel } from "@prisma/client";
import { noFuso } from "@/lib/datas";

// ---------------------------------------------------------------- PIN

/** PIN aceito: só dígitos, de 4 a 8. Espelha a regra de lib/auth.ts. */
export function pinValido(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export const MENSAGEM_PIN_INVALIDO = "O PIN precisa ter de 4 a 8 números, sem letras.";

// ---------------------------------------------------------------- último admin

export type UsuarioResumo = { id: number; papel: Papel; ativo: boolean };

/**
 * Diz se o usuário `id` pode deixar de ser um administrador ativo (por
 * desativação ou rebaixamento pra operador). Só é permitido quando sobra pelo
 * menos um OUTRO administrador ativo na lista. Usuário que não é admin ativo
 * pode sempre ser alterado.
 */
export function podeDesativarAdmin(lista: UsuarioResumo[], id: number): boolean {
  const alvo = lista.find((u) => u.id === id);
  if (!alvo) return false;
  if (alvo.papel !== "ADMIN" || !alvo.ativo) return true;
  return lista.some((u) => u.id !== id && u.papel === "ADMIN" && u.ativo);
}

// ---------------------------------------------------------------- backups

/** Nome de arquivo de backup seguro: letras, números, hífen e sublinhado, terminando em .db. */
const REGEX_NOME_BACKUP = /^[A-Za-z0-9_-]{1,80}\.db$/;

/** Rejeita qualquer tentativa de sair da pasta backups/ (barras, "..", extensões estranhas). */
export function nomeBackupValido(nome: string): boolean {
  return REGEX_NOME_BACKUP.test(nome);
}

export const PREFIXO_BACKUP = "uay-market-";
export const PREFIXO_RESTAURACAO = "restaurar-";

/** "uay-market-20260916-1430.db" (horário do mercado). */
export function gerarNomeBackup(data: Date): string {
  return `${PREFIXO_BACKUP}${format(noFuso(data), "yyyyMMdd-HHmm")}.db`;
}

/** "restaurar-20260916-143005.db" (com segundos, pra não colidir em uploads seguidos). */
export function gerarNomeRestauracao(data: Date): string {
  return `${PREFIXO_RESTAURACAO}${format(noFuso(data), "yyyyMMdd-HHmmss")}.db`;
}

export function ehBackupAutomaticoOuManual(nome: string): boolean {
  return nome.startsWith(PREFIXO_BACKUP);
}

/** Backup automático é necessário quando não existe nenhum ou o último tem mais de `horas` horas. */
export function backupDesatualizado(ultimo: Date | null, agora: Date, horas = 24): boolean {
  if (!ultimo) return true;
  return agora.getTime() - ultimo.getTime() > horas * 60 * 60 * 1000;
}

/** Quantos backups gerados pelo sistema (`uay-market-*`) ficam na pasta; os mais antigos são apagados. */
export const MANTER_BACKUPS = 30;
/** Quantos arquivos enviados pra restaurar (`restaurar-*`) ficam na pasta. */
export const MANTER_RESTAURACOES = 5;

// Só os nomes no formato exato que o sistema gera entram na limpeza. Como a data
// está no nome, a ordem alfabética é a cronológica.
const REGEX_BACKUP_GERADO = new RegExp(`^${PREFIXO_BACKUP}\\d{8}-\\d{4}\\.db$`);
const REGEX_RESTAURACAO_GERADA = new RegExp(`^${PREFIXO_RESTAURACAO}\\d{8}-\\d{6}\\.db$`);

function excedentesDoPadrao(nomes: string[], regex: RegExp, manter: number): string[] {
  const gerados = nomes.filter((n) => regex.test(n)).sort();
  const sobra = Math.max(0, gerados.length - Math.max(0, manter));
  return gerados.slice(0, sobra);
}

/**
 * Dentre os nomes da pasta backups/, devolve os arquivos gerados pelo sistema
 * que passam da cota, do mais antigo pro mais novo. Cópias com outro nome
 * (ex.: "copia_manual.db" ou os "auto-*.db" do iniciar.bat) nunca entram.
 */
export function backupsExcedentes(
  nomes: string[],
  manterBackups = MANTER_BACKUPS,
  manterRestauracoes = MANTER_RESTAURACOES,
): string[] {
  return [
    ...excedentesDoPadrao(nomes, REGEX_BACKUP_GERADO, manterBackups),
    ...excedentesDoPadrao(nomes, REGEX_RESTAURACAO_GERADA, manterRestauracoes),
  ];
}

/**
 * Limite do arquivo enviado pra restaurar. O banco de um mercado tem centenas
 * de KB; 200 MB é folga de sobra e cabe na memória sem derrubar o PDV.
 */
export const TAMANHO_MAXIMO_RESTAURACAO = 200 * 1024 * 1024;

/** Lê o cabeçalho Content-Length; null quando ausente, vazio ou fora do formato (só dígitos). */
export function lerContentLength(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = valor.trim();
  if (!/^\d{1,15}$/.test(texto)) return null;
  return Number(texto);
}

/** Caminho Windows/Unix pronto pra entrar entre aspas simples num comando SQL. */
export function caminhoParaSql(caminho: string): string {
  return caminho.replace(/\\/g, "/").replace(/'/g, "''");
}

/** "1,2 MB", "340 KB". */
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

// ---------------------------------------------------------------- Mercado Pago

export type TipoTokenMercadoPago = "producao" | "teste" | "desconhecido";

/** Só o prefixo do token diz se é de produção (APP_USR-) ou de teste (TEST-). Nunca exponha o token. */
export function tipoTokenMercadoPago(token: string | null | undefined): TipoTokenMercadoPago | null {
  if (!token) return null;
  if (token.startsWith("APP_USR-")) return "producao";
  if (token.startsWith("TEST-")) return "teste";
  return "desconhecido";
}

// ---------------------------------------------------------------- CSV

/** Escapa um valor pra CSV separado por ponto e vírgula (padrão do Excel em português). */
export function celulaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const s = String(valor);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
