import { exigirAdmin } from "@/lib/auth";
import { formatarDataHora } from "@/lib/datas";
import { tabelasDoBackup, ultimaRestauracao, ultimoBackupExportado } from "@/lib/servicos/backup";
import { PainelBackup } from "./_componentes/painel-backup";

export const dynamic = "force-dynamic";

/**
 * Backup em JSON: exportar (download) e restaurar (upload que substitui
 * tudo). Em produção o banco fica no Neon, que já guarda o histórico pra
 * restauração por ponto no tempo; esta tela é a cópia que o dono baixa.
 */
export default async function PaginaBackup() {
  await exigirAdmin();
  const [ultimoExportado, ultimaImportacao] = await Promise.all([ultimoBackupExportado(), ultimaRestauracao()]);

  return (
    <PainelBackup
      tabelas={tabelasDoBackup()}
      ultimoExportado={
        ultimoExportado ? { em: formatarDataHora(ultimoExportado.em), usuario: ultimoExportado.usuario } : null
      }
      ultimaRestauracao={
        ultimaImportacao ? { em: formatarDataHora(ultimaImportacao.em), usuario: ultimaImportacao.usuario } : null
      }
    />
  );
}
