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
import { cartaDoTipo, contar, tipoDaCarta, type Contagem } from './combinacoes';
import { dividirViavel, suportado, viavel } from './viavel';
import { Arrumador } from './arrumacao';

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
  /** Resto → dá para dividir (com qualquer orçamento)? Resposta do verificador rápido (viavel.ts). */
  private viaveis = new Map<string, boolean | undefined>();
  private usarViavel: boolean;
  /** Limite de passos da próxima divisão (o mesmo no Mac e no iPad); "parou" = passou do limite (resposta não definitiva). */
  passosMax = Infinity;
  parou = false;
  private passos = 0;
  constructor(
    private regras: Regras,
    private relogio: Relogio,
    private jogosDaMesa: Set<number>,
  ) {
    this.usarViavel = suportado(regras);
  }

  /** O resto "qtd" pode ser dividido em jogos, sem limite de orçamento? undefined = não sei (regra não coberta ou desistiu). */
  daParaDividir(qtd: Int8Array, limite?: number, altoPreferido?: number[]): boolean | undefined {
    if (!this.usarViavel) return undefined;
    const k = chave(qtd);
    if (this.viaveis.has(k)) return this.viaveis.get(k);
    const v = viavel(qtd, this.regras, limite, altoPreferido);
    this.viaveis.set(k, v);
    return v;
  }

  /** Procura uma divisão com custo ≤ orçamento. Devolve null se não há (ou se o tempo/limite acabou: veja relogio.acabou e parou). */
  dividir(inicial: Contagem, orcamento: number): string[][] | null {
    const qtd = new Int8Array(TOTAL);
    for (const [tipo, n] of inicial) qtd[indiceDoTipo(tipo)] = n;
    const escolhidos: Jogo[] = [];
    const interromper = () => this.relogio.acabou || this.parou;

    const rec = (restantes: number, gasto: number): boolean => {
      if (restantes === 0) return true;
      if ((++this.passos & 255) === 0 && performance.now() > this.relogio.fim) this.relogio.acabou = true;
      if (this.passos > this.passosMax) this.parou = true;
      if (interromper()) return false;

      const k = chave(qtd);
      const falhou = this.becos.get(k);
      if (falhou !== undefined && orcamento - gasto <= falhou) return false;

      // Escolhe a carta com MENOS jogos possíveis (se alguma não tem nenhum, já falhou — e cedo).
      let opcoes: Array<{ jogo: Jogo; ig: number; n: number }> | null = null;
      const dela = (i: number) =>
        jogosComACarta(qtd, i, this.regras)
          .map((jogo) => ({ jogo, ig: this.jogosDaMesa.has(assinaturaDe(jogo)) ? 0 : 1, n: jogo.reduce((a, [, x]) => a + x, 0) }))
          .filter((o) => gasto + o.ig <= orcamento);
      for (let i = 0; i < CURINGA; i++) {
        if (qtd[i] === 0) continue;
        const d = dela(i);
        if (!opcoes || d.length < opcoes.length) opcoes = d;
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
        if (interromper()) return false;
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

  /** Zera o contador de passos e o "parou" (antes de cada pergunta com limite). */
  limitar(passosMax: number) {
    this.passosMax = passosMax;
    this.passos = 0;
    this.parou = false;
  }
}

/** Limite de estados do verificador em cada pergunta do atalho guloso (abaixo): se passar, o jogo não é travado. */
const LIMITE_GULOSO = 50000;

/**
 * Procura, para cada jeito de baixar cartas da mão (todas no mesmo jogo), como arrumar a mesa.
 * Guarda os "becos sem saída" entre uma pergunta e outra (valem para qualquer carta da mão).
 */
export class Buscador {
  private divisor: Divisor;
  private daMesa: Contagem;
  private jogosDaMesa = new Set<number>();

  constructor(
    private mesa: Carta[][],
    private regras: Regras,
    private relogio: Relogio,
  ) {
    this.daMesa = contar(mesa.flat());
    for (const j of mesa) this.jogosDaMesa.add(assinaturaDe([...contar(j)].map(([t, n]) => [indiceDoTipo(t), n] as [number, number])));
    this.divisor = new Divisor(regras, relogio, this.jogosDaMesa);
  }

  /** Quantos jogos NOVOS (diferentes dos da mesa) a arrumação tem, sem contar o primeiro (o que recebe as cartas da mão). */
  custo(jogos: string[][]): number {
    let n = 0;
    for (let k = 1; k < jogos.length; k++) {
      const assinatura = assinaturaDe([...contar(jogos[k].map((t) => cartaDoTipo(t)))].map(([t, x]) => [indiceDoTipo(t), x] as [number, number]));
      if (!this.jogosDaMesa.has(assinatura)) n++;
    }
    return n;
  }

  /** A última pergunta passou do limite de passos (o null dela não é definitivo). */
  get parou(): boolean {
    return this.divisor.parou;
  }

  private contagemCom(baixadas: Carta[]): Int8Array {
    const todas = new Int8Array(TOTAL);
    for (const [t, n] of this.daMesa) todas[indiceDoTipo(t)] += n;
    for (const c of baixadas) todas[indiceDoTipo(tipoDaCarta(c))]++;
    return todas;
  }

  /**
   * Mesa + estas cartas da mão podem virar jogos (mexendo à vontade)? Resposta EXATA do verificador rápido.
   * false = nem rearrumando tudo dá (não adianta procurar); undefined = não sei (regra não coberta).
   */
  possivel(baixadas: Carta[]): boolean | undefined {
    return this.divisor.daParaDividir(this.contagemCom(baixadas), undefined, this.altoDaMesa());
  }

  /** Quantos Ases de cada naipe a mesa usa como Ás alto (Q-K-A): o verificador começa por essa combinação. */
  private altoDaMesa(): number[] {
    const alto = [0, 0, 0, 0];
    for (const j of this.mesa) {
      const normais = j.filter((c) => !c.curinga);
      if (normais.length === 0 || !normais.every((c) => !c.curinga && c.naipe === (normais[0] as { naipe: string }).naipe)) continue;
      const valores = normais.map((c) => (c.curinga ? 0 : c.valor));
      if (valores.includes(1) && (valores.includes(13) || valores.includes(12)) && !valores.includes(2)) alto[NAIPES.indexOf((normais[0] as { naipe: (typeof NAIPES)[number] }).naipe)]++;
    }
    return alto;
  }

  /**
   * Tenta baixar "baixadas" mexendo em, no máximo, "orcamento" jogos além do jogo que as recebe.
   * Devolve os jogos (como tipos), o primeiro é o que recebe as cartas da mão; ou null.
   * Se o tempo acabar ("relogio.acabou") ou passar de "passosMax" ("parou"), o null não é definitivo.
   */
  tentar(baixadas: Carta[], orcamento: number, passosMax = Infinity): string[][] | null {
    this.divisor.limitar(passosMax);
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
      if (this.relogio.acabou || this.divisor.parou) return null;
      const resto: Contagem = new Map(tudo);
      for (const t of jogo) resto.set(t, resto.get(t)! - 1);
      const r = this.divisor.dividir(resto, orcamento);
      if (r) return [jogo, ...r];
    }
    return null;
  }

  /** A arrumação exata (arrumacao.ts) vale para estas regras? */
  get cobreArrumacao(): boolean {
    return suportado(this.regras);
  }

  private arrumadores = new Map<string, Arrumador>();

  /**
   * A arrumação EXATA que mexe menos (arrumacao.ts) para UMA carta baixada: devolve os jogos (o primeiro recebe a
   * carta) e o custo no mesmo sentido de tentar() (jogos novos sem contar o que recebe a carta), se o custo for
   * ≤ custoMax; null se é maior; undefined se a regra não é coberta ou passou do limite ("não sei").
   * Perguntas seguidas para a mesma carta (custoMax 0, 1, 3, ...) continuam de onde a anterior parou.
   * "desempatar": entre as de menor custo, a que mexe em menos jogos da mesa.
   */
  arrumar(baixadas: Carta[], custoMax: number, desempatar = false): { jogos: string[][]; custo: number } | null | undefined {
    if (!this.cobreArrumacao || baixadas.length !== 1) return undefined;
    const mesaIdx = this.mesa.map((j) => j.map((c) => indiceDoTipo(tipoDaCarta(c))));
    const alvo = indiceDoTipo(tipoDaCarta(baixadas[0]));
    let arr = this.arrumadores.get(tipoDaCarta(baixadas[0]));
    if (!arr) {
      arr = new Arrumador(this.contagemCom(baixadas), this.regras, mesaIdx);
      this.arrumadores.set(tipoDaCarta(baixadas[0]), arr);
    }
    let a = arr.ate(Number.isFinite(custoMax) ? custoMax + 1 : 1000);
    if (a && desempatar) a = arr.desempatada() ?? a;
    if (!a) return a;
    // O jogo que recebe a carta: um que NÃO é igual a um jogo da mesa e que tem o tipo da carta (sempre existe).
    const livres = mesaIdx.map((j) => [...j].sort((x, y) => x - y).join(','));
    const daMesa = a.jogos.map((j) => {
      const k = livres.indexOf([...j].sort((x, y) => x - y).join(','));
      if (k < 0) return false;
      livres.splice(k, 1);
      return true;
    });
    const k = a.jogos.findIndex((j, i) => !daMesa[i] && j.includes(alvo));
    if (k < 0) return undefined; // não deveria acontecer
    const jogos = [a.jogos[k], ...a.jogos.filter((_, i) => i !== k)].map((j) => j.map(tipoDoIndice));
    return { jogos, custo: a.custo - 1 };
  }

  /**
   * ATALHO GULOSO para UMA carta que o verificador já garantiu que cabe (possivel() = true), quando a busca
   * "mexendo pouco" passou do limite: trava, um a um, os jogos da mesa MENOS ligados à carta, enquanto o
   * verificador continuar dizendo que dá. Sobra um pedacinho (jogos não travados + a carta), onde a busca
   * antiga acha a arrumação rápido. A resposta sempre existe (o verificador garantiu); pode mexer em um
   * jogo a mais do que o mínimo possível.
   */
  tentarGuloso(baixadas: Carta[]): string[][] | null {
    const todas = this.contagemCom(baixadas);
    // Distância de cada jogo até a carta, em "camadas": 0 = ligado à carta, 1 = ligado a um jogo da camada 0, ...
    // Trava primeiro os mais longe (e, na mesma camada, os menos ligados).
    const camada = this.mesa.map(() => Infinity);
    let fronteira = baixadas;
    for (let d = 0; fronteira.length > 0; d++) {
      const nova: Carta[] = [];
      this.mesa.forEach((cartas, i) => {
        if (camada[i] === Infinity && ligacaoDoJogo(cartas, fronteira) > 0) {
          camada[i] = d;
          nova.push(...cartas);
        }
      });
      fronteira = nova;
    }
    const ordem = this.mesa
      .map((cartas, i) => ({ i, camada: camada[i], nota: ligacaoDoJogo(cartas, baixadas) }))
      .sort((a, b) => b.camada - a.camada || a.nota - b.nota);
    const travados = new Set<number>();
    for (const { i } of ordem) {
      const idx = this.mesa[i].map((c) => indiceDoTipo(tipoDaCarta(c)));
      for (const k of idx) todas[k]--;
      if (viavel(todas, this.regras, LIMITE_GULOSO) === true) travados.add(i);
      else for (const k of idx) todas[k]++;
    }
    const soltos = this.mesa.filter((_, i) => !travados.has(i));
    const fixos = this.mesa.filter((_, i) => travados.has(i)).map((j) => j.map(tipoDaCarta));
    const pequeno = new Buscador(soltos, this.regras, this.relogio);
    for (const orcamento of [0, 1, 2, 3, 4, 6]) {
      const r = pequeno.tentar(baixadas, orcamento, 20000);
      if (r) return [...r, ...fixos];
      if (this.relogio.acabou) return null;
    }
    // Último recurso (não deveria precisar): a divisão que o próprio verificador montou.
    const div = dividirViavel(todas, this.regras);
    if (!div) return null;
    const jogos = div.map((j) => j.map(tipoDoIndice));
    const alvo = tipoDaCarta(baixadas[0]);
    const k = jogos.findIndex((j) => j.includes(alvo));
    if (k < 0 || baixadas.length !== 1) return null;
    return [jogos[k], ...jogos.filter((_, i) => i !== k), ...fixos];
  }
}

/** Quanto um jogo da mesa tem a ver com as cartas (mesmo valor, ou mesmo naipe perto; coringa conversa com tudo). */
function ligacaoDoJogo(jogo: Carta[], cartas: Carta[]): number {
  let nota = 0;
  for (const d of jogo) {
    if (d.curinga) {
      nota += 1;
      continue;
    }
    for (const c of cartas) {
      if (c.curinga) nota += 1;
      else if (c.valor === d.valor) nota += 2;
      else if (c.naipe === d.naipe) {
        const dist = Math.abs(c.valor - d.valor);
        if (Math.min(dist, 13 - dist) <= 2) nota += 2;
      }
    }
  }
  return nota;
}

/** Atalho usado nos testes: confere que as cartas viraram mesmo jogos válidos. */
export function todosValidos(jogos: Carta[][], regras: Regras): boolean {
  return jogos.every((j) => jogoValido(j, regras) && validarJogo(j, regras).valido);
}

export { tipoDaCarta };
