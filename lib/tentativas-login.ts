// Controle de tentativas de login por PIN. Funções puras, sem banco e sem Next:
// tudo fica em memória porque o sistema roda num único processo Node no PC do
// mercado. Teste em tests/login.test.ts.
//
// Regra: depois de `limiteLivre` erros seguidos, cada novo erro impõe uma
// espera que dobra (30 s, 1 min, 2 min...) até o teto de 15 min. Acertar o PIN
// zera o contador; ficar 1 h sem errar também zera. A espera é progressiva, e
// não um bloqueio definitivo, pra um script no PC não deixar o dono trancado.

export type OpcoesLimitador = {
  /** Quantos erros seguidos passam sem espera. */
  limiteLivre: number;
  /** Espera imposta no primeiro erro depois do limite. */
  esperaInicialMs: number;
  /** Teto da espera (a espera dobra a cada erro até chegar aqui). */
  esperaMaximaMs: number;
  /** Tempo sem erros que zera o contador. Precisa ser maior que a espera máxima. */
  janelaResetMs: number;
};

type Estado = { falhas: number; ultimaFalha: number; bloqueadoAte: number };

const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;

export const OPCOES_POR_USUARIO: OpcoesLimitador = {
  limiteLivre: 5,
  esperaInicialMs: 30 * SEGUNDO,
  esperaMaximaMs: 15 * MINUTO,
  janelaResetMs: 60 * MINUTO,
};

/** Limite geral do PC, pra quem alterna entre usuários (ou omite o usuário) não escapar do limite por usuário. */
export const OPCOES_GERAL: OpcoesLimitador = {
  limiteLivre: 10,
  esperaInicialMs: 30 * SEGUNDO,
  esperaMaximaMs: 15 * MINUTO,
  janelaResetMs: 60 * MINUTO,
};

export const CHAVE_GERAL = "geral";

/** Chave do limitador por usuário. Sem usuário escolhido, o PIN é testado contra todos, então vira uma chave própria. */
export function chaveUsuario(usuarioId: number | undefined): string {
  return usuarioId ? `usuario:${usuarioId}` : "usuario:todos";
}

export class LimitadorTentativas {
  private estados = new Map<string, Estado>();

  constructor(private readonly opcoes: OpcoesLimitador) {}

  /** Milissegundos que ainda faltam de espera pra essa chave (0 = pode tentar). */
  bloqueioRestante(chave: string, agora = Date.now()): number {
    const estado = this.estados.get(chave);
    if (!estado) return 0;
    if (agora - estado.ultimaFalha > this.opcoes.janelaResetMs) {
      this.estados.delete(chave);
      return 0;
    }
    return Math.max(0, estado.bloqueadoAte - agora);
  }

  /** Registra um erro. Devolve o total de erros seguidos e por quantos ms a chave fica em espera (0 = ainda livre). */
  registrarFalha(chave: string, agora = Date.now()): { falhas: number; bloqueioMs: number } {
    const anterior = this.estados.get(chave);
    const continua = anterior !== undefined && agora - anterior.ultimaFalha <= this.opcoes.janelaResetMs;
    const falhas = continua ? anterior.falhas + 1 : 1;
    const excedente = falhas - this.opcoes.limiteLivre;
    const bloqueioMs =
      excedente < 0 ? 0 : Math.min(this.opcoes.esperaInicialMs * 2 ** excedente, this.opcoes.esperaMaximaMs);
    this.estados.set(chave, { falhas, ultimaFalha: agora, bloqueadoAte: agora + bloqueioMs });
    if (this.estados.size > 200) this.limpar(agora);
    return { falhas, bloqueioMs };
  }

  /** Acertou o PIN: esquece os erros dessa chave. */
  zerar(chave: string): void {
    this.estados.delete(chave);
  }

  /** Quantidade de chaves em memória (pra teste e diagnóstico). */
  get tamanho(): number {
    return this.estados.size;
  }

  /** Remove chaves que já passaram da janela de reset, pra memória não crescer sem limite. */
  limpar(agora = Date.now()): void {
    for (const [chave, estado] of this.estados) {
      if (agora - estado.ultimaFalha > this.opcoes.janelaResetMs) this.estados.delete(chave);
    }
  }
}

/** "30 segundos", "1 minuto", "2 minutos" (sempre arredonda pra cima). */
export function formatarEspera(ms: number): string {
  if (ms < MINUTO) {
    const s = Math.max(1, Math.ceil(ms / SEGUNDO));
    return `${s} segundo${s === 1 ? "" : "s"}`;
  }
  const m = Math.ceil(ms / MINUTO);
  return `${m} minuto${m === 1 ? "" : "s"}`;
}

export function mensagemEspera(ms: number): string {
  return `Muitas tentativas erradas. Aguarde ${formatarEspera(ms)} e tente de novo.`;
}

/** Id de usuário vindo do formulário: só inteiro positivo dentro do Int do banco; qualquer outra coisa vira "sem usuário". */
export function normalizarUsuarioId(valor: number | null | undefined): number | undefined {
  if (valor === null || valor === undefined) return undefined;
  if (!Number.isInteger(valor) || valor <= 0 || valor > 2147483647) return undefined;
  return valor;
}
