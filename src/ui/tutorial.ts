/**
 * Tutorial de 7 passos (aparece na primeira partida e em Ajustes → Como jogar).
 * Os desenhos usam as mesmas cartas do jogo, escritas de forma curta: "5c" = 5 de copas.
 */
import { htmlCarta } from './desenho';
import type { Carta, Naipe } from '../motor/cartas';

const NAIPE: Record<string, Naipe> = { c: 'copas', o: 'ouros', e: 'espadas', p: 'paus' };
const VALOR: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
let n = 0;

function carta(txt: string, classes = ''): string {
  const c: Carta = { id: `tut-${n++}`, curinga: false, naipe: NAIPE[txt.slice(-1)], valor: VALOR[txt.slice(0, -1)] ?? Number(txt.slice(0, -1)) };
  return htmlCarta(c, classes).replace(/ data-carta="[^"]*"/, ''); // sem data-carta: não dá para tocar
}
const cartas = (txt: string, classes = '') => txt.split(' ').map((t) => carta(t, classes)).join('');
const linha = (html: string) => `<div class="linha">${html}</div>`;

export interface PassoTutorial {
  titulo: string;
  texto: string;
  desenho: string;
}

export function passosDoTutorial(): PassoTutorial[] {
  n = 0;
  return [
    {
      titulo: 'Bem-vindo ao Mexe-Mexe!',
      texto: 'Ganha quem <b>acabar com as cartas da mão</b> primeiro. Vamos ver como, em 7 passos rapidinhos.',
      desenho: `${linha(cartas('2c 5c 9e Kp'))}<div class="seta">→ 🏆</div>`,
    },
    {
      titulo: 'Dois tipos de jogo',
      texto: '<b>Sequência:</b> 3 ou mais cartas seguidas do <b>mesmo naipe</b>.<br><b>Trinca:</b> mesmo número, com pelo menos <b>3 naipes diferentes</b>.',
      desenho: `${linha(`${cartas('4c 5c 6c')}<span class="ok">sequência</span>`)}${linha(`${cartas('9c 9p 9o')}<span class="ok">trinca</span>`)}`,
    },
    {
      titulo: 'Da mão: 1 carta ou 3',
      texto: 'Na sua vez, tire da mão <b>1 carta</b> (para um jogo da mesa) ou <b>3 cartas</b> que formam um jogo sozinhas. Escolheu 3 que formam jogo? Aparece o botão <b>Baixar jogo</b>.',
      desenho: `${linha(cartas('5c 6c 7c', 'selecionada'))}<div class="baixar-jogo exemplo">⬇ Baixar jogo</div>`,
    },
    {
      titulo: 'A mesa é de todos',
      texto: 'Você pode <b>mexer à vontade</b> nos jogos da mesa: tirar, juntar e separar cartas. No fim da vez, todos precisam estar certos.',
      desenho: linha(`${cartas('7p 8p 9p 10p')}<span class="seta">→</span>${cartas('10p')}`),
    },
    {
      titulo: 'Tocar ou arrastar',
      texto: '<b>Toque</b> numa carta e depois <b>toque</b> onde ela vai. Ou <b>arraste</b>. Para começar um jogo novo, toque ou solte num <b>espaço vazio</b> da mesa.',
      desenho: linha(`${carta('Ac', 'selecionada')}<span class="seta">👆 →</span><div class="vazio exemplo">jogo novo</div>`),
    },
    {
      titulo: 'A vez passa sozinha',
      texto: 'Quando tudo fica certo, <b>a vez passa sozinha</b>. Sem jogada? Toque em <b>Comprar</b>: você pega uma carta e passa a vez.',
      desenho: linha('<span class="ok">✔ Tudo certo! Passando a vez…</span>'),
    },
    {
      titulo: 'Ajuda sempre à mão',
      texto: '<b>Dica</b> mostra uma jogada. <b>Desfazer</b> volta um passo. Pode rever este tutorial em <b>Ajustes → Como jogar</b>.',
      desenho: linha('<span class="ok">💡 Dica</span><span class="ok">↶ Desfazer</span><span class="ok">⚙️ Ajustes</span>'),
    },
  ];
}
