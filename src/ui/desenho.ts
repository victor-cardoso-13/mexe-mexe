/**
 * Monta o HTML de cada tela a partir do estado.
 * Aqui só se DESENHA; quem decide o que acontece é o src/main.ts.
 */
import { pedacosDoJogoErrado } from '../motor/jogoErrado';
import { ehVermelha, nomeDoValor, SIMBOLO_NAIPE, type Carta, type CartaNormal } from '../motor/cartas';
import { conferirJogada, jogadorDaVez, mesaMexidaEstaCerta, mexeuNaVez, ondeEstaCarta, type Partida } from '../motor/partida';
import { ordemDoPlacar, pontosDaRodada, situacaoDoCampeonato, type Campeonato } from '../motor/campeonato';
import { pontosDaMao } from '../motor/cartas';
import { ordemDaTrinca, ordemParaMostrar, validarJogo } from '../motor/validacao';
import type { NivelIA } from '../motor/regras';
import type { Ajustes, Aviso, Estado, Online } from './estado';
import type { Contagem, Resumo } from './retrospecto';
import { podeBaixarJogo } from './baixarJogo';
import { NOMES_ORDENACAO, ordenarMao, TEXTOS } from './textos';
import { passosDoTutorial } from './tutorial';
import { ativos, MAX_JOGADORES, MIN_JOGADORES } from '../online/logica';
import { escapar } from './seguranca';

// ---------------------------------------------------------------------------
// Carta
// ---------------------------------------------------------------------------

export function htmlCarta(c: Carta, classes = ''): string {
  if (c.curinga) {
    return `<div class="carta curinga ${classes}" data-carta="${c.id}">
      <div class="canto"><span class="valor">★</span></div>
      <div class="estrela">★</div>
      <div class="rotulo-curinga">CORINGA</div>
    </div>`;
  }
  const simbolo = SIMBOLO_NAIPE[c.naipe];
  const cor = ehVermelha(c) ? 'vermelho' : '';
  return `<div class="carta ${cor} naipe-${c.naipe} ${classes}" data-carta="${c.id}">
    <div class="canto"><span class="valor">${nomeDoValor(c.valor)}</span><span class="naipe-peq">${simbolo}</span></div>
    <div class="naipe-grande">${simbolo}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Tela do jogo
// ---------------------------------------------------------------------------

export function htmlJogo(e: Estado, a: Ajustes): string {
  const p = e.partida!;
  const minhaVez = p.vez === 0 && !e.computadorJogando && !p.resultado;
  const classes = [
    'tela-jogo',
    a.quatroCores ? 'quatro-cores' : '',
    e.selecionadas.length ? 'tem-selecao' : '',
    e.computadorJogando ? 'computador-jogando' : '',
    e.campeonato ? 'campeonato' : '',
    e.online ? 'online' : '',
  ];
  return `<div class="${classes.join(' ')}">
    ${htmlTopo(e, p)}
    ${htmlMesa(e, p)}
    ${htmlFaixa(e, p, minhaVez)}
    ${htmlMao(e, p)}
    ${htmlBotoes(p, minhaVez, !!e.online)}
  </div>${e.menuOrdenar ? htmlOrdenar(e) : ''}`;
}

/** Letra da bolinha do adversário: o número ("Adversário 2" → 2), "A" para o primeiro, ou a 1ª letra do nome (online). */
function letraDoJogador(nome: string): string {
  const numero = nome.match(/\d+$/)?.[0];
  if (numero) return numero;
  return escapar([...nome.trim()][0]?.toUpperCase() ?? '?');
}

/** Placar do campeonato, em ordem de quem está ganhando (1 = menos pontos): fichas com a bolinha de cada um. */
function htmlPlacar(c: Campeonato, p: Partida): string {
  const fichas = ordemDoPlacar(c.totais)
    .map((l) => {
      const quem = l.jogador === 0
        ? '<span class="bol voce">Você</span>'
        : `<span class="bol cor-${(l.jogador - 1) % 3}">${letraDoJogador(p.jogadores[l.jogador].nome)}</span>`;
      return `<span class="ficha ${l.posicao === 1 ? 'lider' : ''}">${l.posicao === 1 ? '👑' : ''}${quem}<b>${l.pontos}</b></span>`;
    })
    .join('');
  return `<div class="placar-camp"><span class="rod">Rodada ${c.rodada}<br>até ${c.alvo}</span>${fichas}</div>`;
}

/** Placar grande do fim da rodada: 2 jogadores = dois números lado a lado; 3 ou 4 = uma linha por jogador. */
function htmlPlacarFim(c: Campeonato, p: Partida, rodada: number[]): string {
  const nome = (i: number) => (i === 0 ? 'Você' : escapar(p.jogadores[i].nome));
  const barra = (pontos: number) => {
    const pct = Math.min(100, Math.round((pontos / c.alvo) * 100));
    return `<div class="barra"><i class="${pct >= 80 ? 'perigo' : pct >= 60 ? 'alta' : ''}" style="width:${pct}%"></i></div>`;
  };
  const delta = (i: number) => `<span class="delta ${rodada[i] ? '' : 'zero'}">+${rodada[i]}</span>`;
  const linhas = ordemDoPlacar(c.totais);
  if (p.jogadores.length === 2) {
    const lado = (i: number) => `<div class="lado"><span class="nome">${nome(i)}</span><span class="total">${c.totais[i]}</span>${delta(i)} nesta rodada${barra(c.totais[i])}</div>`;
    return `<div class="placar-fim"><div class="dupla">${lado(0)}<div class="meio"><span>RODADA ${c.rodada}</span><span>até ${c.alvo}</span></div>${lado(1)}</div></div>`;
  }
  const lin = linhas
    .map((l) => `<div class="lin"><span class="quem">${l.posicao === 1 ? '👑 ' : ''}${nome(l.jogador).replace('Adversário', 'Adv.')}</span><span class="total">${l.pontos}</span>${barra(l.pontos)}${delta(l.jogador)}</div>`)
    .join('');
  return `<div class="placar-fim"><div class="lista">${lin}</div></div>`;
}

function htmlTopo(e: Estado, p: Partida): string {
  const adversarios = p.jogadores
    .map((j, i) => {
      if (i === 0) return '';
      const qtd = e.cartasExibidas?.[i] ?? j.mao.length;
      const alerta = qtd === 1 ? '<span class="alerta-uma">⚠️<span class="longo"> Só 1 carta!</span></span>' : '';
      const daVez = p.vez === i && e.computadorJogando ? 'da-vez' : '';
      const fala = daVez && !e.online && e.aviso?.curto ? `<span class="fala">· ${e.aviso.curto}</span>` : '';
      // ".versos" fica: é de lá que sai voando a carta que o computador joga (veja main.ts).
      return `<div class="adversario ${daVez} ${qtd === 1 ? 'uma' : ''}" data-jogador="${i}">
        <span class="avatar cor-${(i - 1) % 3}">${letraDoJogador(j.nome)}</span>
        <span class="nome">${escapar(j.nome)}</span>
        <span class="qtd"><span class="versos"><span class="verso"></span></span><b>${qtd}</b></span>${fala}${alerta}</div>`;
    })
    .join('');
  const n = p.jogadores.length - 1;
  return `<div class="topo ${n > 1 ? 'varios' : ''} ${n > 2 ? 'muitos' : ''}">
    <button class="botao-menu" data-acao="abrirMenu" aria-label="Menu"><span class="barras" aria-hidden="true"><i></i><i></i><i></i></span><span class="palavra">Menu</span></button>
    ${adversarios}
    <div class="espaco"></div>
    ${e.online?.sala?.fase === 'jogando' ? '<div class="tempo-vez" id="tempo">⏱</div>' : ''}
    ${e.campeonato ? htmlPlacar(e.campeonato, p) : ''}
  </div>`;
}

/** Qual frase mostrar na faixa da vez, com o ícone do quadradinho e o botão do momento. */
function avisoAtual(e: Estado, p: Partida, minhaVez: boolean): Aviso & { acao?: string; icone: string } {
  const icone = (a: Aviso) => (a.tipo === 'problema' ? '!' : a.tipo === 'computador' ? '⏳' : a.texto.startsWith('Você comprou') ? '🃏' : '👉');
  // Vez do computador: a narração curta fica na pílula dele; a faixa só diz de quem é a vez.
  // (p.vez !== 0: durante o "Fazer" da dica a vez é sua e a faixa mostra a narração "Você pode…".)
  if (!e.online && !minhaVez && p.vez !== 0 && !p.resultado && (!e.aviso || e.aviso.tipo === 'computador')) {
    return { texto: `Vez do ${escapar(jogadorDaVez(p).nome)}…`, tipo: 'computador', icone: '⏳' };
  }
  if (e.aviso) {
    if (e.aviso.texto.startsWith('💡')) return { ...e.aviso, texto: e.aviso.texto.replace(/^💡\s*/, ''), icone: '💡' };
    return { ...e.aviso, icone: e.aviso.texto === TEXTOS.tudoCerto ? '✔' : icone(e.aviso) };
  }
  if (p.resultado) return { texto: 'A partida acabou.', tipo: 'normal', icone: '🏁', acao: '<button class="acao" data-acao="novaPartida">Jogar de novo</button>' };
  if (e.online && p.resultado === null && e.online.sala?.fase === 'contando') return { texto: 'Contando os pontos…', tipo: 'computador', icone: '⏳' };
  if (!minhaVez) return { texto: e.online ? `Vez de ${escapar(jogadorDaVez(p).nome)}…` : 'Vez do computador…', tipo: 'computador', icone: '⏳' };
  if (e.dica) return { texto: e.dica.texto.replace(/^💡\s*/, ''), tipo: 'normal', icone: '💡', acao: `<button class="acao" data-acao="fazerDica">${ICONES.passar}Fazer</button>` };
  if (e.selecionadas.length) {
    const daMesa = e.selecionadas.some((id) => ondeEstaCarta(p, id) !== 'mao');
    return { texto: daMesa ? TEXTOS.escolheuDaMesa : TEXTOS.escolheuCartas, tipo: 'normal', icone: '👆' };
  }
  if (!mexeuNaVez(p)) {
    // Só aparece se existir mesmo um jogo da mesa onde o coringa entra.
    const curinga = e.lugarCuringa ? '<button class="acao" data-acao="curingaSolto">🃏 Jogar o coringa</button>' : '';
    return { texto: TEXTOS.suaVez, tipo: 'normal', icone: '✋', acao: curinga };
  }
  const c = conferirJogada(p);
  if (c.ok) return { texto: TEXTOS.tudoCerto, tipo: 'normal', icone: '✔' };
  if (mesaMexidaEstaCerta(p)) return { texto: TEXTOS.mesaArrumada, tipo: 'normal', icone: '👉' };
  if (c.jogosInvalidos.length) return { texto: c.problemas[0] ?? TEXTOS.mesaComProblema, tipo: 'problema', icone: '!' };
  return { texto: c.problemas[0], tipo: 'problema', icone: '!' };
}

/** Cruz do "+" de cada jogo: desenho vetorial (fica no centro exato em qualquer tamanho de tela). */
const CRUZ = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke-width="4.5" stroke-linecap="round"/></svg>';

function htmlMesa(e: Estado, p: Partida): string {
  const mesa = e.mesaExibida ?? p.mesa;
  const selecionadas = new Set(e.selecionadas);
  const chegaram = new Set(e.chegaram);
  const jogos = mesa
    .map((j) => {
      const r = validarJogo(j.cartas, p.regras);
      const doComputador = new Set(e.baixadasPeloComputador);
      const carta = (c: Carta) =>
        htmlCarta(c, [
          selecionadas.has(c.id) ? 'selecionada' : '',
          chegaram.has(c.id) ? 'chegou' : '',
          doComputador.has(c.id) ? 'do-computador' : '',
        ].join(' '));
      // Cartas do mesmo número que ainda não formam trinca (ex.: sobraram A-A) ficam lado a lado, como numa trinca.
      const parecidaComTrinca = !r.valido && j.cartas.length >= 2 && j.cartas.every((c) => !c.curinga && c.valor === (j.cartas[0] as CartaNormal).valor);
      let cartas: string;
      if ((r.valido && r.tipo === 'trinca') || parecidaComTrinca) {
        // Trinca: um naipe ao lado do outro; cartas repetidas empilhadas na vertical.
        const { colunas, base } = arrumarTrinca((r.valido ? r.ordem : j.cartas) as CartaNormal[]);
        cartas =
          `<div class="colunas">${colunas.map((col) => `<div class="coluna">${col.map(carta).join('')}</div>`).join('')}</div>` +
          (base.length ? `<div class="base">${base.map(carta).join('')}</div>` : '');
      } else if (!r.valido) {
        // Jogo que não vale: em pedaços, com um vão onde dá para separar (src/motor/jogoErrado.ts).
        cartas = pedacosDoJogoErrado(j.cartas, p.regras).map((pedaco) => pedaco.map(carta).join('')).join('<div class="vao" aria-hidden="true"></div>');
      } else {
        cartas = ordemParaMostrar(j.cartas, p.regras).map(carta).join('');
      }
      const tipo = r.valido ? r.tipo : parecidaComTrinca ? 'trinca' : '';
      const classes = ['jogo', tipo, r.valido ? '' : 'invalido', e.destaques.includes(j.id) ? 'destaque' : ''].join(' ');
      // Só um "!" no jogo: o motivo aparece na faixa da vez (um texto comprido aqui empurrava a mesa e encolhia as cartas).
      const erro = r.valido ? '' : '<div class="erro" aria-hidden="true">!</div>';
      const mais = selecionadas.size ? `<div class="mais-aqui" aria-hidden="true">${CRUZ}</div>` : '';
      return `<div class="${classes}" data-destino="jogo:${j.id}">${cartas}${erro}${mais}</div>`;
    })
    .join('');
  // Espaço vazio pontilhado: cria um jogo novo. Está sempre na mesa (o lugar fica guardado); só aparece com carta escolhida ou arrastando.
  const vazio = `<div class="vazio" data-destino="novo"><div>+ jogo novo<small>toque ou solte aqui</small></div></div>`;
  // O fundo da mesa também é "jogo novo" para quem arrasta cartas (soltar em qualquer lugar vazio).
  return `<div class="mesa" data-destino="novo"><div class="jogos">${jogos}${vazio}</div></div>`;
}

/**
 * Faixa da vez (logo acima da mão): ícone + frase + UM botão do momento, sempre no mesmo lugar.
 * Com 3 cartas da mão que formam jogo é "Baixar jogo"; com outra escolha é "Novo jogo"; sem escolha, o lugar
 * fica com o botão da frase ("Fazer", "Jogar o coringa", "Jogar de novo") ou vazio. A faixa tem ALTURA FIXA.
 */
function htmlFaixa(e: Estado, p: Partida, minhaVez: boolean): string {
  const botaoJogo = e.computadorJogando || !e.selecionadas.length
    ? ''
    : podeBaixarJogo(p, e.selecionadas)
      ? `<button class="baixar-jogo" data-acao="baixarJogo"><span class="icone-baixar">${ICONES.baixar}</span>Baixar jogo</button>`
      : `<button class="baixar-jogo novo" data-acao="baixarJogo"><span class="icone-baixar">${ICONES.novo}</span>Novo jogo</button>`;
  const av = avisoAtual(e, p, minhaVez);
  const botao = botaoJogo || av.acao || '';
  const ok = av.texto === TEXTOS.tudoCerto ? 'ok' : '';
  return `<div class="faixa ${av.tipo} ${ok}">
    <span class="chip" aria-hidden="true">${av.icone}</span>
    <span class="msg">${av.texto}</span>
    ${botao}
  </div>`;
}

function htmlMao(e: Estado, p: Partida): string {
  const mao = ordenarMao(p.jogadores[0].mao, e.ordenacao, e.ordemManual);
  const selecionadas = new Set(e.selecionadas);
  const daDica = new Set(e.dica?.cartas ?? []);
  const cartas = mao
    .map((c) => {
      const classes = [
        selecionadas.has(c.id) ? 'selecionada' : '',
        c.id === e.novaCartaId ? 'nova' : '',
        daDica.has(c.id) ? 'dica' : '',
      ];
      return htmlCarta(c, classes.join(' '));
    })
    .join('');
  return `<div class="area-mao" data-destino="mao"><div class="mao">${cartas}</div></div>`;
}

/** Ícones de traço (os mesmos do mock aprovado). */
const TRACOS = {
  desfazer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  tudo: '<path d="M3 12a9 9 0 1 0 2.8-6.5L3 8"/><path d="M3 3v5h5"/>',
  dica: '<path d="M9 18h6"/><path d="M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.6V16h6v-.1c0-.6.3-1.2.8-1.6A6.5 6.5 0 0 0 12 2.5z"/>',
  passar: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  // três cartas em leque com a seta para CIMA (da mão para a mesa) — não é "download"
  baixar: '<rect x="3" y="9" width="8" height="11" rx="1.5" transform="rotate(-12 7 14.5)"/><rect x="8" y="8" width="8" height="11" rx="1.5"/><rect x="13" y="9" width="8" height="11" rx="1.5" transform="rotate(12 17 14.5)"/><path d="M12 1.5v4"/><path d="m10 3.5 2-2 2 2"/>',
  novo: '<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M12 8v8"/><path d="M8 12h8"/>',
};
const ICONES = Object.fromEntries(
  Object.entries(TRACOS).map(([nome, traco]) => [nome, `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${traco}</svg>`]),
) as Record<keyof typeof TRACOS, string>;

/**
 * Barra de botões: UMA linha (no celular deitado, uma coluna à direita).
 * Desfazer · Desfazer tudo · Dica · Comprar (o maior, com o monte desenhado e o número de cartas nele).
 * Não existe botão de passar a vez: ela passa sozinha quando a mesa fica certa (main.ts, talvezPassarSozinho).
 */
function htmlBotoes(p: Partida, minhaVez: boolean, online = false): string {
  const off = minhaVez ? '' : 'disabled';
  const podeDesfazer = minhaVez && mexeuNaVez(p) ? '' : 'disabled';
  const b = (acao: string, icone: string, nome: string, extra = '') =>
    `<button data-acao="${acao}" ${extra}><span class="icone">${icone}</span><span class="nome-botao">${nome}</span></button>`;
  const n = p.monte.length;
  // O número fica só na bolinha do montinho (vermelha quando o monte está acabando).
  const monte = `<span class="monte-ic ${n <= 5 ? 'pouco' : ''}" aria-hidden="true"><i></i><i></i><i></i><b>${n}</b></span>`;
  const apagado = minhaVez && mexeuNaVez(p) && !mesaMexidaEstaCerta(p) ? 'apagado' : '';
  return `<div class="botoes ${online ? 'sem-dica' : ''}">
    ${b('desfazer', ICONES.desfazer, 'Desfazer', podeDesfazer)}
    ${b('desfazerTudo', ICONES.tudo, 'Desfazer tudo', podeDesfazer)}
    ${online ? '' : b('dica', ICONES.dica, 'Dica', off)}
    <button data-acao="comprar" class="comprar ${apagado}" ${off}>${monte}<span class="nome-botao">Comprar</span></button>
  </div>`;
}

/**
 * Como mostrar uma trinca:
 * - 3 naipes: uma coluna por naipe (cores alternadas), repetidas empilhadas na coluna.
 * - 4 naipes: o naipe com MENOS cartas vira o "4º naipe":
 *   - se ele tem 1 carta, ela vai para baixo da coluna mais curta (ex.: ♠♥ | ♦♦ | ♣♣);
 *   - se tem 2 (as 8 cartas), elas ficam numa linha embaixo, entre as colunas.
 */
function arrumarTrinca(cartas: CartaNormal[]): { colunas: Carta[][]; base: Carta[] } {
  const porNaipe = new Map<string, CartaNormal[]>();
  for (const c of cartas) porNaipe.set(c.naipe, [...(porNaipe.get(c.naipe) ?? []), c]);

  let quarto: CartaNormal[] = [];
  let principais = cartas;
  if (porNaipe.size === 4) {
    const menor = Math.min(...[...porNaipe.values()].map((l) => l.length));
    const naipeQuarto = [...porNaipe.entries()].find(([, l]) => l.length === menor)![0];
    quarto = porNaipe.get(naipeQuarto)!;
    principais = cartas.filter((c) => c.naipe !== naipeQuarto);
  }

  const colunas: Carta[][] = [];
  for (const c of ordemDaTrinca(principais)) {
    const ultima = colunas[colunas.length - 1];
    if (ultima && !ultima[0].curinga && ultima[0].naipe === c.naipe) ultima.push(c);
    else colunas.push([c]);
  }
  if (quarto.length >= 2) return { colunas, base: quarto };
  for (const c of quarto) {
    // No empate, a coluna mais à direita.
    const curta = colunas.reduce((m, col) => (col.length <= m.length ? col : m));
    curta.push(c);
  }
  return { colunas, base: [] };
}

// ---------------------------------------------------------------------------
// Janelas
// ---------------------------------------------------------------------------

/** Janela "Ordenar minhas cartas" (no meio da tela, funciona em qualquer aparelho). */
function htmlOrdenar(e: Estado): string {
  const exemplos: Record<string, string> = { naipe: '♥ ♠ ♦ ♣', asBaixo: 'A 2 3 … K', asAlto: '2 3 … K A' };
  const opcoes = (['naipe', 'asBaixo', 'asAlto'] as const)
    .map(
      (m) => `<button class="grande ${e.ordenacao === m ? '' : 'secundario'}" data-acao="ordenar" data-modo="${m}">
        ${e.ordenacao === m ? '✔ ' : ''}${NOMES_ORDENACAO[m]} <span class="exemplo">${exemplos[m]}</span></button>`,
    )
    .join('');
  return `<div class="fundo-janela"><div class="janela">
    <h2>⇅ Ordenar minhas cartas</h2>
    ${opcoes}
    <p class="nota-ordenar">Ou arraste as cartas com o dedo para arrumar do seu jeito.</p>
    <div class="linha-links"><button class="link-diario" data-acao="menuOrdenar">Voltar</button></div>
  </div></div>`;
}

/** As 3 cartas em leque da tela inicial (A♥, coringa, K♠), desenhadas com as cartas do próprio jogo. */
function htmlLeque(): string {
  const c = (carta: Carta) => htmlCarta(carta).replace(/ data-carta="[^"]*"/, '');
  return `<div class="leque" aria-hidden="true">${c({ id: 'l1', curinga: false, naipe: 'copas', valor: 1 })}${c({ id: 'l2', curinga: true })}${c({ id: 'l3', curinga: false, naipe: 'espadas', valor: 13 })}</div>`;
}

export function htmlInicio(temPartida: boolean, email: string | null, rodada: number | null = null): string {
  const rod = rodada ? ` <small>Rodada ${rodada}</small>` : '';
  const principais = temPartida
    ? `<button class="grande" data-acao="continuar">▶ Continuar partida${rod}</button>
       <button class="grande ambar" data-acao="pedirNova">🃏 Partida nova</button>`
    : '<button class="grande" data-acao="pedirNova">▶ Começar a jogar</button>';
  return `<div class="tela-inicio">
    <div class="marca">
      ${htmlLeque()}
      <h1>Mexe-Mexe</h1>
      <p>Sequências e trincas. Quem acabar com as cartas primeiro, ganha!</p>
    </div>
    <div class="col-inicio">
      ${principais}
      <button class="grande secundario" data-acao="abrirOnline">🌐 Jogar online com amigos</button>
      <div class="grade-inicio">
        <button class="grande secundario" data-acao="abrirTutorial"><span class="e">❓</span>Como jogar</button>
        <button class="grande secundario" data-acao="abrirAjustes"><span class="e">⚙️</span>Ajustes</button>
        <button class="grande secundario" data-acao="abrirRetrospecto"><span class="e">📊</span>Retrospecto</button>
        <button class="grande secundario" data-acao="abrirMenuConta"><span class="e">${email ? '👤' : '☁️'}</span>${email ? 'Conta' : 'Entrar'}</button>
      </div>
      <div class="quem-joga">${email ? `Jogando como ${escapar(email)}` : 'Jogando sem conta, neste aparelho'}</div>
    </div>
  </div>`;
}

/** Menu da partida (botão ☰ do topo): tudo o que não é jogada. */
export function htmlMenu(online: boolean): string {
  const fim = online
    ? '<button class="grande sair" data-acao="onlineSair">🚪 Sair da sala</button>'
    : `<button class="grande secundario" data-acao="pedirNova">🃏 Começar partida nova</button>
       <button class="grande sair" data-acao="pausar">🏠 Sair para o início <small>a partida fica guardada</small></button>`;
  return `<div class="fundo-janela"><div class="janela janela-menu">
    <h2>Menu</h2>
    <div class="itens-menu">
      <button class="grande" data-acao="fecharJanela">▶ Voltar ao jogo</button>
      <button class="grande secundario" data-acao="menuOrdenar">⇅ Ordenar minhas cartas</button>
      <button class="grande secundario" data-acao="abrirAjustes">⚙️ Ajustes</button>
      <button class="grande secundario" data-acao="abrirTutorial">❓ Como jogar</button>
      ${fim}
    </div>
  </div></div>`;
}

export { escapar };

/** Uma janela simples: emoji, título, texto e botões grandes, um embaixo do outro. */
export interface Mensagem {
  emoji: string;
  titulo: string;
  texto: string;
  botoes: Array<{ acao: string; rotulo: string; secundario?: boolean }>;
}

export function htmlMensagem(m: Mensagem): string {
  return `<div class="fundo-janela"><div class="janela">
    <div class="emoji">${m.emoji}</div>
    <h2>${m.titulo}</h2>
    ${m.texto ? `<p>${m.texto}</p>` : ''}
    ${m.botoes.map((b) => `<button class="grande ${b.secundario ? 'secundario' : ''}" data-acao="${b.acao}">${b.rotulo}</button>`).join('')}
  </div></div>`;
}

/** Janela de entrar / criar conta. */
export function htmlConta(): string {
  return `<div class="fundo-janela"><form class="janela formulario" id="form-conta" novalidate>
    <div class="emoji">☁️</div>
    <h2>Sua conta</h2>
    <p>Com uma conta, a sua partida e o seu retrospecto ficam guardados na nuvem e aparecem em qualquer aparelho.</p>
    <input id="email" type="email" autocomplete="username" inputmode="email" placeholder="E-mail" autocapitalize="off" spellcheck="false" />
    <input id="senha" type="password" autocomplete="current-password" placeholder="Senha (pelo menos 6)" />
    <div class="erro" id="erro-conta"></div>
    <button class="grande" type="submit">Entrar</button>
    <button class="grande secundario" type="button" data-acao="criarConta">Criar conta nova</button>
    <div class="linha-links">
      <button class="link-diario" type="button" data-acao="esqueciSenha">Esqueci a senha</button>
      <button class="link-diario" type="button" data-acao="voltar">Agora não</button>
    </div>
  </form></div>`;
}

const NOME_NIVEL: Record<NivelIA, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };

/** Tela de retrospecto: tabela por nível e as últimas partidas. */
export function htmlRetrospecto(r: Resumo, email: string | null): string {
  const linha = (nome: string, c: Contagem, classe = '') =>
    `<tr class="${classe}"><th>${nome}</th><td>${c.jogadas}</td><td>${c.vitorias}</td><td>${c.derrotas}</td><td>${c.empates}</td></tr>`;
  const quando = (em: number) =>
    new Date(em).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
  const frase = { v: '🏆 Você ganhou', d: '😊 Adversário ganhou', e: '🤝 Empate' };
  const ultimas = r.ultimas.length
    ? `<ul class="ultimas">${r.ultimas
        .map((u) => `<li><b>${frase[u.r]}</b><span>${NOME_NIVEL[u.nivel] ?? ''}${u.motivo === 'monteAcabou' ? ' · monte acabou' : ''} · ${quando(u.em)}</span></li>`)
        .join('')}</ul>`
    : '<p class="nada">Nenhuma partida terminada ainda. Elas aparecem aqui quando acabam.</p>';
  return `<div class="fundo-janela"><div class="janela janela-retro">
    <h2>📊 Retrospecto</h2>
    <div class="quem-joga">${email ? `Conta: ${escapar(email)}` : 'Neste aparelho (sem conta)'}</div>
    <table class="retro">
      <thead><tr><th></th><th>Jogadas</th><th>Vitórias</th><th>Derrotas</th><th>Empates</th></tr></thead>
      <tbody>
        ${linha('Fácil', r.porNivel.facil)}${linha('Médio', r.porNivel.medio)}${linha('Difícil', r.porNivel.dificil)}${linha('Total', r.total, 'total')}
      </tbody>
    </table>
    <h3>Últimas partidas</h3>
    ${ultimas}
    <button class="grande" data-acao="voltar">Voltar</button>
  </div></div>`;
}

export function htmlConfirmarSair(): string {
  return `<div class="fundo-janela"><div class="janela">
    <h2>Quer mesmo sair?</h2>
    <p>A partida fica guardada: dá para continuar depois, na tela inicial.</p>
    <button class="grande" data-acao="pausar">Sim, sair para o início</button>
    <button class="grande secundario" data-acao="fecharJanela">Não, continuar jogando</button>
  </div></div>`;
}

/** Antes de começar uma partida contra o computador: como vai ser. (É o único lugar dessas escolhas.) */
export function htmlComoJogar(a: Ajustes): string {
  return `<div class="fundo-janela"><div class="janela janela-ajustes janela-como">
    <h2>🃏 Como vai ser?</h2>
    <div class="corpo-ajustes">
      <div class="ajuste"><div class="nome-ajuste">Jogo</div>
        ${opcoes('modo', a.modo, [['casual', 'Uma partida'], ['campeonato', 'Até 100 pontos']])}</div>
      <div class="ajuste"><div class="nome-ajuste">Computador</div>
        ${opcoes('nivel', a.nivel, [['facil', 'Fácil'], ['medio', 'Médio'], ['dificil', 'Difícil']])}</div>
      <div class="ajuste"><div class="nome-ajuste">Quantos adversários</div>
        ${opcoes('adversarios', String(a.adversarios), [['1', '1'], ['2', '2'], ['3', '3']])}</div>
      <div class="ajuste"><div class="nome-ajuste">Coringa</div>
        ${opcoes('curinga', String(a.curinga), [['false', 'Sem'], ['true', 'Com ★']])}</div>
    </div>
    <div class="rodape-ajustes">
      <button class="grande" data-acao="comecarComoEscolhido">▶ Começar</button>
      <button class="grande secundario" data-acao="fecharJanela">Voltar</button>
    </div>
  </div></div>`;
}

export function htmlConfirmarNova(): string {
  return `<div class="fundo-janela"><div class="janela">
    <h2>Começar outra partida?</h2>
    <p>A partida de agora vai ser perdida.</p>
    <button class="grande" data-acao="escolherNova">Sim, começar outra</button>
    <button class="grande secundario" data-acao="fecharJanela">Não, voltar</button>
  </div></div>`;
}

/** Linha da parte "Mais" dos Ajustes: no mesmo jeito das opções (nome à esquerda, botão branco à direita). */
function linhaMais(nome: string, explica: string, acao: string, rotulo: string): string {
  return `<div class="ajuste mais"><div class="nome-ajuste">${nome}<small>${explica}</small></div>
    <div class="opcoes"><button data-acao="${acao}">${rotulo}</button></div></div>`;
}

function opcoes(chave: string, atual: string, lista: Array<[string, string]>): string {
  return `<div class="opcoes">${lista
    .map(([valor, rotulo]) => `<button data-acao="ajuste" data-chave="${chave}" data-valor="${valor}" class="${valor === atual ? 'atual' : ''}">${rotulo}</button>`)
    .join('')}</div>`;
}

/**
 * Ajustes: só o que é da TELA e do ritmo do computador. O que é da partida (modo, nível, adversários, coringa)
 * fica no "Como vai ser?", que aparece a cada partida nova.
 */
export function htmlAjustes(a: Ajustes, online: Online | null = null, email: string | null = null): string {
  const quatro = '<span class="amostra"><b class="v">♥</b><b class="az">♦</b><b>♠</b><b class="vd">♣</b></span>';
  const duas = '<span class="amostra"><b class="v">♥♦</b><b>♠♣</b></span>';
  const computador = online
    ? ''
    : `<div class="secao">Computador</div>
    <div class="ajuste"><div class="nome-ajuste">Velocidade</div>
      ${opcoes('velocidade', a.velocidade, [['devagar', 'Devagar'], ['normal', 'Normal']])}</div>
    <div class="ajuste"><div class="nome-ajuste">Ver animações<small>dica e adversário</small></div>
      ${opcoes('animacoes', String(a.animacoes), [['true', 'Sim'], ['false', 'Não']])}</div>`;
  // Título e botão ficam FIXOS; só o meio rola (o que não cabe no celular).
  return `<div class="fundo-janela"><div class="janela janela-ajustes">
    <h2>⚙️ Ajustes</h2>
    <div class="corpo-ajustes">
      <div class="secao">Tela</div>
      <div class="ajuste"><div class="nome-ajuste">Visual</div>
        ${opcoes('visual', a.visual, [['idade', 'Melhor idade'], ['bonito', 'Normal']])}</div>
      <div class="ajuste"><div class="nome-ajuste">Cores dos naipes</div>
        ${opcoes('quatroCores', String(a.quatroCores), [['false', `2 cores${duas}`], ['true', `4 cores${quatro}`]])}</div>
      ${computador}
      ${online ? htmlTirarJogadores(online) : ''}
      <div class="secao">Mais</div>
      ${linhaMais('Retrospecto', 'vitórias e derrotas', 'abrirRetrospecto', '📊 Ver')}
      ${linhaMais('Conta', email ? escapar(email) : 'sem conta', 'abrirMenuConta', email ? '☁️ Abrir' : '☁️ Entrar')}
      ${linhaMais('Sugestão', 'ideia, problema ou elogio', 'abrirSugestao', '💬 Escrever')}
      ${linhaMais('Diário', 'das últimas partidas', 'baixarDiario', '📋 Baixar')}
    </div>
    <div class="rodape-ajustes">
      <button class="grande" data-acao="fecharJanela">Pronto</button>
    </div>
  </div></div>`;
}

export function htmlFim(p: Partida, camp: Campeonato | null = null, online: Online | null = null): string {
  const r = p.resultado!;
  const sit = camp ? situacaoDoCampeonato(camp, !online) : null;
  let titulo: string;
  let emoji: string;
  if (sit?.acabou) {
    emoji = sit.campeao === 0 ? '🎉🏆🎉' : '😊';
    titulo = sit.campeao === 0 ? 'Você ganhou o campeonato!' : `${escapar(p.jogadores[sit.campeao!].nome)} ganhou o campeonato.`;
  } else if (r.vencedor === 0) {
    emoji = '🎉🏆🎉';
    titulo = camp ? 'Você ganhou a rodada!' : 'Parabéns! Você ganhou!';
  } else if (r.vencedor === null) {
    emoji = '🤝';
    titulo = 'Deu empate!';
  } else {
    emoji = '😊';
    titulo = `${escapar(p.jogadores[r.vencedor].nome)} ganhou ${camp ? 'a rodada' : 'desta vez'}.`;
  }
  const explicacao =
    r.motivo === 'bateu'
      ? `<p>${r.vencedor === 0 ? 'Você acabou com todas as suas cartas!' : 'Ele acabou com as cartas dele.'}</p>`
      : '<p>O monte acabou. Ganha quem tem menos pontos na mão.</p>';
  // As cartas que sobraram na mão de cada um (também a do computador).
  const rodada = pontosDaRodada(r);
  const maos = p.jogadores
    .map((j, i) => {
      const cartas = j.mao.length ? j.mao.map((c) => htmlCarta(c).replace(/ data-carta="[^"]*"/, '')).join('') : '<span class="sem-cartas">sem cartas 🎉</span>';
      const pontos = pontosDaMao(j.mao, p.regras);
      const soma = camp ? ` · total <b>${camp.totais[i]}</b>${rodada[i] ? ` (+${rodada[i]})` : ''}` : '';
      return `<div class="mao-final"><div class="nome-final">${i === 0 ? 'Você' : escapar(j.nome)}: <b>${pontos} pontos</b> (${j.mao.length} cartas)${soma}</div><div class="cartas-finais">${cartas}</div></div>`;
    })
    .join('');
  const passaram = camp && sit?.podeContinuar ? p.jogadores.flatMap((j, i) => (camp.totais[i] >= camp.alvo ? [i === 0 ? 'Você' : j.nome] : [])) : [];
  const aviso100 = passaram.length ? `<p class="nota-camp"><b>${passaram.join(' e ')}</b> chegou a ${camp!.alvo} pontos. Quer continuar só com quem ainda não chegou, ou terminar aqui? (Terminando, ganha quem tem menos pontos.)</p>` : '';
  const campanha = aviso100 || (camp && !sit?.acabou ? `<p class="nota-camp">Rodada ${camp.rodada} · o campeonato acaba quando alguém chegar a ${camp.alvo} pontos.</p>` : '');
  const euDono = !!online?.sala && online.sala.dono === online.uid;
  const botao = online
    ? euDono
      ? `<button class="grande" data-acao="onlineProxima">${camp && sit?.acabou ? 'Novo campeonato' : 'Próxima rodada'}</button>`
      : '<p class="nota-camp">Esperando o criador da sala começar a próxima rodada…</p>'
    : sit?.podeContinuar
      ? `<button class="grande" data-acao="continuarSemEliminados">Continuar só com quem não chegou a ${camp!.alvo}</button>
         <button class="grande secundario" data-acao="terminarCampeonato">Terminar aqui</button>`
    : camp && !sit?.acabou
      ? '<button class="grande" data-acao="proximaRodada">Próxima rodada</button>'
      : `<button class="grande" data-acao="novaPartida">${camp ? 'Novo campeonato' : 'Jogar de novo'}</button>`;
  return `<div class="fundo-janela"><div class="janela janela-fim">
    <div class="corpo-fim">
      <div class="emoji">${emoji}</div>
      <h2>${titulo}</h2>
      ${explicacao}
      ${camp ? htmlPlacarFim(camp, p, rodada) : ''}
      <div class="maos-finais">${maos}</div>
      ${campanha}
    </div>
    <div class="rodape-fim">
      ${botao}
      <button class="grande secundario" data-acao="fecharJanela">Ver a mesa</button>
      ${online ? '<button class="link-diario" data-acao="onlineSair">Sair da sala</button>' : ''}
    </div>
  </div></div>`;
}

/** Tutorial: um passo por vez, com "Pular" sempre visível. */
export function htmlTutorial(passo: number): string {
  const passos = passosDoTutorial();
  const p = passos[passo];
  const ultimo = passo === passos.length - 1;
  return `<div class="fundo-janela"><div class="tutorial">
    <button class="pular" data-acao="tutorialPular">Pular</button>
    <div class="contador">PASSO ${passo + 1} DE ${passos.length}</div>
    <h2>${p.titulo}</h2>
    <div class="palco">${p.desenho}</div>
    <p>${p.texto}</p>
    <div class="pontos">${passos.map((_, i) => `<i class="${i === passo ? 'atual' : ''}"></i>`).join('')}</div>
    <div class="botoes-tutorial">
      <button class="claro" data-acao="tutorialVoltar" ${passo === 0 ? 'disabled' : ''}>Voltar</button>
      <button data-acao="${ultimo ? 'tutorialPular' : 'tutorialProximo'}">${ultimo ? 'Começar' : 'Próximo'}</button>
    </div>
  </div></div>`;
}

// ---------------------------------------------------------------------------
// Jogo online
// ---------------------------------------------------------------------------

/** Janela "Jogar online": nome + código da sala (ou criar uma sala nova). */
export function htmlMenuOnline(nome: string, codigo: string, erro: string, ocupado: boolean): string {
  return `<div class="fundo-janela"><div class="janela formulario">
    <div class="emoji">🌐</div>
    <h2>Jogar online</h2>
    <p>De 2 a ${MAX_JOGADORES} pessoas, cada uma no seu aparelho. Você só vê quantas cartas cada um tem.</p>
    <input id="nome-online" type="text" maxlength="16" placeholder="Seu nome" value="${escapar(nome)}" autocomplete="nickname" />
    <input id="codigo-online" type="text" maxlength="5" placeholder="Código da sala (se alguém te passou)" value="${escapar(codigo)}" autocapitalize="characters" autocomplete="off" spellcheck="false" />
    <div class="erro" id="erro-online">${escapar(erro)}</div>
    <button class="grande" data-acao="onlineEntrar" ${ocupado ? 'disabled' : ''}>Entrar na sala</button>
    <button class="grande secundario" data-acao="onlineCriar" ${ocupado ? 'disabled' : ''}>Criar sala nova</button>
    <div class="linha-links"><button class="link-diario" data-acao="fecharJanela">Voltar</button></div>
  </div></div>`;
}

/** Sala de espera: código, link, quem já entrou e o botão de começar (só do criador). */
export function htmlSala(o: Online, link: string): string {
  const s = o.sala!;
  const euDono = s.dono === o.uid;
  const lista = ativos(s)
    .map((i) => {
      const j = s.jogadores[i];
      const tirar = euDono && j.uid !== o.uid ? `<button class="tirar" data-acao="onlineTirar" data-idx="${i}">Tirar</button>` : '';
      return `<li><span>${escapar(j.nome)}${j.uid === s.dono ? ' <small>(criador)</small>' : ''}${j.uid === o.uid ? ' <small>(você)</small>' : ''}</span>${tirar}</li>`;
    })
    .join('');
  const qtd = ativos(s).length;
  const opc = (chave: string, atual: string, lista: Array<[string, string]>) =>
    euDono
      ? opcoesOnline(chave, atual, lista)
      : `<div class="so-ver">${lista.find(([v]) => v === atual)?.[1] ?? ''}</div>`;
  return `<div class="fundo-janela"><div class="janela janela-sala">
    <div class="emoji">🃏</div>
    <h2>Sala <span class="codigo">${o.codigo}</span></h2>
    <p>Chame quem vai jogar: mande o link (ou só o código).</p>
    <div class="link-sala">${escapar(link)}</div>
    <div class="linha-botoes">
      <button class="grande secundario" data-acao="onlineCopiar">📋 Copiar link</button>
      <button class="grande secundario" data-acao="onlineCompartilhar">📤 Compartilhar</button>
    </div>
    <h3>Na sala (${qtd} de ${MAX_JOGADORES})</h3>
    <ul class="lista-sala">${lista}</ul>
    ${euDono
      ? `<button class="grande" data-acao="onlineComecar" ${qtd < MIN_JOGADORES ? 'disabled' : ''}>${qtd < MIN_JOGADORES ? 'Esperando mais gente…' : '▶ Começar o jogo'}</button>`
      : '<p class="nota-camp">Esperando o criador da sala começar…</p>'}
    <div class="ajuste"><div class="nome-ajuste">Jogo</div>${opc('modo', s.config.modo, [['casual', 'Casual'], ['campeonato', 'Até 100 pontos']])}</div>
    <div class="ajuste"><div class="nome-ajuste">Coringa</div>${opc('curinga', String(s.config.curinga), [['false', 'Sem'], ['true', 'Com']])}</div>
    <div class="ajuste"><div class="nome-ajuste">Tempo por vez</div>${opc('limiteSeg', String(s.config.limiteSeg), [['120', '2 min'], ['180', '3 min'], ['300', '5 min']])}</div>
    <button class="link-diario" data-acao="onlineSair">Sair da sala</button>
  </div></div>`;
}

function opcoesOnline(chave: string, atual: string, lista: Array<[string, string]>): string {
  return `<div class="opcoes">${lista
    .map(([valor, rotulo]) => `<button data-acao="onlineConfig" data-chave="${chave}" data-valor="${valor}" class="${valor === atual ? 'atual' : ''}">${rotulo}</button>`)
    .join('')}</div>`;
}

/** Nos Ajustes (durante o jogo): o criador pode tirar quem sumiu. */
function htmlTirarJogadores(o: Online): string {
  const s = o.sala;
  if (!s || s.dono !== o.uid || s.fase === 'espera') return '';
  const outros = ativos(s).filter((i) => s.jogadores[i].uid !== o.uid);
  if (!outros.length) return '';
  return `<div class="ajuste"><div class="nome-ajuste">Tirar da sala<small>quem sumiu ou saiu</small></div><div class="opcoes">${outros
    .map((i) => `<button data-acao="onlineTirar" data-idx="${i}">${escapar(s.jogadores[i].nome)}</button>`)
    .join('')}</div></div>`;
}
