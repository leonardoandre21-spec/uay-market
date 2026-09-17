"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { campo, campoBooleano, campoInteiro, executar, falha, type Resultado } from "@/lib/acao";
import { MENSAGEM_PIN_INVALIDO, pinValido } from "@/lib/servicos/configuracoes-regras";
import { criarUsuario, editarUsuario, sessaoAdmin, trocarPinUsuario } from "@/lib/servicos/configuracoes";

const esquemaPapel = z.enum(["ADMIN", "OPERADOR"], "Escolha o tipo de acesso.");
const esquemaNome = z
  .string()
  .trim()
  .min(2, "Informe o nome (mínimo 2 letras).")
  .max(60, "O nome pode ter até 60 letras.");

function validarPins(pin: string, confirmacao: string): Record<string, string> | null {
  const campos: Record<string, string> = {};
  if (!pinValido(pin)) campos.pin = MENSAGEM_PIN_INVALIDO;
  if (pin !== confirmacao) campos.confirmarPin = "Os dois PINs não são iguais.";
  return Object.keys(campos).length ? campos : null;
}

export async function criarUsuarioAcao(form: FormData): Promise<Resultado<{ id: number; nome: string }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const pin = campo(form, "pin");
  const erros = validarPins(pin, campo(form, "confirmarPin"));
  if (erros) return falha(Object.values(erros)[0], erros);
  return executar(async () => {
    const dados = z.object({ nome: esquemaNome, papel: esquemaPapel }).parse({
      nome: campo(form, "nome"),
      papel: campo(form, "papel"),
    });
    const usuario = await criarUsuario({ ...dados, pin }, auth.dados.usuarioId);
    revalidatePath("/configuracoes/usuarios");
    return { id: usuario.id, nome: usuario.nome };
  });
}

export async function editarUsuarioAcao(form: FormData): Promise<Resultado<{ id: number }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  return executar(async () => {
    const id = campoInteiro(form, "usuarioId");
    if (!id) throw new Error("Usuário não informado.");
    const dados = z.object({ nome: esquemaNome, papel: esquemaPapel }).parse({
      nome: campo(form, "nome"),
      papel: campo(form, "papel"),
    });
    await editarUsuario(id, { ...dados, ativo: campoBooleano(form, "ativo") }, auth.dados.usuarioId);
    revalidatePath("/configuracoes/usuarios");
    return { id };
  });
}

export async function trocarPinAcao(form: FormData): Promise<Resultado<{ nome: string }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const novoPin = campo(form, "novoPin");
  const erros = validarPins(novoPin, campo(form, "confirmarPin"));
  if (erros) {
    const renomeados: Record<string, string> = {};
    if (erros.pin) renomeados.novoPin = erros.pin;
    if (erros.confirmarPin) renomeados.confirmarPin = erros.confirmarPin;
    return falha(Object.values(renomeados)[0], renomeados);
  }
  const pinAtualAdmin = campo(form, "pinAtualAdmin");
  if (!pinValido(pinAtualAdmin)) {
    return falha("Digite o seu PIN atual pra confirmar a troca.", { pinAtualAdmin: "Digite o seu PIN atual." });
  }
  return executar(async () => {
    const id = campoInteiro(form, "usuarioId");
    if (!id) throw new Error("Usuário não informado.");
    const r = await trocarPinUsuario(id, novoPin, auth.dados.usuarioId, pinAtualAdmin);
    revalidatePath("/configuracoes/usuarios");
    return { nome: r.nome };
  });
}
