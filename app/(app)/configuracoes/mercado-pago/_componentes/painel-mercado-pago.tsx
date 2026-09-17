"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Eye, EyeOff, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { CaixaSelecao, Campo, Entrada } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { useToast } from "@/components/ui/toast";
import type { TipoTokenMercadoPago } from "@/lib/servicos/configuracoes-regras";
import {
  ativarModoPdv,
  buscarMaquininhas,
  salvarMercadoPago,
  testarConexaoMercadoPago,
  usarMaquininha,
  type Maquininha,
} from "../actions";

export type EstadoMercadoPago = {
  tokenConfigurado: boolean;
  tipoToken: TipoTokenMercadoPago | null;
  mpDeviceId: string | null;
  mpUserId: string | null;
};

const DOCUMENTACAO = "https://www.mercadopago.com.br/developers/pt/docs/mp-point/landing";
const PAINEL_CREDENCIAIS = "https://www.mercadopago.com.br/developers/panel/app";

export function PainelMercadoPago({ estado }: { estado: EstadoMercadoPago }) {
  const router = useRouter();
  const toast = useToast();
  const [mostrarToken, setMostrarToken] = useState(false);
  const [deviceId, setDeviceId] = useState(estado.mpDeviceId ?? "");
  const [userId, setUserId] = useState(estado.mpUserId ?? "");
  const [conta, setConta] = useState<{ nome: string; usuarioId: string; email: string | null } | null>(null);
  const [testando, setTestando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [maquininhas, setMaquininhas] = useState<Maquininha[] | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);

  async function testar() {
    setTestando(true);
    setConta(null);
    const r = await testarConexaoMercadoPago();
    setTestando(false);
    if (r.ok) {
      setConta(r.dados);
      if (!userId && r.dados.usuarioId) setUserId(r.dados.usuarioId);
      toast.sucesso(`Conectado à conta ${r.dados.nome}.`);
    } else {
      toast.erro(r.erro);
    }
  }

  async function buscar() {
    setBuscando(true);
    const r = await buscarMaquininhas();
    setBuscando(false);
    if (r.ok) {
      setMaquininhas(r.dados);
      if (r.dados.length === 0) toast.notificar("Nenhuma maquininha ligada a esta conta.", "info");
    } else {
      toast.erro(r.erro);
    }
  }

  async function usar(id: string) {
    setOcupada(id);
    const form = new FormData();
    form.set("deviceId", id);
    const r = await usarMaquininha(form);
    setOcupada(null);
    if (r.ok) {
      setDeviceId(id);
      toast.sucesso("Maquininha definida como a do caixa.");
      router.refresh();
    } else {
      toast.erro(r.erro);
    }
  }

  async function ativarPdv(id: string) {
    setOcupada(id);
    const form = new FormData();
    form.set("deviceId", id);
    const r = await ativarModoPdv(form);
    setOcupada(null);
    if (r.ok) {
      setMaquininhas(
        (lista) => lista?.map((m) => (m.id === id ? { ...m, operatingMode: r.dados.operatingMode } : m)) ?? null,
      );
      toast.sucesso("Modo PDV ativado. Reinicie a maquininha se ela não mudar sozinha.");
    } else {
      toast.erro(r.erro);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Aviso tom="alerta" titulo="Integração opcional">
        Só use se sua maquininha for Mercado Pago Point. InfinitePay e Sipag não oferecem integração com PDV no
        computador; para elas,{" "}
        <Link href="/configuracoes/maquininhas" className="font-medium underline">
          cadastre em Maquininhas
        </Link>{" "}
        e registre o pagamento manualmente.
      </Aviso>
      <Aviso tom="info" titulo="Como funciona a integração com a maquininha">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Use o <strong>access token de produção</strong> (começa com APP_USR) da conta Mercado Pago dona da
            maquininha. Gere em{" "}
            <a href={PAINEL_CREDENCIAIS} target="_blank" rel="noreferrer" className="underline">
              Suas integrações
            </a>
            . Token de teste (TEST-) não fala com maquininhas reais.
          </li>
          <li>
            A maquininha Point precisa estar em <strong>modo PDV</strong>: nesse modo ela só cobra o valor que o caixa
            mandar. Você ativa isso abaixo, sem sair do sistema.
          </li>
          <li>
            Se você também usa outras maquininhas, cadastre a Point em{" "}
            <Link href="/configuracoes/maquininhas" className="underline">
              Maquininhas
            </Link>{" "}
            com adquirente <strong>Mercado Pago</strong>: o caixa só cobra pela integração quando ela for a escolhida
            na venda.
          </li>
          <li>
            Dúvidas:{" "}
            <a
              href={DOCUMENTACAO}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              documentação do Mercado Pago Point <ExternalLink className="size-3" aria-hidden />
            </a>
          </li>
        </ul>
      </Aviso>

      <Cartao>
        <CartaoCabecalho
          titulo="Credenciais"
          descricao="O token fica guardado só no servidor. Aqui você só substitui ou apaga."
          acoes={
            estado.tokenConfigurado ? (
              <Selo
                tom={estado.tipoToken === "producao" ? "sucesso" : estado.tipoToken === "teste" ? "alerta" : "info"}
              >
                <Check className="size-3" aria-hidden />
                {estado.tipoToken === "producao"
                  ? "Token de produção salvo"
                  : estado.tipoToken === "teste"
                    ? "Token de TESTE salvo"
                    : "Token salvo"}
              </Selo>
            ) : (
              <Selo tom="neutro">Sem token</Selo>
            )
          }
        />
        <CartaoConteudo>
          <FormularioAcao
            acao={salvarMercadoPago}
            mensagemSucesso="Credenciais do Mercado Pago salvas."
            aoSucesso={() => router.refresh()}
            className="flex flex-col gap-4"
          >
            {(estadoForm, pendente) => (
              <>
                <Campo
                  rotulo={
                    estado.tokenConfigurado ? "Novo access token (deixe em branco pra manter o atual)" : "Access token"
                  }
                  htmlFor="mpAccessToken"
                  ajuda="Cole o token completo. Ele nunca é mostrado depois de salvo."
                  erro={erroCampo(estadoForm, "mpAccessToken")}
                >
                  <div className="flex gap-2">
                    <Entrada
                      id="mpAccessToken"
                      name="mpAccessToken"
                      type={mostrarToken ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="APP_USR-..."
                      className="font-mono"
                    />
                    <Botao
                      type="button"
                      variante="contorno"
                      onClick={() => setMostrarToken((v) => !v)}
                      aria-label={mostrarToken ? "Ocultar token digitado" : "Mostrar token digitado"}
                    >
                      {mostrarToken ? (
                        <EyeOff className="size-4" aria-hidden />
                      ) : (
                        <Eye className="size-4" aria-hidden />
                      )}
                    </Botao>
                  </div>
                </Campo>
                {estado.tokenConfigurado ? (
                  <CaixaSelecao name="removerToken" rotulo="Apagar o token salvo (desliga a integração)" />
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo
                    rotulo="ID da maquininha (device id)"
                    htmlFor="mpDeviceId"
                    ajuda="Preenchido ao escolher uma maquininha abaixo."
                    erro={erroCampo(estadoForm, "mpDeviceId")}
                  >
                    <Entrada
                      id="mpDeviceId"
                      name="mpDeviceId"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                      placeholder="PAX_A910__SMARTPOS..."
                      className="font-mono"
                    />
                  </Campo>
                  <Campo
                    rotulo="ID da conta (user id)"
                    htmlFor="mpUserId"
                    ajuda="Preenchido ao testar a conexão."
                    erro={erroCampo(estadoForm, "mpUserId")}
                  >
                    <Entrada
                      id="mpUserId"
                      name="mpUserId"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      inputMode="numeric"
                      className="font-mono"
                    />
                  </Campo>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Botao
                    type="button"
                    variante="contorno"
                    onClick={testar}
                    pendente={testando}
                    disabled={!estado.tokenConfigurado}
                  >
                    <Wifi className="size-4" aria-hidden /> Testar conexão
                  </Botao>
                  <BotaoEnviar pendente={pendente}>Salvar credenciais</BotaoEnviar>
                </div>
                {conta ? (
                  <Aviso tom="sucesso" titulo={`Conectado: ${conta.nome}`}>
                    ID da conta {conta.usuarioId || "não informado"}
                    {conta.email ? ` · ${conta.email}` : ""}
                  </Aviso>
                ) : null}
                {!estado.tokenConfigurado ? (
                  <p className="text-xs text-texto-fraco">
                    Salve o token primeiro pra testar a conexão e buscar maquininhas.
                  </p>
                ) : null}
              </>
            )}
          </FormularioAcao>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Maquininhas da conta"
          descricao="Escolha qual maquininha o caixa vai usar e ative o modo PDV nela."
          acoes={
            <Botao variante="contorno" onClick={buscar} pendente={buscando} disabled={!estado.tokenConfigurado}>
              <RefreshCw className="size-4" aria-hidden /> Buscar maquininhas
            </Botao>
          }
        />
        <CartaoConteudo>
          <Tabela>
            <Thead>
              <Tr>
                <Th>Maquininha (id)</Th>
                <Th>Modo</Th>
                <Th>Loja / PDV</Th>
                <Th className="text-right">Ações</Th>
              </Tr>
            </Thead>
            <Tbody>
              {maquininhas === null ? (
                <LinhaVazia
                  colunas={4}
                  mensagem={
                    estado.tokenConfigurado
                      ? "Clique em Buscar maquininhas pra listar as que estão ligadas à conta."
                      : "Salve o access token pra buscar as maquininhas."
                  }
                />
              ) : maquininhas.length === 0 ? (
                <LinhaVazia
                  colunas={4}
                  mensagem="Nenhuma maquininha encontrada. Confira se a Point está ligada à mesma conta do token."
                />
              ) : (
                maquininhas.map((m) => {
                  const emUso = m.id === (estado.mpDeviceId ?? deviceId);
                  const emPdv = m.operatingMode === "PDV";
                  return (
                    <Tr key={m.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Smartphone className="size-4 text-texto-fraco" aria-hidden />
                          <span className="font-mono text-xs">{m.id}</span>
                          {emUso ? <Selo tom="primaria">em uso no caixa</Selo> : null}
                        </div>
                      </Td>
                      <Td>
                        <Selo tom={emPdv ? "sucesso" : "alerta"}>{emPdv ? "PDV (pronta)" : m.operatingMode}</Selo>
                      </Td>
                      <Td className="text-xs text-texto-suave">
                        {[
                          m.storeId ? `loja ${m.storeId}` : null,
                          m.posId !== null ? `PDV ${m.posId}` : null,
                          m.externalPosId,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "sem vínculo"}
                      </Td>
                      <Td className="text-right">
                        <div className="inline-flex gap-1">
                          {!emUso ? (
                            <Botao
                              variante="fantasma"
                              tamanho="sm"
                              onClick={() => usar(m.id)}
                              pendente={ocupada === m.id}
                            >
                              Usar esta
                            </Botao>
                          ) : null}
                          {!emPdv ? (
                            <Botao
                              variante="secundaria"
                              tamanho="sm"
                              onClick={() => ativarPdv(m.id)}
                              pendente={ocupada === m.id}
                            >
                              Ativar modo PDV
                            </Botao>
                          ) : null}
                        </div>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </Tbody>
          </Tabela>
        </CartaoConteudo>
      </Cartao>
    </div>
  );
}
