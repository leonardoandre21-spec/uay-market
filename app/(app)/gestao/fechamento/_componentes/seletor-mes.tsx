"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Selecao } from "@/components/ui/campo";
import { cn } from "@/lib/utils";

const classeSeta =
  "inline-flex size-10 items-center justify-center rounded-padrao border border-borda bg-superficie text-texto hover:bg-superficie-2";

/** Navegação de mês do fechamento: setas anterior/próximo e lista dos meses com movimento. */
export function SeletorMes({
  atual,
  anterior,
  proximo,
  meses,
}: {
  atual: string;
  anterior: { chave: string; rotulo: string };
  proximo: { chave: string; rotulo: string } | null;
  meses: Array<{ chave: string; rotulo: string }>;
}) {
  const router = useRouter();
  const opcoes = meses.some((m) => m.chave === atual) ? meses : [{ chave: atual, rotulo: atual }, ...meses];
  return (
    <div className="flex items-center gap-2">
      <Link href={`/gestao/fechamento?mes=${anterior.chave}`} className={classeSeta} aria-label={`Mês anterior: ${anterior.rotulo}`} title={anterior.rotulo}>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <Selecao
        aria-label="Escolher mês"
        value={atual}
        onChange={(e) => router.push(`/gestao/fechamento?mes=${e.target.value}`)}
        className="w-56"
      >
        {opcoes.map((m) => (
          <option key={m.chave} value={m.chave}>
            {m.rotulo}
          </option>
        ))}
      </Selecao>
      {proximo ? (
        <Link href={`/gestao/fechamento?mes=${proximo.chave}`} className={classeSeta} aria-label={`Próximo mês: ${proximo.rotulo}`} title={proximo.rotulo}>
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      ) : (
        <span className={cn(classeSeta, "pointer-events-none opacity-40")} aria-hidden>
          <ChevronRight className="size-5" />
        </span>
      )}
    </div>
  );
}
