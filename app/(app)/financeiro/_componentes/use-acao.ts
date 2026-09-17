"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Resultado } from "@/lib/acao";
import { useToast } from "@/components/ui/toast";

/**
 * Dispara uma server action fora de formulário (botões de excluir, cancelar,
 * pagar...): mostra toast, atualiza a página e chama aoSucesso.
 * O nome começa com "use" porque o React exige isso pros hooks.
 */
export function useAcao() {
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const rodar = useCallback(
    <T,>(
      chamada: () => Promise<Resultado<T>>,
      opcoes: { mensagemSucesso?: string; aoSucesso?: (dados: T) => void; aoFalhar?: (erro: string) => void } = {},
    ) => {
      iniciar(async () => {
        const r = await chamada();
        if (r.ok) {
          if (opcoes.mensagemSucesso) toast.sucesso(opcoes.mensagemSucesso);
          opcoes.aoSucesso?.(r.dados);
          router.refresh();
        } else {
          toast.erro(r.erro);
          opcoes.aoFalhar?.(r.erro);
        }
      });
    },
    [iniciar, router, toast],
  );

  return { pendente, rodar };
}
