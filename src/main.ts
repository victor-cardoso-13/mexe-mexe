/**
 * Mexe-Mexe — controle da tela.
 * Liga os toques e botões às regras (src/motor) e ao computador (src/ia).
 */
import './estilo.css';
import { nomeDaCarta } from './motor/cartas';
import {
  comprarEPassar, conferirJogada, definirFoto, desfazer, jogadorDaVez, mexeuNaVez, moverCartas,
  novaPartida, ondeEstaCarta, recomecarJogada, terminarJogada, aplicarJogada, type Destino, type Partida,
} from './motor/partida';
import { criarRegras, type NivelIA } from './motor/regras';
import { escolherJogada, jogadaDoCuringa, ultimaBusca } from './ia';
import { anotar, baixarDiario, textoCartas, textoMesa } from './ui/diario';
import { estadoInicial, type Ajustes, type Ordenacao } from './ui/estado';
import { escapar, htmlAjustes, htmlConfirmarNova, htmlConta, htmlFim, htmlInicio, htmlJogo, htmlMensagem, htmlRetrospecto, type Mensagem } from './ui/desenho';
import { encaixar } from './ui/encaixe';
import { carregarAjustes, carregarGaveta, salvarAjustes, salvarGaveta, type Gaveta } from './ui/salvar';
import { resultadoDaPartida, resumir } from './ui/retrospecto';
import {
  carregarConta, enviarAgora, iniciarNuvem, levarProgressoSemConta, progressoSemConta, sairDaConta,
  sincronizar, situacaoAtual, trocarGaveta, usuarioAtual, type Situacao,
} from './nuvem/sincronia';
import { descreverPasso, ordenarMao, TEXTOS } from './ui/textos';
import { ligarToque } from './ui/toque';
import { animarMovimento, capturarPosicoes, movimentosUmAUm } from './ui/animacao';

const app = document.getElementById('app')!;
const e = estadoInicial();
let ajustes: Ajustes = carregarAjustes();

/** Partida e retrospecto de quem está jogando (troca quando alguém entra ou sai da conta). */
let gaveta: Gaveta = carregarGaveta();
/** Muda a cada troca de gaveta: a jogada do computador que estava no meio para. */
let geracao = 0;
let mensagem: Mensagem | null = null;

/** Abre a partida guardada na gaveta (se houver). */
function abrirGaveta() {
  geracao++;
  e.computadorJogando = false;
  e.mesaExibida = e.cartasExibidas = null;
  e.selecionadas = [];
  e.lugarCuringaVez = '';
  limparMensagens();
  const salvo = gaveta.jogo;
  if (!salvo) {
    Object.assign(e, { partida: null, partidaId: '', ordemManual: [], novaCartaId: null, baixadasPeloComputador: [] });
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
  e.partida = { ...salvo.partida, regras };
  e.partidaId = salvo.id ?? `antiga-${salvo.partida.semente}`; // partidas de antes do retrospecto
  e.ordenacao = salvo.ordenacao;
  e.ordemManual = salvo.ordemManual;
  e.novaCartaId = salvo.novaCartaId;
  e.baixadasPeloComputador = salvo.baixadasPeloComputador ?? [];
}
abrirGaveta();

// ---------------------------------------------------------------------------
// Desenhar
// ---------------------------------------------------------------------------

/**
 * Redesenha a tela. Com "movimento", as cartas deslizam da posição antiga
 * para a nova (usado na jogada do computador).
 */
function desenhar(movimento?: { cartaId?: string; deJogador?: number | null; ms: number }) {
  const antes = movimento ? capturarPosicoes(app) : null;
  let html = '';
  if (e.partida && e.tela === 'jogo') html += htmlJogo(e, ajustes);
  if (e.tela === 'inicio' && !e.janela) html += htmlInicio(!!e.partida && !e.partida.resultado, usuarioAtual()?.email ?? null);
  if (e.janela === 'ajustes') html += htmlAjustes(ajustes, e.tela === 'jogo');
  if (e.janela === 'retrospecto') html += htmlRetrospecto(resumir(gaveta.resultados), usuarioAtual()?.email ?? null);
  if (e.janela === 'conta') html += htmlConta();
  if (e.janela === 'mensagem' && mensagem) html += htmlMensagem(mensagem);
  if (e.janela === 'confirmarNova') html += htmlConfirmarNova();
  if (e.janela === 'fim' && e.partida) html += htmlFim(e.partida);
  app.innerHTML = html;
  encaixar(chaveDoEncaixe());
  // Se a mesa rola (celular), mostra o jogo onde as cartas acabaram de chegar.
  const chegou = e.chegaram.length ? app.querySelector(`.mesa [data-carta="${e.chegaram[0]}"]`) : null;
  chegou?.closest('.jogo')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  e.chegaram = []; // a animação de "chegou" só toca uma vez
  prepararCuringa();
  if (movimento && antes) {
    // Carta que sai da mão do computador: parte das cartinhas dele lá em cima.
    const versos = movimento.deJogador != null ? app.querySelector(`[data-jogador="${movimento.deJogador}"] .versos`) : null;
    animarMovimento(app, antes, movimento.ms, movimento.cartaId, versos?.getBoundingClientRect() ?? null);
  }
}

/** O que muda o tamanho das cartas: os jogos da mesa (e o tamanho de cada um) e a mão. */
function chaveDoEncaixe(): string {
  const p = e.partida;
  if (!p || e.tela !== 'jogo') return '';
  const mesa = (e.mesaExibida ?? p.mesa).map((j) => j.cartas.map((c) => c.id).sort().join(',')).join(';');
  return `${mesa}#${p.jogadores[0].mao.length}#${e.cartasExibidas?.join(',') ?? ''}#${e.aviso?.texto.length ?? 0}`;
}

function salvar() {
  if (!e.partida) return;
  gaveta.jogo = {
    id: e.partidaId,
    partida: e.partida,
    ordenacao: e.ordenacao,
    ordemManual: e.ordemManual,
    novaCartaId: e.novaCartaId,
    baixadasPeloComputador: e.baixadasPeloComputador,
  };
  gaveta.jogoEm = Date.now();
  // Partida terminada entra no retrospecto (uma vez só, pela identidade dela).
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
  e.aviso = null;
  e.dica = null;
  e.menuOrdenar = false;
}

function avisar(texto: string, tipo: 'normal' | 'problema' = 'problema') {
  e.aviso = { texto, tipo };
}

// ---------------------------------------------------------------------------
// Começar partida
// ---------------------------------------------------------------------------

function comecarPartida() {
  const regras = criarRegras({
    adversarios: ajustes.adversarios,
    nivelIA: ajustes.nivel,
    curinga: { ...criarRegras().curinga, ativo: ajustes.curinga },
  });
  const semente = Math.floor(Math.random() * 2 ** 31);
  e.partida = novaPartida(regras, semente);
  e.partidaId = `${Date.now().toString(36)}-${semente.toString(36)}`;
  Object.assign(e, { tela: 'jogo', janela: null, selecionadas: [], novaCartaId: null, ordemManual: [], baixadasPeloComputador: [] });
  limparMensagens();
  if (e.ordenacao === 'manual') e.ordenacao = 'naipe';
  salvar();
  desenhar();
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
  } else {
    // Tocou numa carta da mesa já tendo cartas escolhidas:
    // se é do mesmo jogo de alguma escolhida, escolhe junto; senão, leva as escolhidas para esse jogo.
    const mesmoJogo = sel.some((s) => ondeEstaCarta(p, s) === onde);
    if (mesmoJogo) e.selecionadas = [...sel, id];
    else return mover(sel, { tipo: 'jogo', jogoId: onde! });
  }
  desenhar();
}

function tocarDestino(destino: Destino) {
  if (!minhaVez()) return;
  limparMensagens();
  if (e.selecionadas.length === 0) {
    if (destino.tipo === 'novoJogo') avisar(TEXTOS.novoSemCartas, 'normal');
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

/**
 * No começo da vez da jogadora, se ela tem curinga na mão, procura (uma vez só) um lugar para ele.
 * Se achar, aparece o botão "Deixar o curinga solto".
 */
function prepararCuringa() {
  const p = e.partida;
  if (!p || !minhaVez()) return;
  const vez = `${p.monte.length}-${p.jogadores[0].mao.length}-${p.mesa.length}`;
  if (vez === e.lugarCuringaVez) return;
  e.lugarCuringaVez = vez;
  e.lugarCuringa = null;
  if (!p.inicioDaVez.mao.some((c) => c.curinga)) return;
  setTimeout(() => {
    if (!minhaVez() || e.lugarCuringaVez !== vez) return;
    e.lugarCuringa = jogadaDoCuringa(e.partida!)?.foto ?? null;
    desenhar();
  }, 150);
}

/** Botão "Deixar o curinga solto": o jogo coloca o curinga no lugar achado e passa a vez. */
function curingaSolto() {
  if (!minhaVez() || !e.lugarCuringa || mexeuNaVez(e.partida!)) return;
  anotar('curinga solto', { mesaAntes: textoMesa(e.partida!.mesa), mesaDepois: textoMesa(e.lugarCuringa.mesa) });
  e.partida = definirFoto(e.partida!, e.lugarCuringa);
  e.lugarCuringa = null;
  botaoBaixar();
}

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
  if (mexeuNaVez(p)) {
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
  continuarJogo(900); // tempo de ver qual carta comprou
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
  e.partida = r.partida;
  e.novaCartaId = null;
  e.selecionadas = [];
  salvar();
  desenhar();
  continuarJogo(150);
}

function botaoDica() {
  if (!minhaVez()) return;
  limparMensagens();
  // Mostra que está procurando antes de pensar (a busca pode levar até 2 segundos).
  avisar('💡 Procurando uma jogada…', 'normal');
  desenhar();
  setTimeout(() => {
    if (!minhaVez()) return;
    const p = e.partida!;
    const jogada = escolherJogada(p, 'dificil', { dica: true });
    e.aviso = null;
    const situacao = { mao: textoCartas(p.inicioDaVez.mao), mesa: textoMesa(p.inicioDaVez.mesa), busca: { ...ultimaBusca } };
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
      cartas: jogada.passos.flatMap((s) => s.cartasDaMao.map((c) => c.id)),
    };
    desenhar();
  }, 50);
}

function fazerDica() {
  if (!minhaVez() || !e.dica) return;
  const usadas = e.dica.cartas;
  e.partida = definirFoto(e.partida!, e.dica.foto);
  limparMensagens();
  e.chegaram = usadas;
  e.selecionadas = [];
  avisar('Pronto! Confira a mesa e toque em ✔ Passar a vez.', 'normal');
  talvezPassarSozinho();
  salvar();
  desenhar();
}

// ---------------------------------------------------------------------------
// Vez do computador (mostrada devagar, passo a passo)
// ---------------------------------------------------------------------------

async function continuarJogo(pausaInicial: number) {
  if (e.computadorJogando || !e.partida) return;
  if (e.partida.resultado) return mostrarFim();
  if (e.partida.vez === 0) return;

  e.computadorJogando = true;
  const minhaGeracao = geracao;
  e.baixadasPeloComputador = []; // o selo laranja vale só para a última rodada do computador
  // Tempos da jogada do computador (em milissegundos). Para deixar mais lento ou
  // mais rápido, é só mudar aqui. "Devagar" é o padrão (ajuste da tela de Ajustes).
  const devagar = ajustes.velocidade === 'devagar';
  const tempo = {
    pensando: devagar ? 350 : 200, // "Vez do computador… pensando"
    frase: devagar ? 650 : 350, // mostra a frase antes de mexer
    voo: devagar ? 650 : 400, // a carta deslizando pela tela
    entreCartas: devagar ? 800 : 480, // de uma carta para a próxima
    fimDoPasso: devagar ? 450 : 250, // depois de arrumar os jogos
    compra: devagar ? 1100 : 700, // "não tinha jogo e comprou uma carta"
  };
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
}

const PAROU = Symbol('parou');

async function jogadasDoComputador(esperar: (ms: number) => Promise<void>, tempo: Record<string, number>) {
  while (e.partida && !e.partida.resultado && e.partida.vez !== 0) {
    const p: Partida = e.partida;
    const quem = jogadorDaVez(p).nome;
    e.aviso = { texto: `Vez do ${quem}… pensando`, tipo: 'computador' };
    desenhar();
    await esperar(tempo.pensando);

    const jogada = escolherJogada(p);
    anotar(jogada ? 'computador jogou' : 'computador comprou', {
      nivel: p.regras.nivelIA,
      maoDele: textoCartas(p.inicioDaVez.mao),
      mesaAntes: textoMesa(p.inicioDaVez.mesa),
      mesaDepois: jogada ? textoMesa(jogada.foto.mesa) : undefined,
      busca: { ...ultimaBusca },
    });
    const r = jogada ? aplicarJogada(p, jogada.foto) : null;
    if (jogada && r?.ok) {
      const daMao = new Set(p.jogadores[p.vez].mao.map((c) => c.id));
      e.cartasExibidas = p.jogadores.map((j) => j.mao.length);
      let mesaAnterior = p.mesa;
      for (const passo of jogada.passos) {
        // 1) Primeiro diz o que vai fazer...
        e.aviso = { texto: descreverPasso(passo, `O ${quem}`, p.regras), tipo: 'computador' };
        e.destaques = passo.jogoIds;
        e.mesaExibida = mesaAnterior;
        desenhar();
        await esperar(tempo.frase);
        // 2) ...depois mexe uma carta de cada vez, deslizando pela tela.
        e.destaques = [];
        for (const mov of movimentosUmAUm(mesaAnterior, passo.mesa)) {
          const veioDaMao = daMao.has(mov.cartaId);
          if (veioDaMao) {
            e.cartasExibidas[p.vez] -= 1;
            e.baixadasPeloComputador.push(mov.cartaId);
          }
          e.mesaExibida = mov.mesa;
          desenhar({ cartaId: mov.cartaId, deJogador: veioDaMao ? p.vez : null, ms: tempo.voo });
          await esperar(tempo.entreCartas);
        }
        // 3) Arruma os jogos na ordem final e destaca o que mudou.
        e.mesaExibida = passo.mesa;
        e.destaques = passo.jogoIds;
        desenhar({ ms: 300 });
        await esperar(tempo.fimDoPasso);
        mesaAnterior = passo.mesa;
      }
      e.partida = r.partida;
    } else {
      const compra = comprarEPassar(p);
      if (compra.ok) e.partida = compra.partida;
      e.aviso = { texto: `O ${quem} não tinha jogo e comprou uma carta.`, tipo: 'computador' };
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
    if (e.partida) e.partida = { ...e.partida, regras: { ...e.partida.regras, nivelIA: ajustes.nivel } };
  }
  if (chave === 'velocidade') ajustes.velocidade = valor as Ajustes['velocidade'];
  if (chave === 'quatroCores') ajustes.quatroCores = valor === 'true';
  if (chave === 'curinga') ajustes.curinga = valor === 'true';
  if (chave === 'adversarios') ajustes.adversarios = Number(valor);
  salvarAjustes(ajustes);
  salvar();
  desenhar();
}

// ---------------------------------------------------------------------------
// Conta (entrar, criar, sair) e retrospecto
// ---------------------------------------------------------------------------

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
      case 'comprar': return botaoComprar();
      case 'baixar': return botaoBaixar();
      case 'dica': return botaoDica();
      case 'fazerDica': return fazerDica();
      case 'curingaSolto': return curingaSolto();
      case 'menuOrdenar':
        e.menuOrdenar = !e.menuOrdenar;
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
      case 'pedirNova':
        if (e.partida && !e.partida.resultado) {
          e.janela = 'confirmarNova';
          return desenhar();
        }
        return comecarPartida();
      case 'novaPartida': return comecarPartida();
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
  if (destino) tocarDestino(destino);
});

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

desenhar();

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
