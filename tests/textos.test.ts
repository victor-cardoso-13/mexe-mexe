import { describe, expect, it } from 'vitest';
import type { Carta } from '../src/motor/cartas';
import { criarRegras } from '../src/motor/regras';
import type { Passo } from '../src/ia';
import { descreverPasso, resumoDoPasso } from '../src/ui/textos';

const NA = { c: 'copas', o: 'ouros', e: 'espadas', p: 'paus' } as const;
const VA: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
let k = 0;
const c = (t: string): Carta => ({ id: `${t}-${k++}`, curinga: false, naipe: NA[t.slice(-1) as keyof typeof NA], valor: VA[t.slice(0, -1)] ?? Number(t.slice(0, -1)) }) as Carta;
const regras = criarRegras();

describe('frases da dica e do adversário: cartas na ordem da mesa', () => {
  it('jogo novo em sequência: 6♣ 7♣ 8♣ (e não 8♣ 7♣ 6♣)', () => {
    const [oito, sete, seis] = [c('8p'), c('7p'), c('6p')];
    const passo: Passo = { tipo: 'baixou', cartasDaMao: [oito, sete, seis], jogoIds: ['n'], mesa: [{ id: 'n', cartas: [oito, sete, seis] }] };
    expect(descreverPasso(passo, '', regras, true)).toBe('Você pode baixar um jogo novo: 6♣ 7♣ 8♣.');
    expect(resumoDoPasso(passo, regras)).toBe('baixou 6♣ 7♣ 8♣');
  });

  it('sequência com Ás no fim: Q♥ K♥ A♥', () => {
    const [as, rei, dama] = [c('Ac'), c('Kc'), c('Qc')];
    const passo: Passo = { tipo: 'baixou', cartasDaMao: [as, rei, dama], jogoIds: ['n'], mesa: [{ id: 'n', cartas: [as, rei, dama] }] };
    expect(descreverPasso(passo, 'O Adversário', regras)).toBe('O Adversário baixou um jogo novo: Q♥ K♥ A♥.');
  });

  it('colocar nas duas pontas de um jogo: 4♦ e 8♦ na ordem do jogo', () => {
    const meio = [c('5o'), c('6o'), c('7o')];
    const [oito, quatro] = [c('8o'), c('4o')];
    const passo: Passo = { tipo: 'encostou', cartasDaMao: [oito, quatro], jogoIds: ['j'], mesa: [{ id: 'j', cartas: [...meio, oito, quatro] }] };
    expect(descreverPasso(passo, '', regras, true)).toBe('Você pode colocar 4♦ 8♦ no jogo 5♦ 6♦ 7♦.');
  });

  it('rearrumar: segue a ordem dos jogos mexidos', () => {
    const [nove, tres] = [c('9e'), c('3e')];
    const passo: Passo = {
      tipo: 'rearrumou', cartasDaMao: [nove, tres], jogoIds: ['a', 'b'],
      mesa: [{ id: 'b', cartas: [c('7e'), c('8e'), nove] }, { id: 'a', cartas: [tres, c('4e'), c('5e')] }],
    };
    expect(descreverPasso(passo, '', regras, true)).toBe('Você pode rearrumar a mesa e usar 3♠ 9♠.');
  });
});
