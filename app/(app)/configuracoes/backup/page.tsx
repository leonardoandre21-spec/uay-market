import path from "node:path";
import { exigirAdmin } from "@/lib/auth";
import { formatarDataHora } from "@/lib/datas";
import {
  caminhoBancoAtual,
  garantirBackupAutomatico,
  listarBackups,
  tamanhoBancoAtual,
} from "@/lib/servicos/configuracoes";
import { PainelBackup } from "./_componentes/painel-backup";

export const dynamic = "force-dynamic";

/**
 * Backup automático: ao abrir esta página, se o backup mais recente tem mais
 * de 24h (ou não existe), um novo é gerado em silêncio antes de listar.
 */
export default async function PaginaBackup() {
  const sessao = await exigirAdmin();
  const geradoAgora = await garantirBackupAutomatico(sessao.usuarioId);
  const [backups, tamanhoBanco] = await Promise.all([listarBackups(), tamanhoBancoAtual()]);
  const ultimo = backups.find((b) => b.tipo === "backup") ?? null;

  return (
    <PainelBackup
      backups={backups.map((b) => ({
        nome: b.nome,
        tamanho: b.tamanho,
        modificadoEm: formatarDataHora(b.modificadoEm),
        tipo: b.tipo,
      }))}
      resumo={{
        caminhoBanco: path.relative(process.cwd(), caminhoBancoAtual()).replace(/\\/g, "/"),
        tamanhoBanco,
        ultimoBackupEm: ultimo ? formatarDataHora(ultimo.modificadoEm) : null,
        totalBackups: backups.filter((b) => b.tipo === "backup").length,
        geradoAutomaticamenteAgora: geradoAgora !== null,
      }}
    />
  );
}
