/**
 * Estado da TELA (o que está selecionado, a ordem da mão, avisos...).
 * O estado do JOGO em si fica em "partida" (motor de regras).
 */
import type { Foto, Jogo, Partida } from '../motor/partida';
import type { Passo } from '../ia';
import type { NivelIA } from '../motor/regras';
import type { Campeonato } from '../motor/campeonato';
import type { Carta } from '../motor/cartas';
import type { Sala } from '../online/logica';

export type Ordenacao = 'naipe' | 'asBaixo' | 'asAlto' | 'manual';

export interface Aviso {
  texto: string;
  tipo: 'normal' | 'problema' | 'computador';
  /** Versão curta (vez do computador): aparece na pílula dele, lá no topo. */
  curto?: string;
}

export interface Dica {
  texto: string;
  foto: Foto;
  /** Os passos da jogada, para mostrar a mesa se transformando ("Fazer"). */
  passos: Passo[];
  /** Cartas da mão que a dica usa (ficam piscando). */
  cartas: string[];
}

export interface Ajustes {
  nivel: NivelIA;
  curinga: boolean;
  adversarios: number;
  quatroCores: boolean;
  velocidade: 'devagar' | 'normal';
  /** Ver as animações da dica ("Fazer") e do adversário. Desligado: a mesa muda de uma vez. */
  animacoes: boolean;
  /** Visual: "idade" (melhor idade, padrão) ou "bonito". */
  visual: 'idade' | 'bonito';
  /** Já viu o tutorial (ele aparece sozinho só na primeira partida). */
  tutorialVisto: boolean;
  /** Casual (uma partida) ou campeonato até 100 pontos (vale na próxima partida). */
  modo: 'casual' | 'campeonato';
  /** Som de "sua vez". Começa DESLIGADO para todo mundo. */
  sons: boolean;
}

export const AJUSTES_PADRAO: Ajustes = {
  nivel: 'facil',
  curinga: false,
  adversarios: 1,
  quatroCores: false,
  velocidade: 'devagar',
  animacoes: true,
  visual: 'idade',
  tutorialVisto: false,
  modo: 'casual',
  sons: false,
};

/** Sala online em que a pessoa está (null = jogando sozinha contra o computador). */
export interface Online {
  codigo: string;
  uid: string;
  nome: string;
  sala: Sala | null;
  /** Posição de "você" na lista de jogadores da sala. */
  eu: number;
  /** Versão da sala com que a partida da tela foi montada. */
  versaoLocal: number;
  reveladas: Record<string, Carta[]>;
  /** Mensagem de erro/aviso da janela do jogo online. */
  erro: string;
}

export interface Estado {
  tela: 'inicio' | 'jogo' | 'sala';
  janela: null | 'menu' | 'ajustes' | 'fim' | 'confirmarNova' | 'confirmarSair' | 'comoJogar' | 'conta' | 'retrospecto' | 'mensagem' | 'tutorial' | 'online';
  /** Para onde o botão "Voltar" das janelas de conta e retrospecto leva. */
  voltarPara: null | 'ajustes';
  /** Passo do tutorial que está na tela (0 a 6). */
  tutorialPasso: number;
  partida: Partida | null;
  /** Identidade da partida (o retrospecto conta cada uma uma vez só). */
  partidaId: string;
  /** Campeonato em andamento (null = modo casual). */
  campeonato: Campeonato | null;
  online: Online | null;
  /** Cartas tocadas (escolhidas) pela jogadora. */
  selecionadas: string[];
  ordenacao: Ordenacao;
  /** Ordem escolhida à mão (quando a pessoa arrasta as cartas). */
  ordemManual: string[];
  /** Carta comprada na última compra (fica com o destaque "NOVA"). */
  novaCartaId: string | null;
  /** Cartas que o computador baixou da mão dele na última rodada (selo laranja "NOVA"). */
  baixadasPeloComputador: string[];
  menuOrdenar: boolean;
  /** Última vez de cada adversário (botão "O que ele fez?"), na ordem em que jogaram. passos null = comprou. */
  ultimasJogadas: { jogador: number; passos: Passo[] | null }[];
  /** Qual delas está aparecendo na faixa agora (null = nenhuma). */
  revendo: number | null;
  aviso: Aviso | null;
  dica: Dica | null;
  /** Enquanto o computador joga, a tela mostra a mesa passo a passo. */
  computadorJogando: boolean;
  mesaExibida: Jogo[] | null;
  /** Quantas cartas mostrar na mão de cada adversário durante a animação. */
  cartasExibidas: number[] | null;
  /** Jogos e cartas que acabaram de mudar (piscam). */
  destaques: string[];
  chegaram: string[];
}

export function estadoInicial(): Estado {
  return {
    tela: 'inicio',
    janela: null,
    voltarPara: null,
    tutorialPasso: 0,
    partida: null,
    partidaId: '',
    campeonato: null,
    online: null,
    selecionadas: [],
    ordenacao: 'naipe',
    ordemManual: [],
    novaCartaId: null,
    baixadasPeloComputador: [],
    menuOrdenar: false,
    aviso: null,
    dica: null,
    computadorJogando: false,
    mesaExibida: null,
    cartasExibidas: null,
    destaques: [],
    ultimasJogadas: [],
    revendo: null,
    chegaram: [],
  };
}
