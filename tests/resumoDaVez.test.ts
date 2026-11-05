import { describe, expect, it } from 'vitest';
import { criarRegras } from '../src/motor/regras';
import { resumoDaVez } from '../src/ui/textos';
import type { Passo } from '../src/ia';
import { cs } from './ajuda';

const regras = criarRegras();
const passo = (tipo: Passo['tipo'], mao: string, mesa: string[]): Passo => {
  const cartasDaMao = cs(mao);
  // as cartas da mão precisam ser as MESMAS da mesa (mesmo id): "5c" da mesa usa o 5c da mão, se houver
  const jogos = mesa.map((t, i) => ({
    id: `j${i}`,
    cartas: t.split(' ').map((txt) => cartasDaMao.find((m) => m.id.startsWith(`${txt}-`)) ?? cs(txt)[0]),
  }));
  return { tipo, cartasDaMao, jogoIds: ['j0'], mesa: jogos };
};

describe('resumo da vez do adversário', () => {
  it('sem jogada: comprou', () => {
    expect(resumoDaVez(null, regras)).toBe('comprou uma carta');
  });
  it('jogo novo da mão', () => {
    expect(resumoDaVez([passo('baixou', '4c 2c 3c', ['2c 3c 4c'])], regras)).toBe('baixou o jogo 2♥ 3♥ 4♥');
  });
  it('mexer na mesa vira um resumo só, com quantas cartas pôs', () => {
    const r = resumoDaVez([passo('encostou', '5c', ['2c 3c 4c 5c']), passo('rearrumou', '9p', ['7p 8p 9p'])], regras);
    expect(r).toBe('mexeu na mesa e colocou 2 cartas');
  });
  it('as duas coisas', () => {
    const r = resumoDaVez([passo('baixou', '7e 7o 7p', ['7e 7o 7p']), passo('encostou', '5c', ['2c 3c 4c 5c'])], regras);
    expect(r).toMatch(/^baixou o jogo .+; mexeu na mesa e colocou 1 carta$/);
  });
});

describe('ajuste de som', () => {
  it('começa desligado para todo mundo (inclusive quem já tinha ajustes guardados)', async () => {
    const { AJUSTES_PADRAO } = await import('../src/ui/estado');
    expect(AJUSTES_PADRAO.sons).toBe(false);
    const guardadoAntigo = { nivel: 'dificil', visual: 'bonito' };
    expect({ ...AJUSTES_PADRAO, ...guardadoAntigo }.sons).toBe(false);
  });
});
