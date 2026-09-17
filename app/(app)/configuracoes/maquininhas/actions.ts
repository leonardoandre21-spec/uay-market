"use server";

import { revalidatePath } from "next/cache";
import { campo, campoBooleano, campoInteiro, campoOpcional, executar, falha, type Resultado } from "@/lib/acao";
import { parsePercentual } from "@/lib/dinheiro";
import { sessaoAdmin } from "@/lib/servicos/configuracoes";
import {
  criarMaquininha,
  editarMaquininha,
  excluirMaquininha,
  type MaquininhaEntrada,
} from "@/lib/servicos/maquininhas";

// Campos do formulário: nome, adquirente, ativo, padrao, taxaDebito, taxaCredito,
// taxaCreditoParcelado, taxaPix (em % como texto: "1,39"), prazoDebitoDias,
// prazoCreditoDias, prazoPixDias (inteiros), observacao.

const TAXAS = [
  ["taxaDebito", "Taxa de débito"],
  ["taxaCredito", "Taxa de crédito à vista"],
  ["taxaCreditoParcelado", "Taxa de crédito parcelado"],
  ["taxaPix", "Taxa do Pix"],
] as const;

const PRAZOS = [
  ["prazoDebitoDias", "Prazo do débito"],
  ["prazoCreditoDias", "Prazo do crédito"],
  ["prazoPixDias", "Prazo do Pix"],
] as const;

/** Lê e valida o formulário. Devolve os dados prontos ou os erros por campo. */
function lerMaquininha(form: FormData): { dados: MaquininhaEntrada } | { erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const nome = campo(form, "nome");
  if (nome.length < 2) erros.nome = "Informe o nome da maquininha (mínimo 2 letras).";
  if (nome.length > 60) erros.nome = "O nome pode ter até 60 letras.";
  const adquirente = campoOpcional(form, "adquirente");
  if (adquirente && adquirente.length > 40) erros.adquirente = "A adquirente pode ter até 40 letras.";
  const observacao = campoOpcional(form, "observacao");
  if (observacao && observacao.length > 300) erros.observacao = "A observação pode ter até 300 letras.";

  const taxas: Record<string, number> = {};
  for (const [nomeCampo, rotulo] of TAXAS) {
    const texto = campo(form, nomeCampo);
    const bp = texto === "" ? 0 : parsePercentual(texto);
    if (bp === null || bp < 0 || bp > 10000) erros[nomeCampo] = `${rotulo}: informe um percentual entre 0 e 100.`;
    taxas[nomeCampo] = bp ?? 0;
  }
  const prazos: Record<string, number> = {};
  for (const [nomeCampo, rotulo] of PRAZOS) {
    const texto = campo(form, nomeCampo);
    const dias = texto === "" ? 0 : campoInteiro(form, nomeCampo);
    if (dias === null || dias < 0 || dias > 365) erros[nomeCampo] = `${rotulo}: informe de 0 a 365 dias.`;
    prazos[nomeCampo] = dias ?? 0;
  }

  if (Object.keys(erros).length) return { erros };
  return {
    dados: {
      nome,
      adquirente,
      ativo: campoBooleano(form, "ativo"),
      padrao: campoBooleano(form, "padrao"),
      taxaDebito: taxas.taxaDebito,
      taxaCredito: taxas.taxaCredito,
      taxaCreditoParcelado: taxas.taxaCreditoParcelado,
      taxaPix: taxas.taxaPix,
      prazoDebitoDias: prazos.prazoDebitoDias,
      prazoCreditoDias: prazos.prazoCreditoDias,
      prazoPixDias: prazos.prazoPixDias,
      observacao,
    },
  };
}

function revalidar() {
  revalidatePath("/configuracoes/maquininhas");
  revalidatePath("/pdv");
}

export async function criarMaquininhaAcao(form: FormData): Promise<Resultado<{ id: number; nome: string }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const lido = lerMaquininha(form);
  if ("erros" in lido) return falha(Object.values(lido.erros)[0], lido.erros);
  return executar(async () => {
    const m = await criarMaquininha(lido.dados, auth.dados.usuarioId);
    revalidar();
    return { id: m.id, nome: m.nome };
  });
}

export async function editarMaquininhaAcao(form: FormData): Promise<Resultado<{ id: number }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const id = campoInteiro(form, "maquininhaId");
  if (!id) return falha("Maquininha não informada.");
  const lido = lerMaquininha(form);
  if ("erros" in lido) return falha(Object.values(lido.erros)[0], lido.erros);
  return executar(async () => {
    await editarMaquininha(id, lido.dados, auth.dados.usuarioId);
    revalidar();
    return { id };
  });
}

export async function excluirMaquininhaAcao(form: FormData): Promise<Resultado<{ nome: string }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const id = campoInteiro(form, "maquininhaId");
  if (!id) return falha("Maquininha não informada.");
  return executar(async () => {
    const r = await excluirMaquininha(id, auth.dados.usuarioId);
    revalidar();
    return r;
  });
}
