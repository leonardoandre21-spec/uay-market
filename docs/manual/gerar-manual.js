/* eslint-disable @typescript-eslint/no-require-imports -- script CommonJS avulso, roda fora do Next */
// Gera o Manual do Sistema (docx) pro dono do Uay Market.
// Rodar: NODE_PATH=C:/Users/usuario/AppData/Roaming/npm/node_modules node docs/manual/gerar-manual.js [pasta-destino]
const path = require("node:path");
const fs = require("node:fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, PageBreak, TableOfContents, Footer, PageNumber, LevelFormat,
} = require("docx");

const VERDE = "1F7A4D";
const VERDE_ESCURO = "175E3B";
const CINZA = "5B6657";
const AMBAR = "B45309";
const FONTE = "Calibri";

const T = (texto, o = {}) => new TextRun({ text: texto, font: FONTE, size: o.size || 22, bold: o.bold, italics: o.italics, color: o.color });

const titulo = (t) => new Paragraph({ spacing: { before: 2400, after: 120 }, alignment: AlignmentType.CENTER, children: [T(t, { size: 56, bold: true, color: VERDE })] });
const subtitulo = (t) => new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.CENTER, children: [T(t, { size: 30, color: CINZA })] });
const meta = (t) => new Paragraph({ spacing: { after: 100 }, alignment: AlignmentType.CENTER, children: [T(t, { size: 20, color: CINZA })] });

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { before: 0, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: VERDE, space: 6 } }, children: [T(t, { size: 34, bold: true, color: VERDE })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 }, children: [T(t, { size: 26, bold: true, color: VERDE_ESCURO })] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 220, after: 80 }, children: [T(t, { size: 23, bold: true, color: CINZA })] });
const P = (t, o = {}) => new Paragraph({ spacing: { after: o.after ?? 140 }, children: [T(t, { bold: o.bold, italics: o.italics })] });
const B = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 70 }, children: [T(t)] });
const N = (t) => new Paragraph({ numbering: { reference: "passos", level: 0 }, spacing: { after: 80 }, children: [T(t)] });
const NOTA = (t, cor = AMBAR) => new Paragraph({
  spacing: { before: 120, after: 180 }, indent: { left: 300 },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: cor, space: 10 } },
  children: [T("Atenção: ", { bold: true, color: cor }), T(t)],
});
const DICA = (t) => new Paragraph({
  spacing: { before: 120, after: 180 }, indent: { left: 300 },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: VERDE, space: 10 } },
  children: [T("Dica: ", { bold: true, color: VERDE }), T(t)],
});
const celula = (t, cab, w) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  shading: cab ? { type: ShadingType.CLEAR, fill: "E3F2EA" } : undefined,
  margins: { top: 70, bottom: 70, left: 110, right: 110 },
  children: String(t).split("\n").map((l, i, arr) => new Paragraph({ spacing: { after: i === arr.length - 1 ? 0 : 60 }, children: [T(l, { size: 20, bold: cab, color: cab ? VERDE_ESCURO : undefined })] })),
});
const tabela = (linhas, larguras) => new Table({
  columnWidths: larguras,
  width: { size: larguras.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  rows: linhas.map((r, i) => new TableRow({ children: r.map((c, j) => celula(c, i === 0, larguras[j])) })),
});
const ESPACO = () => new Paragraph({ spacing: { after: 100 }, children: [T("")] });

const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const conteudo = [
  // ---------------------------------------------------------------- capa
  titulo("Uay Market"),
  subtitulo("Manual do sistema de gestão e caixa"),
  ESPACO(),
  meta("Caixa com leitor de código de barras · Estoque e validade · Fiado · Boletos · Lucro real"),
  meta(`Versão 1.0 · ${hoje}`),
  meta("Mais Astral · agenciamaisastral@gmail.com"),
  new Paragraph({ children: [new PageBreak()] }),

  new Paragraph({ spacing: { after: 200 }, children: [T("Sumário", { size: 30, bold: true, color: VERDE })] }),
  new TableOfContents("Sumário", { hyperlink: true, headingStyleRange: "1-2" }),
  P("Se o sumário aparecer vazio, clique com o botão direito nele e escolha \"Atualizar campo\".", { italics: true }),

  // ---------------------------------------------------------------- 1
  H1("1. O que é o sistema e como abrir"),
  P("O Uay Market é o sistema que controla o mercado inteiro: o caixa (com o leitor de código de barras), o estoque com validade, os clientes que compram fiado, as despesas e os boletos, e os relatórios que mostram quanto o mercado realmente lucra depois de descontar custo das mercadorias, taxas de cartão, perdas e despesas."),
  P("Ele funciona pela internet: abre no navegador, pelo endereço do mercado, em qualquer computador ou celular conectado. Os dados ficam guardados na nuvem (no serviço Neon), que mantém o histórico e permite voltar o banco pra um momento anterior; mesmo assim, o backup semanal (capítulo 11) continua sendo a parte mais importante deste manual."),
  H2("Abrir o sistema"),
  N("Abra o Chrome (ou outro navegador) e digite o endereço do mercado na barra de endereço. Salve nos favoritos ou crie um atalho na área de trabalho pra abrir com um clique."),
  N("Escolha seu nome na tela de entrada e digite seu PIN (4 a 8 números). Cada pessoa tem um PIN diferente; o sistema não deixa dois usuários com o mesmo."),
  DICA("No computador do caixa, abra o sistema em tela cheia (F11) e deixe a aba fixa. No celular, use \"Adicionar à tela inicial\" pra ele abrir como um aplicativo."),
  NOTA("O caixa precisa de internet. Se a internet do mercado cair, ligue o roteador do celular (4G) e conecte o computador nele até a conexão voltar. Nenhum dado se perde: tudo que já foi registrado está na nuvem."),
  NOTA("Errar o PIN 5 vezes seguidas faz o sistema pedir uma espera (30 segundos, depois 1 minuto, 2, 4... até 15). Cada erro fica registrado na auditoria. Se alguém esqueceu o PIN, o Administrador troca em Configurações > Usuários."),
  H2("Dois tipos de usuário"),
  tabela([
    ["Tipo", "O que pode fazer"],
    ["Administrador (dono)", "Tudo: painel, relatórios, financeiro, configurações, cancelar qualquer venda, alterar preço de custo, excluir registros, ver auditoria."],
    ["Operador (caixa)", "Abrir e fechar o próprio caixa, vender, registrar perdas, cadastrar produtos e clientes, receber fiado. Não vê lucro, despesas nem configurações."],
  ], [2600, 6400]),
  NOTA("O sistema vem com o usuário \"Administrador\" e PIN 1234. Troque esse PIN no primeiro dia (Configurações > Usuários) e crie um usuário Operador pra cada pessoa que trabalha no caixa. Assim cada venda fica registrada em nome de quem fez."),

  // ---------------------------------------------------------------- 2
  H1("2. Primeiro dia: deixando tudo pronto"),
  P("Faça nesta ordem. Leva cerca de uma hora, fora o cadastro dos produtos."),
  H2("2.1 Dados da loja"),
  P("Configurações > Loja: nome, CNPJ, endereço, telefone e a mensagem que sai no rodapé do cupom (ex.: \"Obrigado pela preferência!\")."),
  H2("2.2 Usuários e PINs"),
  P("Configurações > Usuários: troque o PIN do Administrador e crie os operadores. O PIN é pessoal; não compartilhe."),
  H2("2.3 Maquininhas de cartão"),
  P("Configurações > Maquininhas: cadastre cada maquininha do mercado (ex.: InfinitePay e Sipag) com as taxas do seu contrato: débito, crédito à vista, crédito parcelado e prazo de recebimento. Marque uma como padrão."),
  P("Na venda, o operador digita o valor na maquininha normalmente e, no sistema, escolhe em qual maquininha o cartão passou. Com isso o sistema sabe quanto de taxa vai ser descontado e quando o dinheiro cai na conta. Sem isso, o \"lucro real\" fica mentiroso."),
  NOTA("As maquininhas InfinitePay e Sipag não conversam com o computador: o valor precisa ser digitado nelas. Isso é limitação delas, não do sistema. A integração automática só existe pra Mercado Pago Point (Configurações > Integração Mercado Pago), caso um dia o mercado use uma."),
  H2("2.4 Formas de pagamento"),
  P("Configurações > Formas de pagamento: ative ou desative Dinheiro, Pix, Débito, Crédito e Fiado. As taxas aqui só valem quando nenhuma maquininha for informada na venda."),
  H2("2.5 Pix"),
  P("Configurações > Pix: informe a chave Pix do mercado, o nome e a cidade. Na venda em Pix, o sistema mostra um QR code com o valor exato pro cliente escanear. Não precisa de integração com o banco: é o Pix \"estático\" padrão do Banco Central."),
  H2("2.6 Metas e alertas"),
  P("Configurações > Metas: meta de vendas por dia e por mês (aparece no painel), com quantos dias de antecedência avisar sobre produtos vencendo, se o caixa pode vender produto com estoque zerado e qual o desconto máximo que o operador pode dar sem o dono."),
  H2("2.7 Cadastro dos produtos"),
  P("Duas formas:"),
  B("Um por um em Produtos > Novo produto (capítulo 4)."),
  B("Em lote: Produtos > Importar CSV. Baixe a planilha modelo, preencha no Excel (código de barras, nome, categoria, unidade, preço, custo, estoque) e importe. Produtos com o mesmo código de barras são atualizados, não duplicados."),
  DICA("O estoque inicial só entra no cadastro do produto novo. Depois disso, o estoque só muda por entrada de compra, venda, perda ou ajuste, e cada mudança fica registrada."),

  // ---------------------------------------------------------------- 3
  H1("3. Rotina do caixa"),
  H2("3.1 Abrir o caixa"),
  N("Entre com seu PIN. Você cai direto na tela do caixa."),
  N("Se o caixa estiver fechado, clique em \"Abrir caixa\", conte o dinheiro que já está na gaveta (fundo de troco) e informe o valor. O sistema sugere o valor com que o caixa anterior fechou."),
  N("Confirme. Você volta pra tela de vendas."),
  P("Só existe um caixa aberto por vez. Cada dia (ou turno) começa com uma abertura e termina com um fechamento; é assim que o sistema mostra com quanto o caixa começou e quanto deveria ter no fim."),
  H2("3.2 Vender"),
  P("A tela de vendas tem o campo de código grande no canto superior esquerdo. Ele fica sempre com o cursor: é só passar o produto no leitor."),
  N("Passe o produto no leitor. Ele entra no carrinho na hora. Passar de novo o mesmo produto soma a quantidade."),
  N("Produto sem código ou que o leitor não pega: digite o código interno e Enter, ou use \"Buscar produto pelo nome\"."),
  N("Produto vendido por quilo (frutas, carnes, queijo): ao passar o código, o sistema pede o peso. Digite com vírgula (0,350 = 350 gramas) e Enter."),
  N("Pra mudar a quantidade de um item, clique no número da quantidade e digite. Pra tirar, clique na lixeira."),
  N("Desconto: por item (coluna Desconto) ou geral (à direita, em R$ ou %). O operador só consegue dar até o limite definido pelo dono."),
  N("Cliente: opcional, mas obrigatório se o pagamento for fiado. Busque por nome, CPF ou telefone."),
  N("Clique em \"Finalizar venda\" (ou F10)."),
  H3("Atalhos do teclado"),
  tabela([
    ["Tecla", "Faz"],
    ["F2", "Volta o cursor pro campo de código"],
    ["F4", "Mudar quantidade do último item"],
    ["F8", "Desconto geral"],
    ["F10", "Finalizar venda"],
    ["Del", "Remover o item selecionado"],
    ["Esc", "Limpar o campo ou cancelar o carrinho (pede confirmação)"],
    ["Enter", "Na tela de venda concluída, começa a próxima venda"],
  ], [1800, 7200]),
  H2("3.3 Receber o pagamento"),
  P("Na janela de pagamento escolha a forma. Dá pra dividir: parte em dinheiro, parte no cartão."),
  tabela([
    ["Forma", "Como fazer"],
    ["Dinheiro", "Informe quanto o cliente entregou; o troco aparece grande na tela. Deixe em branco se o valor foi exato."],
    ["Pix", "Aparece o QR code com o valor. O cliente escaneia e mostra o comprovante. Se o Pix passou na maquininha, marque a opção e escolha a maquininha."],
    ["Débito / Crédito", "Digite o valor na maquininha, passe o cartão e escolha no sistema em qual maquininha passou. Se quiser, anote o NSU do comprovante (ajuda a conferir o extrato depois). Crédito: informe as parcelas."],
    ["Fiado", "Só pra cliente cadastrado com limite de fiado. O sistema bloqueia se passar do limite."],
  ], [2200, 6800]),
  P("Quando a soma cobre o total, clique em \"Confirmar venda\". Aparece a tela de venda registrada com o troco e o número do cupom. \"Imprimir cupom\" abre o cupom não fiscal pra imprimir; \"Nova venda\" (ou Enter) volta pro caixa. Dá pra bipar o próximo produto direto nessa tela: ele já entra na venda seguinte."),
  DICA("Enter funciona em todo lugar do caixa: no campo de código adiciona o produto, no peso confirma, no valor do pagamento adiciona o pagamento."),
  NOTA("O cupom do sistema não é documento fiscal. Se o mercado emite nota fiscal (NFC-e), isso continua sendo feito pelo emissor que a contabilidade indicar."),
  DICA("Se a tela recarregar no meio de uma venda (queda de luz rápida, F5 sem querer), o carrinho é recuperado automaticamente ao abrir o caixa de novo."),
  H2("3.4 Código que o leitor não conhece"),
  P("Se o produto não está cadastrado, o sistema avisa e oferece \"Cadastrar produto\". O código de barras já vem preenchido; complete nome, preço e custo, salve, e o sistema volta pro caixa com o produto já no carrinho."),
  H2("3.5 Sangria e suprimento"),
  B("Sangria: retirar dinheiro da gaveta (levar pro cofre, pagar um entregador). Abertura e fechamento > Sangria, informe valor e motivo."),
  B("Suprimento: colocar dinheiro na gaveta (reforço de troco). Mesmo caminho, botão Suprimento."),
  P("Os dois entram na conta do dinheiro esperado no fechamento."),
  H2("3.6 Cancelar uma venda"),
  P("Vendas > clique na venda > \"Cancelar venda\", informe o motivo. O estoque volta, o fiado é estornado e a venda sai dos relatórios. O operador só cancela venda do próprio caixa aberto e feita há menos de 30 minutos; o Administrador cancela qualquer uma. Todo cancelamento fica na auditoria."),
  H2("3.7 Fechar o caixa"),
  N("Abertura e fechamento > Fechar caixa."),
  N("O sistema mostra o dinheiro esperado na gaveta: fundo de troco + vendas em dinheiro + suprimentos + fiado recebido em dinheiro − sangrias − despesas pagas com dinheiro do caixa."),
  N("Conte o dinheiro da gaveta e informe o valor contado. A diferença (sobra ou falta) aparece na hora; se houver diferença, explique na observação."),
  N("Confirme. Imprima o resumo se quiser guardar com o dinheiro."),
  P("Cartão, Pix e fiado aparecem no resumo por forma de pagamento, mas não entram na conta da gaveta porque não são dinheiro vivo."),

  // ---------------------------------------------------------------- 4
  H1("4. Produtos"),
  H2("Cadastro"),
  tabela([
    ["Campo", "Pra que serve"],
    ["Código de barras", "O EAN da embalagem (o leitor lê). O sistema valida o dígito verificador."],
    ["Código interno", "Código curto pra produtos sem embalagem (ex.: 1001 = banana). Digite no caixa."],
    ["Unidade", "Unidade (UN) ou Quilo (KG). Produto KG pede o peso na venda."],
    ["Preço de venda", "O que o cliente paga."],
    ["Preço de custo", "Quanto o mercado paga. Atualizado sozinho pelas entradas de compra (custo médio). Só o Administrador edita à mão."],
    ["Promoção", "Preço promocional e até quando vale. No caixa entra o preço promocional automaticamente enquanto a promoção durar."],
    ["Estoque mínimo", "Abaixo disso o produto aparece em vermelho e no alerta do painel."],
    ["Controla validade", "Marque pra laticínios, frios, carnes, pães: o sistema passa a controlar lotes com data de vencimento."],
  ], [2400, 6600]),
  P("Na página do produto você vê a margem e o markup calculados ao vivo, o histórico de preços, os últimos movimentos de estoque e os lotes com validade."),
  H2("Margem e markup"),
  P("Margem é quanto do preço de venda sobra depois do custo: produto que custa R$ 6 e vende a R$ 10 tem margem de 40%. Markup é quanto você aumentou sobre o custo: os mesmos R$ 6 → R$ 10 são 66,7% de markup. O sistema mostra os dois; use o que você está acostumado."),
  H2("Categorias, importação e exportação"),
  B("Produtos > Categorias: organize (Mercearia, Bebidas, Hortifruti...). Não dá pra excluir categoria com produtos."),
  B("Importar CSV: planilha do Excel salva como CSV. O sistema mostra as 20 primeiras linhas com os erros antes de confirmar."),
  B("Exportar CSV: baixa a lista completa pra abrir no Excel (com custo e margem)."),

  // ---------------------------------------------------------------- 5
  H1("5. Estoque, compras, perdas e vencimentos"),
  H2("5.1 Entrada de compra (nota do fornecedor)"),
  P("Estoque > Entradas > Nova entrada. Escolha o fornecedor, informe o número da nota, a data e o frete. Vá passando os produtos no leitor (ou buscando pelo nome), com quantidade, custo unitário e validade (obrigatória nos produtos que controlam validade)."),
  P("Ao confirmar, o sistema soma o estoque, cria os lotes com validade, rateia o frete no custo de cada item e recalcula o custo médio de cada produto."),
  P("Se a compra foi a prazo, marque \"gerar boleto a pagar\" com vencimento e parcelas: os boletos já aparecem em Financeiro."),
  H2("Custo médio: como funciona"),
  P("Se você tinha 10 unidades que custaram R$ 5,00 e compra mais 10 a R$ 7,00, o custo médio passa a ser R$ 6,00. É esse custo médio que o sistema usa pra calcular o lucro de cada venda. Por isso é importante lançar todas as compras com o custo certo."),
  H2("5.2 Perdas"),
  P("Estoque > Perdas > Registrar perda: produto, quantidade, motivo (vencido, avaria, furto, quebra, consumo interno) e, se o produto controla validade, o lote. O estoque baixa e o valor da perda (a custo) entra no lucro real do mês."),
  H2("5.3 Ajuste de estoque"),
  P("Fez contagem e o número está diferente? Estoque > botão Ajustar no produto: informe a quantidade contada e o motivo. Fica registrado quem ajustou e quando."),
  H2("5.4 Vencimentos"),
  P("Estoque > Vencimentos mostra os lotes em quatro faixas: vencidos, vencem em 7 dias, de 8 a 30 dias, mais de 30 dias. Dali você registra a perda do que venceu ou coloca em promoção o que está pra vencer (o preço promocional vale até a data de validade)."),
  P("Na venda, o sistema baixa primeiro o lote que vence antes (FEFO), então o estoque que sobra é sempre o mais novo."),

  // ---------------------------------------------------------------- 6
  H1("6. Clientes e fiado"),
  P("Clientes > Novo cliente: nome, CPF, telefone, endereço, data de nascimento e limite de fiado (só o Administrador define). Cliente com limite zero não compra fiado."),
  P("Na página do cliente: saldo devedor, extrato (compras fiado, pagamentos, estornos), últimas compras e os produtos que mais leva."),
  H2("Receber um pagamento de fiado"),
  N("Clientes > cliente > Receber pagamento."),
  N("Informe o valor (pode ser parcial) e a forma (dinheiro, Pix, cartão)."),
  N("Confirme. Sai um recibo pra imprimir. Se foi em dinheiro e o caixa está aberto, o valor entra na gaveta do dia."),
  H2("Cobrar"),
  P("O botão \"Cobrar pelo WhatsApp\" abre o WhatsApp com uma mensagem pronta com o saldo. Nada é enviado sozinho: você confere e manda."),
  P("O painel avisa quando há fiado em aberto há mais de 30 dias."),
  H2("Crédito do cliente"),
  P("Se um cliente pagar mais do que devia (ou uma venda fiado for cancelada depois de paga), ele fica com crédito. A ficha mostra \"Crédito de R$ X\" e o caixa usa esse crédito automaticamente na próxima compra fiado. Pra devolver em dinheiro, use Ajuste manual > Débito, com observação."),
  H2("Desconto ou perdão de dívida"),
  P("Ajuste manual > Pagamento, sem forma de pagamento, registra um abatimento que não entra em \"fiado recebido\" nem no caixa. Serve pra acertos de caderno antigo e descontos negociados."),

  // ---------------------------------------------------------------- 7
  H1("7. Financeiro: despesas e boletos"),
  H2("7.1 Despesas"),
  P("Financeiro > Despesas > Lançar despesa: descrição, categoria (aluguel, energia, salários...), valor, data e forma de pagamento. Marque \"saiu do dinheiro do caixa\" quando pagou com dinheiro da gaveta (entra na conta do fechamento)."),
  P("\"Repetir do mês anterior\" copia as despesas fixas pro mês atual com um clique."),
  H2("7.2 Boletos a pagar"),
  P("Financeiro > Boletos a pagar: cadastre cada boleto com fornecedor, valor, vencimento e, se quiser, a linha digitável (botão copiar). Boleto mensal (aluguel, internet): marque recorrência mensal e o sistema cria o do mês seguinte quando você paga este. Compra parcelada: informe o número de parcelas."),
  P("A tela mostra o que está atrasado, o que vence hoje, nos próximos 7 e 30 dias, e o calendário do mês."),
  P("Ao clicar em \"Pagar\", informe a data, o valor pago (pode ter juros ou desconto) e a forma. O boleto pago vira uma despesa automaticamente: não lance de novo em Despesas, senão conta em dobro."),
  H2("7.3 Fornecedores"),
  P("Financeiro > Fornecedores: cadastro com CNPJ, telefone e contato. Na ficha do fornecedor você vê as últimas compras, os boletos pendentes e pagos, e o total comprado no ano."),

  // ---------------------------------------------------------------- 8
  H1("8. Relatórios"),
  P("Menu Relatórios (só Administrador). Todos têm filtro de período (hoje, 7 dias, este mês, mês passado, personalizado), botão de imprimir e exportar CSV pro Excel."),
  tabela([
    ["Relatório", "O que mostra"],
    ["Mais vendidos", "Ranking por quantidade, receita e lucro. E o contrário: produtos parados, sem venda no período (encalhe)."],
    ["Lucro", "Receita, custo das mercadorias, taxas, perdas, despesas e o lucro real do período, por produto e por categoria, com gráfico dia a dia."],
    ["Pagamentos", "Quanto entrou em dinheiro, Pix, débito, crédito e fiado; vendas por operador; vendas por hora do dia e dia da semana (pra escala de funcionários)."],
    ["Conciliação de maquininhas", "Por maquininha e por dia: quantas transações, valor bruto, taxas, valor líquido e quando o dinheiro cai (crédito parcelado em maquininha sem antecipação cai parcela a parcela, uma a cada 30 dias). Use pra bater com o extrato da InfinitePay e do Sipag."],
    ["Curva ABC", "Classe A = os produtos que fazem 80% do faturamento (não pode faltar). B até 95%. C = o resto (avalie se vale ocupar prateleira)."],
    ["Estoque", "Giro, dias de cobertura, produtos parados e valor imobilizado por categoria."],
    ["Clientes", "Quem mais compra e o fiado em aberto por cliente."],
  ], [2600, 6400]),
  H2("Lucro real: a conta que o sistema faz"),
  P("Receita das vendas"),
  P("(−) Taxas de cartão e Pix da maquininha"),
  P("(−) Custo das mercadorias vendidas (pelo custo médio de cada produto no momento da venda)"),
  P("(=) Lucro bruto"),
  P("(−) Perdas (vencidos, avarias, furtos, a custo)"),
  P("(−) Despesas (aluguel, energia, salários, boletos pagos...). Boleto de compra de mercadoria não entra aqui: esse custo já foi contado no custo das mercadorias vendidas, senão contaria duas vezes."),
  P("(=) Lucro real", { bold: true }),
  P("Pra essa conta ser verdadeira, quatro coisas precisam estar em dia: custo dos produtos (via entradas de compra), taxas das maquininhas cadastradas, perdas registradas e despesas lançadas."),

  // ---------------------------------------------------------------- 9
  H1("9. Painel e fechamento mensal"),
  H2("Painel"),
  P("Primeira tela do Administrador. Mostra o dia (vendas, lucro bruto, ticket médio, situação do caixa), o mês (faturamento contra a meta, lucro real, despesas, compras), o gráfico dos últimos 30 dias e os alertas: boletos atrasados ou vencendo, produtos vencendo, produtos abaixo do mínimo, fiado antigo, diferença de caixa nos últimos fechamentos e vendas canceladas hoje."),
  H2("Fechamento mensal"),
  P("Gestão > Fechamento mensal: o demonstrativo do mês (a mesma conta do lucro real acima, linha a linha, comparado com o mês anterior), mais: compras do mês por fornecedor, boletos pagos e pendentes, vendas por forma de pagamento, caixas do mês e fiado novo, recebido e em aberto. Imprima ou exporte pro contador."),
  P("Gestão > Comparativo 12 meses: a mesma conta, mês a mês, pra ver a tendência."),

  // ---------------------------------------------------------------- 10
  H1("10. Configurações e auditoria"),
  B("Loja, Usuários, Formas de pagamento, Maquininhas, Pix, Metas: capítulo 2."),
  B("Integração Mercado Pago: opcional, só se a maquininha for Mercado Pago Point."),
  B("Backup: capítulo 11."),
  B("Auditoria: registro de tudo que importa (quem entrou, abriu e fechou caixa, cancelou venda, mudou preço, pagou boleto, trocou PIN), com data, hora e usuário. Filtre por pessoa, ação e período."),

  // ---------------------------------------------------------------- 11
  H1("11. Backup: a parte mais importante"),
  P("Todos os dados do mercado ficam na nuvem, no serviço Neon, e não no computador do caixa. Se o computador queimar, for roubado ou o disco falhar, nada se perde: basta abrir o sistema em outro aparelho. O que ainda pode dar errado é um engano dentro do sistema (uma restauração indevida, uma exclusão em massa) ou um problema na conta da nuvem; pra isso existem duas proteções."),
  H2("O que a nuvem já faz sozinha"),
  B("O Neon guarda o histórico de tudo que mudou e permite voltar o banco pra qualquer minuto do passado (restauração por ponto no tempo). No plano gratuito o histórico cobre as últimas 24 horas; nos planos pagos, mais dias. Essa restauração é feita pelo painel do Neon, pelo suporte da Mais Astral."),
  H2("O que você precisa fazer"),
  N("Uma vez por semana, abra Configurações > Backup > \"Baixar backup agora (arquivo .json)\"."),
  N("Salve o arquivo baixado na pasta do Google Drive do mercado (ou num pen drive que fique fora do mercado). O nome do arquivo já traz a data e a hora: uay-market-AAAAMMDD-HHMM.json."),
  N("Guarde pelo menos os últimos 4 arquivos (um mês). Os mais antigos podem ser apagados."),
  NOTA("Baixar e deixar na pasta Downloads do computador do caixa não é backup. Mande pro Google Drive."),
  DICA("A tela de backup mostra quando foi a última vez que alguém baixou o arquivo. Se passou de uma semana, faça agora."),
  H2("Restaurar um backup"),
  P("Restaurar coloca o sistema exatamente como estava no momento em que o arquivo foi baixado. Tudo que foi registrado depois daquela data deixa de existir. Use só num sistema vazio (uma instalação nova) ou pra voltar a um ponto anterior de propósito."),
  N("Antes de qualquer coisa, baixe um backup do estado atual (botão \"Baixar backup agora\"), por segurança."),
  N("Configurações > Backup > Restaurar de um arquivo: escolha o arquivo .json."),
  N("Digite RESTAURAR no campo de confirmação e clique em \"Restaurar e substituir todos os dados\"."),
  N("Confira a tabela com a quantidade de registros restaurados. Depois saia do sistema e entre de novo: os usuários e PINs passam a ser os do arquivo."),
  NOTA("Se o arquivo estiver corrompido ou for de outro sistema, a restauração é recusada e nada muda. Ela só grava quando o arquivo inteiro passa."),

  // ---------------------------------------------------------------- 12
  H1("12. Problemas comuns"),
  tabela([
    ["Problema", "O que fazer"],
    ["O leitor bipa e não acontece nada", "Clique no campo de código (ou aperte F2) e passe de novo. O leitor funciona como um teclado: precisa que o cursor esteja no campo."],
    ["O leitor digita o código mas o produto não entra", "O produto não está cadastrado ou está com outro código. O sistema oferece \"Cadastrar produto\". Confira também se o leitor está configurado pra mandar Enter no fim (padrão de fábrica)."],
    ["Esqueci meu PIN", "O Administrador troca em Configurações > Usuários. Se o Administrador esqueceu o próprio PIN, chame o suporte da Mais Astral."],
    ["Caixa de ontem ficou aberto", "Abra Abertura e fechamento, feche o caixa contando o dinheiro de hoje cedo (a diferença vai aparecer; explique na observação) e abra o de hoje."],
    ["Sem internet o caixa não abre", "O sistema roda na nuvem e precisa de conexão. Ligue o roteador do celular (4G, \"ponto de acesso\" ou \"hotspot\"), conecte o computador do caixa nele e recarregue a página. Quando a internet do mercado voltar, troque de volta."],
    ["O sistema não abre (página não carrega) mesmo com internet", "Confira se o endereço está digitado certo e teste em outro aparelho (celular). Se não abrir em nenhum, chame o suporte da Mais Astral."],
    ["Passei o cartão na maquininha mas esqueci de finalizar no sistema", "Registre a venda normalmente escolhendo a maquininha. Se já fechou o caixa, o Administrador registra e o relatório de conciliação mostra a diferença com a maquininha."],
    ["O total do lucro parece errado", "Quase sempre é custo de produto faltando (produto cadastrado com custo zero) ou compra não lançada. Veja Produtos: os com custo zero aparecem com margem \"sem custo\"."],
    ["A impressora não imprime o cupom", "O cupom sai pela impressão do Windows: confira se a impressora está ligada e definida como padrão. O cupom fica salvo em Vendas e pode ser reimpresso."],
  ], [3200, 5800]),

  // ---------------------------------------------------------------- 13
  H1("13. Glossário"),
  tabela([
    ["Termo", "Significado"],
    ["CMV", "Custo das Mercadorias Vendidas: quanto custaram, pelo custo médio, os produtos que saíram nas vendas."],
    ["Custo médio", "Média ponderada do custo de compra do produto, recalculada em cada entrada."],
    ["FEFO", "\"Vence primeiro, sai primeiro\": a venda baixa o lote com validade mais próxima."],
    ["Fundo de troco", "Dinheiro que já está na gaveta quando o caixa abre."],
    ["Sangria", "Retirada de dinheiro da gaveta durante o dia."],
    ["Suprimento", "Reforço de dinheiro na gaveta durante o dia."],
    ["Fiado", "Venda a prazo pra cliente cadastrado, anotada no sistema em vez do caderno."],
    ["NSU", "Número do comprovante da maquininha; serve pra achar a transação no extrato da adquirente."],
    ["Conciliação", "Bater o que o sistema registrou em cartão com o que a maquininha depositou na conta."],
    ["Ticket médio", "Valor médio por venda (faturamento dividido pelo número de cupons)."],
    ["Curva ABC", "Classificação dos produtos pela participação no faturamento."],
    ["DRE", "Demonstrativo de resultado: a conta do lucro do mês, linha a linha."],
  ], [2400, 6600]),
  ESPACO(),
  P("Suporte: Mais Astral · agenciamaisastral@gmail.com", { italics: true }),
];

const doc = new Document({
  creator: "Mais Astral",
  title: "Manual do Sistema Uay Market",
  styles: { default: { document: { run: { font: FONTE, size: 22 } } } },
  numbering: {
    config: [{ reference: "passos", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 500, hanging: 300 } } } }] }],
  },
  features: { updateFields: true },
  sections: [{
    properties: { page: { margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [T("Uay Market · Manual do sistema · página ", { size: 18, color: CINZA }), new TextRun({ children: [PageNumber.CURRENT], font: FONTE, size: 18, color: CINZA })] })],
      }),
    },
    children: conteudo,
  }],
});

const destino = process.argv[2] || path.join(__dirname);
const arquivo = path.join(destino, "Manual do Sistema - Uay Market.docx");
Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(arquivo, b);
  console.log("OK", arquivo, b.length, "bytes");
});
