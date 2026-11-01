import { describe, expect, it } from 'vitest';
import {
  aoAcabarOTempo, aoRemover, aoTerminarVez, ativos, codigoDoLink, distribuir, finalizarRodada, ordemLocal, partidaLocal,
  passouOTempo, proximoAtivo, salaInicial, todosRevelaram, type Sala,
} from '../src/online/logica';
import { comprarEPassar, moverCartas } from '../src/motor/partida';
import { cs } from './ajuda';

function sala(n: number, extra: Partial<Sala> = {}): Sala {
  let s = salaInicial({ uid: 'u0', nome: 'Ana' }, { curinga: false, modo: 'casual', limiteSeg: 180 }, 1000);
  for (let i = 1; i < n; i++) s = { ...s, jogadores: [...s.jogadores, { uid: `u${i}`, nome: `P${i}` }], uids: [...s.uids, `u${i}`], cartas: [...s.cartas, 0], totais: [...s.totais, 0] };
  return { ...s, ...extra };
}

describe('sala online: começar', () => {
  it('distribui 9 cartas para cada um (até 4 pessoas) e o resto fica no monte', () => {
    for (const n of [2, 3, 4]) {
      const d = distribuir(sala(n), 7, 5000);
      expect(Object.keys(d.maos)).toHaveLength(n);
      expect(Object.values(d.maos).every((m) => m.length === 9)).toBe(true);
      expect(JSON.parse(d.patch.monte!)).toHaveLength(104 - 9 * n);
      expect(d.patch.cartas).toEqual(Array(n).fill(9));
    }
  });
  it('quem começa alterna a cada rodada', () => {
    const s = sala(3);
    const r1 = distribuir(s, 1, 0).patch;
    const r2 = distribuir({ ...s, rodada: 1, ...r1 } as Sala, 2, 0).patch;
    expect([r1.vez, r2.vez]).toEqual([0, 1]);
  });
});

describe('sala online: a partida na tela', () => {
  it('você é o jogador 0; os outros só têm a quantidade de cartas', () => {
    const d = distribuir(sala(3), 3, 0);
    const s = { ...sala(3), ...d.patch } as Sala;
    const p = partidaLocal(s, 1, d.maos.u1);
    expect(p.jogadores.map((j) => j.nome)).toEqual(['P1', 'P2', 'Ana']);
    expect(p.jogadores[0].mao).toEqual(d.maos.u1);
    expect(p.jogadores[1].mao).toHaveLength(9);
    expect(p.jogadores[1].mao.every((c) => c.id.startsWith('oculta'))).toBe(true);
    expect(ordemLocal(s, 1)).toEqual([1, 2, 0]);
  });
  it('jogar uma carta e passar a vez vira a próxima versão da sala', () => {
    const d = distribuir(sala(3), 3, 0);
    const s = { ...sala(3), ...d.patch } as Sala;
    const p = partidaLocal(s, 0, cs('2c 3c 4c 9e 9o 9p 5o 6o 7o'));
    const ids = p.jogadores[0].mao.slice(0, 3).map((c) => c.id);
    const r = moverCartas(p, ids, { tipo: 'novoJogo' });
    if (!r.ok) throw new Error(r.motivo);
    const fim = aoTerminarVez(s, 0, { ...r.partida, vez: 1 }, 9000);
    expect(fim.patch.versao).toBe(s.versao + 1);
    expect(fim.patch.vez).toBe(1);
    expect(fim.patch.cartas).toEqual([6, 9, 9]);
    expect(JSON.parse(fim.patch.mesa!)).toHaveLength(1);
    expect(fim.minhaMao).toHaveLength(6);
  });
  it('comprar leva 1 carta do monte e passa a vez', () => {
    const d = distribuir(sala(2), 3, 0);
    const s = { ...sala(2), ...d.patch } as Sala;
    const p = partidaLocal(s, 0, d.maos.u0);
    const r = comprarEPassar(p);
    if (!r.ok) throw new Error('x');
    const fim = aoTerminarVez(s, 0, r.partida, 1);
    expect(fim.patch.cartas).toEqual([10, 9]);
    expect(JSON.parse(fim.patch.monte!)).toHaveLength(104 - 18 - 1);
  });
});

describe('sala online: fim da rodada', () => {
  it('quem zerou a mão ganha; os outros somam os pontos da mão revelada', () => {
    const s = sala(3, { fase: 'contando', motivoFim: 'bateu', quemBateu: 1, totais: [0, 0, 0] });
    const rev = { u0: cs('Ac 5c'), u1: [], u2: cs('Ko') };
    expect(todosRevelaram(s, rev)).toBe(true);
    const f = finalizarRodada({ ...s, config: { ...s.config, modo: 'campeonato' } }, rev);
    expect(f.fase).toBe('fim');
    expect(f.resultado!.vencedor).toBe(1);
    expect(f.resultado!.pontos).toEqual([20, 0, 10]);
    expect(f.totais).toEqual([20, 0, 10]);
  });
  it('só conta quando todos mostraram a mão', () => {
    const s = sala(2, { fase: 'contando' });
    expect(todosRevelaram(s, { u0: [] })).toBe(false);
  });
  it('monte acabou: ganha quem tem menos pontos', () => {
    const s = sala(2, { fase: 'contando', motivoFim: 'monteAcabou' });
    const f = finalizarRodada(s, { u0: cs('2c'), u1: cs('Kc Kp') });
    expect(f.resultado!.vencedor).toBe(0);
  });
});

describe('sala online: tempo e saídas', () => {
  it('passou o tempo: o jogo compra para quem demorou e passa a vez', () => {
    const d = distribuir(sala(3), 3, 0);
    const s = { ...sala(3), ...d.patch, vezDesde: 0 } as Sala;
    expect(passouOTempo(s, 100_000)).toBe(false);
    expect(passouOTempo(s, 200_000)).toBe(true);
    const r = aoAcabarOTempo(s, 200_000);
    expect(r.uid).toBe('u0');
    expect(r.carta).not.toBeNull();
    expect(r.patch.vez).toBe(1);
    expect(r.patch.cartas).toEqual([10, 9, 9]);
  });
  it('quem sai no meio da vez dele: a vez passa; sobrando só um, ele ganha', () => {
    const d = distribuir(sala(3), 3, 0);
    const s = { ...sala(3), ...d.patch } as Sala;
    const a = aoRemover(s, 0, 5);
    expect(a.vez).toBe(1);
    const s2 = { ...s, ...a } as Sala;
    expect(ativos(s2)).toEqual([1, 2]);
    expect(proximoAtivo(s2, 2)).toBe(1);
    const b = aoRemover(s2, 1, 6);
    expect(b.fase).toBe('fim');
    expect(b.resultado!.vencedor).toBe(2);
  });
});

describe('link da sala', () => {
  it('lê o código do link', () => {
    expect(codigoDoLink('#sala=ab2cd')).toBe('AB2CD');
    expect(codigoDoLink('')).toBeNull();
  });
});
