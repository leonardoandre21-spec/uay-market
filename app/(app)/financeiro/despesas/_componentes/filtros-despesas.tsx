"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterX } from "lucide-react";
import type { FormaPagamento } from "@prisma/client";
import { Botao } from "@/components/ui/botao";
import { Selecao } from "@/components/ui/campo";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import type { Opcao } from "../../_componentes/tipos";

const FORMAS: FormaPagamento[] = ["DINHEIRO", "PIX", "DEBITO", "CREDITO"];

/** Filtros de categoria, fornecedor e forma. Cada mudança atualiza a URL (mantendo o mês). */
export function FiltrosDespesas({
  categorias,
  fornecedores,
  categoriaId,
  fornecedorId,
  forma,
}: {
  categorias: Opcao[];
  fornecedores: Opcao[];
  categoriaId: number | null;
  fornecedorId: number | null;
  forma: FormaPagamento | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const temFiltro = categoriaId !== null || fornecedorId !== null || forma !== null;

  function definir(nome: string, valor: string) {
    const novos = new URLSearchParams(params.toString());
    if (valor) novos.set(nome, valor);
    else novos.delete(nome);
    const consulta = novos.toString();
    router.push(consulta ? `${pathname}?${consulta}` : pathname);
  }

  function limpar() {
    const novos = new URLSearchParams(params.toString());
    novos.delete("categoria");
    novos.delete("fornecedor");
    novos.delete("forma");
    const consulta = novos.toString();
    router.push(consulta ? `${pathname}?${consulta}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-52">
        <Selecao aria-label="Filtrar por categoria" value={categoriaId ?? ""} onChange={(e) => definir("categoria", e.target.value)} className="h-9">
        <option value="">Todas as categorias</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
        </Selecao>
      </div>
      <div className="w-full sm:w-52">
        <Selecao aria-label="Filtrar por fornecedor" value={fornecedorId ?? ""} onChange={(e) => definir("fornecedor", e.target.value)} className="h-9">
        <option value="">Todos os fornecedores</option>
        {fornecedores.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nome}
          </option>
        ))}
        </Selecao>
      </div>
      <div className="w-full sm:w-48">
        <Selecao aria-label="Filtrar por forma de pagamento" value={forma ?? ""} onChange={(e) => definir("forma", e.target.value)} className="h-9">
        <option value="">Todas as formas</option>
        {FORMAS.map((f) => (
          <option key={f} value={f}>
            {ROTULO_FORMA_PAGAMENTO[f]}
          </option>
        ))}
        </Selecao>
      </div>
      {temFiltro ? (
        <Botao variante="fantasma" tamanho="sm" onClick={limpar}>
          <FilterX className="size-4" aria-hidden />
          Limpar filtros
        </Botao>
      ) : null}
    </div>
  );
}
