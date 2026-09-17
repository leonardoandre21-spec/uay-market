import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import { formatarCnpj, formatarTelefone } from "@/lib/utils";
import { obterRecibo } from "@/lib/servicos/clientes";
import { BotaoImprimir } from "../../../_componentes/botao-imprimir";

export const metadata: Metadata = { title: "Comprovante de pagamento" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; lancamentoId: string }>;
type SearchParams = Promise<{ imprimir?: string }>;

function lerId(texto: string): number | null {
  const n = Number(texto);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Na impressão, esconde a casca do sistema (menu lateral, cabeçalho) e deixa só o cupom.
const ESTILO_IMPRESSAO = `
@media print {
  body * { visibility: hidden !important; }
  .cupom, .cupom * { visibility: visible !important; }
  .cupom { position: absolute !important; left: 0 !important; top: 0 !important; box-shadow: none !important; border: 0 !important; }
}
`;

export default async function PaginaRecibo({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await exigirSessao();
  const [{ id: idTexto, lancamentoId: lancTexto }, { imprimir }] = await Promise.all([params, searchParams]);
  const clienteId = lerId(idTexto);
  const lancamentoId = lerId(lancTexto);
  if (!clienteId || !lancamentoId) notFound();

  const recibo = await obterRecibo(clienteId, lancamentoId);
  if (!recibo) notFound();

  const linha = "- - - - - - - - - - - - - - - - - - - - - - - -";

  return (
    <div className="flex flex-col gap-6">
      <style dangerouslySetInnerHTML={{ __html: ESTILO_IMPRESSAO }} />

      <div className="nao-imprimir flex flex-wrap items-center justify-between gap-3">
        <Link href={`/clientes/${clienteId}#extrato`} className="inline-flex items-center gap-1.5 text-sm text-texto-suave hover:text-texto">
          <ArrowLeft className="size-4" aria-hidden />
          Voltar pro cliente
        </Link>
        <BotaoImprimir autoImprimir={imprimir === "1"} />
      </div>

      <div className="nao-imprimir text-sm text-texto-suave">
        Comprovante nº {recibo.lancamentoId}. Ajuste a impressora pra papel de 80mm sem margens.
      </div>

      <div className="flex justify-center">
        <div className="cupom w-[80mm] max-w-full rounded-padrao border border-borda bg-white px-3 py-4 font-mono text-[12px] leading-snug text-black shadow-padrao">
          <div className="text-center">
            <p className="text-sm font-bold uppercase">{recibo.loja.nome}</p>
            {recibo.loja.cnpj ? <p>CNPJ {formatarCnpj(recibo.loja.cnpj)}</p> : null}
            {recibo.loja.endereco ? <p>{recibo.loja.endereco}</p> : null}
            {recibo.loja.telefone ? <p>Tel. {formatarTelefone(recibo.loja.telefone)}</p> : null}
          </div>

          <p className="my-2 text-center">{linha}</p>
          <p className="text-center text-sm font-bold uppercase">Comprovante de pagamento</p>
          <p className="text-center">Fiado (conta do cliente)</p>
          <p className="my-2 text-center">{linha}</p>

          <div className="flex flex-col gap-0.5">
            <LinhaCupom rotulo="Nº" valor={String(recibo.lancamentoId).padStart(6, "0")} />
            <LinhaCupom rotulo="Data" valor={recibo.dataHora} />
            <LinhaCupom rotulo="Cliente" valor={recibo.clienteNome} />
            {recibo.clienteCpf ? <LinhaCupom rotulo="CPF" valor={recibo.clienteCpf} /> : null}
            {recibo.clienteTelefone ? <LinhaCupom rotulo="Telefone" valor={recibo.clienteTelefone} /> : null}
            {recibo.recebidoPor ? <LinhaCupom rotulo="Recebido por" valor={recibo.recebidoPor} /> : null}
          </div>

          <p className="my-2 text-center">{linha}</p>

          <div className="flex flex-col gap-0.5">
            <LinhaCupom rotulo="Saldo anterior" valor={formatarReais(recibo.saldoAnterior)} />
            <LinhaCupom
              rotulo="Forma"
              valor={recibo.formaPagamento ? ROTULO_FORMA_PAGAMENTO[recibo.formaPagamento] : "Ajuste de saldo"}
            />
            <div className="mt-1 flex items-baseline justify-between text-base font-bold">
              <span>VALOR PAGO</span>
              <span className="tabular">{formatarReais(recibo.valor)}</span>
            </div>
            <LinhaCupom rotulo="Saldo restante" valor={formatarReais(recibo.saldoApos)} destaque />
          </div>

          {recibo.observacao ? (
            <>
              <p className="my-2 text-center">{linha}</p>
              <p className="text-[11px]">Obs.: {recibo.observacao}</p>
            </>
          ) : null}

          <p className="my-2 text-center">{linha}</p>
          <p className="text-center">
            {recibo.saldoApos > 0 ? `Ainda em aberto: ${formatarReais(recibo.saldoApos)}` : "Conta quitada. Obrigado!"}
          </p>
          {recibo.loja.mensagem ? <p className="mt-1 text-center text-[11px]">{recibo.loja.mensagem}</p> : null}
          <p className="mt-3 text-center text-[10px]">Documento sem valor fiscal. Guarde como comprovante.</p>
        </div>
      </div>
    </div>
  );
}

function LinhaCupom({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={destaque ? "flex justify-between gap-2 font-bold" : "flex justify-between gap-2"}>
      <span className="shrink-0">{rotulo}:</span>
      <span className="text-right tabular break-words">{valor}</span>
    </div>
  );
}
