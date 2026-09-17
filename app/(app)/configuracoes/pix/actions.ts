"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { campo, executar, falha, type Resultado } from "@/lib/acao";
import { obterConfiguracao, salvarConfiguracao, sessaoAdmin } from "@/lib/servicos/configuracoes";
import { normalizarChavePix, normalizarTextoPix } from "./_payload";

export async function salvarPix(form: FormData): Promise<Resultado<{ chave: string | null }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const chaveDigitada = campo(form, "pixChave");
  const nome = campo(form, "pixNomeRecebedor");
  const cidade = campo(form, "pixCidade");

  const erros: Record<string, string> = {};
  let chave: string | null = null;
  if (chaveDigitada) {
    chave = normalizarChavePix(chaveDigitada);
    if (!chave) {
      erros.pixChave = "Chave Pix inválida. Use CPF, CNPJ, celular com +55, e-mail ou chave aleatória.";
    }
    if (!nome) erros.pixNomeRecebedor = "Informe o nome de quem recebe (aparece no app do cliente).";
    if (!cidade) erros.pixCidade = "Informe a cidade.";
  }
  if (nome.length > 25) erros.pixNomeRecebedor = "O nome do recebedor pode ter até 25 letras.";
  if (cidade.length > 15) erros.pixCidade = "A cidade pode ter até 15 letras.";
  if (Object.keys(erros).length) return falha(Object.values(erros)[0], erros);

  return executar(async () => {
    const antes = await obterConfiguracao();
    const dados = {
      pixChave: chave,
      pixNomeRecebedor: nome ? normalizarTextoPix(nome, 25) : null,
      pixCidade: cidade ? normalizarTextoPix(cidade, 15) : null,
    };
    await salvarConfiguracao(dados);
    await registrarAuditoria({
      usuarioId: auth.dados.usuarioId,
      acao: "configuracao.pix",
      entidade: "Configuracao",
      entidadeId: 1,
      detalhes: {
        antes: { pixChave: antes.pixChave, pixNomeRecebedor: antes.pixNomeRecebedor, pixCidade: antes.pixCidade },
        depois: dados,
      },
    });
    revalidatePath("/configuracoes/pix");
    return { chave };
  });
}
