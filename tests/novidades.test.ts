import { describe, expect, it } from 'vitest';
import { criarRegras } from '../src/motor/regras';
import { comprarEPassar, mesaMexidaEstaCerta, moverCarta, moverCartas, novaPartida, type Jogo, type Partida, type RespostaAcao } from '../src/motor/partida';
import { separarEmJogos, validarJogo } from '../src/motor/validacao';
import { novoCampeonato, ordemDoPlacar, pontosDaRodada, situacaoDoCampeonato, somarRodada } from '../src/motor/campeonato';
import type { Carta } from '../src/motor/cartas';
import { htmlFim } from '../src/ui/desenho';
import { cs } from './ajuda';

const regras = criarRegras();
function montar(mao: Carta[], mesa: Jogo[] = [], monte: Carta[] = cs('2p 3p')): Partida {
  const p = novaPartida(regras, 1);
  return { ...p, jogadores: [{ ...p.jogadores[0], mao }, { ...p.jogadores[1], mao: cs('Kp Kp Ko') }], mesa, monte, inicioDaVez: { mao, mesa }, proximoIdJogo: 100 };
}
const ok = (r: RespostaAcao): Partida => {
  if (!r.ok) throw new Error(r.motivo);
  return r.partida;
};

describe('mesa que se arruma sozinha', () => {
  it('separa 3-4-5-2-A-3 do mesmo naipe em A-2-3 e 3-4-5', () => {
    const grupos = separarEmJogos(cs('3c 4c 5c 2c Ac 3c'), regras)!;
    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => validarJogo(g, regras).valido)).toBe(true);
  });
  it('não separa se não houver jeito', () => {
    expect(separarEmJogos(cs('3c 4c 5c 9e Ac 3o'), regras)).toBeNull();
  });
  it('ao encaixar uma carta e o jogo ficar 3-4-5-2-A-3, a mesa se separa', () => {
    const mesa = [{ id: 'j1', cartas: cs('3c 4c 5c 2c Ac') }, { id: 'j2', cartas: cs('9e 9o 9p') }];
    const p0 = montar(cs('3c 8e'), mesa);
    // as 5 cartas já estavam; a 3c da mão chega no fim e o jogo todo deixa de valer
    const p = ok(moverCartas(p0, [p0.jogadores[0].mao[0].id], { tipo: 'jogo', jogoId: 'j1' }));
    expect(p.mesa.length).toBe(3); // sem a separação automática seria 2
  });
  it('as 3 cartas baixadas da mão continuam juntas', () => {
    const mesa = [{ id: 'j1', cartas: cs('5c 6c 7c') }];
    const p0 = montar(cs('8c 9c 10c 2o'), mesa);
    const ids = p0.jogadores[0].mao.slice(0, 3).map((c) => c.id);
    const p = ok(moverCartas(p0, ids, { tipo: 'jogo', jogoId: 'j1' }));
    expect(p.mesa.map((j) => j.cartas.length)).toEqual([6]); // 5-10 do mesmo naipe é um jogo só e vale
  });
});

describe('tirar uma carta do meio de uma sequência comprida', () => {
  it('5-6-7-8-9-10-J-Q-K-A sem o 10 vira 5-9 e J-A', () => {
    const mesa = [{ id: 'j1', cartas: cs('5o 6o 7o 8o 9o 10o Jo Qo Ko Ao') }];
    const p0 = montar(cs('2c'), mesa);
    const dez = mesa[0].cartas[5].id;
    const p = ok(moverCartas(p0, [dez], { tipo: 'novoJogo' }));
    // o 10 fica sozinho num jogo novo; o resto se separa em dois jogos que valem
    expect(p.mesa.map((j) => j.cartas.length).sort()).toEqual([1, 4, 5]);
  });
});

describe('comprar depois de arrumar a mesa', () => {
  it('mesa mexida e toda certa: dá para comprar e a mesa arrumada fica', () => {
    const mesa = [{ id: 'j1', cartas: cs('3c 4c 5c 6c') }];
    const p0 = montar(cs('9e'), mesa);
    const p1 = ok(moverCarta(p0, mesa[0].cartas[3].id, { tipo: 'novoJogo' })); // 6c sai: jogos 3-4-5 e 6
    expect(mesaMexidaEstaCerta(p1)).toBe(false);
    const p2 = ok(moverCarta(p1, p1.mesa[1].cartas[0].id, { tipo: 'jogo', jogoId: 'j1' })); // volta
    const p3 = ok(moverCarta(p2, p2.mesa[0].cartas[0].id, { tipo: 'jogo', jogoId: 'j1' })); // mexe de novo, ainda certo
    expect(mesaMexidaEstaCerta(p3)).toBe(true);
    const comprou = ok(comprarEPassar(p3));
    expect(comprou.vez).toBe(1);
    expect(comprou.mesa).toHaveLength(1);
  });
  it('mesa com jogo errado: comprar desfaz tudo', () => {
    const mesa = [{ id: 'j1', cartas: cs('3c 4c 5c 6c') }];
    const p0 = montar(cs('9e'), mesa);
    const p1 = ok(moverCarta(p0, mesa[0].cartas[3].id, { tipo: 'novoJogo' }));
    const comprou = ok(comprarEPassar(p1));
    expect(comprou.mesa[0].cartas).toHaveLength(4);
  });
});

describe('campeonato até 100 pontos', () => {
  const resultado = (vencedor: number | null, pontos: number[]) => ({ vencedor, motivo: 'bateu' as const, pontos });
  it('quem ganha fica com 0 e quem perde soma o que sobrou', () => {
    expect(pontosDaRodada(resultado(0, [0, 35]))).toEqual([0, 35]);
    expect(pontosDaRodada(resultado(1, [20, 0]))).toEqual([20, 0]);
    expect(pontosDaRodada(resultado(null, [20, 20]))).toEqual([0, 0]);
  });
  it('soma uma vez só por partida', () => {
    let c = novoCampeonato(2);
    c = somarRodada(c, resultado(0, [0, 40]), 'a');
    c = somarRodada(c, resultado(0, [0, 40]), 'a');
    expect(c.totais).toEqual([0, 40]);
  });
  it('acaba quando alguém chega a 100; ganha quem tem menos pontos', () => {
    let c = novoCampeonato(2);
    expect(situacaoDoCampeonato(c).acabou).toBe(false);
    c = somarRodada(c, resultado(0, [0, 70]), 'a');
    expect(situacaoDoCampeonato(c).acabou).toBe(false);
    c = somarRodada(c, resultado(0, [0, 40]), 'b');
    expect(situacaoDoCampeonato(c)).toEqual({ acabou: true, campeao: 0 });
  });
  it('empate no menor total: joga mais uma rodada', () => {
    const c = { ...novoCampeonato(2), totais: [100, 100] };
    expect(situacaoDoCampeonato(c).acabou).toBe(false);
  });
});

describe('placar do campeonato em ordem', () => {
  it('põe quem tem menos pontos na frente (1, 2, 3...)', () => {
    const o = ordemDoPlacar([35, 60, 18, 82]);
    expect(o.map((l) => l.jogador)).toEqual([2, 0, 1, 3]);
    expect(o.map((l) => l.posicao)).toEqual([1, 2, 3, 4]);
  });
  it('empatados dividem a posição e o próximo pula (1, 1, 3)', () => {
    const o = ordemDoPlacar([20, 20, 50]);
    expect(o.map((l) => l.posicao)).toEqual([1, 1, 3]);
    expect(o.map((l) => l.jogador)).toEqual([0, 1, 2]);
  });
  it('no começo (todos com 0) ninguém muda de lugar', () => {
    expect(ordemDoPlacar([0, 0, 0]).map((l) => l.jogador)).toEqual([0, 1, 2]);
  });
});

describe('janela de fim de rodada', () => {
  const comResultado = (n: number): Partida => {
    const p0 = novaPartida(criarRegras({ adversarios: n - 1 }), 1);
    return { ...p0, resultado: { vencedor: 1, pontos: p0.jogadores.map(() => 10), motivo: 'bateu' } } as Partida;
  };
  it('2 jogadores: dois números grandes lado a lado', () => {
    const p = comResultado(2);
    const html = htmlFim(p, { ...novoCampeonato(2), totais: [35, 60], rodada: 2 });
    expect(html).toContain('class="dupla"');
    expect(html).not.toContain('class="lin"');
  });
  it.each([3, 4])('%i jogadores: uma linha por jogador, com a coroa em quem está ganhando', (n) => {
    const p = comResultado(n);
    const totais = [35, 60, 18, 82].slice(0, n);
    const html = htmlFim(p, { ...novoCampeonato(n), totais, rodada: 2 });
    expect(html.match(/class="lin"/g)).toHaveLength(n);
    expect(html.match(/👑/g)).toHaveLength(1);
    expect(html.indexOf('>18<') === -1 ? true : html.indexOf('>18<') < html.indexOf('>35<')).toBe(true);
  });
});

describe('nomes dos adversários', () => {
  it('um adversário: "Adversário"; vários: "Adversário 1, 2, 3" (bolinhas 1, 2, 3, não A, 2, 3)', () => {
    expect(novaPartida(criarRegras({ adversarios: 1 }), 1).jogadores.map((j) => j.nome)).toEqual(['Você', 'Adversário']);
    expect(novaPartida(criarRegras({ adversarios: 3 }), 1).jogadores.map((j) => j.nome)).toEqual(['Você', 'Adversário 1', 'Adversário 2', 'Adversário 3']);
  });
  it('depois que alguém sai do campeonato, os que ficam guardam o nome', () => {
    const nomes = ['Você', 'Adversário 1', 'Adversário 2'];
    expect(novaPartida(criarRegras({ adversarios: 2 }), 7, nomes).jogadores.map((j) => j.nome)).toEqual(nomes);
  });
});
