# Contrato dos módulos — Uay Market

Leia inteiro antes de escrever código. Este documento define o que já existe, o que cada módulo pode tocar e as regras que não se negociam.

## Stack

- Next.js 15.5 (App Router, Turbopack), React 19, TypeScript estrito, Tailwind 4.
- Prisma 6 + Postgres (Neon em produção, via `DATABASE_URL` pooled + `DATABASE_URL_UNPOOLED` direta, nomes que a integração Neon/Vercel cria; Postgres embutido em `localhost:5433` no desenvolvimento, `npm run db:local`). Até 16/09 era SQLite; a migração inicial foi regerada pra Postgres em 17/09. O schema em `prisma/schema.prisma` é **congelado** (já inclui Maquininha, Pagamento.maquininhaId/nsu/autorizacao, TipoLancamentoFiado.ESTORNO, EntradaEstoque.estornadaEm/estornadaPorId, SessaoCaixa.observacaoFechamento, ContaPagar.diaVencimento, Usuario.ultimoAcesso): nenhum módulo altera, cria migração ou roda `prisma migrate`. Se faltar campo, escreva a necessidade no relatório final e contorne.
- Postgres diferencia maiúsculas em `contains`/`startsWith`: toda busca por texto digitado usa `mode: "insensitive"` (já aplicado em `buscarProdutosPorNome`, produtos, fornecedores e vendas). Sem disco persistente no Vercel: nada grava em pasta; backup é exportar/importar JSON (`lib/servicos/backup.ts`).
- Server Actions pra escrita; Server Components pra leitura. Route Handlers (`app/api/**`) só quando precisa de polling/download.
- Zod 4 pra validar entrada (`import { z } from "zod"`).
- Ícones: `lucide-react`. Gráficos: `recharts` (só em Client Components). QR: `qrcode` (já instalado).
- Testes: vitest, arquivos em `tests/<modulo>.test.ts`. Rodar: `npx vitest run tests/<modulo>.test.ts`.
- Typecheck: `npx tsc --noEmit` (deve passar sem erros no seu módulo antes de encerrar).

## Regras que não se negociam

1. **Dinheiro em centavos inteiros** (`Int`). R$ 12,34 = `1234`. Nunca `float` pra dinheiro. Formatar com `formatarReais`, ler input com `parseReais` ou `lerMoeda`.
2. **Quantidade em milésimos inteiros**. 1 unidade = `1000`; 0,350 kg = `350`. Formatar com `formatarQuantidade`, ler com `parseQuantidade`. Total de linha: `totalLinha(qtdMilesimos, precoCentavos)`.
3. **Percentuais em pontos-base**. 1,99% = `199`. `aplicarPercentual`, `formatarPercentual`, `parsePercentual`.
4. **Datas em UTC no banco; formatação e limites de dia/mês via `lib/datas.ts`** (`limitesDoDia`, `limitesDoMes`, `parseDataInput`, `formatarData`, ...). Nunca `new Date(ano, mes, dia)` solto: o fuso é `America/Sao_Paulo`.
5. **Toda escrita que mexe em mais de uma tabela roda em `db.$transaction(async (tx) => ...)`** e usa `tx` em tudo dentro.
6. **Estoque só muda via `MovimentoEstoque`**: toda variação de `Produto.estoque` cria um movimento com `estoqueApos` correto, na mesma transação.
7. **Server action devolve `Resultado<T>`** (`lib/acao.ts`): `sucesso(dados)` / `falha(mensagem)` / `executar(async () => ...)`. Nunca lança pro cliente. Mensagens em português, legíveis pro dono do mercado.
8. **Toda action chama `exigirSessaoAcao()` ou `exigirAdminAcao()`** no começo. Páginas usam `exigirSessao()` / `exigirAdmin()`.
9. **Ações sensíveis registram `registrarAuditoria`** (cancelar venda, mudar preço, fechar caixa, excluir, pagar boleto, mudar PIN).
10. **Idioma: português do Brasil** em código de UI, mensagens, comentários, nomes de arquivos e variáveis. Sem "não é X, é Y", sem travessão.
11. **Não toque em:** `prisma/**`, `package.json`, `lib/**` (exceto `lib/servicos/<seu-modulo>*.ts`), `components/ui/**`, `components/navegacao.tsx`, `components/casca-app.tsx`, `middleware.ts`, `app/layout.tsx`, `app/globals.css`, `app/(app)/layout.tsx`, `app/(pdv)/layout.tsx`, `app/(auth)/**`, `.env*`, arquivos de outros módulos.
12. **Não rode:** `npm install`, `prisma migrate`, `prisma db push`, `next build`, `next dev`, nem abra navegador. O servidor de dev já está de pé em `http://localhost:3210` e recarrega sozinho. Só `npx tsc --noEmit` e `npx vitest run <seu-arquivo>`.
13. Componentes novos exclusivos do seu módulo ficam dentro da pasta do seu módulo (ex.: `app/(app)/produtos/_componentes/`). Nada novo em `components/`.
14. Client Components só onde há interação (formulários, diálogos, gráficos). Marque com `"use client"`. Não passe funções nem `Date` de Server pra Client Component sem serializar (datas: passe `string` ISO ou já formatada).
15. Lógica de cálculo (fechamento de caixa, custo médio, FEFO, DRE, ranking) vai em funções puras num arquivo `lib/servicos/<modulo>-calculos.ts` **com teste unitário**. Acesso ao banco fica em `lib/servicos/<modulo>.ts`.

## O que já existe (use, não recrie)

### `lib/db.ts`
`db` (PrismaClient singleton).

### `lib/dinheiro.ts`
`MIL`, `BP`, `formatarReais(centavos, comSimbolo?)`, `parseReais(texto)`, `formatarQuantidade(milesimos, unidade)`, `formatarQuantidadeComUnidade`, `parseQuantidade(texto)`, `totalLinha(qtd, preco)`, `aplicarPercentual(centavos, bp)`, `formatarPercentual(bp)`, `parsePercentual(texto)`, `margemPontosBase(preco, custo)`, `markupPontosBase(preco, custo)`, `custoMedioPonderado(estoqueAtual, custoAtual, qtdEntrada, custoEntrada)`, `calcularTaxa(valor, taxaBp, taxaFixa)`, `somar(lista)`.

### `lib/datas.ts`
`FUSO`, `agora()`, `noFuso(d)`, `limitesDoDia(d?)`, `limitesDoMes(d?)`, `limitesDoMesAnoMes(ano, mes)`, `parseDataInput("yyyy-MM-dd")`, `paraDataInput(d)`, `paraMesInput(d)`, `parseMesInput("yyyy-MM")`, `formatarData`, `formatarDataHora`, `formatarHora`, `formatarMesAno`, `formatarDiaCurto`, `diasAte(d)`, `addDays`, `addMonths`, `subDays`, `subMonths`.

### `lib/auth.ts` (server-only)
`obterSessao()`, `exigirSessao()`, `exigirAdmin()`, `exigirSessaoAcao()`, `exigirAdminAcao()`, `hashPin(pin)`, `verificarPin(pin, hash)`, `pinValido(pin)`, `iniciarSessao(usuario)`, `encerrarSessao()`. A sessão tem `{ usuarioId, nome, papel }`.

### `lib/consultas.ts` (server-only, só leitura)
`obterConfiguracao()`, `obterConfiguracoesPagamento()`, `obterSessaoCaixaAberta()`, `listarCategorias()`, `listarCategoriasDespesa()`, `listarFornecedoresAtivos()`, `listarClientesAtivos()`, `listarUsuariosAtivos()`, `listarProdutosAtivos()`, `buscarProdutoPorCodigo(codigo)` (barras ou interno, tolera EAN com/sem zero à esquerda), `buscarProdutosPorNome(termo, limite)`, `precoEfetivo(produto)` (aplica promoção vigente), `saldoFiado(clienteId)`, `proximoNumeroVenda(tx)`. Todas aceitam `tx` opcional como último parâmetro.

### `lib/acao.ts`
`Resultado<T>`, `sucesso`, `falha`, `tratarErro`, `executar`, `campo(form, nome)`, `campoOpcional`, `campoInteiro`, `campoBooleano`.

### `lib/auditoria.ts`
`registrarAuditoria({ usuarioId, acao, entidade, entidadeId, detalhes }, tx?)`.

### `lib/rotulos.ts`
Rótulos PT dos enums: `ROTULO_FORMA_PAGAMENTO`, `ROTULO_FORMA_PAGAMENTO_CURTO`, `FORMAS_PAGAMENTO`, `ROTULO_UNIDADE`, `ROTULO_PAPEL`, `ROTULO_STATUS_VENDA`, `ROTULO_STATUS_CAIXA`, `ROTULO_MOVIMENTO_CAIXA`, `ROTULO_MOVIMENTO_ESTOQUE`, `ROTULO_MOTIVO_PERDA`, `MOTIVOS_PERDA`, `ROTULO_STATUS_CONTA`, `ROTULO_RECORRENCIA`, `ROTULO_LANCAMENTO_FIADO`.

### `lib/utils.ts`
`cn`, `normalizarTexto`, `formatarCpf`, `formatarCnpj`, `formatarTelefone`, `cpfValido`, `codigoBarrasValido`, `truncar`.

### `components/ui/*`
- `botao.tsx`: `<Botao variante="primaria|secundaria|perigo|fantasma|contorno" tamanho="sm|md|lg|xl" pendente>`.
- `botao-enviar.tsx`: `<BotaoEnviar>` (submit com spinner via useFormStatus).
- `campo.tsx`: `<Campo rotulo ajuda erro obrigatorio htmlFor>`, `<Entrada tamanho="md|lg">`, `<Selecao>`, `<AreaTexto>`, `<Rotulo>`, `<CaixaSelecao rotulo>`.
- `entrada-moeda.tsx`: `<EntradaMoeda name valorInicial aoMudar>` (digita como calculadora, envia "12,50"), `lerMoeda(form, nome)`.
- `cartao.tsx`: `<Cartao>`, `<CartaoCabecalho titulo descricao acoes>`, `<CartaoConteudo>`, `<Indicador rotulo valor detalhe tom icone>`.
- `tabela.tsx`: `<Tabela>`, `<Thead>`, `<Tbody>`, `<Tr>`, `<Th numerico>`, `<Td numerico>`, `<LinhaVazia colunas mensagem>`.
- `selo.tsx`: `<Selo tom="neutro|sucesso|alerta|perigo|info|primaria">`.
- `dialogo.tsx`: `<Dialogo aberto aoFechar titulo descricao rodape largura="sm|md|lg|xl">`.
- `aviso.tsx`: `<Aviso tom="info|sucesso|alerta|perigo" titulo>`.
- `pagina.tsx`: `<CabecalhoPagina titulo descricao acoes>`, `<EstadoVazio icone titulo descricao acao>`, `<GradeIndicadores>`.
- `toast.tsx`: `useToast()` → `{ sucesso(msg), erro(msg), notificar(msg, tom) }`. Provider já está nos layouts.
- `formulario-acao.tsx`: `<FormularioAcao acao={serverAction} mensagemSucesso aoSucesso limparAoSucesso>{(estado, pendente) => ...}</FormularioAcao>` + `erroCampo(estado, "nome")`. Padrão pra todo formulário.

Padrão de formulário: Server Component monta a página e passa dados; Client Component (`_componentes/formulario-x.tsx`) usa `FormularioAcao` com a action de `actions.ts` do módulo. Após sucesso, `router.refresh()` ou `revalidatePath` na action.

### Tokens de cor (Tailwind)
`bg-fundo`, `bg-superficie`, `bg-superficie-2`, `border-borda`, `text-texto`, `text-texto-suave`, `text-texto-fraco`, `bg-primaria`, `text-primaria`, `bg-primaria-suave`, `text-primaria-texto`, `bg-acento`, `text-sucesso`/`bg-sucesso-suave`, `text-alerta`/`bg-alerta-suave`, `text-perigo`/`bg-perigo-suave`, `text-info`/`bg-info-suave`, `rounded-padrao`, `shadow-padrao`. Classe `tabular` pra números. Sem hex solto.

### Rotas oficiais (menu em `components/navegacao.tsx`)
| Rota | Módulo |
|---|---|
| `/pdv` | pdv |
| `/caixa` | caixa |
| `/vendas` | pdv |
| `/produtos`, `/produtos/categorias` | produtos |
| `/clientes` | clientes |
| `/estoque`, `/estoque/entradas`, `/estoque/perdas`, `/estoque/vencimentos` | estoque |
| `/financeiro/despesas`, `/financeiro/contas-a-pagar`, `/financeiro/fornecedores` | financeiro |
| `/gestao`, `/gestao/fechamento` | gestao |
| `/relatorios` | relatorios |
| `/configuracoes` | configuracoes |

Sub-rotas dentro do seu prefixo são livres (`/produtos/novo`, `/produtos/[id]`, `/vendas/[id]/cupom`...). Rotas fora do seu prefixo, nunca.

Middleware já bloqueia OPERADOR em `/gestao`, `/relatorios`, `/configuracoes`, `/financeiro`, `/estoque/entradas`. Nas outras rotas, o módulo decide o que o operador vê (ex.: operador cadastra produto mas não vê custo? Decisão: operador vê tudo em produtos e clientes, mas só ADMIN edita preço de custo e exclui).

## Regras de negócio transversais

- **Venda exige caixa aberto** (`obterSessaoCaixaAberta()`); sem sessão, PDV bloqueia e manda pra `/caixa`.
- **Só uma sessão de caixa aberta por vez.**
- **Dinheiro esperado no fechamento** = `valorAbertura` + pagamentos `DINHEIRO` de vendas `CONCLUIDA` da sessão (campo `valor`, não `valorRecebido`) + `SUPRIMENTO` + recebimentos de fiado em `DINHEIRO` na sessão − `SANGRIA` − despesas `pagoDoCaixa` da sessão. Cancelamento de venda da mesma sessão remove o valor (a venda deixa de ser `CONCLUIDA`).
- **CMV da venda** = soma `quantidade × custoUnitario / 1000` dos itens, com `custoUnitario` = `Produto.precoCusto` no momento (snapshot).
- **Lucro real de um período** = receita (vendas concluídas, `total`) − CMV (`custoTotal`) − taxas (`taxasTotal`) − perdas (`Perda.valorTotal`) − despesas (`Despesa.valor`, incluindo as geradas por boletos pagos). Lucro bruto = receita − CMV − taxas.
- **Custo médio ponderado** recalculado em cada entrada: `custoMedioPonderado(...)`. Perdas e vendas não mudam o custo médio.
- **FEFO**: venda de produto com `controlaValidade` baixa dos lotes com validade mais próxima primeiro (quantidade do lote nunca fica negativa; se lotes não cobrem, o restante baixa só de `Produto.estoque`).
- **Perda** cria `Perda` + `MovimentoEstoque(PERDA, quantidade negativa)` e baixa o lote se informado.
- **Fiado**: venda com forma `FIADO` exige `clienteId`, respeita `limiteFiado` (saldo + valor ≤ limite; `limiteFiado = 0` bloqueia), cria `LancamentoFiado(DEBITO)`. Pagamento de fiado cria `LancamentoFiado(PAGAMENTO)` com `formaPagamento` e `sessaoId` (se caixa aberto). Cancelamento de venda fiado cria `LancamentoFiado(ESTORNO)` (nunca PAGAMENTO): saldo = DEBITO − PAGAMENTO − ESTORNO; "fiado recebido" em caixa/relatórios soma só PAGAMENTO.
- **Maquininhas** (`Maquininha`): o mercado tem InfinitePay e Sipag, nenhuma com API pra PDV externo. Pagamento em DEBITO/CREDITO (e PIX quando passa na maquininha) registra `Pagamento.maquininhaId` (obrigatório se existir ao menos uma maquininha ativa), `nsu` e `autorizacao` opcionais. A taxa snapshot vem da maquininha (`taxaDebito` / `taxaCredito` à vista / `taxaCreditoParcelado` 2x+ / `taxaPix`) quando há maquininha; sem maquininha, cai em `ConfiguracaoPagamento`. `padrao = true` pré-seleciona no PDV (o navegador lembra a última usada). Cadastro em `/configuracoes/maquininhas` (admin), conciliação em `/relatorios/conciliacao`. Mercado Pago Point continua como integração opcional, só quando `mpAccessToken` e `mpDeviceId` estão preenchidos **e** a maquininha escolhida na venda tem `adquirente = "Mercado Pago"` (`ehMercadoPago()` em `vendas-calculos.ts`); sem nenhuma maquininha cadastrada, vale o comportamento antigo (integração pra todo cartão). InfinitePay e Sipag são sempre registro manual no PDV (operador escolhe a maquininha e, se quiser, digita NSU/autorização do comprovante).
- **Entrada estornada**: `EntradaEstoque.estornadaEm` e `estornadaPorId` preenchidos (não usar marcador na observação). Relatórios ignoram entradas com `estornadaEm != null`.
- **Conta recorrente**: `ContaPagar.diaVencimento` guarda o dia original; a próxima conta usa `min(diaVencimento, últimoDiaDoMês)`.
- **Sessão de caixa**: `observacao` é da abertura, `observacaoFechamento` do fechamento.
- **Usuário**: `ultimoAcesso` atualizado no login.
- **Boleto pago** vira `Despesa` vinculada (`contaPagarId`), com `data = dataPagamento`, `valor = valorPago`. Recorrência `MENSAL` gera a próxima conta ao pagar.
- **Taxas**: no pagamento, snapshot da maquininha escolhida (se houver) ou de `ConfiguracaoPagamento` → `taxaPercentual`, `taxaFixa`, `taxaValor`; `Venda.taxasTotal` = soma.
- **Promoção**: `precoEfetivo()` decide o preço no PDV.
- **Desconto**: operador pode dar até `descontoMaximoPercentual` se `permitirDescontoOperador`; ADMIN sem limite.
- **Venda sem estoque**: permitida se `permitirVendaSemEstoque` (estoque fica negativo); senão bloqueia.

## Como encerrar seu trabalho

1. `npx tsc --noEmit` limpo (erros em arquivos de outros módulos: ignore e mencione).
2. `npx vitest run tests/<seu-modulo>.test.ts` passando.
3. Relatório final (é o retorno da sua tarefa): arquivos criados, rotas, actions, decisões, pendências, o que faltou no schema, e o que outro módulo precisa saber. Sem prosa; lista.
