/**
 * REGRAS DA CASA
 * ==============
 * Todas as "sutilezas" do Mexe-Mexe da família ficam aqui.
 * Para mudar uma regra, basta alterar o valor em REGRAS_PADRAO.
 * (Algumas delas também podem ser mudadas pela tela de Ajustes do jogo.)
 */

export type RegraFimDoMonte =
  /** Termina a partida; vence quem tiver MENOS PONTOS na mão. */
  | 'menosPontos'
  /** Termina a partida; vence quem tiver MENOS CARTAS na mão (empate: menos pontos). */
  | 'menosCartas';

export type NivelIA = 'facil' | 'medio' | 'dificil';

/** Como cada nível do computador joga. */
export interface ConfigNivel {
  /**
   * Em quantos jogos JÁ ESTÁVAM NA MESA ele pode mexer por vez
   * (encostar carta ou rearrumar). null = sem limite.
   * Jogos novos feitos só com cartas da mão não contam.
   */
  maximoDeJogosMexidos: number | null;
  /** Se, entre jogadas que baixam o mesmo número de cartas, ele escolhe a que deixa a melhor mão. */
  otimizar: boolean;
  /** Tempo máximo pensando, em milissegundos (para nunca travar o iPad). */
  tempoMaximoMs: number;
}

export interface Regras {
  /** Quantos baralhos de 52 cartas são misturados. */
  numeroDeBaralhos: number;
  /** Quantas cartas cada jogador recebe no início. */
  cartasPorJogador: number;
  /**
   * Quantas cartas DA MÃO podem ser baixadas numa mesma vez.
   * Regra da casa: 1 carta ou 3 cartas (nunca 2, nunca 4 ou mais).
   */
  cartasDaMaoPorVez: number[];
  /**
   * Quando baixa mais de 1 carta da mão (as 3), todas têm que ficar no MESMO jogo.
   * Regra da casa: sim (não pode, por exemplo, 1 num jogo e 2 em outro).
   */
  cartasDaMaoNoMesmoJogo: boolean;
  /**
   * As cartas baixadas juntas da mão (as 3) têm que formar um jogo SOZINHAS:
   * trinca (2-2-2) ou sequência (2-3-4). Ex.: 7♠ 8♠ 10♠ não vale, mesmo com o 9♠ na mesa.
   */
  cartasDaMaoFormamJogo: boolean;
  /** Quantos adversários (computador). Permitido de 1 a 3. */
  adversarios: number;
  /** Nível do computador. */
  nivelIA: NivelIA;

  /** Como joga cada nível do computador. */
  niveis: Record<NivelIA, ConfigNivel>;

  curinga: {
    /** Se a partida usa curinga. */
    ativo: boolean;
    /** Quantos curingas entram no monte. */
    quantidade: number;
    /** Quantos pontos vale um curinga que ficou na mão no fim. */
    pontos: number;
    /**
     * Máximo de curingas num mesmo jogo (null = sem limite).
     * Lembrete da regra da casa: o curinga SÓ entra em sequência
     * e NUNCA na ponta (2-🃏-4 pode; 🃏-3-4 e 2-3-🃏 não podem).
     */
    maximoPorJogo: number | null;
    /**
     * Se dois curingas podem ficar lado a lado.
     * Regra da casa: NÃO (2-🃏-4-🃏-6 pode; 2-3-🃏-🃏-6 não pode).
     */
    permitirLadoALado: boolean;
  };

  /**
   * Pontos de cada valor de carta (1 = Ás, 11 = J, 12 = Q, 13 = K).
   * Usado quando o monte acaba.
   */
  pontos: Record<number, number>;

  trinca: {
    /**
     * Com os 4 naipes, a trinca precisa ter pelo menos este número de cartas.
     * Regra da casa: 6 (8♥8♠8♦8♣ não vale; 8♥8♥8♠8♠8♦8♣ vale).
     */
    minimoComQuatroNaipes: number;
  };

  /** O que acontece quando alguém precisa comprar e o monte está vazio. */
  fimDoMonte: RegraFimDoMonte;

  /**
   * Permite a sequência "completa" com 14 cartas, de Ás a Ás
   * (A-2-3-...-K-A), usando um Ás baixo e outro alto.
   */
  permitirSequenciaAsAteAs: boolean;
}

export const REGRAS_PADRAO: Regras = {
  numeroDeBaralhos: 2,
  cartasPorJogador: 9,
  cartasDaMaoPorVez: [1, 3],
  cartasDaMaoNoMesmoJogo: true,
  cartasDaMaoFormamJogo: true,
  adversarios: 1,
  nivelIA: 'facil',

  niveis: {
    facil: { maximoDeJogosMexidos: 1, otimizar: false, tempoMaximoMs: 300 },
    medio: { maximoDeJogosMexidos: 3, otimizar: false, tempoMaximoMs: 800 },
    dificil: { maximoDeJogosMexidos: null, otimizar: true, tempoMaximoMs: 2000 },
  },

  curinga: {
    ativo: false,
    quantidade: 4,
    pontos: 20,
    maximoPorJogo: null,
    permitirLadoALado: false,
  },

  pontos: {
    1: 15, // Ás
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    11: 10, // J (valete)
    12: 10, // Q (dama)
    13: 10, // K (rei)
  },

  trinca: { minimoComQuatroNaipes: 6 },

  fimDoMonte: 'menosPontos',

  permitirSequenciaAsAteAs: false,
};

/** Cria uma cópia das regras padrão, trocando só o que for informado. */
export function criarRegras(mudancas: Partial<Regras> = {}): Regras {
  return {
    ...REGRAS_PADRAO,
    ...mudancas,
    curinga: { ...REGRAS_PADRAO.curinga, ...(mudancas.curinga ?? {}) },
    niveis: { ...REGRAS_PADRAO.niveis, ...(mudancas.niveis ?? {}) },
    pontos: { ...REGRAS_PADRAO.pontos, ...(mudancas.pontos ?? {}) },
    trinca: { ...REGRAS_PADRAO.trinca, ...(mudancas.trinca ?? {}) },
  };
}
