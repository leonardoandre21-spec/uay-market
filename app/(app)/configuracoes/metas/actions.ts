"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { campo, campoBooleano, campoInteiro, executar, falha, type Resultado } from "@/lib/acao";
import { parsePercentual, parseReais } from "@/lib/dinheiro";
import { obterConfiguracao, salvarConfiguracao, sessaoAdmin } from "@/lib/servicos/configuracoes";

export async function salvarMetas(form: FormData): Promise<Resultado<{ ok: true }>> {
  const auth = await sessaoAdmin();
  if (!auth.ok) return auth;
  const erros: Record<string, string> = {};

  const metaDiariaTexto = campo(form, "metaVendasDiaria");
  const metaVendasDiaria = metaDiariaTexto === "" ? null : parseReais(metaDiariaTexto);
  if (metaVendasDiaria === null && metaDiariaTexto !== "") erros.metaVendasDiaria = "Meta diária inválida.";
  if (metaVendasDiaria !== null && metaVendasDiaria < 0)
    erros.metaVendasDiaria = "A meta diária não pode ser negativa.";

  const metaMensalTexto = campo(form, "metaVendasMensal");
  const metaVendasMensal = metaMensalTexto === "" ? null : parseReais(metaMensalTexto);
  if (metaVendasMensal === null && metaMensalTexto !== "") erros.metaVendasMensal = "Meta mensal inválida.";
  if (metaVendasMensal !== null && metaVendasMensal < 0)
    erros.metaVendasMensal = "A meta mensal não pode ser negativa.";

  const alertaTexto = campo(form, "alertaVencimentoDias");
  const alertaVencimentoDias = alertaTexto === "" ? 7 : campoInteiro(form, "alertaVencimentoDias");
  if (alertaVencimentoDias === null || alertaVencimentoDias < 0 || alertaVencimentoDias > 365) {
    erros.alertaVencimentoDias = "Informe de 0 a 365 dias.";
  }

  const descontoTexto = campo(form, "descontoMaximoPercentual");
  const descontoMaximoPercentual = descontoTexto === "" ? 0 : parsePercentual(descontoTexto);
  if (descontoMaximoPercentual === null || descontoMaximoPercentual < 0 || descontoMaximoPercentual > 10000) {
    erros.descontoMaximoPercentual = "Informe um percentual entre 0 e 100.";
  }

  if (Object.keys(erros).length) return falha(Object.values(erros)[0], erros);

  const dados = {
    metaVendasDiaria: metaVendasDiaria && metaVendasDiaria > 0 ? metaVendasDiaria : null,
    metaVendasMensal: metaVendasMensal && metaVendasMensal > 0 ? metaVendasMensal : null,
    alertaVencimentoDias: alertaVencimentoDias ?? 7,
    permitirVendaSemEstoque: campoBooleano(form, "permitirVendaSemEstoque"),
    permitirDescontoOperador: campoBooleano(form, "permitirDescontoOperador"),
    descontoMaximoPercentual: descontoMaximoPercentual ?? 0,
  };

  return executar(async () => {
    const antes = await obterConfiguracao();
    await salvarConfiguracao(dados);
    await registrarAuditoria({
      usuarioId: auth.dados.usuarioId,
      acao: "configuracao.metas",
      entidade: "Configuracao",
      entidadeId: 1,
      detalhes: {
        antes: {
          metaVendasDiaria: antes.metaVendasDiaria,
          metaVendasMensal: antes.metaVendasMensal,
          alertaVencimentoDias: antes.alertaVencimentoDias,
          permitirVendaSemEstoque: antes.permitirVendaSemEstoque,
          permitirDescontoOperador: antes.permitirDescontoOperador,
          descontoMaximoPercentual: antes.descontoMaximoPercentual,
        },
        depois: dados,
      },
    });
    revalidatePath("/configuracoes/metas");
    revalidatePath("/gestao");
    revalidatePath("/pdv");
    return { ok: true as const };
  });
}
