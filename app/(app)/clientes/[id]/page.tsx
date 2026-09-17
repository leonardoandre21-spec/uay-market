import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChartColumn, MessageCircle, Pencil, Receipt, ShoppingBag, UserCheck } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { formatarReais } from "@/lib/dinheiro";
import { iniciaisDoNome, lerLimiteExtrato } from "@/lib/servicos/clientes-calculos";
import { obterCliente, obterClienteCompleto } from "@/lib/servicos/clientes";
import { AbasCliente } from "../_componentes/abas-cliente";
import { AcoesCliente } from "../_componentes/acoes-cliente";
import { DialogoAjusteSaldo } from "../_componentes/dialogo-ajuste-saldo";
import { DialogoReceberPagamento } from "../_componentes/dialogo-receber-pagamento";
import { FormularioCliente } from "../_componentes/formulario-cliente";
import { LinkBotao } from "../_componentes/link-botao";
import { SecaoCompras, SecaoEstatisticas, SecaoExtrato, SecaoResumo } from "../_componentes/secoes-cliente";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ acao?: string; aba?: string; extrato?: string }>;

function lerId(texto: string): number | null {
  const n = Number(texto);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = lerId((await params).id);
  if (!id) return { title: "Cliente" };
  const cliente = await obterCliente(id);
  return { title: cliente ? cliente.nome : "Cliente" };
}

export default async function PaginaCliente({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const sessao = await exigirSessao();
  const ehAdmin = sessao.papel === "ADMIN";
  const [{ id: idTexto }, { acao, aba, extrato }] = await Promise.all([params, searchParams]);
  const id = lerId(idTexto);
  if (!id) notFound();

  const cliente = await obterClienteCompleto(id, lerLimiteExtrato(extrato));
  if (!cliente) notFound();

  const abas = [
    {
      id: "resumo",
      rotulo: "Resumo",
      icone: <UserCheck className="size-4" aria-hidden />,
      conteudo: <SecaoResumo cliente={cliente} />,
    },
    {
      id: "extrato",
      rotulo: "Extrato de fiado",
      icone: <Receipt className="size-4" aria-hidden />,
      contador: cliente.totalLancamentos,
      conteudo: <SecaoExtrato cliente={cliente} />,
    },
    {
      id: "compras",
      rotulo: "Compras",
      icone: <ShoppingBag className="size-4" aria-hidden />,
      contador: cliente.estatisticas.comprasConcluidas,
      conteudo: <SecaoCompras cliente={cliente} />,
    },
    {
      id: "estatisticas",
      rotulo: "Estatísticas",
      icone: <ChartColumn className="size-4" aria-hidden />,
      conteudo: <SecaoEstatisticas cliente={cliente} />,
    },
    {
      id: "cadastro",
      rotulo: "Cadastro",
      icone: <Pencil className="size-4" aria-hidden />,
      conteudo: (
        <div className="flex flex-col gap-4">
          <Cartao>
            <CartaoCabecalho titulo="Dados do cliente" descricao={ehAdmin ? undefined : "O limite de fiado só o administrador altera."} />
            <CartaoConteudo>
              <FormularioCliente
                ehAdmin={ehAdmin}
                cliente={{
                  id: cliente.id,
                  nome: cliente.nome,
                  cpf: cliente.cpf,
                  telefone: cliente.telefone,
                  email: cliente.email,
                  endereco: cliente.endereco,
                  dataNascimentoInput: cliente.dataNascimentoInput,
                  limiteFiado: cliente.limiteFiado,
                  observacao: cliente.observacao,
                  ativo: cliente.ativo,
                }}
              />
            </CartaoConteudo>
          </Cartao>
          <Cartao>
            <CartaoCabecalho titulo="Desativar ou excluir" descricao="Desativar guarda o histórico. Excluir só é possível sem compras nem lançamentos." />
            <CartaoConteudo>
              <AcoesCliente
                clienteId={cliente.id}
                clienteNome={cliente.nome}
                ativo={cliente.ativo}
                saldo={cliente.saldo}
                ehAdmin={ehAdmin}
                podeExcluir={!cliente.temMovimento}
              />
            </CartaoConteudo>
          </Cartao>
        </div>
      ),
    },
  ];

  const descricaoCabecalho = [
    cliente.cpfFormatado ? `CPF ${cliente.cpfFormatado}` : null,
    cliente.telefoneFormatado || null,
    `Cliente desde ${cliente.criadoEmFormatado}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/clientes" className="inline-flex items-center gap-1.5 text-sm text-texto-suave hover:text-texto">
          <ArrowLeft className="size-4" aria-hidden />
          Todos os clientes
        </Link>
      </div>

      <CabecalhoPagina
        className="mb-0"
        titulo={
          <span className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primaria-suave text-base font-semibold text-primaria">
              {iniciaisDoNome(cliente.nome)}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {cliente.nome}
              <Selo tom={cliente.situacao.tom}>{cliente.situacao.rotulo}</Selo>
            </span>
          </span>
        }
        descricao={descricaoCabecalho}
        acoes={
          <>
            {cliente.saldo > 0 ? (
              <LinkBotao
                href={cliente.linkWhatsApp ?? "#"}
                externo
                variante="contorno"
                desabilitado={!cliente.linkWhatsApp}
                title={cliente.linkWhatsApp ? "Abre o WhatsApp com a mensagem pronta. Nada é enviado sem você confirmar." : "Cadastre um telefone com DDD pra cobrar pelo WhatsApp."}
              >
                <MessageCircle className="size-4" aria-hidden />
                Cobrar pelo WhatsApp
              </LinkBotao>
            ) : null}
            {ehAdmin ? <DialogoAjusteSaldo clienteId={cliente.id} clienteNome={cliente.nome} saldo={cliente.saldo} /> : null}
            <DialogoReceberPagamento
              clienteId={cliente.id}
              clienteNome={cliente.nome}
              saldo={cliente.saldo}
              caixaAberto={cliente.caixaAberto}
              maquininhas={cliente.maquininhas}
              abrirInicial={acao === "receber"}
            />
          </>
        }
      />

      {cliente.saldo > 0 ? (
        <p className="text-sm text-texto-suave">
          Saldo devedor de <span className="font-semibold text-perigo">{formatarReais(cliente.saldo)}</span>
          {cliente.limiteFiado > 0 ? (
            <>
              {" "}
              de um limite de <span className="font-medium text-texto">{formatarReais(cliente.limiteFiado)}</span>
            </>
          ) : null}
          .
        </p>
      ) : null}
      {cliente.saldo < 0 ? (
        <p className="text-sm text-texto-suave">
          Crédito de <span className="font-semibold text-info">{formatarReais(-cliente.saldo)}</span> a favor do cliente: a loja deve esse valor a ele.
        </p>
      ) : null}

      <AbasCliente abas={abas} abaInicial={aba} />
    </div>
  );
}
