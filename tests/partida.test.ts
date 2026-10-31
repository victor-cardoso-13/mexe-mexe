import { describe, expect, it } from 'vitest';
import { criarRegras } from '../src/motor/regras';
import {
  comprarEPassar, conferirJogada, desfazer, juntarJogos, moverCarta, moverCartas, novaPartida,
  recomecarJogada, resultadoPorMonteVazio, terminarJogada, type Jogo, type Partida, type RespostaAcao,
} from '../src/motor/partida';
import type { Carta } from '../src/motor/cartas';
import { cs } from './ajuda';

const regras = criarRegras();

/** Monta uma partida com mão e mesa escolhidas, na vez da jogadora (índice 0). */
function montar(mao: Carta[], mesa: Jogo[] = [], outraMao: Carta[] = cs('Kp Kp Ko'), monte: Carta[] = cs('2p 3p')): Partida {
  const p = novaPartida(regras, 1);
  return {
    ...p,
    jogadores: [{ ...p.jogadores[0], mao }, { ...p.jogadores[1], mao: outraMao }],
    mesa,
    monte,
    inicioDaVez: { mao, mesa },
    proximoIdJogo: 100,
  };
}

/** Pega a partida de uma resposta, falhando o teste se deu erro. */
function ok(r: RespostaAcao): Partida {
  if (!r.ok) throw new Error(r.motivo);
  return r.partida;
}

describe('começo da partida', () => {
  it('distribui 9 cartas para cada um e o resto vai para o monte', () => {
    const p = novaPartida(regras, 42);
    expect(p.jogadores).toHaveLength(2);
    expect(p.jogadores.every((j) => j.mao.length === 9)).toBe(true);
    expect(p.monte).toHaveLength(104 - 18);
    const ids = [...p.monte, ...p.jogadores.flatMap((j) => j.mao)].map((c) => c.id);
    expect(new Set(ids).size).toBe(104);
  });
  it('com curinga ligado, o monte tem 108 cartas', () => {
    const p = novaPartida(criarRegras({ curinga: { ...regras.curinga, ativo: true } }), 42);
    expect(p.monte.length + 18).toBe(108);
  });
  it('de 1 a 3 adversários', () => {
    expect(novaPartida(criarRegras({ adversarios: 3 }), 1).jogadores).toHaveLength(4);
    expect(novaPartida(criarRegras({ adversarios: 9 }), 1).jogadores).toHaveLength(4);
  });
  it('a mesma semente dá a mesma partida', () => {
    expect(novaPartida(regras, 7)).toEqual(novaPartida(regras, 7));
  });
});

describe('fim de jogada', () => {
  it('não deixa terminar sem baixar nada', () => {
    const p = montar(cs('2c 3c 4c 9e'));
    const c = conferirJogada(p);
    expect(c.ok).toBe(false);
    expect(c.problemas[0]).toMatch(/pelo menos 1 carta/);
  });

  it('baixa um jogo novo e passa a vez', () => {
    let p = montar(cs('2c 3c 4c 9e'));
    const [a, b, d] = p.jogadores[0].mao;
    p = ok(moverCarta(p, a.id, { tipo: 'novoJogo' }));
    const jogoId = p.mesa[0].id;
    p = ok(moverCarta(p, b.id, { tipo: 'jogo', jogoId }));
    expect(conferirJogada(p).jogosInvalidos).toEqual([jogoId]); // só 2 cartas: ainda vermelho
    p = ok(moverCarta(p, d.id, { tipo: 'jogo', jogoId }));
    expect(conferirJogada(p).ok).toBe(true);
    p = ok(terminarJogada(p));
    expect(p.vez).toBe(1);
    expect(p.jogadores[0].mao).toHaveLength(1);
  });

  it('jogo inválido na mesa impede terminar', () => {
    let p = montar(cs('2c 3o 4c 9e'));
    for (const carta of p.jogadores[0].mao.slice(0, 3)) {
      p = ok(moverCarta(p, carta.id, p.mesa.length ? { tipo: 'jogo', jogoId: p.mesa[0].id } : { tipo: 'novoJogo' }));
    }
    expect(terminarJogada(p).ok).toBe(false);
  });

  it('carta da mesa não pode voltar para a mão', () => {
    const mesa = [{ id: 'j1', cartas: cs('4c 5c 6c 7c') }];
    const p = montar(cs('7e 7o'), mesa);
    const r = moverCarta(p, mesa[0].cartas[3].id, { tipo: 'mao' });
    expect(r.ok).toBe(false);
  });

  it('carta baixada nesta vez pode voltar para a mão', () => {
    let p = montar(cs('2c 3c 4c'));
    const carta = p.jogadores[0].mao[0];
    p = ok(moverCarta(p, carta.id, { tipo: 'novoJogo' }));
    p = ok(moverCarta(p, carta.id, { tipo: 'mao' }));
    expect(p.jogadores[0].mao).toHaveLength(3);
    expect(p.mesa).toHaveLength(0); // jogo vazio some
  });

  it('rearrumar: tira um 7 de cada jogo e faz trinca de 7 com 1 carta da mão', () => {
    const mesa = [
      { id: 'j1', cartas: cs('4c 5c 6c 7c') },
      { id: 'j2', cartas: cs('7o 8o 9o 10o') },
    ];
    let p = montar(cs('7e Kp'), mesa);
    const [seteCopas, seteOuros] = [mesa[0].cartas[3], mesa[1].cartas[0]];
    p = ok(moverCartas(p, [seteCopas.id, seteOuros.id], { tipo: 'novoJogo' }));
    p = ok(moverCarta(p, p.jogadores[0].mao[0].id, { tipo: 'jogo', jogoId: p.mesa[2].id }));
    expect(conferirJogada(p).ok).toBe(true);
  });

  it('da mão, só pode baixar 1 ou 3 cartas de uma vez', () => {
    const tentar = (mao: string, mesaTxt: string) => {
      const mesa = [{ id: 'j1', cartas: cs(mesaTxt) }];
      let p = montar(cs(mao + ' Kp'), mesa);
      const ids = p.jogadores[0].mao.slice(0, -1).map((c) => c.id);
      // Usa o movimento "cru" (carta por carta, sem a trava) para testar a conferência do fim da vez.
      for (const id of ids) p = ok(moverCarta(p, id, { tipo: 'jogo', jogoId: 'j1' }));
      return conferirJogada(p);
    };
    expect(tentar('7c', '4c 5c 6c').ok).toBe(true); // 1 carta
    expect(tentar('7c 8c', '4c 5c 6c').ok).toBe(false); // 2 cartas
    expect(tentar('7c 8c', '4c 5c 6c').problemas[0]).toMatch(/1 carta ou 3 cartas/);
    expect(tentar('7c 8c 9c', '4c 5c 6c').ok).toBe(true); // 3 cartas
    expect(tentar('7c 8c 9c 10c', '4c 5c 6c').ok).toBe(false); // 4 cartas
  });

  it('4 cartas da mão não pode, mesmo formando trinca', () => {
    const p = montar(cs('Jc Jc Je Jo 2c'));
    expect(moverCartas(p, p.jogadores[0].mao.slice(0, 4).map((c) => c.id), { tipo: 'novoJogo' }).ok).toBe(false);
  });

  it('rearrumar deixando a mesa inválida não pode', () => {
    const mesa = [{ id: 'j1', cartas: cs('4c 5c 6c') }];
    let p = montar(cs('6e 6o'), mesa);
    p = ok(moverCarta(p, mesa[0].cartas[2].id, { tipo: 'novoJogo' }));
    for (const carta of p.jogadores[0].mao) p = ok(moverCarta(p, carta.id, { tipo: 'jogo', jogoId: p.mesa[1].id }));
    const c = conferirJogada(p);
    expect(c.ok).toBe(false);
    expect(c.jogosInvalidos).toEqual(['j1']); // 4♥ 5♥ sozinhos
  });

  it('juntar dois jogos', () => {
    const mesa = [{ id: 'j1', cartas: cs('2c 3c 4c') }, { id: 'j2', cartas: cs('5c 6c 7c') }];
    let p = montar(cs('8c'), mesa);
    p = ok(juntarJogos(p, 'j2', 'j1'));
    p = ok(moverCarta(p, p.jogadores[0].mao[0].id, { tipo: 'jogo', jogoId: 'j1' }));
    expect(p.mesa).toHaveLength(1);
    expect(p.mesa[0].cartas).toHaveLength(7);
    expect(conferirJogada(p).ok).toBe(true);
  });

  it('zerar a mão vence', () => {
    let p = montar(cs('2c 3c 4c'));
    for (const carta of p.jogadores[0].mao) {
      p = ok(moverCarta(p, carta.id, p.mesa.length ? { tipo: 'jogo', jogoId: p.mesa[0].id } : { tipo: 'novoJogo' }));
    }
    p = ok(terminarJogada(p));
    expect(p.resultado).toMatchObject({ vencedor: 0, motivo: 'bateu' });
  });
});

describe('desfazer e recomeçar', () => {
  it('desfazer volta um passo; recomeçar volta tudo', () => {
    const inicio = montar(cs('2c 3c 4c'));
    const [a, b] = inicio.jogadores[0].mao;
    let p = ok(moverCarta(inicio, a.id, { tipo: 'novoJogo' }));
    p = ok(moverCarta(p, b.id, { tipo: 'jogo', jogoId: p.mesa[0].id }));
    const umPasso = desfazer(p);
    expect(umPasso.mesa[0].cartas).toHaveLength(1);
    expect(umPasso.jogadores[0].mao).toHaveLength(2);
    const tudo = recomecarJogada(p);
    expect(tudo.mesa).toEqual([]);
    expect(tudo.jogadores[0].mao).toEqual(inicio.jogadores[0].mao);
  });
});

describe('comprar e passar', () => {
  it('compra 1 carta e passa a vez, desfazendo o que tinha mexido', () => {
    let p = montar(cs('2c 3c 9e'));
    p = ok(moverCarta(p, p.jogadores[0].mao[0].id, { tipo: 'novoJogo' }));
    p = ok(comprarEPassar(p));
    expect(p.jogadores[0].mao).toHaveLength(4);
    expect(p.mesa).toEqual([]);
    expect(p.monte).toHaveLength(1);
    expect(p.vez).toBe(1);
  });

  it('monte vazio: vence quem tem menos pontos (Ás = 15, figura = 10)', () => {
    // Jogadora: A + 2 = 17 pontos.  Computador: K + Q = 20 pontos.
    const p = ok(comprarEPassar(montar(cs('Ac 2c'), [], cs('Kp Qp'), [])));
    expect(p.resultado).toEqual({ vencedor: 0, motivo: 'monteAcabou', pontos: [17, 20] });
  });

  it('monte vazio: o Ás pesa', () => {
    // Jogadora: A + A = 30.  Computador: K + Q = 20.
    const p = ok(comprarEPassar(montar(cs('Ac Ae'), [], cs('Kp Qp'), [])));
    expect(p.resultado?.vencedor).toBe(1);
  });

  it('monte vazio: empate de pontos desempata por menos cartas', () => {
    const p = ok(comprarEPassar(montar(cs('10c'), [], cs('5p 5e'), [])));
    expect(p.resultado?.vencedor).toBe(0);
  });

  it('regra alternativa: menos cartas', () => {
    const base = montar(cs('Ac Ae'), [], cs('2p 2e 2o'), []);
    const r = resultadoPorMonteVazio({ ...base, regras: criarRegras({ fimDoMonte: 'menosCartas' }) });
    expect(r.vencedor).toBe(0);
  });
});

describe('mover várias cartas', () => {
  it('três cartas para um jogo novo contam como 1 movimento', () => {
    const p0 = montar(cs('2c 3c 4c 9e'));
    const ids = p0.jogadores[0].mao.slice(0, 3).map((c) => c.id);
    const p = ok(moverCartas(p0, ids, { tipo: 'novoJogo' }));
    expect(p.mesa).toHaveLength(1);
    expect(p.mesa[0].cartas).toHaveLength(3);
    expect(p.historico).toHaveLength(1);
    expect(desfazer(p).mesa).toEqual([]);
  });
});

describe('trava da mão (1 ou 3 cartas de uma vez)', () => {
  const mesa = () => [{ id: 'j1', cartas: cs('4c 5c 6c') }];
  const ids = (p: Partida, n: number) => p.jogadores[0].mao.slice(0, n).map((c) => c.id);

  it('não deixa baixar 2 cartas da mão, nem por um instante', () => {
    const p = montar(cs('7c 8c 9c Kp'), mesa());
    const r = moverCartas(p, ids(p, 2), { tipo: 'jogo', jogoId: 'j1' });
    expect(r.ok).toBe(false);
    expect(moverCartas(p, ids(p, 4), { tipo: 'novoJogo' }).ok).toBe(false);
  });

  it('baixou 1: a mão trava', () => {
    let p = montar(cs('7c 8c 9c Kp'), mesa());
    p = ok(moverCartas(p, ids(p, 1), { tipo: 'jogo', jogoId: 'j1' }));
    const r = moverCartas(p, ids(p, 2), { tipo: 'jogo', jogoId: 'j1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/Desfazer/);
    // Desfazendo, volta a poder escolher.
    expect(moverCartas(desfazer(p), ids(desfazer(p), 3), { tipo: 'jogo', jogoId: 'j1' }).ok).toBe(true);
  });

  it('baixou 3 de uma vez: pode; devolver só 1 (sobrando 2) não pode; devolver as 3 pode', () => {
    let p = montar(cs('7c 8c 9c Kp'), mesa());
    const tres = ids(p, 3);
    p = ok(moverCartas(p, tres, { tipo: 'jogo', jogoId: 'j1' }));
    expect(moverCartas(p, [tres[2]], { tipo: 'mao' }).ok).toBe(false);
    expect(moverCartas(p, tres, { tipo: 'mao' }).ok).toBe(true);
  });

  it('mexer só na mesa continua livre depois de baixar', () => {
    const m = [{ id: 'j1', cartas: cs('4c 5c 6c 7c') }, { id: 'j2', cartas: cs('9e 9o 9p') }];
    let p = montar(cs('8c Kp'), m);
    p = ok(moverCartas(p, ids(p, 1), { tipo: 'jogo', jogoId: 'j1' }));
    p = ok(moverCartas(p, [m[0].cartas[0].id], { tipo: 'novoJogo' }));
    expect(p.mesa).toHaveLength(3);
  });
});

describe('3 cartas da mão: todas no mesmo jogo', () => {
  it('não pode 1 num jogo e 2 em outro (como no print da família)', () => {
    // Mesa: 9♣ 10♣ J♣ e 9♥ 9♠ 9♦. Mão: Q♣ 8♥ 10♥.
    const mesa = [
      { id: 'j1', cartas: cs('9p 10p Jp') },
      { id: 'j2', cartas: cs('9c 9e 9o') },
    ];
    let p = montar(cs('Qp 8c 10c Ke'), mesa);
    const [q, oito, dez] = p.jogadores[0].mao;
    const noveCopas = mesa[1].cartas[0];
    for (const [id, destino] of [
      [q.id, { tipo: 'jogo', jogoId: 'j1' }],
      [noveCopas.id, { tipo: 'novoJogo' }],
    ] as const) p = ok(moverCarta(p, id, destino));
    p = ok(moverCarta(p, oito.id, { tipo: 'jogo', jogoId: p.mesa[2].id }));
    p = ok(moverCarta(p, dez.id, { tipo: 'jogo', jogoId: p.mesa[2].id }));
    const c = conferirJogada(p);
    expect(c.ok).toBe(false);
    expect(c.problemas.join(' ')).toMatch(/mesmo jogo/);
  });

  it('3 cartas da mão juntas num jogo (mesmo com carta da mesa) pode', () => {
    const mesa = [{ id: 'j1', cartas: cs('4c 5c 6c') }];
    let p = montar(cs('7c 8c 9c Kp'), mesa);
    p = ok(moverCartas(p, p.jogadores[0].mao.slice(0, 3).map((c) => c.id), { tipo: 'jogo', jogoId: 'j1' }));
    expect(conferirJogada(p).ok).toBe(true);
  });
});

describe('3 cartas da mão: precisam formar um jogo sozinhas', () => {
  it('7♠ 8♠ 10♠ não pode, mesmo usando o 9♠ da mesa (como no print da família)', () => {
    const mesa = [{ id: 'j1', cartas: cs('9e 9c 9o') }];
    const p = montar(cs('7e 8e 10e Kp'), mesa);
    const r = moverCartas(p, p.jogadores[0].mao.slice(0, 3).map((c) => c.id), { tipo: 'novoJogo' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/formar um jogo sozinhas/);
  });
  it('2-2-2 e 2-3-4 podem', () => {
    for (const mao of ['2c 2e 2o Kp', '2e 3e 4e Kp']) {
      const p = montar(cs(mao));
      const r = moverCartas(p, p.jogadores[0].mao.slice(0, 3).map((c) => c.id), { tipo: 'novoJogo' });
      expect(r.ok && conferirJogada(r.partida).ok).toBe(true);
    }
  });
});
