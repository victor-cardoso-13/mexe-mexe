/**
 * Frases mostradas na tela. Tudo em português simples.
 */
import { nomeDaCarta, NAIPES, type Carta } from '../motor/cartas';
import type { Regras } from '../motor/regras';
import { ordemParaMostrar } from '../motor/validacao';
import type { Passo } from '../ia';
import type { Ordenacao } from './estado';

export const TEXTOS = {
  suaVez: 'Sua vez',
  escolheuCartas: 'Toque no jogo, ou no espaço vazio',
  tudoCerto: 'Tudo certo! Passando a vez…',
  mesaComProblema: 'Tem jogo que não vale (em vermelho)',
  mexeuAntesDeComprar: 'Você mexeu na mesa. Antes de comprar, toque em Desfazer tudo.',
  semDica: 'Não achei jogada. Toque em Comprar e passar.',
  baixarSemNada: 'Você ainda não baixou carta. Baixe um jogo, ou compre e passe.',
};

export const NOMES_ORDENACAO: Record<Exclude<Ordenacao, 'manual'>, string> = {
  naipe: 'Por naipe',
  asBaixo: 'Por valor, Ás primeiro',
  asAlto: 'Por valor, Ás no fim',
};

export function listaDeCartas(cartas: Carta[]): string {
  return cartas.map(nomeDaCarta).join(' ');
}

/** Frase sobre um passo da jogada ("O computador colocou 5♣ no jogo 2♣ 3♣ 4♣."). */
export function descreverPasso(passo: Passo, quem: string, regras: Regras, comoDica = false): string {
  const cartas = listaDeCartas(passo.cartasDaMao);
  if (comoDica) quem = 'Você pode';
  const [baixou, colocou, rearrumou] = comoDica ? ['baixar', 'colocar', 'rearrumar'] : ['baixou', 'colocou', 'rearrumou'];
  if (passo.tipo === 'baixou') return `${quem} ${baixou} um jogo novo: ${cartas}.`;
  if (passo.tipo === 'encostou') {
    const jogo = passo.mesa.find((j) => j.id === passo.jogoIds[0]);
    const antes = jogo ? ordemParaMostrar(jogo.cartas, regras).filter((c) => !passo.cartasDaMao.includes(c)) : [];
    return `${quem} ${colocou} ${cartas} no jogo ${listaDeCartas(antes)}.`;
  }
  return comoDica ? `${quem} ${rearrumou} a mesa e usar ${cartas}.` : `${quem} ${rearrumou} a mesa e usou ${cartas}.`;
}

/** Ordena a mão conforme a escolha da jogadora. */
export function ordenarMao(mao: Carta[], modo: Ordenacao, ordemManual: string[]): Carta[] {
  const valor = (c: Carta, asAlto: boolean) => (c.curinga ? 99 : asAlto && c.valor === 1 ? 14 : c.valor);
  const naipe = (c: Carta) => (c.curinga ? 9 : NAIPES.indexOf(c.naipe));
  const lista = [...mao];
  if (modo === 'manual') {
    // Cartas que ainda não estão na ordem manual (ex.: a recém-comprada) vão para o fim.
    const pos = (c: Carta) => {
      const i = ordemManual.indexOf(c.id);
      return i === -1 ? Infinity : i;
    };
    return lista.sort((a, b) => pos(a) - pos(b));
  }
  if (modo === 'naipe') return lista.sort((a, b) => naipe(a) - naipe(b) || valor(a, false) - valor(b, false));
  const asAlto = modo === 'asAlto';
  return lista.sort((a, b) => valor(a, asAlto) - valor(b, asAlto) || naipe(a) - naipe(b));
}
