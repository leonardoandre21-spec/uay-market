# Uay Market

Sistema de gestão do mercado: caixa com leitor de código de barras, estoque com validade, financeiro (despesas e boletos), clientes com fiado e relatórios de lucro real.

Roda no PC do mercado, sem internet, com banco de dados em arquivo (SQLite). Feito pela Mais Astral.

## Instalação no PC do mercado (Windows)

1. Instale o **Node.js LTS** em https://nodejs.org (versão 20 ou mais nova).
2. Copie esta pasta pro PC (ex.: `C:\UayMarket`) **sem** estes itens, que são da máquina de desenvolvimento e não podem ir pro mercado: `.env` (segredo de sessão de desenvolvimento), `prisma\*.db` e `prisma\*.db-journal` (banco com dados de teste), `.next`, `node_modules`, `backups`, `tsconfig.tsbuildinfo`. O instalador recria tudo isso.
3. Dê dois cliques em `scripts\instalar.bat`. Ele cria o `.env` com um segredo novo, instala as dependências, prepara o banco e gera a versão de produção. Se já houver um `prisma\dev.db`, ele pergunta se é pra manter (atualização) ou guardar de lado e começar vazio (banco de teste que veio na cópia).
4. Pra abrir o sistema: `scripts\iniciar.bat` (abre em http://localhost:3000 assim que o servidor responder). Deixe a janela preta aberta ou minimizada. O sistema só responde no próprio PC (não fica acessível pelo Wi-Fi da loja).
5. Login inicial: **Administrador, PIN 1234**. Troque o PIN em Configurações > Usuários e crie um usuário Operador pra cada pessoa do caixa, cada um com um PIN diferente (o sistema recusa PIN repetido). Errar o PIN 5 vezes seguidas impõe uma espera que cresce a cada erro (30 s, 1 min, 2 min... até 15 min) e cada erro fica registrado em Configurações > Auditoria. Desativar ou rebaixar um usuário vale na hora, mesmo que ele esteja com o sistema aberto.

Pra abrir sozinho quando o Windows ligar: crie um atalho de `scripts\iniciar.bat` e coloque em `shell:startup` (Win+R, digite `shell:startup`).

**Atualização**: feche a janela preta do sistema, substitua os arquivos da pasta (mantendo `.env`, `prisma\dev.db` e `backups`) e rode `scripts\instalar.bat` de novo, respondendo **S** pra manter o banco. O instalador recusa rodar com o sistema aberto.

## Hardware

- **Leitor de código de barras USB** em modo teclado (padrão de fábrica). Na tela do caixa, bipe com o campo de código em foco (F2 leva o foco de volta).
- **Maquininhas** (InfinitePay, Sipag ou outra): cadastre em Configurações > Maquininhas com as taxas do contrato. No caixa, o operador digita o valor na maquininha e escolhe no sistema em qual passou; as taxas entram no lucro real e no relatório de conciliação.
- **Mercado Pago Point** (opcional): se a maquininha for Mercado Pago, dá pra mandar o valor direto do sistema em Configurações > Integração Mercado Pago.
- **Impressora**: o cupom não fiscal sai pela impressão do navegador (formato 80 mm). Funciona em qualquer impressora instalada no Windows.

## Backup

- Automático: com o sistema aberto, ele mesmo gera um backup em `backups\uay-market-AAAAMMDD-HHMM.db` a cada 24 h (guarda os 30 mais recentes); `scripts\iniciar.bat` também copia o banco pra `backups\auto-AAAA-MM-DD.db` quando o servidor sobe (guarda 30 dias).
- Manual: Configurações > Backup > "Baixar backup agora".
- O banco é o arquivo `prisma\dev.db`. Guarde uma cópia fora do PC (pen drive ou Google Drive) toda semana.

## Desenvolvimento

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run db:seed          # administrador + categorias + formas de pagamento
PERMITIR_SEED_DEMO=1 npm run db:seed:demo   # opcional: dados fictícios de 45 dias pra testar (nunca no banco do mercado)
npm run dev              # http://localhost:3000
```

- `npm run typecheck`, `npm run lint`, `npm test`
- Convenções e regras de negócio: [docs/CONTRATO-MODULOS.md](docs/CONTRATO-MODULOS.md)
- Banco: Prisma + SQLite. Pra subir num servidor com Postgres, troque `provider` em `prisma/schema.prisma`, gere novas migrações e aponte `DATABASE_URL`.

## Estrutura

```
app/(auth)/login        login por PIN
app/(pdv)/pdv           tela do caixa (bipar e vender)
app/(app)/caixa         abertura, fechamento, sangria, suprimento
app/(app)/vendas        histórico, detalhe, cupom, cancelamento
app/(app)/produtos      cadastro, categorias, importação/exportação CSV
app/(app)/estoque       visão geral, entradas (compras), perdas, vencimentos
app/(app)/clientes      cadastro e fiado
app/(app)/financeiro    despesas, boletos a pagar, fornecedores
app/(app)/relatorios    mais vendidos, lucro real, pagamentos, ABC, estoque, clientes, conciliação
app/(app)/gestao        painel do dono, fechamento mensal (DRE), comparativo
app/(app)/configuracoes loja, usuários, pagamentos, maquininhas, Pix, metas, backup, auditoria
lib/                    dinheiro, datas, auth, consultas e serviços por módulo
prisma/                 schema, migrações e seeds
scripts/                instalar.bat e iniciar.bat
```
