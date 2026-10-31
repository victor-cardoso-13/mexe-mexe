/**
 * Diário do jogo: guarda as últimas jogadas e dicas, com a mão e a mesa do momento.
 * Serve para investigar problemas ("a dica não achou o K", "o computador fez algo estranho").
 * Fica só no aparelho. Em Ajustes há um botão para baixar o arquivo e mandar para o Claude.
 */
import { nomeDaCarta, type Carta } from '../motor/cartas';
import type { Jogo } from '../motor/partida';

const CHAVE = 'mexe-mexe:diario:v1';
const MAXIMO = 80; // só as últimas anotações

export interface Anotacao {
  hora: string;
  evento: string;
  [campo: string]: unknown;
}

export const textoCartas = (cartas: Carta[]) => cartas.map(nomeDaCarta).join(' ');
export const textoMesa = (mesa: Jogo[]) => mesa.map((j) => textoCartas(j.cartas));

export function lerDiario(): Anotacao[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as Anotacao[];
  } catch {
    return [];
  }
}

export function anotar(evento: string, dados: Record<string, unknown> = {}) {
  try {
    const diario = lerDiario();
    diario.push({ hora: new Date().toISOString(), evento, ...dados });
    localStorage.setItem(CHAVE, JSON.stringify(diario.slice(-MAXIMO)));
  } catch {
    // Sem espaço: o jogo continua, só não anota.
  }
}

/** Baixa o diário como arquivo (vai para a pasta Downloads no computador). */
export function baixarDiario() {
  const texto = JSON.stringify({ jogo: 'mexe-mexe', baixadoEm: new Date().toISOString(), aparelho: navigator.userAgent, diario: lerDiario() }, null, 2);
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mexe-mexe-diario.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
