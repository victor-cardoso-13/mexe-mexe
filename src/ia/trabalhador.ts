/**
 * Web Worker: faz a busca do computador/dica em segundo plano, para a tela não travar.
 * Recebe { id, regras, inicio, nivel, proximoIdJogo, opcoes } e devolve { id, jogada, busca }.
 */
import { pensar, ultimaBusca, type OpcoesDaBusca } from './index';
import type { Foto } from '../motor/partida';
import type { NivelIA, Regras } from '../motor/regras';

interface Pedido {
  id: number;
  regras: Regras;
  inicio: Foto;
  nivel: NivelIA;
  proximoIdJogo: number;
  opcoes: OpcoesDaBusca;
}

const eu = self as unknown as { onmessage: ((ev: { data: Pedido }) => void) | null; postMessage: (msg: unknown) => void };

eu.onmessage = (ev) => {
  const { id, regras, inicio, nivel, proximoIdJogo, opcoes } = ev.data;
  const jogada = pensar(regras, inicio, nivel, proximoIdJogo, opcoes);
  eu.postMessage({ id, jogada, busca: { ...ultimaBusca } });
};
