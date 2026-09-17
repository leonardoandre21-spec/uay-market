"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Entrada } from "@/components/ui/campo";

/**
 * Navegação de mês (anterior / seletor / próximo) que mexe só no parâmetro
 * ?mes= da URL, preservando os outros filtros.
 */
export function NavegacaoMes({
  mesAtual,
  mesAnterior,
  mesSeguinte,
  mesDeHoje,
}: {
  mesAtual: string; // yyyy-MM
  mesAnterior: string;
  mesSeguinte: string;
  mesDeHoje: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function irPara(mes: string) {
    const novos = new URLSearchParams(params.toString());
    if (mes === mesDeHoje) novos.delete("mes");
    else novos.set("mes", mes);
    const consulta = novos.toString();
    router.push(consulta ? `${pathname}?${consulta}` : pathname);
  }

  return (
    <div className="flex items-center gap-1.5">
      <Botao variante="contorno" tamanho="sm" onClick={() => irPara(mesAnterior)} aria-label="Mês anterior">
        <ChevronLeft className="size-4" aria-hidden />
      </Botao>
      <Entrada
        type="month"
        aria-label="Mês"
        value={mesAtual}
        onChange={(e) => {
          if (/^\d{4}-\d{2}$/.test(e.target.value)) irPara(e.target.value);
        }}
        className="h-8 w-40 text-sm"
      />
      <Botao variante="contorno" tamanho="sm" onClick={() => irPara(mesSeguinte)} aria-label="Próximo mês">
        <ChevronRight className="size-4" aria-hidden />
      </Botao>
      {mesAtual !== mesDeHoje ? (
        <Botao variante="fantasma" tamanho="sm" onClick={() => irPara(mesDeHoje)}>
          Mês atual
        </Botao>
      ) : null}
    </div>
  );
}
