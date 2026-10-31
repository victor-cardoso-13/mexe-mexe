/**
 * "Baixar jogo": as 3 cartas escolhidas da mão formam um jogo sozinhas (2-2-2 ou 2-3-4).
 * Não repete regra nenhuma: pergunta ao motor se mover as cartas para um jogo novo é permitido.
 */
import { moverCartas, ondeEstaCarta, type Partida } from '../motor/partida';

export function podeBaixarJogo(p: Partida, selecionadas: string[]): boolean {
  if (selecionadas.length !== 3) return false;
  if (!selecionadas.every((id) => ondeEstaCarta(p, id) === 'mao')) return false;
  return moverCartas(p, selecionadas, { tipo: 'novoJogo' }).ok;
}
