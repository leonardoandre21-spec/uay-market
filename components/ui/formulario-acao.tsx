"use client";

import { useActionState, useRef } from "react";
import type { Resultado } from "@/lib/acao";
import { useToast } from "@/components/ui/toast";
import { Aviso } from "@/components/ui/aviso";

type Estado<T> = Resultado<T> | null;

/**
 * Formulário ligado a uma server action que devolve Resultado<T>.
 * Mostra erro em Aviso, toast de sucesso, e chama aoSucesso(dados).
 *
 * aoSucesso e os toasts rodam dentro da própria action (não num useEffect):
 * quando a action revalida a página e este formulário some da tela,
 * o callback (ex.: router.push) ainda acontece.
 *
 * <FormularioAcao acao={salvarProduto} mensagemSucesso="Produto salvo" aoSucesso={() => fechar()}>
 *   {(estado) => <>...campos... <BotaoEnviar>Salvar</BotaoEnviar></>}
 * </FormularioAcao>
 */
export function FormularioAcao<T>({
  acao,
  mensagemSucesso,
  aoSucesso,
  limparAoSucesso = false,
  className,
  children,
}: {
  acao: (form: FormData) => Promise<Resultado<T>>;
  mensagemSucesso?: string;
  aoSucesso?: (dados: T) => void;
  limparAoSucesso?: boolean;
  className?: string;
  children: React.ReactNode | ((estado: Estado<T>, pendente: boolean) => React.ReactNode);
}) {
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  // Refs pra sempre usar a versão mais recente dos callbacks sem recriar a action.
  const aoSucessoRef = useRef(aoSucesso);
  aoSucessoRef.current = aoSucesso;
  const mensagemRef = useRef(mensagemSucesso);
  mensagemRef.current = mensagemSucesso;

  const [estado, dispatch, pendente] = useActionState<Estado<T>, FormData>(async (_prev, form) => {
    let resultado: Resultado<T>;
    try {
      resultado = await acao(form);
    } catch {
      resultado = { ok: false, erro: "Não foi possível concluir. Verifique a conexão e tente de novo." };
    }
    if (resultado.ok) {
      if (mensagemRef.current) toast.sucesso(mensagemRef.current);
      if (limparAoSucesso) formRef.current?.reset();
      aoSucessoRef.current?.(resultado.dados);
    } else {
      toast.erro(resultado.erro);
    }
    return resultado;
  }, null);

  return (
    <form ref={formRef} action={dispatch} className={className}>
      {estado && !estado.ok ? (
        <Aviso tom="perigo" className="mb-4">
          {estado.erro}
        </Aviso>
      ) : null}
      {typeof children === "function" ? children(estado, pendente) : children}
    </form>
  );
}

/** Erro de um campo específico no estado do formulário (ou undefined). */
export function erroCampo<T>(estado: Estado<T>, nome: string): string | undefined {
  if (!estado || estado.ok) return undefined;
  return estado.campos?.[nome];
}
