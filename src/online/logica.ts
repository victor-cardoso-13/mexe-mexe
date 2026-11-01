/**
 * Jogo online: regras de como a sala (no Firebase) vira uma partida na tela de cada um.
 * Aqui só tem lógica pura, sem Firebase (dá para testar sem internet).
 *
 * Ideia: o banco guarda o que TODOS podem ver (mesa, monte, quantas cartas cada um tem, de quem é a vez)
 * e, em separado, a mão de cada pessoa (só o dono lê). Na tela, "você" é sempre o jogador 0 da partida
 * local, e os outros vêm depois, na ordem da mesa, com cartas viradas (só a quantidade importa).
 */
import { criarRegras, type Regras } from '../motor/regras';
import { novaPartida, resultadoPorMonteVazio, type Jogo, type Partida, type Resultado } from '../motor/partida';
import { pontosDaMao, type Carta } from '../motor/cartas';
import { pontosDaRodada, type Campeonato } from '../motor/campeonato';

export const MAX_JOGADORES = 4;
export const MIN_JOGADORES = 2;
export const LIMITE_PADRAO_SEG = 180;

export interface JogadorSala {
  uid: string;
  nome: string;
  /** Saiu da sala ou foi tirado: não joga mais (a mão dele sai do jogo). */
  removido?: boolean;
}

export interface ConfigSala {
  curinga: boolean;
  modo: 'casual' | 'campeonato';
  /** Tempo de cada vez, em segundos. */
  limiteSeg: number;
}

export type FaseSala = 'espera' | 'jogando' | 'contando' | 'fim';

/** O que fica na "sala" do Firebase (tudo aqui é público para quem está na sala). */
export interface Sala {
  dono: string;
  fase: FaseSala;
  jogadores: JogadorSala[];
  /** Os uid de quem está na sala (as regras do Firebase usam esta lista). */
  uids: string[];
  config: ConfigSala;
  /** Número da rodada (1, 2, 3…). 0 enquanto não começou. */
  rodada: number;
  /** A mesa e o monte vão como texto (o Firebase não aceita listas dentro de listas). */
  mesa: string;
  monte: string;
  proximoId: number;
  /** Quantas cartas cada um tem na mão (mesma ordem de "jogadores"). */
  cartas: number[];
  /** Índice (em "jogadores") de quem joga agora. */
  vez: number;
  /** Quando começou a vez atual (milissegundos). */
  vezDesde: number;
  /** Sobe 1 a cada vez jogada: serve para ninguém jogar em cima de uma versão velha. */
  versao: number;
  motivoFim: 'bateu' | 'monteAcabou' | null;
  quemBateu: number | null;
  resultado: Resultado | null;
  /** Pontos somados no campeonato (mesma ordem de "jogadores"). */
  totais: number[];
  criadaEm: number;
}

export const ativos = (s: Sala): number[] => s.jogadores.flatMap((j, i) => (j.removido ? [] : [i]));

export function proximoAtivo(s: Sala, de: number): number {
  const lista = ativos(s);
  const pos = lista.indexOf(de);
  if (pos === -1) return lista.find((i) => i > de) ?? lista[0];
  return lista[(pos + 1) % lista.length];
}

export const indiceDe = (s: Sala, uid: string): number => s.jogadores.findIndex((j) => j.uid === uid && !j.removido);

/** Ordem na tela de quem é você: [você, o próximo da mesa, …] como índices de "jogadores". */
export function ordemLocal(s: Sala, eu: number): number[] {
  const lista = ativos(s);
  const pos = lista.indexOf(eu);
  return [...lista.slice(pos), ...lista.slice(0, pos)];
}

export function regrasDaSala(s: Sala): Regras {
  const base = criarRegras();
  return criarRegras({
    adversarios: Math.min(3, Math.max(1, ativos(s).length - 1)),
    curinga: { ...base.curinga, ativo: s.config.curinga },
  });
}

/** Carta virada para baixo que representa a mão escondida de um adversário. */
const oculta = (i: number, k: number): Carta => ({ id: `oculta-${i}-${k}`, curinga: false, naipe: 'copas', valor: 1 });

const lerJogos = (t: string): Jogo[] => (t ? (JSON.parse(t) as Jogo[]) : []);
export const lerCartas = (t: string): Carta[] => (t ? (JSON.parse(t) as Carta[]) : []);

export function salaInicial(dono: JogadorSala, config: ConfigSala, agora: number): Sala {
  return {
    dono: dono.uid,
    fase: 'espera',
    jogadores: [dono],
    uids: [dono.uid],
    config,
    rodada: 0,
    mesa: '[]',
    monte: '[]',
    proximoId: 1,
    cartas: [0],
    vez: 0,
    vezDesde: agora,
    versao: 0,
    motivoFim: null,
    quemBateu: null,
    resultado: null,
    totais: [0],
    criadaEm: agora,
  };
}

// ---------------------------------------------------------------------------
// Começar uma rodada
// ---------------------------------------------------------------------------

export interface Distribuicao {
  /** O que muda na sala. */
  patch: Partial<Sala>;
  /** A mão de cada pessoa (por uid) — vai para o documento privado de cada uma. */
  maos: Record<string, Carta[]>;
}

/** Embaralha e distribui. Quem começa vai alternando a cada rodada. */
export function distribuir(s: Sala, semente: number, agora: number): Distribuicao {
  const lista = ativos(s);
  const regras = regrasDaSala(s);
  const p = novaPartida(regras, semente);
  const maos: Record<string, Carta[]> = {};
  const cartas = s.jogadores.map(() => 0);
  lista.forEach((idx, k) => {
    maos[s.jogadores[idx].uid] = p.jogadores[k].mao;
    cartas[idx] = p.jogadores[k].mao.length;
  });
  const rodada = s.rodada + 1;
  return {
    maos,
    patch: {
      fase: 'jogando',
      rodada,
      mesa: '[]',
      monte: JSON.stringify(p.monte),
      proximoId: 1,
      cartas,
      vez: lista[(rodada - 1) % lista.length],
      vezDesde: agora,
      versao: s.versao + 1,
      motivoFim: null,
      quemBateu: null,
      resultado: null,
      totais: s.rodada === 0 || s.config.modo !== 'campeonato' ? s.jogadores.map(() => 0) : s.totais,
    },
  };
}

// ---------------------------------------------------------------------------
// A partida na tela de cada um
// ---------------------------------------------------------------------------

/** Partida para jogar: você é o jogador 0; só a SUA mão é de verdade. */
export function partidaLocal(s: Sala, eu: number, minhaMao: Carta[]): Partida {
  const ordem = ordemLocal(s, eu);
  const mesa = lerJogos(s.mesa);
  const base = novaPartida(regrasDaSala(s), 1);
  const jogadores = ordem.map((idx, k) => ({
    nome: s.jogadores[idx].nome,
    humano: k === 0,
    mao: k === 0 ? minhaMao : Array.from({ length: s.cartas[idx] }, (_, n) => oculta(idx, n)),
  }));
  return {
    ...base,
    jogadores,
    mesa,
    monte: lerCartas(s.monte),
    vez: Math.max(0, ordem.indexOf(s.vez)),
    proximoIdJogo: s.proximoId,
    inicioDaVez: { mao: minhaMao, mesa },
    historico: [],
    resultado: null,
  };
}

/** Partida do fim da rodada: as mãos são as reveladas e o resultado já vem calculado. */
export function partidaDoFim(s: Sala, eu: number, reveladas: Record<string, Carta[]>): Partida {
  const ordem = ordemLocal(s, eu);
  const base = partidaLocal(s, eu, reveladas[s.jogadores[eu].uid] ?? []);
  const rr = s.resultado!;
  return {
    ...base,
    jogadores: base.jogadores.map((j, k) => ({ ...j, mao: reveladas[s.jogadores[ordem[k]].uid] ?? [] })),
    vez: 0,
    resultado: {
      vencedor: rr.vencedor === null ? null : ordem.indexOf(rr.vencedor),
      motivo: rr.motivo,
      pontos: ordem.map((idx) => rr.pontos[idx]),
    },
  };
}

/** Campeonato como a tela espera (na ordem local: você primeiro). */
export function campeonatoLocal(s: Sala, eu: number): Campeonato | null {
  if (s.config.modo !== 'campeonato') return null;
  const ordem = ordemLocal(s, eu);
  return { alvo: 100, totais: ordem.map((i) => s.totais[i] ?? 0), rodada: s.rodada, contada: '' };
}

// ---------------------------------------------------------------------------
// Terminar a minha vez
// ---------------------------------------------------------------------------

export interface FimDeVez {
  patch: Partial<Sala>;
  minhaMao: Carta[];
}

/**
 * Depois de jogar (ou comprar), a partida local vira a próxima "versão" da sala.
 * Se a minha mão zerou, ou o monte acabou, a rodada entra em "contando": cada um mostra a sua mão.
 */
export function aoTerminarVez(s: Sala, eu: number, p: Partida, agora: number): FimDeVez {
  const ordem = ordemLocal(s, eu);
  const cartas = [...s.cartas];
  ordem.forEach((idx, k) => (cartas[idx] = p.jogadores[k].mao.length));
  const base: Partial<Sala> = {
    mesa: JSON.stringify(p.mesa),
    monte: JSON.stringify(p.monte),
    proximoId: p.proximoIdJogo,
    cartas,
    versao: s.versao + 1,
  };
  const minhaMao = p.jogadores[0].mao;
  if (p.resultado) {
    const bateu = p.resultado.motivo === 'bateu';
    return {
      minhaMao,
      patch: { ...base, fase: 'contando', motivoFim: p.resultado.motivo, quemBateu: bateu ? eu : null, vezDesde: agora },
    };
  }
  return { minhaMao, patch: { ...base, vez: proximoAtivo(s, eu), vezDesde: agora } };
}

// ---------------------------------------------------------------------------
// Fim da rodada: contar pontos
// ---------------------------------------------------------------------------

/** Todos mostraram a mão? */
export function todosRevelaram(s: Sala, reveladas: Record<string, Carta[]>): boolean {
  return ativos(s).every((i) => s.jogadores[i].uid in reveladas);
}

/** Calcula o resultado da rodada (índices em "jogadores") e soma o campeonato. */
export function finalizarRodada(s: Sala, reveladas: Record<string, Carta[]>): Partial<Sala> {
  const lista = ativos(s);
  const regras = regrasDaSala(s);
  const pontos = s.jogadores.map(() => 0);
  lista.forEach((i) => (pontos[i] = pontosDaMao(reveladas[s.jogadores[i].uid] ?? [], regras)));
  let resultado: Resultado;
  if (s.motivoFim === 'bateu' && s.quemBateu !== null) {
    resultado = { vencedor: s.quemBateu, motivo: 'bateu', pontos };
  } else {
    // monte acabou: vence quem tem menos pontos (regra da casa); desempate pelas regras
    const base = novaPartida(regras, 1);
    const p: Partida = {
      ...base,
      jogadores: lista.map((i) => ({ nome: s.jogadores[i].nome, humano: false, mao: reveladas[s.jogadores[i].uid] ?? [] })),
    };
    const r = resultadoPorMonteVazio(p);
    resultado = {
      vencedor: r.vencedor === null ? null : lista[r.vencedor],
      motivo: 'monteAcabou',
      pontos,
    };
  }
  const soma = pontosDaRodada(resultado);
  return {
    fase: 'fim',
    resultado,
    totais: s.config.modo === 'campeonato' ? s.totais.map((t, i) => t + (soma[i] ?? 0)) : s.totais,
    versao: s.versao + 1,
  };
}

// ---------------------------------------------------------------------------
// Tempo, saída e remoção
// ---------------------------------------------------------------------------

export function passouOTempo(s: Sala, agora: number, folgaMs = 5000): boolean {
  return s.fase === 'jogando' && agora - s.vezDesde > s.config.limiteSeg * 1000 + folgaMs;
}

/** Acabou o tempo de quem estava na vez: o jogo compra 1 carta para ele (se houver) e passa a vez. */
export function aoAcabarOTempo(s: Sala, agora: number): { patch: Partial<Sala>; uid: string; carta: Carta | null } {
  const monte = lerCartas(s.monte);
  const carta = monte.shift() ?? null;
  const cartas = [...s.cartas];
  if (carta) cartas[s.vez] += 1;
  return {
    uid: s.jogadores[s.vez].uid,
    carta,
    patch: { monte: JSON.stringify(monte), cartas, vez: proximoAtivo(s, s.vez), vezDesde: agora, versao: s.versao + 1 },
  };
}

/** Tira alguém do jogo (saiu ou sumiu). Se sobrar só uma pessoa, ela ganha. */
export function aoRemover(s: Sala, idx: number, agora: number): Partial<Sala> {
  const jogadores = s.jogadores.map((j, i) => (i === idx ? { ...j, removido: true } : j));
  const cartas = s.cartas.map((c, i) => (i === idx ? 0 : c));
  const depois: Sala = { ...s, jogadores, cartas };
  const patch: Partial<Sala> = { jogadores, cartas, versao: s.versao + 1 };
  if (s.fase === 'espera') return { ...patch, uids: s.uids.filter((u) => u !== s.jogadores[idx].uid), versao: s.versao };
  if (s.fase !== 'jogando' && s.fase !== 'contando') return patch;
  const resto = ativos(depois);
  if (resto.length < MIN_JOGADORES) {
    return {
      ...patch,
      fase: 'fim',
      resultado: { vencedor: resto[0] ?? null, motivo: 'bateu', pontos: s.jogadores.map(() => 0) },
    };
  }
  if (s.fase === 'jogando' && s.vez === idx) {
    return { ...patch, vez: proximoAtivo(depois, idx), vezDesde: agora };
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Código e link da sala
// ---------------------------------------------------------------------------

/** Letras fáceis de ler e de ditar (sem 0/O, 1/I/L). */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function novoCodigo(sorteio: () => number = Math.random): string {
  return Array.from({ length: 5 }, () => ALFABETO[Math.floor(sorteio() * ALFABETO.length)]).join('');
}

export const codigoValido = (t: string) => /^[A-Z2-9]{5}$/.test(t.trim().toUpperCase());

export function linkDaSala(codigo: string, base: string): string {
  return `${base.split('#')[0]}#sala=${codigo}`;
}

export function codigoDoLink(hash: string): string | null {
  const m = /sala=([A-Za-z0-9]{5})/.exec(hash);
  return m ? m[1].toUpperCase() : null;
}
