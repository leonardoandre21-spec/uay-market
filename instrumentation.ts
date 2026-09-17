// Gancho do Next.js: register() roda uma vez quando o servidor sobe.
// Só no runtime Node (o Edge do middleware não tem Prisma nem disco).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // No Vercel cada função é efêmera: timer não faz sentido (o backup lá é o
  // restore nativo do Neon + exportação manual em Configurações > Backup).
  if (process.env.VERCEL) return;
  try {
    const { iniciarBackupAgendado } = await import("@/lib/backup-agendado");
    iniciarBackupAgendado();
  } catch (e) {
    // Sem o agendador o sistema funciona igual; só perde o backup de 24 h em
    // segundo plano (o iniciar.bat e a página de backup continuam fazendo o deles).
    console.error("Não foi possível ligar o backup automático agendado", e);
  }
}
