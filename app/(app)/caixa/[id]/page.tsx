import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Printer, Wallet } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { formatarDataHora } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { Aviso } from "@/components/ui/aviso";
import { descreverDiferenca } from "@/lib/servicos/caixa-calculos";
import { carregarSessao, listarVendasDaSessao, podeVerSessao, resumoSessao } from "@/lib/servicos/caixa";
import { PainelSessao } from "@/app/(app)/caixa/_componentes/painel-sessao";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ fechado?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Caixa nº ${id}` };
}

const classeBotaoContorno =
  "inline-flex h-10 items-center gap-2 rounded-padrao border border-borda bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2";
const classeBotaoPrimario =
  "inline-flex h-10 items-center gap-2 rounded-padrao bg-primaria px-4 text-sm font-medium text-primaria-texto shadow-sm hover:bg-primaria-forte";

export default async function PaginaDetalheCaixa({ params, searchParams }: Props) {
  const [usuario, { id: idTexto }, { fechado }] = await Promise.all([exigirSessao(), params, searchParams]);
  const id = Number(idTexto);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const sessao = await carregarSessao(id);
  if (!sessao) notFound();
  if (!podeVerSessao(sessao, usuario)) redirect("/caixa/historico");

  const [resumo, vendas] = await Promise.all([resumoSessao(id), listarVendasDaSessao(id, 10)]);
  const aberta = sessao.status === "ABERTO";
  const recemFechado = fechado === "1" && !aberta;

  return (
    <>
      <CabecalhoPagina
        titulo={aberta ? `Caixa nº ${sessao.id} (aberto)` : `Caixa nº ${sessao.id}`}
        descricao={
          aberta
            ? `Aberto por ${sessao.usuarioAbertura.nome} em ${formatarDataHora(sessao.abertoEm)}.`
            : `Fechado em ${formatarDataHora(sessao.fechadoEm)} por ${sessao.usuarioFechamento?.nome ?? "usuário não informado"}.`
        }
        acoes={
          <>
            <Link href="/caixa/historico" className={classeBotaoContorno}>
              <ArrowLeft className="size-4" aria-hidden />
              Histórico
            </Link>
            {aberta ? (
              <Link href="/caixa" className={classeBotaoPrimario}>
                <Wallet className="size-4" aria-hidden />
                Painel do caixa
              </Link>
            ) : (
              <>
                <Link href={`/caixa/${sessao.id}/resumo`} className={classeBotaoContorno}>
                  <Printer className="size-4" aria-hidden />
                  Resumo para impressão
                </Link>
                <Link href="/caixa" className={classeBotaoPrimario}>
                  <Wallet className="size-4" aria-hidden />
                  Abrir novo caixa
                </Link>
              </>
            )}
          </>
        }
      />

      {recemFechado ? (
        <Aviso tom="sucesso" className="mb-6" titulo="Caixa fechado com sucesso">
          {sessao.diferenca !== null ? `${descreverDiferenca(sessao.diferenca)}. ` : ""}
          Você pode imprimir o resumo pra guardar com o dinheiro ou abrir um novo caixa.
        </Aviso>
      ) : null}

      {aberta ? (
        <Aviso tom="info" className="mb-6">
          Este caixa ainda está aberto. Sangria, suprimento e fechamento ficam no painel do caixa.
        </Aviso>
      ) : null}

      <PainelSessao sessao={sessao} resumo={resumo} vendas={vendas} />
    </>
  );
}
