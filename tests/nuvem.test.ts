import { describe, expect, it } from 'vitest';
import { novaPartida, type Partida } from '../src/motor/partida';
import { criarRegras, type NivelIA } from '../src/motor/regras';
import { daNuvem, iguais, mesclar, paraNuvem } from '../src/nuvem/mesclar';
import { resultadoDaPartida, resumir } from '../src/ui/retrospecto';
import type { Gaveta, ResultadoGuardado } from '../src/ui/salvar';

const res = (em: number, r: ResultadoGuardado['r'], nivel: NivelIA = 'facil'): ResultadoGuardado => ({
  em, nivel, r, motivo: 'bateu', adversarios: 1,
});
const gaveta = (jogoEm: number, resultados: Record<string, ResultadoGuardado> = {}, semente = 1): Gaveta => ({
  jogo: jogoEm
    ? { id: `p${semente}`, partida: novaPartida(criarRegras(), semente), ordenacao: 'naipe', ordemManual: [], novaCartaId: null }
    : null,
  jogoEm,
  resultados,
});

describe('formato da nuvem', () => {
  it('ida e volta mantém a partida e o retrospecto (o "Desfazer" não vai)', () => {
    const g = gaveta(5, { a: res(1, 'v') });
    g.jogo!.partida.historico = [g.jogo!.partida.inicioDaVez];
    const volta = daNuvem(paraNuvem(g));
    expect(volta.jogo!.partida.jogadores[0].mao).toEqual(g.jogo!.partida.jogadores[0].mao);
    expect(volta.jogo!.partida.monte.length).toBe(g.jogo!.partida.monte.length);
    expect(volta.jogo!.partida.historico).toEqual([]);
    expect(volta.resultados).toEqual(g.resultados);
    expect(iguais(g, volta)).toBe(true);
  });

  it('o Firebase aceita: sem listas dentro de listas e sem "undefined"', () => {
    const g = gaveta(5, { a: res(1, 'd') });
    g.jogo!.novaCartaId = undefined as unknown as null;
    const texto = JSON.stringify(paraNuvem(g), (_, v) => {
      if (v === undefined) throw new Error('undefined');
      if (Array.isArray(v) && v.some(Array.isArray)) throw new Error('lista dentro de lista');
      return v;
    });
    expect(texto.length).toBeLessThan(200_000); // bem abaixo do limite de 1 MB do Firebase
  });

  it('sem partida vira texto vazio, e volta como "sem partida"', () => {
    expect(paraNuvem(gaveta(0)).jogo).toBe('');
    expect(daNuvem(paraNuvem(gaveta(0))).jogo).toBeNull();
  });
});

describe('juntar aparelho e nuvem', () => {
  it('fica com a partida mexida por último', () => {
    const celular = gaveta(100, {}, 1);
    const ipad = gaveta(200, {}, 2);
    expect(mesclar(celular, ipad).jogo!.id).toBe('p2');
    expect(mesclar(ipad, celular).jogo!.id).toBe('p2');
    expect(mesclar(celular, ipad).jogoEm).toBe(200);
  });

  it('soma o retrospecto dos dois aparelhos', () => {
    const j = mesclar(gaveta(1, { a: res(1, 'v') }), gaveta(1, { b: res(2, 'd'), c: res(3, 'e') }));
    expect(Object.keys(j.resultados).sort()).toEqual(['a', 'b', 'c']);
  });

  it('a mesma partida vinda dos dois lados conta uma vez só', () => {
    const j = mesclar(gaveta(1, { a: res(1, 'v'), b: res(2, 'd') }), gaveta(1, { a: res(1, 'v') }));
    expect(resumir(j.resultados).total.jogadas).toBe(2);
    // e juntar de novo não muda nada
    expect(iguais(mesclar(j, j), j)).toBe(true);
  });
});

describe('retrospecto', () => {
  it('separa por nível e soma o total', () => {
    const r = resumir({
      a: res(1, 'v', 'facil'), b: res(2, 'v', 'facil'), c: res(3, 'd', 'medio'),
      d: res(4, 'e', 'dificil'), e: res(5, 'd', 'dificil'),
    });
    expect(r.porNivel.facil).toEqual({ jogadas: 2, vitorias: 2, derrotas: 0, empates: 0 });
    expect(r.porNivel.medio).toEqual({ jogadas: 1, vitorias: 0, derrotas: 1, empates: 0 });
    expect(r.porNivel.dificil).toEqual({ jogadas: 2, vitorias: 0, derrotas: 1, empates: 1 });
    expect(r.total).toEqual({ jogadas: 5, vitorias: 2, derrotas: 2, empates: 1 });
  });

  it('as últimas partidas vêm da mais recente para a mais antiga, no máximo 10', () => {
    const muitas = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`p${i}`, res(i, 'v')]));
    const r = resumir(muitas);
    expect(r.ultimas.length).toBe(10);
    expect(r.ultimas.map((u) => u.em)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
  });

  it('vitória só quando VOCÊ ganha; com 3 adversários, um computador ganhar é derrota', () => {
    const p = novaPartida(criarRegras({ adversarios: 3, nivelIA: 'medio' }), 7);
    const fim = (vencedor: number | null): Partida => ({ ...p, resultado: { vencedor, motivo: 'monteAcabou', pontos: [0, 0, 0, 0] } });
    expect(resultadoDaPartida(p)).toBeNull();
    expect(resultadoDaPartida(fim(0))!.r).toBe('v');
    expect(resultadoDaPartida(fim(2))!.r).toBe('d');
    expect(resultadoDaPartida(fim(null))!.r).toBe('e');
    expect(resultadoDaPartida(fim(0))).toMatchObject({ nivel: 'medio', adversarios: 3, motivo: 'monteAcabou' });
  });

  it('o nível que conta é o do fim da partida (dá para trocar no meio)', () => {
    const p = novaPartida(criarRegras({ nivelIA: 'facil' }), 3);
    const trocou: Partida = { ...p, regras: { ...p.regras, nivelIA: 'dificil' }, resultado: { vencedor: 0, motivo: 'bateu', pontos: [0, 0] } };
    expect(resultadoDaPartida(trocou)!.nivel).toBe('dificil');
  });
});
