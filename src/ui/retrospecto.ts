/**
 * Retrospecto: quantas partidas a pessoa jogou, ganhou, perdeu e empatou,
 * separado pelo nível do computador, e as últimas partidas.
 *
 * Cada partida terminada fica guardada pela sua identidade. Assim, mesmo jogando em
 * dois aparelhos, a mesma partida nunca é contada duas vezes.
 * Partida abandonada ("Começar partida nova" no meio de outra) não conta.
 */
import type { Partida } from '../motor/partida';
import type { NivelIA } from '../motor/regras';
import type { ResultadoGuardado } from './salvar';

export interface Contagem {
  jogadas: number;
  vitorias: number;
  derrotas: number;
  empates: number;
}

export interface Resumo {
  porNivel: Record<NivelIA, Contagem>;
  total: Contagem;
  /** as mais recentes primeiro */
  ultimas: ResultadoGuardado[];
}

export const ULTIMAS = 10;

/** Como uma partida terminada entra no retrospecto. O nível que conta é o do fim. */
export function resultadoDaPartida(p: Partida, em = Date.now()): ResultadoGuardado | null {
  const r = p.resultado;
  if (!r) return null;
  return {
    em,
    nivel: p.regras.nivelIA,
    r: r.vencedor === null ? 'e' : r.vencedor === 0 ? 'v' : 'd',
    motivo: r.motivo,
    adversarios: p.jogadores.length - 1,
  };
}

const zero = (): Contagem => ({ jogadas: 0, vitorias: 0, derrotas: 0, empates: 0 });

export function resumir(resultados: Record<string, ResultadoGuardado>): Resumo {
  const porNivel: Record<NivelIA, Contagem> = { facil: zero(), medio: zero(), dificil: zero() };
  const total = zero();
  const lista = Object.values(resultados);
  for (const r of lista) {
    for (const c of [porNivel[r.nivel] ?? porNivel.facil, total]) {
      c.jogadas++;
      if (r.r === 'v') c.vitorias++;
      else if (r.r === 'd') c.derrotas++;
      else c.empates++;
    }
  }
  const ultimas = lista.sort((a, b) => b.em - a.em).slice(0, ULTIMAS);
  return { porNivel, total, ultimas };
}
