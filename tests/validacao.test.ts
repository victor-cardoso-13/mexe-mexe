import { describe, expect, it } from 'vitest';
import { criarRegras } from '../src/motor/regras';
import { MOTIVOS, validarJogo } from '../src/motor/validacao';
import { nomeDaCarta } from '../src/motor/cartas';
import { cs } from './ajuda';

const semCuringa = criarRegras();
const comCuringa = criarRegras({ curinga: { ...criarRegras().curinga, ativo: true } });

const vale = (txt: string, r = semCuringa) => validarJogo(cs(txt), r).valido;
const motivo = (txt: string, r = semCuringa) => {
  const res = validarJogo(cs(txt), r);
  return res.valido ? null : res.motivo;
};
const ordem = (txt: string, r = semCuringa) => {
  const res = validarJogo(cs(txt), r);
  return res.valido ? res.ordem.map(nomeDaCarta).join(' ') : null;
};

describe('tamanho mínimo', () => {
  it('precisa de 3 cartas', () => {
    expect(motivo('2c 3c')).toBe(MOTIVOS.poucasCartas);
    expect(motivo('5c 5e')).toBe(MOTIVOS.poucasCartas);
  });
});

describe('sequências', () => {
  it('aceita sequência simples do mesmo naipe, em qualquer ordem', () => {
    expect(vale('4c 5c 6c')).toBe(true);
    expect(ordem('6c 4c 5c')).toBe('4♥ 5♥ 6♥');
    expect(vale('9p 10p Jp Qp')).toBe(true);
  });
  it('recusa naipes diferentes', () => {
    expect(motivo('4c 5o 6c')).toBe(MOTIVOS.naipesDiferentes);
  });
  it('recusa buraco sem curinga', () => {
    expect(motivo('4c 6c 7c')).toBe(MOTIVOS.foraDeSequencia);
  });
  it('recusa carta repetida (2 baralhos)', () => {
    expect(motivo('4c 5c 5c 6c')).toBe(MOTIVOS.cartaRepetida);
  });
  it('Ás baixo: A-2-3', () => {
    expect(ordem('3e Ae 2e')).toBe('A♠ 2♠ 3♠');
  });
  it('Ás alto: Q-K-A', () => {
    expect(ordem('Ae Ke Qe')).toBe('Q♠ K♠ A♠');
  });
  it('Ás não dá a volta: K-A-2 não vale', () => {
    expect(vale('Ke Ae 2e')).toBe(false);
    expect(vale('Qe Ke Ae 2e')).toBe(false);
  });
  it('sequência de 13 cartas (A a K) vale', () => {
    expect(vale('Ao 2o 3o 4o 5o 6o 7o 8o 9o 10o Jo Qo Ko')).toBe(true);
  });
  it('A até A (14 cartas) só se a regra permitir', () => {
    const txt = 'Ao 2o 3o 4o 5o 6o 7o 8o 9o 10o Jo Qo Ko Ao';
    expect(vale(txt)).toBe(false);
    expect(vale(txt, criarRegras({ permitirSequenciaAsAteAs: true }))).toBe(true);
  });
});

describe('trincas (regra da casa)', () => {
  // Exemplos confirmados pela família.
  it('valem', () => {
    expect(vale('8c 8e 8o')).toBe(true);
    expect(vale('8c 8c 8e 8o')).toBe(true);
    expect(vale('8c 8c 8e 8e 8o 8p')).toBe(true);
    expect(vale('8c 8c 8e 8e 8o 8o')).toBe(true);
    expect(vale('8c 8c 8e 8e 8o 8o 8p 8p')).toBe(true);
  });
  it('não valem', () => {
    expect(motivo('8c 8e 8o 8p')).toBe(MOTIVOS.quartoNaipe);
    expect(motivo('8c 8c 8e 8o 8p')).toBe(MOTIVOS.quartoNaipe);
    expect(motivo('8c 8c 8e 8e')).toBe(MOTIVOS.poucosNaipes);
  });
  it('mostra as cores alternadas e o mesmo naipe junto', () => {
    expect(ordem('8o 8e 8c')).toBe('8♥ 8♠ 8♦');
    expect(ordem('8e 8c 8p')).toBe('8♠ 8♥ 8♣');
    expect(ordem('8p 8c 8o 8e 8c 8e')).toBe('8♥ 8♥ 8♠ 8♠ 8♦ 8♣');
  });
});

describe('curinga (regra da casa)', () => {
  it('sem curinga ativo, curinga não vale', () => {
    expect(motivo('2c * 4c')).toBe(MOTIVOS.curingaDesligado);
  });
  it('2-🃏-4 vale', () => {
    expect(ordem('4c * 2c', comCuringa)).toBe('2♥ Curinga 4♥');
  });
  it('🃏-3-4 e 2-3-🃏 não valem (curinga na ponta)', () => {
    expect(motivo('* 3c 4c', comCuringa)).toBe(MOTIVOS.curingaNaPonta);
    expect(motivo('2c 3c *', comCuringa)).toBe(MOTIVOS.curingaNaPonta);
    expect(motivo('2c 3c 4c *', comCuringa)).toBe(MOTIVOS.curingaNaPonta);
  });
  it('2-2-🃏 não vale (curinga não entra em trinca)', () => {
    expect(motivo('2c 2e *', comCuringa)).toBe(MOTIVOS.curingaEmTrinca);
  });
  it('vários curingas intercalados valem: 2-🃏-4-🃏-6', () => {
    expect(ordem('6c * 2c * 4c', comCuringa)).toBe('2♥ Curinga 4♥ Curinga 6♥');
  });
  it('dois curingas lado a lado não valem: 2-3-🃏-🃏-6', () => {
    expect(motivo('2c 3c * * 6c', comCuringa)).toBe(MOTIVOS.curingasJuntos);
    expect(motivo('2c * * 5c', comCuringa)).toBe(MOTIVOS.curingasJuntos);
  });
  it('lado a lado pode, se a regra permitir', () => {
    const r = criarRegras({ curinga: { ...comCuringa.curinga, permitirLadoALado: true } });
    expect(ordem('2c * * 5c', r)).toBe('2♥ Curinga Curinga 5♥');
  });
  it('limite de curingas por jogo', () => {
    const umSo = criarRegras({ curinga: { ...comCuringa.curinga, maximoPorJogo: 1 } });
    expect(motivo('2c * 4c * 6c', umSo)).toBe(MOTIVOS.curingasDemais);
  });
  it('curinga com Ás alto: Q-🃏-A', () => {
    expect(ordem('Ac * Qc', comCuringa)).toBe('Q♥ Curinga A♥');
  });
  it('curinga não faz a volta: K-🃏-2 não vale', () => {
    expect(vale('Kc * 2c', comCuringa)).toBe(false);
  });
  it('só curingas, ou um natural com curingas, não vale', () => {
    expect(vale('* * *', comCuringa)).toBe(false);
    expect(vale('5c * *', comCuringa)).toBe(false);
  });
});
