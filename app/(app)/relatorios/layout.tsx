import { Suspense } from "react";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { AbasRelatorios } from "./_componentes/abas-relatorios";

// Ajustes só pra impressão: esconde a barra lateral e o menu do celular,
// tira sombras e evita cortar linhas de tabela no meio da página.
const ESTILO_IMPRESSAO = `
@media print {
  aside, header { display: none !important; }
  main { padding: 0 !important; }
  .relatorios-conteudo { max-width: none !important; }
  .relatorios-conteudo table { font-size: 11px; }
  .relatorios-conteudo tr { break-inside: avoid; }
  .relatorios-conteudo [class*="shadow"] { box-shadow: none !important; }
  .relatorios-quebra { break-inside: avoid; }
  @page { margin: 12mm; }
}
`;

export default function LayoutRelatorios({ children }: { children: React.ReactNode }) {
  return (
    <div className="relatorios-conteudo mx-auto w-full max-w-7xl">
      <style>{ESTILO_IMPRESSAO}</style>
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Números do mercado num período: o que mais vende, quanto sobra, como o cliente paga, o que encalha e quem compra. Só vendas concluídas entram na conta."
        className="nao-imprimir"
      />
      <Suspense fallback={<div className="nao-imprimir mb-6 h-11 rounded-padrao bg-superficie-2" aria-hidden />}>
        <AbasRelatorios />
      </Suspense>
      {children}
    </div>
  );
}
