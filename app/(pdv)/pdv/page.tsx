import { Lock, Wallet } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { obterConfiguracao, obterConfiguracoesPagamento, obterSessaoCaixaAberta } from "@/lib/consultas";
import { listarMaquininhasAtivas } from "@/lib/servicos/maquininhas";
import { BotaoLink } from "@/app/(app)/produtos/_componentes/botao-link";
import { Pdv } from "./_componentes/pdv";
import type { DadosPdv } from "./_componentes/tipos";

export const dynamic = "force-dynamic";

export const metadata = { title: "Caixa" };

type Props = { searchParams: Promise<{ codigo?: string; erro?: string }> };

export default async function PaginaPdv({ searchParams }: Props) {
  const [sessao, caixa, params] = await Promise.all([exigirSessao(), obterSessaoCaixaAberta(), searchParams]);

  if (!caixa) {
    return (
      <div className="flex min-h-[calc(100vh-49px)] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-padrao border border-borda bg-superficie p-8 text-center shadow-padrao">
          <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-alerta-suave text-alerta">
            <Lock className="size-8" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold text-texto">Caixa fechado</h1>
          <p className="mt-2 text-sm text-texto-suave">
            Pra começar a vender, abra o caixa informando o fundo de troco. Depois volte aqui e é só bipar.
          </p>
          <BotaoLink href="/caixa" tamanho="xl" className="mt-6 w-full">
            <Wallet className="size-5" aria-hidden />
            Abrir o caixa
          </BotaoLink>
        </div>
      </div>
    );
  }

  const [config, configsPagamento, maquininhas] = await Promise.all([
    obterConfiguracao(),
    obterConfiguracoesPagamento(),
    listarMaquininhasAtivas(),
  ]);
  const ordem = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "FIADO"] as const;
  const formas = ordem
    .map((f) => configsPagamento.find((c) => c.forma === f))
    .filter((c): c is NonNullable<typeof c> => Boolean(c && c.ativo))
    .map((c) => ({ forma: c.forma, maxParcelas: Math.max(1, c.maxParcelas) }));

  const dados: DadosPdv = {
    sessao: { id: caixa.id, valorAbertura: caixa.valorAbertura, abertoEm: caixa.abertoEm.toISOString() },
    config: {
      nomeLoja: config.nomeLoja,
      permitirDescontoOperador: config.permitirDescontoOperador,
      descontoMaximoPercentual: config.descontoMaximoPercentual,
      permitirVendaSemEstoque: config.permitirVendaSemEstoque,
      pix: config.pixChave?.trim()
        ? {
            chave: config.pixChave.trim(),
            nome: config.pixNomeRecebedor?.trim() || config.nomeLoja,
            cidade: config.pixCidade?.trim() || "BRASIL",
          }
        : null,
      mpConfigurado: Boolean(config.mpAccessToken?.trim() && config.mpDeviceId?.trim()),
    },
    formas,
    maquininhas: maquininhas.map((m) => ({
      id: m.id,
      nome: m.nome,
      adquirente: m.adquirente,
      padrao: m.padrao,
      taxaDebito: m.taxaDebito,
      taxaCredito: m.taxaCredito,
      taxaCreditoParcelado: m.taxaCreditoParcelado,
      taxaPix: m.taxaPix,
    })),
    papel: sessao.papel,
    usuarioNome: sessao.nome,
    codigoInicial: params.codigo?.trim() || null,
    erroInicial: params.erro === "sem-permissao" ? "Você não tem permissão pra acessar aquela página." : null,
  };

  return <Pdv dados={dados} />;
}
