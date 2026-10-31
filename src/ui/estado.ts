/**
 * Estado da TELA (o que está selecionado, a ordem da mão, avisos...).
 * O estado do JOGO em si fica em "partida" (motor de regras).
 */
import type { Foto, Jogo, Partida } from '../motor/partida';
import type { NivelIA } from '../motor/regras';

export type Ordenacao = 'naipe' | 'asBaixo' | 'asAlto' | 'manual';

export interface Aviso {
  texto: string;
  tipo: 'normal' | 'problema' | 'computador';
}

export interface Dica {
  texto: string;
  foto: Foto;
  /** Cartas da mão que a dica usa (ficam piscando). */
  cartas: string[];
}

export interface Ajustes {
  nivel: NivelIA;
  curinga: boolean;
  adversarios: number;
  quatroCores: boolean;
  velocidade: 'devagar' | 'normal';
}

export const AJUSTES_PADRAO: Ajustes = {
  nivel: 'facil',
  curinga: false,
  adversarios: 1,
  quatroCores: false,
  velocidade: 'devagar',
};

export interface Estado {
  tela: 'inicio' | 'jogo';
  janela: null | 'ajustes' | 'fim' | 'confirmarNova' | 'conta' | 'retrospecto' | 'mensagem';
  /** Para onde o botão "Voltar" das janelas de conta e retrospecto leva. */
  voltarPara: null | 'ajustes';
  partida: Partida | null;
  /** Identidade da partida (o retrospecto conta cada uma uma vez só). */
  partidaId: string;
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
  /** Onde o curinga da mão pode ficar nesta vez (botão "Deixar o curinga solto"). */
  lugarCuringa: Foto | null;
  /** Para qual vez o lugar do curinga já foi calculado. */
  lugarCuringaVez: string;
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
    partida: null,
    partidaId: '',
    selecionadas: [],
    ordenacao: 'naipe',
    ordemManual: [],
    novaCartaId: null,
    baixadasPeloComputador: [],
    menuOrdenar: false,
    lugarCuringa: null,
    lugarCuringaVez: '',
    aviso: null,
    dica: null,
    computadorJogando: false,
    mesaExibida: null,
    cartasExibidas: null,
    destaques: [],
    chegaram: [],
  };
}
