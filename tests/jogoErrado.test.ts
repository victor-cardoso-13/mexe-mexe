import { describe, expect, it } from 'vitest';
import { nomeDaCarta, type Carta } from '../src/motor/cartas';
import { criarRegras } from '../src/motor/regras';
import { pedacosDoJogoErrado } from '../src/motor/jogoErrado';

const NA = { c: 'copas', o: 'ouros', e: 'espadas', p: 'paus' } as const;
const VA: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
let k = 0;
const carta = (t: string): Carta =>
  t === '*' ? ({ id: `cor-${k++}`, curinga: true } as Carta)
    : ({ id: `${t}-${k++}`, curinga: false, naipe: NA[t.slice(-1) as keyof typeof NA], valor: VA[t.slice(0, -1)] ?? Number(t.slice(0, -1)) } as Carta);
const regras = criarRegras({ curinga: { ...criarRegras().curinga, ativo: true } });
/** "8o 6o 7o 9o 8o" → "6♦ 7♦ 8♦ | 8♦ 9♦" */
const mostrar = (s: string) =>
  pedacosDoJogoErrado(s.split(' ').map(carta), regras).map((p) => p.map((c) => (c.curinga ? '🃏' : nomeDaCarta(c))).join(' ')).join(' | ');

describe('jogo errado: em pedaços, com vão onde separar', () => {
  it('sem coringa (exemplos do mock)', () => {
    // O jogo que já existia (6 7 8 9) fica inteiro; o 8♦ a mais fica do lado.
    expect(mostrar('8o 6o 7o 9o 8o')).toBe('6♦ 7♦ 8♦ 9♦ | 8♦');
    expect(mostrar('8o 6o 7o 8o 10o')).toBe('6♦ 7♦ 8♦ | 8♦ | 10♦');
    expect(mostrar('5o 6o 8o 9o')).toBe('5♦ 6♦ | 8♦ 9♦');
    expect(mostrar('7c 9p 7e 7p')).toBe('7♠ 7♥ 7♣ | 9♣');
    expect(mostrar('2c 3c 4e 4c 5c')).toBe('2♥ 3♥ 4♥ 5♥ | 4♠');
  });

  it('coringa entra no jogo com as cartas que sobraram', () => {
    expect(mostrar('9o 6o 7o * 9o')).toBe('6♦ 7♦ 🃏 9♦ | 9♦');
  });

  it('trinca inteira não se desfaz por causa do coringa; coringa solto vai no fim', () => {
    expect(mostrar('7c * 7e 5p 7p')).toBe('7♠ 7♥ 7♣ | 5♣ | 🃏');
    expect(mostrar('7c * 7e 5p 7p 8p')).toBe('7♠ 7♥ 7♣ | 5♣ | 8♣ | 🃏');
  });

  it('quando a trinca se desfaz, o coringa pode formar jogo novo', () => {
    expect(mostrar('7c * 5p 7p')).toBe('5♣ 🃏 7♣ | 7♥');
  });

  it('sobra pouco: tudo separado e o coringa no fim', () => {
    expect(mostrar('3e * 9e')).toBe('3♠ | 9♠ | 🃏');
  });

  it('Ás em cima e dois jogos inteiros', () => {
    expect(mostrar('Ac Qc Kc 4p 5p 6p 9e')).toBe('Q♥ K♥ A♥ | 4♣ 5♣ 6♣ | 9♠');
  });

  it('mesa grande não trava', () => {
    const todas = 'Ac 2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc 7o 7e 7p 2c 3c 4c'.split(' ').join(' ');
    const t0 = performance.now();
    expect(mostrar(todas)).toContain('|');
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
