import { describe, expect, it } from 'vitest';
import { NAIPES, aleatorio, type Carta } from '../src/motor/cartas';
import { criarRegras, type Regras } from '../src/motor/regras';
import { validarJogo } from '../src/motor/validacao';
import { Divisor } from '../src/ia/exata';
import { menorArrumacao } from '../src/ia/arrumacao';
import { jogosPossiveisDaContagem } from '../src/ia/combinacoes';

/**
 * A arrumação que mexe menos (arrumacao.ts) tem que achar o MESMO custo mínimo que a busca completa antiga
 * (Divisor, subindo o orçamento de 1 em 1), e toda arrumação devolvida tem que valer nas regras.
 */
const base = criarRegras();
const comCuringa = criarRegras({ curinga: { ...base.curinga, ativo: true } });
const ladoALado = criarRegras({ curinga: { ...base.curinga, ativo: true, permitirLadoALado: true } });

const tipo = (i: number) => (i === 52 ? 'curinga' : `${(i % 13) + 1}-${NAIPES[Math.floor(i / 13)]}`);
const idx = (t: string) => (t === 'curinga' ? 52 : NAIPES.indexOf(t.split('-')[1] as (typeof NAIPES)[number]) * 13 + Number(t.split('-')[0]) - 1);
const carta = (i: number, k: number): Carta =>
  i === 52 ? { id: `c${k}`, curinga: true } : { id: `x${k}`, curinga: false, naipe: NAIPES[Math.floor(i / 13)], valor: (i % 13) + 1 };
const PESOS = Array.from({ length: 53 }, (_, i) => (i + 1) * 7919 * 104729 + i * i);
const assinatura = (j: number[]) => j.reduce((a, i) => a + PESOS[i], 0);

/** Mesa sorteada: jogos válidos sem repetir carta além de 2 por tipo, + 1 carta extra (como a da mão). */
function sortearMesa(semente: number, regras: Regras) {
  let s = semente;
  const r = () => {
    const x = aleatorio(s);
    s = x.semente;
    return x.valor;
  };
  const qtd = new Array(53).fill(0);
  const mesa: number[][] = [];
  const naipes = 1 + Math.floor(r() * 3);
  const tentativas = 3 + Math.floor(r() * 6);
  for (let k = 0; k < tentativas; k++) {
    // Universo pequeno (poucos naipes, valores perto) para os jogos se cruzarem.
    const livre = new Map<string, number>();
    for (let n = 0; n < 4; n++)
      for (let v = 1; v <= 13; v++) {
        const i = n * 13 + v - 1;
        if ((n < naipes || r() < 0.3) && 2 - qtd[i] > 0) livre.set(tipo(i), 2 - qtd[i]);
      }
    if (regras.curinga.ativo && qtd[52] < 4) livre.set('curinga', 4 - qtd[52]);
    const jogos = jogosPossiveisDaContagem(livre, regras).filter((j) => j.length <= 6);
    if (jogos.length === 0) continue;
    const j = jogos[Math.floor(r() * jogos.length)].map(idx);
    mesa.push(j);
    for (const i of j) qtd[i]++;
  }
  // A carta extra: perto das que já estão.
  const perto = qtd.map((n, i) => (n > 0 && n < 2 && i < 52 ? i : -1)).filter((i) => i >= 0);
  const extra = perto.length && r() < 0.8 ? perto[Math.floor(r() * perto.length)] + (r() < 0.5 ? 1 : 0) : Math.floor(r() * 52);
  if (qtd[extra] < 2) qtd[extra]++;
  return { qtd, mesa };
}

/** Divisor com os jogos da mesa "de graça" (usa a mesma assinatura interna do exata.ts). */
const PESOS_EXATA = Array.from({ length: 53 }, (_, i) => ((Math.imul(i + 1, 2654435761) >>> 3) % 1000003) * 1000033 + ((Math.imul(i + 7, 40503) >>> 2) % 99991));

/**
 * Busca antiga subindo o orçamento: devolve o menor orçamento que deu e a arrumação achada.
 * Atenção: ela conta "de graça" um jogo igual a um da mesa QUANTAS VEZES aparecer; a nova, uma vez por jogo.
 */
function antiga(qtd: number[], mesa: number[][], regras: Regras): { orc: number } | null {
  const m = new Map<string, number>();
  qtd.forEach((n, i) => n > 0 && m.set(tipo(i), n));
  const relogio = { fim: performance.now() + 60000, acabou: false };
  const assin = new Set(mesa.map((j) => j.reduce((a, i) => a + PESOS_EXATA[i], 0)));
  const d = new Divisor(regras, relogio, assin);
  for (let orc = 0; orc <= 14; orc++) {
    const r = d.dividir(m, orc);
    if (r) return { orc };
  }
  expect(relogio.acabou).toBe(false);
  return null;
}

/**
 * Régua exata e independente: para cada escolha de jogos da mesa que ficam inteiros (todas as 2^n), o resto
 * é dividido no MENOR número de jogos (busca antiga, todo jogo custando 1). O menor total é o custo certo.
 */
function custoExato(qtd: number[], mesa: number[][], regras: Regras): number | null {
  const relogio = { fim: performance.now() + 60000, acabou: false };
  let melhor: number | null = null;
  const d = new Divisor(regras, relogio, new Set());
  for (let mask = 0; mask < 1 << mesa.length; mask++) {
    const resto = [...qtd];
    let ok = true;
    for (let k = 0; k < mesa.length; k++) if (mask & (1 << k)) for (const i of mesa[k]) if (--resto[i] < 0) ok = false;
    if (!ok) continue;
    const m = new Map<string, number>();
    resto.forEach((n, i) => n > 0 && m.set(tipo(i), n));
    for (let orc = 0; orc <= (melhor ?? 15) - 1; orc++) {
      if (d.dividir(m, orc)) {
        melhor = orc;
        break;
      }
    }
  }
  expect(relogio.acabou).toBe(false);
  return melhor;
}

describe('arrumação que mexe menos (arrumacao) = busca completa antiga', () => {
  for (const [nome, regras] of [
    ['com coringa', comCuringa],
    ['sem coringa', base],
    ['coringas lado a lado', ladoALado],
  ] as const) {
    it(nome, () => {
      let comparados = 0;
      for (let k = 0; k < 300; k++) {
        const { qtd, mesa } = sortearMesa(k * 7919 + 31, regras);
        // Mesas com jogos repetidos: o Divisor conta "de graça" quantas vezes quiser; a arrumação, uma vez por jogo.
        const assin = mesa.map(assinatura);
        if (new Set(assin).size !== assin.length) continue;
        const velha = antiga(qtd, mesa, regras);
        const r = menorArrumacao(qtd, regras, mesa, 14, Infinity, 0);
        const texto = `mesa ${k}: ${mesa.map((j) => j.map(tipo).join(' ')).join(' | ')} + total ${qtd.flatMap((n, i) => Array(n).fill(tipo(i))).join(' ')}`;
        // Existe arrumação: as duas têm que concordar sempre.
        expect(r === null, texto).toBe(velha === null);
        if (r && velha) {
          expect(r.custo, texto).toBeGreaterThanOrEqual(velha.orc);
          expect(r.custo, texto).toBe(custoExato(qtd, mesa, regras));
        }
        if (r) {
          const usado = new Array(53).fill(0);
          let c = 0;
          const livres = mesa.map(assinatura);
          let novos = 0;
          for (const j of r.jogos) {
            for (const i of j) usado[i]++;
            expect(validarJogo(j.map((i) => carta(i, c++)), regras).valido, `jogo inválido ${j.map(tipo).join(' ')} em ${texto}`).toBe(true);
            const a = livres.indexOf(assinatura(j));
            if (a >= 0) livres.splice(a, 1);
            else novos++;
          }
          expect(usado, texto).toEqual(qtd);
          expect(novos, texto).toBe(r.custo);
        }
        comparados++;
      }
      expect(comparados).toBeGreaterThan(150);
    }, 300000);
  }
});
