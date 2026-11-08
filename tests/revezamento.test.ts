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
