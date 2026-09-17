# Uay Market

Sistema de gestão do mercado: caixa com leitor de código de barras, estoque com validade, financeiro (despesas e boletos), clientes com fiado e relatórios de lucro real.

Roda na nuvem (Vercel + Neon) e abre pelo navegador em qualquer computador ou celular com internet. Feito pela Mais Astral.

## Instalação oficial (Vercel + Neon)

O sistema é um app Next.js 15 hospedado no Vercel, com banco Postgres no Neon. Não há nada pra instalar no PC do mercado além do navegador.

### 1. Banco no Neon

1. Crie uma conta em https://neon.tech e um projeto novo. Região: **South America (São Paulo)**.
2. No painel do projeto, em **Connection details**, copie as duas URLs:
   - a **pooled** (host com `-pooler`), que vai em `DATABASE_URL`;
   - a **direct** (sem `-pooler`), que vai em `DATABASE_URL_UNPOOLED` (usada pelas migrações).

   Se você ligar a integração **Neon ↔ Vercel** (Vercel > Storage > Neon), essas duas variáveis são criadas no projeto do Vercel sozinhas, com exatamente esses nomes.

### 2. App no Vercel

1. Em https://vercel.com, **Add New > Project** e importe o repositório do GitHub. O `vercel.json` já fixa a região `gru1` (São Paulo).
2. Em **Environment Variables**, cadastre (as duas do banco só se não vieram pela integração):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | URL pooled do Neon |
   | `DATABASE_URL_UNPOOLED` | URL direta do Neon |
   | `SESSAO_SEGREDO` | 32+ caracteres aleatórios (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `ADMIN_PIN_INICIAL` | PIN do primeiro administrador (ex.: `1234`; troque no primeiro acesso) |

3. **Deploy**. O comando de build (`prisma generate && prisma migrate deploy && tsx prisma/seed.ts && next build`) cria as tabelas no Neon e roda o seed sozinho.

### 3. Seed inicial

O seed (administrador, categorias, formas de pagamento e configuração) roda em todo build e é idempotente: não duplica nada. Se precisar rodar à mão (por exemplo, pra recriar o administrador num banco novo sem fazer deploy), na sua máquina, com um arquivo `.env.producao` apontando pro Neon (as mesmas quatro variáveis acima):

```bash
npx tsx --env-file=.env.producao prisma/seed.ts
```

Nunca rode `prisma/seed-demo.ts` contra o banco do mercado.

### 4. Domínio

No Vercel, **Settings > Domains**, adicione o domínio do mercado. No Registro.br (ou onde o domínio estiver), crie os registros que o Vercel indicar. Em geral:

- domínio raiz: registro **A** apontando pra `76.76.21.21`;
- `www`: registro **CNAME** apontando pra `cname.vercel-dns.com`.

O certificado HTTPS é emitido sozinho. Em alguns minutos o sistema abre pelo endereço do mercado.

### 5. Primeiro acesso

Login inicial: **Administrador**, com o PIN de `ADMIN_PIN_INICIAL`. Troque o PIN em Configurações > Usuários e crie um usuário Operador pra cada pessoa do caixa, cada um com um PIN diferente (o sistema recusa PIN repetido). Errar o PIN 5 vezes seguidas impõe uma espera que cresce a cada erro (30 s, 1 min, 2 min... até 15 min) e cada erro fica registrado em Configurações > Auditoria. Desativar ou rebaixar um usuário vale na hora, mesmo que ele esteja com o sistema aberto.

**Atualização**: todo push na branch principal gera um deploy novo no Vercel, com as migrações pendentes aplicadas no build. Não precisa fechar o caixa.

## Hardware

- **Leitor de código de barras USB** em modo teclado (padrão de fábrica). Na tela do caixa, bipe com o campo de código em foco (F2 leva o foco de volta).
- **Maquininhas** (InfinitePay, Sipag ou outra): cadastre em Configurações > Maquininhas com as taxas do contrato. No caixa, o operador digita o valor na maquininha e escolhe no sistema em qual passou; as taxas entram no lucro real e no relatório de conciliação.
- **Mercado Pago Point** (opcional): se a maquininha for Mercado Pago, dá pra mandar o valor direto do sistema em Configurações > Integração Mercado Pago.
- **Impressora**: o cupom não fiscal sai pela impressão do navegador (formato 80 mm). Funciona em qualquer impressora instalada no computador.
- **Internet**: o caixa precisa de conexão. Se a internet do mercado cair, use o 4G do celular como roteador (hotspot) até voltar.

## Backup

- **Neon (automático)**: o banco guarda o histórico de tudo que mudou e permite restaurar pra qualquer minuto do passado (restauração por ponto no tempo) pelo painel do Neon, em **Branches > Restore**. O plano gratuito guarda 24 horas de histórico; os pagos, mais.
- **Exportar (semanal)**: Configurações > Backup > "Baixar backup agora (arquivo .json)". Sai um `uay-market-AAAAMMDD-HHMM.json` com todas as tabelas. Guarde no Google Drive do mercado ou num pen drive. Faça isso toda semana: se a conta do Neon for perdida ou o histórico não alcançar a data que você precisa, esse arquivo é o que traz o mercado de volta.
- **Restaurar**: Configurações > Backup > "Restaurar de um arquivo": envie o `.json`, digite RESTAURAR e confirme. **Substitui todos os dados atuais** pelos do arquivo, numa transação só (se algo falhar, nada muda). Depois, saia e entre de novo. Use só num sistema vazio ou pra voltar a um ponto anterior.

## Desenvolvimento

Precisa de Node.js 20+. O banco de desenvolvimento é um Postgres embutido (sem Docker) em `localhost:5433`.

```bash
npm install
cp .env.example .env     # já aponta pro Postgres local
npm run db:local         # terminal 1: sobe o Postgres embutido (fica rodando; Ctrl+C pra parar)
```

Num segundo terminal:

```bash
npx prisma migrate dev   # cria as tabelas
npm run db:seed          # administrador + categorias + formas de pagamento
PERMITIR_SEED_DEMO=1 npm run db:seed:demo   # opcional: dados fictícios de 45 dias pra testar (nunca no banco do mercado)
npm run dev              # http://localhost:3000
```

- `npm run typecheck`, `npm run lint`, `npm test`
- Convenções e regras de negócio: [docs/CONTRATO-MODULOS.md](docs/CONTRATO-MODULOS.md)
- Banco: Prisma 6 + Postgres. O mesmo schema vale pro Neon (produção) e pro Postgres embutido (desenvolvimento).

## Modo local avançado (servidor próprio)

Pra rodar fora do Vercel (num servidor da loja, por exemplo), os scripts `scripts\instalar.bat` e `scripts\iniciar.bat` continuam funcionando, mas **exigem um Postgres acessível** em `DATABASE_URL` e `DATABASE_URL_UNPOOLED` no `.env` (pode ser o embutido de `npm run db:local`, um Postgres instalado na máquina ou o próprio Neon). O instalador cria o `.env`, instala dependências, aplica migrações, roda o seed e gera o build; o `iniciar.bat` sobe o servidor em http://localhost:3000 e abre o navegador. Não há backup em disco nesse modo: use Configurações > Backup.

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
app/api/backup          exportar (GET) e restaurar (POST /restaurar) o backup em JSON
lib/                    dinheiro, datas, auth, consultas e serviços por módulo
prisma/                 schema, migrações e seeds
scripts/                postgres-local.mjs (dev), instalar.bat e iniciar.bat (servidor próprio)
```
