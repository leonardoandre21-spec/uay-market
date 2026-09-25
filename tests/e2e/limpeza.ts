/** Teardown global: apaga os registros com prefixo "E2E" que sobraram e fecha o Prisma. */
import { desconectar, limparResiduos } from "./dados";

export default async function limpeza() {
  try {
    await limparResiduos();
  } finally {
    await desconectar();
  }
}
