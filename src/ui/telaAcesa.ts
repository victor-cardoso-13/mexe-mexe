/**
 * Tela acesa durante a partida: o jogo segura a tela ligada; depois de 30 s sem tocar, escurece a tela
 * (uma camada escura por cima) e "solta" a tela: daí o iPhone apaga no tempo do Bloqueio Automático dele.
 * Um toque na parte escura só clareia (não joga nada). Funciona com o jogo aberto pela Tela de Início
 * em iPhone/iPad atualizados; onde não existe, o aparelho segue o próprio tempo, como antes.
 */
export const ESPERA_PARA_ESMAECER_MS = 30_000;

interface Trava { release(): Promise<void> }

let ligada = false;
let trava: Trava | null = null;
let relogio: ReturnType<typeof setTimeout> | null = null;
let veu: HTMLElement | null = null;
let ocupado: () => boolean = () => false;

async function segurarTela() {
  if (trava || document.visibilityState !== 'visible') return;
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<Trava> } }).wakeLock;
    if (wl) trava = await wl.request('screen');
  } catch {
    trava = null; // não deu: o aparelho segue o próprio tempo
  }
}

function soltarTela() {
  const t = trava;
  trava = null;
  t?.release().catch(() => {});
}

function tirarVeu() {
  veu?.remove();
  veu = null;
}

function esmaecer() {
  relogio = null;
  if (!ligada) return;
  // Enquanto o computador joga, a tela não escurece (espera mais um pouco).
  if (ocupado()) return void (relogio = setTimeout(esmaecer, ESPERA_PARA_ESMAECER_MS));
  if (!veu) {
    veu = document.createElement('div');
    veu.className = 'veu-esmaecer';
    veu.setAttribute('aria-hidden', 'true');
    // O toque que clareia não pode virar jogada.
    const clarear = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
      acordar();
    };
    veu.addEventListener('pointerdown', clarear);
    veu.addEventListener('click', clarear);
    document.body.append(veu);
  }
  soltarTela();
}

/** Alguém tocou na tela (ou começou a sua vez): clareia e conta os 30 s de novo. */
export function acordar() {
  if (!ligada) return;
  tirarVeu();
  void segurarTela();
  if (relogio) clearTimeout(relogio);
  relogio = setTimeout(esmaecer, ESPERA_PARA_ESMAECER_MS);
}

/** Liga (na tela do jogo) ou desliga (fora dela). */
export function telaAcesa(ligar: boolean) {
  if (ligar === ligada) return;
  ligada = ligar;
  if (ligar) return acordar();
  if (relogio) clearTimeout(relogio);
  relogio = null;
  tirarVeu();
  soltarTela();
}

/** Começa a escutar os toques. `computadorJogando` evita escurecer no meio da jogada do computador. */
export function iniciarTelaAcesa(computadorJogando: () => boolean) {
  ocupado = computadorJogando;
  document.addEventListener('pointerdown', () => { if (!veu) acordar(); }, { capture: true, passive: true });
  // Ao voltar para o app, o iPhone já soltou a tela: segura de novo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      trava = null;
      acordar();
    }
  });
}
