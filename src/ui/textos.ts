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
  escolheuDaMesa: 'Escolha mais cartas, ou toque no + do jogo',
  mesaArrumada: 'Mesa arrumada! Pode comprar e passar.',
  escolheuCartas: 'Toque no jogo, ou no espaço vazio',
  tudoCerto: 'Tudo certo! Passando a vez…',
  mesaComProblema: 'Tem jogo que não vale (em vermelho)',
  mexeuAntesDeComprar: 'A mesa ainda não está certa. Arrume, ou toque em Desfazer tudo.',
  semDica: 'Não achei jogada. Toque em Comprar.',
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

/**
 * As cartas da mão de um passo na MESMA ordem em que ficam na mesa depois dele (6♣ 7♣ 8♣, e não 8♣ 7♣ 6♣;
 * numa trinca, a ordem dos naipes). Os jogos mexidos no passo vêm primeiro, na ordem em que aparecem.
 */
export function cartasNaOrdemDaMesa(passo: Passo, regras: Regras): Carta[] {
  const mexidos = passo.jogoIds.map((id) => passo.mesa.find((j) => j.id === id)).filter((j) => !!j);
  const resto = passo.mesa.filter((j) => !passo.jogoIds.includes(j.id));
  const posicao = new Map<string, number>();
  for (const jogo of [...mexidos, ...resto]) {
    for (const c of ordemParaMostrar(jogo.cartas, regras)) if (!posicao.has(c.id)) posicao.set(c.id, posicao.size);
  }
  const lugar = (c: Carta) => posicao.get(c.id) ?? Number.MAX_SAFE_INTEGER;
  return [...passo.cartasDaMao].sort((a, b) => lugar(a) - lugar(b));
}

/** Versão curta de um passo, para a pílula do adversário ("pôs 5♣"). */
export function resumoDoPasso(passo: Passo, regras: Regras): string {
  const cartas = listaDeCartas(cartasNaOrdemDaMesa(passo, regras));
  if (passo.tipo === 'baixou') return `baixou ${cartas}`;
  if (passo.tipo === 'encostou') return `pôs ${cartas}`;
  return 'rearrumou a mesa';
}

/**
 * Frase curta da faixa no 1 contra 1 ("Adversário ___. Sua vez"): comprou, ou o que baixou da mão
 * (1 carta: "abaixou o 5♥"; 3 cartas: "abaixou 3♥ 4♥ 5♥"). Não fala de mexer na mesa.
 */
export function resumoUmContraUm(passos: Passo[] | null, regras: Regras): string {
  if (!passos?.length) return 'comprou uma carta';
  const cartas = passos.flatMap((p) => cartasNaOrdemDaMesa(p, regras));
  return cartas.length === 1 ? `abaixou o ${nomeDaCarta(cartas[0])}` : `abaixou ${listaDeCartas(cartas)}`;
}

/** Frase sobre um passo da jogada ("O computador colocou 5♣ no jogo 2♣ 3♣ 4♣."). */
export function descreverPasso(passo: Passo, quem: string, regras: Regras, comoDica = false): string {
  const cartas = listaDeCartas(cartasNaOrdemDaMesa(passo, regras));
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

/**
 * Resumo curto da vez de um adversário (botão "O que ele fez?"):
 * jogo novo só com cartas da mão → "baixou o jogo 2♥ 3♥ 4♥"; qualquer outra coisa → "mexeu na mesa e colocou 2 cartas".
 * Sem jogada → "comprou uma carta".
 */
export function resumoDaVez(passos: Passo[] | null, regras: Regras): string {
  if (!passos?.length) return 'comprou uma carta';
  const jogos = passos.filter((p) => p.tipo === 'baixou').map((p) => listaDeCartas(cartasNaOrdemDaMesa(p, regras)));
  const naMesa = passos.filter((p) => p.tipo !== 'baixou').reduce((n, p) => n + p.cartasDaMao.length, 0);
  const partes: string[] = [];
  if (jogos.length === 1) partes.push(`baixou o jogo ${jogos[0]}`);
  if (jogos.length > 1) partes.push(`baixou os jogos ${jogos.slice(0, -1).join(', ')} e ${jogos[jogos.length - 1]}`);
  if (naMesa) partes.push(`mexeu na mesa e colocou ${naMesa} ${naMesa === 1 ? 'carta' : 'cartas'}`);
  return partes.join('; ');
}
