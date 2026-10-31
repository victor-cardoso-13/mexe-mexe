/**
 * Cartas, baralho, embaralhamento e pontos.
 * Tudo aqui são funções "puras": não mexem na tela.
 */
import type { Regras } from './regras';

export type Naipe = 'copas' | 'ouros' | 'espadas' | 'paus';
/** Ordem dos naipes: cores alternadas (vermelho, preto, vermelho, preto). */
export const NAIPES: Naipe[] = ['copas', 'espadas', 'ouros', 'paus'];

/** Carta normal. valor: 1 = Ás, 2..10, 11 = J, 12 = Q, 13 = K. */
export interface CartaNormal {
  id: string;
  curinga: false;
  naipe: Naipe;
  valor: number;
}

export interface CartaCuringa {
  id: string;
  curinga: true;
}

export type Carta = CartaNormal | CartaCuringa;

export const SIMBOLO_NAIPE: Record<Naipe, string> = {
  copas: '♥',
  ouros: '♦',
  espadas: '♠',
  paus: '♣',
};

export function nomeDoValor(valor: number): string {
  if (valor === 1 || valor === 14) return 'A';
  if (valor === 11) return 'J';
  if (valor === 12) return 'Q';
  if (valor === 13) return 'K';
  return String(valor);
}

/** Texto curto da carta, ex.: "7♥", "A♠", "Curinga". */
export function nomeDaCarta(c: Carta): string {
  if (c.curinga) return 'Curinga';
  return nomeDoValor(c.valor) + SIMBOLO_NAIPE[c.naipe];
}

export function ehVermelha(c: Carta): boolean {
  return !c.curinga && (c.naipe === 'copas' || c.naipe === 'ouros');
}

/** Cria o monte completo (2 baralhos + curingas, se ativos), ainda sem embaralhar. */
export function criarMonte(regras: Regras): Carta[] {
  const monte: Carta[] = [];
  for (let b = 0; b < regras.numeroDeBaralhos; b++) {
    for (const naipe of NAIPES) {
      for (let valor = 1; valor <= 13; valor++) {
        // O id é único mesmo havendo duas cartas iguais (uma de cada baralho).
        monte.push({ id: `${valor}-${naipe}-${b}`, curinga: false, naipe, valor });
      }
    }
  }
  if (regras.curinga.ativo) {
    for (let i = 0; i < regras.curinga.quantidade; i++) {
      monte.push({ id: `curinga-${i}`, curinga: true });
    }
  }
  return monte;
}

/**
 * Gerador de números aleatórios com "semente".
 * Com a mesma semente, sai sempre a mesma sequência — isso deixa os testes
 * repetíveis e permite salvar e continuar a partida.
 * Retorna um número entre 0 (inclusive) e 1 (exclusive) e a próxima semente.
 */
export function aleatorio(semente: number): { valor: number; semente: number } {
  // Algoritmo "mulberry32".
  let t = (semente + 0x6d2b79f5) | 0;
  const proxima = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const valor = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { valor, semente: proxima };
}

/** Embaralha (sem alterar a lista original). */
export function embaralhar<T>(lista: T[], semente: number): { lista: T[]; semente: number } {
  const copia = [...lista];
  let s = semente;
  for (let i = copia.length - 1; i > 0; i--) {
    const r = aleatorio(s);
    s = r.semente;
    const j = Math.floor(r.valor * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return { lista: copia, semente: s };
}

/** Pontos de uma carta que ficou na mão. */
export function pontosDaCarta(c: Carta, regras: Regras): number {
  if (c.curinga) return regras.curinga.pontos;
  return regras.pontos[c.valor] ?? c.valor;
}

export function pontosDaMao(mao: Carta[], regras: Regras): number {
  return mao.reduce((soma, c) => soma + pontosDaCarta(c, regras), 0);
}

/** Ordena a mão por naipe (e dentro do naipe, por valor). Curingas no fim. */
export function ordenarPorNaipe(mao: Carta[]): Carta[] {
  return [...mao].sort((a, b) => {
    if (a.curinga || b.curinga) return Number(a.curinga) - Number(b.curinga);
    const n = NAIPES.indexOf(a.naipe) - NAIPES.indexOf(b.naipe);
    return n !== 0 ? n : a.valor - b.valor;
  });
}

/** Ordena a mão por valor (e dentro do valor, por naipe). Curingas no fim. */
export function ordenarPorValor(mao: Carta[]): Carta[] {
  return [...mao].sort((a, b) => {
    if (a.curinga || b.curinga) return Number(a.curinga) - Number(b.curinga);
    const v = a.valor - b.valor;
    return v !== 0 ? v : NAIPES.indexOf(a.naipe) - NAIPES.indexOf(b.naipe);
  });
}
