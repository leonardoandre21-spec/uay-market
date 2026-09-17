// Seed de demonstração do Uay Market.
//
// Popula o banco com dois meses de operação de um mercado de bairro em
// Extrema/MG: produtos reais com EAN-13 válido, fornecedores, clientes com
// CPF válido, notas de entrada com lotes e validade, um caixa por dia com
// vendas distribuídas ao longo do expediente, perdas, despesas, boletos,
// fiado e auditoria. Tudo respeitando as invariantes do schema: dinheiro em
// centavos, quantidade em milésimos, MovimentoEstoque com estoqueApos
// coerente, custo médio ponderado recalculado em cada entrada, FEFO nos lotes.
//
// Reproduzível: usa gerador pseudoaleatório com semente fixa (mulberry32).
// Idempotente: aborta se já houver mais de 20 produtos no banco.
//
// Segurança: este script NUNCA deve rodar no banco do mercado. Ele só executa
// com PERMITIR_SEED_DEMO=1 no ambiente (ou no .env); sem isso, aborta sem tocar
// no banco. Tudo que ele cria recebe a marca "[demo]" na observação/descrição
// (MARCA_DEMO), e --limpar apaga só o que tem a marca. Bancos gerados por
// versões antigas do seed (sem a marca) não são limpos: apague o arquivo do
// banco e recrie com prisma migrate reset.
//
// Rodar: npm run db:seed                    (seed base: admin, categorias, formas de pagamento)
//        npm run db:seed:demo               (este arquivo; exige PERMITIR_SEED_DEMO=1)
//        npm run db:seed:demo -- --limpar   (remove só o que este seed criou, pela marca [demo])
//        npm run db:seed:demo -- --recriar  (limpa e gera de novo)
//        npm run db:seed:demo -- --maquininhas (só cria as maquininhas e atribui aos cartões das vendas dos operadores demo)
//
// Não importa nada de lib/ porque lib/auth e lib/consultas usam "server-only".
// As funções de cálculo que precisamos (custo médio, total de linha, taxa)
// estão copiadas aqui e são testadas contra lib/dinheiro.ts em
// tests/seed-demo.test.ts.

import {
  PrismaClient,
  type FormaPagamento,
  type MotivoPerda,
  type Prisma,
  type Unidade,
} from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

// ---------------------------------------------------------------- marca de demonstração

/**
 * Marca gravada na observação/descrição de tudo que este seed cria. `--limpar`
 * apaga só o que tem a marca, nunca por nome de produto, cliente ou despesa:
 * nomes genéricos ("Arroz Tipo 1 5kg", "Aluguel do ponto") colidem com
 * cadastros reais do mercado.
 */
export const MARCA_DEMO = "[demo]";

/** Texto com a marca na frente ("[demo]" sozinho quando não há texto). */
export function marcarDemo(texto?: string | null): string {
  return texto ? `${MARCA_DEMO} ${texto}` : MARCA_DEMO;
}

/** Diz se um texto de observação/descrição foi gravado por este seed. */
export function temMarcaDemo(texto: string | null | undefined): boolean {
  return texto === MARCA_DEMO || (texto?.startsWith(`${MARCA_DEMO} `) ?? false);
}

/** Filtro Prisma pra campos de texto gravados por este seed. */
const COM_MARCA_DEMO = { startsWith: MARCA_DEMO } as const;

/** Operadores de caixa fictícios. Toda venda e sessão do seed é de um deles. */
export const OPERADORES_DEMO = [
  { nome: "Maria (caixa)", pin: "1111" },
  { nome: "João (caixa)", pin: "2222" },
] as const;

/** Variável de ambiente que libera este script. Sem ela nada roda: protege o banco do mercado. */
export const VARIAVEL_LIBERACAO = "PERMITIR_SEED_DEMO";

/** Só libera com PERMITIR_SEED_DEMO=1 (no .env ou no ambiente do terminal). */
export function seedDemoLiberado(env: Record<string, string | undefined> = process.env): boolean {
  return env[VARIAVEL_LIBERACAO] === "1";
}

// ---------------------------------------------------------------- aleatório

/** Gerador pseudoaleatório determinístico (mulberry32). Devolve números em [0, 1). */
export function mulberry32(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Aleatorio {
  private readonly proximo: () => number;

  constructor(semente: number) {
    this.proximo = mulberry32(semente);
  }

  real(): number {
    return this.proximo();
  }

  /** Inteiro entre min e max, inclusive. */
  inteiro(min: number, max: number): number {
    return min + Math.floor(this.proximo() * (max - min + 1));
  }

  chance(probabilidade: number): boolean {
    return this.proximo() < probabilidade;
  }

  escolher<T>(lista: readonly T[]): T {
    return lista[Math.floor(this.proximo() * lista.length)];
  }

  /** Escolha ponderada: itens com peso maior saem mais vezes. */
  ponderado<T>(lista: readonly T[], peso: (item: T) => number): T {
    const total = lista.reduce((acc, item) => acc + peso(item), 0);
    let alvo = this.proximo() * total;
    for (const item of lista) {
      alvo -= peso(item);
      if (alvo < 0) return item;
    }
    return lista[lista.length - 1];
  }

  /** Embaralha uma cópia da lista (Fisher-Yates). */
  embaralhar<T>(lista: readonly T[]): T[] {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(this.proximo() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }
}

// ---------------------------------------------------------------- documentos

/** Dígito verificador de um EAN-13 a partir dos 12 primeiros dígitos. */
export function digitoEan13(base12: string): number {
  if (!/^\d{12}$/.test(base12)) throw new Error(`Base EAN inválida: ${base12}`);
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(base12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (soma % 10)) % 10;
}

/** EAN-13 brasileiro (prefixo 789) com dígito verificador correto. */
export function gerarEan13(rng: Aleatorio): string {
  let base = "789";
  for (let i = 0; i < 9; i++) base += rng.inteiro(0, 9);
  return base + digitoEan13(base);
}

/** CPF com dígitos verificadores válidos (só dígitos). */
export function gerarCpf(rng: Aleatorio): string {
  let base = "";
  do {
    base = "";
    for (let i = 0; i < 9; i++) base += rng.inteiro(0, 9);
  } while (/^(\d)\1{8}$/.test(base));
  const calc = (digitos: string) => {
    const n = digitos.length;
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(digitos[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(base);
  const d2 = calc(base + d1);
  return `${base}${d1}${d2}`;
}

function digitoCnpj(digitos: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < digitos.length; i++) soma += Number(digitos[i]) * pesos[i];
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** CNPJ formatado ("12.345.678/0001-95") com dígitos verificadores válidos. */
export function gerarCnpj(rng: Aleatorio): string {
  let base = "";
  for (let i = 0; i < 8; i++) base += rng.inteiro(0, 9);
  base += "0001";
  const d1 = digitoCnpj(base, PESOS_CNPJ_1);
  const d2 = digitoCnpj(base + d1, PESOS_CNPJ_2);
  const c = `${base}${d1}${d2}`;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/** Valida CNPJ formatado ou só dígitos. */
export function cnpjValido(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  return (
    digitoCnpj(d.slice(0, 12), PESOS_CNPJ_1) === Number(d[12]) &&
    digitoCnpj(d.slice(0, 13), PESOS_CNPJ_2) === Number(d[13])
  );
}

// ---------------------------------------------------------------- dinheiro (cópia de lib/dinheiro.ts)

export const MIL = 1000;
export const BP = 10000;

export function totalLinha(quantidadeMilesimos: number, precoCentavos: number): number {
  return Math.round((quantidadeMilesimos * precoCentavos) / MIL);
}

export function aplicarPercentual(centavos: number, pontosBase: number): number {
  return Math.round((centavos * pontosBase) / BP);
}

export function calcularTaxa(valor: number, taxaPercentual: number, taxaFixa: number): number {
  if (valor <= 0) return 0;
  return aplicarPercentual(valor, taxaPercentual) + taxaFixa;
}

/** Igual a lib/dinheiro.ts: custo médio ponderado depois de uma entrada. */
export function custoMedioPonderado(
  estoqueAtual: number,
  custoAtual: number,
  quantidadeEntrada: number,
  custoEntrada: number,
): number {
  if (quantidadeEntrada <= 0) return custoAtual;
  if (estoqueAtual <= 0) return custoEntrada;
  const total = estoqueAtual * custoAtual + quantidadeEntrada * custoEntrada;
  return Math.round(total / (estoqueAtual + quantidadeEntrada));
}

/** Nota que o cliente entrega no caixa pra pagar um valor em dinheiro. */
export function arredondarParaNota(total: number, rng: Aleatorio): number {
  const notas = [500, 1000, 2000, 5000, 10000];
  const opcoes: number[] = [];
  for (const n of notas) {
    const proxima = Math.ceil(total / n) * n;
    if (proxima > total && !opcoes.includes(proxima)) opcoes.push(proxima);
  }
  // 35% paga com valor exato, senão uma das duas notas mais próximas acima.
  if (opcoes.length === 0 || rng.chance(0.35)) return total;
  return rng.escolher(opcoes.slice(0, 2));
}

// ---------------------------------------------------------------- datas (fuso -03:00)

// America/Sao_Paulo não tem horário de verão desde 2019: deslocamento fixo de 3h.
const DESLOCAMENTO_HORAS = 3;

export interface DiaLocal {
  ano: number;
  mes: number;
  dia: number;
}

/** Hora local do mercado -> Date em UTC pra gravar no banco. */
export function dataLocal(d: DiaLocal, hora = 0, minuto = 0, segundo = 0): Date {
  return new Date(Date.UTC(d.ano, d.mes - 1, d.dia, hora + DESLOCAMENTO_HORAS, minuto, segundo));
}

/** Dia civil local (no fuso do mercado) de um instante. */
export function diaLocalDe(instante: Date): DiaLocal {
  const local = new Date(instante.getTime() - DESLOCAMENTO_HORAS * 3600_000);
  return { ano: local.getUTCFullYear(), mes: local.getUTCMonth() + 1, dia: local.getUTCDate() };
}

export function somarDias(d: DiaLocal, dias: number): DiaLocal {
  const base = new Date(Date.UTC(d.ano, d.mes - 1, d.dia + dias));
  return { ano: base.getUTCFullYear(), mes: base.getUTCMonth() + 1, dia: base.getUTCDate() };
}

/** 0 = domingo ... 6 = sábado. */
export function diaDaSemana(d: DiaLocal): number {
  return new Date(Date.UTC(d.ano, d.mes - 1, d.dia)).getUTCDay();
}

// ---------------------------------------------------------------- PIN (cópia de prisma/seed.ts)

function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 64).toString("hex")}`;
}

// ================================================================ dados do mercado

type ChaveFornecedor = "bebidas" | "laticinios" | "hortifruti" | "padaria" | "atacadao" | "frigorifico";

interface DefFornecedor {
  chave: ChaveFornecedor;
  nome: string;
  contato: string;
  telefone: string;
  email: string;
  observacao: string;
}

const FORNECEDORES: DefFornecedor[] = [
  {
    chave: "bebidas",
    nome: "Distribuidora Sul de Minas Bebidas",
    contato: "Rogério",
    telefone: "35991020304",
    email: "vendas@sulminasbebidas.com.br",
    observacao: "Entrega às terças e sextas. Pedido mínimo 10 caixas.",
  },
  {
    chave: "laticinios",
    nome: "Laticínios Serra da Mantiqueira",
    contato: "Dona Lúcia",
    telefone: "3534371144",
    email: "pedidos@laticiniosmantiqueira.com.br",
    observacao: "Queijo minas chega fresco toda quinta.",
  },
  {
    chave: "hortifruti",
    nome: "Hortifruti Vale Verde (CEASA Campinas)",
    contato: "Seu Zé",
    telefone: "19998812345",
    email: "zevaleverde@gmail.com",
    observacao: "Compra na CEASA de madrugada, entrega até as 8h.",
  },
  {
    chave: "padaria",
    nome: "Padaria e Confeitaria Pão da Serra",
    contato: "Marcos",
    telefone: "3534352277",
    email: "paodaserra@outlook.com",
    observacao: "Fornece pão, bolos e pão de queijo congelado.",
  },
  {
    chave: "atacadao",
    nome: "Atacadão Mineiro Distribuição",
    contato: "Fernanda (vendedora)",
    telefone: "3532212900",
    email: "fernanda.vendas@atacadaomineiro.com.br",
    observacao: "Boleto 28 dias. Frete cobrado por nota.",
  },
  {
    chave: "frigorifico",
    nome: "Frigorífico Boi Bom Extrema",
    contato: "Carlos",
    telefone: "35988453388",
    email: "carlos@boibom.com.br",
    observacao: "Carne resfriada, validade curta. Conferir temperatura na entrega.",
  },
];

interface DefProduto {
  nome: string;
  categoria: string;
  unidade: Unidade;
  preco: number; // centavos
  custo: number; // centavos (custo de referência das notas)
  minimo: number; // milésimos
  pop: number; // popularidade relativa nas vendas
  fornecedor: ChaveFornecedor;
  vida?: number; // dias de validade; presente = controlaValidade
}

const UN: Unidade = "UN";
const KG: Unidade = "KG";
const un = (n: number) => n * MIL;
const kg = (n: number) => Math.round(n * MIL);

const PRODUTOS: DefProduto[] = [
  // Mercearia (atacadão)
  { nome: "Arroz Tipo 1 5kg", categoria: "Mercearia", unidade: UN, preco: 2899, custo: 2250, minimo: un(10), pop: 6, fornecedor: "atacadao" },
  { nome: "Feijão Carioca 1kg", categoria: "Mercearia", unidade: UN, preco: 899, custo: 650, minimo: un(10), pop: 6, fornecedor: "atacadao" },
  { nome: "Óleo de Soja 900ml", categoria: "Mercearia", unidade: UN, preco: 749, custo: 599, minimo: un(12), pop: 5, fornecedor: "atacadao" },
  { nome: "Açúcar Cristal 5kg", categoria: "Mercearia", unidade: UN, preco: 1990, custo: 1580, minimo: un(6), pop: 4, fornecedor: "atacadao" },
  { nome: "Café Torrado e Moído 500g", categoria: "Mercearia", unidade: UN, preco: 1899, custo: 1420, minimo: un(8), pop: 6, fornecedor: "atacadao" },
  { nome: "Macarrão Espaguete 500g", categoria: "Mercearia", unidade: UN, preco: 449, custo: 320, minimo: un(12), pop: 5, fornecedor: "atacadao" },
  { nome: "Molho de Tomate 340g", categoria: "Mercearia", unidade: UN, preco: 299, custo: 205, minimo: un(12), pop: 4, fornecedor: "atacadao" },
  { nome: "Farinha de Trigo 1kg", categoria: "Mercearia", unidade: UN, preco: 549, custo: 410, minimo: un(8), pop: 3, fornecedor: "atacadao" },
  { nome: "Sal Refinado 1kg", categoria: "Mercearia", unidade: UN, preco: 249, custo: 165, minimo: un(8), pop: 2, fornecedor: "atacadao" },
  { nome: "Fubá Mimoso 1kg", categoria: "Mercearia", unidade: UN, preco: 399, custo: 280, minimo: un(6), pop: 3, fornecedor: "atacadao" },
  { nome: "Farinha de Mandioca Torrada 500g", categoria: "Mercearia", unidade: UN, preco: 599, custo: 430, minimo: un(5), pop: 2, fornecedor: "atacadao" },
  { nome: "Milho Verde em Conserva 170g", categoria: "Mercearia", unidade: UN, preco: 349, custo: 250, minimo: un(10), pop: 3, fornecedor: "atacadao" },
  { nome: "Sardinha em Lata 125g", categoria: "Mercearia", unidade: UN, preco: 499, custo: 360, minimo: un(10), pop: 3, fornecedor: "atacadao" },
  { nome: "Leite Condensado 395g", categoria: "Mercearia", unidade: UN, preco: 649, custo: 480, minimo: un(8), pop: 3, fornecedor: "atacadao" },
  { nome: "Creme de Leite 200g", categoria: "Mercearia", unidade: UN, preco: 349, custo: 250, minimo: un(8), pop: 3, fornecedor: "atacadao" },
  { nome: "Achocolatado em Pó 400g", categoria: "Mercearia", unidade: UN, preco: 899, custo: 660, minimo: un(6), pop: 3, fornecedor: "atacadao" },
  { nome: "Ovos Brancos Dúzia", categoria: "Mercearia", unidade: UN, preco: 1290, custo: 950, minimo: un(10), pop: 6, fornecedor: "hortifruti", vida: 25 },
  { nome: "Tempero Completo 300g", categoria: "Mercearia", unidade: UN, preco: 449, custo: 310, minimo: un(6), pop: 2, fornecedor: "atacadao" },
  { nome: "Vinagre de Álcool 750ml", categoria: "Mercearia", unidade: UN, preco: 299, custo: 200, minimo: un(6), pop: 2, fornecedor: "atacadao" },
  { nome: "Maionese 500g", categoria: "Mercearia", unidade: UN, preco: 999, custo: 720, minimo: un(6), pop: 3, fornecedor: "atacadao" },
  { nome: "Goiabada Cascão 600g", categoria: "Mercearia", unidade: UN, preco: 1190, custo: 850, minimo: un(6), pop: 2, fornecedor: "atacadao" },
  // Bebidas (distribuidora)
  { nome: "Refrigerante Cola 2L", categoria: "Bebidas", unidade: UN, preco: 999, custo: 720, minimo: un(24), pop: 8, fornecedor: "bebidas" },
  { nome: "Refrigerante Guaraná 2L", categoria: "Bebidas", unidade: UN, preco: 799, custo: 560, minimo: un(24), pop: 7, fornecedor: "bebidas" },
  { nome: "Cerveja Lata 350ml", categoria: "Bebidas", unidade: UN, preco: 399, custo: 289, minimo: un(48), pop: 9, fornecedor: "bebidas" },
  { nome: "Cerveja Puro Malte Lata 350ml", categoria: "Bebidas", unidade: UN, preco: 449, custo: 330, minimo: un(36), pop: 5, fornecedor: "bebidas" },
  { nome: "Água Mineral 500ml", categoria: "Bebidas", unidade: UN, preco: 250, custo: 140, minimo: un(48), pop: 8, fornecedor: "bebidas" },
  { nome: "Água Mineral 1,5L", categoria: "Bebidas", unidade: UN, preco: 399, custo: 250, minimo: un(24), pop: 5, fornecedor: "bebidas" },
  { nome: "Suco de Uva Integral 1L", categoria: "Bebidas", unidade: UN, preco: 1499, custo: 1050, minimo: un(8), pop: 3, fornecedor: "bebidas" },
  { nome: "Energético 250ml", categoria: "Bebidas", unidade: UN, preco: 799, custo: 560, minimo: un(12), pop: 3, fornecedor: "bebidas" },
  { nome: "Cachaça Artesanal 600ml", categoria: "Bebidas", unidade: UN, preco: 2490, custo: 1700, minimo: un(6), pop: 2, fornecedor: "bebidas" },
  { nome: "Refrigerante Laranja Lata 350ml", categoria: "Bebidas", unidade: UN, preco: 349, custo: 240, minimo: un(24), pop: 4, fornecedor: "bebidas" },
  // Frios e laticínios (laticínios, com validade)
  { nome: "Leite Integral 1L", categoria: "Frios e laticínios", unidade: UN, preco: 549, custo: 420, minimo: un(36), pop: 9, fornecedor: "laticinios", vida: 60 },
  { nome: "Queijo Minas Frescal", categoria: "Frios e laticínios", unidade: KG, preco: 4290, custo: 3100, minimo: kg(3), pop: 6, fornecedor: "laticinios", vida: 20 },
  { nome: "Queijo Mussarela Fatiado", categoria: "Frios e laticínios", unidade: KG, preco: 4590, custo: 3400, minimo: kg(3), pop: 6, fornecedor: "laticinios", vida: 45 },
  { nome: "Presunto Cozido Fatiado", categoria: "Frios e laticínios", unidade: KG, preco: 3290, custo: 2400, minimo: kg(2), pop: 5, fornecedor: "laticinios", vida: 30 },
  { nome: "Mortadela Fatiada", categoria: "Frios e laticínios", unidade: KG, preco: 1990, custo: 1400, minimo: kg(2), pop: 4, fornecedor: "laticinios", vida: 30 },
  { nome: "Manteiga com Sal 200g", categoria: "Frios e laticínios", unidade: UN, preco: 1290, custo: 950, minimo: un(8), pop: 4, fornecedor: "laticinios", vida: 90 },
  { nome: "Iogurte de Morango 170g", categoria: "Frios e laticínios", unidade: UN, preco: 349, custo: 240, minimo: un(12), pop: 5, fornecedor: "laticinios", vida: 30 },
  { nome: "Requeijão Cremoso 200g", categoria: "Frios e laticínios", unidade: UN, preco: 799, custo: 580, minimo: un(8), pop: 4, fornecedor: "laticinios", vida: 60 },
  { nome: "Margarina 500g", categoria: "Frios e laticínios", unidade: UN, preco: 699, custo: 500, minimo: un(8), pop: 4, fornecedor: "laticinios", vida: 120 },
  { nome: "Doce de Leite Mineiro 400g", categoria: "Frios e laticínios", unidade: UN, preco: 1490, custo: 1050, minimo: un(6), pop: 3, fornecedor: "laticinios", vida: 180 },
  { nome: "Queijo Parmesão Ralado 50g", categoria: "Frios e laticínios", unidade: UN, preco: 399, custo: 280, minimo: un(8), pop: 2, fornecedor: "laticinios", vida: 180 },
  // Hortifruti (CEASA, sem controle de validade)
  { nome: "Banana Prata", categoria: "Hortifruti", unidade: KG, preco: 699, custo: 420, minimo: kg(10), pop: 9, fornecedor: "hortifruti" },
  { nome: "Tomate", categoria: "Hortifruti", unidade: KG, preco: 899, custo: 560, minimo: kg(8), pop: 7, fornecedor: "hortifruti" },
  { nome: "Batata Inglesa", categoria: "Hortifruti", unidade: KG, preco: 599, custo: 380, minimo: kg(15), pop: 7, fornecedor: "hortifruti" },
  { nome: "Cebola", categoria: "Hortifruti", unidade: KG, preco: 549, custo: 350, minimo: kg(10), pop: 6, fornecedor: "hortifruti" },
  { nome: "Alho", categoria: "Hortifruti", unidade: KG, preco: 3490, custo: 2400, minimo: kg(2), pop: 3, fornecedor: "hortifruti" },
  { nome: "Laranja Pera", categoria: "Hortifruti", unidade: KG, preco: 449, custo: 280, minimo: kg(10), pop: 5, fornecedor: "hortifruti" },
  { nome: "Maçã Gala", categoria: "Hortifruti", unidade: KG, preco: 1090, custo: 720, minimo: kg(6), pop: 5, fornecedor: "hortifruti" },
  { nome: "Mamão Formosa", categoria: "Hortifruti", unidade: KG, preco: 599, custo: 380, minimo: kg(6), pop: 3, fornecedor: "hortifruti" },
  { nome: "Cenoura", categoria: "Hortifruti", unidade: KG, preco: 499, custo: 310, minimo: kg(6), pop: 4, fornecedor: "hortifruti" },
  { nome: "Alface Crespa", categoria: "Hortifruti", unidade: UN, preco: 349, custo: 200, minimo: un(10), pop: 4, fornecedor: "hortifruti" },
  { nome: "Limão Taiti", categoria: "Hortifruti", unidade: KG, preco: 599, custo: 380, minimo: kg(5), pop: 4, fornecedor: "hortifruti" },
  { nome: "Couve Manteiga (maço)", categoria: "Hortifruti", unidade: UN, preco: 299, custo: 180, minimo: un(10), pop: 3, fornecedor: "hortifruti" },
  { nome: "Abobrinha", categoria: "Hortifruti", unidade: KG, preco: 549, custo: 350, minimo: kg(4), pop: 2, fornecedor: "hortifruti" },
  // Padaria
  { nome: "Pão Francês", categoria: "Padaria", unidade: KG, preco: 1590, custo: 1000, minimo: kg(5), pop: 10, fornecedor: "padaria" },
  { nome: "Pão de Forma Tradicional 500g", categoria: "Padaria", unidade: UN, preco: 899, custo: 620, minimo: un(10), pop: 5, fornecedor: "padaria", vida: 15 },
  { nome: "Bolo de Fubá", categoria: "Padaria", unidade: UN, preco: 1490, custo: 950, minimo: un(4), pop: 3, fornecedor: "padaria", vida: 6 },
  { nome: "Rosca Doce", categoria: "Padaria", unidade: UN, preco: 990, custo: 620, minimo: un(4), pop: 3, fornecedor: "padaria", vida: 6 },
  { nome: "Broa de Milho", categoria: "Padaria", unidade: UN, preco: 799, custo: 500, minimo: un(4), pop: 2, fornecedor: "padaria", vida: 6 },
  { nome: "Pão de Queijo Congelado 400g", categoria: "Congelados", unidade: UN, preco: 1290, custo: 900, minimo: un(10), pop: 6, fornecedor: "padaria", vida: 90 },
  { nome: "Biscoito de Polvilho 100g", categoria: "Doces e snacks", unidade: UN, preco: 599, custo: 400, minimo: un(10), pop: 4, fornecedor: "padaria", vida: 60 },
  // Carnes (frigorífico, com validade)
  { nome: "Carne Moída", categoria: "Carnes", unidade: KG, preco: 3290, custo: 2500, minimo: kg(5), pop: 7, fornecedor: "frigorifico", vida: 5 },
  { nome: "Frango Inteiro Congelado", categoria: "Carnes", unidade: KG, preco: 1290, custo: 950, minimo: kg(10), pop: 7, fornecedor: "frigorifico", vida: 120 },
  { nome: "Coxa e Sobrecoxa de Frango", categoria: "Carnes", unidade: KG, preco: 1490, custo: 1080, minimo: kg(6), pop: 6, fornecedor: "frigorifico", vida: 90 },
  { nome: "Linguiça Toscana", categoria: "Carnes", unidade: KG, preco: 2490, custo: 1800, minimo: kg(5), pop: 6, fornecedor: "frigorifico", vida: 30 },
  { nome: "Bife de Alcatra", categoria: "Carnes", unidade: KG, preco: 4990, custo: 3800, minimo: kg(4), pop: 4, fornecedor: "frigorifico", vida: 5 },
  { nome: "Costela Bovina", categoria: "Carnes", unidade: KG, preco: 2890, custo: 2200, minimo: kg(5), pop: 3, fornecedor: "frigorifico", vida: 7 },
  { nome: "Bacon em Pedaço", categoria: "Carnes", unidade: KG, preco: 3490, custo: 2600, minimo: kg(2), pop: 4, fornecedor: "frigorifico", vida: 40 },
  // Limpeza (atacadão)
  { nome: "Detergente Líquido 500ml", categoria: "Limpeza", unidade: UN, preco: 299, custo: 199, minimo: un(24), pop: 6, fornecedor: "atacadao" },
  { nome: "Sabão em Pó 1kg", categoria: "Limpeza", unidade: UN, preco: 1290, custo: 940, minimo: un(12), pop: 5, fornecedor: "atacadao" },
  { nome: "Água Sanitária 2L", categoria: "Limpeza", unidade: UN, preco: 699, custo: 480, minimo: un(12), pop: 4, fornecedor: "atacadao" },
  { nome: "Amaciante de Roupas 2L", categoria: "Limpeza", unidade: UN, preco: 1490, custo: 1050, minimo: un(8), pop: 3, fornecedor: "atacadao" },
  { nome: "Esponja de Aço (8 un)", categoria: "Limpeza", unidade: UN, preco: 349, custo: 230, minimo: un(12), pop: 3, fornecedor: "atacadao" },
  { nome: "Desinfetante 2L", categoria: "Limpeza", unidade: UN, preco: 899, custo: 620, minimo: un(8), pop: 3, fornecedor: "atacadao" },
  { nome: "Sabão em Barra (5 un)", categoria: "Limpeza", unidade: UN, preco: 899, custo: 640, minimo: un(8), pop: 3, fornecedor: "atacadao" },
  // Higiene (atacadão)
  { nome: "Papel Higiênico 12 rolos", categoria: "Higiene", unidade: UN, preco: 1890, custo: 1350, minimo: un(12), pop: 6, fornecedor: "atacadao" },
  { nome: "Sabonete 90g", categoria: "Higiene", unidade: UN, preco: 249, custo: 165, minimo: un(24), pop: 5, fornecedor: "atacadao" },
  { nome: "Creme Dental 90g", categoria: "Higiene", unidade: UN, preco: 449, custo: 310, minimo: un(12), pop: 4, fornecedor: "atacadao" },
  { nome: "Shampoo 350ml", categoria: "Higiene", unidade: UN, preco: 1290, custo: 900, minimo: un(8), pop: 3, fornecedor: "atacadao" },
  { nome: "Absorvente (8 un)", categoria: "Higiene", unidade: UN, preco: 599, custo: 420, minimo: un(10), pop: 3, fornecedor: "atacadao" },
  { nome: "Fralda Descartável M (30 un)", categoria: "Higiene", unidade: UN, preco: 3990, custo: 2950, minimo: un(4), pop: 2, fornecedor: "atacadao" },
  // Doces e snacks (atacadão)
  { nome: "Biscoito Recheado Chocolate 130g", categoria: "Doces e snacks", unidade: UN, preco: 299, custo: 190, minimo: un(24), pop: 6, fornecedor: "atacadao" },
  { nome: "Biscoito Maisena 400g", categoria: "Doces e snacks", unidade: UN, preco: 549, custo: 380, minimo: un(12), pop: 4, fornecedor: "atacadao" },
  { nome: "Salgadinho de Milho 100g", categoria: "Doces e snacks", unidade: UN, preco: 599, custo: 400, minimo: un(24), pop: 5, fornecedor: "atacadao" },
  { nome: "Chocolate ao Leite 90g", categoria: "Doces e snacks", unidade: UN, preco: 699, custo: 480, minimo: un(20), pop: 4, fornecedor: "atacadao" },
  { nome: "Bala de Goma 500g", categoria: "Doces e snacks", unidade: UN, preco: 899, custo: 600, minimo: un(6), pop: 2, fornecedor: "atacadao" },
  { nome: "Pipoca de Micro-ondas 100g", categoria: "Doces e snacks", unidade: UN, preco: 349, custo: 230, minimo: un(12), pop: 3, fornecedor: "atacadao" },
  // Congelados (atacadão, com validade)
  { nome: "Pizza Congelada Mussarela 460g", categoria: "Congelados", unidade: UN, preco: 1990, custo: 1400, minimo: un(6), pop: 3, fornecedor: "atacadao", vida: 180 },
  { nome: "Batata Palito Congelada 400g", categoria: "Congelados", unidade: UN, preco: 1290, custo: 900, minimo: un(6), pop: 3, fornecedor: "atacadao", vida: 180 },
  { nome: "Sorvete Napolitano 1,5L", categoria: "Congelados", unidade: UN, preco: 2490, custo: 1750, minimo: un(6), pop: 3, fornecedor: "atacadao", vida: 180 },
];

interface DefCliente {
  nome: string;
  telefone: string;
  limite: number; // centavos
  nascimento: { mes: number; dia: number; ano: number } | "este-mes";
  endereco: string;
  observacao?: string;
  /** Deve ficar com saldo em atraso (> 30 dias) no fim do seed. */
  atrasado?: boolean;
}

const CLIENTES: DefCliente[] = [
  { nome: "Aparecida de Souza", telefone: "35998110234", limite: 20000, nascimento: { mes: 3, dia: 12, ano: 1958 }, endereco: "Rua das Palmeiras, 45, Centro", observacao: "Vizinha do mercado. Paga o fiado toda sexta." },
  { nome: "José Carlos Pereira", telefone: "35991234567", limite: 30000, nascimento: { mes: 7, dia: 2, ano: 1971 }, endereco: "Av. Delegado Waldemar Gomes Pinto, 810" },
  { nome: "Marlene Rodrigues", telefone: "35988776655", limite: 15000, nascimento: "este-mes", endereco: "Rua Vereador Lúcio Gomes, 102" },
  { nome: "Antônio Ferreira", telefone: "35997001122", limite: 0, nascimento: { mes: 11, dia: 20, ano: 1965 }, endereco: "Rua Tiradentes, 300, Ponte Nova" },
  { nome: "Luciana Martins", telefone: "11976543210", limite: 0, nascimento: { mes: 1, dia: 8, ano: 1989 }, endereco: "Rua José Bonifácio, 18, Jardim Bela Vista" },
  { nome: "Sebastião Oliveira", telefone: "35999887766", limite: 10000, nascimento: { mes: 5, dia: 30, ano: 1952 }, endereco: "Estrada do Barreiro, km 3", observacao: "Aposentado. Combinou de acertar quando receber.", atrasado: true },
  { nome: "Rita de Cássia Almeida", telefone: "35991112233", limite: 25000, nascimento: { mes: 8, dia: 15, ano: 1977 }, endereco: "Rua Coronel Belarmino, 77" },
  { nome: "Paulo Henrique Costa", telefone: "35992223344", limite: 0, nascimento: "este-mes", endereco: "Rua Frei Caneca, 210, Vila Rica" },
  { nome: "Geralda do Nascimento", telefone: "35993334455", limite: 20000, nascimento: { mes: 2, dia: 3, ano: 1949 }, endereco: "Rua Santa Rita, 9, Centro", atrasado: true },
  { nome: "Wagner Dias", telefone: "35994445566", limite: 15000, nascimento: { mes: 10, dia: 25, ano: 1983 }, endereco: "Rua das Acácias, 155, Jardim Pinheiros" },
  { nome: "Fátima Gonçalves", telefone: "35995556677", limite: 0, nascimento: { mes: 4, dia: 17, ano: 1969 }, endereco: "Rua Minas Gerais, 402" },
  { nome: "Rodrigo Lima", telefone: "11987650000", limite: 0, nascimento: { mes: 12, dia: 1, ano: 1995 }, endereco: "Alameda das Flores, 33, Vila Nova" },
  { nome: "Terezinha Ribeiro", telefone: "35996667788", limite: 0, nascimento: "este-mes", endereco: "Rua São Sebastião, 60" },
  { nome: "Cláudio Barbosa", telefone: "35997778899", limite: 0, nascimento: { mes: 6, dia: 9, ano: 1980 }, endereco: "Rua Padre Anchieta, 88, Ponte Nova" },
  { nome: "Vanessa Moreira", telefone: "35998889900", limite: 0, nascimento: { mes: 9, dia: 28, ano: 1992 }, endereco: "Rua Rio Branco, 512, Centro" },
];

type TipoConta = "PAGA" | "PENDENTE" | "ATRASADA";

interface DefEntrada {
  dia: number; // deslocamento em dias em relação a hoje (negativo = passado)
  hora: number;
  fornecedor: ChaveFornecedor;
  frete: number; // centavos
  /** Fator de tamanho da compra (1 = reposição normal). */
  fator: number;
  conta?: { tipo: TipoConta; prazoDias: number };
}

const ENTRADAS: DefEntrada[] = [
  { dia: -60, hora: 9, fornecedor: "atacadao", frete: 18000, fator: 1.3, conta: { tipo: "PAGA", prazoDias: 28 } },
  { dia: -60, hora: 11, fornecedor: "bebidas", frete: 0, fator: 1.2 },
  { dia: -59, hora: 8, fornecedor: "laticinios", frete: 4500, fator: 1.1, conta: { tipo: "PAGA", prazoDias: 21 } },
  { dia: -59, hora: 7, fornecedor: "hortifruti", frete: 0, fator: 1.2 },
  { dia: -58, hora: 9, fornecedor: "frigorifico", frete: 6000, fator: 1.1 },
  { dia: -58, hora: 10, fornecedor: "padaria", frete: 0, fator: 1.0 },
  { dia: -25, hora: 9, fornecedor: "atacadao", frete: 15000, fator: 1.0, conta: { tipo: "PENDENTE", prazoDias: 30 } },
  { dia: -20, hora: 10, fornecedor: "bebidas", frete: 0, fator: 1.0, conta: { tipo: "PENDENTE", prazoDias: 30 } },
  { dia: -15, hora: 8, fornecedor: "laticinios", frete: 3800, fator: 1.0, conta: { tipo: "PENDENTE", prazoDias: 35 } },
  { dia: -12, hora: 10, fornecedor: "padaria", frete: 0, fator: 1.0 },
  { dia: -10, hora: 7, fornecedor: "hortifruti", frete: 0, fator: 1.1, conta: { tipo: "ATRASADA", prazoDias: 7 } },
  { dia: -4, hora: 9, fornecedor: "frigorifico", frete: 5500, fator: 1.0 },
];

interface DefDespesaFixa {
  descricao: string;
  categoria: string;
  valor: number; // centavos; varia um pouco por mês
  diaDoMes: number;
  forma: FormaPagamento;
  variacao: number; // fração (0.1 = até 10% pra cima ou pra baixo)
}

const DESPESAS_FIXAS: DefDespesaFixa[] = [
  { descricao: "Aluguel do ponto", categoria: "Aluguel", valor: 350000, diaDoMes: 5, forma: "PIX", variacao: 0 },
  { descricao: "Conta de energia (CEMIG)", categoria: "Energia", valor: 128000, diaDoMes: 10, forma: "DEBITO", variacao: 0.12 },
  { descricao: "Conta de água (COPASA)", categoria: "Água", valor: 28500, diaDoMes: 12, forma: "DEBITO", variacao: 0.1 },
  { descricao: "Internet e telefone fixo", categoria: "Internet e telefone", valor: 14990, diaDoMes: 15, forma: "PIX", variacao: 0 },
  { descricao: "Salário Maria (caixa)", categoria: "Salários", valor: 210000, diaDoMes: 5, forma: "PIX", variacao: 0 },
  { descricao: "Salário João (caixa)", categoria: "Salários", valor: 190000, diaDoMes: 5, forma: "PIX", variacao: 0 },
  { descricao: "Sacolas e embalagens", categoria: "Embalagens", valor: 38000, diaDoMes: 8, forma: "PIX", variacao: 0.15 },
  { descricao: "Manutenção dos freezers", categoria: "Manutenção", valor: 45000, diaDoMes: 20, forma: "PIX", variacao: 0.2 },
  { descricao: "Simples Nacional (DAS)", categoria: "Impostos", valor: 96000, diaDoMes: 20, forma: "DEBITO", variacao: 0.08 },
];

/** Despesas pequenas pagas com dinheiro do caixa durante o expediente. */
const DESPESAS_DO_CAIXA: Array<{ descricao: string; categoria: string; valor: number }> = [
  { descricao: "Gás de cozinha (botijão)", categoria: "Outros", valor: 12000 },
  { descricao: "Sacolas plásticas (pacote)", categoria: "Embalagens", valor: 4500 },
  { descricao: "Troca de lâmpada do depósito", categoria: "Manutenção", valor: 3500 },
  { descricao: "Bobina de papel do cupom", categoria: "Embalagens", valor: 2800 },
  { descricao: "Material de limpeza da loja", categoria: "Outros", valor: 6200 },
  { descricao: "Conserto da porta do freezer", categoria: "Manutenção", valor: 15000 },
  { descricao: "Água e café pros funcionários", categoria: "Outros", valor: 2400 },
  { descricao: "Motoboy entrega de pedido", categoria: "Outros", valor: 1500 },
];

/**
 * Maquininhas do mercado. InfinitePay é a padrão (70% dos cartões), Sipag
 * fica com os outros 30%. Taxas em pontos-base, prazos em dias corridos.
 */
interface DefMaquininha {
  nome: string;
  adquirente: string;
  padrao: boolean;
  peso: number;
  taxaDebito: number;
  taxaCredito: number;
  taxaCreditoParcelado: number;
  taxaPix: number;
  prazoDebitoDias: number;
  prazoCreditoDias: number;
  prazoPixDias: number;
  observacao: string;
}

export const MAQUININHAS_DEMO: DefMaquininha[] = [
  {
    nome: "InfinitePay (Gustavo)",
    adquirente: "InfinitePay",
    padrao: true,
    peso: 70,
    taxaDebito: 139,
    taxaCredito: 349,
    taxaCreditoParcelado: 499,
    taxaPix: 0,
    prazoDebitoDias: 1,
    prazoCreditoDias: 30,
    prazoPixDias: 0,
    observacao: "PAX P2 com etiqueta Gustavo. Fica no caixa principal.",
  },
  {
    nome: "Sipag",
    adquirente: "Sipag",
    padrao: false,
    peso: 30,
    taxaDebito: 149,
    taxaCredito: 299,
    taxaCreditoParcelado: 399,
    taxaPix: 0,
    prazoDebitoDias: 1,
    prazoCreditoDias: 30,
    prazoPixDias: 0,
    observacao: "Maquininha do Sicoob. Reserva e fila do fim de semana.",
  },
];

/** Taxa em pontos-base que a maquininha cobra numa forma (crédito 2x+ usa a parcelada). Igual a taxaDaMaquininha em lib. */
export function taxaMaquininhaDemo(
  m: Pick<DefMaquininha, "taxaDebito" | "taxaCredito" | "taxaCreditoParcelado" | "taxaPix">,
  forma: FormaPagamento,
  parcelas = 1,
): number {
  if (forma === "DEBITO") return m.taxaDebito;
  if (forma === "CREDITO") return parcelas >= 2 ? m.taxaCreditoParcelado : m.taxaCredito;
  if (forma === "PIX") return m.taxaPix;
  return 0;
}

/** NSU fictício de 6 dígitos, como sai no comprovante. */
export function gerarNsu(rng: Aleatorio): string {
  return String(rng.inteiro(100000, 999999));
}

const MOTIVOS_CANCELAMENTO = [
  "Cliente desistiu da compra",
  "Item registrado em duplicidade",
  "Cliente esqueceu a carteira",
  "Preço errado na etiqueta, venda refeita",
  "Cartão recusado",
];

// ================================================================ estado em memória

interface ProdutoMem {
  id: number;
  def: DefProduto;
  saldo: number; // milésimos
  custo: number; // centavos, custo médio atual
}

interface LoteMem {
  id: number;
  produtoId: number;
  validade: Date;
  quantidade: number;
  quantidadeInicial: number;
}

interface ClienteMem {
  id: number;
  def: DefCliente;
  saldoFiado: number;
}

type TaxasMaquininha = Pick<DefMaquininha, "taxaDebito" | "taxaCredito" | "taxaCreditoParcelado" | "taxaPix">;

interface MaquininhaMem {
  id: number;
  def: DefMaquininha;
  /** Taxas do registro no banco (iguais às da definição quando o seed criou a maquininha). */
  taxas: TaxasMaquininha;
}

interface Contexto {
  rng: Aleatorio;
  hoje: DiaLocal;
  agoraUtc: Date;
  adminId: number;
  operadores: Array<{ id: number; nome: string }>;
  fornecedorId: Record<ChaveFornecedor, number>;
  categoriaDespesaId: Map<string, number>;
  produtos: ProdutoMem[];
  lotes: LoteMem[];
  clientes: ClienteMem[];
  maquininhas: MaquininhaMem[];
  numeroVenda: number;
  totais: {
    vendas: number;
    canceladas: number;
    itens: number;
    entradas: number;
    perdas: number;
    sessoes: number;
    despesas: number;
  };
}

type Tx = Prisma.TransactionClient;

const SEMENTE = 20260916;
const DIAS_DE_ENTRADAS = 60;
const DIAS_DE_VENDAS = 45;
const HORA_ABERTURA = { hora: 6, minuto: 50 };
const HORA_FECHAMENTO = { hora: 20, minuto: 20 };
const DIAS_COM_DIFERENCA: Record<number, number> = { [-38]: -500, [-27]: 200, [-16]: -500, [-9]: 200 };
const DIAS_COM_PERDA = [-44, -40, -35, -31, -26, -22, -17, -13, -8, -3];
const MOTIVO_POR_PERDA: MotivoPerda[] = ["VENCIDO", "AVARIA", "VENCIDO", "QUEBRA", "VENCIDO", "AVARIA", "QUEBRA", "VENCIDO", "AVARIA", "QUEBRA"];
/** Dias em que uma venda é forçada a fiado pra um cliente que vai ficar em atraso. */
const FIADO_ATRASADO_FORCADO: Record<number, string> = { [-41]: "Sebastião Oliveira", [-36]: "Geralda do Nascimento" };

/** Pesos por hora do dia (7h às 20h) com pico no fim da tarde. */
const PESO_HORA: Record<number, number> = {
  7: 2, 8: 4, 9: 5, 10: 6, 11: 7, 12: 6, 13: 4, 14: 4, 15: 5, 16: 6, 17: 10, 18: 12, 19: 10, 20: 2,
};

// ================================================================ passos do seed

/** Maior número de cupom já existente (outros cadastros ou testes podem ter criado vendas). */
async function maiorNumeroDeVenda(db: PrismaClient | Tx): Promise<number> {
  const ultimo = await db.venda.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
  return ultimo?.numero ?? 0;
}

async function garantirUsuarios(db: PrismaClient): Promise<{ adminId: number; operadores: Array<{ id: number; nome: string }> }> {
  let admin = await db.usuario.findFirst({ where: { papel: "ADMIN" }, orderBy: { id: "asc" } });
  if (!admin) {
    admin = await db.usuario.create({ data: { nome: "Administrador", pinHash: hashPin(process.env.ADMIN_PIN_INICIAL ?? "1234"), papel: "ADMIN" } });
    console.log("Administrador criado (PIN 1234).");
  }
  const operadores: Array<{ id: number; nome: string }> = [];
  for (const { nome, pin } of OPERADORES_DEMO) {
    let u = await db.usuario.findFirst({ where: { nome } });
    if (!u) u = await db.usuario.create({ data: { nome, pinHash: hashPin(pin), papel: "OPERADOR" } });
    operadores.push({ id: u.id, nome: u.nome });
  }
  return { adminId: admin.id, operadores };
}

/** Ids dos operadores fictícios já cadastrados (vazio num banco que nunca recebeu o seed). */
async function idsOperadoresDemo(db: PrismaClient): Promise<number[]> {
  const linhas = await db.usuario.findMany({ where: { nome: { in: OPERADORES_DEMO.map((o) => o.nome) } }, select: { id: true } });
  return linhas.map((l) => l.id);
}

async function gravarConfiguracao(db: PrismaClient, rng: Aleatorio): Promise<void> {
  await db.configuracao.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {
      nomeLoja: "Uay Market",
      cnpj: gerarCnpj(rng),
      telefone: "3534351234",
      endereco: "Rua Coronel Raul Leite, 120, Centro, Extrema/MG, CEP 37640-000",
      mensagemCupom: "Obrigado pela preferência! Volte sempre.",
      pixChave: "uaymarket@exemplo.com.br",
      pixNomeRecebedor: "UAY MARKET",
      pixCidade: "EXTREMA",
      metaVendasDiaria: 250000,
      metaVendasMensal: 7000000,
      alertaVencimentoDias: 7,
    },
  });
}

/**
 * Cria as duas maquininhas se ainda não existirem (procura pelo nome). Idempotente.
 * Nunca desmarca uma maquininha padrão que já exista: ela pode ser a real do
 * mercado. A demo só vira padrão quando nenhuma outra é.
 */
async function garantirMaquininhas(db: PrismaClient): Promise<MaquininhaMem[]> {
  const lista: MaquininhaMem[] = [];
  for (const def of MAQUININHAS_DEMO) {
    let m = await db.maquininha.findFirst({ where: { nome: def.nome } });
    if (!m) {
      const jaTemPadrao = def.padrao ? (await db.maquininha.count({ where: { padrao: true } })) > 0 : false;
      m = await db.maquininha.create({
        data: {
          nome: def.nome,
          adquirente: def.adquirente,
          ativo: true,
          padrao: def.padrao && !jaTemPadrao,
          taxaDebito: def.taxaDebito,
          taxaCredito: def.taxaCredito,
          taxaCreditoParcelado: def.taxaCreditoParcelado,
          taxaPix: def.taxaPix,
          prazoDebitoDias: def.prazoDebitoDias,
          prazoCreditoDias: def.prazoCreditoDias,
          prazoPixDias: def.prazoPixDias,
          observacao: marcarDemo(def.observacao),
        },
      });
      console.log(`Maquininha criada: ${def.nome}.`);
    }
    lista.push({
      id: m.id,
      def,
      taxas: { taxaDebito: m.taxaDebito, taxaCredito: m.taxaCredito, taxaCreditoParcelado: m.taxaCreditoParcelado, taxaPix: m.taxaPix },
    });
  }
  return lista;
}

async function criarFornecedores(db: PrismaClient, rng: Aleatorio): Promise<Record<ChaveFornecedor, number>> {
  const ids = {} as Record<ChaveFornecedor, number>;
  for (const f of FORNECEDORES) {
    const criado = await db.fornecedor.create({
      data: { nome: f.nome, cnpj: gerarCnpj(rng), telefone: f.telefone, email: f.email, contato: f.contato, observacao: marcarDemo(f.observacao) },
    });
    ids[f.chave] = criado.id;
  }
  return ids;
}

async function criarClientes(db: PrismaClient, rng: Aleatorio, hoje: DiaLocal): Promise<ClienteMem[]> {
  const lista: ClienteMem[] = [];
  const existentes = await db.cliente.findMany({ select: { cpf: true } });
  const cpfs = new Set<string>(existentes.map((c) => c.cpf).filter((c): c is string => c !== null));
  const diasAniversario = [3, 18, 27];
  let indiceAniversario = 0;
  for (const def of CLIENTES) {
    let cpf = gerarCpf(rng);
    while (cpfs.has(cpf)) cpf = gerarCpf(rng);
    cpfs.add(cpf);
    let nascimento: Date;
    if (def.nascimento === "este-mes") {
      const dia = diasAniversario[indiceAniversario++ % diasAniversario.length];
      nascimento = dataLocal({ ano: hoje.ano - rng.inteiro(28, 70), mes: hoje.mes, dia });
    } else {
      nascimento = dataLocal({ ano: def.nascimento.ano, mes: def.nascimento.mes, dia: def.nascimento.dia });
    }
    const criado = await db.cliente.create({
      data: {
        nome: def.nome,
        cpf,
        telefone: def.telefone,
        endereco: `${def.endereco}, Extrema/MG`,
        dataNascimento: nascimento,
        limiteFiado: def.limite,
        observacao: marcarDemo(def.observacao),
      },
    });
    lista.push({ id: criado.id, def, saldoFiado: 0 });
  }
  return lista;
}

async function criarProdutos(db: PrismaClient, rng: Aleatorio): Promise<ProdutoMem[]> {
  const categorias = await db.categoria.findMany();
  const idCategoria = new Map(categorias.map((c) => [c.nome, c.id]));
  // Códigos já usados no banco (por outros cadastros ou testes) não podem repetir.
  const existentes = await db.produto.findMany({ select: { codigoBarras: true, codigoInterno: true } });
  const codigos = new Set<string>(existentes.map((p) => p.codigoBarras).filter((c): c is string => c !== null));
  const internos = new Set<string>(existentes.map((p) => p.codigoInterno).filter((c): c is string => c !== null));
  const lista: ProdutoMem[] = [];
  let sequencia = 1001;
  const proximoCodigoInterno = () => {
    let codigo = String(sequencia++);
    while (internos.has(codigo)) codigo = String(sequencia++);
    internos.add(codigo);
    return codigo;
  };
  for (const def of PRODUTOS) {
    const categoriaId = idCategoria.get(def.categoria);
    if (!categoriaId) throw new Error(`Categoria "${def.categoria}" não existe. Rode npm run db:seed antes.`);
    let codigoBarras = gerarEan13(rng);
    while (codigos.has(codigoBarras)) codigoBarras = gerarEan13(rng);
    codigos.add(codigoBarras);
    const criado = await db.produto.create({
      data: {
        codigoBarras,
        codigoInterno: proximoCodigoInterno(),
        nome: def.nome,
        descricao: MARCA_DEMO,
        categoriaId,
        unidade: def.unidade,
        precoVenda: def.preco,
        precoCusto: def.custo,
        estoque: 0,
        estoqueMinimo: def.minimo,
        controlaValidade: def.vida !== undefined,
      },
    });
    lista.push({ id: criado.id, def, saldo: 0, custo: def.custo });
  }
  return lista;
}

// ---------------------------------------------------------------- entradas

/** Média de itens (linhas de cupom) vendidos por dia; calibra o tamanho das compras. */
const LINHAS_POR_DIA = 48;
const FORNECEDORES_PERECIVEIS: ChaveFornecedor[] = ["laticinios", "hortifruti", "padaria", "frigorifico"];

/** Quantidade média vendida por linha de cupom, em milésimos (igual à distribuição de quantidadeDeVenda). */
function quantidadeMediaPorLinha(def: DefProduto): number {
  if (def.unidade === "KG") {
    if (def.nome.startsWith("Frango Inteiro")) return 2350;
    if (def.nome === "Alho") return 250;
    return 1350;
  }
  return def.nome.startsWith("Cerveja") ? 4200 : 1600;
}

/** Consumo diário estimado do produto, em milésimos. */
function consumoDiario(def: DefProduto, popTotal: number): number {
  return ((LINHAS_POR_DIA * def.pop) / popTotal) * quantidadeMediaPorLinha(def);
}

/** Dias que uma nota precisa cobrir: até a próxima nota do mesmo fornecedor ou um horizonte padrão. */
function diasCobertos(def: DefEntrada): number {
  const proxima = ENTRADAS.filter((e) => e.fornecedor === def.fornecedor && e.dia > def.dia).sort((a, b) => a.dia - b.dia)[0];
  const inicio = Math.max(def.dia, -DIAS_DE_VENDAS);
  const fim = proxima ? proxima.dia : def.dia + (FORNECEDORES_PERECIVEIS.includes(def.fornecedor) ? 21 : 35);
  return Math.max(3, fim - inicio);
}

/**
 * Quantidade comprada de um produto numa nota: consumo previsto até a próxima
 * compra. Perecível vem justo (pode faltar antes da próxima entrega); o resto
 * vem com folga de 10% a 40%.
 */
function quantidadeDeCompra(def: DefProduto, entrada: DefEntrada, popTotal: number, rng: Aleatorio): number {
  const perecivel = def.vida !== undefined && def.vida <= 45;
  const folga = perecivel ? 0.9 + rng.real() * 0.25 : 1.1 + rng.real() * 0.3;
  const bruto = consumoDiario(def, popTotal) * diasCobertos(entrada) * folga * entrada.fator;
  if (def.unidade === "KG") return Math.max(kg(2), Math.round(bruto / 500) * 500);
  const unidades = Math.max(6, Math.ceil(bruto / MIL));
  // Bebida vem em fardo de 6; o resto em unidades soltas.
  return un(def.fornecedor === "bebidas" ? Math.ceil(unidades / 6) * 6 : unidades);
}

async function registrarEntrada(tx: Tx, ctx: Contexto, def: DefEntrada, numeroNota: number): Promise<void> {
  const dia = somarDias(ctx.hoje, def.dia);
  const momento = dataLocal(dia, def.hora, ctx.rng.inteiro(0, 50));
  const produtos = ctx.produtos.filter((p) => p.def.fornecedor === def.fornecedor);

  const popTotal = ctx.produtos.reduce((acc, p) => acc + p.def.pop, 0);
  const itens = produtos.map((p) => {
    const quantidade = quantidadeDeCompra(p.def, def, popTotal, ctx.rng);
    // Custo da nota oscila até 5% em torno do custo de referência.
    const custoUnitario = Math.max(1, Math.round(p.def.custo * (0.95 + ctx.rng.real() * 0.1)));
    let validade: Date | null = null;
    if (p.def.vida !== undefined) {
      const jitter = 1 + (ctx.rng.real() - 0.5) * 0.3;
      validade = dataLocal(somarDias(dia, Math.max(2, Math.round(p.def.vida * jitter))), 23, 59, 59);
    }
    return { produto: p, quantidade, custoUnitario, validade, valor: totalLinha(quantidade, custoUnitario) };
  });
  const valorTotal = itens.reduce((acc, i) => acc + i.valor, 0);

  // Frete rateado proporcionalmente ao valor de cada item, entrando no custo médio.
  const custosEfetivos = itens.map((i) => {
    const freteItem = valorTotal > 0 ? Math.round((def.frete * i.valor) / valorTotal) : 0;
    return Math.round(((i.valor + freteItem) * MIL) / i.quantidade);
  });

  const movimentos: Prisma.MovimentoEstoqueCreateWithoutEntradaInput[] = [];
  itens.forEach((i, idx) => {
    const p = i.produto;
    p.custo = custoMedioPonderado(p.saldo, p.custo, i.quantidade, custosEfetivos[idx]);
    p.saldo += i.quantidade;
    movimentos.push({
      produto: { connect: { id: p.id } },
      tipo: "ENTRADA",
      quantidade: i.quantidade,
      estoqueApos: p.saldo,
      custoUnitario: custosEfetivos[idx],
      motivo: `Nota ${numeroNota}`,
      usuario: { connect: { id: ctx.adminId } },
      criadoEm: momento,
    });
  });

  const entrada = await tx.entradaEstoque.create({
    data: {
      fornecedorId: ctx.fornecedorId[def.fornecedor],
      numeroNota: String(numeroNota),
      data: momento,
      valorTotal,
      frete: def.frete,
      usuarioId: ctx.adminId,
      criadoEm: momento,
      observacao: marcarDemo(def.frete > 0 ? "Frete rateado no custo dos itens." : null),
      itens: {
        create: itens.map((i) => ({
          produtoId: i.produto.id,
          quantidade: i.quantidade,
          custoUnitario: i.custoUnitario,
          validade: i.validade,
        })),
      },
      lotes: {
        create: itens
          .filter((i) => i.validade !== null)
          .map((i, idx) => ({
            produtoId: i.produto.id,
            codigo: `L${numeroNota}-${String(idx + 1).padStart(2, "0")}`,
            validade: i.validade as Date,
            quantidade: i.quantidade,
            custoUnitario: custosEfetivos[itens.indexOf(i)],
            criadoEm: momento,
          })),
      },
      movimentos: { create: movimentos },
    },
    include: { lotes: true },
  });

  for (const lote of entrada.lotes) {
    ctx.lotes.push({ id: lote.id, produtoId: lote.produtoId, validade: lote.validade, quantidade: lote.quantidade, quantidadeInicial: lote.quantidade });
  }

  if (def.conta) {
    const vencimento = dataLocal(somarDias(dia, def.conta.prazoDias), 23, 59, 59);
    const valorConta = valorTotal + def.frete;
    const nomeFornecedor = FORNECEDORES.find((f) => f.chave === def.fornecedor)?.nome ?? "";
    const paga = def.conta.tipo === "PAGA";
    const dataPagamento = paga ? dataLocal(somarDias(dia, def.conta.prazoDias - 1), 10, 15) : null;
    const conta = await tx.contaPagar.create({
      data: {
        descricao: `Boleto NF ${numeroNota} - ${nomeFornecedor}`,
        fornecedorId: ctx.fornecedorId[def.fornecedor],
        categoriaId: ctx.categoriaDespesaId.get("Fornecedores") ?? null,
        valor: valorConta,
        vencimento,
        status: paga ? "PAGA" : "PENDENTE",
        dataPagamento,
        valorPago: paga ? valorConta : null,
        formaPagamento: paga ? "PIX" : null,
        linhaDigitavel: `23793.38128 60000.${String(numeroNota).padStart(6, "0")} 00000.000000 1 ${String(9000 + numeroNota).padStart(5, "0")}${String(valorConta).padStart(10, "0")}`,
        entradaId: entrada.id,
        observacao: MARCA_DEMO,
        criadoEm: momento,
      },
    });
    if (paga && dataPagamento) {
      await tx.despesa.create({
        data: {
          descricao: conta.descricao,
          categoriaId: conta.categoriaId,
          fornecedorId: conta.fornecedorId,
          valor: valorConta,
          data: dataPagamento,
          formaPagamento: "PIX",
          pagoDoCaixa: false,
          contaPagarId: conta.id,
          observacao: MARCA_DEMO,
          usuarioId: ctx.adminId,
          criadoEm: dataPagamento,
        },
      });
      ctx.totais.despesas++;
    }
  }
  ctx.totais.entradas++;
}

// ---------------------------------------------------------------- lotes (FEFO)

interface ConsumoLote {
  lote: LoteMem;
  quantidade: number;
}

/**
 * Baixa FEFO igual ao contrato: lote com vencimento mais próximo sai primeiro
 * (inclusive vencido, como faz o PDV), quantidade do lote nunca fica negativa e,
 * se os lotes não cobrem, o restante sai só de Produto.estoque.
 */
function baixarLotesFefo(ctx: Contexto, produtoId: number, quantidade: number): ConsumoLote[] {
  const candidatos = ctx.lotes
    .filter((l) => l.produtoId === produtoId && l.quantidade > 0)
    .sort((a, b) => a.validade.getTime() - b.validade.getTime());
  const consumos: ConsumoLote[] = [];
  let restante = quantidade;
  for (const lote of candidatos) {
    if (restante <= 0) break;
    const baixa = Math.min(lote.quantidade, restante);
    lote.quantidade -= baixa;
    restante -= baixa;
    consumos.push({ lote, quantidade: baixa });
  }
  return consumos;
}

function estornarLotes(consumos: ConsumoLote[]): void {
  for (const c of consumos) c.lote.quantidade += c.quantidade;
}

// ---------------------------------------------------------------- vendas

interface ItemPlanejado {
  produto: ProdutoMem;
  quantidade: number; // milésimos
}

interface VendaPlanejada {
  momento: Date;
  itens: ItemPlanejado[];
  cancelar: boolean;
  clienteFiadoForcado: ClienteMem | null;
  /** Preenchido depois de gravar, pra o evento de cancelamento achar a venda. */
  gravada: {
    id: number;
    numero: number;
    consumos: ConsumoLote[][];
    quantidades: number[];
    /** Débito de fiado criado na venda; o cancelamento gera o ESTORNO correspondente. */
    fiado: { cliente: ClienteMem; valor: number } | null;
  } | null;
}

interface AcumuladorCaixa {
  dinheiro: number;
  suprimentos: number;
  sangrias: number;
  despesas: number;
  fiadoDinheiro: number;
}

interface Evento {
  momento: Date;
  ordem: number;
  executar: (tx: Tx) => Promise<void>;
}

function horaDeVenda(ctx: Contexto, dia: DiaLocal): Date {
  const horas = Object.keys(PESO_HORA).map(Number);
  const hora = ctx.rng.ponderado(horas, (h) => PESO_HORA[h]);
  const minuto = hora === 20 ? ctx.rng.inteiro(0, 30) : ctx.rng.inteiro(0, 59);
  return dataLocal(dia, hora, minuto, ctx.rng.inteiro(0, 59));
}

function quantidadeDeVenda(ctx: Contexto, def: DefProduto): number {
  if (def.unidade === "KG") {
    if (def.nome.startsWith("Frango Inteiro")) return ctx.rng.inteiro(300, 640) * 5; // 1,5 a 3,2 kg
    if (def.nome === "Alho") return ctx.rng.inteiro(20, 80) * 5; // 100 a 400 g
    return ctx.rng.inteiro(40, 500) * 5; // 200 g a 2,5 kg, em passos de 5 g
  }
  if (def.nome.startsWith("Cerveja")) return un(ctx.rng.ponderado([1, 2, 3, 6, 12], (q) => (q === 12 ? 2 : q === 6 ? 4 : 5)));
  return un(ctx.rng.ponderado([1, 2, 3, 4, 6], (q) => ({ 1: 60, 2: 24, 3: 9, 4: 4, 6: 3 })[q] ?? 1));
}

function escolherProdutos(ctx: Contexto, quantidade: number, filtro?: (p: ProdutoMem) => boolean): ItemPlanejado[] {
  const disponiveis = ctx.produtos.filter((p) => p.saldo > 0 && (!filtro || filtro(p)));
  const itens: ItemPlanejado[] = [];
  const usados = new Set<number>();
  let tentativas = 0;
  while (itens.length < quantidade && tentativas < quantidade * 4 && usados.size < disponiveis.length) {
    tentativas++;
    const p = ctx.rng.ponderado(disponiveis, (x) => x.def.pop);
    if (usados.has(p.id)) continue;
    let qtd = quantidadeDeVenda(ctx, p.def);
    if (qtd > p.saldo) qtd = p.def.unidade === "KG" ? Math.floor(p.saldo / 5) * 5 : Math.floor(p.saldo / MIL) * MIL;
    if (qtd <= 0) continue;
    usados.add(p.id);
    itens.push({ produto: p, quantidade: qtd });
  }
  return itens;
}

function planejarVendas(ctx: Contexto, dia: DiaLocal, deslocamento: number): VendaPlanejada[] {
  const semana = diaDaSemana(dia);
  let quantidade: number;
  let limite: Date | null = null;
  if (deslocamento === 0) {
    const inicio = dataLocal(dia, 8, 5).getTime();
    limite = new Date(ctx.agoraUtc.getTime() - 5 * 60_000);
    const horas = (limite.getTime() - inicio) / 3600_000;
    quantidade = horas <= 0 ? 0 : Math.min(25, Math.round(horas * 2.5));
  } else if (semana === 0) {
    quantidade = ctx.rng.inteiro(8, 12);
  } else if (semana === 6) {
    quantidade = ctx.rng.inteiro(18, 25);
  } else {
    quantidade = ctx.rng.inteiro(10, 20);
  }

  const nomeForcado = FIADO_ATRASADO_FORCADO[deslocamento];
  const clienteForcado = nomeForcado ? ctx.clientes.find((c) => c.def.nome === nomeForcado) ?? null : null;

  const vendas: VendaPlanejada[] = [];
  for (let i = 0; i < quantidade; i++) {
    let momento = horaDeVenda(ctx, dia);
    if (limite) {
      const inicio = dataLocal(dia, 8, 5).getTime();
      momento = new Date(inicio + Math.floor(ctx.rng.real() * (limite.getTime() - inicio)));
    }
    const totalItens = ctx.rng.ponderado([1, 2, 3, 4, 5, 6, 7, 8], (n) => [0, 20, 22, 18, 14, 10, 7, 5, 4][n]);
    const itens = escolherProdutos(ctx, totalItens);
    if (itens.length === 0) continue;
    vendas.push({ momento, itens, cancelar: ctx.rng.chance(0.03), clienteFiadoForcado: null, gravada: null });
  }
  vendas.sort((a, b) => a.momento.getTime() - b.momento.getTime());

  if (clienteForcado) {
    // Compra de mercearia entre 40% e 80% do limite do cliente, pra ficar devendo um valor que incomoda.
    const limite = clienteForcado.def.limite;
    const candidatos = escolherProdutos(ctx, 8, (p) => p.def.unidade === "UN" && p.def.preco <= 3000);
    const itens: ItemPlanejado[] = [];
    let total = 0;
    for (const item of candidatos) {
      const valor = totalLinha(item.quantidade, item.produto.def.preco);
      if (total + valor > limite * 0.8) continue;
      itens.push(item);
      total += valor;
      if (total >= limite * 0.4) break;
    }
    const alvo = vendas.find((v) => !v.cancelar) ?? vendas[0];
    if (itens.length && alvo) {
      alvo.itens = itens;
      alvo.cancelar = false;
      alvo.clienteFiadoForcado = clienteForcado;
    }
  }
  return vendas;
}

function escolherFormaPagamento(ctx: Contexto, venda: VendaPlanejada, total: number): { forma: FormaPagamento; cliente: ClienteMem | null } {
  if (venda.clienteFiadoForcado) return { forma: "FIADO", cliente: venda.clienteFiadoForcado };
  const r = ctx.rng.real();
  let forma: FormaPagamento;
  if (r < 0.6) forma = "DINHEIRO";
  else if (r < 0.8) forma = "PIX";
  else if (r < 0.92) forma = "DEBITO";
  else if (r < 0.98) forma = "CREDITO";
  else forma = "FIADO";
  // Uma parte das vendas canceladas é fiado, pra o extrato do cliente mostrar o ESTORNO.
  if (venda.cancelar && ctx.rng.chance(0.3)) forma = "FIADO";

  if (forma === "FIADO") {
    const aptos = ctx.clientes.filter(
      (c) => c.def.limite > 0 && !c.def.atrasado && c.saldoFiado + total <= c.def.limite,
    );
    if (aptos.length === 0) return { forma: "DINHEIRO", cliente: null };
    return { forma, cliente: ctx.rng.escolher(aptos) };
  }
  // De vez em quando o cliente pede CPF na nota mesmo pagando à vista.
  const cliente = ctx.rng.chance(0.08) ? ctx.rng.escolher(ctx.clientes) : null;
  return { forma, cliente };
}

/** Taxas de ConfiguracaoPagamento, usadas só quando o pagamento não passa em maquininha. */
const TAXA_POR_FORMA: Record<FormaPagamento, number> = { DINHEIRO: 0, PIX: 0, DEBITO: 199, CREDITO: 399, FIADO: 0 };

/** Sorteia a maquininha do cartão (70% InfinitePay / 30% Sipag). null se não houver maquininha. */
function escolherMaquininha(ctx: Contexto, forma: FormaPagamento): MaquininhaMem | null {
  if ((forma !== "DEBITO" && forma !== "CREDITO") || ctx.maquininhas.length === 0) return null;
  return ctx.rng.ponderado(ctx.maquininhas, (m) => m.def.peso);
}

async function gravarVenda(tx: Tx, ctx: Contexto, venda: VendaPlanejada, sessaoId: number, operadorId: number, caixa: AcumuladorCaixa): Promise<void> {
  const momento = venda.momento;
  const linhas = venda.itens.map((i) => {
    const p = i.produto;
    return {
      produto: p,
      quantidade: i.quantidade,
      precoUnitario: p.def.preco,
      custoUnitario: p.custo,
      total: totalLinha(i.quantidade, p.def.preco),
      custoTotal: totalLinha(i.quantidade, p.custo),
    };
  });
  const subtotal = linhas.reduce((acc, l) => acc + l.total, 0);
  let desconto = 0;
  if (subtotal > 2000 && ctx.rng.chance(0.05)) desconto = subtotal % 100; // arredonda pra baixo, no máximo R$ 0,99
  const total = subtotal - desconto;
  const custoTotal = linhas.reduce((acc, l) => acc + l.custoTotal, 0);

  const { forma, cliente } = escolherFormaPagamento(ctx, venda, total);
  const maquininha = escolherMaquininha(ctx, forma);
  const taxaPercentual = maquininha ? taxaMaquininhaDemo(maquininha.taxas, forma, 1) : TAXA_POR_FORMA[forma];
  const taxaValor = calcularTaxa(total, taxaPercentual, 0);
  const nsu = maquininha ? gerarNsu(ctx.rng) : null;
  let valorRecebido: number | null = null;
  let troco = 0;
  if (forma === "DINHEIRO") {
    valorRecebido = arredondarParaNota(total, ctx.rng);
    troco = valorRecebido - total;
  }

  // Baixa de estoque e de lotes (FEFO), na ordem dos itens.
  const consumos: ConsumoLote[][] = [];
  const movimentos: Prisma.MovimentoEstoqueUncheckedCreateWithoutVendaInput[] = [];
  const itensDb: Prisma.ItemVendaUncheckedCreateWithoutVendaInput[] = [];
  for (const l of linhas) {
    const p = l.produto;
    const baixas = p.def.vida !== undefined ? baixarLotesFefo(ctx, p.id, l.quantidade) : [];
    consumos.push(baixas);
    p.saldo -= l.quantidade;
    movimentos.push({
      produtoId: p.id,
      tipo: "VENDA",
      quantidade: -l.quantidade,
      estoqueApos: p.saldo,
      custoUnitario: l.custoUnitario,
      usuarioId: operadorId,
      criadoEm: momento,
    });
    itensDb.push({
      produtoId: p.id,
      descricao: p.def.nome,
      unidade: p.def.unidade,
      quantidade: l.quantidade,
      precoUnitario: l.precoUnitario,
      custoUnitario: l.custoUnitario,
      desconto: 0,
      total: l.total,
      loteId: baixas[0]?.lote.id ?? null,
    });
  }

  const numero = ++ctx.numeroVenda;
  const gravada = await tx.venda.create({
    data: {
      numero,
      status: "CONCLUIDA",
      sessaoId,
      usuarioId: operadorId,
      clienteId: cliente?.id ?? null,
      subtotal,
      desconto,
      total,
      custoTotal,
      taxasTotal: taxaValor,
      criadoEm: momento,
      itens: { create: itensDb },
      pagamentos: {
        create: [
          {
            forma,
            valor: total,
            valorRecebido,
            troco,
            parcelas: 1,
            taxaPercentual,
            taxaFixa: 0,
            taxaValor,
            maquininhaId: maquininha?.id ?? null,
            nsu,
            criadoEm: momento,
          },
        ],
      },
      movimentos: { create: movimentos },
      ...(forma === "FIADO" && cliente
        ? {
            lancamentosFiado: {
              create: [
                {
                  clienteId: cliente.id,
                  tipo: "DEBITO" as const,
                  valor: total,
                  usuarioId: operadorId,
                  criadoEm: momento,
                  observacao: `Compra fiado, cupom nº ${numero}`,
                },
              ],
            },
          }
        : {}),
    },
    select: { id: true },
  });

  if (forma === "FIADO" && cliente) cliente.saldoFiado += total;
  if (forma === "DINHEIRO" && !venda.cancelar) caixa.dinheiro += total;
  venda.gravada = {
    id: gravada.id,
    numero,
    consumos,
    quantidades: linhas.map((l) => l.quantidade),
    fiado: forma === "FIADO" && cliente ? { cliente, valor: total } : null,
  };
  ctx.totais.vendas++;
  ctx.totais.itens += linhas.length;
}

async function cancelarVenda(tx: Tx, ctx: Contexto, venda: VendaPlanejada, momento: Date, operadorId: number): Promise<void> {
  if (!venda.gravada) return;
  const movimentos: Prisma.MovimentoEstoqueUncheckedCreateWithoutVendaInput[] = [];
  venda.itens.forEach((item, idx) => {
    const p = item.produto;
    const qtd = venda.gravada!.quantidades[idx];
    estornarLotes(venda.gravada!.consumos[idx]);
    p.saldo += qtd;
    movimentos.push({
      produtoId: p.id,
      tipo: "CANCELAMENTO_VENDA",
      quantidade: qtd,
      estoqueApos: p.saldo,
      custoUnitario: p.custo,
      motivo: `Cancelamento do cupom nº ${venda.gravada!.numero}`,
      usuarioId: operadorId,
      criadoEm: momento,
    });
  });
  const motivo = ctx.rng.escolher(MOTIVOS_CANCELAMENTO);
  // Metade dos cancelamentos precisa do administrador liberar.
  const canceladaPorId = ctx.rng.chance(0.5) ? ctx.adminId : operadorId;
  // Venda fiado cancelada: ESTORNO do débito (nunca PAGAMENTO, não é dinheiro recebido).
  const fiado = venda.gravada.fiado;
  if (fiado) fiado.cliente.saldoFiado -= fiado.valor;
  await tx.venda.update({
    where: { id: venda.gravada.id },
    data: {
      status: "CANCELADA",
      canceladaEm: momento,
      motivoCancelamento: motivo,
      canceladaPorId,
      movimentos: { create: movimentos },
      ...(fiado
        ? {
            lancamentosFiado: {
              create: [
                {
                  clienteId: fiado.cliente.id,
                  tipo: "ESTORNO" as const,
                  valor: fiado.valor,
                  usuarioId: canceladaPorId,
                  criadoEm: momento,
                  observacao: `Cancelamento do cupom nº ${venda.gravada.numero}`,
                },
              ],
            },
          }
        : {}),
    },
  });
  await tx.auditoria.create({
    data: {
      usuarioId: canceladaPorId,
      acao: "venda.cancelar",
      entidade: "Venda",
      entidadeId: venda.gravada.id,
      detalhes: JSON.stringify({ numero: venda.gravada.numero, motivo }),
      criadoEm: momento,
    },
  });
  ctx.totais.canceladas++;
}

// ---------------------------------------------------------------- perdas

const OBSERVACAO_PERDA: Record<MotivoPerda, string[]> = {
  VENCIDO: ["Encontrado vencido na prateleira", "Retirado da gôndola na conferência de validade", "Vencido no fundo do freezer"],
  AVARIA: ["Embalagem rasgada no estoque", "Caixa amassada na entrega, produto vazou", "Lata estufada"],
  QUEBRA: ["Garrafa quebrou na reposição", "Caiu da prateleira", "Cliente derrubou no corredor"],
  FURTO: ["Furto identificado na câmera"],
  CONSUMO_INTERNO: ["Consumo dos funcionários"],
  OUTRO: ["Outro motivo"],
};

async function registrarPerda(tx: Tx, ctx: Contexto, motivoPedido: MotivoPerda, momento: Date): Promise<void> {
  let motivo = motivoPedido;
  let produto: ProdutoMem | null = null;
  let lote: LoteMem | null = null;
  let quantidade = 0;

  if (motivo === "VENCIDO") {
    const vencidos = ctx.lotes.filter((l) => l.quantidade > 0 && l.validade.getTime() < momento.getTime());
    const candidatos = vencidos.filter((l) => (ctx.produtos.find((p) => p.id === l.produtoId)?.saldo ?? 0) > 0);
    if (candidatos.length) {
      lote = ctx.rng.escolher(candidatos);
      produto = ctx.produtos.find((p) => p.id === lote!.produtoId) ?? null;
      if (produto) {
        const maximo = Math.min(lote.quantidade, produto.saldo);
        quantidade = produto.def.unidade === "UN" ? Math.min(maximo, un(ctx.rng.inteiro(1, 6))) : Math.min(maximo, ctx.rng.inteiro(60, 400) * 5);
        quantidade = produto.def.unidade === "UN" ? Math.floor(quantidade / MIL) * MIL : quantidade;
      }
    }
    if (!produto || quantidade <= 0) {
      motivo = "AVARIA";
      lote = null;
    }
  }
  if (!produto || quantidade <= 0) {
    const fragil = ["Óleo", "Vinagre", "Cachaça", "Suco", "Ovos", "Refrigerante", "Cerveja", "Água"];
    const filtro = (p: ProdutoMem) =>
      p.def.unidade === "UN" && p.saldo >= un(1) && (motivo !== "QUEBRA" || fragil.some((f) => p.def.nome.includes(f)));
    const candidatos = ctx.produtos.filter(filtro);
    produto = ctx.rng.escolher(candidatos.length ? candidatos : ctx.produtos.filter((p) => p.saldo >= un(1)));
    quantidade = Math.min(produto.saldo, un(ctx.rng.inteiro(1, motivo === "QUEBRA" ? 4 : 3)));
    quantidade = Math.floor(quantidade / MIL) * MIL;
    // Produto com validade: a perda sai do lote que vence primeiro, pra soma dos lotes nunca passar do estoque.
    if (produto.def.vida !== undefined) {
      const primeiro = ctx.lotes
        .filter((l) => l.produtoId === produto!.id && l.quantidade > 0)
        .sort((a, b) => a.validade.getTime() - b.validade.getTime())[0];
      if (primeiro) {
        lote = primeiro;
        quantidade = Math.min(quantidade, Math.floor(primeiro.quantidade / MIL) * MIL);
      }
    }
  }
  if (!produto || quantidade <= 0) return;

  if (lote) lote.quantidade -= quantidade;
  produto.saldo -= quantidade;
  const custoUnitario = produto.custo;
  const valorTotal = totalLinha(quantidade, custoUnitario);
  await tx.perda.create({
    data: {
      produtoId: produto.id,
      loteId: lote?.id ?? null,
      quantidade,
      custoUnitario,
      valorTotal,
      motivo,
      observacao: marcarDemo(ctx.rng.escolher(OBSERVACAO_PERDA[motivo])),
      data: momento,
      usuarioId: ctx.adminId,
      criadoEm: momento,
      movimento: {
        create: {
          produtoId: produto.id,
          tipo: "PERDA",
          quantidade: -quantidade,
          estoqueApos: produto.saldo,
          custoUnitario,
          motivo: motivo === "VENCIDO" ? "Produto vencido" : motivo === "AVARIA" ? "Avaria" : "Quebra",
          usuarioId: ctx.adminId,
          criadoEm: momento,
        },
      },
    },
  });
  ctx.totais.perdas++;
}

// ---------------------------------------------------------------- um dia de operação

async function processarDia(db: PrismaClient, ctx: Contexto, deslocamento: number): Promise<void> {
  const dia = somarDias(ctx.hoje, deslocamento);
  const temCaixa = deslocamento >= -DIAS_DE_VENDAS;
  const ehHoje = deslocamento === 0;
  const operador = ctx.operadores[Math.abs(deslocamento) % ctx.operadores.length];
  const entradasDoDia = ENTRADAS.filter((e) => e.dia === deslocamento);
  const indicePerda = DIAS_COM_PERDA.indexOf(deslocamento);
  if (!temCaixa && entradasDoDia.length === 0) return;

  await db.$transaction(
    async (tx) => {
      // Outro processo pode ter criado vendas enquanto o seed roda: nunca repetir número de cupom.
      ctx.numeroVenda = Math.max(ctx.numeroVenda, await maiorNumeroDeVenda(tx));
      const eventos: Evento[] = [];
      let ordem = 0;
      const agendar = (momento: Date, executar: (t: Tx) => Promise<void>) => eventos.push({ momento, ordem: ordem++, executar });

      for (const def of entradasDoDia) {
        const numeroNota = 4500 + ENTRADAS.indexOf(def) * 37 + ctx.rng.inteiro(0, 9);
        agendar(dataLocal(dia, def.hora), (t) => registrarEntrada(t, ctx, def, numeroNota));
      }

      if (indicePerda >= 0) {
        const momento = dataLocal(dia, ctx.rng.chance(0.5) ? 8 : 19, ctx.rng.inteiro(10, 50));
        agendar(momento, (t) => registrarPerda(t, ctx, MOTIVO_POR_PERDA[indicePerda], momento));
      }

      let sessaoId: number | null = null;
      const caixa: AcumuladorCaixa = { dinheiro: 0, suprimentos: 0, sangrias: 0, despesas: 0, fiadoDinheiro: 0 };
      let valorAbertura = 0;
      let abertoEm: Date | null = null;

      if (temCaixa) {
        if (ehHoje) {
          const outraAberta = await tx.sessaoCaixa.findFirst({ where: { status: "ABERTO" } });
          if (outraAberta) {
            console.warn(`  Aviso: já existe uma sessão de caixa aberta (id ${outraAberta.id}) que não é do seed. O PDV pode usar essa em vez da de hoje.`);
          }
        }
        valorAbertura = ctx.rng.chance(0.6) ? 20000 : 30000;
        abertoEm = ehHoje ? dataLocal(dia, 8, 0) : dataLocal(dia, HORA_ABERTURA.hora, HORA_ABERTURA.minuto, ctx.rng.inteiro(0, 59));
        // A marca na observação da abertura é o que identifica a sessão (e as vendas dela) como demo.
        const sessao = await tx.sessaoCaixa.create({
          data: { status: "ABERTO", usuarioAberturaId: operador.id, abertoEm, valorAbertura, observacao: MARCA_DEMO },
        });
        sessaoId = sessao.id;
        await tx.auditoria.createMany({
          data: [
            { usuarioId: operador.id, acao: "sessao.entrar", entidade: "Usuario", entidadeId: operador.id, criadoEm: new Date(abertoEm.getTime() - 90_000) },
            { usuarioId: operador.id, acao: "caixa.abrir", entidade: "SessaoCaixa", entidadeId: sessao.id, detalhes: JSON.stringify({ valorAbertura }), criadoEm: abertoEm },
          ],
        });

        const vendas = planejarVendas(ctx, dia, deslocamento);
        for (const venda of vendas) {
          agendar(venda.momento, (t) => gravarVenda(t, ctx, venda, sessao.id, operador.id, caixa));
          if (venda.cancelar) {
            const momentoCancelamento = new Date(venda.momento.getTime() + ctx.rng.inteiro(60, 240) * 1000);
            agendar(momentoCancelamento, (t) => cancelarVenda(t, ctx, venda, momentoCancelamento, operador.id));
          }
        }

        if (!ehHoje) {
          // Sangria às 15h quando o dinheiro acumulado até ali justifica.
          const corte = dataLocal(dia, 15, 0).getTime();
          const dinheiroAte15h = vendas
            .filter((v) => !v.cancelar && v.momento.getTime() < corte)
            .reduce((acc, v) => acc + v.itens.reduce((s, i) => s + totalLinha(i.quantidade, i.produto.def.preco), 0), 0) * 0.6;
          if (ctx.rng.chance(0.35) && valorAbertura + dinheiroAte15h >= 40000) {
            const valor = Math.max(10000, Math.floor(((valorAbertura + dinheiroAte15h) * 0.4) / 5000) * 5000);
            const momento = dataLocal(dia, 15, ctx.rng.inteiro(0, 20));
            agendar(momento, async (t) => {
              await t.movimentoCaixa.create({
                data: { sessaoId: sessao.id, tipo: "SANGRIA", valor, motivo: "Retirada pra depósito no banco", usuarioId: operador.id, criadoEm: momento },
              });
              caixa.sangrias += valor;
            });
          }
          if (ctx.rng.chance(0.08)) {
            const momento = dataLocal(dia, 12, ctx.rng.inteiro(0, 40));
            agendar(momento, async (t) => {
              await t.movimentoCaixa.create({
                data: { sessaoId: sessao.id, tipo: "SUPRIMENTO", valor: 10000, motivo: "Reforço de troco", usuarioId: ctx.adminId, criadoEm: momento },
              });
              caixa.suprimentos += 10000;
            });
          }
          if (ctx.rng.chance(0.2)) {
            const def = ctx.rng.escolher(DESPESAS_DO_CAIXA);
            const momento = dataLocal(dia, ctx.rng.inteiro(9, 17), ctx.rng.inteiro(0, 59));
            agendar(momento, async (t) => {
              await t.despesa.create({
                data: {
                  descricao: def.descricao,
                  categoriaId: ctx.categoriaDespesaId.get(def.categoria) ?? null,
                  valor: def.valor,
                  data: momento,
                  formaPagamento: "DINHEIRO",
                  pagoDoCaixa: true,
                  sessaoId: sessao.id,
                  observacao: MARCA_DEMO,
                  usuarioId: operador.id,
                  criadoEm: momento,
                },
              });
              caixa.despesas += def.valor;
              ctx.totais.despesas++;
            });
          }
          if (deslocamento >= -DIAS_DE_VENDAS + 1 && ctx.rng.chance(0.25)) {
            const momento = dataLocal(dia, ctx.rng.inteiro(10, 17), ctx.rng.inteiro(0, 59));
            agendar(momento, async (t) => {
              const devedores = ctx.clientes.filter((c) => c.saldoFiado > 0 && !c.def.atrasado);
              if (!devedores.length) return;
              const cliente = ctx.rng.escolher(devedores);
              const valor = cliente.saldoFiado <= 5000
                ? cliente.saldoFiado
                : Math.max(1000, Math.round((cliente.saldoFiado * (0.4 + ctx.rng.real() * 0.4)) / 100) * 100);
              const forma: FormaPagamento = ctx.rng.chance(0.5) ? "DINHEIRO" : "PIX";
              await t.lancamentoFiado.create({
                data: {
                  clienteId: cliente.id,
                  tipo: "PAGAMENTO",
                  valor,
                  formaPagamento: forma,
                  sessaoId: sessao.id,
                  usuarioId: operador.id,
                  observacao: valor >= cliente.saldoFiado ? "Quitou o fiado" : "Pagamento parcial do fiado",
                  criadoEm: momento,
                },
              });
              cliente.saldoFiado -= valor;
              if (forma === "DINHEIRO") caixa.fiadoDinheiro += valor;
            });
          }
        }
      }

      eventos.sort((a, b) => a.momento.getTime() - b.momento.getTime() || a.ordem - b.ordem);
      for (const evento of eventos) await evento.executar(tx);

      if (temCaixa && sessaoId !== null && !ehHoje) {
        const esperado = valorAbertura + caixa.dinheiro + caixa.suprimentos + caixa.fiadoDinheiro - caixa.sangrias - caixa.despesas;
        const diferenca = DIAS_COM_DIFERENCA[deslocamento] ?? 0;
        const contado = esperado + diferenca;
        const fechadoEm = dataLocal(dia, HORA_FECHAMENTO.hora, HORA_FECHAMENTO.minuto, ctx.rng.inteiro(0, 59));
        const usuarioFechamentoId = ctx.rng.chance(0.8) ? operador.id : ctx.adminId;
        // A nota da conferência vai em observacaoFechamento; observacao (abertura) guarda a marca demo.
        let observacaoFechamento: string | null = null;
        if (diferenca < 0) observacaoFechamento = "Faltou dinheiro na conferência. Conferir troco dado nas vendas da tarde.";
        if (diferenca > 0) observacaoFechamento = "Sobrou dinheiro na conferência. Provável troco a menos pra algum cliente.";
        await tx.sessaoCaixa.update({
          where: { id: sessaoId },
          data: {
            status: "FECHADO",
            usuarioFechamentoId,
            fechadoEm,
            valorFechamentoEsperado: esperado,
            valorFechamentoContado: contado,
            diferenca,
            observacaoFechamento,
          },
        });
        await tx.auditoria.create({
          data: {
            usuarioId: usuarioFechamentoId,
            acao: "caixa.fechar",
            entidade: "SessaoCaixa",
            entidadeId: sessaoId,
            detalhes: JSON.stringify({ esperado, contado, diferenca }),
            criadoEm: fechadoEm,
          },
        });
      }
      if (temCaixa) ctx.totais.sessoes++;
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

// ---------------------------------------------------------------- despesas fixas dos últimos meses

async function criarDespesasFixas(db: PrismaClient, ctx: Contexto): Promise<void> {
  const limiteInferior = dataLocal(somarDias(ctx.hoje, -65)).getTime();
  const dados: Prisma.DespesaCreateManyInput[] = [];
  for (let meses = 0; meses <= 2; meses++) {
    const base = new Date(Date.UTC(ctx.hoje.ano, ctx.hoje.mes - 1 - meses, 1));
    const ano = base.getUTCFullYear();
    const mes = base.getUTCMonth() + 1;
    for (const def of DESPESAS_FIXAS) {
      const dia: DiaLocal = { ano, mes, dia: def.diaDoMes };
      const data = dataLocal(dia, 10, ctx.rng.inteiro(0, 59));
      if (data.getTime() > ctx.agoraUtc.getTime() || data.getTime() < limiteInferior) continue;
      const fator = 1 + (ctx.rng.real() - 0.5) * 2 * def.variacao;
      dados.push({
        descricao: def.descricao,
        categoriaId: ctx.categoriaDespesaId.get(def.categoria) ?? null,
        valor: Math.round((def.valor * fator) / 100) * 100,
        data,
        formaPagamento: def.forma,
        pagoDoCaixa: false,
        observacao: MARCA_DEMO,
        usuarioId: ctx.adminId,
        criadoEm: data,
      });
    }
  }
  await db.despesa.createMany({ data: dados });
  ctx.totais.despesas += dados.length;
}

// ---------------------------------------------------------------- fechamento: saldos finais

async function gravarSaldosFinais(db: PrismaClient, ctx: Contexto): Promise<void> {
  await db.$transaction(
    async (tx) => {
      for (const p of ctx.produtos) {
        await tx.produto.update({ where: { id: p.id }, data: { estoque: p.saldo, precoCusto: p.custo } });
      }
      for (const l of ctx.lotes) {
        if (l.quantidade !== l.quantidadeInicial) {
          await tx.lote.update({ where: { id: l.id }, data: { quantidade: l.quantidade } });
        }
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

function resumo(ctx: Contexto): void {
  const agora = ctx.agoraUtc.getTime();
  const dia = 86_400_000;
  const lotesComSaldo = ctx.lotes.filter((l) => l.quantidade > 0);
  const vencidos = lotesComSaldo.filter((l) => l.validade.getTime() < agora).length;
  const vencendo = lotesComSaldo.filter((l) => l.validade.getTime() >= agora && l.validade.getTime() <= agora + 10 * dia).length;
  const longos = lotesComSaldo.filter((l) => l.validade.getTime() > agora + 30 * dia).length;
  const abaixoDoMinimo = ctx.produtos.filter((p) => p.saldo <= p.def.minimo).length;
  const negativos = ctx.produtos.filter((p) => p.saldo < 0).length;
  const fiadoAberto = ctx.clientes.filter((c) => c.saldoFiado > 0).length;

  console.log("");
  console.log("Seed de demonstração concluído.");
  console.log(`  Produtos: ${ctx.produtos.length} (${abaixoDoMinimo} no mínimo ou abaixo, ${negativos} negativos)`);
  console.log(`  Notas de entrada: ${ctx.totais.entradas} | Lotes: ${ctx.lotes.length} (vencidos ${vencidos}, vencendo em até 10 dias ${vencendo}, acima de 30 dias ${longos})`);
  console.log(`  Sessões de caixa: ${ctx.totais.sessoes} (a de hoje continua aberta)`);
  console.log(`  Vendas: ${ctx.totais.vendas} (${ctx.totais.canceladas} canceladas) com ${ctx.totais.itens} itens`);
  console.log(`  Perdas: ${ctx.totais.perdas} | Despesas: ${ctx.totais.despesas} | Clientes com fiado em aberto: ${fiadoAberto}`);
  console.log(`  Maquininhas: ${ctx.maquininhas.map((m) => m.def.nome).join(", ")} (cartões 70% na primeira, 30% na segunda)`);
  console.log("  Operadores: Maria (caixa) PIN 1111, João (caixa) PIN 2222. Administrador PIN 1234.");
}

// ================================================================ principal

export async function executarSeedDemo(db: PrismaClient): Promise<void> {
  const totalProdutos = await db.produto.count();
  if (totalProdutos > 20) {
    console.log(`O banco já tem ${totalProdutos} produtos. O seed de demonstração só roda em banco vazio. Nada foi alterado.`);
    return;
  }
  const categorias = await db.categoria.count();
  if (categorias === 0) throw new Error("Categorias não encontradas. Rode npm run db:seed antes.");

  const rng = new Aleatorio(SEMENTE);
  const agoraUtc = new Date();
  const hoje = diaLocalDe(agoraUtc);

  console.log(`Gerando dados de demonstração até ${String(hoje.dia).padStart(2, "0")}/${String(hoje.mes).padStart(2, "0")}/${hoje.ano}...`);

  const { adminId, operadores } = await garantirUsuarios(db);
  await gravarConfiguracao(db, rng);
  const maquininhas = await garantirMaquininhas(db);
  const fornecedorId = await criarFornecedores(db, rng);
  const clientes = await criarClientes(db, rng, hoje);
  const produtos = await criarProdutos(db, rng);
  const categoriasDespesa = await db.categoriaDespesa.findMany();

  const ctx: Contexto = {
    rng,
    hoje,
    agoraUtc,
    adminId,
    operadores,
    fornecedorId,
    categoriaDespesaId: new Map(categoriasDespesa.map((c) => [c.nome, c.id])),
    produtos,
    lotes: [],
    clientes,
    maquininhas,
    numeroVenda: await maiorNumeroDeVenda(db),
    totais: { vendas: 0, canceladas: 0, itens: 0, entradas: 0, perdas: 0, sessoes: 0, despesas: 0 },
  };

  for (let deslocamento = -DIAS_DE_ENTRADAS; deslocamento <= 0; deslocamento++) {
    await processarDia(db, ctx, deslocamento);
    if (deslocamento % 10 === 0) console.log(`  ... dia ${deslocamento} processado (${ctx.totais.vendas} vendas até aqui)`);
  }

  await criarDespesasFixas(db, ctx);
  await gravarSaldosFinais(db, ctx);
  resumo(ctx);
}

// ================================================================ limpeza

/** "observação nula ou sem a marca demo". Só NOT excluiria os nulos no SQL. */
const OBSERVACAO_SEM_MARCA = { OR: [{ observacao: null }, { NOT: { observacao: COM_MARCA_DEMO } }] };

interface Conflito {
  descricao: string;
  quantidade: number;
}

interface IdsDemo {
  produtos: number[];
  clientes: number[];
  fornecedores: number[];
  sessoes: number[];
  vendas: number[];
  entradas: number[];
  contas: number[];
}

/**
 * Conta registros reais (sem a marca) que apontam pra cadastros de demonstração.
 * Se houver qualquer um, o banco já está em uso de verdade em cima da demo e a
 * limpeza não pode apagar nem mutilar nada: aborta inteira.
 */
async function contarConflitosDemo(db: PrismaClient, ids: IdsDemo): Promise<Conflito[]> {
  const vendas = await db.venda.count({
    where: {
      OR: [{ sessaoId: null }, { sessaoId: { notIn: ids.sessoes } }],
      AND: [{ OR: [{ itens: { some: { produtoId: { in: ids.produtos } } } }, { clienteId: { in: ids.clientes } }] }],
    },
  });
  const entradas = await db.entradaEstoque.count({
    where: {
      id: { notIn: ids.entradas },
      OR: [{ itens: { some: { produtoId: { in: ids.produtos } } } }, { fornecedorId: { in: ids.fornecedores } }],
    },
  });
  const perdas = await db.perda.count({ where: { produtoId: { in: ids.produtos }, ...OBSERVACAO_SEM_MARCA } });
  const movimentos = await db.movimentoEstoque.count({
    where: {
      produtoId: { in: ids.produtos },
      AND: [
        { OR: [{ vendaId: null }, { vendaId: { notIn: ids.vendas } }] },
        { OR: [{ entradaId: null }, { entradaId: { notIn: ids.entradas } }] },
        { OR: [{ perdaId: null }, { perda: OBSERVACAO_SEM_MARCA }] },
      ],
    },
  });
  const fiado = await db.lancamentoFiado.count({
    where: {
      clienteId: { in: ids.clientes },
      AND: [{ OR: [{ vendaId: null }, { vendaId: { notIn: ids.vendas } }] }, { OR: [{ sessaoId: null }, { sessaoId: { notIn: ids.sessoes } }] }],
    },
  });
  const contasEDespesas =
    (await db.contaPagar.count({ where: { id: { notIn: ids.contas }, fornecedorId: { in: ids.fornecedores } } })) +
    (await db.despesa.count({ where: { fornecedorId: { in: ids.fornecedores }, ...OBSERVACAO_SEM_MARCA } }));

  const conflitos: Conflito[] = [
    { descricao: "vendas fora da demonstração com produto ou cliente de demonstração", quantidade: vendas },
    { descricao: "notas de entrada fora da demonstração com produto ou fornecedor de demonstração", quantidade: entradas },
    { descricao: "perdas fora da demonstração em produto de demonstração", quantidade: perdas },
    { descricao: "ajustes ou outros movimentos de estoque fora da demonstração em produto de demonstração", quantidade: movimentos },
    { descricao: "lançamentos de fiado fora da demonstração em cliente de demonstração", quantidade: fiado },
    { descricao: "contas a pagar ou despesas fora da demonstração de fornecedor de demonstração", quantidade: contasEDespesas },
  ];
  return conflitos.filter((c) => c.quantidade > 0);
}

/**
 * Remove só o que este seed criou, identificado pela marca "[demo]" gravada na
 * observação/descrição (produtos, fornecedores, clientes, sessões de caixa,
 * entradas, contas, despesas, perdas) e pelo vínculo com esses registros
 * (vendas das sessões demo, itens, pagamentos, lotes, movimentos, fiado,
 * auditoria). Nunca identifica nada por nome. Mantém o administrador, os
 * operadores, as categorias, as formas de pagamento, as maquininhas e a
 * configuração. Se houver registro real apontando pra cadastro demo, aborta
 * sem apagar nada.
 * Rodar: npm run db:seed:demo -- --limpar
 */
export async function limparDadosDemo(db: PrismaClient): Promise<void> {
  const ids = async <T extends { id: number }>(linhas: Promise<T[]>) => (await linhas).map((l) => l.id);
  const idsOperadores = await idsOperadoresDemo(db);
  const idsProdutos = await ids(db.produto.findMany({ where: { descricao: COM_MARCA_DEMO }, select: { id: true } }));
  const idsFornecedores = await ids(db.fornecedor.findMany({ where: { observacao: COM_MARCA_DEMO }, select: { id: true } }));
  const idsClientes = await ids(db.cliente.findMany({ where: { observacao: COM_MARCA_DEMO }, select: { id: true } }));
  const idsSessoes = await ids(db.sessaoCaixa.findMany({ where: { observacao: COM_MARCA_DEMO }, select: { id: true } }));
  const idsVendas = await ids(db.venda.findMany({ where: { sessaoId: { in: idsSessoes } }, select: { id: true } }));
  const idsEntradas = await ids(db.entradaEstoque.findMany({ where: { observacao: COM_MARCA_DEMO }, select: { id: true } }));
  const idsContas = await ids(
    db.contaPagar.findMany({ where: { OR: [{ observacao: COM_MARCA_DEMO }, { entradaId: { in: idsEntradas } }] }, select: { id: true } }),
  );

  const total = idsProdutos.length + idsFornecedores.length + idsClientes.length + idsSessoes.length + idsEntradas.length + idsContas.length;
  if (total === 0) {
    console.log(
      `Nenhum dado com a marca ${MARCA_DEMO} encontrado. Nada foi alterado. ` +
        "Banco gerado por versão antiga do seed (sem a marca) não é limpo: apague o arquivo do banco e recrie com prisma migrate reset.",
    );
    return;
  }

  const conflitos = await contarConflitosDemo(db, {
    produtos: idsProdutos,
    clientes: idsClientes,
    fornecedores: idsFornecedores,
    sessoes: idsSessoes,
    vendas: idsVendas,
    entradas: idsEntradas,
    contas: idsContas,
  });
  if (conflitos.length > 0) {
    console.error("Limpeza cancelada: o banco tem registros reais em cima dos dados de demonstração. Nada foi alterado.");
    for (const c of conflitos) console.error(`  - ${c.quantidade} ${c.descricao}`);
    console.error("Se este banco já é o do mercado, não use --limpar. Se é só de teste, apague o arquivo do banco e recrie com prisma migrate reset.");
    throw new Error("Limpeza de demonstração cancelada por conflito com dados reais.");
  }

  await db.$transaction([
    db.auditoria.deleteMany({
      where: {
        OR: [
          { entidade: "Venda", entidadeId: { in: idsVendas } },
          { entidade: "SessaoCaixa", entidadeId: { in: idsSessoes } },
          { acao: "sessao.entrar", usuarioId: { in: idsOperadores } },
        ],
      },
    }),
    db.lancamentoFiado.deleteMany({
      where: { OR: [{ clienteId: { in: idsClientes } }, { sessaoId: { in: idsSessoes } }, { vendaId: { in: idsVendas } }] },
    }),
    db.despesa.deleteMany({
      where: { OR: [{ observacao: COM_MARCA_DEMO }, { sessaoId: { in: idsSessoes } }, { contaPagarId: { in: idsContas } }] },
    }),
    db.contaPagar.deleteMany({ where: { id: { in: idsContas } } }),
    db.movimentoEstoque.deleteMany({
      where: { OR: [{ produtoId: { in: idsProdutos } }, { vendaId: { in: idsVendas } }, { entradaId: { in: idsEntradas } }] },
    }),
    db.perda.deleteMany({ where: { OR: [{ produtoId: { in: idsProdutos } }, { observacao: COM_MARCA_DEMO }] } }),
    db.itemVenda.deleteMany({ where: { vendaId: { in: idsVendas } } }),
    db.pagamento.deleteMany({ where: { vendaId: { in: idsVendas } } }),
    db.venda.deleteMany({ where: { id: { in: idsVendas } } }),
    db.movimentoCaixa.deleteMany({ where: { sessaoId: { in: idsSessoes } } }),
    db.sessaoCaixa.deleteMany({ where: { id: { in: idsSessoes } } }),
    db.lote.deleteMany({ where: { OR: [{ produtoId: { in: idsProdutos } }, { entradaId: { in: idsEntradas } }] } }),
    db.itemEntrada.deleteMany({ where: { entradaId: { in: idsEntradas } } }),
    db.entradaEstoque.deleteMany({ where: { id: { in: idsEntradas } } }),
    db.historicoPreco.deleteMany({ where: { produtoId: { in: idsProdutos } } }),
    db.produto.deleteMany({ where: { id: { in: idsProdutos } } }),
    db.cliente.deleteMany({ where: { id: { in: idsClientes } } }),
    db.fornecedor.deleteMany({ where: { id: { in: idsFornecedores } } }),
  ]);
  console.log(
    `Dados de demonstração removidos: ${idsVendas.length} vendas, ${idsSessoes.length} sessões, ${idsEntradas.length} entradas, ${idsProdutos.length} produtos, ${idsClientes.length} clientes, ${idsFornecedores.length} fornecedores.`,
  );
}

// ================================================================ maquininhas em banco já populado

/**
 * Pra um banco de demonstração que já existia antes das maquininhas: cria as
 * duas (se faltarem) e atribui uma a cada pagamento DEBITO/CREDITO ainda sem
 * maquininha, na proporção 70/30, com NSU fictício e taxa recalculada pela
 * tabela da maquininha. Venda.taxasTotal é refeito somando os pagamentos.
 * Só toca em pagamentos de vendas dos operadores de demonstração: vendas de
 * outros usuários nunca ganham NSU inventado nem taxa trocada.
 * Rodar: npm run db:seed:demo -- --maquininhas
 */
export async function atribuirMaquininhasDemo(db: PrismaClient): Promise<void> {
  const idsOperadores = await idsOperadoresDemo(db);
  if (idsOperadores.length === 0) {
    console.log("Nenhum operador de demonstração no banco: este banco não recebeu o seed demo. Nada foi alterado.");
    return;
  }
  const maquininhas = await garantirMaquininhas(db);
  const rng = new Aleatorio(SEMENTE + 1);
  const pendentes = await db.pagamento.findMany({
    where: { forma: { in: ["DEBITO", "CREDITO"] }, maquininhaId: null, venda: { usuarioId: { in: idsOperadores } } },
    select: { id: true, vendaId: true, forma: true, parcelas: true, valor: true },
    orderBy: { id: "asc" },
  });
  if (pendentes.length === 0) {
    console.log("Todos os pagamentos em cartão das vendas de demonstração já têm maquininha. Nada a fazer.");
    return;
  }
  const vendasTocadas = new Set<number>();
  const porMaquininha = new Map<number, number>();
  for (let i = 0; i < pendentes.length; i += 200) {
    const lote = pendentes.slice(i, i + 200);
    await db.$transaction(
      lote.map((p) => {
        const m = rng.ponderado(maquininhas, (x) => x.def.peso);
        const taxaPercentual = taxaMaquininhaDemo(m.taxas, p.forma, p.parcelas);
        vendasTocadas.add(p.vendaId);
        porMaquininha.set(m.id, (porMaquininha.get(m.id) ?? 0) + 1);
        return db.pagamento.update({
          where: { id: p.id },
          data: {
            maquininhaId: m.id,
            nsu: gerarNsu(rng),
            taxaPercentual,
            taxaFixa: 0,
            taxaValor: calcularTaxa(p.valor, taxaPercentual, 0),
          },
        });
      }),
    );
  }
  // Refaz Venda.taxasTotal como a soma das taxas dos pagamentos.
  const ids = [...vendasTocadas];
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const somas = await db.pagamento.groupBy({ by: ["vendaId"], where: { vendaId: { in: lote } }, _sum: { taxaValor: true } });
    await db.$transaction(
      somas.map((s) => db.venda.update({ where: { id: s.vendaId }, data: { taxasTotal: s._sum.taxaValor ?? 0 } })),
    );
  }
  const resumoTexto = maquininhas.map((m) => `${m.def.nome}: ${porMaquininha.get(m.id) ?? 0}`).join(", ");
  console.log(`Maquininhas atribuídas a ${pendentes.length} pagamentos em cartão (${resumoTexto}); taxasTotal refeito em ${ids.length} vendas.`);
}

// ================================================================ linha de comando

const ehExecucaoDireta = /seed-demo\.(ts|js|mjs|cjs)$/i.test(process.argv[1] ?? "");

if (ehExecucaoDireta) {
  if (!seedDemoLiberado()) {
    console.error(
      `Seed de demonstração bloqueado: este comando cria e apaga dados fictícios e nunca deve rodar no banco do mercado.\n` +
        `Se este é um banco só de teste, rode com ${VARIAVEL_LIBERACAO}=1 (no .env ou no terminal antes do comando).\n` +
        "Nada foi alterado.",
    );
    process.exit(1);
  }
  const db = new PrismaClient();
  const limpar = process.argv.includes("--limpar");
  const recriar = process.argv.includes("--recriar");
  const soMaquininhas = process.argv.includes("--maquininhas");
  const rodar = async () => {
    if (soMaquininhas) {
      await atribuirMaquininhasDemo(db);
      return;
    }
    if (limpar || recriar) await limparDadosDemo(db);
    if (!limpar || recriar) await executarSeedDemo(db);
  };
  rodar()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
