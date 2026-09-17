import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { obterConfiguracao } from "@/lib/consultas";
import { formatarDataHora, formatarHora } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO, ROTULO_FORMA_PAGAMENTO_CURTO } from "@/lib/rotulos";
import { cn, formatarCnpj } from "@/lib/utils";
import { Aviso } from "@/components/ui/aviso";
import { descreverDiferenca, variacaoEsperadoAposFechamento } from "@/lib/servicos/caixa-calculos";
import { carregarSessao, podeVerSessao, resumoSessao } from "@/lib/servicos/caixa";
import { BotaoImprimir } from "@/app/(app)/caixa/_componentes/botao-imprimir";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Resumo do caixa nº ${id}` };
}

/**
 * Resumo do fechamento em formato de cupom (80mm). Na impressão, a barra
 * lateral e o cabeçalho do sistema somem; fica só o cupom.
 */
export default async function PaginaResumoCaixa({ params }: Props) {
  const [usuario, { id: idTexto }] = await Promise.all([exigirSessao(), params]);
  const id = Number(idTexto);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const sessao = await carregarSessao(id);
  if (!sessao) notFound();
  if (!podeVerSessao(sessao, usuario)) redirect("/caixa/historico");

  const [resumo, config] = await Promise.all([resumoSessao(id), obterConfiguracao()]);
  const aberta = sessao.status === "ABERTO";
  // As parcelas de "Dinheiro na gaveta" vêm do resumo recalculado agora, então o
  // "= Esperado" impresso logo abaixo delas é a soma dessas parcelas. Se a sessão
  // está fechada e o valor gravado no fechamento ficou diferente (venda em dinheiro
  // cancelada depois), o cupom imprime os dois; contado e diferença seguem o gravado.
  const esperadoRecalculado = resumo.dinheiroEsperado;
  const esperadoFechamento = sessao.valorFechamentoEsperado;
  const variacaoEsperado = aberta ? null : variacaoEsperadoAposFechamento(esperadoFechamento, esperadoRecalculado);
  const contado = sessao.valorFechamentoContado;
  const diferenca = sessao.diferenca;
  const movimentosCronologicos = [...sessao.movimentos].reverse();

  return (
    <>
      <style>{`
        @media print {
          aside, header, nav, .nao-imprimir { display: none !important; }
          main { padding: 0 !important; }
          .cupom { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; }
        }
      `}</style>

      <div className="nao-imprimir mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto">Resumo do caixa nº {sessao.id}</h1>
          <p className="mt-1 text-sm text-texto-suave">
            Formato de cupom (80mm). Imprima e guarde junto com o dinheiro da sangria ou do fechamento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/caixa/${sessao.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-padrao border border-borda bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Detalhes
          </Link>
          {!aberta ? (
            <Link
              href="/caixa"
              className="inline-flex h-10 items-center gap-2 rounded-padrao border border-borda bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2"
            >
              <Wallet className="size-4" aria-hidden />
              Abrir novo caixa
            </Link>
          ) : null}
          <BotaoImprimir>Imprimir</BotaoImprimir>
        </div>
      </div>

      {aberta ? (
        <Aviso tom="alerta" className="nao-imprimir mb-6">
          Este caixa ainda está aberto: o resumo abaixo é parcial e vai mudar até o fechamento.
        </Aviso>
      ) : null}

      <div className="cupom mx-auto w-full max-w-[80mm] rounded-padrao border border-borda bg-superficie px-4 py-5 font-mono text-[12px] leading-snug text-texto shadow-padrao">
        <div className="text-center">
          <p className="text-sm font-bold uppercase">{config.nomeLoja}</p>
          {config.cnpj ? <p>CNPJ {formatarCnpj(config.cnpj)}</p> : null}
          {config.endereco ? <p>{config.endereco}</p> : null}
          <p className="mt-2 font-bold">{aberta ? "RESUMO PARCIAL DO CAIXA" : "FECHAMENTO DE CAIXA"}</p>
          <p>Caixa nº {sessao.id}</p>
        </div>

        <Separador />

        <Linha rotulo="Aberto em" valor={formatarDataHora(sessao.abertoEm)} />
        <Linha rotulo="Aberto por" valor={sessao.usuarioAbertura.nome} />
        {!aberta ? (
          <>
            <Linha rotulo="Fechado em" valor={formatarDataHora(sessao.fechadoEm)} />
            <Linha rotulo="Fechado por" valor={sessao.usuarioFechamento?.nome ?? "Não informado"} />
          </>
        ) : null}

        <Separador />

        <Titulo>Vendas concluídas</Titulo>
        <Linha rotulo="Quantidade" valor={String(resumo.vendas.quantidade)} />
        {resumo.vendas.canceladas > 0 ? <Linha rotulo="Canceladas (fora)" valor={String(resumo.vendas.canceladas)} /> : null}
        <Linha rotulo="Total vendido" valor={formatarReais(resumo.vendas.total)} destaque />

        <Separador tracejado />

        <Titulo>Por forma de pagamento</Titulo>
        {FORMAS_PAGAMENTO.map((forma) => {
          const f = resumo.porForma[forma];
          if (f.quantidade === 0) return null;
          return (
            <Linha
              key={forma}
              rotulo={`${ROTULO_FORMA_PAGAMENTO_CURTO[forma]} (${f.quantidade})`}
              valor={formatarReais(f.valor)}
            />
          );
        })}
        {resumo.vendas.quantidade === 0 ? <p className="text-texto-fraco">Nenhuma venda.</p> : null}
        <Linha rotulo="Troco devolvido" valor={formatarReais(resumo.trocoTotal)} suave />

        <Separador />

        <Titulo>Dinheiro na gaveta</Titulo>
        <Linha rotulo="Fundo de troco" valor={formatarReais(resumo.valorAbertura)} />
        <Linha rotulo="+ Vendas dinheiro" valor={formatarReais(resumo.porForma.DINHEIRO.valor)} />
        <Linha rotulo={`+ Suprimentos (${resumo.suprimentos.quantidade})`} valor={formatarReais(resumo.suprimentos.total)} />
        <Linha rotulo="+ Fiado em dinheiro" valor={formatarReais(resumo.recebimentosFiado.dinheiro)} />
        <Linha rotulo={`- Sangrias (${resumo.sangrias.quantidade})`} valor={formatarReais(resumo.sangrias.total)} />
        <Linha rotulo={`- Despesas do caixa (${resumo.despesasCaixa.quantidade})`} valor={formatarReais(resumo.despesasCaixa.total)} />
        <Linha
          rotulo={variacaoEsperado !== null ? "= Esperado (recalculado)" : "= Esperado"}
          valor={formatarReais(esperadoRecalculado)}
          destaque
        />
        {variacaoEsperado !== null && esperadoFechamento !== null ? (
          <>
            <Linha rotulo="Esperado no fechamento" valor={formatarReais(esperadoFechamento)} destaque />
            <p className="mt-1 text-[11px] text-texto-suave">
              Mudou {variacaoEsperado > 0 ? "+" : ""}
              {formatarReais(variacaoEsperado)} depois do fechamento (venda cancelada ou lançamento posterior). Contado e
              diferença abaixo se referem ao esperado no fechamento.
            </p>
          </>
        ) : null}

        {!aberta ? (
          <>
            <Linha rotulo="Contado" valor={formatarReais(contado ?? 0)} destaque />
            <Linha
              rotulo="Diferença"
              valor={`${(diferenca ?? 0) > 0 ? "+" : ""}${formatarReais(diferenca ?? 0)}`}
              destaque
            />
            <p className="mt-1 text-center font-bold uppercase">{diferenca !== null ? descreverDiferenca(diferenca) : "Sem conferência"}</p>
          </>
        ) : null}

        {movimentosCronologicos.length ? (
          <>
            <Separador />
            <Titulo>Sangrias e suprimentos</Titulo>
            {movimentosCronologicos.map((m) => (
              <div key={m.id} className="mb-1.5">
                <Linha
                  rotulo={`${formatarHora(m.criadoEm)} ${m.tipo === "SANGRIA" ? "Sangria" : "Suprimento"}`}
                  valor={`${m.tipo === "SANGRIA" ? "-" : "+"}${formatarReais(m.valor)}`}
                />
                <p className="pl-2 text-[11px] text-texto-suave">
                  {m.motivo || "Sem motivo"}
                  {m.usuario ? ` (${m.usuario.nome})` : ""}
                </p>
              </div>
            ))}
          </>
        ) : null}

        {sessao.observacao || sessao.observacaoFechamento ? (
          <>
            <Separador />
            {sessao.observacao ? (
              <div className="mb-1.5">
                <Titulo>Obs. abertura</Titulo>
                <p className="whitespace-pre-line text-[11px]">{sessao.observacao}</p>
              </div>
            ) : null}
            {sessao.observacaoFechamento ? (
              <div>
                <Titulo>Obs. fechamento</Titulo>
                <p className="whitespace-pre-line text-[11px]">{sessao.observacaoFechamento}</p>
              </div>
            ) : null}
          </>
        ) : null}

        <Separador />
        <p className="text-center text-[11px] text-texto-suave">Impresso em {formatarDataHora(new Date())}</p>
        <div className="mt-6 border-t border-texto pt-1 text-center text-[11px]">
          Assinatura de quem {aberta ? "conferiu" : "fechou"}
        </div>
      </div>
    </>
  );
}

function Separador({ tracejado = false }: { tracejado?: boolean }) {
  return <hr className={cn("my-3 border-0 border-t border-texto/60", tracejado && "border-dashed")} />;
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 font-bold uppercase">{children}</p>;
}

function Linha({
  rotulo,
  valor,
  destaque = false,
  suave = false,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  suave?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2", destaque && "font-bold", suave && "text-texto-suave")}>
      <span className="min-w-0 break-words">{rotulo}</span>
      <span className="shrink-0 tabular">{valor}</span>
    </div>
  );
}
