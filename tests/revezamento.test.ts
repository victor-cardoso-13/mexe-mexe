import { describe, expect, it } from 'vitest';
import { forcaNoSorteio, novoCampeonato, proximoAComecar, sortearQuemComeca } from '../src/motor/campeonato';
import { criarRegras } from '../src/motor/regras';
import { novaPartida } from '../src/motor/partida';

describe('quem começa cada rodada', () => {
  it('a vez de começar passa de 1 em 1 e dá a volta', () => {
    let c = { ...novoCampeonato(3), primeiro: 1 };
    const quem: number[] = [];
    for (let i = 0; i < 4; i++) {
      const p = proximoAComecar(c);
      quem.push(p);
      c = { ...c, primeiro: p };
    }
    expect(quem).toEqual([2, 0, 1, 2]);
  });
  it('campeonato antigo (sem "primeiro") conta como se você tivesse começado', () => {
    expect(proximoAComecar(novoCampeonato(2))).toBe(1);
  });
  it('quem saiu é pulado, e o número novo vale para a lista dos que ficaram', () => {
    // 4 jogadores, o 1 começou, o 2 saiu: quem fica é 0, 1, 3 → o próximo é o 3 (posição 2 na lista nova)
    const c = { ...novoCampeonato(4), primeiro: 1 };
    expect(proximoAComecar(c, [0, 1, 3])).toBe(2);
    // o 3 começou e saiu o 0: próximo vivo depois do 3 é o 1 (posição 0 na lista [1,2])
    expect(proximoAComecar({ ...c, primeiro: 3 }, [1, 2])).toBe(0);
  });
  it('a partida começa com a vez e a mão de quem foi escolhido', () => {
    const p = novaPartida(criarRegras({ adversarios: 2 }), 7, undefined, 2);
    expect(p.vez).toBe(2);
    expect(p.inicioDaVez.mao).toBe(p.jogadores[2].mao);
    expect(novaPartida(criarRegras(), 7).vez).toBe(0);
  });
});

describe('sorteio de quem começa', () => {
  it('termina com um vencedor que tirou a maior carta; empate só entre os empatados', () => {
    for (let semente = 1; semente <= 400; semente++) {
      for (const n of [2, 3, 4]) {
        const tiradas = sortearQuemComeca(n, semente);
        const ultima = tiradas[tiradas.length - 1];
        expect(ultima.vencedor).not.toBeNull();
        tiradas.forEach((t, k) => {
          const maior = Math.max(...t.cartas.map(forcaNoSorteio));
          const topo = t.jogadores.filter((_, i) => forcaNoSorteio(t.cartas[i]) === maior);
          if (t.vencedor === null) {
            expect(topo.length).toBeGreaterThan(1);
            expect(tiradas[k + 1].jogadores).toEqual(topo); // só os empatados tiram de novo
          } else {
            expect(topo).toEqual([t.vencedor]);
          }
        });
      }
    }
  });
  it('o Ás vale mais que o Rei', () => {
    expect(forcaNoSorteio({ id: 'a', curinga: false, naipe: 'copas', valor: 1 })).toBeGreaterThan(forcaNoSorteio({ id: 'k', curinga: false, naipe: 'copas', valor: 13 }));
  });
  it('não usa coringa', () => {
    for (let s = 1; s < 50; s++) expect(sortearQuemComeca(4, s).every((t) => t.cartas.every((c) => !c.curinga))).toBe(true);
  });
});

import { distribuir, salaInicial, sorteioDaRodada, sorteioLocal, ativos, type Sala } from '../src/online/logica';

function salaCom(n: number, modo: 'casual' | 'campeonato'): Sala {
  let s = salaInicial({ uid: 'u0', nome: 'A' }, { curinga: false, modo, limiteSeg: 180 }, 1_700_000_000_000 + 12345);
  for (let i = 1; i < n; i++) s = { ...s, jogadores: [...s.jogadores, { uid: `u${i}`, nome: `J${i}` }], uids: [...s.uids, `u${i}`], cartas: [...s.cartas, 0], totais: [...s.totais, 0] };
  return s;
}

describe('online: quem começa', () => {
  it('campeonato: sorteio só na 1ª rodada e depois a vez passa de 1 em 1 (o sorteado, o do lado, o seguinte...)', () => {
    for (const n of [2, 3, 4]) {
      const s = salaCom(n, 'campeonato');
      const primeiro = sorteioDaRodada(s, 1).primeiro;
      for (let r = 1; r <= 7; r++) expect(sorteioDaRodada(s, r).primeiro).toBe((primeiro + r - 1) % n);
      expect(distribuir({ ...s, rodada: 2 }, 5, 0).patch.vez).toBe((primeiro + 2) % n);
    }
  });
  it('campeonato: quem saiu da sala é pulado e o sorteio não muda', () => {
    const s = salaCom(4, 'campeonato');
    const p1 = sorteioDaRodada(s, 1).primeiro;
    const sem = { ...s, jogadores: s.jogadores.map((j, i) => (i === (p1 + 1) % 4 ? { ...j, removido: true } : j)) };
    expect(sorteioDaRodada(sem, 1).primeiro).toBe(p1);
    expect(sorteioDaRodada(sem, 2).primeiro).toBe((p1 + 2) % 4);
    expect(ativos(sem)).not.toContain((p1 + 1) % 4);
  });
  it('casual: sorteia de novo a cada rodada, e todo aparelho vê o mesmo sorteio', () => {
    const s = salaCom(3, 'casual');
    const vistos = new Set<number>();
    for (let r = 1; r <= 30; r++) {
      const a = sorteioDaRodada(s, r);
      expect(sorteioDaRodada(s, r)).toEqual(a);
      vistos.add(a.primeiro);
    }
    expect(vistos.size).toBe(3);
  });
  it('na tela de cada um, o vencedor local é a mesma pessoa', () => {
    const s = salaCom(3, 'casual');
    const g = sorteioDaRodada(s, 4).primeiro;
    for (let eu = 0; eu < 3; eu++) expect(sorteioLocal(s, eu, 4).primeiro).toBe((g - eu + 3) % 3);
  });
});

import { movimentosUmAUm } from '../src/ui/animacao';
import { cs } from './ajuda';

describe('animação: ordem em que o computador baixa as cartas', () => {
  it('um jogo novo entra na ordem da mesa (6 7 8), mesmo que o computador o tenha guardado como 7 6 8', () => {
    const [c7, c6, c8] = cs('7p 6p 8p');
    const depois = [{ id: 'j1', cartas: [c7, c6, c8] }];
    const ordem = movimentosUmAUm([], depois, criarRegras()).map((m) => m.cartaId);
    expect(ordem).toEqual([c6.id, c7.id, c8.id]);
  });
});
