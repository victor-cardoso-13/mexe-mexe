import { describe, expect, it } from 'vitest';
import { NAIPES, aleatorio, type Carta } from '../src/motor/cartas';
import { criarRegras, type Regras } from '../src/motor/regras';
import { validarJogo } from '../src/motor/validacao';
import { Divisor } from '../src/ia/exata';
import { dividirViavel, viavel } from '../src/ia/viavel';

/**
 * O verificador rápido (viavel.ts) tem que dar SEMPRE a mesma resposta que a busca completa antiga
 * (Divisor com orçamento sem limite), e toda divisão que ele devolve tem que valer nas regras.
 */
const base = criarRegras();
const comCuringa = criarRegras({ curinga: { ...base.curinga, ativo: true } });
const ladoALado = criarRegras({ curinga: { ...base.curinga, ativo: true, permitirLadoALado: true } });
const asAteAs = criarRegras({ permitirSequenciaAsAteAs: true, curinga: { ...base.curinga, ativo: true } });

const tipo = (i: number) => (i === 52 ? 'curinga' : `${(i % 13) + 1}-${NAIPES[Math.floor(i / 13)]}`);
const carta = (i: number, k: number): Carta =>
  i === 52 ? { id: `c${k}`, curinga: true } : { id: `x${k}`, curinga: false, naipe: NAIPES[Math.floor(i / 13)], valor: (i % 13) + 1 };

function antiga(qtd: number[], regras: Regras): boolean {
  const m = new Map<string, number>();
  qtd.forEach((n, i) => n > 0 && m.set(tipo(i), n));
  const relogio = { fim: performance.now() + 60000, acabou: false };
  const r = new Divisor(regras, relogio, new Set()).dividir(m, Infinity);
  expect(relogio.acabou).toBe(false);
  return r !== null;
}

function conferirDivisao(qtd: number[], regras: Regras) {
  const jogos = dividirViavel(qtd, regras);
  if (!jogos) return false;
  const usado = new Array(53).fill(0);
  let k = 0;
  for (const j of jogos) {
    for (const i of j) usado[i]++;
    const r = validarJogo(
      j.map((i) => carta(i, k++)),
      regras,
    );
    expect(r.valido, `jogo inválido: ${j.map(tipo).join(' ')}`).toBe(true);
  }
  expect(usado).toEqual(qtd);
  return true;
}

/** Sorteio puxado para os casos difíceis: poucos naipes, valores perto das pontas (Ás), coringas. */
function sortear(semente: number) {
  let s = semente;
  const r = () => {
    const x = aleatorio(s);
    s = x.semente;
    return x.valor;
  };
  const qtd = new Array(53).fill(0);
  const naipes = 1 + Math.floor(r() * 4);
  const largura = 4 + Math.floor(r() * 10);
  const comeco = Math.floor(r() * 14); // 0..13 → janela pode passar do K para o Ás
  const n = 4 + Math.floor(r() * 12);
  for (let k = 0; k < n; k++) {
    const naipe = Math.floor(r() * naipes);
    const pos = ((comeco + Math.floor(r() * largura)) % 13) + 1;
    const i = naipe * 13 + pos - 1;
    if (qtd[i] < 2) qtd[i]++;
  }
  qtd[52] = Math.floor(r() * r() * 5);
  return qtd;
}

/** Monte que costuma dar certo: alguns jogos válidos sorteados + uma carta a mais (como na dica). */
function sortearQuaseCerto(semente: number) {
  let s = semente;
  const r = () => {
    const x = aleatorio(s);
    s = x.semente;
    return x.valor;
  };
  const qtd = new Array(53).fill(0);
  const jogos = 2 + Math.floor(r() * 4);
  for (let k = 0; k < jogos; k++) {
    const naipe = Math.floor(r() * 2);
    if (r() < 0.4) {
      const v = Math.floor(r() * 13);
      for (let t = 0; t < 3; t++) qtd[((naipe + t) % 4) * 13 + v] = Math.min(2, qtd[((naipe + t) % 4) * 13 + v] + 1);
    } else {
      const ini = 1 + Math.floor(r() * 12);
      const tam = 3 + Math.floor(r() * 4);
      for (let w = ini; w < ini + tam && w <= 14; w++) {
        const i = naipe * 13 + (w === 14 ? 0 : w - 1);
        if (r() < 0.15 && w > ini && w < ini + tam - 1) qtd[52] = Math.min(4, qtd[52] + 1);
        else qtd[i] = Math.min(2, qtd[i] + 1);
      }
    }
  }
  const extra = Math.floor(r() * 52);
  qtd[extra] = Math.min(2, qtd[extra] + 1);
  return qtd;
}

describe('verificador rápido (viavel) = busca completa antiga', () => {
  for (const [nome, regras] of [
    ['com coringa', comCuringa],
    ['sem coringa', base],
    ['coringas lado a lado', ladoALado],
    ['A..A', asAteAs],
  ] as const) {
    it(nome, () => {
      let sim = 0;
      for (let k = 0; k < 1500; k++) {
        const qtd = k % 2 ? sortear(k * 7919 + 13) : sortearQuaseCerto(k * 104729 + 7);
        if (!regras.curinga.ativo) qtd[52] = 0;
        const esperado = antiga(qtd, regras);
        expect(viavel(qtd, regras), `monte ${k}: ${qtd.flatMap((n, i) => Array(n).fill(tipo(i))).join(' ')}`).toBe(esperado);
        if (esperado) {
          sim++;
          expect(conferirDivisao(qtd, regras)).toBe(true);
        }
      }
      expect(sim).toBeGreaterThan(100); // o sorteio tem casos dos dois tipos
    }, 120000);
  }

  it('casos de ponta', () => {
    const q = (txt: string) => {
      const qtd = new Array(53).fill(0);
      for (const t of txt.split(' ')) {
        if (t === '*') qtd[52]++;
        else {
          const naipe = 'cepo'.indexOf(t.slice(-1));
          const v = { A: 1, J: 11, Q: 12, K: 13 }[t.slice(0, -1)] ?? Number(t.slice(0, -1));
          qtd[naipe * 13 + v - 1]++;
        }
      }
      return qtd;
    };
    expect(viavel(q('Qc Kc Ac'), comCuringa)).toBe(true); // Ás alto
    expect(viavel(q('Ac 2c 3c'), comCuringa)).toBe(true); // Ás baixo
    expect(viavel(q('Kc Ac 2c'), comCuringa)).toBe(false); // não dá a volta
    expect(viavel(q('Qc * Ac'), comCuringa)).toBe(true);
    expect(viavel(q('* Kc Ac'), comCuringa)).toBe(false); // coringa na ponta
    expect(viavel(q('3c * * 6c'), comCuringa)).toBe(false); // lado a lado
    expect(viavel(q('3c * * 6c'), ladoALado)).toBe(true);
    expect(viavel(q('4e 4o 4p 4c'), comCuringa)).toBe(false); // 4 naipes com 4 cartas
    expect(viavel(q('4e 4o 4p 4c 4e 4o'), comCuringa)).toBe(true);
    expect(viavel(q('Ac 2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac'), comCuringa)).toBe(true); // A-2-3 e 4..K-A
    expect(viavel(q('Ac 2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Kc Ac Qc'), asAteAs)).toBe(true);
    expect(viavel(q('4c 5c 6c 5c *'), comCuringa)).toBe(false); // 5 cartas não viram 2 jogos
    expect(viavel(q('Ac 2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc'), comCuringa)).toBe(true);
    expect(viavel(q('2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac Ac'), comCuringa)).toBe(true); // A-2-3 e 4..K-A
    expect(viavel(q('Jc Qc Kc Ac Ac'), comCuringa)).toBe(false); // sobra um Ás
  });
});
