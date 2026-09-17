// Backup automático agendado dentro do próprio servidor. O PC do mercado fica
// ligado por semanas com a janela minimizada, então o backup do iniciar.bat
// (só quando o servidor sobe) e o da página Configurações > Backup (só quando
// o dono abre) podiam passar meses sem rodar. Aqui um timer confere de hora em
// hora e gera um backup novo quando o último tem mais de 24 h, usando o mesmo
// VACUUM INTO da página de backup (seguro com o sistema aberto).
//
// Ligado por instrumentation.ts (raiz) quando o servidor Node sobe.

import { garantirBackupAutomatico } from "@/lib/servicos/configuracoes";

/** Espera antes da primeira conferência, pra não disputar disco com a subida do servidor. */
export const ATRASO_INICIAL_MS = 2 * 60 * 1000;
/** Intervalo entre conferências. O backup em si só sai quando o último tem mais de 24 h. */
export const INTERVALO_MS = 60 * 60 * 1000;

const marcador = globalThis as unknown as { __uayBackupAgendado?: boolean };

/** Agenda a conferência periódica. Chamar mais de uma vez (recarga em dev) não duplica timers. */
export function iniciarBackupAgendado(): void {
  if (marcador.__uayBackupAgendado) return;
  marcador.__uayBackupAgendado = true;

  const conferir = () => {
    garantirBackupAutomatico(null)
      .then((info) => {
        if (info) console.log(`Backup automático gerado: ${info.nome}`);
      })
      .catch((e) => console.error("Backup automático agendado falhou", e));
  };

  // unref: os timers não seguram o processo aberto na hora de encerrar.
  setTimeout(conferir, ATRASO_INICIAL_MS).unref();
  setInterval(conferir, INTERVALO_MS).unref();
}
