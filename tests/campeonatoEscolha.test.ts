import { describe, expect, it } from 'vitest';
import { semOsEliminados, situacaoDoCampeonato, type Campeonato } from '../src/motor/campeonato';

const camp = (totais: number[]): Campeonato => ({ alvo: 100, totais, rodada: 5, contada: '' });

describe('campeonato: continuar sem quem chegou a 100', () => {
  it('com 3 jogadores, quem passa de 100 abre a escolha (se você e mais alguém continuam abaixo)', () => {
    expect(situacaoDoCampeonato(camp([60, 105, 80]), true)).toMatchObject({ acabou: false, podeContinuar: true });
  });
  it('sem a escolha (online) o campeonato acaba como antes', () => {
    expect(situacaoDoCampeonato(camp([60, 105, 80]))).toEqual({ acabou: true, campeao: 0 });
  });
  it('com 2 jogadores acaba na hora', () => {
    expect(situacaoDoCampeonato(camp([60, 105]), true)).toEqual({ acabou: true, campeao: 0 });
  });
  it('se você mesmo passou de 100, não há escolha', () => {
    expect(situacaoDoCampeonato(camp([101, 40, 50]), true).podeContinuar).toBeUndefined();
  });
  it('"terminar aqui" encerra e ganha quem tem menos pontos', () => {
    expect(situacaoDoCampeonato({ ...camp([60, 105, 30]), encerrado: true }, true)).toEqual({ acabou: true, campeao: 2 });
  });
  it('continuar tira os eliminados, guarda os pontos de quem fica e passa para a próxima rodada', () => {
    const c = semOsEliminados(camp([60, 105, 80]));
    expect(c.totais).toEqual([60, 80]);
    expect(c.rodada).toBe(6);
  });
});
