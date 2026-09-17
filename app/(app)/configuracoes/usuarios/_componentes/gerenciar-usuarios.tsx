"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, ShieldCheck, UserPlus } from "lucide-react";
import type { Papel } from "@prisma/client";
import type { Resultado } from "@/lib/acao";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { CaixaSelecao, Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Dialogo } from "@/components/ui/dialogo";
import { FormularioAcao, erroCampo } from "@/components/ui/formulario-acao";
import { Selo } from "@/components/ui/selo";
import { Aviso } from "@/components/ui/aviso";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { ROTULO_PAPEL } from "@/lib/rotulos";
import { criarUsuarioAcao, editarUsuarioAcao, trocarPinAcao } from "../actions";

export type UsuarioSerializado = {
  id: number;
  nome: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: string;
  ultimoAcesso: string | null;
};

const PAPEIS: Papel[] = ["ADMIN", "OPERADOR"];

function CamposPin({
  estado,
  nomeNovo,
  rotuloNovo,
}: {
  estado: Resultado<unknown> | null;
  nomeNovo: string;
  rotuloNovo: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo
        rotulo={rotuloNovo}
        htmlFor={nomeNovo}
        obrigatorio
        ajuda="De 4 a 8 números."
        erro={erroCampo(estado, nomeNovo)}
      >
        <Entrada
          id={nomeNovo}
          name={nomeNovo}
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4,8}"
          minLength={4}
          maxLength={8}
          autoComplete="new-password"
          required
          className="tracking-[0.3em]"
        />
      </Campo>
      <Campo rotulo="Repita o PIN" htmlFor="confirmarPin" obrigatorio erro={erroCampo(estado, "confirmarPin")}>
        <Entrada
          id="confirmarPin"
          name="confirmarPin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4,8}"
          minLength={4}
          maxLength={8}
          autoComplete="new-password"
          required
          className="tracking-[0.3em]"
        />
      </Campo>
    </div>
  );
}

export function GerenciarUsuarios({
  usuarios,
  adminLogadoId,
}: {
  usuarios: UsuarioSerializado[];
  adminLogadoId: number;
}) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<UsuarioSerializado | null>(null);
  const [trocandoPin, setTrocandoPin] = useState<UsuarioSerializado | null>(null);

  const adminsAtivos = usuarios.filter((u) => u.papel === "ADMIN" && u.ativo).length;

  function concluir() {
    setCriando(false);
    setEditando(null);
    setTrocandoPin(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <CartaoCabecalho
          titulo="Usuários do sistema"
          descricao="Cada pessoa entra com o próprio PIN. Administradores veem tudo; operadores usam o caixa e os cadastros."
          acoes={
            <Botao onClick={() => setCriando(true)}>
              <UserPlus className="size-4" aria-hidden /> Novo usuário
            </Botao>
          }
        />
        <CartaoConteudo>
          <Tabela>
            <Thead>
              <Tr>
                <Th>Nome</Th>
                <Th>Tipo de acesso</Th>
                <Th>Situação</Th>
                <Th>Criado em</Th>
                <Th>Último acesso</Th>
                <Th className="text-right">Ações</Th>
              </Tr>
            </Thead>
            <Tbody>
              {usuarios.length === 0 ? <LinhaVazia colunas={6} mensagem="Nenhum usuário cadastrado." /> : null}
              {usuarios.map((u) => (
                <Tr key={u.id} className={u.ativo ? undefined : "text-texto-fraco"}>
                  <Td>
                    <span className="font-medium text-texto">{u.nome}</span>
                    {u.id === adminLogadoId ? <span className="ml-2 text-xs text-texto-fraco">(você)</span> : null}
                  </Td>
                  <Td>
                    <Selo tom={u.papel === "ADMIN" ? "primaria" : "neutro"}>
                      {u.papel === "ADMIN" ? <ShieldCheck className="size-3" aria-hidden /> : null}
                      {ROTULO_PAPEL[u.papel]}
                    </Selo>
                  </Td>
                  <Td>
                    <Selo tom={u.ativo ? "sucesso" : "neutro"}>{u.ativo ? "Ativo" : "Desativado"}</Selo>
                  </Td>
                  <Td className="tabular">{u.criadoEm}</Td>
                  <Td className="tabular">
                    {u.ultimoAcesso ?? <span className="text-texto-fraco">Nunca entrou</span>}
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex gap-1">
                      <Botao variante="fantasma" tamanho="sm" onClick={() => setEditando(u)}>
                        <Pencil className="size-3.5" aria-hidden /> Editar
                      </Botao>
                      <Botao variante="fantasma" tamanho="sm" onClick={() => setTrocandoPin(u)}>
                        <KeyRound className="size-3.5" aria-hidden /> Trocar PIN
                      </Botao>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Tabela>
        </CartaoConteudo>
      </Cartao>

      {adminsAtivos <= 1 ? (
        <Aviso tom="info">
          Só existe um administrador ativo. Pra poder desativá-lo ou trocá-lo de tipo, cadastre antes outro
          administrador.
        </Aviso>
      ) : null}

      {/* Criar */}
      <Dialogo
        aberto={criando}
        aoFechar={() => setCriando(false)}
        titulo="Novo usuário"
        descricao="A pessoa vai entrar no sistema escolhendo o nome e digitando o PIN."
      >
        {criando ? (
          <FormularioAcao
            acao={criarUsuarioAcao}
            mensagemSucesso="Usuário criado."
            aoSucesso={concluir}
            className="flex flex-col gap-4"
          >
            {(estado, pendente) => (
              <>
                <Campo rotulo="Nome" htmlFor="nome" obrigatorio erro={erroCampo(estado, "nome")}>
                  <Entrada
                    id="nome"
                    name="nome"
                    required
                    maxLength={60}
                    autoFocus
                    placeholder="Como aparece no caixa"
                  />
                </Campo>
                <Campo rotulo="Tipo de acesso" htmlFor="papel" obrigatorio erro={erroCampo(estado, "papel")}>
                  <Selecao id="papel" name="papel" defaultValue="OPERADOR" required>
                    {PAPEIS.map((p) => (
                      <option key={p} value={p}>
                        {ROTULO_PAPEL[p]}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <CamposPin estado={estado} nomeNovo="pin" rotuloNovo="PIN" />
                <div className="flex justify-end gap-2 pt-2">
                  <Botao type="button" variante="secundaria" onClick={() => setCriando(false)}>
                    Cancelar
                  </Botao>
                  <BotaoEnviar pendente={pendente}>Criar usuário</BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        ) : null}
      </Dialogo>

      {/* Editar */}
      <Dialogo
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo={editando ? `Editar ${editando.nome}` : "Editar usuário"}
        descricao="Nome, tipo de acesso e se a pessoa ainda pode entrar."
      >
        {editando ? (
          <FormularioAcao
            key={editando.id}
            acao={editarUsuarioAcao}
            mensagemSucesso="Usuário atualizado."
            aoSucesso={concluir}
            className="flex flex-col gap-4"
          >
            {(estado, pendente) => (
              <>
                <input type="hidden" name="usuarioId" value={editando.id} />
                <Campo rotulo="Nome" htmlFor="nome-editar" obrigatorio erro={erroCampo(estado, "nome")}>
                  <Entrada
                    id="nome-editar"
                    name="nome"
                    required
                    maxLength={60}
                    defaultValue={editando.nome}
                    autoFocus
                  />
                </Campo>
                <Campo rotulo="Tipo de acesso" htmlFor="papel-editar" obrigatorio erro={erroCampo(estado, "papel")}>
                  <Selecao id="papel-editar" name="papel" defaultValue={editando.papel} required>
                    {PAPEIS.map((p) => (
                      <option key={p} value={p}>
                        {ROTULO_PAPEL[p]}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <CaixaSelecao
                  name="ativo"
                  rotulo="Usuário ativo (pode entrar no sistema)"
                  defaultChecked={editando.ativo}
                />
                {editando.id === adminLogadoId ? (
                  <Aviso tom="alerta">
                    Este é o seu próprio usuário. Não dá pra se desativar nem deixar de ser administrador.
                  </Aviso>
                ) : null}
                <div className="flex justify-end gap-2 pt-2">
                  <Botao type="button" variante="secundaria" onClick={() => setEditando(null)}>
                    Cancelar
                  </Botao>
                  <BotaoEnviar pendente={pendente}>Salvar</BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        ) : null}
      </Dialogo>

      {/* Trocar PIN */}
      <Dialogo
        aberto={trocandoPin !== null}
        aoFechar={() => setTrocandoPin(null)}
        titulo={trocandoPin ? `Trocar PIN de ${trocandoPin.nome}` : "Trocar PIN"}
        descricao="Por segurança, confirme com o seu PIN atual de administrador."
      >
        {trocandoPin ? (
          <FormularioAcao
            key={trocandoPin.id}
            acao={trocarPinAcao}
            mensagemSucesso="PIN alterado."
            aoSucesso={concluir}
            className="flex flex-col gap-4"
          >
            {(estado, pendente) => (
              <>
                <input type="hidden" name="usuarioId" value={trocandoPin.id} />
                <Campo
                  rotulo="Seu PIN atual (administrador)"
                  htmlFor="pinAtualAdmin"
                  obrigatorio
                  erro={erroCampo(estado, "pinAtualAdmin")}
                >
                  <Entrada
                    id="pinAtualAdmin"
                    name="pinAtualAdmin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4,8}"
                    autoComplete="current-password"
                    required
                    autoFocus
                    className="tracking-[0.3em]"
                  />
                </Campo>
                <CamposPin estado={estado} nomeNovo="novoPin" rotuloNovo={`Novo PIN de ${trocandoPin.nome}`} />
                <div className="flex justify-end gap-2 pt-2">
                  <Botao type="button" variante="secundaria" onClick={() => setTrocandoPin(null)}>
                    Cancelar
                  </Botao>
                  <BotaoEnviar pendente={pendente}>Trocar PIN</BotaoEnviar>
                </div>
              </>
            )}
          </FormularioAcao>
        ) : null}
      </Dialogo>
    </div>
  );
}
