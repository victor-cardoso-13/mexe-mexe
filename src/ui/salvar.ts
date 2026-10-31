/**
 * Guarda a partida, o retrospecto e os ajustes no próprio aparelho (localStorage),
 * para poder fechar o jogo e continuar depois.
 *
 * Cada conta tem a sua "gaveta" separada no aparelho, e quem joga sem conta tem outra.
 * Assim, duas pessoas no mesmo celular nunca misturam partida nem retrospecto.
 * (Os ajustes valem para o aparelho, não para a conta.)
 */
import type { Partida } from '../motor/partida';
import type { NivelIA } from '../motor/regras';
import { AJUSTES_PADRAO, type Ajustes, type Ordenacao } from './estado';

const CHAVE_PARTIDA = 'mexe-mexe:partida:v1';
const CHAVE_RESULTADOS = 'mexe-mexe:resultados:v1';
const CHAVE_AJUSTES = 'mexe-mexe:ajustes:v1';
/** Última conta que entrou neste aparelho (só um "marcador", não é senha). */
const ULTIMA_CONTA = 'mexe-mexe:ultima-conta';

/** A partida em andamento (ou a última, já terminada, para "Ver a mesa"). */
export interface Salvo {
  /** Identidade da partida: o retrospecto conta cada partida uma vez só. */
  id?: string;
  partida: Partida;
  ordenacao: Ordenacao;
  ordemManual: string[];
  novaCartaId: string | null;
  baixadasPeloComputador?: string[];
}

/** Uma partida terminada, no retrospecto. */
export interface ResultadoGuardado {
  /** quando terminou */
  em: number;
  /** nível do computador no fim da partida */
  nivel: NivelIA;
  /** v = você ganhou, d = um computador ganhou, e = empate */
  r: 'v' | 'd' | 'e';
  motivo: 'bateu' | 'monteAcabou';
  adversarios: number;
}

/** Tudo o que é de uma pessoa: a partida e o retrospecto. */
export interface Gaveta {
  jogo: Salvo | null;
  /** quando a partida mudou pela última vez (para juntar com a nuvem) */
  jogoEm: number;
  /** partidas terminadas, pela identidade de cada uma */
  resultados: Record<string, ResultadoGuardado>;
}

export const gavetaVazia = (): Gaveta => ({ jogo: null, jogoEm: 0, resultados: {} });

/** De quem é a gaveta aberta agora (null = jogando sem conta). */
let dono: string | null = lerTexto(ULTIMA_CONTA);
let aoSalvar: ((g: Gaveta) => void) | null = null;

const chave = (base: string, uid: string | null) => (uid ? `${base}:conta:${uid}` : base);

function lerTexto(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function ler<T>(k: string): T | null {
  try {
    const txt = localStorage.getItem(k);
    return txt ? (JSON.parse(txt) as T) : null;
  } catch {
    return null;
  }
}

function gravar(k: string, valor: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(valor));
  } catch {
    // Sem espaço ou modo privado: o jogo continua, só não fica salvo.
  }
}

export const contaAtiva = () => dono;

/** Troca de gaveta (entrou, saiu ou trocou de conta). */
export function usarConta(uid: string | null) {
  dono = uid;
  try {
    if (uid) localStorage.setItem(ULTIMA_CONTA, uid);
    else localStorage.removeItem(ULTIMA_CONTA);
  } catch {
    /* ignora */
  }
}

/** Avisa a nuvem a cada salvamento (quem chama decide quando enviar). */
export function quandoSalvar(fn: ((g: Gaveta) => void) | null) {
  aoSalvar = fn;
}

export function carregarGaveta(uid: string | null = dono): Gaveta {
  const p = ler<Salvo & { em?: number }>(chave(CHAVE_PARTIDA, uid));
  const jogo = p ? { ...p } : null;
  delete jogo?.em;
  return { jogo, jogoEm: p?.em ?? 0, resultados: ler(chave(CHAVE_RESULTADOS, uid)) ?? {} };
}

export function salvarGaveta(g: Gaveta, uid: string | null = dono) {
  if (g.jogo) gravar(chave(CHAVE_PARTIDA, uid), { ...g.jogo, em: g.jogoEm });
  else localStorage.removeItem(chave(CHAVE_PARTIDA, uid));
  gravar(chave(CHAVE_RESULTADOS, uid), g.resultados);
  if (uid === dono) aoSalvar?.(g);
}

/** Apaga a gaveta de quem joga sem conta (depois de levar o progresso para uma conta). */
export function limparSemConta() {
  localStorage.removeItem(CHAVE_PARTIDA);
  localStorage.removeItem(CHAVE_RESULTADOS);
}

/** Há algo que valha a pena levar para uma conta? (partida em andamento ou retrospecto) */
export function temProgresso(g: Gaveta) {
  return (!!g.jogo && !g.jogo.partida.resultado) || Object.keys(g.resultados).length > 0;
}

export function salvarAjustes(a: Ajustes) {
  gravar(CHAVE_AJUSTES, a);
}

export function carregarAjustes(): Ajustes {
  return { ...AJUSTES_PADRAO, ...(ler<Partial<Ajustes>>(CHAVE_AJUSTES) ?? {}) };
}
