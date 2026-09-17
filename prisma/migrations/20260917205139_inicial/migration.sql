-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'OPERADOR');

-- CreateEnum
CREATE TYPE "Unidade" AS ENUM ('UN', 'KG');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'FIADO');

-- CreateEnum
CREATE TYPE "StatusVenda" AS ENUM ('CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusCaixa" AS ENUM ('ABERTO', 'FECHADO');

-- CreateEnum
CREATE TYPE "TipoMovimentoCaixa" AS ENUM ('SANGRIA', 'SUPRIMENTO');

-- CreateEnum
CREATE TYPE "TipoMovimentoEstoque" AS ENUM ('ENTRADA', 'VENDA', 'PERDA', 'AJUSTE', 'CANCELAMENTO_VENDA');

-- CreateEnum
CREATE TYPE "MotivoPerda" AS ENUM ('VENCIDO', 'AVARIA', 'FURTO', 'QUEBRA', 'CONSUMO_INTERNO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('PENDENTE', 'PAGA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Recorrencia" AS ENUM ('MENSAL');

-- CreateEnum
CREATE TYPE "TipoLancamentoFiado" AS ENUM ('DEBITO', 'PAGAMENTO', 'ESTORNO');

-- CreateEnum
CREATE TYPE "StatusPagamentoMP" AS ENUM ('PENDENTE', 'APROVADO', 'CANCELADO', 'ERRO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcesso" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "contato" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" SERIAL NOT NULL,
    "codigoBarras" TEXT,
    "codigoInterno" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoriaId" INTEGER,
    "unidade" "Unidade" NOT NULL DEFAULT 'UN',
    "precoVenda" INTEGER NOT NULL,
    "precoCusto" INTEGER NOT NULL DEFAULT 0,
    "precoPromocional" INTEGER,
    "promocaoAte" TIMESTAMP(3),
    "estoque" INTEGER NOT NULL DEFAULT 0,
    "estoqueMinimo" INTEGER NOT NULL DEFAULT 0,
    "controlaValidade" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoPreco" (
    "id" SERIAL NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "precoVendaAnterior" INTEGER NOT NULL,
    "precoVendaNovo" INTEGER NOT NULL,
    "precoCustoAnterior" INTEGER NOT NULL,
    "precoCustoNovo" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoPreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lote" (
    "id" SERIAL NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "codigo" TEXT,
    "validade" TIMESTAMP(3) NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "custoUnitario" INTEGER NOT NULL,
    "entradaId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntradaEstoque" (
    "id" SERIAL NOT NULL,
    "fornecedorId" INTEGER,
    "numeroNota" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valorTotal" INTEGER NOT NULL,
    "frete" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "usuarioId" INTEGER,
    "estornadaEm" TIMESTAMP(3),
    "estornadaPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntradaEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemEntrada" (
    "id" SERIAL NOT NULL,
    "entradaId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "custoUnitario" INTEGER NOT NULL,
    "validade" TIMESTAMP(3),

    CONSTRAINT "ItemEntrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoEstoque" (
    "id" SERIAL NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "tipo" "TipoMovimentoEstoque" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "estoqueApos" INTEGER NOT NULL,
    "custoUnitario" INTEGER,
    "motivo" TEXT,
    "vendaId" INTEGER,
    "entradaId" INTEGER,
    "perdaId" INTEGER,
    "usuarioId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Perda" (
    "id" SERIAL NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "loteId" INTEGER,
    "quantidade" INTEGER NOT NULL,
    "custoUnitario" INTEGER NOT NULL,
    "valorTotal" INTEGER NOT NULL,
    "motivo" "MotivoPerda" NOT NULL,
    "observacao" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Perda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "endereco" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "limiteFiado" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoFiado" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "tipo" "TipoLancamentoFiado" NOT NULL,
    "valor" INTEGER NOT NULL,
    "vendaId" INTEGER,
    "formaPagamento" "FormaPagamento",
    "sessaoId" INTEGER,
    "observacao" TEXT,
    "usuarioId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LancamentoFiado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoCaixa" (
    "id" SERIAL NOT NULL,
    "status" "StatusCaixa" NOT NULL DEFAULT 'ABERTO',
    "usuarioAberturaId" INTEGER NOT NULL,
    "usuarioFechamentoId" INTEGER,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoEm" TIMESTAMP(3),
    "valorAbertura" INTEGER NOT NULL,
    "valorFechamentoEsperado" INTEGER,
    "valorFechamentoContado" INTEGER,
    "diferenca" INTEGER,
    "observacao" TEXT,
    "observacaoFechamento" TEXT,

    CONSTRAINT "SessaoCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoCaixa" (
    "id" SERIAL NOT NULL,
    "sessaoId" INTEGER NOT NULL,
    "tipo" "TipoMovimentoCaixa" NOT NULL,
    "valor" INTEGER NOT NULL,
    "motivo" TEXT,
    "usuarioId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venda" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusVenda" NOT NULL DEFAULT 'CONCLUIDA',
    "sessaoId" INTEGER,
    "usuarioId" INTEGER NOT NULL,
    "clienteId" INTEGER,
    "subtotal" INTEGER NOT NULL,
    "desconto" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "custoTotal" INTEGER NOT NULL,
    "taxasTotal" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "canceladaEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "canceladaPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemVenda" (
    "id" SERIAL NOT NULL,
    "vendaId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" "Unidade" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" INTEGER NOT NULL,
    "custoUnitario" INTEGER NOT NULL,
    "desconto" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "loteId" INTEGER,

    CONSTRAINT "ItemVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" SERIAL NOT NULL,
    "vendaId" INTEGER NOT NULL,
    "forma" "FormaPagamento" NOT NULL,
    "valor" INTEGER NOT NULL,
    "valorRecebido" INTEGER,
    "troco" INTEGER NOT NULL DEFAULT 0,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "taxaPercentual" INTEGER NOT NULL DEFAULT 0,
    "taxaFixa" INTEGER NOT NULL DEFAULT 0,
    "taxaValor" INTEGER NOT NULL DEFAULT 0,
    "maquininhaId" INTEGER,
    "nsu" TEXT,
    "autorizacao" TEXT,
    "mpPaymentIntentId" TEXT,
    "mpPaymentId" TEXT,
    "mpStatus" "StatusPagamentoMP",
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoPagamento" (
    "forma" "FormaPagamento" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "taxaPercentual" INTEGER NOT NULL DEFAULT 0,
    "taxaFixa" INTEGER NOT NULL DEFAULT 0,
    "prazoRecebimentoDias" INTEGER NOT NULL DEFAULT 0,
    "maxParcelas" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ConfiguracaoPagamento_pkey" PRIMARY KEY ("forma")
);

-- CreateTable
CREATE TABLE "Maquininha" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "adquirente" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "taxaDebito" INTEGER NOT NULL DEFAULT 0,
    "taxaCredito" INTEGER NOT NULL DEFAULT 0,
    "taxaCreditoParcelado" INTEGER NOT NULL DEFAULT 0,
    "taxaPix" INTEGER NOT NULL DEFAULT 0,
    "prazoDebitoDias" INTEGER NOT NULL DEFAULT 1,
    "prazoCreditoDias" INTEGER NOT NULL DEFAULT 30,
    "prazoPixDias" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Maquininha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaDespesa" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "CategoriaDespesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Despesa" (
    "id" SERIAL NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaId" INTEGER,
    "fornecedorId" INTEGER,
    "valor" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formaPagamento" "FormaPagamento",
    "pagoDoCaixa" BOOLEAN NOT NULL DEFAULT false,
    "sessaoId" INTEGER,
    "contaPagarId" INTEGER,
    "observacao" TEXT,
    "usuarioId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Despesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPagar" (
    "id" SERIAL NOT NULL,
    "descricao" TEXT NOT NULL,
    "fornecedorId" INTEGER,
    "categoriaId" INTEGER,
    "valor" INTEGER NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusConta" NOT NULL DEFAULT 'PENDENTE',
    "dataPagamento" TIMESTAMP(3),
    "valorPago" INTEGER,
    "formaPagamento" "FormaPagamento",
    "linhaDigitavel" TEXT,
    "recorrencia" "Recorrencia",
    "diaVencimento" INTEGER,
    "parcelaAtual" INTEGER,
    "totalParcelas" INTEGER,
    "entradaId" INTEGER,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nomeLoja" TEXT NOT NULL DEFAULT 'Uay Market',
    "cnpj" TEXT,
    "endereco" TEXT,
    "telefone" TEXT,
    "mensagemCupom" TEXT,
    "pixChave" TEXT,
    "pixNomeRecebedor" TEXT,
    "pixCidade" TEXT,
    "mpAccessToken" TEXT,
    "mpDeviceId" TEXT,
    "mpUserId" TEXT,
    "metaVendasDiaria" INTEGER,
    "metaVendasMensal" INTEGER,
    "alertaVencimentoDias" INTEGER NOT NULL DEFAULT 7,
    "permitirVendaSemEstoque" BOOLEAN NOT NULL DEFAULT true,
    "permitirDescontoOperador" BOOLEAN NOT NULL DEFAULT true,
    "descontoMaximoPercentual" INTEGER NOT NULL DEFAULT 1000,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" INTEGER,
    "detalhes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_nome_key" ON "Categoria"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_codigoBarras_key" ON "Produto"("codigoBarras");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_codigoInterno_key" ON "Produto"("codigoInterno");

-- CreateIndex
CREATE INDEX "Produto_nome_idx" ON "Produto"("nome");

-- CreateIndex
CREATE INDEX "Produto_categoriaId_idx" ON "Produto"("categoriaId");

-- CreateIndex
CREATE INDEX "HistoricoPreco_produtoId_criadoEm_idx" ON "HistoricoPreco"("produtoId", "criadoEm");

-- CreateIndex
CREATE INDEX "Lote_produtoId_validade_idx" ON "Lote"("produtoId", "validade");

-- CreateIndex
CREATE INDEX "Lote_validade_idx" ON "Lote"("validade");

-- CreateIndex
CREATE INDEX "EntradaEstoque_data_idx" ON "EntradaEstoque"("data");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoEstoque_perdaId_key" ON "MovimentoEstoque"("perdaId");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_produtoId_criadoEm_idx" ON "MovimentoEstoque"("produtoId", "criadoEm");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_tipo_criadoEm_idx" ON "MovimentoEstoque"("tipo", "criadoEm");

-- CreateIndex
CREATE INDEX "Perda_data_idx" ON "Perda"("data");

-- CreateIndex
CREATE INDEX "Perda_produtoId_idx" ON "Perda"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_cpf_key" ON "Cliente"("cpf");

-- CreateIndex
CREATE INDEX "Cliente_nome_idx" ON "Cliente"("nome");

-- CreateIndex
CREATE INDEX "LancamentoFiado_clienteId_criadoEm_idx" ON "LancamentoFiado"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "SessaoCaixa_status_idx" ON "SessaoCaixa"("status");

-- CreateIndex
CREATE INDEX "SessaoCaixa_abertoEm_idx" ON "SessaoCaixa"("abertoEm");

-- CreateIndex
CREATE INDEX "MovimentoCaixa_sessaoId_idx" ON "MovimentoCaixa"("sessaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Venda_numero_key" ON "Venda"("numero");

-- CreateIndex
CREATE INDEX "Venda_criadoEm_idx" ON "Venda"("criadoEm");

-- CreateIndex
CREATE INDEX "Venda_sessaoId_idx" ON "Venda"("sessaoId");

-- CreateIndex
CREATE INDEX "Venda_status_criadoEm_idx" ON "Venda"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "ItemVenda_produtoId_idx" ON "ItemVenda"("produtoId");

-- CreateIndex
CREATE INDEX "ItemVenda_vendaId_idx" ON "ItemVenda"("vendaId");

-- CreateIndex
CREATE INDEX "Pagamento_forma_criadoEm_idx" ON "Pagamento"("forma", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaDespesa_nome_key" ON "CategoriaDespesa"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Despesa_contaPagarId_key" ON "Despesa"("contaPagarId");

-- CreateIndex
CREATE INDEX "Despesa_data_idx" ON "Despesa"("data");

-- CreateIndex
CREATE INDEX "Despesa_categoriaId_idx" ON "Despesa"("categoriaId");

-- CreateIndex
CREATE INDEX "ContaPagar_vencimento_idx" ON "ContaPagar"("vencimento");

-- CreateIndex
CREATE INDEX "ContaPagar_status_vencimento_idx" ON "ContaPagar"("status", "vencimento");

-- CreateIndex
CREATE INDEX "Auditoria_criadoEm_idx" ON "Auditoria"("criadoEm");

-- CreateIndex
CREATE INDEX "Auditoria_entidade_entidadeId_idx" ON "Auditoria"("entidade", "entidadeId");

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPreco" ADD CONSTRAINT "HistoricoPreco_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPreco" ADD CONSTRAINT "HistoricoPreco_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "EntradaEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaEstoque" ADD CONSTRAINT "EntradaEstoque_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaEstoque" ADD CONSTRAINT "EntradaEstoque_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaEstoque" ADD CONSTRAINT "EntradaEstoque_estornadaPorId_fkey" FOREIGN KEY ("estornadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemEntrada" ADD CONSTRAINT "ItemEntrada_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "EntradaEstoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemEntrada" ADD CONSTRAINT "ItemEntrada_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "EntradaEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_perdaId_fkey" FOREIGN KEY ("perdaId") REFERENCES "Perda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perda" ADD CONSTRAINT "Perda_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perda" ADD CONSTRAINT "Perda_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perda" ADD CONSTRAINT "Perda_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoFiado" ADD CONSTRAINT "LancamentoFiado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoFiado" ADD CONSTRAINT "LancamentoFiado_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoFiado" ADD CONSTRAINT "LancamentoFiado_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoCaixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoFiado" ADD CONSTRAINT "LancamentoFiado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoCaixa" ADD CONSTRAINT "SessaoCaixa_usuarioAberturaId_fkey" FOREIGN KEY ("usuarioAberturaId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoCaixa" ADD CONSTRAINT "SessaoCaixa_usuarioFechamentoId_fkey" FOREIGN KEY ("usuarioFechamentoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoCaixa" ADD CONSTRAINT "MovimentoCaixa_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoCaixa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoCaixa" ADD CONSTRAINT "MovimentoCaixa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoCaixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_canceladaPorId_fkey" FOREIGN KEY ("canceladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenda" ADD CONSTRAINT "ItemVenda_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenda" ADD CONSTRAINT "ItemVenda_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenda" ADD CONSTRAINT "ItemVenda_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_maquininhaId_fkey" FOREIGN KEY ("maquininhaId") REFERENCES "Maquininha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaDespesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoCaixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaDespesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "EntradaEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
