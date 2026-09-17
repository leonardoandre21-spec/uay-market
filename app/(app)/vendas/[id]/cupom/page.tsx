import { notFound } from "next/navigation";
import { exigirSessao } from "@/lib/auth";
import { obterConfiguracao } from "@/lib/consultas";
import { formatarDataHora } from "@/lib/datas";
import { formatarQuantidade, formatarReais } from "@/lib/dinheiro";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import { obterVenda } from "@/lib/servicos/vendas";
import { agruparItensPorProduto } from "@/lib/servicos/vendas-calculos";
import { formatarCnpj, formatarTelefone } from "@/lib/utils";
import { BotaoImprimir } from "./_componentes/botao-imprimir";

export const dynamic = "force-dynamic";

/**
 * Cupom não fiscal 80mm. Na tela mostra uma prévia centralizada; na impressão
 * só o bloco .cupom sai (o CSS global esconde .nao-imprimir e ajusta a largura).
 * ?auto=1 dispara a impressão ao abrir.
 */
export default async function PaginaCupom({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const [, { id }, { auto }] = await Promise.all([exigirSessao(), params, searchParams]);
  if (!/^\d+$/.test(id)) notFound();
  const [venda, config] = await Promise.all([obterVenda(Number(id)), obterConfiguracao()]);
  if (!venda) notFound();

  const trocoTotal = venda.pagamentos.reduce((a, p) => a + p.troco, 0);
  // Um produto por linha: a gravação divide por lote (FEFO), mas isso não interessa no cupom.
  const itens = agruparItensPorProduto(venda.itens);
  const totalItens = itens.reduce((a, i) => a + (i.unidade === "UN" ? i.quantidade / 1000 : 1), 0);

  return (
    <div className="mx-auto max-w-md">
      {/* Na impressão, some a casca do sistema (menu lateral e cabeçalho) e fica só o cupom. */}
      <style>{`@media print { aside, header, nav { display: none !important; } main { padding: 0 !important; } .cupom-moldura { border: 0 !important; box-shadow: none !important; padding: 0 !important; max-width: none !important; } }`}</style>

      <BotaoImprimir automatico={auto === "1"} />

      <div className="cupom cupom-moldura mx-auto w-[80mm] max-w-full rounded-padrao border border-borda bg-superficie p-4 font-mono text-[12px] leading-tight text-texto shadow-padrao">
        <div className="text-center">
          <p className="text-[15px] font-bold uppercase">{config.nomeLoja}</p>
          {config.cnpj ? <p>CNPJ {formatarCnpj(config.cnpj)}</p> : null}
          {config.endereco ? <p>{config.endereco}</p> : null}
          {config.telefone ? <p>Tel. {formatarTelefone(config.telefone)}</p> : null}
        </div>

        <Separador />

        <div className="flex justify-between">
          <span>CUPOM Nº {venda.numero}</span>
          <span>{formatarDataHora(venda.criadoEm)}</span>
        </div>
        <p>Operador: {venda.usuario.nome}</p>
        {venda.cliente ? <p>Cliente: {venda.cliente.nome}</p> : null}
        {venda.status === "CANCELADA" ? <p className="mt-1 text-center font-bold">*** VENDA CANCELADA ***</p> : null}

        <Separador />

        <table className="w-full">
          <thead>
            <tr className="text-left">
              <th className="font-normal">Item</th>
              <th className="text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item, i) => (
              <tr key={`${item.produtoId}-${item.precoUnitario}-${item.unidade}`} className="align-top">
                <td className="pr-2">
                  <span className="block">
                    {String(i + 1).padStart(2, "0")} {item.descricao}
                  </span>
                  <span className="block">
                    {formatarQuantidade(item.quantidade, item.unidade)} {item.unidade === "KG" ? "kg" : "un"} x{" "}
                    {formatarReais(item.precoUnitario, false)}
                    {item.desconto > 0 ? ` (desc. ${formatarReais(item.desconto, false)})` : ""}
                  </span>
                </td>
                <td className="whitespace-nowrap text-right tabular">{formatarReais(item.total, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Separador />

        <Linha rotulo={`Itens (${formatarQuantidade(Math.round(totalItens * 1000), "UN")})`} valor="" />
        <Linha rotulo="Subtotal" valor={formatarReais(venda.subtotal, false)} />
        {venda.desconto > 0 ? <Linha rotulo="Desconto" valor={`-${formatarReais(venda.desconto, false)}`} /> : null}
        <div className="mt-1 flex justify-between text-[15px] font-bold">
          <span>TOTAL</span>
          <span className="tabular">R$ {formatarReais(venda.total, false)}</span>
        </div>

        <Separador />

        {venda.pagamentos.map((p) => (
          <Linha
            key={p.id}
            rotulo={`${ROTULO_FORMA_PAGAMENTO[p.forma]}${p.forma === "CREDITO" && p.parcelas > 1 ? ` ${p.parcelas}x` : ""}${p.nsu ? ` NSU ${p.nsu}` : ""}`}
            valor={formatarReais(p.valor, false)}
          />
        ))}
        {venda.pagamentos.some((p) => p.forma === "DINHEIRO" && p.valorRecebido !== null) ? (
          <Linha
            rotulo="Recebido"
            valor={formatarReais(
              venda.pagamentos.reduce((a, p) => a + (p.forma === "DINHEIRO" ? (p.valorRecebido ?? p.valor) : 0), 0),
              false,
            )}
          />
        ) : null}
        {trocoTotal > 0 ? <Linha rotulo="TROCO" valor={formatarReais(trocoTotal, false)} negrito /> : null}

        <Separador />

        {config.mensagemCupom ? <p className="text-center whitespace-pre-line">{config.mensagemCupom}</p> : null}
        <p className="mt-2 text-center font-bold">NÃO É DOCUMENTO FISCAL</p>
        <p className="text-center text-[10px]">Sem valor fiscal. Guarde pra trocas.</p>
      </div>
    </div>
  );
}

function Separador() {
  return <div className="my-2 border-t border-dashed border-texto/60" aria-hidden />;
}

function Linha({ rotulo, valor, negrito }: { rotulo: string; valor: string; negrito?: boolean }) {
  return (
    <div className={negrito ? "flex justify-between font-bold" : "flex justify-between"}>
      <span>{rotulo}</span>
      <span className="tabular">{valor}</span>
    </div>
  );
}
