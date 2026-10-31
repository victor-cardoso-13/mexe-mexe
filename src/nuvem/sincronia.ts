/**
 * Mantém a partida e o retrospecto do aparelho e os da nuvem iguais.
 * - Ao entrar (ou ao voltar para a tela inicial): baixa da nuvem, junta com o do aparelho e envia o resultado.
 * - A cada mudança: espera 2 s sem mudanças e envia (para não gastar o limite grátis a cada carta).
 * - Sem internet: o jogo continua normal; envia quando a internet voltar.
 * O Firebase só é carregado aqui dentro, depois que o jogo já abriu.
 */
import { carregarGaveta, contaAtiva, limparSemConta, quandoSalvar, salvarGaveta, temProgresso, usarConta, type Gaveta } from '../ui/salvar';
import { daNuvem, iguais, mesclar, paraNuvem } from './mesclar';
import type { Usuario } from './conta';

type Conta = typeof import('./conta');

export type Situacao = 'verificando' | 'sem-conta' | 'salvo' | 'enviando' | 'sem-internet';

let conta: Conta | null = null;
let usuario: Usuario | null = null;
let situacao: Situacao = 'verificando';
let espera: ReturnType<typeof setTimeout> | null = null;
let pendente: Gaveta | null = null;
let avisar: () => void = () => {};

export const usuarioAtual = () => usuario;
export const situacaoAtual = () => situacao;

function mudar(s: Situacao) {
  situacao = s;
  avisar();
}

export async function carregarConta(): Promise<Conta> {
  return (conta ??= await import('./conta'));
}

/**
 * Liga a nuvem. "trocouDeConta" é chamado quando a gaveta do aparelho muda
 * (alguém entrou ou saiu); "mudouSituacao" quando muda o "salvo na nuvem / sem internet".
 */
export async function iniciarNuvem(eventos: { trocouDeConta: () => void; mudouSituacao: () => void }) {
  avisar = eventos.mudouSituacao;
  quandoSalvar(agendarEnvio);
  addEventListener('online', () => pendente && enviarAgora());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void enviarAgora();
  });
  try {
    const c = await carregarConta();
    c.observarConta(u => {
      usuario = u;
      if (trocarGaveta(u?.uid ?? null)) eventos.trocouDeConta();
      mudar(u ? 'salvo' : 'sem-conta');
    });
  } catch {
    mudar('sem-internet'); // não deu para carregar o Firebase (sem internet na primeira vez)
  }
}

/** Abre a gaveta da conta (se ainda não for a aberta). Devolve true se trocou. */
export function trocarGaveta(uid: string | null): boolean {
  if (uid === contaAtiva()) return false;
  if (espera) clearTimeout(espera);
  espera = null;
  pendente = null;
  usarConta(uid);
  return true;
}

function agendarEnvio(s: Gaveta) {
  if (!usuario) return;
  pendente = s;
  if (espera) clearTimeout(espera);
  espera = setTimeout(() => void enviarAgora(), 2000);
}

export async function enviarAgora() {
  if (espera) clearTimeout(espera);
  espera = null;
  const s = pendente, u = usuario;
  if (!s || !u || !conta) return;
  pendente = null;
  mudar('enviando');
  try {
    await conta.enviar(u.uid, paraNuvem(s));
    if (usuario?.uid === u.uid) mudar('salvo');
  } catch {
    pendente ??= s;
    mudar('sem-internet');
  }
}

/** Baixa da nuvem, junta com o do aparelho, guarda e envia o resultado. Devolve o progresso juntado. */
export async function sincronizar(local: Gaveta): Promise<Gaveta> {
  const u = usuario;
  if (!u || !conta) return local;
  try {
    const remoto = await conta.baixar(u.uid);
    if (usuario?.uid !== u.uid) return local; // trocou de conta no meio do caminho
    const junto = remoto ? mesclar(local, daNuvem(remoto)) : local;
    if (!remoto || !iguais(junto, daNuvem(remoto))) {
      mudar('enviando');
      await conta.enviar(u.uid, paraNuvem(junto));
    }
    salvarGaveta(junto, u.uid);
    pendente = null;
    mudar('salvo');
    return junto;
  } catch {
    mudar('sem-internet');
    return local;
  }
}

/** Há progresso feito sem conta neste aparelho? */
export const progressoSemConta = () => {
  const s = carregarGaveta(null);
  return temProgresso(s) ? s : null;
};

/** Leva o progresso feito sem conta para a conta aberta e apaga a gaveta "sem conta". */
export function levarProgressoSemConta(daConta: Gaveta): Gaveta {
  const semConta = carregarGaveta(null);
  const junto = mesclar(daConta, semConta);
  salvarGaveta(junto);
  limparSemConta();
  return junto;
}

export async function sairDaConta() {
  await enviarAgora();
  await (await carregarConta()).sair();
}
