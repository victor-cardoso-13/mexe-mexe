/**
 * Monta o HTML de cada tela a partir do estado.
 * Aqui só se DESENHA; quem decide o que acontece é o src/main.ts.
 */
import { ehVermelha, nomeDoValor, SIMBOLO_NAIPE, type Carta, type CartaNormal } from '../motor/cartas';
import { conferirJogada, mexeuNaVez, type Partida } from '../motor/partida';
import { ordemDaTrinca, ordemParaMostrar, validarJogo } from '../motor/validacao';
import type { NivelIA } from '../motor/regras';
import type { Ajustes, Aviso, Estado } from './estado';
import type { Contagem, Resumo } from './retrospecto';
import { NOMES_ORDENACAO, ordenarMao, TEXTOS } from './textos';

// ---------------------------------------------------------------------------
// Carta
// ---------------------------------------------------------------------------

export function htmlCarta(c: Carta, classes = ''): string {
  if (c.curinga) {
    return `<div class="carta curinga ${classes}" data-carta="${c.id}">
      <div class="canto"><span class="valor">★</span></div>
      <div class="estrela">★</div>
      <div class="rotulo-curinga">CURINGA</div>
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
  ];
  return `<div class="${classes.join(' ')}">
    ${htmlTopo(e, p)}
    ${htmlAviso(e, p, minhaVez)}
    ${htmlMesa(e, p)}
    ${htmlMao(e, p)}
    ${htmlBotoes(p, minhaVez)}
  </div>${e.menuOrdenar ? htmlOrdenar(e) : ''}`;
}

function htmlTopo(e: Estado, p: Partida): string {
  const adversarios = p.jogadores
    .map((j, i) => {
      if (i === 0) return '';
      const qtd = e.cartasExibidas?.[i] ?? j.mao.length;
      const versos = '<div class="verso"></div>'.repeat(qtd);
      const alerta = qtd === 1 ? '<div class="alerta-uma">⚠️ Só 1 carta!</div>' : '';
      const daVez = p.vez === i && e.computadorJogando ? 'da-vez' : '';
      return `<div class="adversario ${daVez}" data-jogador="${i}"><span class="nome">${j.nome}</span><div class="versos">${versos}</div>${alerta}</div>`;
    })
    .join('');
  return `<div class="topo">
    ${adversarios}
    <div class="espaco"></div>
    <div class="monte"><div class="verso"></div> Monte: ${p.monte.length}</div>
    <button class="botao-ajustes" data-acao="abrirAjustes" aria-label="Ajustes">⚙️<span class="nome-ajustes"> Ajustes</span></button>
  </div>`;
}

/** Qual frase mostrar na faixa de aviso. */
function avisoAtual(e: Estado, p: Partida, minhaVez: boolean): Aviso & { acao?: string } {
  if (e.aviso) return e.aviso;
  if (p.resultado) return { texto: 'A partida acabou.', tipo: 'normal', acao: '<button class="acao" data-acao="novaPartida">Jogar de novo</button>' };
  if (!minhaVez) return { texto: 'Vez do computador…', tipo: 'computador' };
  if (e.dica) return { texto: e.dica.texto, tipo: 'normal', acao: '<button class="acao" data-acao="fazerDica">Fazer para mim</button>' };
  if (e.selecionadas.length) return { texto: TEXTOS.escolheuCartas, tipo: 'normal' };
  if (!mexeuNaVez(p)) {
    // Só aparece se existir mesmo um lugar para o curinga.
    const curinga = e.lugarCuringa ? '<button class="acao" data-acao="curingaSolto">🃏 Deixar o curinga solto</button>' : '';
    return { texto: TEXTOS.suaVez, tipo: 'normal', acao: curinga };
  }
  const c = conferirJogada(p);
  if (c.ok) return { texto: TEXTOS.tudoCerto, tipo: 'normal' };
  if (c.jogosInvalidos.length) return { texto: TEXTOS.mesaComProblema, tipo: 'problema' };
  return { texto: c.problemas[0], tipo: 'problema' };
}

function htmlAviso(e: Estado, p: Partida, minhaVez: boolean): string {
  const av = avisoAtual(e, p, minhaVez);
  return `<div class="aviso ${av.tipo}"><span>${av.texto}</span>${av.acao ?? ''}</div>`;
}

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
      let cartas: string;
      if (r.valido && r.tipo === 'trinca') {
        // Trinca: um naipe ao lado do outro; cartas repetidas empilhadas na vertical.
        const { colunas, base } = arrumarTrinca(r.ordem as CartaNormal[]);
        cartas =
          `<div class="colunas">${colunas.map((col) => `<div class="coluna">${col.map(carta).join('')}</div>`).join('')}</div>` +
          (base.length ? `<div class="base">${base.map(carta).join('')}</div>` : '');
      } else {
        cartas = ordemParaMostrar(j.cartas, p.regras).map(carta).join('');
      }
      const tipo = r.valido ? r.tipo : '';
      const classes = ['jogo', tipo, r.valido ? '' : 'invalido', e.destaques.includes(j.id) ? 'destaque' : ''].join(' ');
      const erro = r.valido ? '' : `<div class="erro">${r.motivo}</div>`;
      return `<div class="${classes}" data-destino="jogo:${j.id}">${cartas}${erro}</div>`;
    })
    .join('');
  return `<div class="mesa"><div class="jogos">${jogos}</div></div>`;
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
  // "Novo jogo" fica sempre no mesmo lugar: à direita das suas cartas.
  // Na vez do computador ele fica invisível, mas continua ocupando o lugar (nada "pula").
  const novo = `<div class="novo-jogo ${e.computadorJogando ? 'invisivel' : ''}" data-destino="novo"><div><div class="mais">+</div>Novo jogo</div></div>`;
  // No celular, o "Novo jogo" vira um botãozinho na linha do "Suas cartas" (a mão fica com a fila toda).
  const novoPequeno = `<div class="novo-jogo-pequeno ${e.computadorJogando ? 'invisivel' : ''}" data-destino="novo">+ Novo jogo</div>`;
  return `<div class="area-mao" data-destino="mao">
    <div class="rotulo-mao"><span>Suas cartas (${mao.length})</span><span class="dica-arrastar">· arraste para mudar a ordem</span>${novoPequeno}</div>
    <div class="linha-mao">
      <div class="mao">${cartas}</div>
      ${novo}
    </div>
  </div>`;
}

function htmlBotoes(p: Partida, minhaVez: boolean): string {
  const off = minhaVez ? '' : 'disabled';
  const podeDesfazer = minhaVez && mexeuNaVez(p) ? '' : 'disabled';
  const pronto = minhaVez && conferirJogada(p).ok;
  // Cada botão: ícone + nome. No celular o nome fica pequeno embaixo do ícone (botões minimalistas).
  const b = (acao: string, icone: string, nome: string, extra = '') =>
    `<button data-acao="${acao}" ${extra}><span class="icone">${icone}</span><span class="nome-botao">${nome}</span></button>`;
  return `<div class="botoes">
    ${b('desfazer', '↶', 'Desfazer', podeDesfazer)}
    ${b('desfazerTudo', '⟲', 'Desfazer tudo', podeDesfazer)}
    <div class="ordenar">${b('menuOrdenar', '⇅', 'Ordenar')}</div>
    ${b('dica', '💡', 'Dica', off)}
    ${b('comprar', '🂠', 'Comprar e passar', `class="comprar ${minhaVez && mexeuNaVez(p) ? 'apagado' : ''}" ${off}`)}
    ${b('baixar', '✔', 'Passar a vez', `class="baixar ${pronto ? '' : 'apagado'}" ${off}`)}
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
  </div></div>`;
}

export function htmlInicio(temPartida: boolean, email: string | null): string {
  return `<div class="fundo-janela"><div class="janela">
    <div class="emoji">🃏</div>
    <h1>Mexe-Mexe</h1>
    <p>Faça sequências do mesmo naipe ou trincas de naipes diferentes. Quem acabar com as cartas primeiro, ganha!</p>
    ${temPartida ? '<button class="grande" data-acao="continuar">▶ Continuar partida</button>' : ''}
    <button class="grande ${temPartida ? 'secundario' : ''}" data-acao="pedirNova">${temPartida ? 'Começar partida nova' : '▶ Começar a jogar'}</button>
    <div class="linha-botoes linha-inicio">
      <button class="grande secundario" data-acao="abrirAjustes">⚙️ Ajustes</button>
      <button class="grande secundario" data-acao="abrirRetrospecto">📊 Retrospecto</button>
      <button class="grande secundario" data-acao="abrirMenuConta">${email ? '👤 Conta' : '☁️ Entrar'}</button>
    </div>
    ${email ? `<div class="quem-joga">Jogando como ${escapar(email)}</div>` : ''}
  </div></div>`;
}

export const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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
  const frase = { v: '🏆 Você ganhou', d: '😊 Computador ganhou', e: '🤝 Empate' };
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

export function htmlConfirmarNova(): string {
  return `<div class="fundo-janela"><div class="janela">
    <h2>Começar outra partida?</h2>
    <p>A partida de agora vai ser perdida.</p>
    <button class="grande" data-acao="novaPartida">Sim, começar outra</button>
    <button class="grande secundario" data-acao="fecharJanela">Não, voltar</button>
  </div></div>`;
}

function opcoes(chave: string, atual: string, lista: Array<[string, string]>): string {
  return `<div class="opcoes">${lista
    .map(([valor, rotulo]) => `<button data-acao="ajuste" data-chave="${chave}" data-valor="${valor}" class="${valor === atual ? 'atual' : ''}">${rotulo}</button>`)
    .join('')}</div>`;
}

export function htmlAjustes(a: Ajustes, emJogo: boolean): string {
  return `<div class="fundo-janela"><div class="janela">
    <h2>⚙️ Ajustes</h2>
    <div class="ajuste"><div class="nome-ajuste">Computador</div>
      ${opcoes('nivel', a.nivel, [['facil', 'Fácil'], ['medio', 'Médio'], ['dificil', 'Difícil']])}</div>
    <div class="ajuste"><div class="nome-ajuste">Velocidade do computador</div>
      ${opcoes('velocidade', a.velocidade, [['devagar', 'Devagar'], ['normal', 'Normal']])}</div>
    <div class="ajuste"><div class="nome-ajuste">Cores dos naipes</div>
      ${opcoes('quatroCores', String(a.quatroCores), [['false', '2 cores'], ['true', '4 cores']])}</div>
    <div class="ajuste"><div class="nome-ajuste">Curinga<small>vale na próxima partida</small></div>
      ${opcoes('curinga', String(a.curinga), [['false', 'Sem'], ['true', 'Com']])}</div>
    <div class="ajuste"><div class="nome-ajuste">Adversários<small>vale na próxima partida</small></div>
      ${opcoes('adversarios', String(a.adversarios), [['1', '1'], ['2', '2'], ['3', '3']])}</div>
    <div class="linha-botoes">
      <button class="grande secundario" data-acao="abrirRetrospecto">📊 Retrospecto</button>
      <button class="grande secundario" data-acao="abrirMenuConta">☁️ Conta</button>
    </div>
    <button class="link-diario" data-acao="baixarDiario">📋 Baixar o diário do jogo (para o Claude investigar um problema)</button>
    <div class="linha-botoes">
      <button class="grande" data-acao="fecharJanela">Pronto</button>
      ${emJogo ? '<button class="grande secundario" data-acao="pedirNova">Começar partida nova</button>' : ''}
    </div>
  </div></div>`;
}

export function htmlFim(p: Partida): string {
  const r = p.resultado!;
  let titulo: string;
  let emoji: string;
  if (r.vencedor === 0) {
    emoji = '🎉🏆🎉';
    titulo = 'Parabéns! Você ganhou!';
  } else if (r.vencedor === null) {
    emoji = '🤝';
    titulo = 'Deu empate!';
  } else {
    emoji = '😊';
    titulo = `${p.jogadores[r.vencedor].nome} ganhou desta vez.`;
  }
  const explicacao =
    r.motivo === 'bateu'
      ? r.vencedor === 0
        ? '<p>Você acabou com todas as suas cartas!</p>'
        : '<p>Ele acabou com as cartas dele. Vamos de novo?</p>'
      : `<p>O monte acabou. Ganha quem tem menos pontos na mão:</p>
         <div class="placar">${p.jogadores.map((j, i) => `<div>${j.nome}: <b>${r.pontos[i]} pontos</b> (${j.mao.length} cartas)</div>`).join('')}</div>`;
  return `<div class="fundo-janela"><div class="janela">
    <div class="emoji">${emoji}</div>
    <h2>${titulo}</h2>
    ${explicacao}
    <button class="grande" data-acao="novaPartida">Jogar de novo</button>
    <button class="grande secundario" data-acao="fecharJanela">Ver a mesa</button>
  </div></div>`;
}
