import { describe, expect, it } from 'vitest';
import { criarRegras } from '../src/motor/regras';
import { novaPartida, type Jogo, type Partida } from '../src/motor/partida';
import type { Carta } from '../src/motor/cartas';
import { podeBaixarJogo } from '../src/ui/baixarJogo';
import { AJUSTES_PADRAO } from '../src/ui/estado';
import { cs } from './ajuda';

function montar(mao: Carta[], mesa: Jogo[] = []): Partida {
  const p = novaPartida(criarRegras(), 1);
  return {
    ...p,
    jogadores: [{ ...p.jogadores[0], mao }, { ...p.jogadores[1], mao: cs('Kp Kp Ko') }],
    mesa,
    monte: cs('2p 3p'),
    inicioDaVez: { mao, mesa },
    proximoIdJogo: 100,
  };
}
const ids = (cartas: Carta[]) => cartas.map((c) => c.id);

describe('botão "Baixar jogo"', () => {
  it('aparece para 3 cartas da mão que formam sequência (2-3-4) ou trinca (2-2-2)', () => {
    const p = montar(cs('2c 3c 4c 9e 9o 9p 9c'));
    expect(podeBaixarJogo(p, ids(p.jogadores[0].mao.slice(0, 3)))).toBe(true);
    expect(podeBaixarJogo(p, ids(p.jogadores[0].mao.slice(3, 6)))).toBe(true);
  });
  it('não aparece se as 3 não formam jogo, ou se são 1, 2 ou 4 cartas', () => {
    const p = montar(cs('2c 3c 4c 9e 7o'));
    const m = p.jogadores[0].mao;
    expect(podeBaixarJogo(p, ids([m[0], m[1], m[4]]))).toBe(false);
    expect(podeBaixarJogo(p, ids([m[0]]))).toBe(false);
    expect(podeBaixarJogo(p, ids(m.slice(0, 2)))).toBe(false);
    expect(podeBaixarJogo(p, ids(m.slice(0, 4)))).toBe(false);
  });
  it('não aparece com cartas que já estão na mesa', () => {
    const mesa = [{ id: 'j1', cartas: cs('4c 5c 6c 7c') }];
    const p = montar(cs('9e'), mesa);
    expect(podeBaixarJogo(p, ids(mesa[0].cartas.slice(0, 3)))).toBe(false);
  });
});

describe('ajustes novos', () => {
  it('o padrão é "Melhor idade", com o tutorial ainda não visto', () => {
    expect(AJUSTES_PADRAO.visual).toBe('idade');
    expect(AJUSTES_PADRAO.tutorialVisto).toBe(false);
  });
});
