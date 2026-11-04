/**
 * Busca de jogada em segundo plano (Web Worker). Se o aparelho não conseguir criar o Worker,
 * ou ele falhar, faz a busca no próprio jogo, como antes (a tela trava enquanto pensa, mas nunca fica sem jogada).
 */
import type { NivelIA } from '../motor/regras';
import type { Partida } from '../motor/partida';
import { definirUltimaBusca, escolherJogada, jogadaConferida, opcoesDaPartida, type JogadaIA } from './index';

/** Quanto a dica pode pensar quando roda em segundo plano. */
export const TEMPO_DA_DICA_EM_SEGUNDO_PLANO_MS = 30000;

let trabalhador: Worker | null = null;
let rejeitarAtual: ((motivo: unknown) => void) | null = null;
let numero = 0;

/** Para a busca em andamento (ex.: começou outra partida). */
export function cancelarBusca() {
  trabalhador?.terminate();
  trabalhador = null;
  rejeitarAtual?.(new Error('cancelada'));
  rejeitarAtual = null;
}

export async function escolherJogadaAsync(p: Partida, nivel: NivelIA = p.regras.nivelIA, opcoes: { dica?: boolean } = {}): Promise<JogadaIA | null> {
  if (typeof Worker === 'undefined') return escolherJogada(p, nivel, opcoes);
  cancelarBusca();
  const tempo = opcoes.dica ? TEMPO_DA_DICA_EM_SEGUNDO_PLANO_MS : p.regras.niveis[nivel].tempoMaximoMs;
  try {
    const resposta = await new Promise<{ jogada: JogadaIA | null; busca: { ms: number; tempoAcabou: boolean; exataTerminou?: boolean } }>((resolver, rejeitar) => {
      const w = new Worker(new URL('./trabalhador.ts', import.meta.url), { type: 'module' });
      const id = ++numero;
      trabalhador = w;
      const fim = () => {
        clearTimeout(limite);
        w.terminate();
        if (trabalhador === w) trabalhador = null;
        rejeitarAtual = null;
      };
      // Se o Worker nem começar a responder, desiste e faz a busca aqui mesmo.
      const limite = setTimeout(() => {
        fim();
        rejeitar(new Error('sem resposta'));
      }, tempo * 2 + 5000);
      rejeitarAtual = (motivo) => {
        fim();
        rejeitar(motivo);
      };
      w.onmessage = (ev: MessageEvent) => {
        if (ev.data.id !== id) return;
        fim();
        resolver(ev.data);
      };
      w.onerror = () => {
        fim();
        rejeitar(new Error('erro no worker'));
      };
      w.postMessage({
        id,
        regras: p.regras,
        inicio: p.inicioDaVez,
        nivel,
        proximoIdJogo: p.proximoIdJogo,
        opcoes: { ...opcoesDaPartida(p, opcoes), tempoDicaMs: TEMPO_DA_DICA_EM_SEGUNDO_PLANO_MS },
      });
    });
    definirUltimaBusca(resposta.busca);
    return jogadaConferida(p, resposta.jogada);
  } catch (erro) {
    if (erro instanceof Error && erro.message === 'cancelada') throw erro;
    return escolherJogada(p, nivel, opcoes);
  }
}
