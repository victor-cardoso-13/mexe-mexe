/**
 * Faz tudo caber na tela, SEM barra de rolagem.
 * Começa com as cartas grandes e vai diminuindo até caber.
 */

const raiz = document.documentElement;

function definir(variavel: string, px: number) {
  raiz.style.setProperty(variavel, `${px}px`);
}

let ultimaChave = '';
/** A mesa é refeita a cada desenho. Se o cálculo é pulado, ela precisa receber de volta a marca de "rolável". */
let ultimaRolavel = false;
/** Tamanhos (em px) que estão valendo agora. */
let atual: { mao: number; mesa: number } | null = null;
/** Só vale a pena crescer se o ganho for visível; senão a carta "tremeria" de 1 em 1 pixel (mão: precisa ser bem mais, pois ela muda de fila). */
const GANHO_MINIMO_MESA = 6;
const GANHO_MINIMO_MAO = 14;
/** Quando precisa encolher, encolhe um pouco a mais: sobra folga e a próxima carta não obriga a encolher de novo. */
const FOLGA = 6;
const PISO_MESA = 40;
const PISO_MAO = 34;

/** Altura da barra de cima: só cresce (o "⚠️ Só 1 carta!" e as cartinhas viradas do computador a fariam pular). */
let alturaTopo = 0;
let telaAnterior = '';

/** Celular = tela estreita (em pé) ou baixa (deitado). */
const ehCelular = () => window.innerWidth <= 600 || window.innerHeight <= 500;

/** Nova partida: tudo volta a ser calculado do zero (as cartas podem crescer de novo). */
export function reiniciarEncaixe() {
  atual = null;
  alturaTopo = 0;
  ultimaChave = '';
}

/** Guarda o lugar da barra de cima no desenho novo (a tela é refeita a cada toque). */
function fixarTopo() {
  const topo = document.querySelector<HTMLElement>('.topo');
  if (!topo) return;
  const tela = `${window.innerWidth}x${window.innerHeight}`;
  if (tela !== telaAnterior) {
    telaAnterior = tela;
    alturaTopo = 0;
  }
  topo.style.minHeight = alturaTopo ? `${alturaTopo}px` : '';
  alturaTopo = Math.max(alturaTopo, topo.getBoundingClientRect().height);
  topo.style.minHeight = `${alturaTopo}px`;
}

function lerTamanho(variavel: string): number {
  return parseFloat(raiz.style.getPropertyValue(variavel));
}

/**
 * "chave" resume o que muda o tamanho (jogos da mesa, quantas cartas na mão, tamanho da tela).
 * Se nada disso mudou desde a última vez, não precisa recalcular (deixa as animações leves).
 *
 * Tamanho estável: durante uma jogada (a do computador ou a sua) as cartas só ENCOLHEM, e só quando
 * não cabem. Elas voltam a crescer uma vez só, quando "podeCrescer" (começo da sua vez / tela nova).
 * Assim a mesa e a mão não ficam "respirando" a cada carta que se mexe.
 */
export function encaixar(chave = '', podeCrescer = true, congelar = false) {
  const mesa = document.querySelector<HTMLElement>('.mesa');
  const mao = document.querySelector<HTMLElement>('.mao');
  if (!mesa || !mao) return;
  fixarTopo();
  if (congelar && atual && ehCelular()) {
    // Vez do computador no celular: nada muda de tamanho (as jogadas passam por estados intermediários que
    // fariam a mesa e a mão "respirarem"). A mesa fica rolável para qualquer jogo novo continuar acessível.
    mesa.classList.add('rolavel');
    ultimaRolavel = true;
    ultimaChave = ''; // quando a vez dele acabar, recalcula uma vez só
    return;
  }
  const chaveCompleta = `${chave}|${window.innerWidth}x${window.innerHeight}`;
  if (chave && chaveCompleta === ultimaChave) {
    mesa.classList.toggle('rolavel', ultimaRolavel);
    return;
  }
  ultimaChave = chaveCompleta;
  encaixarTudo(mesa, mao); // deixa nas variáveis o tamanho ideal (o maior que cabe)
  const ideal = { mao: lerTamanho('--mao-w'), mesa: lerTamanho('--mesa-w') };
  if (atual) {
    // Nunca passa do ideal (então sempre cabe); só cresce quando pode e quando o ganho é visível.
    const escolher = (id: number, at: number, ganho: number, piso: number) => {
      if (id < at) return Math.max(id - FOLGA, Math.min(id, piso)); // precisa encolher: encolhe com folga
      return podeCrescer && id - at >= ganho ? id : at;
    };
    const mao2 = escolher(ideal.mao, atual.mao, GANHO_MINIMO_MAO, PISO_MAO);
    const mesa2 = escolher(ideal.mesa, atual.mesa, GANHO_MINIMO_MESA, PISO_MESA);
    if (mao2 !== ideal.mao) definir('--mao-w', mao2);
    if (mesa2 !== ideal.mesa) definir('--mesa-w', mesa2);
  }
  atual = { mao: lerTamanho('--mao-w'), mesa: lerTamanho('--mesa-w') };
  ultimaRolavel = mesa.classList.contains('rolavel');
}

function encaixarTudo(mesa: HTMLElement, mao: HTMLElement) {
  const largura = window.innerWidth;
  const altura = window.innerHeight;

  // 1) Mão: o maior tamanho possível, ocupando no máximo ~1/3 da altura da tela
  //    (no celular deitado, que é bem baixo, no máximo ~1/4).
  const limiteMao = altura < 500 ? 0.25 : 0.33;
  // Começa grande (no máximo ~1/5 da largura) e o laço abaixo encolhe se as filas não couberem.
  let wMao = Math.round(Math.min(largura / 5, altura * 0.135, 110));
  definir('--mao-w', wMao);
  while (mao.scrollHeight > altura * limiteMao && wMao > 30) {
    wMao -= 3;
    definir('--mao-w', wMao);
  }

  // 2) Mesa: o maior tamanho de carta em que todos os jogos cabem (busca rápida "metade-metade").
  const MESA_MAXIMA = 92;
  // Celular = tela estreita (em pé) ou baixa (deitado).
  const celular = ehCelular();
  const MESA_CELULAR = altura <= 500 ? 36 : 40;
  mesa.classList.remove('rolavel');
  const MESA_LEGIVEL = 28;
  const MESA_MINIMA = 18;
  const transborda = () => mesa.scrollHeight > mesa.clientHeight + 1 || mesa.scrollWidth > mesa.clientWidth + 1;
  const encaixarMesa = (minimo: number): number => {
    let cabe = minimo;
    let naoCabe = MESA_MAXIMA + 1;
    definir('--mesa-w', MESA_MAXIMA);
    if (!transborda()) return MESA_MAXIMA;
    while (naoCabe - cabe > 1) {
      const meio = Math.floor((cabe + naoCabe) / 2);
      definir('--mesa-w', meio);
      if (transborda()) naoCabe = meio;
      else cabe = meio;
    }
    definir('--mesa-w', cabe);
    return cabe;
  };

  // 3) Equilíbrio (só tablet/computador): se a mesa ficou bem menor que a mão (ex.: mão com 3 cartas enormes
  //    e mesa cheia de cartas miúdas), a mão encolhe um pouco para a mesa crescer.
  //    A mão nunca fica menor que MAO_CONFORTAVEL só por isso.
  //    No celular a mão NÃO acompanha a mesa: o tamanho dela só depende de quantas cartas ela tem. Se a mesa
  //    não couber, só a mesa rola (abaixo). Assim a mão não "respira" a cada carta que o computador baixa.
  const MAO_CONFORTAVEL = Math.round(Math.min(56, altura * 0.11));
  const MAO_MINIMA = 34;
  let wMesa = encaixarMesa(MESA_LEGIVEL);
  if (!celular) {
    while (wMesa < wMao * 0.8 && wMao - 4 >= MAO_CONFORTAVEL) {
      wMao -= 4;
      definir('--mao-w', wMao);
      wMesa = encaixarMesa(MESA_LEGIVEL);
    }
    // Se nem assim couber, a mão encolhe mais; e só em último caso a mesa fica bem pequena.
    while (transborda() && wMao > MAO_MINIMA) {
      wMao -= 4;
      definir('--mao-w', wMao);
      wMesa = encaixarMesa(MESA_LEGIVEL);
    }
  }
  if (!celular) {
    if (transborda()) encaixarMesa(MESA_MINIMA);
    return;
  }
  // Celular: em vez de cartas miúdas, a mesa fica com um tamanho mínimo legível e,
  // se não couber, SÓ a área da mesa rola com o dedo (mão e botões ficam fixos).
  if (wMesa < MESA_CELULAR) {
    definir('--mesa-w', MESA_CELULAR);
    mesa.classList.add('rolavel');
  }
}
