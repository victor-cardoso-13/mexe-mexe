import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { criarRegras } from '../src/motor/regras';
import { conferir } from '../src/motor/partida';
import { pensar } from '../src/ia';
import { csDiario } from './ajuda';

/**
 * Casos reais em que a dica disse "não achei" e o jogador achou uma jogada.
 * Cada arquivo de tests/dicas-perdidas/*.json é um caso: { mao, mesa: [jogos], nota }.
 * Para acrescentar um caso: baixe o diário em Ajustes e copie a mão e a mesa do "dica: não achou".
 */
const regras = criarRegras({ curinga: { ativo: true, quantidade: 4, pontos: 20, maximoPorJogo: null, permitirLadoALado: false } });
const pasta = new URL('./dicas-perdidas/', import.meta.url);

describe('dicas perdidas (casos reais)', () => {
  for (const arq of readdirSync(pasta).filter((a) => a.endsWith('.json'))) {
    it(arq, () => {
      const caso = JSON.parse(readFileSync(new URL(arq, pasta), 'utf8')) as { mao: string; mesa: string[] };
      const inicio = { mao: csDiario(caso.mao), mesa: caso.mesa.map((t, i) => ({ id: `j${i}`, cartas: csDiario(t) })) };
      const j = pensar(regras, inicio, 'dificil', 100, { dica: true });
      expect(j, 'a dica deveria achar jogada').not.toBeNull();
      expect(conferir(regras, inicio, j!.foto).ok).toBe(true);
    }, 60000);
  }
});
