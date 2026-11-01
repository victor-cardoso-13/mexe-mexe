/**
 * Campeonato "até 100 pontos": várias rodadas seguidas.
 * Quem ganha a rodada fica com 0; quem perde soma os pontos das cartas que sobraram na mão.
 * Quem chegar a 100 pontos perde o campeonato; ganha quem tiver menos pontos.
 * (O modo casual é só uma partida, sem nada disto.)
 */
import type { Resultado } from './partida';

export const PONTOS_DO_CAMPEONATO = 100;

export interface Campeonato {
  alvo: number;
  /** Pontos somados de cada jogador (índice 0 = você). */
  totais: number[];
  rodada: number;
  /** Identidade da última partida somada (para nunca somar duas vezes a mesma). */
  contada: string;
}

export function novoCampeonato(jogadores: number, alvo = PONTOS_DO_CAMPEONATO): Campeonato {
  return { alvo, totais: Array(jogadores).fill(0), rodada: 1, contada: '' };
}

/** Pontos que cada um leva nesta rodada: o vencedor 0; empate, ninguém soma. */
export function pontosDaRodada(r: Resultado): number[] {
  if (r.vencedor === null) return r.pontos.map(() => 0);
  return r.pontos.map((p, i) => (i === r.vencedor ? 0 : p));
}

/** Soma a rodada que acabou (só uma vez por partida). */
export function somarRodada(c: Campeonato, r: Resultado, partidaId: string): Campeonato {
  if (c.contada === partidaId) return c;
  const rodada = pontosDaRodada(r);
  return { ...c, totais: c.totais.map((t, i) => t + rodada[i]), contada: partidaId };
}

export interface Situacao {
  acabou: boolean;
  /** Quem ganhou o campeonato (menos pontos). */
  campeao: number | null;
}

/** O campeonato acaba quando alguém chega ao alvo e há um único com menos pontos (senão, outra rodada). */
export function situacaoDoCampeonato(c: Campeonato): Situacao {
  if (Math.max(...c.totais) < c.alvo) return { acabou: false, campeao: null };
  const menor = Math.min(...c.totais);
  const melhores = c.totais.flatMap((t, i) => (t === menor ? [i] : []));
  return melhores.length === 1 ? { acabou: true, campeao: melhores[0] } : { acabou: false, campeao: null };
}

export function proximaRodada(c: Campeonato): Campeonato {
  return { ...c, rodada: c.rodada + 1 };
}
