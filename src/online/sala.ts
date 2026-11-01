/**
 * Jogo online: conversa com o Firebase (salas). Só é carregado quando a pessoa abre o jogo online.
 *
 * Onde fica cada coisa:
 *   salas/{codigo}              → o que todos veem (mesa, monte, quantas cartas cada um tem, de quem é a vez)
 *   salas/{codigo}/maos/{uid}   → a mão de cada pessoa (só o dono lê)
 *   salas/{codigo}/reveladas/{uid} → a mão mostrada no fim da rodada
 *   salas/{codigo}/pendentes/{uid} → cartas que o jogo comprou por quem demorou (a pessoa pega ao voltar)
 */
import {
  collection, deleteDoc, doc, getDoc, onSnapshot, runTransaction, setDoc, writeBatch, type DocumentReference,
} from 'firebase/firestore';
import { banco, garantirUid } from '../nuvem/conta';
import type { Carta } from '../motor/cartas';
import {
  aoAcabarOTempo, aoRemover, distribuir, finalizarRodada, indiceDe, lerCartas, MAX_JOGADORES, novoCodigo, passouOTempo,
  salaInicial, todosRevelaram, type ConfigSala, type FimDeVez, type Sala,
} from './logica';

export { garantirUid };

const sala = (codigo: string) => doc(banco, 'salas', codigo) as DocumentReference<Sala>;
const mao = (codigo: string, uid: string) => doc(banco, 'salas', codigo, 'maos', uid);
const revelada = (codigo: string, uid: string) => doc(banco, 'salas', codigo, 'reveladas', uid);
const pendente = (codigo: string, uid: string) => doc(banco, 'salas', codigo, 'pendentes', uid);

export async function criarSala(nome: string, config: ConfigSala): Promise<string> {
  const uid = await garantirUid();
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = novoCodigo();
    if ((await getDoc(sala(codigo))).exists()) continue;
    await setDoc(sala(codigo), salaInicial({ uid, nome }, config, Date.now()));
    return codigo;
  }
  throw new Error('Não deu para criar a sala. Tente de novo.');
}

export type ResultadoEntrada = 'ok' | 'inexistente' | 'cheia' | 'comecou';

export async function entrarNaSala(codigo: string, nome: string): Promise<ResultadoEntrada> {
  const uid = await garantirUid();
  return runTransaction(banco, async (tx) => {
    const d = await tx.get(sala(codigo));
    if (!d.exists()) return 'inexistente';
    const s = d.data();
    if (indiceDe(s, uid) !== -1) return 'ok'; // já estava (voltou pelo link)
    if (s.fase !== 'espera') return 'comecou';
    if (s.uids.length >= MAX_JOGADORES) return 'cheia';
    tx.update(sala(codigo), {
      jogadores: [...s.jogadores, { uid, nome }],
      uids: [...s.uids, uid],
      cartas: [...s.cartas, 0],
      totais: [...s.totais, 0],
    });
    return 'ok';
  });
}

export function observarSala(codigo: string, fn: (s: Sala | null) => void, erro: () => void): () => void {
  return onSnapshot(sala(codigo), (d) => fn(d.exists() ? d.data() : null), erro);
}

export async function lerMinhaMao(codigo: string, uid: string): Promise<Carta[]> {
  const d = await getDoc(mao(codigo, uid));
  return d.exists() ? lerCartas(d.data().cartas as string) : [];
}

/** Quem demorou e teve cartas compradas pelo jogo: junta com a mão (uma vez só). */
export async function juntarPendentes(codigo: string, uid: string): Promise<boolean> {
  return runTransaction(banco, async (tx) => {
    const p = await tx.get(pendente(codigo, uid));
    if (!p.exists()) return false;
    const novas = lerCartas(p.data().cartas as string);
    if (!novas.length) return false;
    const m = await tx.get(mao(codigo, uid));
    const atual = m.exists() ? lerCartas(m.data().cartas as string) : [];
    tx.set(mao(codigo, uid), { cartas: JSON.stringify([...atual, ...novas]) });
    tx.set(pendente(codigo, uid), { cartas: '[]' });
    return true;
  });
}

export function observarPendentes(codigo: string, uid: string, fn: () => void): () => void {
  return onSnapshot(pendente(codigo, uid), (d) => d.exists() && lerCartas(d.data().cartas as string).length && fn(), () => {});
}

export function observarReveladas(codigo: string, rodada: () => number, fn: (r: Record<string, Carta[]>) => void): () => void {
  return onSnapshot(collection(banco, 'salas', codigo, 'reveladas'), (q) => {
    const r: Record<string, Carta[]> = {};
    q.forEach((d) => {
      if (d.data().rodada === rodada()) r[d.id] = lerCartas(d.data().cartas as string);
    });
    fn(r);
  }, () => {});
}

export async function comecarRodada(codigo: string): Promise<void> {
  const s = (await getDoc(sala(codigo))).data()!;
  const semente = Math.floor(Math.random() * 2 ** 31);
  const { patch, maos } = distribuir(s, semente, Date.now());
  const lote = writeBatch(banco);
  for (const [uid, cartas] of Object.entries(maos)) lote.set(mao(codigo, uid), { cartas: JSON.stringify(cartas) });
  lote.update(sala(codigo), patch as Record<string, unknown>);
  await lote.commit();
}

/** Termina a vez de quem joga: grava a mesa nova, a mão nova e passa a vez, tudo de uma vez. */
export async function terminarMinhaVez(
  codigo: string, uid: string, versaoBase: number, calcular: (s: Sala, eu: number) => FimDeVez,
): Promise<void> {
  await runTransaction(banco, async (tx) => {
    const d = await tx.get(sala(codigo));
    const s = d.data();
    if (!s || s.fase !== 'jogando' || s.versao !== versaoBase || s.jogadores[s.vez]?.uid !== uid) throw new Error('desatualizado');
    const eu = indiceDe(s, uid);
    const fim = calcular(s, eu);
    tx.update(sala(codigo), fim.patch as Record<string, unknown>);
    tx.set(mao(codigo, uid), { cartas: JSON.stringify(fim.minhaMao) });
  });
}

export async function revelarMao(codigo: string, uid: string, rodada: number, cartas: Carta[]): Promise<void> {
  await setDoc(revelada(codigo, uid), { rodada, cartas: JSON.stringify(cartas) });
}

/** Quando todos mostraram a mão, quem estiver na sala conta os pontos (só o primeiro consegue). */
export async function contarPontos(codigo: string, reveladas: Record<string, Carta[]>): Promise<void> {
  await runTransaction(banco, async (tx) => {
    const s = (await tx.get(sala(codigo))).data();
    if (!s || s.fase !== 'contando' || !todosRevelaram(s, reveladas)) return;
    tx.update(sala(codigo), finalizarRodada(s, reveladas) as Record<string, unknown>);
  });
}

/** Acabou o tempo de quem estava na vez: compra por ele e passa. Só o primeiro que tentar consegue. */
export async function acabouOTempo(codigo: string, versaoBase: number): Promise<void> {
  await runTransaction(banco, async (tx) => {
    const s = (await tx.get(sala(codigo))).data();
    if (!s || s.versao !== versaoBase || !passouOTempo(s, Date.now())) return;
    const r = aoAcabarOTempo(s, Date.now());
    let extra: Carta[] = [];
    if (r.carta) {
      const p = await tx.get(pendente(codigo, r.uid));
      extra = p.exists() ? lerCartas(p.data().cartas as string) : [];
    }
    tx.update(sala(codigo), r.patch as Record<string, unknown>);
    if (r.carta) tx.set(pendente(codigo, r.uid), { cartas: JSON.stringify([...extra, r.carta]) });
  });
}

export async function tirarJogador(codigo: string, idx: number): Promise<void> {
  await runTransaction(banco, async (tx) => {
    const s = (await tx.get(sala(codigo))).data();
    if (!s || s.jogadores[idx]?.removido) return;
    tx.update(sala(codigo), aoRemover(s, idx, Date.now()) as Record<string, unknown>);
  });
}

/** Sair da sala. Antes de começar, a vaga some; no meio do jogo, a pessoa sai da partida. */
export async function sairDaSala(codigo: string, uid: string): Promise<void> {
  await runTransaction(banco, async (tx) => {
    const s = (await tx.get(sala(codigo))).data();
    if (!s) return;
    const idx = indiceDe(s, uid);
    if (idx === -1) return;
    if (s.fase === 'espera') {
      const resto = s.jogadores.filter((_, i) => i !== idx);
      if (!resto.length) return void tx.delete(sala(codigo));
      tx.update(sala(codigo), {
        jogadores: resto,
        uids: s.uids.filter((u) => u !== uid),
        cartas: s.cartas.filter((_, i) => i !== idx),
        totais: s.totais.filter((_, i) => i !== idx),
        dono: s.dono === uid ? resto[0].uid : s.dono,
      });
      return;
    }
    tx.update(sala(codigo), aoRemover(s, idx, Date.now()) as Record<string, unknown>);
  });
}

export async function mudarConfig(codigo: string, config: ConfigSala): Promise<void> {
  await setDoc(sala(codigo), { config } as Partial<Sala>, { merge: true });
}

export async function apagarSala(codigo: string): Promise<void> {
  await deleteDoc(sala(codigo));
}
