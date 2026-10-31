// Ajudantes para escrever cartas nos testes de forma curta: c('7c') = 7 de copas.
import type { Carta, Naipe } from '../src/motor/cartas';

const NAIPE: Record<string, Naipe> = { c: 'copas', o: 'ouros', e: 'espadas', p: 'paus' };
const VALOR: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
let contador = 0;

/** c('7c'), c('Ae'), c('10o'), c('*') = curinga */
export function c(txt: string): Carta {
  contador++;
  if (txt === '*') return { id: `cur-${contador}`, curinga: true };
  const naipe = NAIPE[txt.slice(-1)];
  const v = txt.slice(0, -1);
  return { id: `${txt}-${contador}`, curinga: false, naipe, valor: VALOR[v] ?? Number(v) };
}

/** cs('2c 3c 4c') */
export function cs(txt: string): Carta[] {
  return txt.trim().split(/\s+/).map(c);
}
