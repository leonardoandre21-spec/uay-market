import type { Metadata } from "next";
import Link from "next/link";
import { History, ScanBarcode, Wallet } from "lucide-react";
import { exigirSessao, type Sessao } from "@/lib/auth";
import { obterSessaoCaixaAberta } from "@/lib/consultas";
import { formatarDataHora } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Aviso } from "@/components/ui/aviso";
import {
  carregarSessao,
  listarVendasDaSessao,
  obterUltimaSessaoFechada,
  podeFecharSessao,
  resumoSessao,
} from "@/lib/servicos/caixa";
import { FormularioAbrirCaixa } from "@/app/(app)/caixa/_componentes/formulario-abrir-caixa";
import { PainelSessao } from "@/app/(app)/caixa/_componentes/painel-sessao";
import { AcoesSessao } from "@/app/(app)/caixa/_componentes/acoes-sessao";
import { AtualizacaoAutomatica } from "@/app/(app)/caixa/_componentes/atualizacao-automatica";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Caixa" };

export default async function PaginaCaixa({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const [usuario, aberta, params] = await Promise.all([exigirSessao(), obterSessaoCaixaAberta(), searchParams]);

  if (!aberta) return <TelaAbrirCaixa erro={params.erro} />;
  return <TelaCaixaAberto sessaoId={aberta.id} usuario={usuario} />;
}

const linkHistorico = (
  <Link
    href="/caixa/historico"
    className="inline-flex h-10 items-center gap-2 rounded-padrao border border-borda bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2"
  >
    <History className="size-4" aria-hidden />
    Histórico de caixas
  </Link>
);

async function TelaAbrirCaixa({ erro }: { erro?: string }) {
  const ultima = await obterUltimaSessaoFechada();
  const sugestao =
    ultima && ultima.valorFechamentoContado !== null
      ? {
          valor: ultima.valorFechamentoContado,
          fechadoEm: formatarDataHora(ultima.fechadoEm),
          fechadoPor: ultima.usuarioFechamento?.nome ?? null,
        }
      : null;

  return (
    <>
      <CabecalhoPagina
        titulo="Abrir caixa"
        descricao="O caixa está fechado. Informe o fundo de troco pra começar a vender."
        acoes={linkHistorico}
      />

      {erro === "sem-permissao" ? (
        <Aviso tom="alerta" className="mb-6" titulo="Sem permissão">
          Você não tem acesso à página anterior. Abra o caixa pra continuar.
        </Aviso>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cartao>
          <CartaoCabecalho
            titulo={
              <span className="flex items-center gap-2">
                <Wallet className="size-5 text-primaria" aria-hidden />
                Abrir caixa
              </span>
            }
            descricao="Depois de abrir, você vai direto pro PDV."
          />
          <CartaoConteudo>
            <FormularioAbrirCaixa sugestao={sugestao} />
          </CartaoConteudo>
        </Cartao>

        <div className="flex flex-col gap-6">
          <Cartao>
            <CartaoCabecalho titulo="Última sessão" />
            <CartaoConteudo>
              {ultima ? (
                <dl className="flex flex-col gap-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-texto-suave">Fechada em</dt>
                    <dd className="text-right font-medium tabular">{formatarDataHora(ultima.fechadoEm)}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-texto-suave">Por</dt>
                    <dd className="text-right font-medium">{ultima.usuarioFechamento?.nome ?? "Não informado"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-texto-suave">Dinheiro esperado</dt>
                    <dd className="text-right font-medium tabular">{formatarReais(ultima.valorFechamentoEsperado ?? 0)}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-texto-suave">Dinheiro contado</dt>
                    <dd className="text-right font-medium tabular">{formatarReais(ultima.valorFechamentoContado ?? 0)}</dd>
                  </div>
                  <div className="pt-1">
                    <Link href={`/caixa/${ultima.id}`} className="text-sm font-medium text-primaria hover:underline">
                      Ver resumo completo
                    </Link>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-texto-suave">Nenhum caixa foi fechado ainda. Esta será a primeira sessão.</p>
              )}
            </CartaoConteudo>
          </Cartao>

          <Cartao>
            <CartaoCabecalho titulo="Como funciona" />
            <CartaoConteudo>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-texto-suave">
                <li>Conte o dinheiro que já está na gaveta e informe como fundo de troco.</li>
                <li>Venda normalmente no PDV. Registre sangrias e suprimentos por aqui.</li>
                <li>No fim do turno, feche o caixa contando o dinheiro. O sistema mostra se bateu.</li>
              </ol>
            </CartaoConteudo>
          </Cartao>
        </div>
      </div>
    </>
  );
}

async function TelaCaixaAberto({ sessaoId, usuario }: { sessaoId: number; usuario: Sessao }) {
  const [sessao, resumo, vendas] = await Promise.all([
    carregarSessao(sessaoId),
    resumoSessao(sessaoId),
    listarVendasDaSessao(sessaoId, 10),
  ]);
  if (!sessao) return <TelaAbrirCaixa />;

  const podeFechar = podeFecharSessao(sessao, usuario);

  return (
    <>
      <AtualizacaoAutomatica segundos={30} />
      <CabecalhoPagina
        titulo="Caixa aberto"
        descricao={`Aberto por ${sessao.usuarioAbertura.nome} em ${formatarDataHora(sessao.abertoEm)}. Os números atualizam sozinhos a cada 30 segundos.`}
        acoes={
          <>
            {linkHistorico}
            <Link
              href="/pdv"
              className="inline-flex h-10 items-center gap-2 rounded-padrao bg-primaria px-4 text-sm font-medium text-primaria-texto shadow-sm hover:bg-primaria-forte"
            >
              <ScanBarcode className="size-4" aria-hidden />
              Ir para o PDV
            </Link>
          </>
        }
      />

      {!podeFechar ? (
        <Aviso tom="info" className="mb-6" titulo="Caixa de outro operador">
          Este caixa foi aberto por {sessao.usuarioAbertura.nome}. Você pode vender, fazer sangria e suprimento, mas só{" "}
          {sessao.usuarioAbertura.nome} ou um administrador pode fechá-lo.
        </Aviso>
      ) : null}

      <PainelSessao
        sessao={sessao}
        resumo={resumo}
        vendas={vendas}
        acoes={
          <AcoesSessao
            sessaoId={sessao.id}
            dinheiroEsperado={resumo.dinheiroEsperado}
            podeFechar={podeFechar}
            resumo={{
              vendasQuantidade: resumo.vendas.quantidade,
              vendasTotal: resumo.vendas.total,
              sangrias: resumo.sangrias.total,
              suprimentos: resumo.suprimentos.total,
            }}
          />
        }
      />
    </>
  );
}
