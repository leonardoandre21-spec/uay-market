"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { CaixaSelecao, Entrada } from "@/components/ui/campo";

/** Busca por nome/CNPJ/contato e opção de mostrar inativos; tudo pela URL. */
export function BuscaFornecedores({ busca, incluirInativos }: { busca: string; incluirInativos: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [texto, setTexto] = useState(busca);

  useEffect(() => {
    setTexto(busca);
  }, [busca]);

  useEffect(() => {
    if (texto === busca) return;
    const t = window.setTimeout(() => {
      const novos = new URLSearchParams(params.toString());
      if (texto.trim()) novos.set("busca", texto.trim());
      else novos.delete("busca");
      const consulta = novos.toString();
      router.replace(consulta ? `${pathname}?${consulta}` : pathname);
    }, 350);
    return () => window.clearTimeout(t);
  }, [texto, busca, params, pathname, router]);

  function alternarInativos(marcado: boolean) {
    const novos = new URLSearchParams(params.toString());
    if (marcado) novos.set("inativos", "1");
    else novos.delete("inativos");
    const consulta = novos.toString();
    router.replace(consulta ? `${pathname}?${consulta}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
        <Entrada
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nome, CNPJ, contato ou telefone"
          aria-label="Buscar fornecedor"
          className="pl-9"
        />
      </div>
      <CaixaSelecao rotulo="Mostrar inativos" checked={incluirInativos} onChange={(e) => alternarInativos(e.target.checked)} />
    </div>
  );
}
