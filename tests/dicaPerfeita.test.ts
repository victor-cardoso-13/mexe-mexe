import { describe, expect, it } from 'vitest';
import { criarRegras } from '../src/motor/regras';
import { conferir } from '../src/motor/partida';
import { pensar } from '../src/ia';
import { cs } from './ajuda';

const regras = criarRegras({ curinga: { ativo: true, quantidade: 4, pontos: 20, maximoPorJogo: null, permitirLadoALado: false } });

/** Mesa do print do Victor (1/11/2026): a dica dizia "não achei jogada". */
const MESA_DO_PRINT = [
  '2e 3e 4e 5e 6e', '9c 10c Jc', '8p 9p 10p Jp', '2e 3e 4e', '6e * 8e', '5e 5o 5p',
  '7p 8p 9p 10p Jp', '9c 9e 9o', '10o Jo Qo', '7e 7o 7p', 'Qo * Ao', 'Jc Qc Kc', '4o 5o * 7o',
].map((t, i) => ({ id: `j${i}`, cartas: cs(t) }));

describe('dica perfeita', () => {
  it('acha a jogada do print: 4♥ vira trinca de 4 e o coringa vai para a sequência de espadas', () => {
    const mao = cs('2c 4c Ap');
    const j = pensar(regras, { mao, mesa: MESA_DO_PRINT }, 'dificil', 100, { dica: true });
    expect(j).not.toBeNull();
    expect(j!.foto.mao).toHaveLength(2);
    expect(conferir(regras, { mao, mesa: MESA_DO_PRINT }, j!.foto).ok).toBe(true);
  });
});
