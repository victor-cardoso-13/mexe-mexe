/**
 * Mexe-Mexe — controle da tela.
 * Liga os toques e botões às regras (src/motor) e ao computador (src/ia).
 */
import './estilo.css';
import { nomeDaCarta } from './motor/cartas';
import {
  comprarEPassar, conferirJogada, definirFoto, desfazer, jogadorDaVez, mesaMexidaEstaCerta, mexeuNaVez, moverCartas,
  novaPartida, ondeEstaCarta, recomecarJogada, terminarJogada, aplicarJogada, type Destino, type Partida,
} from './motor/partida';
import { criarRegras, type NivelIA } from './motor/regras';
import { novoCampeonato, proximaRodada, proximoAComecar, sortearQuemComeca, semOsEliminados, sobreviventes as sobreviventesDoCampeonato, somarRodada } from './motor/campeonato';
import { ultimaBusca, type Passo } from './ia';
import { cancelarBusca, escolherJogadaAsync } from './ia/assincrono';

/** Busca a jogada em segundo plano (a tela não trava). */
const buscarJogada = escolherJogadaAsync;
import { anotar, baixarDiario, diarioParaEnviar, guardarDicaPerdeu, textoCartas, textoMesa } from './ui/diario';
import { abrirSugestao } from './ui/sugestao';
import { estadoInicial, type Ajustes, type Ordenacao } from './ui/estado';
import { escapar, htmlAjustes, htmlComoJogar, htmlConfirmarNova, htmlConfirmarSair, htmlConta, htmlFim, htmlInicio, htmlJogo, htmlMensagem, htmlMenu, htmlMenuOnline, htmlRetrospecto, htmlSala, htmlSorteio, htmlTutorial, type Mensagem } from './ui/desenho';
import { encaixar, prepararTamanho, reiniciarEncaixe, soltarTamanho } from './ui/encaixe';
import { codigoNoLink, criarOnline, linkDaSalaAtual, nomeSalvo, LIMITE_PADRAO_SEG } from './online/controle';
import { carregarAjustes, carregarGaveta, salvarAjustes, salvarGaveta, type Gaveta } from './ui/salvar';
import { resultadoDaPartida, resumir } from './ui/retrospecto';
import {
  carregarConta, enviarAgora, iniciarNuvem, levarProgressoSemConta, progressoSemConta, sairDaConta,
  sincronizar, situacaoAtual, trocarGaveta, usuarioAtual, type Situacao,
} from './nuvem/sincronia';
import { descreverPasso, ordenarMao, resumoDoPasso, TEXTOS } from './ui/textos';
import { ligarToque } from './ui/toque';
import { prepararSom, tocarSuaVez } from './ui/som';
import { acordar, iniciarTelaAcesa, telaAcesa } from './ui/telaAcesa';
import { animarMovimento, capturarPosicoes, movimentosUmAUm } from './ui/animacao';

const app = document.getElementById('app')!;
/** Em que tela estava (se o navegador recarregar a página, volta para o jogo, não para o início). */
const CHAVE_TELA = 'mexe-mexe:tela';
const e = estadoInicial();
let ajustes: Ajustes = carregarAjustes();

/** Partida e retrospecto de quem está jogando (troca quando alguém entra ou sai da conta). */
let gaveta: Gaveta = carregarGaveta();
/** Muda a cada troca de gaveta: a jogada do computador que estava no meio para. */
let geracao = 0;
let mensagem: Mensagem | null = null;
/** Quais cartas estavam na mão no último desenho, e qual foi a última ordem automática escolhida. */
let maoVista = '';
let ordemAutomatica: Ordenacao = 'naipe';

/** Abre a partida guardada na gaveta (se houver). */
function abrirGaveta() {
  geracao++;
  cancelarBusca();
  maoVista = '';
  e.computadorJogando = false;
  reiniciarEncaixe();
  e.mesaExibida = e.cartasExibidas = null;
  e.selecionadas = [];
  limparMensagens();
  e.ultimasJogadas = [];
  const salvo = gaveta.jogo;
  if (!salvo) {
    Object.assign(e, { partida: null, partidaId: '', campeonato: null, ordemManual: [], novaCartaId: null, baixadasPeloComputador: [] });
    return;
  }
  // A partida salva guarda as regras de quando começou. Para valer sempre a versão
  // mais nova das regras da casa, refaz as regras e mantém só as escolhas da partida.
  const antigas = salvo.partida.regras;
  const regras = criarRegras({
    adversarios: antigas.adversarios,
    nivelIA: antigas.nivelIA,
    curinga: { ...criarRegras().curinga, ativo: antigas.curinga.ativo },
  });
  // Partidas guardadas antes da troca de nome: "Computador" virou "Adversário".
  // E, com vários adversários, o primeiro "Adversário" virou "Adversário 1" (antes ficava "A, 2, 3").
  const numerados = salvo.partida.jogadores.some((j) => /^Adversário \d$/.test(j.nome));
  const jogadores = salvo.partida.jogadores.map((j) => {
    const nome = j.nome.replace('Computador', 'Adversário');
    return { ...j, nome: numerados && nome === 'Adversário' ? 'Adversário 1' : nome };
  });
  e.partida = { ...salvo.partida, jogadores, regras };
  e.partidaId = salvo.id ?? `antiga-${salvo.partida.semente}`; // partidas de antes do retrospecto
  e.ordenacao = salvo.ordenacao;
  e.ordemManual = salvo.ordemManual;
  e.novaCartaId = salvo.novaCartaId;
  e.baixadasPeloComputador = salvo.baixadasPeloComputador ?? [];
  e.campeonato = salvo.campeonato ?? null;
}
abrirGaveta();

// ---------------------------------------------------------------------------
// Desenhar
// ---------------------------------------------------------------------------

/**
 * Redesenha a tela. Com "movimento", as cartas deslizam da posição antiga
 * para a nova (usado na jogada do computador).
 */
/**
 * A mão se reordena SEMPRE que muda (comprou, baixou, desfez...): volta para a ordem automática escolhida
 * (naipe ou valor). Só arrastar uma carta dentro da própria mão vale como ordem manual, até a próxima mudança.
 */
function reordenarMaoSeMudou() {
  const p = e.partida;
  if (!p || e.tela !== 'jogo') return;
  if (e.ordenacao !== 'manual') ordemAutomatica = e.ordenacao;
  const assinatura = p.jogadores[0].mao.map((c) => c.id).sort().join(',');
  if (maoVista && assinatura !== maoVista && e.ordenacao === 'manual') {
    e.ordenacao = ordemAutomatica;
    e.ordemManual = [];
  }
  maoVista = assinatura;
}

/** true enquanto a tela é desenhada "escondida" no estado final de uma jogada, só para medir (travarTamanhoNoFim). */
let medindoFim = false;

/**
 * Antes de uma jogada animada (adversário ou "Fazer" da dica): desenha a tela como ela vai ficar no FIM,
 * acerta o tamanho das cartas para esse fim e trava (encaixe.ts). Tudo no mesmo instante, sem aparecer na tela
 * (o navegador só pinta depois). Assim a mesa não encolhe no meio da jogada nem cresce de novo depois.
 */
function travarTamanhoNoFim(partidaFinal: Partida) {
  const guardado = { partida: e.partida, mesa: e.mesaExibida, cartas: e.cartasExibidas, chegaram: e.chegaram };
  e.partida = partidaFinal;
  e.mesaExibida = null;
  e.cartasExibidas = null;
  medindoFim = true;
  try {
    desenhar();
  } finally {
    medindoFim = false;
    e.partida = guardado.partida;
    e.mesaExibida = guardado.mesa;
    e.cartasExibidas = guardado.cartas;
    e.chegaram = guardado.chegaram;
  }
}

function desenhar(movimento?: { cartaId?: string; deJogador?: number | null; ms: number }) {
  if (!medindoFim) reordenarMaoSeMudou();
  const antes = movimento ? capturarPosicoes(app) : null;
  const rolagem = app.querySelector('.mesa')?.scrollTop ?? 0;
  localStorage.setItem(CHAVE_TELA, e.online ? 'inicio' : e.tela);
  telaAcesa(e.tela === 'jogo');
  document.body.classList.toggle('idade', ajustes.visual === 'idade');
  document.body.classList.toggle('bonito', ajustes.visual === 'bonito');
  let html = '';
  if (e.partida && e.tela === 'jogo') html += htmlJogo(e, ajustes);
  if (e.tela === 'sala' && e.online?.sala) html += htmlSala(e.online, linkDaSalaAtual(e.online.codigo));
  if (e.janela === 'online') html += htmlMenuOnline(nomeSalvo(), codigoConvite, '', false);
  if (e.tela === 'inicio' && !e.janela) {
    const temPartida = !!e.partida && !e.partida.resultado;
    html += htmlInicio(temPartida, usuarioAtual()?.email ?? null, temPartida && e.campeonato ? e.campeonato.rodada : null);
  }
  if (e.janela === 'menu') html += htmlMenu(!!e.online);
  if (e.janela === 'ajustes') html += htmlAjustes(ajustes, e.online, usuarioAtual()?.email ?? null);
  if (e.janela === 'retrospecto') html += htmlRetrospecto(resumir(gaveta.resultados), usuarioAtual()?.email ?? null);
  if (e.janela === 'conta') html += htmlConta();
  if (e.janela === 'mensagem' && mensagem) html += htmlMensagem(mensagem);
  if (e.janela === 'tutorial') html += htmlTutorial(e.tutorialPasso);
  if (e.janela === 'sorteio' && e.sorteio && e.partida) html += htmlSorteio(e, e.partida);
  if (e.janela === 'confirmarNova') html += htmlConfirmarNova();
  if (e.janela === 'confirmarSair') html += htmlConfirmarSair();
  if (e.janela === 'comoJogar') html += htmlComoJogar(ajustes);
  if (e.janela === 'fim' && e.partida) html += htmlFim(e.partida, e.campeonato, e.online);
  app.innerHTML = html;
  if (medindoFim) return prepararTamanho();
  encaixar(chaveDoEncaixe(), podeCrescerAsCartas(), e.computadorJogando);
  // Se a mesa rola (celular), ela fica onde estava (não volta para o topo a cada toque).
  const mesaEl = app.querySelector<HTMLElement>('.mesa');
  if (mesaEl && rolagem) mesaEl.scrollTop = rolagem;
  // Se a mesa rola (celular), mostra o jogo onde as cartas acabaram de chegar.
  const chegou = e.chegaram.length ? app.querySelector(`.mesa [data-carta="${e.chegaram[0]}"]`) : null;
  chegou?.closest('.jogo')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  e.chegaram = []; // a animação de "chegou" só toca uma vez
  if (movimento && antes) {
    // Carta que sai da mão do computador: parte das cartinhas dele lá em cima.
    const versos = movimento.deJogador != null ? app.querySelector(`[data-jogador="${movimento.deJogador}"] .versos`) : null;
    animarMovimento(app, antes, movimento.ms, movimento.cartaId, versos?.getBoundingClientRect() ?? null);
  }
}

/** As cartas só voltam a crescer no começo da sua vez (nunca no meio da jogada de ninguém). */
function podeCrescerAsCartas(): boolean {
  const p = e.partida;
  return !p || (!e.computadorJogando && p.vez === 0 && p.historico.length === 0);
}

/** O que muda o tamanho das cartas: os jogos da mesa (e o tamanho de cada um) e a mão. */
function chaveDoEncaixe(): string {
  const p = e.partida;
  if (!p || e.tela !== 'jogo') return '';
  const mesa = (e.mesaExibida ?? p.mesa).map((j) => j.cartas.map((c) => c.id).sort().join(',')).join(';');
  return `${mesa}#${p.jogadores[0].mao.length}#${e.cartasExibidas?.join(',') ?? ''}#${ajustes.visual}#${podeCrescerAsCartas() ? 'g' : ''}`;
}

function salvar() {
  if (!e.partida || e.online) return; // a partida online fica na sala, não no aparelho
  gaveta.jogo = {
    id: e.partidaId,
    partida: e.partida,
    ordenacao: e.ordenacao,
    ordemManual: e.ordemManual,
    novaCartaId: e.novaCartaId,
    baixadasPeloComputador: e.baixadasPeloComputador,
    campeonato: e.campeonato,
  };
  gaveta.jogoEm = Date.now();
  // Partida terminada entra no retrospecto (uma vez só, pela identidade dela).
  // Campeonato: os pontos da rodada que acabou são somados (uma vez só).
  if (e.campeonato && e.partida.resultado) {
    e.campeonato = somarRodada(e.campeonato, e.partida.resultado, e.partidaId);
    gaveta.jogo.campeonato = e.campeonato;
  }
  const r = resultadoDaPartida(e.partida);
  if (r && !gaveta.resultados[e.partidaId]) {
    gaveta.resultados[e.partidaId] = r;
    salvarGaveta(gaveta);
    void enviarAgora(); // resultado é importante: vai para a nuvem na hora
    return;
  }
  salvarGaveta(gaveta);
}

const esperarMs = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Passar a vez sozinho: assim que a mesa fica toda certa com 1 ou 3 cartas da mão,
 * o jogo mostra "Passando a vez…" e passa depois deste tempo.
 * Se a pessoa mexer em algo nesse meio tempo, não passa.
 */
const PASSAR_SOZINHO = true;
const ESPERA_PARA_PASSAR_MS = 600;

function talvezPassarSozinho() {
  if (!PASSAR_SOZINHO || !minhaVez() || !conferirJogada(e.partida!).ok) return;
  const momento = e.partida!.historico.length;
  e.aviso = { texto: 'Tudo certo! Passando a vez…', tipo: 'normal' };
  setTimeout(() => {
    // Só passa se nada mudou desde então.
    if (minhaVez() && e.partida!.historico.length === momento && conferirJogada(e.partida!).ok) botaoBaixar();
  }, ESPERA_PARA_PASSAR_MS);
}
const minhaVez = () => !!e.partida && e.partida.vez === 0 && !e.partida.resultado && !e.computadorJogando;

/** Limpa avisos e dica antes de cada nova ação da jogadora. */
function limparMensagens() {
  pararDeRever();
  e.aviso = null;
  e.dica = null;
  e.menuOrdenar = false;
}

/** "O que ele fez?": mostra na faixa o resumo da vez de cada adversário, um de cada vez. */
function rever(proximo: boolean) {
  if (!minhaVez() || !e.ultimasJogadas.length) return;
  const i = proximo && e.revendo !== null ? e.revendo + 1 : 0;
  if (i >= e.ultimasJogadas.length) {
    pararDeRever();
    return desenhar();
  }
  e.aviso = null;
  e.dica = null;
  e.revendo = i;
  const passos = e.ultimasJogadas[i].passos ?? [];
  const naMesa = new Set(e.partida!.mesa.map((j) => j.id));
  e.destaques = passos.flatMap((p) => p.jogoIds).filter((id) => naMesa.has(id));
  desenhar();
  const primeiro = e.destaques[0] && app.querySelector(`.mesa [data-destino="jogo:${e.destaques[0]}"]`);
  if (primeiro) primeiro.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function pararDeRever() {
  if (e.revendo === null) return;
  e.revendo = null;
  e.destaques = [];
}

/** Começou a sua vez: "plim" (se ligado) e a tela volta a contar os 30 s. */
function comecouSuaVez() {
  if (ajustes.sons) tocarSuaVez();
  acordar();
}

function avisar(texto: string, tipo: 'normal' | 'problema' = 'problema') {
  e.aviso = { texto, tipo };
}

// ---------------------------------------------------------------------------
// Começar partida
// ---------------------------------------------------------------------------

/** Começa uma partida. Com "proxima", continua o campeonato (próxima rodada); senão começa do zero. */
function comecarPartida(proxima = false, semEliminados = false) {
  // Continuando só com quem não chegou ao alvo, a mesa tem menos jogadores (e eles guardam os nomes).
  const nomesVivos = semEliminados && e.campeonato && e.partida ? sobreviventesDoCampeonato(e.campeonato).map((i) => e.partida!.jogadores[i].nome) : null;
  // Próxima rodada do campeonato: os MESMOS jogadores da rodada anterior (quem saiu não volta).
  const nomesDaRodada = !nomesVivos && proxima && e.campeonato && e.partida && e.partida.jogadores.length === e.campeonato.totais.length
    ? e.partida.jogadores.map((j) => j.nome)
    : null;
  const nomes = nomesVivos ?? nomesDaRodada;
  const regras = criarRegras({
    adversarios: nomes ? nomes.length - 1 : ajustes.adversarios,
    nivelIA: ajustes.nivel,
    curinga: { ...criarRegras().curinga, ativo: ajustes.curinga },
  });
  reiniciarEncaixe();
  maoVista = '';
  const semente = Math.floor(Math.random() * 2 ** 31);
  const antigo = e.campeonato;
  // Quem começa: campeonato novo = sorteio de cartas; próxima rodada = o jogador do lado (de 1 em 1); casual = você.
  let primeiro = 0;
  e.sorteio = null;
  if (nomesVivos && antigo) primeiro = proximoAComecar(antigo, sobreviventesDoCampeonato(antigo));
  else if (proxima && antigo) primeiro = proximoAComecar(antigo);
  else {
    // Partida casual (sem continuidade) e começo de campeonato: sorteio de cartas.
    const tiradas = sortearQuemComeca(Math.min(3, Math.max(1, regras.adversarios)) + 1, Math.floor(Math.random() * 2 ** 31));
    primeiro = tiradas[tiradas.length - 1].vencedor!;
    e.sorteio = { tiradas, atual: 0, viradas: false, casual: ajustes.modo !== 'campeonato' };
  }
  e.partida = novaPartida(regras, semente, nomes ?? undefined, primeiro);
  e.partidaId = `${Date.now().toString(36)}-${semente.toString(36)}`;
  if (nomesVivos) e.campeonato = { ...semOsEliminados(antigo!), primeiro };
  else if (proxima && antigo) e.campeonato = { ...proximaRodada(antigo), primeiro };
  else e.campeonato = ajustes.modo === 'campeonato' ? { ...novoCampeonato(e.partida.jogadores.length), primeiro } : null;
  Object.assign(e, { tela: 'jogo', janela: e.sorteio ? 'sorteio' : null, selecionadas: [], novaCartaId: null, ordemManual: [], baixadasPeloComputador: [], ultimasJogadas: [], revendo: null });
  limparMensagens();
  if (e.ordenacao === 'manual') e.ordenacao = 'naipe';
  salvar();
  // Primeira partida: mostra o tutorial (a pessoa pode pular).
  if (!ajustes.tutorialVisto) Object.assign(e, { janela: 'tutorial', tutorialPasso: 0 });
  desenhar();
  // Se o computador começa (e não há sorteio nem tutorial na tela), ele joga já.
  if (!e.janela && primeiro !== 0) void continuarJogo(700);
}

/** Sorteio de quem começa: virar, tirar de novo, jogar. */
function sorteioAcao(acao: 'virar' | 'outra' | 'fechar') {
  const s = e.sorteio;
  if (!s) return;
  if (acao === 'virar') s.viradas = true;
  else if (acao === 'outra') Object.assign(s, { atual: s.atual + 1, viradas: false });
  else {
    e.sorteio = null;
    e.janela = null;
    desenhar();
    if (e.partida && e.partida.vez !== 0) void continuarJogo(500);
    return;
  }
  desenhar();
}

// ---------------------------------------------------------------------------
// Tutorial
// ---------------------------------------------------------------------------

function abrirTutorial() {
  if (e.janela === 'ajustes') e.voltarPara = 'ajustes';
  Object.assign(e, { janela: 'tutorial', tutorialPasso: 0 });
  desenhar();
}

function fecharTutorial() {
  if (!ajustes.tutorialVisto) {
    ajustes.tutorialVisto = true;
    salvarAjustes(ajustes);
  }
  e.janela = e.voltarPara ?? (e.sorteio ? 'sorteio' : null);
  e.voltarPara = null;
  desenhar();
  if (!e.janela && e.partida && e.tela === 'jogo' && e.partida.vez !== 0 && !e.partida.resultado) void continuarJogo(700);
}

// ---------------------------------------------------------------------------
// Mexer nas cartas
// ---------------------------------------------------------------------------

function destinoDe(el: Element | null): Destino | null {
  const d = el?.closest<HTMLElement>('[data-destino]')?.dataset.destino;
  if (!d) return null;
  if (d === 'mao') return { tipo: 'mao' };
  if (d === 'novo') return { tipo: 'novoJogo' };
  return { tipo: 'jogo', jogoId: d.slice('jogo:'.length) };
}

function mover(ids: string[], destino: Destino) {
  const p = e.partida!;
  const r = moverCartas(p, ids, destino);
  if (!r.ok) {
    avisar(r.motivo);
  } else {
    e.partida = r.partida;
    e.chegaram = destino.tipo === 'mao' ? [] : ids;
  }
  e.selecionadas = [];
  if (r.ok) talvezPassarSozinho();
  salvar();
  desenhar();
}

function tocarCarta(id: string) {
  if (!minhaVez()) return;
  limparMensagens();
  const p = e.partida!;
  const onde = ondeEstaCarta(p, id);
  const sel = e.selecionadas;

  if (sel.includes(id)) {
    e.selecionadas = sel.filter((s) => s !== id);
  } else if (onde === 'mao' || sel.length === 0) {
    e.selecionadas = [...sel, id];
  } else if (sel.some((s) => ondeEstaCarta(p, s) !== 'mao')) {
    // Já escolheu carta da MESA: tocar em outra carta da mesa só escolhe mais uma (nunca move).
    // Para mover, toque no "+" do jogo (ou no espaço "jogo novo").
    e.selecionadas = [...sel, id];
  } else {
    // Só cartas da mão escolhidas: tocar numa carta da mesa leva as escolhidas para esse jogo.
    return mover(sel, { tipo: 'jogo', jogoId: onde! });
  }
  desenhar();
}

function tocarDestino(destino: Destino) {
  if (!minhaVez()) return;
  limparMensagens();
  if (e.selecionadas.length === 0) {
    desenhar();
    return;
  }
  mover(e.selecionadas, destino);
}

/** Soltou cartas arrastadas. */
function soltar(ids: string[], alvo: Element | null, x: number) {
  if (!minhaVez()) return;
  limparMensagens();
  const destino = destinoDe(alvo);
  if (!destino) return desenhar();
  const p = e.partida!;

  // Arrastou cartas da própria mão para dentro da mão: muda a ordem.
  if (destino.tipo === 'mao' && ids.every((id) => ondeEstaCarta(p, id) === 'mao')) {
    const ordem = ordenarMao(p.jogadores[0].mao, e.ordenacao, e.ordemManual).map((c) => c.id).filter((id) => !ids.includes(id));
    const sob = alvo?.closest<HTMLElement>('[data-carta]');
    let pos = ordem.length;
    if (sob && !ids.includes(sob.dataset.carta!)) {
      const r = sob.getBoundingClientRect();
      pos = ordem.indexOf(sob.dataset.carta!) + (x > r.left + r.width / 2 ? 1 : 0);
    }
    ordem.splice(pos, 0, ...ids);
    e.ordemManual = ordem;
    e.ordenacao = 'manual';
    e.selecionadas = [];
    salvar();
    return desenhar();
  }
  mover(ids, destino);
}

// ---------------------------------------------------------------------------
// Botões da jogadora
// ---------------------------------------------------------------------------

function botaoDesfazer(tudo: boolean) {
  if (!minhaVez()) return;
  limparMensagens();
  e.partida = tudo ? recomecarJogada(e.partida!) : desfazer(e.partida!);
  e.selecionadas = [];
  salvar();
  desenhar();
}

function botaoComprar() {
  if (!minhaVez()) return;
  limparMensagens();
  const p = e.partida!;
  if (mexeuNaVez(p) && !mesaMexidaEstaCerta(p)) {
    avisar(TEXTOS.mexeuAntesDeComprar);
    return desenhar();
  }
  const r = comprarEPassar(p);
  if (!r.ok) return;
  anotar('você comprou', { mao: textoCartas(p.jogadores[0].mao), mesa: textoMesa(p.mesa) });
  const minhaMao = r.partida.jogadores[0].mao;
  e.novaCartaId = minhaMao.length > p.jogadores[0].mao.length ? minhaMao[minhaMao.length - 1].id : null;
  e.partida = r.partida;
  e.selecionadas = [];
  if (e.novaCartaId) avisar(`Você comprou: ${nomeDaCarta(minhaMao[minhaMao.length - 1])}`, 'normal');
  salvar();
  desenhar();
  if (e.online) void online.enviarVez();
  else continuarJogo(900); // tempo de ver qual carta comprou
}

function botaoBaixar() {
  if (!minhaVez()) return;
  limparMensagens();
  const p = e.partida!;
  const c = conferirJogada(p);
  if (!c.ok) {
    avisar(mexeuNaVez(p) ? c.problemas.join(' ') : TEXTOS.baixarSemNada);
    return desenhar();
  }
  const r = terminarJogada(p);
  if (!r.ok) {
    avisar(r.motivo);
    return desenhar();
  }
  anotar('você jogou', {
    maoAntes: textoCartas(p.inicioDaVez.mao),
    mesaAntes: textoMesa(p.inicioDaVez.mesa),
    maoDepois: textoCartas(p.jogadores[0].mao),
    mesaDepois: textoMesa(p.mesa),
  });
  // Pediu dica nesta vez e achou mais do que ela? Guarda o caso à parte para eu poder estudar.
  const usouNaMao = p.inicioDaVez.mao.length - p.jogadores[0].mao.length;
  if (dicaDaVez && dicaDaVez.mao === textoCartas(p.inicioDaVez.mao) && dicaDaVez.mesa === textoMesa(p.inicioDaVez.mesa).join(' | ') && usouNaMao > dicaDaVez.usadas) {
    guardarDicaPerdeu({
      maoDoInicio: dicaDaVez.mao,
      mesaDoInicio: textoMesa(p.inicioDaVez.mesa),
      dicaSugeriu: dicaDaVez.sugestao,
      dicaBaixou: dicaDaVez.usadas,
      vocePosBaixou: usouNaMao,
      maoDepois: textoCartas(p.jogadores[0].mao),
      mesaDepois: textoMesa(p.mesa),
      busca: dicaDaVez.busca,
    });
  }
  dicaDaVez = null;
  e.partida = r.partida;
  e.novaCartaId = null;
  e.selecionadas = [];
  salvar();
  desenhar();
  if (e.online) void online.enviarVez();
  else continuarJogo(150);
}

/** A última dica pedida nesta vez (para comparar com o que o jogador fez no fim). */
let dicaDaVez: { mao: string; mesa: string; usadas: number; sugestao: string[]; busca: { ms: number; tempoAcabou: boolean } } | null = null;

function botaoDica() {
  if (!minhaVez() || e.online) return; // sem dica no jogo online
  limparMensagens();
  // Mostra que está procurando antes de pensar (a busca pode levar até 2 segundos).
  avisar('💡 Procurando uma jogada…', 'normal');
  desenhar();
  void (async () => {
    await esperarMs(50); // deixa o aviso aparecer antes de começar
    if (!minhaVez()) return;
    const p = e.partida!;
    let jogada;
    try {
      jogada = await buscarJogada(p, 'dificil', { dica: true });
    } catch {
      return; // a busca foi cancelada (nova partida, por exemplo)
    }
    if (e.partida !== p || !minhaVez()) return; // você mexeu na mesa enquanto ela pensava: esta resposta já não vale
    e.aviso = null;
    const situacao = { mao: textoCartas(p.inicioDaVez.mao), mesa: textoMesa(p.inicioDaVez.mesa), busca: { ...ultimaBusca } };
    dicaDaVez = {
      mao: situacao.mao,
      mesa: situacao.mesa.join(' | '),
      usadas: jogada ? jogada.passos.reduce((n, s) => n + s.cartasDaMao.length, 0) : 0,
      sugestao: jogada ? jogada.passos.map((passo) => descreverPasso(passo, '', p.regras, true)) : [],
      busca: { ...ultimaBusca },
    };
    if (!jogada) {
      anotar('dica: não achou', situacao);
      avisar(TEXTOS.semDica, 'normal');
      return desenhar();
    }
    const frases = jogada.passos.map((passo) => descreverPasso(passo, '', p.regras, true));
    anotar('dica: achou', { ...situacao, sugestao: frases });
    e.dica = {
      texto: `💡 ${frases[0]}${frases.length > 1 ? ` (e mais ${frases.length - 1} coisa${frases.length > 2 ? 's' : ''})` : ''}`,
      foto: jogada.foto,
      passos: jogada.passos,
      cartas: jogada.passos.flatMap((s) => s.cartasDaMao.map((c) => c.id)),
    };
    desenhar();
  })();
}

async function fazerDica() {
  if (!minhaVez() || !e.dica) return;
  const dica = e.dica;
  const base = e.partida!;
  limparMensagens();
  e.selecionadas = [];
  if (ajustes.animacoes && dica.passos.length > 0) {
    // Mostra a mesa se transformando, passo a passo (trava os toques até acabar).
    const minhaGeracao = geracao;
    const esperar = async (ms: number) => {
      await esperarMs(ms);
      if (geracao !== minhaGeracao) throw PAROU;
    };
    let visto = base;
    travarTamanhoNoFim(definirFoto(base, dica.foto));
    e.computadorJogando = true;
    try {
      await animarPassos(base, dica.passos, 'Você', true, esperar, temposDaAnimacao(), (id) => {
        // A carta sai da sua mão na hora em que desliza para a mesa.
        visto = { ...visto, jogadores: visto.jogadores.map((j, i) => (i === 0 ? { ...j, mao: j.mao.filter((c) => c.id !== id) } : j)) };
        e.partida = visto;
      });
    } catch (erro) {
      if (erro !== PAROU) throw erro;
      return;
    } finally {
      e.mesaExibida = null;
      e.cartasExibidas = null;
      e.destaques = [];
      e.computadorJogando = false;
      soltarTamanho();
    }
    if (e.partida !== visto) return; // mudou no meio (ex.: nova partida)
  }
  e.partida = definirFoto(base, dica.foto);
  e.chegaram = dica.cartas;
  avisar('Pronto! Se a mesa estiver certa, a vez passa sozinha.', 'normal');
  talvezPassarSozinho();
  salvar();
  desenhar();
}

// ---------------------------------------------------------------------------
// Vez do computador (mostrada devagar, passo a passo)
// ---------------------------------------------------------------------------

/** Tempos das animações (em milissegundos). Para deixar mais lento ou mais rápido, é só mudar aqui. */
function temposDaAnimacao() {
  const devagar = ajustes.velocidade === 'devagar';
  return {
    pensando: devagar ? 350 : 200, // "Vez do computador… pensando"
    frase: devagar ? 650 : 350, // mostra a frase antes de mexer
    voo: devagar ? 650 : 400, // a carta deslizando pela tela
    entreCartas: devagar ? 800 : 480, // de uma carta para a próxima
    fimDoPasso: devagar ? 450 : 250, // depois de arrumar os jogos
    compra: devagar ? 1100 : 700, // "não tinha jogo e comprou uma carta"
  };
}

async function continuarJogo(pausaInicial: number) {
  if (e.online) return; // online, quem joga são as pessoas
  if (e.computadorJogando || !e.partida) return;
  if (e.partida.resultado) return mostrarFim();
  if (e.partida.vez === 0) return;

  e.computadorJogando = true;
  const minhaGeracao = geracao;
  e.baixadasPeloComputador = []; // o selo laranja vale só para a última rodada do computador
  // Tempos da jogada do computador (em milissegundos). Para deixar mais lento ou
  // mais rápido, é só mudar aqui. "Devagar" é o padrão (ajuste da tela de Ajustes).
  const tempo = temposDaAnimacao();
  // Se a conta mudou no meio (outra gaveta aberta), a jogada para por aqui.
  const esperar = async (ms: number) => {
    await esperarMs(ms);
    if (geracao !== minhaGeracao) throw PAROU;
  };
  try {
    await esperar(pausaInicial);
    await jogadasDoComputador(esperar, tempo);
  } catch (erro) {
    if (erro !== PAROU) throw erro;
    return;
  }

  e.computadorJogando = false;
  e.aviso = null;
  if (e.partida?.resultado) return mostrarFim();
  desenhar();
  if (e.partida?.vez === 0) comecouSuaVez();
}

const PAROU = Symbol('parou');

/** Se a mesa rola (celular), leva a rolagem até o jogo, para a jogada do computador ficar sempre à vista. */
async function mostrarNaMesa(jogoId: string | undefined, esperar: (ms: number) => Promise<void>) {
  const mesaEl = app.querySelector<HTMLElement>('.mesa.rolavel');
  if (!mesaEl) return;
  const alvo = jogoId ? mesaEl.querySelector<HTMLElement>(`[data-destino="jogo:${jogoId}"]`) : null;
  let topo: number;
  if (alvo) {
    const m = mesaEl.getBoundingClientRect();
    const a = alvo.getBoundingClientRect();
    if (a.top >= m.top && a.bottom <= m.bottom) return; // já está à vista
    topo = mesaEl.scrollTop + (a.top - m.top) - (m.height - a.height) / 2;
  } else {
    topo = mesaEl.scrollHeight; // jogo novo: aparece no fim da mesa
  }
  mesaEl.scrollTo({ top: topo, behavior: 'smooth' });
  await esperar(500); // a carta só desliza depois que a rolagem terminou
}

/**
 * Mostra uma jogada passo a passo: diz o que vai fazer, desliza uma carta de cada vez e destaca o que mudou.
 * Serve para o computador e para a dica ("Fazer"). A partida em si só é trocada por quem chama, no fim.
 */
async function animarPassos(
  p: Partida,
  passos: Passo[],
  quem: string,
  comoDica: boolean,
  esperar: (ms: number) => Promise<void>,
  tempo: Record<string, number>,
  aoSairDaMao?: (cartaId: string) => void,
) {
  const daMao = new Set(p.jogadores[p.vez].mao.map((c) => c.id));
  e.cartasExibidas = p.jogadores.map((j) => j.mao.length);
  let mesaAnterior = p.mesa;
  for (const passo of passos) {
    // 1) Primeiro diz o que vai fazer...
    e.aviso = { texto: descreverPasso(passo, quem, p.regras, comoDica), tipo: 'computador', curto: resumoDoPasso(passo, p.regras) };
    e.destaques = passo.jogoIds;
    e.mesaExibida = mesaAnterior;
    desenhar();
    await mostrarNaMesa(passo.jogoIds[0], esperar);
    await esperar(tempo.frase);
    // 2) ...depois mexe uma carta de cada vez, deslizando pela tela.
    e.destaques = [];
    for (const mov of movimentosUmAUm(mesaAnterior, passo.mesa)) {
      const veioDaMao = daMao.has(mov.cartaId);
      if (veioDaMao) {
        e.cartasExibidas[p.vez] -= 1;
        if (!comoDica) e.baixadasPeloComputador.push(mov.cartaId);
        aoSairDaMao?.(mov.cartaId);
      }
      await mostrarNaMesa(mov.mesa.find((j) => j.cartas.some((c) => c.id === mov.cartaId))?.id, esperar);
      e.mesaExibida = mov.mesa;
      desenhar({ cartaId: mov.cartaId, deJogador: veioDaMao && !comoDica ? p.vez : null, ms: tempo.voo });
      await esperar(tempo.entreCartas);
    }
    // 3) Arruma os jogos na ordem final e destaca o que mudou.
    e.mesaExibida = passo.mesa;
    e.destaques = passo.jogoIds;
    desenhar({ ms: 300 });
    await esperar(tempo.fimDoPasso);
    mesaAnterior = passo.mesa;
  }
}

async function jogadasDoComputador(esperar: (ms: number) => Promise<void>, tempo: Record<string, number>) {
  if (e.partida && e.partida.vez !== 0) e.ultimasJogadas = [];
  while (e.partida && !e.partida.resultado && e.partida.vez !== 0) {
    const p: Partida = e.partida;
    const quem = jogadorDaVez(p).nome;
    e.aviso = { texto: `Vez do ${quem}… pensando`, tipo: 'computador', curto: 'pensando…' };
    desenhar();
    await esperar(tempo.pensando);

    let jogada;
    try {
      jogada = await buscarJogada(p);
    } catch {
      throw PAROU;
    }
    await esperar(0); // se a partida mudou enquanto ele pensava, para por aqui
    anotar(jogada ? 'computador jogou' : 'computador comprou', {
      nivel: p.regras.nivelIA,
      maoDele: textoCartas(p.inicioDaVez.mao),
      mesaAntes: textoMesa(p.inicioDaVez.mesa),
      mesaDepois: jogada ? textoMesa(jogada.foto.mesa) : undefined,
      busca: { ...ultimaBusca },
    });
    const r = jogada ? aplicarJogada(p, jogada.foto) : null;
    e.ultimasJogadas.push({ jogador: p.vez, passos: jogada && r?.ok ? jogada.passos : null });
    if (jogada && r?.ok) {
      if (ajustes.animacoes) {
        travarTamanhoNoFim(r.partida);
        try {
          await animarPassos(p, jogada.passos, `O ${quem}`, false, esperar, tempo);
        } finally {
          soltarTamanho();
        }
      } else e.destaques = jogada.passos.flatMap((passo) => passo.jogoIds);
      e.partida = r.partida;
    } else {
      const compra = comprarEPassar(p);
      if (compra.ok) e.partida = compra.partida;
      e.aviso = { texto: `O ${quem} não tinha jogo e comprou uma carta.`, tipo: 'computador', curto: 'comprou uma carta' };
      desenhar();
      await esperar(tempo.compra);
    }
    e.mesaExibida = null;
    e.cartasExibidas = null;
    e.destaques = [];
    salvar();
  }
}

function mostrarFim() {
  if (e.partida?.resultado) anotar('fim de partida', { resultado: e.partida.resultado });
  e.janela = 'fim';
  desenhar();
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

function mudarAjuste(chave: string, valor: string) {
  if (chave === 'nivel') {
    ajustes.nivel = valor as NivelIA;
    // O nível vale na hora, até na partida em andamento.
    if (e.partida && e.tela === 'jogo') e.partida = { ...e.partida, regras: { ...e.partida.regras, nivelIA: ajustes.nivel } };
  }
  if (chave === 'modo') ajustes.modo = valor as Ajustes['modo'];
  if (chave === 'visual') ajustes.visual = valor as Ajustes['visual'];
  if (chave === 'animacoes') ajustes.animacoes = valor === 'true';
  if (chave === 'velocidade') ajustes.velocidade = valor as Ajustes['velocidade'];
  if (chave === 'quatroCores') ajustes.quatroCores = valor === 'true';
  if (chave === 'curinga') ajustes.curinga = valor === 'true';
  if (chave === 'adversarios') ajustes.adversarios = Number(valor);
  if (chave === 'sons') {
    ajustes.sons = valor === 'true';
    if (ajustes.sons) {
      prepararSom();
      tocarSuaVez(); // para a pessoa ouvir como é
    }
  }
  salvarAjustes(ajustes);
  salvar();
  desenhar();
}

// ---------------------------------------------------------------------------
// Conta (entrar, criar, sair) e retrospecto
// ---------------------------------------------------------------------------

/** Ajustes → Sugestão: abre por cima dos Ajustes (que continuam abertos embaixo). */
function abrirTelaDeSugestao() {
  abrirSugestao({
    comConta: !!usuarioAtual(),
    enviar: async (texto) => {
      const c = await carregarConta();
      await c.enviarSugestao(texto, diarioParaEnviar());
    },
    erro: (err) => {
      const codigo = (err as { code?: string })?.code;
      if (codigo === 'unavailable' || !navigator.onLine) return 'Sem internet agora. Tente de novo quando a internet voltar.';
      if (codigo === 'auth/requires-login') return 'Entre na sua conta para mandar a sugestão.';
      return 'Algo deu errado. Tente de novo daqui a pouco.';
    },
    aoEntrar: () => abrirJanela('conta'),
    aoFechar: (enviou) => {
      if (!enviou) return; // "Voltar": continua nos Ajustes
      e.janela = null;
      desenhar();
    },
  });
}

/** Abre uma janela de conta/retrospecto, lembrando se veio dos Ajustes. */
function abrirJanela(janela: 'conta' | 'retrospecto' | 'mensagem') {
  if (e.janela === 'ajustes') e.voltarPara = 'ajustes';
  else if (e.janela !== 'conta' && e.janela !== 'retrospecto' && e.janela !== 'mensagem') e.voltarPara = null;
  e.janela = janela;
  desenhar();
  if (janela === 'conta') app.querySelector<HTMLInputElement>('#email')?.focus();
}

function mostrarMensagem(m: Mensagem) {
  mensagem = m;
  abrirJanela('mensagem');
}

function voltar() {
  e.janela = e.voltarPara;
  e.voltarPara = null;
  mensagem = null;
  desenhar();
}

const TEXTO_SITUACAO: Record<Situacao, string> = {
  verificando: '',
  'sem-conta': '',
  salvo: '☁️ Partida e retrospecto salvos na nuvem.',
  enviando: '☁️ Salvando…',
  'sem-internet': '📴 Sem internet agora: salva sozinho quando a internet voltar.',
};

function abrirMenuConta() {
  const u = usuarioAtual();
  if (!u) {
    return mostrarMensagem({
      emoji: '☁️',
      titulo: 'Sua conta',
      texto: 'Sem conta, a partida e o retrospecto ficam só neste aparelho. Com uma conta, ficam guardados na nuvem e aparecem em qualquer aparelho.',
      botoes: [
        { acao: 'abrirConta', rotulo: 'Entrar ou criar conta' },
        { acao: 'voltar', rotulo: 'Voltar', secundario: true },
      ],
    });
  }
  mostrarMensagem({
    emoji: '👤',
    titulo: escapar(u.email),
    texto: TEXTO_SITUACAO[situacaoAtual()],
    botoes: [
      { acao: 'pedirSair', rotulo: 'Sair da conta', secundario: true },
      { acao: 'voltar', rotulo: 'Voltar', secundario: true },
    ],
  });
}

/** Entrar ou criar conta, com o que foi digitado na janela. */
async function tentarConta(acao: 'entrar' | 'criar' | 'esqueci') {
  const form = app.querySelector<HTMLFormElement>('#form-conta');
  if (!form) return;
  const email = form.querySelector<HTMLInputElement>('#email')!.value;
  const senha = form.querySelector<HTMLInputElement>('#senha')!.value;
  const erro = form.querySelector<HTMLElement>('#erro-conta')!;
  const botoes = [...form.querySelectorAll<HTMLButtonElement>('button')];
  erro.className = 'erro';
  erro.textContent = '';
  botoes.forEach((b) => (b.disabled = true));
  try {
    const c = await carregarConta();
    if (acao === 'esqueci') {
      await c.esqueciSenha(email);
      erro.className = 'erro ok';
      erro.textContent = 'Pronto! Se existir uma conta com esse e-mail, chega lá uma mensagem para criar uma senha nova.';
      botoes.forEach((b) => (b.disabled = false));
      return;
    }
    if (acao === 'entrar') await c.entrar(email, senha);
    else await c.criarConta(email, senha);
    await depoisDeEntrar();
  } catch (erroFirebase) {
    const c = await carregarConta().catch(() => null);
    erro.textContent = c ? c.mensagemDeErro(erroFirebase) : 'Sem internet agora. Tente de novo quando a internet voltar.';
    botoes.forEach((b) => (b.disabled = false));
  }
}

/** Depois de entrar: abre a gaveta da conta, oferece levar o que foi jogado sem conta e junta com a nuvem. */
async function depoisDeEntrar() {
  const u = usuarioAtual() ?? (await esperarUsuario());
  if (trocarGaveta(u.uid)) {
    gaveta = carregarGaveta();
    abrirGaveta();
  }
  e.tela = 'inicio';
  e.voltarPara = null;
  if (progressoSemConta()) {
    return mostrarMensagem({
      emoji: '📱',
      titulo: 'Levar o que foi jogado neste aparelho?',
      texto: 'Você jogou sem conta neste aparelho. Quer juntar essa partida e esse retrospecto à sua conta? (Se este aparelho não é seu, escolha "Não".)',
      botoes: [
        { acao: 'levarSim', rotulo: 'Sim, levar para a minha conta' },
        { acao: 'levarNao', rotulo: 'Não', secundario: true },
      ],
    });
  }
  mostrarInicio();
}

/** Logo depois de entrar, o Firebase pode demorar um instante para avisar quem entrou. */
function esperarUsuario(): Promise<NonNullable<ReturnType<typeof usuarioAtual>>> {
  return new Promise((pronto) => {
    const ver = () => {
      const u = usuarioAtual();
      if (u) pronto(u);
      else setTimeout(ver, 50);
    };
    ver();
  });
}

/** Pausa a partida contra o computador: guarda tudo e volta ao início (lá tem "Continuar partida"). */
function pausar() {
  if (e.online || !e.partida) return;
  cancelarBusca();
  geracao++; // se o computador estava no meio da jogada, ela para; ao continuar ele refaz a vez
  e.computadorJogando = false;
  e.mesaExibida = e.cartasExibidas = null;
  e.destaques = [];
  e.aviso = null;
  e.selecionadas = [];
  salvar();
  mostrarInicio();
}

/** Volta para a tela inicial e traz da nuvem o que foi jogado em outro aparelho. */
function mostrarInicio() {
  e.tela = 'inicio';
  e.janela = null;
  mensagem = null;
  desenhar();
  if (usuarioAtual()) void sincronizar(gaveta).then(usarGavetaDaNuvem);
}

/** Usa a gaveta juntada com a nuvem (só na tela inicial, para não atrapalhar uma partida). */
function usarGavetaDaNuvem(nova: Gaveta) {
  if (e.tela !== 'inicio' || e.computadorJogando) return;
  gaveta = nova;
  abrirGaveta();
  if (e.janela !== 'conta') desenhar(); // não apaga o que a pessoa está digitando
}

function pedirSair() {
  mostrarMensagem({
    emoji: '👋',
    titulo: 'Sair da conta?',
    texto: 'A sua partida e o seu retrospecto continuam guardados na nuvem. Neste aparelho, o jogo volta para "sem conta".',
    botoes: [
      { acao: 'sairConta', rotulo: 'Sair' },
      { acao: 'voltar', rotulo: 'Cancelar', secundario: true },
    ],
  });
}

// ---------------------------------------------------------------------------
// Ligações
// ---------------------------------------------------------------------------

app.addEventListener('click', (ev) => {
  const alvo = ev.target as HTMLElement;
  const botao = alvo.closest<HTMLElement>('[data-acao]');
  if (botao) {
    const acao = botao.dataset.acao!;
    switch (acao) {
      case 'desfazer': return botaoDesfazer(false);
      case 'desfazerTudo': return botaoDesfazer(true);
      case 'baixarJogo':
        if (minhaVez() && e.selecionadas.length) mover(e.selecionadas, { tipo: 'novoJogo' });
        return;
      case 'proximaRodada': return comecarPartida(true);
      case 'sorteioVirar': return sorteioAcao('virar');
      case 'sorteioOutra': return sorteioAcao('outra');
      case 'sorteioFechar': return sorteioAcao('fechar');
      case 'abrirOnline':
        e.janela = 'online';
        return desenhar();
      case 'onlineEntrar': return void entrarOnline(false);
      case 'onlineCriar': return void entrarOnline(true);
      case 'onlineComecar': return void online.comecar();
      case 'onlineProxima': return void online.proximaRodada();
      case 'onlineSair':
        e.janela = null;
        return void online.sair();
      case 'onlineConfig': return void online.mudarConfig(botao.dataset.chave!, botao.dataset.valor!);
      case 'onlineTirar': return void online.tirar(Number(botao.dataset.idx));
      case 'onlineCopiar': return void copiarLink(false);
      case 'onlineCompartilhar': return void copiarLink(true);
      case 'abrirTutorial': return abrirTutorial();
      case 'tutorialPular': return fecharTutorial();
      case 'tutorialProximo':
        e.tutorialPasso++;
        return desenhar();
      case 'tutorialVoltar':
        e.tutorialPasso = Math.max(0, e.tutorialPasso - 1);
        return desenhar();
      case 'comprar': return botaoComprar();
      case 'dica': return botaoDica();
      case 'fazerDica': return fazerDica();
      case 'rever': return rever(false);
      case 'reverProxima': return rever(true);
      case 'abrirMenu':
        e.menuOrdenar = false;
        e.janela = 'menu';
        return desenhar();
      case 'menuOrdenar':
        // Abre pelo Menu (fecha o Menu); "Voltar" na janela de ordenar fecha.
        e.janela = null;
        e.menuOrdenar = !e.menuOrdenar;
        return desenhar();
      case 'escolherNova':
        // "Sim, começar outra": antes de começar, pergunta como vai ser.
        e.janela = 'comoJogar';
        return desenhar();
      case 'ordenar':
        e.ordenacao = botao.dataset.modo as Ordenacao;
        e.menuOrdenar = false;
        salvar();
        return desenhar();
      case 'abrirAjustes':
        e.janela = 'ajustes';
        return desenhar();
      case 'ajuste': return mudarAjuste(botao.dataset.chave!, botao.dataset.valor!);
      case 'abrirSugestao': return abrirTelaDeSugestao();
      case 'baixarDiario':
        anotar('diário baixado');
        return baixarDiario();
      case 'fecharJanela':
        e.janela = null;
        return desenhar();
      case 'continuar':
        e.tela = 'jogo';
        desenhar();
        return continuarJogo(400);
      case 'pausar': return pausar();
      case 'pedirPausa':
        e.janela = 'confirmarSair';
        return desenhar();
      case 'continuarSemEliminados': return comecarPartida(true, true);
      case 'terminarCampeonato':
        if (e.campeonato) e.campeonato = { ...e.campeonato, encerrado: true };
        salvar();
        return desenhar();
      case 'pedirNova':
        if (e.partida && !e.partida.resultado) {
          e.janela = 'confirmarNova';
          return desenhar();
        }
        e.janela = 'comoJogar';
        return desenhar();
      case 'novaPartida':
        if (e.tela === 'inicio') {
          e.janela = 'comoJogar';
          return desenhar();
        }
        return comecarPartida();
      case 'comecarComoEscolhido': return comecarPartida();
      case 'abrirRetrospecto': return abrirJanela('retrospecto');
      case 'abrirMenuConta': return abrirMenuConta();
      case 'abrirConta': return abrirJanela('conta');
      case 'criarConta': return void tentarConta('criar');
      case 'esqueciSenha': return void tentarConta('esqueci');
      case 'voltar': return voltar();
      case 'pedirSair': return pedirSair();
      case 'sairConta':
        e.voltarPara = null;
        return void sairDaConta().catch(() => mostrarMensagem({
          emoji: '📴', titulo: 'Não deu para sair agora', texto: 'Tente de novo quando a internet voltar.',
          botoes: [{ acao: 'voltar', rotulo: 'Ok' }],
        }));
      case 'levarSim':
        gaveta = levarProgressoSemConta(gaveta);
        abrirGaveta();
        return mostrarInicio();
      case 'levarNao': return mostrarInicio();
    }
    return;
  }
  // Toque num jogo da mesa, em "Novo jogo" ou na área da mão (fora das cartas).
  if (alvo.closest('[data-carta]')) return;
  if (e.menuOrdenar) {
    e.menuOrdenar = false;
    return desenhar();
  }
  const destino = destinoDe(alvo);
  // Tocar no fundo da mesa não faz nada (pode ser engano); jogo novo é pelo espaço pontilhado ou pelo botão.
  if (destino?.tipo === 'novoJogo' && !alvo.closest('.vazio')) return;
  if (destino) tocarDestino(destino);
});

// Som: o iPhone só libera depois de um toque. Tela acesa: 30 s sem tocar, escurece e deixa o iPhone apagar.
document.addEventListener('pointerdown', () => { if (ajustes.sons) prepararSom(); }, { capture: true, passive: true });
iniciarTelaAcesa(() => e.computadorJogando);

ligarToque(app, {
  podeMexer: minhaVez,
  tocarCarta,
  cartasParaArrastar: (id) => (e.selecionadas.includes(id) ? e.selecionadas : [id]),
  soltar: (ids, alvo, x) => soltar(ids, alvo, x),
});

// "Entrar" (ou a tecla Enter) na janela de conta.
app.addEventListener('submit', (ev) => {
  ev.preventDefault();
  void tentarConta('entrar');
});

window.addEventListener('resize', () => encaixar());
window.addEventListener('orientationchange', () => setTimeout(encaixar, 300));

// ---------------------------------------------------------------------------
// Jogo online (a sala e as outras pessoas ficam em src/online)
// ---------------------------------------------------------------------------

/** Código que veio no link (#sala=ABCDE): já aparece preenchido na janela "Jogar online". */
let codigoConvite = codigoNoLink() ?? '';

const online = criarOnline({
  e,
  suaVez: () => comecouSuaVez(),
  desenhar: () => desenhar(),
  voltarAoInicio: () => {
    abrirGaveta();
    e.tela = 'inicio';
    e.janela = null;
    desenhar();
  },
  mensagem: (m) => {
    abrirGaveta();
    e.tela = 'inicio';
    mostrarMensagem({ ...m, botoes: [{ acao: 'voltar', rotulo: 'Ok' }] });
  },
});

async function entrarOnline(criar: boolean) {
  const nome = app.querySelector<HTMLInputElement>('#nome-online')?.value ?? '';
  const codigo = app.querySelector<HTMLInputElement>('#codigo-online')?.value ?? '';
  const erro = app.querySelector<HTMLElement>('#erro-online');
  const botoes = [...app.querySelectorAll<HTMLButtonElement>('.janela button')];
  botoes.forEach((b) => (b.disabled = true));
  if (erro) erro.textContent = 'Conectando…';
  const problema = await online.entrar(nome, codigo, criar ? { curinga: ajustes.curinga, modo: ajustes.modo, limiteSeg: LIMITE_PADRAO_SEG } : undefined);
  if (problema) {
    if (erro) erro.textContent = problema;
    botoes.forEach((b) => (b.disabled = false));
    return;
  }
  codigoConvite = '';
  e.janela = null;
  desenhar();
}

/** Copia o link da sala (ou abre o "Compartilhar" do celular). */
async function copiarLink(compartilhar: boolean) {
  const codigo = e.online?.codigo;
  if (!codigo) return;
  const link = linkDaSalaAtual(codigo);
  try {
    if (compartilhar && navigator.share) {
      await navigator.share({ title: 'Mexe-Mexe', text: `Vem jogar Mexe-Mexe comigo! Sala ${codigo}`, url: link });
    } else {
      await navigator.clipboard.writeText(link);
      const b = app.querySelector<HTMLElement>('[data-acao="onlineCopiar"]');
      if (b) b.textContent = '✔ Link copiado';
    }
  } catch {
    /* a pessoa fechou o "Compartilhar": tudo bem */
  }
}

// Só para tirar prints no computador (não existe no jogo publicado).
if (import.meta.env.DEV) Object.assign(window, { __e: e, __desenhar: () => desenhar() });

// Se o navegador recarregou a página no meio de uma partida, volta direto para ela.
if (localStorage.getItem(CHAVE_TELA) === 'jogo' && e.partida) e.tela = 'jogo';
desenhar();
if (e.tela === 'jogo') void continuarJogo(400);
if (codigoConvite && codigoConvite !== localStorage.getItem('mexe-mexe:sala')) {
  e.janela = 'online'; // veio por um convite: pede o nome e entra
  desenhar();
} else void online.retomar();

let sincronizouAoAbrir = false;
void iniciarNuvem({
  // Alguém entrou ou saiu: abre a gaveta certa e volta para a tela inicial.
  trocouDeConta: () => {
    gaveta = carregarGaveta();
    abrirGaveta();
    e.tela = 'inicio';
    if (e.janela === 'conta') return; // quem está entrando é a própria janela de conta (depoisDeEntrar)
    e.janela = null;
    e.voltarPara = null;
    mensagem = null;
    desenhar();
  },
  mudouSituacao: () => {
    if (e.tela === 'inicio' && !e.janela) desenhar(); // atualiza o "Jogando como…"
    if (e.janela === 'mensagem' && mensagem?.emoji === '👤') abrirMenuConta();
    if (e.tela === 'inicio' && usuarioAtual() && situacaoAtual() === 'salvo' && !sincronizouAoAbrir) {
      sincronizouAoAbrir = true;
      void sincronizar(gaveta).then(usarGavetaDaNuvem);
    }
  },
});
