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
  /** A pessoa escolheu terminar o campeonato ali mesmo (ganha quem tem menos pontos). */
  encerrado?: boolean;
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
  /** Alguém chegou ao alvo mas ainda há 2 ou mais jogadores (contando você) abaixo dele: dá para escolher continuar só com eles. */
  podeContinuar?: boolean;
}

/** Quem ainda não chegou ao alvo (índices). */
export function sobreviventes(c: Campeonato): number[] {
  return c.totais.flatMap((t, i) => (t < c.alvo ? [i] : []));
}

/**
 * O campeonato acaba quando alguém chega ao alvo e há um único com menos pontos (senão, outra rodada).
 * Com "comEscolha" (partida contra o computador com 3 ou 4 jogadores), quando alguém chega ao alvo e você
 * e mais alguém ainda estão abaixo dele, a pessoa escolhe: continuar só com esses ou terminar ali.
 */
export function situacaoDoCampeonato(c: Campeonato, comEscolha = false): Situacao {
  const menor = Math.min(...c.totais);
  const melhores = c.totais.flatMap((t, i) => (t === menor ? [i] : []));
  if (c.encerrado) return { acabou: true, campeao: ordemDoPlacar(c.totais)[0].jogador };
  if (Math.max(...c.totais) < c.alvo) return { acabou: false, campeao: null };
  const vivos = sobreviventes(c);
  if (comEscolha && vivos.length >= 2 && vivos.includes(0)) return { acabou: false, campeao: null, podeContinuar: true };
  return melhores.length === 1 ? { acabou: true, campeao: melhores[0] } : { acabou: false, campeao: null };
}

/** Continua o campeonato só com quem não chegou ao alvo (os pontos deles ficam). */
export function semOsEliminados(c: Campeonato): Campeonato {
  return { ...c, totais: sobreviventes(c).map((i) => c.totais[i]), rodada: c.rodada + 1 };
}

export function proximaRodada(c: Campeonato): Campeonato {
  return { ...c, rodada: c.rodada + 1 };
}

export interface LinhaDoPlacar {
  /** Índice do jogador (0 = você). */
  jogador: number;
  pontos: number;
  /** 1 = quem está ganhando (menos pontos). Empatados dividem a mesma posição. */
  posicao: number;
}

/** O placar em ordem: do campeão até o momento (menos pontos) ao último. */
export function ordemDoPlacar(totais: number[]): LinhaDoPlacar[] {
  const ordem = totais.map((pontos, jogador) => ({ jogador, pontos })).sort((a, b) => a.pontos - b.pontos || a.jogador - b.jogador);
  const linhas: LinhaDoPlacar[] = [];
  ordem.forEach((l, k) => linhas.push({ ...l, posicao: k > 0 && ordem[k - 1].pontos === l.pontos ? linhas[k - 1].posicao : k + 1 }));
  return linhas;
}
