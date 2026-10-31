/**
 * Converte a gaveta (partida + retrospecto) para o formato da nuvem (e de volta) e junta
 * duas cópias (a do aparelho e a da nuvem) quando a pessoa joga em mais de um aparelho.
 * Não usa o Firebase: dá para testar sem internet.
 */
import type { Gaveta, ResultadoGuardado, Salvo } from '../ui/salvar';

export interface DadosNuvem {
  versao: 1;
  /**
   * A partida vai como texto: o Firebase não aceita listas dentro de listas nem "undefined".
   * '' = nenhuma partida. O "Desfazer" não vai (só faz sentido no aparelho em que se está jogando).
   */
  jogo: string;
  jogoEm: number;
  resultados: Record<string, ResultadoGuardado>;
}

export function paraNuvem(g: Gaveta): DadosNuvem {
  const jogo = g.jogo ? JSON.stringify({ ...g.jogo, partida: { ...g.jogo.partida, historico: [] } }) : '';
  return { versao: 1, jogo, jogoEm: g.jogoEm, resultados: g.resultados };
}

export function daNuvem(d: DadosNuvem): Gaveta {
  let jogo: Salvo | null = null;
  try {
    jogo = d.jogo ? (JSON.parse(d.jogo) as Salvo) : null;
  } catch {
    /* texto estragado: fica sem partida, o retrospecto continua */
  }
  return { jogo, jogoEm: d.jogoEm ?? 0, resultados: { ...(d.resultados ?? {}) } };
}

/**
 * Junta duas cópias.
 * - Partida: fica a mexida por último (no empate, a de "a", o aparelho).
 * - Retrospecto: soma as partidas dos dois lados, sem repetir a mesma partida.
 */
export function mesclar(a: Gaveta, b: Gaveta): Gaveta {
  const deB = b.jogoEm > a.jogoEm;
  return structuredClone({
    jogo: deB ? b.jogo : a.jogo,
    jogoEm: Math.max(a.jogoEm, b.jogoEm),
    resultados: { ...b.resultados, ...a.resultados },
  });
}

/** As duas cópias já são iguais (no que vai para a nuvem)? Evita gravar à toa. */
export function iguais(a: Gaveta, b: Gaveta) {
  const texto = (g: Gaveta) => {
    const d = paraNuvem(g);
    const ids = Object.keys(d.resultados).sort();
    return JSON.stringify([d.jogo, d.jogoEm, ids.map((id) => [id, d.resultados[id]])]);
  };
  return texto(a) === texto(b);
}
