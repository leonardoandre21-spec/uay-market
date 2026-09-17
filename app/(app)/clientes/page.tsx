import type { Metadata } from "next";
import { Cake, Clock, HandCoins, UserPlus, Users } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { Indicador } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio, GradeIndicadores } from "@/components/ui/pagina";
import { formatarReais } from "@/lib/dinheiro";
import { agora, formatarMesAno } from "@/lib/datas";
import { DIAS_FIADO_VENCIDO } from "@/lib/servicos/clientes-calculos";
import {
  calcularIndicadores,
  FILTROS_CLIENTES,
  filtrarClientes,
  listarClientesComResumo,
  normalizarFiltro,
} from "@/lib/servicos/clientes";
import { FiltrosClientes } from "./_componentes/filtros-clientes";
import { TabelaClientes } from "./_componentes/tabela-clientes";
import { LinkBotao } from "./_componentes/link-botao";

export const metadata: Metadata = { title: "Clientes e fiado" };
export const dynamic = "force-dynamic";

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; filtro?: string }>;
}) {
  await exigirSessao();
  const params = await searchParams;
  const busca = (params.busca ?? "").trim();
  const filtro = normalizarFiltro(params.filtro);

  const todos = await listarClientesComResumo();
  const indicadores = calcularIndicadores(todos);
  const lista = filtrarClientes(todos, busca, filtro);
  const opcoes = FILTROS_CLIENTES.map((f) => ({ ...f, quantidade: filtrarClientes(todos, busca, f.valor).length }));
  const mesAtual = formatarMesAno(agora());

  const mensagemVazia = busca
    ? `Nenhum cliente encontrado para "${busca}".`
    : filtro === "devendo"
      ? "Ninguém está devendo. Tudo em dia!"
      : filtro === "inativos"
        ? "Nenhum cliente inativo."
        : filtro === "aniversariantes"
          ? `Nenhum aniversariante em ${mesAtual}.`
          : "Nenhum cliente ativo.";

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Clientes e fiado"
        descricao="Cadastro dos clientes, controle do caderno de fiado e cobrança."
        acoes={
          <LinkBotao href="/clientes/novo">
            <UserPlus className="size-4" aria-hidden />
            Novo cliente
          </LinkBotao>
        }
      />

      <GradeIndicadores>
        <Indicador
          rotulo="Clientes ativos"
          valor={indicadores.clientesAtivos}
          detalhe={`${todos.length - indicadores.clientesAtivos} inativo(s) no cadastro`}
          icone={<Users className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Total a receber de fiado"
          valor={formatarReais(indicadores.totalAReceber)}
          detalhe={
            indicadores.clientesDevendo === 0
              ? "Ninguém devendo"
              : `${indicadores.clientesDevendo} cliente(s) com saldo em aberto`
          }
          tom={indicadores.totalAReceber > 0 ? "alerta" : "sucesso"}
          icone={<HandCoins className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Fiado vencido"
          valor={indicadores.clientesVencidos}
          detalhe={`Clientes com compra em aberto há mais de ${DIAS_FIADO_VENCIDO} dias`}
          tom={indicadores.clientesVencidos > 0 ? "perigo" : "neutro"}
          icone={<Clock className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Aniversariantes do mês"
          valor={indicadores.aniversariantes}
          detalhe={mesAtual.charAt(0).toUpperCase() + mesAtual.slice(1)}
          tom={indicadores.aniversariantes > 0 ? "primaria" : "neutro"}
          icone={<Cake className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      {todos.length === 0 ? (
        <EstadoVazio
          icone={<Users />}
          titulo="Nenhum cliente cadastrado"
          descricao="Cadastre os clientes do mercado pra controlar o fiado, ver o histórico de compras e lembrar dos aniversários."
          acao={
            <LinkBotao href="/clientes/novo">
              <UserPlus className="size-4" aria-hidden />
              Cadastrar primeiro cliente
            </LinkBotao>
          }
        />
      ) : (
        <>
          <FiltrosClientes busca={busca} filtro={filtro} opcoes={opcoes} totalExibido={lista.length} />
          <TabelaClientes clientes={lista} mensagemVazia={mensagemVazia} />
        </>
      )}
    </div>
  );
}
