"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirAdminAcao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { campo, campoOpcional, executar, type Resultado } from "@/lib/acao";
import { obterConfiguracao, salvarConfiguracao } from "@/lib/servicos/configuracoes";

const esquemaLoja = z.object({
  nomeLoja: z.string().trim().min(1, "Informe o nome da loja.").max(60, "O nome da loja pode ter até 60 letras."),
  cnpj: z
    .string()
    .nullable()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v === null || v.length === 14, "O CNPJ precisa ter 14 números."),
  endereco: z.string().max(160, "O endereço pode ter até 160 letras.").nullable(),
  telefone: z
    .string()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      const digitos = v.replace(/\D/g, "");
      return digitos.length === 10 || digitos.length === 11 ? digitos : v;
    }),
  mensagemCupom: z.string().max(300, "A mensagem do cupom pode ter até 300 letras.").nullable(),
});

/** Salva os dados da loja (linha única) e atualiza o nome no menu de todas as páginas. */
export async function salvarLoja(form: FormData): Promise<Resultado<{ nomeLoja: string }>> {
  return executar(async () => {
    const sessao = await exigirAdminAcao();
    const dados = esquemaLoja.parse({
      nomeLoja: campo(form, "nomeLoja"),
      cnpj: campoOpcional(form, "cnpj"),
      endereco: campoOpcional(form, "endereco"),
      telefone: campoOpcional(form, "telefone"),
      mensagemCupom: campoOpcional(form, "mensagemCupom"),
    });
    const antes = await obterConfiguracao();
    const salvo = await salvarConfiguracao(dados);
    await registrarAuditoria({
      usuarioId: sessao.usuarioId,
      acao: "configuracao.loja",
      entidade: "Configuracao",
      entidadeId: 1,
      detalhes: {
        antes: {
          nomeLoja: antes.nomeLoja,
          cnpj: antes.cnpj,
          endereco: antes.endereco,
          telefone: antes.telefone,
          mensagemCupom: antes.mensagemCupom,
        },
        depois: dados,
      },
    });
    revalidatePath("/", "layout");
    return { nomeLoja: salvo.nomeLoja };
  });
}
