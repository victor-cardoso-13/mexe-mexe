/**
 * Validação de jogos (sequências e trincas/quadras).
 *
 * Um "jogo" é só um grupo de cartas; a ORDEM em que as cartas foram
 * colocadas não importa — o motor descobre sozinho a ordem certa
 * para mostrar na tela (assim a vovó não precisa arrumar a fila).
 */
import type { Carta, CartaNormal, Naipe } from './cartas';
import type { Regras } from './regras';

export type ResultadoJogo =
  | { valido: true; tipo: 'sequencia' | 'trinca'; ordem: Carta[] }
  | { valido: false; motivo: string };

/** Mensagens amigáveis mostradas para a jogadora. */
export const MOTIVOS = {
  poucasCartas: 'Um jogo precisa de pelo menos 3 cartas.',
  curingaEmTrinca: 'O curinga não pode entrar em trinca, só no meio de uma sequência.',
  poucosNaipes: 'A trinca precisa ter pelo menos 3 naipes diferentes.',
  quartoNaipe: 'O 4º naipe só entra quando a trinca já tem 2 naipes repetidos (6 cartas ou mais).',
  naipesDiferentes: 'Na sequência, todas as cartas têm que ser do mesmo naipe.',
  cartaRepetida: 'Tem carta repetida nessa sequência.',
  curingaNaPonta: 'O curinga só pode ficar no meio da sequência, nunca na ponta.',
  foraDeSequencia: 'Essas cartas não estão em sequência.',
  curingasDemais: 'Tem curinga demais nesse jogo.',
  curingasJuntos: 'Dois curingas não podem ficar um do lado do outro.',
  curingaDesligado: 'Esta partida está sem curinga.',
} as const;

export function validarJogo(cartas: Carta[], regras: Regras): ResultadoJogo {
  if (cartas.length < 3) return { valido: false, motivo: MOTIVOS.poucasCartas };

  const naturais = cartas.filter((c): c is CartaNormal => !c.curinga);
  const curingas = cartas.filter((c) => c.curinga);

  if (curingas.length > 0 && !regras.curinga.ativo) {
    return { valido: false, motivo: MOTIVOS.curingaDesligado };
  }

  // Se todas as cartas normais têm o mesmo valor, é uma tentativa de trinca.
  const mesmoValor = naturais.length > 1 && naturais.every((c) => c.valor === naturais[0].valor);
  if (mesmoValor) return validarTrinca(naturais, curingas.length, regras);

  return validarSequencia(naturais, curingas, regras);
}

/**
 * Trinca (regra da casa):
 * - mesmo valor, sem curinga;
 * - pelo menos 3 naipes diferentes; pode repetir naipe (são 2 baralhos);
 * - o 4º naipe só entra com "regras.trinca.minimoComQuatroNaipes" cartas ou mais (6),
 *   ou seja, quando dá para dividir em duas trincas.
 *   Valem: 8♥8♠8♦ · 8♥8♥8♠8♦ · 8♥8♥8♠8♠8♦8♣ · todas as oito.
 *   Não valem: 8♥8♠8♦8♣ · 8♥8♥8♠8♦8♣ · 8♥8♥8♠8♠.
 */
function validarTrinca(naturais: CartaNormal[], qtdCuringas: number, regras: Regras): ResultadoJogo {
  if (qtdCuringas > 0) return { valido: false, motivo: MOTIVOS.curingaEmTrinca };
  const naipes = new Set(naturais.map((c) => c.naipe));
  if (naipes.size < 3) return { valido: false, motivo: MOTIVOS.poucosNaipes };
  if (naipes.size === 4 && naturais.length < regras.trinca.minimoComQuatroNaipes) {
    return { valido: false, motivo: MOTIVOS.quartoNaipe };
  }
  return { valido: true, tipo: 'trinca', ordem: ordemDaTrinca(naturais) };
}

/**
 * Ordem de mostrar a trinca: cores sempre alternadas (vermelha-preta-vermelha
 * ou preta-vermelha-preta) e cartas do mesmo naipe juntas.
 */
export function ordemDaTrinca(cartas: CartaNormal[]): CartaNormal[] {
  const presentes = (lista: Naipe[]) => lista.filter((n) => cartas.some((c) => c.naipe === n));
  const vermelhos = presentes(['copas', 'ouros']);
  const pretos = presentes(['espadas', 'paus']);
  // Começa pela cor que tem mais naipes, para alternar direitinho.
  const [primeira, segunda] = vermelhos.length >= pretos.length ? [vermelhos, pretos] : [pretos, vermelhos];
  const ordemNaipes: Naipe[] = [];
  for (let i = 0; i < primeira.length; i++) {
    ordemNaipes.push(primeira[i]);
    if (segunda[i]) ordemNaipes.push(segunda[i]);
  }
  return [...cartas].sort((a, b) => ordemNaipes.indexOf(a.naipe) - ordemNaipes.indexOf(b.naipe));
}

/**
 * Sequência: mesmo naipe, valores consecutivos.
 * - O Ás pode ser baixo (A-2-3) ou alto (Q-K-A), mas não dá a volta (K-A-2).
 * - O curinga ocupa um "buraco" NO MEIO da sequência; nunca fica na ponta.
 *
 * Truque usado: da menor à maior carta normal existem (maior - menor + 1)
 * posições. As que faltam são os "buracos". O jogo só vale se o número
 * de buracos for EXATAMENTE igual ao número de curingas. Como os curingas
 * só tapam buracos internos, eles nunca ficam na ponta.
 */
function validarSequencia(naturais: CartaNormal[], curingas: Carta[], regras: Regras): ResultadoJogo {
  const naipe = naturais[0]?.naipe;
  if (!naturais.every((c) => c.naipe === naipe)) {
    return { valido: false, motivo: MOTIVOS.naipesDiferentes };
  }

  const max = regras.curinga.maximoPorJogo;
  if (max !== null && curingas.length > max) {
    return { valido: false, motivo: MOTIVOS.curingasDemais };
  }

  // Sem pelo menos 2 cartas normais, os curingas ficariam na ponta.
  if (naturais.length < 2) return { valido: false, motivo: MOTIVOS.curingaNaPonta };

  // Cada maneira possível de contar os Ases (baixo = 1, alto = 14).
  const ases = naturais.filter((c) => c.valor === 1);
  const outras = naturais.filter((c) => c.valor !== 1);
  const opcoes: number[][] = [];
  if (ases.length === 0) opcoes.push([]);
  if (ases.length === 1) opcoes.push([1], [14]);
  if (ases.length === 2 && regras.permitirSequenciaAsAteAs) opcoes.push([1, 14]);
  if (opcoes.length === 0) return { valido: false, motivo: MOTIVOS.cartaRepetida };

  let motivo: string = MOTIVOS.foraDeSequencia;

  for (const valoresDosAses of opcoes) {
    // Lista de [valor usado, carta], já ordenada.
    const pares: Array<[number, CartaNormal]> = [
      ...valoresDosAses.map((v, i) => [v, ases[i]] as [number, CartaNormal]),
      ...outras.map((c) => [c.valor, c] as [number, CartaNormal]),
    ].sort((a, b) => a[0] - b[0]);

    const valores = pares.map((p) => p[0]);
    if (new Set(valores).size !== valores.length) {
      motivo = MOTIVOS.cartaRepetida;
      continue;
    }

    const menor = valores[0];
    const maior = valores[valores.length - 1];
    const buracos = maior - menor + 1 - valores.length;

    if (buracos === curingas.length) {
      // Monta a ordem final, colocando um curinga em cada buraco.
      const ordem: Carta[] = [];
      let k = 0;
      let cur = 0;
      for (let v = menor; v <= maior; v++) {
        if (pares[k] && pares[k][0] === v) ordem.push(pares[k++][1]);
        else ordem.push(curingas[cur++]);
      }
      const juntos = ordem.some((c, i) => i > 0 && c.curinga && ordem[i - 1].curinga);
      if (juntos && !regras.curinga.permitirLadoALado) {
        motivo = MOTIVOS.curingasJuntos;
        continue;
      }
      return { valido: true, tipo: 'sequencia', ordem };
    }

    // Sobrou curinga: ele teria que ir para a ponta.
    if (buracos < curingas.length) motivo = MOTIVOS.curingaNaPonta;
  }

  return { valido: false, motivo };
}

/** Atalho: o jogo é válido? */
export function jogoValido(cartas: Carta[], regras: Regras): boolean {
  return validarJogo(cartas, regras).valido;
}

/** Ordem para mostrar na tela: a ordem certa se for válido; senão, como está. */
export function ordemParaMostrar(cartas: Carta[], regras: Regras): Carta[] {
  const r = validarJogo(cartas, regras);
  return r.valido ? r.ordem : cartas;
}
