/**
 * Busca EXATA (completa) de jogadas — o "cérebro" do Difícil e da Dica.
 *
 * Pergunta: dá para baixar estas cartas da mão e, mexendo na mesa do jeito que for
 * (quantos jogos precisar), deixar TODAS as cartas da mesa em jogos válidos?
 * Em vez de tentar grupos de jogos "promissores", ela divide a mesa inteira em jogos
 * (como um quebra-cabeça de encaixe) e só diz "não dá" depois de testar todas as maneiras.
 *
 * Como fica rápida: sempre pega a primeira carta que sobrou e tenta cada jogo que a
 * contém; guarda os "becos sem saída" (restos de cartas que já se mostraram impossíveis)
 * para nunca repetir o mesmo caminho.
 */
import { NAIPES, type Carta } from '../motor/cartas';
import type { Regras } from '../motor/regras';
import { jogoValido, validarJogo } from '../motor/validacao';
import { contar, tipoDaCarta, type Contagem } from './combinacoes';

const POR_NAIPE = 13;
const CURINGA = NAIPES.length * POR_NAIPE; // índice do coringa na lista de contagens
const TOTAL = CURINGA + 1;

const indiceDoTipo = (tipo: string): number => {
  if (tipo === 'curinga') return CURINGA;
  const [v, naipe] = tipo.split('-');
  return NAIPES.indexOf(naipe as (typeof NAIPES)[number]) * POR_NAIPE + Number(v) - 1;
};
const tipoDoIndice = (i: number): string => (i === CURINGA ? 'curinga' : `${(i % POR_NAIPE) + 1}-${NAIPES[Math.floor(i / POR_NAIPE)]}`);

/** Um jogo, como lista de (índice do tipo, quantidade). */
type Jogo = Array<[number, number]>;

export interface Relogio {
  fim: number;
  acabou: boolean;
}

/** Pesos aleatórios fixos: a soma (peso × quantidade) identifica um jogo sem importar a ordem. */
const PESOS = Array.from({ length: TOTAL }, (_, i) => ((Math.imul(i + 1, 2654435761) >>> 3) % 1000003) * 1000033 + ((Math.imul(i + 7, 40503) >>> 2) % 99991));
function assinaturaDe(jogo: Jogo): number {
  let h = 0;
  for (const [i, n] of jogo) h += PESOS[i] * n;
  return h;
}

const chave = (qtd: Int8Array): string => {
  let s = '';
  for (let i = 0; i < TOTAL; i++) s += String.fromCharCode(48 + qtd[i]);
  return s;
};

/**
 * Todas as sequências do naipe indo da posição "s" até "e" (1..14, 14 = Ás alto).
 * Cada posição é uma carta normal OU um coringa — o coringa pode tapar até uma carta que existe
 * (ela então vai para outro jogo, como o 4♠ que vira trinca de 4 enquanto o coringa fica no lugar dele).
 * As pontas são sempre cartas normais; dois coringas não ficam lado a lado (regra da casa).
 */
function sequenciasEntre(qtd: Int8Array, naipe: number, s: number, e: number, regras: Regras, saida: Jogo[], posicaoNormal: number | null = null) {
  if (e - s + 1 < 3) return;
  const base = naipe * POR_NAIPE;
  const cartaEm = (w: number) => base + (w === 14 ? 1 : w) - 1;
  if (s === 1 && e === 14 && (!regras.permitirSequenciaAsAteAs || qtd[cartaEm(1)] < 2)) return;
  const curingas = regras.curinga.ativo ? qtd[CURINGA] : 0;
  const maxCuringas = Math.min(curingas, regras.curinga.maximoPorJogo ?? Infinity);
  const naturais: number[] = [];
  const rec = (w: number, usados: number, anteriorCuringa: boolean) => {
    if (w > e) {
      const jogo: Jogo = naturais.map((i) => [i, 1]);
      if (usados > 0) jogo.push([CURINGA, usados]);
      saida.push(jogo);
      return;
    }
    const i = cartaEm(w);
    const naPonta = w === s || w === e;
    // Carta normal (o Ás aparece duas vezes só na sequência A..A).
    if (qtd[i] > naturais.filter((x) => x === i).length) {
      naturais.push(i);
      rec(w + 1, usados, false);
      naturais.pop();
    }
    // Coringa.
    if (!naPonta && w !== posicaoNormal && usados < maxCuringas && (!anteriorCuringa || regras.curinga.permitirLadoALado)) rec(w + 1, usados + 1, true);
  };
  rec(s, 0, false);
}

/** Todos os jogos possíveis com as cartas de "qtd" (sem pressupor qual é a menor carta). */
export function todosOsJogos(qtd: Int8Array, regras: Regras): Jogo[] {
  const jogos: Jogo[] = [];
  for (let valor = 1; valor <= 13; valor++) {
    const max = NAIPES.map((_, n) => Math.min(2, qtd[n * POR_NAIPE + valor - 1]));
    if (max.filter((m) => m > 0).length < 3) continue;
    const q = [0, 0, 0, 0];
    const rec = (n: number) => {
      if (n === NAIPES.length) {
        const naipes = q.filter((x) => x > 0).length;
        const total = q[0] + q[1] + q[2] + q[3];
        if (naipes < 3 || (naipes === 4 && total < regras.trinca.minimoComQuatroNaipes)) return;
        const jogo: Jogo = [];
        for (let k = 0; k < NAIPES.length; k++) if (q[k] > 0) jogo.push([k * POR_NAIPE + valor - 1, q[k]]);
        jogos.push(jogo);
        return;
      }
      for (let x = 0; x <= max[n]; x++) {
        q[n] = x;
        rec(n + 1);
      }
      q[n] = 0;
    };
    rec(0);
  }
  for (let naipe = 0; naipe < NAIPES.length; naipe++) {
    for (let s = 1; s <= 12; s++) for (let e = s + 2; e <= 14; e++) sequenciasEntre(qtd, naipe, s, e, regras, jogos);
  }
  return jogos;
}

/** Todos os jogos que contêm a carta "t" (de qualquer posição) e só usam o que há em "qtd". */
function jogosComACarta(qtd: Int8Array, t: number, regras: Regras): Jogo[] {
  const naipe = Math.floor(t / POR_NAIPE);
  const valor = (t % POR_NAIPE) + 1;
  const jogos: Jogo[] = [];

  // --- Trincas: mesmo valor, ≥ 3 naipes, até 2 de cada naipe.
  const max = NAIPES.map((_, n) => Math.min(2, qtd[n * POR_NAIPE + valor - 1]));
  if (max[naipe] > 0 && max.filter((m) => m > 0).length >= 3) {
    const q = [0, 0, 0, 0];
    const rec = (n: number) => {
      if (n === NAIPES.length) {
        const naipes = q.filter((x) => x > 0).length;
        const total = q[0] + q[1] + q[2] + q[3];
        if (naipes < 3 || (naipes === 4 && total < regras.trinca.minimoComQuatroNaipes)) return;
        const jogo: Jogo = [];
        for (let k = 0; k < NAIPES.length; k++) if (q[k] > 0) jogo.push([k * POR_NAIPE + valor - 1, q[k]]);
        jogos.push(jogo);
        return;
      }
      for (let x = n === naipe ? 1 : 0; x <= max[n]; x++) {
        q[n] = x;
        rec(n + 1);
      }
      q[n] = 0;
    };
    rec(0);
  }

  // --- Sequências com "t" como carta normal (valor 1..14; o Ás vale 1 no começo ou 14 no fim).
  for (let s = 1; s <= valor; s++) for (let e = Math.max(valor, s + 2); e <= 14; e++) sequenciasEntre(qtd, naipe, s, e, regras, jogos, valor);
  if (valor === 1) for (let s = 2; s <= 12; s++) sequenciasEntre(qtd, naipe, s, 14, regras, jogos, 14);
  return jogos;
}

export interface SolucaoExata {
  /** Os jogos, como listas de tipos ("7-copas", "curinga"). */
  jogos: string[][];
}

/**
 * Divide TODAS as cartas de "qtd" em jogos válidos. "t0" (opcional) é o jogo que tem que
 * existir inteiro e fica fora da conta: é o jogo que recebe as cartas da mão.
 *
 * "custo": cada jogo que NÃO é igual a um jogo que já estava na mesa custa 1; só aceita
 * soluções com custo até "orcamento" (assim as primeiras soluções mexem pouco na mesa).
 */
export class Divisor {
  private becos = new Map<string, number>(); // resto → maior orçamento que já falhou
  constructor(
    private regras: Regras,
    private relogio: Relogio,
    private jogosDaMesa: Set<number>,
  ) {}

  /** Procura uma divisão com custo ≤ orçamento. Devolve null se não há (ou se o tempo acabou: veja relogio.acabou). */
  dividir(inicial: Contagem, orcamento: number): string[][] | null {
    const qtd = new Int8Array(TOTAL);
    for (const [tipo, n] of inicial) qtd[indiceDoTipo(tipo)] = n;
    const escolhidos: Jogo[] = [];
    let passos = 0;

    const rec = (restantes: number, gasto: number): boolean => {
      if (restantes === 0) return true;
      if ((++passos & 255) === 0 && performance.now() > this.relogio.fim) this.relogio.acabou = true;
      if (this.relogio.acabou) return false;

      const k = chave(qtd);
      const falhou = this.becos.get(k);
      if (falhou !== undefined && orcamento - gasto <= falhou) return false;

      // Escolhe a carta com MENOS jogos possíveis (se alguma não tem nenhum, já falhou — e cedo).
      let opcoes: Array<{ jogo: Jogo; ig: number; n: number }> | null = null;
      for (let i = 0; i < CURINGA; i++) {
        if (qtd[i] === 0) continue;
        const dela = jogosComACarta(qtd, i, this.regras)
          .map((jogo) => ({ jogo, ig: this.jogosDaMesa.has(assinaturaDe(jogo)) ? 0 : 1, n: jogo.reduce((a, [, x]) => a + x, 0) }))
          .filter((o) => gasto + o.ig <= orcamento);
        if (!opcoes || dela.length < opcoes.length) opcoes = dela;
        if (opcoes.length <= 1) break;
      }
      if (!opcoes) return false; // só sobraram coringas: não ficam sozinhos
      // Primeiro os jogos que já existiam na mesa (não mexem em nada), depois os maiores.
      opcoes.sort((a, b) => a.ig - b.ig || b.n - a.n);

      for (const { jogo, ig, n } of opcoes) {
        for (const [i, x] of jogo) qtd[i] -= x;
        escolhidos.push(jogo);
        if (rec(restantes - n, gasto + ig)) return true;
        escolhidos.pop();
        for (const [i, x] of jogo) qtd[i] += x;
        if (this.relogio.acabou) return false;
      }
      // Beco sem saída com este orçamento (guarda o maior orçamento que falhou).
      this.becos.set(k, Math.max(falhou ?? -1, orcamento - gasto));
      return false;
    };

    let total = 0;
    for (let i = 0; i < TOTAL; i++) total += qtd[i];
    const ok = rec(total, 0);
    return ok ? escolhidos.map((j) => j.flatMap(([i, x]) => Array<string>(x).fill(tipoDoIndice(i)))) : null;
  }
}

/**
 * Procura, para cada jeito de baixar cartas da mão (todas no mesmo jogo), como arrumar a mesa.
 * Guarda os "becos sem saída" entre uma pergunta e outra (valem para qualquer carta da mão).
 */
export class Buscador {
  private divisor: Divisor;
  private daMesa: Contagem;

  constructor(
    mesa: Carta[][],
    private regras: Regras,
    private relogio: Relogio,
  ) {
    this.daMesa = contar(mesa.flat());
    const jogosDaMesa = new Set<number>();
    for (const j of mesa) jogosDaMesa.add(assinaturaDe([...contar(j)].map(([t, n]) => [indiceDoTipo(t), n] as [number, number])));
    this.divisor = new Divisor(regras, relogio, jogosDaMesa);
  }

  /**
   * Tenta baixar "baixadas" mexendo em, no máximo, "orcamento" jogos além do jogo que as recebe.
   * Devolve os jogos (como tipos), o primeiro é o que recebe as cartas da mão; ou null.
   * Se o tempo acabar, "relogio.acabou" fica verdadeiro e o resultado null não é definitivo.
   */
  tentar(baixadas: Carta[], orcamento: number): string[][] | null {
    const dasBaixadas = contar(baixadas);
    const tudo: Contagem = new Map(this.daMesa);
    for (const [t, n] of dasBaixadas) tudo.set(t, (tudo.get(t) ?? 0) + n);

    // Jogos possíveis que contêm TODAS as cartas baixadas (ex.: 4♦ 4♠ + o 4♥ que vem da mão).
    const todas = new Int8Array(TOTAL);
    for (const [t, n] of tudo) todas[indiceDoTipo(t)] = n;
    const precisa = [...dasBaixadas].map(([t, n]) => [indiceDoTipo(t), n] as [number, number]);
    const candidatos = todosOsJogos(todas, this.regras)
      .filter((jogo) => precisa.every(([i, n]) => (jogo.find(([k]) => k === i)?.[1] ?? 0) >= n))
      .map((jogo) => jogo.flatMap(([i, x]) => Array<string>(x).fill(tipoDoIndice(i))))
      .sort((a, b) => a.length - b.length); // o que usa menos cartas da mesa primeiro (mexe menos)

    for (const jogo of candidatos) {
      if (this.relogio.acabou) return null;
      const resto: Contagem = new Map(tudo);
      for (const t of jogo) resto.set(t, resto.get(t)! - 1);
      const r = this.divisor.dividir(resto, orcamento);
      if (r) return [jogo, ...r];
    }
    return null;
  }
}

/** Atalho usado nos testes: confere que as cartas viraram mesmo jogos válidos. */
export function todosValidos(jogos: Carta[][], regras: Regras): boolean {
  return jogos.every((j) => jogoValido(j, regras) && validarJogo(j, regras).valido);
}

export { tipoDaCarta };
