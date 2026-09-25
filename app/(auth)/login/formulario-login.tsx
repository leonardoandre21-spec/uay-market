"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Papel } from "@prisma/client";
import { Cartao, CartaoConteudo } from "@/components/ui/cartao";
import { Campo, Entrada } from "@/components/ui/campo";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { FormularioAcao } from "@/components/ui/formulario-acao";
import { ROTULO_PAPEL } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { entrar } from "./actions";

export function FormularioLogin({ usuarios }: { usuarios: { id: number; nome: string; papel: Papel }[] }) {
  const router = useRouter();
  const [usuarioId, setUsuarioId] = useState<number | null>(usuarios.length === 1 ? usuarios[0].id : null);

  return (
    <Cartao>
      <CartaoConteudo className="flex flex-col gap-5">
        <FormularioAcao acao={entrar} aoSucesso={(d) => router.replace(d.destino)} className="flex flex-col gap-5">
          {usuarios.length > 1 ? (
            <div className="grid grid-cols-2 gap-2">
              {usuarios.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setUsuarioId(u.id)}
                  aria-pressed={usuarioId === u.id}
                  className={cn(
                    "rounded-padrao border px-3 py-2.5 text-left transition-colors",
                    usuarioId === u.id
                      ? "border-acento bg-acento-suave ring-1 ring-acento"
                      : "border-borda bg-superficie hover:border-acento/60 hover:bg-superficie-2",
                  )}
                >
                  <p className="truncate text-sm font-medium text-texto">{u.nome}</p>
                  <p className="text-xs text-texto-fraco">{ROTULO_PAPEL[u.papel]}</p>
                </button>
              ))}
            </div>
          ) : null}
          <input type="hidden" name="usuarioId" value={usuarioId ?? ""} />
          <Campo rotulo="PIN" htmlFor="pin">
            <Entrada
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,8}"
              autoComplete="off"
              autoFocus
              required
              tamanho="lg"
              className="text-center text-2xl tracking-[0.5em]"
              placeholder="••••"
            />
          </Campo>
          <BotaoEnviar tamanho="lg" variante="destaque" className="w-full">
            Entrar
          </BotaoEnviar>
        </FormularioAcao>
        {usuarios.length === 0 ? (
          <p className="text-center text-xs text-texto-fraco">
            Nenhum usuário cadastrado. Rode <code>npm run db:seed</code> pra criar o administrador inicial.
          </p>
        ) : null}
      </CartaoConteudo>
    </Cartao>
  );
}
