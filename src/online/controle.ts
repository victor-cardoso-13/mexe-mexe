/**
 * Jogo online: liga a sala (Firebase) à tela. O main.ts só chama as funções daqui.
 * O Firebase só é carregado quando a pessoa abre o jogo online.
 */
import type { Partida } from '../motor/partida';
import type { Estado, Online } from '../ui/estado';
import {
  aoTerminarVez, campeonatoLocal, codigoDoLink, codigoValido, indiceDe, linkDaSala, partidaDoFim, partidaLocal,
  passouOTempo, todosRevelaram, LIMITE_PADRAO_SEG, type ConfigSala, type Sala,
} from './logica';

type Sala$ = typeof import('./sala');

const CHAVE_SALA = 'mexe-mexe:sala';
const CHAVE_NOME = 'mexe-mexe:nome';

export interface Contexto {
  e: Estado;
  desenhar(): void;
  /** Volta para a tela inicial (e abre de novo a partida do computador, se houver). */
  voltarAoInicio(): void;
  mensagem(m: { emoji: string; titulo: string; texto: string }): void;
}

export const nomeSalvo = () => localStorage.getItem(CHAVE_NOME) ?? '';
export const codigoNoLink = () => codigoDoLink(location.hash);
export const linkDaSalaAtual = (codigo: string) => linkDaSala(codigo, location.href);

export function criarOnline(ctx: Contexto) {
  const { e } = ctx;
  let api: Sala$ | null = null;
  let desligar: Array<() => void> = [];
  let relogio: ReturnType<typeof setInterval> | null = null;
  /** Passa a cada mudança: respostas atrasadas de uma mudança velha são ignoradas. */
  let passo = 0;
  let revelouRodada = 0;
  let tentouTempo = -1;
  let enviando = false;

  async function carregar(): Promise<Sala$> {
    return (api ??= await import('./sala'));
  }

  // ---------------------------------------------------------------- entrar e criar

  /** Quem entrou por aqui: cria a sala (se não houver código) ou entra numa existente. */
  async function entrar(nomeDigitado: string, codigoDigitado: string, config?: ConfigSala): Promise<string | null> {
    const nome = nomeDigitado.trim().slice(0, 16);
    if (!nome) return 'Digite o seu nome.';
    let codigo = codigoDigitado.trim().toUpperCase();
    if (config === undefined && !codigoValido(codigo)) return 'O código tem 5 letras ou números. Confira com quem te convidou.';
    try {
      const s = await carregar();
      localStorage.setItem(CHAVE_NOME, nome);
      if (config) codigo = await s.criarSala(nome, config);
      else {
        const r = await s.entrarNaSala(codigo, nome);
        if (r === 'inexistente') return 'Não achei essa sala. Confira o código.';
        if (r === 'cheia') return 'Essa sala já tem 4 pessoas.';
        if (r === 'comecou') return 'Essa partida já começou.';
      }
      await conectar(codigo, nome);
      return null;
    } catch {
      return 'Não deu para conectar. Confira a internet e tente de novo.';
    }
  }

  async function conectar(codigo: string, nome = nomeSalvo()) {
    const s = await carregar();
    const uid = await s.garantirUid();
    desconectar();
    e.online = { codigo, uid, nome, sala: null, eu: -1, versaoLocal: -1, reveladas: {}, erro: '' };
    localStorage.setItem(CHAVE_SALA, codigo);
    revelouRodada = 0;
    tentouTempo = -1;
    desligar = [
      s.observarSala(codigo, (sala) => void aoMudarSala(sala), () => sumiu('Não deu para acompanhar a sala (sem internet?).')),
      s.observarPendentes(codigo, uid, () => {
        // cartas compradas pelo jogo enquanto eu demorava: só junta quando não estou no meio de uma jogada
        if (!(e.online?.sala?.fase === 'jogando' && e.online.sala.vez === e.online.eu)) void s.juntarPendentes(codigo, uid);
      }),
      s.observarReveladas(codigo, () => e.online?.sala?.rodada ?? 0, (r) => {
        if (!e.online) return;
        e.online.reveladas = r;
        if (e.online.sala?.fase === 'fim') void aoMudarSala(e.online.sala); // as mãos chegaram: mostra o resultado
        void talvezContar();
      }),
    ];
    relogio = setInterval(aCadaSegundo, 1000);
  }

  function desconectar() {
    desligar.forEach((f) => f());
    desligar = [];
    if (relogio) clearInterval(relogio);
    relogio = null;
    passo++;
  }

  /** Sair de verdade: a pessoa não volta mais para essa sala sozinha. */
  async function sair() {
    const dados = e.online;
    desconectar();
    localStorage.removeItem(CHAVE_SALA);
    e.online = null;
    e.computadorJogando = false;
    e.janela = null;
    if (location.hash.includes('sala=')) history.replaceState(null, '', location.pathname + location.search);
    if (dados && api) await api.sairDaSala(dados.codigo, dados.uid).catch(() => {});
    ctx.voltarAoInicio();
  }

  function sumiu(texto: string) {
    desconectar();
    localStorage.removeItem(CHAVE_SALA);
    e.online = null;
    e.computadorJogando = false;
    ctx.mensagem({ emoji: '😕', titulo: 'Sala encerrada', texto });
  }

  // ---------------------------------------------------------------- a sala mudou

  async function aoMudarSala(sala: Sala | null) {
    if (!e.online) return;
    const eu = e.online;
    if (!sala) return sumiu('Essa sala não existe mais.');
    const antes = eu.sala;
    eu.sala = sala;
    eu.eu = indiceDe(sala, eu.uid);
    if (eu.eu === -1) return sumiu('Você não está mais nessa sala.');
    const meuPasso = ++passo;

    if (sala.fase === 'espera') {
      e.tela = 'sala';
      e.partida = null;
      e.computadorJogando = false;
      return ctx.desenhar();
    }
    if (sala.fase === 'jogando') {
      if (eu.versaoLocal === sala.versao && e.tela === 'jogo' && e.partida) {
        e.computadorJogando = sala.vez !== eu.eu || enviando;
        return ctx.desenhar(); // só mudou algo que não é jogada (ex.: alguém saiu)
      }
      return reconstruir(meuPasso, antes);
    }
    if (sala.fase === 'contando') {
      e.computadorJogando = true;
      e.tela = 'jogo';
      await revelarMinhaMao(sala);
      return ctx.desenhar();
    }
    // fim da rodada: mostra o resultado com as mãos de todo mundo (espera as mãos chegarem)
    if (sala.motivoFim !== null && !todosRevelaram(sala, eu.reveladas)) return ctx.desenhar();
    const final = partidaDoFim(sala, eu.eu, eu.reveladas);
    e.partida = final;
    e.campeonato = campeonatoLocal(sala, eu.eu);
    e.computadorJogando = false;
    e.tela = 'jogo';
    e.janela = 'fim';
    ctx.desenhar();
  }

  /** Monta a partida da tela com a sala de agora e a minha mão (do banco). */
  async function reconstruir(meuPasso: number, antes: Sala | null = null) {
    const dados = e.online;
    if (!dados?.sala || !api) return;
    const sala = dados.sala;
    await api.juntarPendentes(dados.codigo, dados.uid).catch(() => false);
    const minha = await api.lerMinhaMao(dados.codigo, dados.uid);
    if (meuPasso !== passo || !e.online) return;
    const idsAntes = new Set(e.partida?.mesa.flatMap((j) => j.cartas.map((c) => c.id)) ?? []);
    // perdi a vez porque o tempo acabou (e não por uma jogada minha)?
    const perdiAVez = !!antes && antes.fase === 'jogando' && antes.rodada === sala.rodada && antes.vez === dados.eu && sala.vez !== dados.eu && !enviando;
    const nova: Partida = partidaLocal(sala, dados.eu, minha);
    const jaTinhaPartida = !!e.partida && e.tela === 'jogo' && e.janela !== 'fim';
    e.partida = nova;
    e.partidaId = `online-${dados.codigo}-${sala.rodada}`;
    e.campeonato = campeonatoLocal(sala, dados.eu);
    dados.versaoLocal = sala.versao;
    e.selecionadas = [];
    e.dica = null;
    e.menuOrdenar = false;
    e.tela = 'jogo';
    if (e.janela === 'fim' || e.janela === 'online') e.janela = null;
    e.computadorJogando = sala.vez !== dados.eu;
    // cartas que os outros acabaram de baixar ficam com o selo "NOVA"
    e.baixadasPeloComputador = jaTinhaPartida ? nova.mesa.flatMap((j) => j.cartas.map((c) => c.id)).filter((id) => !idsAntes.has(id)) : [];
    e.chegaram = [];
    e.aviso = perdiAVez
      ? { texto: 'Acabou o seu tempo: o jogo comprou uma carta por você.', tipo: 'problema' }
      : null;
    ctx.desenhar();
  }

  async function revelarMinhaMao(sala: Sala) {
    const dados = e.online;
    if (!dados || !api || revelouRodada === sala.rodada) return;
    revelouRodada = sala.rodada;
    const mao = e.partida?.jogadores[0].mao ?? (await api.lerMinhaMao(dados.codigo, dados.uid));
    await api.revelarMao(dados.codigo, dados.uid, sala.rodada, mao).catch(() => (revelouRodada = 0));
  }

  async function talvezContar() {
    const dados = e.online;
    const sala = dados?.sala;
    if (!dados || !sala || !api || sala.fase !== 'contando') return;
    await api.contarPontos(dados.codigo, dados.reveladas).catch(() => {});
  }

  // ---------------------------------------------------------------- jogar

  /** Depois de jogar ou comprar (a partida da tela já foi atualizada): manda para a sala. */
  async function enviarVez() {
    const dados = e.online;
    const p = e.partida;
    if (!dados || !p || !api || enviando) return;
    enviando = true;
    e.computadorJogando = true;
    e.aviso = { texto: 'Enviando a sua jogada…', tipo: 'computador' };
    ctx.desenhar();
    const base = dados.versaoLocal;
    try {
      await api.terminarMinhaVez(dados.codigo, dados.uid, base, (s, eu) => aoTerminarVez(s, eu, p, Date.now()));
      dados.versaoLocal = base + 1;
      enviando = false;
      e.aviso = null;
      if (dados.sala) e.computadorJogando = true;
      ctx.desenhar();
    } catch {
      enviando = false;
      e.aviso = { texto: 'A sala mudou enquanto você jogava. Atualizando…', tipo: 'problema' };
      dados.versaoLocal = -1;
      if (dados.sala) void reconstruir(++passo, null);
    }
  }

  async function proximaRodada() {
    const dados = e.online;
    if (!dados?.sala || !api || dados.sala.dono !== dados.uid) return;
    await api.comecarRodada(dados.codigo).catch(() => {});
  }

  async function comecar() {
    await proximaRodada();
  }

  async function mudarConfig(chave: string, valor: string) {
    const dados = e.online;
    if (!dados?.sala || !api || dados.sala.dono !== dados.uid || dados.sala.fase !== 'espera') return;
    const c = { ...dados.sala.config };
    if (chave === 'curinga') c.curinga = valor === 'true';
    if (chave === 'modo') c.modo = valor as ConfigSala['modo'];
    if (chave === 'limiteSeg') c.limiteSeg = Number(valor);
    await api.mudarConfig(dados.codigo, c).catch(() => {});
  }

  async function tirar(idx: number) {
    const dados = e.online;
    if (!dados?.sala || !api || dados.sala.dono !== dados.uid) return;
    await api.tirarJogador(dados.codigo, idx).catch(() => {});
  }

  // ---------------------------------------------------------------- relógio da vez

  /** Todo segundo: mostra o tempo que falta e, se acabou, qualquer um dos jogadores faz o jogo comprar e passar. */
  function aCadaSegundo() {
    const dados = e.online;
    const sala = dados?.sala;
    if (!dados || !sala || sala.fase !== 'jogando' || !api) return;
    const resta = Math.max(0, Math.ceil((sala.vezDesde + sala.config.limiteSeg * 1000 - Date.now()) / 1000));
    const el = document.getElementById('tempo');
    if (el) {
      el.textContent = `⏱ ${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}`;
      el.classList.toggle('acabando', resta <= 20);
    }
    if (passouOTempo(sala, Date.now(), 4000 + (dados.eu % 4) * 1500) && tentouTempo !== sala.versao) {
      tentouTempo = sala.versao;
      void api.acabouOTempo(dados.codigo, sala.versao).catch(() => {});
    }
  }

  /** Ao abrir o jogo: volta para a sala em que a pessoa estava (se ainda existir). */
  async function retomar() {
    const salva = localStorage.getItem(CHAVE_SALA);
    if (!salva || e.online) return;
    try {
      await conectar(salva);
    } catch {
      /* sem internet: segue no início */
    }
  }

  return { entrar, sair, enviarVez, proximaRodada, comecar, mudarConfig, tirar, retomar, conectar, ativo: () => !!e.online };
}

export type Online$ = ReturnType<typeof criarOnline>;
export { LIMITE_PADRAO_SEG };
export type { Online };
