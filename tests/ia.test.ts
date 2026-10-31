import { describe, expect, it } from 'vitest';
import { criarRegras, type NivelIA, type Regras } from '../src/motor/regras';
import { aplicarJogada, comprarEPassar, conferir, novaPartida, type Foto, type Jogo, type Partida } from '../src/motor/partida';
import { escolherJogada, pensar } from '../src/ia';
import { jogosPossiveis } from '../src/ia/combinacoes';
import type { Carta } from '../src/motor/cartas';
import { cs } from './ajuda';

const semCuringa = criarRegras();
const comCuringa = criarRegras({ curinga: { ...semCuringa.curinga, ativo: true } });

/** Atalho: o que a IA faria com essa mão e essa mesa. */
function jogar(mao: Carta[], mesa: Jogo[], nivel: NivelIA, regras = semCuringa) {
  return pensar(regras, { mao, mesa }, nivel, 100);
}

/** Atalho: o que a DICA sugeriria com essa mão e essa mesa. */
function dica(mao: Carta[], mesa: Jogo[], regras = semCuringa) {
  return pensar(regras, { mao, mesa }, 'dificil', 100, { dica: true });
}

/** Em quantos jogos que já estavam na mesa a jogada mexeu. */
function jogosMexidos(inicio: Foto, depois: Foto): number {
  return inicio.mesa.filter((j) => {
    const agora = depois.mesa.find((d) => d.id === j.id);
    return !agora || agora.cartas.length !== j.cartas.length || !j.cartas.every((c) => agora.cartas.includes(c));
  }).length;
}

/** Total de cartas do jogo: monte + mãos + mesa, todas com id diferente. */
function conferirCartas(p: Partida, total: number) {
  const ids = [...p.monte, ...p.jogadores.flatMap((j) => j.mao), ...p.mesa.flatMap((j) => j.cartas)].map((c) => c.id);
  expect(ids).toHaveLength(total);
  expect(new Set(ids).size).toBe(total);
}

/** Joga uma partida inteira com o computador em todos os lugares. */
function simular(regras: Regras, semente: number) {
  let p: Partida = novaPartida(regras, semente);
  const total = 104 + (regras.curinga.ativo ? regras.curinga.quantidade : 0);
  const limite = regras.niveis[regras.nivelIA].maximoDeJogosMexidos ?? Infinity;
  let maisLenta = 0;
  for (let rodada = 0; rodada < 1000 && !p.resultado; rodada++) {
    const t0 = performance.now();
    // IA "crua", SEM a rede de segurança do escolherJogada.
    const jogada = pensar(p.regras, p.inicioDaVez, regras.nivelIA, p.proximoIdJogo);
    maisLenta = Math.max(maisLenta, performance.now() - t0);
    if (jogada) {
      expect(conferir(p.regras, p.inicioDaVez, jogada.foto)).toMatchObject({ ok: true });
      expect(jogosMexidos(p.inicioDaVez, jogada.foto)).toBeLessThanOrEqual(limite);
      const r = aplicarJogada(p, jogada.foto);
      expect(r.ok).toBe(true);
      if (r.ok) p = r.partida;
    } else {
      const r = comprarEPassar(p);
      expect(r.ok).toBe(true);
      if (r.ok) p = r.partida;
    }
    conferirCartas(p, total);
  }
  return { p, maisLenta };
}

describe('computador: casos simples', () => {
  it('baixa 3 cartas, nunca 4 (regra: 1 ou 3 cartas da mão)', () => {
    const mesa = [{ id: 'j1', cartas: cs('7e 7o 7p') }];
    const mao = cs('2c 3c 4c 7c Kp');
    const j = jogar(mao, mesa, 'facil')!;
    expect(j.foto.mao).toHaveLength(2);
  });

  it('com só uma carta para encostar, baixa 1', () => {
    const mesa = [{ id: 'j1', cartas: cs('7e 7o 7p') }];
    const j = jogar(cs('7e Kp 2o'), mesa, 'facil')!;
    expect(j.foto.mao).toHaveLength(2);
    expect(j.passos.map((s) => s.tipo)).toEqual(['encostou']);
  });

  it('nunca espalha as 3 cartas da mão em jogos diferentes', () => {
    // Mão: Q♣ 8♥ 10♥. Dava para pôr Q♣ num jogo e 8♥ 10♥ (com o 9♥ da mesa) em outro: proibido.
    const mesa = [
      { id: 'j1', cartas: cs('9p 10p Jp') },
      { id: 'j2', cartas: cs('9c 9e 9o 9c') },
    ];
    for (const nivel of ['facil', 'medio', 'dificil'] as const) {
      const j = jogar(cs('Qp 8c 10c'), mesa, nivel)!;
      const usadas = 3 - j.foto.mao.length;
      expect([1, 3]).toContain(usadas);
      if (usadas === 3) {
        const jogosComMao = j.foto.mesa.filter((g) => g.cartas.some((c) => !mesa.some((m) => m.cartas.includes(c))));
        expect(jogosComMao).toHaveLength(1);
      }
    }
  });

  it('não usa 3 cartas da mão que não formam jogo sozinhas (7♠ 8♠ 10♠ com o 9♠ da mesa)', () => {
    const mesa = [{ id: 'j1', cartas: cs('9e 9c 9o 9p 9c 9e') }];
    for (const nivel of ['facil', 'medio', 'dificil'] as const) {
      const j = jogar(cs('7e 8e 10e'), mesa, nivel);
      // Pode no máximo encostar 1 carta; nunca baixar as 3.
      expect(j === null || j.foto.mao.length === 2).toBe(true);
    }
  });

  it('dica acha o K♦ que precisa mexer em 4 jogos (caso real da família)', () => {
    const mesa = [
      '2e 2e 2c 2p', '8e 9e 10e', '10c 10p 10o', '8c 9c 10c Jc Qc', '3c 3e 3e 3o 3o', '2p 3p 4p',
      'Ac Ap Ao Ao', '8p 9p 10p Jp Qp', '7o 8o 9o 10o', '6c 6e 6o 6o 6p 6p', 'Je Jo Jp',
      'Qe Ke Ae', '5c 5p 5o', '7e 7o 7p', 'Qc Kc Ac',
    ].map((t, i) => ({ id: `j${i}`, cartas: cs(t) }));
    const j = dica(cs('Ke Ko'), mesa);
    expect(j).not.toBeNull();
    expect(j!.foto.mao).toHaveLength(1);
  });

  it('dica acha o 9♦ que precisa mexer em 6 jogos e usar o curinga da mesa (caso real da família)', () => {
    const mesa = [
      '6p 7p 8p', '7c * 9c 10c Jc Qc', '4e 4o 4p 4p', '2e 2e 2c 2p', '8p 9p 10p', 'Qo Ko Ao',
      'Ac 2c * 4c', '6c 6c 6p 6o', '3o 4o 5o', 'Ac Ae Ao', '4e 5e 6e 7e', 'Ke Kc Kp Kp', '5o 6o 7o', '9o 10o Jo',
    ].map((t, i) => ({ id: `j${i}`, cartas: cs(t) }));
    const j = dica(cs('9o'), mesa, comCuringa);
    expect(j).not.toBeNull();
    expect(j!.foto.mao).toHaveLength(0);
  });

  it('curinga solto: acha o lugar do curinga (4-5-6 🃏 8-9-10♥) e não acha quando não há', async () => {
    const { jogadaDoCuringa } = await import('../src/ia');
    const montar = (mesaTxt: string[], maoTxt: string) => {
      const p0 = novaPartida(comCuringa, 1);
      const mesa = mesaTxt.map((t, i) => ({ id: `j${i}`, cartas: cs(t) }));
      const mao = cs(maoTxt);
      return { ...p0, mesa, inicioDaVez: { mao, mesa }, jogadores: [{ ...p0.jogadores[0], mao }, p0.jogadores[1]] };
    };
    const com = jogadaDoCuringa(montar(['4c 5c 6c', '8c 9c 10c'], '* Kp 2o'));
    expect(com).not.toBeNull();
    expect(com!.foto.mao).toHaveLength(2);
    expect(com!.foto.mesa).toHaveLength(1);
    expect(jogadaDoCuringa(montar(['4c 5c 6c', '9e 9o 9p'], '* Kp 2o'))).toBeNull();
  });

  it('quadra na mão: baixa só 3 cartas', () => {
    const j = jogar(cs('Jc Je Jo Jp'), [], 'dificil')!;
    expect(j.foto.mao).toHaveLength(1);
  });

  it('não acha jogo com curinga na ponta nem curingas lado a lado', () => {
    expect(jogosPossiveis(cs('2c 3c *'), comCuringa)).toEqual([]);
    expect(jogosPossiveis(cs('2c 4c *'), comCuringa)).toEqual([['2-copas', 'curinga', '4-copas']]);
    expect(jogosPossiveis(cs('2c 5c * *'), comCuringa)).toEqual([]);
  });

  it('com dois jogos na mão, baixa só um por vez (3 cartas)', () => {
    expect(jogar(cs('2c 3c 4c 2c 3c 4c'), [], 'facil')!.foto.mao).toHaveLength(3);
  });

  it('rearruma 1 jogo: com um 5♥ na mão, parte 3-4-5-6-7♥ em 3-4-5 e 5-6-7', () => {
    const mesa = [{ id: 'j1', cartas: cs('3c 4c 5c 6c 7c') }];
    const j = jogar(cs('5c'), mesa, 'facil')!;
    expect(j.foto.mao).toEqual([]);
    expect(j.foto.mesa).toHaveLength(2);
    expect(j.passos[0].tipo).toBe('rearrumou');
  });

  it('Fácil mexe em 1 jogo; Médio consegue usar 2 jogos de uma vez', () => {
    // Mão: 9♣. Mesa: trinca de seis 8 e trinca de seis 10 (com ♣).
    // Só dá para usar o 9♣ tirando o 8♣ E o 10♣ (mexendo em 2 jogos): 8♣ 9♣ 10♣.
    const mesa = [
      { id: 'j1', cartas: cs('8c 8c 8e 8e 8o 8p') },
      { id: 'j2', cartas: cs('10c 10c 10e 10e 10o 10p') },
    ];
    const mao = cs('9p');
    expect(jogar(mao, mesa, 'facil')).toBeNull();
    const medio = jogar(mao, mesa, 'medio')!;
    expect(medio.foto.mao).toEqual([]);
    expect(jogosMexidos({ mao, mesa }, medio.foto)).toBe(2);
  });

  it('Difícil, no empate, deixa na mão menos pontos', () => {
    // 7♥ 7♠ 7♦ 8♥ 9♥ K♣: dá para baixar a trinca de 7 (sobra 8♥ 9♥ K♣ = 27 pontos)
    // ou a sequência 7-8-9♥ (sobra 7♠ 7♦ K♣ = 24 pontos). O Difícil escolhe a segunda.
    const j = jogar(cs('7c 7e 7o 8c 9c Kp'), [], 'dificil')!;
    expect(j.foto.mao.map((c) => c.id.split('-')[0]).sort()).toEqual(['7e', '7o', 'Kp']);
  });
});

const NO_GITHUB = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI;

describe('computador: partidas inteiras (nunca faz jogada inválida e não trava)', () => {
  const casos: Array<[string, Regras, number]> = [
    ['Fácil, sem curinga', semCuringa, 100],
    ['Fácil, com curinga', comCuringa, 100],
    ['Fácil, 3 adversários', criarRegras({ adversarios: 3 }), 40],
    ['Médio', criarRegras({ nivelIA: 'medio' }), 40],
    ['Médio, com curinga', criarRegras({ nivelIA: 'medio', curinga: comCuringa.curinga }), 30],
    ['Difícil', criarRegras({ nivelIA: 'dificil' }), 15],
  ];
  for (const [nome, regras, quantas] of casos) {
    it(`${nome}: ${quantas} partidas`, { timeout: 400000 }, () => {
      let naMesa = 0;
      let bateu = 0;
      let pior = 0;
      for (let s = 1; s <= quantas; s++) {
        const { p, maisLenta } = simular(regras, s);
        expect(p.resultado).not.toBeNull();
        naMesa += p.mesa.flatMap((j) => j.cartas).length;
        if (p.resultado?.motivo === 'bateu') bateu++;
        pior = Math.max(pior, maisLenta);
      }
      console.log(`${nome}: bateu em ${bateu}/${quantas}; média de ${(naMesa / quantas).toFixed(0)} cartas na mesa; jogada mais lenta ${pior.toFixed(0)} ms`);
      expect(naMesa / quantas).toBeGreaterThan(40);
      // Tempo máximo do nível + folga (maior no GitHub, que é mais lento que o Mac).
      expect(pior).toBeLessThan(regras.niveis[regras.nivelIA].tempoMaximoMs + (NO_GITHUB ? 1500 : 300));
    });
  }
});

it('escolherJogada usa o nível das regras', () => {
  const p = novaPartida(semCuringa, 3);
  const j = escolherJogada(p);
  if (j) expect(conferir(p.regras, p.inicioDaVez, j.foto).ok).toBe(true);
});
