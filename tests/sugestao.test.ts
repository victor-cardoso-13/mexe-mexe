import { describe, expect, it } from 'vitest';
import { validarSugestao } from '../src/motor/sugestao';
import { diarioParaEnviar, MAX_DIARIO_SUGESTAO, type Anotacao } from '../src/ui/diario';

const anotacao = (n: number): Anotacao => ({ hora: '2026-11-04T10:00:00Z', evento: 'computador jogou', n, mesa: Array(30).fill('7♥ 8♥ 9♥ 10♥ J♥') });

describe('sugestão', () => {
  it('tira os espaços das pontas e confere o tamanho', () => {
    expect(validarSugestao('  oi  ')).toEqual({ ok: false, motivo: 'curta' });
    expect(validarSugestao('  ótimo jogo  ')).toEqual({ ok: true, texto: 'ótimo jogo' });
    expect(validarSugestao('x'.repeat(1001))).toEqual({ ok: false, motivo: 'longa' });
  });
});

describe('diário que vai junto com a sugestão', () => {
  it('cabendo, vai inteiro e numa linha só', () => {
    const texto = diarioParaEnviar(MAX_DIARIO_SUGESTAO, [anotacao(1), anotacao(2)], [anotacao(3)]);
    const d = JSON.parse(texto);
    expect(d.jogo).toBe('mexe-mexe');
    expect(d.diario.map((a: Anotacao) => a.n)).toEqual([1, 2]);
    expect(d.dicasQuePerderam).toHaveLength(1);
    expect(texto).not.toContain('\n');
  });

  it('passando do limite, tira as anotações mais antigas e fica as últimas', () => {
    const muitas = Array.from({ length: 80 }, (_, i) => anotacao(i));
    const texto = diarioParaEnviar(20_000, muitas, []);
    expect(texto.length).toBeLessThanOrEqual(20_000);
    const d = JSON.parse(texto);
    expect(d.diario.length).toBeGreaterThan(0);
    expect(d.diario.at(-1).n).toBe(79); // a mais nova continua
  });

  it('nunca passa do limite das regras do Firebase', () => {
    const enormes = Array.from({ length: 80 }, (_, i) => ({ ...anotacao(i), lixo: 'x'.repeat(10_000) }));
    expect(diarioParaEnviar(MAX_DIARIO_SUGESTAO, enormes, enormes).length).toBeLessThanOrEqual(250_000);
  });
});
