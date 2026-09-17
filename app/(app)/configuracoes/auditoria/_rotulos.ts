// Nomes em português das ações registradas na auditoria. Ações de outros
// módulos que não estiverem aqui aparecem com o código humanizado.

const ROTULO_ACAO: Record<string, string> = {
  "sessao.entrar": "Entrou no sistema",
  "sessao.pin-incorreto": "PIN incorreto no login",
  "sessao.sair": "Saiu do sistema",
  "usuario.criar": "Criou usuário",
  "usuario.editar": "Editou usuário",
  "usuario.pin": "Trocou PIN",
  "configuracao.loja": "Alterou dados da loja",
  "configuracao.pagamentos": "Alterou formas de pagamento",
  "configuracao.pix": "Alterou Pix",
  "configuracao.mercado-pago": "Alterou integração Mercado Pago",
  "configuracao.mercado-pago.modo-pdv": "Ativou modo PDV na maquininha Mercado Pago",
  "maquininha.criar": "Cadastrou maquininha",
  "maquininha.editar": "Editou maquininha",
  "maquininha.excluir": "Excluiu maquininha",
  "configuracao.metas": "Alterou metas e regras",
  "backup.gerar": "Gerou backup",
  "backup.automatico": "Backup automático",
  "backup.baixar": "Baixou backup",
  "backup.restaurar-validar": "Enviou arquivo pra restaurar",
  "auditoria.exportar": "Exportou auditoria",
  // PDV e vendas
  "venda.cancelar": "Cancelou venda",
  // Produtos
  "produto.criar": "Cadastrou produto",
  "produto.editar": "Editou produto",
  "produto.preco": "Mudou preço",
  "produto.promocao": "Alterou promoção",
  "produto.importar": "Importou planilha de produtos",
  "produto.desativar": "Desativou produto",
  "produto.reativar": "Reativou produto",
  "produto.excluir": "Excluiu produto",
  "categoria.criar": "Criou categoria",
  "categoria.editar": "Editou categoria",
  "categoria.excluir": "Excluiu categoria",
  // Caixa
  "caixa.abrir": "Abriu caixa",
  "caixa.fechar": "Fechou caixa",
  "caixa.sangria": "Sangria",
  "caixa.suprimento": "Suprimento",
  // Estoque
  "estoque.ajustar": "Ajustou estoque",
  "estoque.ajuste": "Ajustou estoque",
  "estoque.entrada.registrar": "Lançou entrada de estoque",
  "estoque.entrada.estornar": "Estornou entrada de estoque",
  "estoque.perda.registrar": "Registrou perda",
  "estoque.perda.estornar": "Estornou perda",
  "estoque.perda": "Registrou perda",
  // Clientes e fiado
  "cliente.criar": "Cadastrou cliente",
  "cliente.editar": "Editou cliente",
  "cliente.desativar": "Desativou cliente",
  "cliente.reativar": "Reativou cliente",
  "cliente.excluir": "Excluiu cliente",
  "fiado.receber": "Recebeu fiado",
  "fiado.ajustar": "Ajustou saldo de fiado",
  "fiado.pagar": "Recebeu fiado",
  // Financeiro
  "despesa.criar": "Lançou despesa",
  "despesa.editar": "Editou despesa",
  "despesa.excluir": "Excluiu despesa",
  "despesa.repetir": "Repetiu despesas do mês anterior",
  "categoria-despesa.criar": "Criou categoria de despesa",
  "categoria-despesa.renomear": "Renomeou categoria de despesa",
  "categoria-despesa.excluir": "Excluiu categoria de despesa",
  "conta.criar": "Lançou boleto",
  "conta.editar": "Editou boleto",
  "conta.pagar": "Pagou boleto",
  "conta.desfazer-pagamento": "Desfez pagamento de boleto",
  "conta.cancelar": "Cancelou boleto",
  "conta.reativar": "Reativou boleto",
  "fornecedor.criar": "Cadastrou fornecedor",
  "fornecedor.editar": "Editou fornecedor",
  "fornecedor.desativar": "Desativou fornecedor",
  "fornecedor.reativar": "Reativou fornecedor",
  "fornecedor.excluir": "Excluiu fornecedor",
};

const ROTULO_ENTIDADE: Record<string, string> = {
  Usuario: "Usuário",
  Configuracao: "Configuração",
  ConfiguracaoPagamento: "Forma de pagamento",
  Maquininha: "Maquininha",
  Backup: "Backup",
  Venda: "Venda",
  Produto: "Produto",
  SessaoCaixa: "Caixa",
  ContaPagar: "Boleto",
  Cliente: "Cliente",
  Perda: "Perda",
  EntradaEstoque: "Entrada de estoque",
  Despesa: "Despesa",
  Fornecedor: "Fornecedor",
  Categoria: "Categoria",
  CategoriaDespesa: "Categoria de despesa",
  LancamentoFiado: "Lançamento de fiado",
  MovimentoCaixa: "Movimento de caixa",
  MovimentoEstoque: "Movimento de estoque",
  Lote: "Lote",
  Auditoria: "Auditoria",
};

export function rotuloAcaoAuditoria(acao: string): string {
  return ROTULO_ACAO[acao] ?? acao.replace(/[._-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function rotuloEntidadeAuditoria(entidade: string): string {
  return ROTULO_ENTIDADE[entidade] ?? entidade;
}

/** Deixa o JSON dos detalhes legível; se não for JSON, devolve o texto como veio. */
export function formatarDetalhesAuditoria(detalhes: string | null): string | null {
  if (!detalhes) return null;
  try {
    return JSON.stringify(JSON.parse(detalhes), null, 2);
  } catch {
    return detalhes;
  }
}
