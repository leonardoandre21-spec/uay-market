import { describe, expect, it } from "vitest";
import {
  chaveUsuario,
  formatarEspera,
  LimitadorTentativas,
  mensagemEspera,
  normalizarUsuarioId,
  OPCOES_GERAL,
  OPCOES_POR_USUARIO,
  type OpcoesLimitador,
} from "@/lib/tentativas-login";

const SEG = 1000;
const MIN = 60 * SEG;

const OPCOES: OpcoesLimitador = {
  limiteLivre: 5,
  esperaInicialMs: 30 * SEG,
  esperaMaximaMs: 15 * MIN,
  janelaResetMs: 60 * MIN,
};

describe("LimitadorTentativas (espera progressiva no login)", () => {
  it("deixa passar os primeiros erros sem espera", () => {
    const l = new LimitadorTentativas(OPCOES);
    const t0 = 1_000_000;
    for (let i = 1; i <= 4; i++) {
      expect(l.bloqueioRestante("usuario:1", t0 + i)).toBe(0);
      expect(l.registrarFalha("usuario:1", t0 + i)).toEqual({ falhas: i, bloqueioMs: 0 });
    }
    expect(l.bloqueioRestante("usuario:1", t0 + 5)).toBe(0);
  });

  it("no quinto erro impõe 30 s e dobra a cada erro até 15 min", () => {
    const l = new LimitadorTentativas(OPCOES);
    let t = 1_000_000;
    for (let i = 1; i <= 4; i++) l.registrarFalha("usuario:1", t++);
    expect(l.registrarFalha("usuario:1", t).bloqueioMs).toBe(30 * SEG);
    expect(l.bloqueioRestante("usuario:1", t)).toBe(30 * SEG);
    expect(l.bloqueioRestante("usuario:1", t + 10 * SEG)).toBe(20 * SEG);
    expect(l.bloqueioRestante("usuario:1", t + 30 * SEG)).toBe(0);

    t += 30 * SEG;
    expect(l.registrarFalha("usuario:1", t).bloqueioMs).toBe(60 * SEG);
    t += 60 * SEG;
    expect(l.registrarFalha("usuario:1", t).bloqueioMs).toBe(120 * SEG);
    t += 120 * SEG;
    expect(l.registrarFalha("usuario:1", t).bloqueioMs).toBe(240 * SEG);
    t += 240 * SEG;
    expect(l.registrarFalha("usuario:1", t).bloqueioMs).toBe(480 * SEG);
    t += 480 * SEG;
    expect(l.registrarFalha("usuario:1", t).bloqueioMs).toBe(15 * MIN);
    t += 15 * MIN;
    // Continua no teto, nunca passa dele.
    expect(l.registrarFalha("usuario:1", t).bloqueioMs).toBe(15 * MIN);
  });

  it("força bruta de 4 dígitos fica inviável: 10 mil tentativas levam dias, não minutos", () => {
    const l = new LimitadorTentativas(OPCOES);
    let t = 0;
    let tentativas = 0;
    // Script que sempre tenta assim que a espera acaba.
    while (tentativas < 10_000) {
      const espera = l.bloqueioRestante("usuario:1", t);
      if (espera > 0) {
        t += espera;
        continue;
      }
      l.registrarFalha("usuario:1", t);
      tentativas++;
    }
    const dias = t / (24 * 60 * MIN);
    expect(dias).toBeGreaterThan(100);
  });

  it("chaves são independentes: erro num usuário não bloqueia outro", () => {
    const l = new LimitadorTentativas(OPCOES);
    for (let i = 0; i < 6; i++) l.registrarFalha("usuario:1", 1000 + i);
    expect(l.bloqueioRestante("usuario:1", 1010)).toBeGreaterThan(0);
    expect(l.bloqueioRestante("usuario:2", 1010)).toBe(0);
    expect(l.bloqueioRestante("usuario:todos", 1010)).toBe(0);
  });

  it("acertar o PIN zera o contador da chave", () => {
    const l = new LimitadorTentativas(OPCOES);
    for (let i = 0; i < 6; i++) l.registrarFalha("usuario:1", 1000 + i);
    expect(l.bloqueioRestante("usuario:1", 1010)).toBeGreaterThan(0);
    l.zerar("usuario:1");
    expect(l.bloqueioRestante("usuario:1", 1010)).toBe(0);
    expect(l.registrarFalha("usuario:1", 1011)).toEqual({ falhas: 1, bloqueioMs: 0 });
  });

  it("uma hora sem errar zera o contador, mas a espera máxima não é esquecida antes de acabar", () => {
    const l = new LimitadorTentativas(OPCOES);
    let t = 1_000_000;
    for (let i = 0; i < 10; i++) {
      l.registrarFalha("usuario:1", t);
      t += 1;
    }
    // Está no teto (15 min): ainda bloqueado aos 14 min.
    expect(l.bloqueioRestante("usuario:1", t + 14 * MIN)).toBeGreaterThan(0);
    expect(l.bloqueioRestante("usuario:1", t + 15 * MIN)).toBe(0);
    // Passou a janela de 1 h sem erro: volta a contar do 1.
    expect(l.registrarFalha("usuario:1", t + 61 * MIN)).toEqual({ falhas: 1, bloqueioMs: 0 });
  });

  it("limpa chaves antigas pra memória não crescer sem limite", () => {
    const l = new LimitadorTentativas(OPCOES);
    for (let i = 0; i < 300; i++) l.registrarFalha(`usuario:${i}`, 1000);
    // Ao passar de 200 chaves, a limpeza roda, mas nenhuma expirou ainda.
    expect(l.tamanho).toBe(300);
    l.registrarFalha("usuario:novo", 1000 + 61 * MIN);
    expect(l.tamanho).toBe(1);
  });

  it("opções de produção têm janela de reset maior que a espera máxima", () => {
    for (const o of [OPCOES_POR_USUARIO, OPCOES_GERAL]) {
      expect(o.janelaResetMs).toBeGreaterThan(o.esperaMaximaMs);
      expect(o.limiteLivre).toBeGreaterThanOrEqual(5);
    }
    expect(OPCOES_GERAL.limiteLivre).toBeGreaterThan(OPCOES_POR_USUARIO.limiteLivre);
  });
});

describe("chaveUsuario", () => {
  it("separa por usuário e trata PIN sem usuário como chave própria", () => {
    expect(chaveUsuario(1)).toBe("usuario:1");
    expect(chaveUsuario(42)).toBe("usuario:42");
    expect(chaveUsuario(undefined)).toBe("usuario:todos");
  });
});

describe("normalizarUsuarioId", () => {
  it("aceita só inteiro positivo dentro do Int do banco", () => {
    expect(normalizarUsuarioId(1)).toBe(1);
    expect(normalizarUsuarioId(2147483647)).toBe(2147483647);
    expect(normalizarUsuarioId(null)).toBeUndefined();
    expect(normalizarUsuarioId(undefined)).toBeUndefined();
    expect(normalizarUsuarioId(0)).toBeUndefined();
    expect(normalizarUsuarioId(-5)).toBeUndefined();
    expect(normalizarUsuarioId(2147483648)).toBeUndefined();
    expect(normalizarUsuarioId(1.5)).toBeUndefined();
  });
});

describe("formatarEspera / mensagemEspera", () => {
  it("arredonda pra cima e concorda em número", () => {
    expect(formatarEspera(500)).toBe("1 segundo");
    expect(formatarEspera(30 * SEG)).toBe("30 segundos");
    expect(formatarEspera(59 * SEG + 1)).toBe("60 segundos");
    expect(formatarEspera(60 * SEG)).toBe("1 minuto");
    expect(formatarEspera(61 * SEG)).toBe("2 minutos");
    expect(formatarEspera(15 * MIN)).toBe("15 minutos");
  });
  it("monta a mensagem que o caixa vê", () => {
    expect(mensagemEspera(30 * SEG)).toBe("Muitas tentativas erradas. Aguarde 30 segundos e tente de novo.");
  });
});
