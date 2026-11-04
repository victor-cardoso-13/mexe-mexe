/**
 * A ARRUMAÇÃO QUE MEXE MENOS — exata e rápida.
 *
 * Mesma ideia do verificador (viavel.ts): anda pelos valores do Ás ao Ás alto, guardando só as sequências
 * abertas de cada naipe e os coringas que sobram. A diferença: aqui cada jogo da mesa pode ser MANTIDO
 * INTEIRO (custa 0) e cada jogo novo custa 1. Procura com "orçamento" crescente (1, 2, 3, ...): a primeira
 * arrumação que cabe no orçamento é a que cria menos jogos novos.
 *
 * Custo = jogos que não são iguais a um jogo da mesa (contando o que recebe a carta da mão). Para uma carta
 * baixada, o custo mínimo é sempre ≥ 1; "custo − 1" é o mesmo número de jogos mexidos da busca antiga
 * (exata.ts), que não conta o jogo que recebe a carta.
 */
import { NAIPES, type Carta } from '../motor/cartas';
import type { Regras } from '../motor/regras';
import { validarJogo } from '../motor/validacao';

const POR_NAIPE = 13;
const CURINGA = 52;
const TOTAL = 53;
const B = 3;
const cod4 = (q: number[]) => q[0] + B * q[1] + B * B * q[2] + B * B * B * q[3];
const dig = (c: number, s: number) => Math.floor(c / B ** s) % B;

const codRun = (tam: number, ultCuringa: number, doAs: number) => tam * 4 + ultCuringa * 2 + doAs;
const tamDe = (r: number) => r >> 2;
const ultCuringaDe = (r: number) => (r >> 1) & 1;
const doAsDe = (r: number) => r & 1;
const podeFechar = (r: number) => tamDe(r) === 3 && ultCuringaDe(r) === 0;
/** Sequências da mesa mantidas inteiras entram no estado com código 16 + número dela. */
const MANTIDA = 16;

const DESISTIU = new Error('arrumacao: limite de estados');

/** Sequência da mesa: naipe, posições ini..fim (1..14) e o que tem em cada posição (1 = carta normal, 2 = coringa). */
interface SeqDaMesa {
  naipe: number;
  ini: number;
  fim: number;
  pos: Uint8Array;
  cartas: number[];
}

const cartaDoIdx = (i: number, k: number): Carta =>
  i === CURINGA ? { id: `c${k}`, curinga: true } : { id: `x${k}`, curinga: false, naipe: NAIPES[Math.floor(i / POR_NAIPE)], valor: (i % POR_NAIPE) + 1 };

/** Lê um jogo da mesa (índices de tipo) e diz se é trinca (valor + vetor por naipe) ou sequência (posições). */
function lerJogo(jogo: number[], regras: Regras): { trinca: { valor: number; vetor: number } } | { seq: SeqDaMesa } | null {
  const r = validarJogo(
    jogo.map((i, k) => cartaDoIdx(i, k)),
    regras,
  );
  if (!r.valido) return null;
  if (r.tipo === 'trinca') {
    const q = [0, 0, 0, 0];
    for (const i of jogo) q[Math.floor(i / POR_NAIPE)]++;
    if (q.some((x) => x > 2)) return null;
    return { trinca: { valor: (jogo[0] % POR_NAIPE) + 1, vetor: cod4(q) } };
  }
  const ordem = r.ordem;
  const k = ordem.findIndex((c) => !c.curinga && c.valor !== 1);
  if (k < 0) return null;
  const c0 = ordem[k];
  if (c0.curinga) return null;
  const ini = c0.valor - k;
  const fim = ini + ordem.length - 1;
  const naipe = NAIPES.indexOf(c0.naipe);
  const pos = new Uint8Array(16);
  ordem.forEach((c, i) => (pos[ini + i] = c.curinga ? 2 : 1));
  return { seq: { naipe, ini, fim, pos, cartas: jogo } };
}

export interface Arrumacao {
  /** Jogos que não são iguais a um jogo da mesa (inclui o que recebe a carta da mão). */
  custo: number;
  /** Os jogos, como listas de índices de tipo (naipe*13 + valor-1; 52 = coringa). */
  jogos: number[][];
}

/**
 * Divide TODAS as cartas de "qtd" em jogos válidos, mantendo inteiros o máximo de jogos de "mesa"
 * (cada jogo novo custa 1). Devolve a arrumação de MENOR custo, se for ≤ custoMax; null se não há
 * (nenhuma com custo ≤ custoMax); undefined se passou do limite de estados ("não sei").
 * "custoMin": começa a procurar desse custo (quem chama já sabe que menos não dá).
 * "desempatar": entre as de menor custo, devolve a que mexe em MENOS jogos da mesa (um pouco mais demorado).
 */
export function menorArrumacao(
  qtd: ArrayLike<number>,
  regras: Regras,
  mesa: number[][],
  custoMax: number,
  limite = 400000,
  custoMin = 1,
  desempatar = false,
): Arrumacao | null | undefined {
  const a = new Arrumador(qtd, regras, mesa, limite, custoMin);
  const r = a.ate(custoMax);
  return r && desempatar ? a.desempatada() ?? r : r;
}

/**
 * A mesma busca, mas "aos poucos": ate(1), depois ate(2), ... reaproveitam tudo o que já foi calculado.
 * Assim dá para perguntar, para várias cartas da mão, "alguma resolve com custo 1?" antes de gastar tempo com custos maiores.
 */
export class Arrumador {
  private prep: Preparado | null | 'vazio' | 'desistiu';
  /** Custos menores que este já se sabe que não dão. */
  private proximo: number;
  private achado: number | null = null;

  constructor(qtd: ArrayLike<number>, regras: Regras, mesa: number[][], limite = 400000, custoMin = 1) {
    this.prep = preparar(qtd, regras, mesa, limite);
    this.proximo = custoMin;
  }

  private protegido<T>(f: (p: Preparado) => T): T | undefined {
    if (this.prep === 'desistiu' || this.prep === null || this.prep === 'vazio') return undefined;
    try {
      return f(this.prep);
    } catch (e) {
      if (e !== DESISTIU) throw e;
      this.prep = 'desistiu';
      return undefined;
    }
  }

  /** A arrumação de menor custo, se for ≤ custoMax; null se é maior; undefined se desistiu ("não sei"). */
  ate(custoMax: number): Arrumacao | null | undefined {
    if (this.prep === null) return null;
    if (this.prep === 'vazio') return { custo: 0, jogos: [] };
    if (this.achado !== null) {
      const c = this.achado;
      // (tentar de novo deixa a memória e os Ases altos na combinação que deu certo; é instantâneo)
      return c <= custoMax ? this.protegido((p) => (p.tentar(c, SEM_LIMITE) ? { custo: c, jogos: p.montar(c, SEM_LIMITE) } : undefined)) : null;
    }
    return this.protegido((p) => {
      for (; this.proximo <= custoMax; this.proximo++) {
        if (p.tentar(this.proximo, SEM_LIMITE)) {
          this.achado = this.proximo;
          return { custo: this.proximo, jogos: p.montar(this.proximo, SEM_LIMITE) };
        }
      }
      return null;
    });
  }

  /** Depois de achar o menor custo: entre as de menor custo, a que mexe em MENOS jogos da mesa. */
  desempatada(): Arrumacao | undefined {
    const c = this.achado;
    if (c === null) return undefined;
    return this.protegido((p) => {
      for (let q = 0; q <= p.jogosDaMesa; q++) if (p.tentar(c, q)) return { custo: c, jogos: p.montar(c, q) };
      return undefined;
    });
  }
}

const SEM_LIMITE = 1000;

interface Preparado {
  tentar(orc: number, orcQ: number): boolean;
  montar(orc: number, orcQ: number): number[][];
  jogosDaMesa: number;
}

function preparar(qtd: ArrayLike<number>, regras: Regras, mesa: number[][], limite: number): Preparado | null | 'vazio' {
  const curingas = qtd[CURINGA];
  if (curingas > 0 && !regras.curinga.ativo) return null;
  let total = 0;
  for (let i = 0; i < TOTAL; i++) total += qtd[i];
  if (total === 0) return 'vazio';
  if (total < 3) return null;
  const ladoALado = regras.curinga.permitirLadoALado;
  const asAteAs = regras.permitirSequenciaAsAteAs;
  const minimo4 = regras.trinca.minimoComQuatroNaipes;

  // Jogos da mesa: trincas por valor (vetor → quantas iguais) e sequências que podem ser mantidas.
  const trincasDaMesa: Array<Map<number, number>> = Array.from({ length: 15 }, () => new Map());
  const seqs: SeqDaMesa[] = [];
  for (const j of mesa) {
    const l = lerJogo(j, regras);
    if (!l) continue;
    if ('trinca' in l) trincasDaMesa[l.trinca.valor].set(l.trinca.vetor, (trincasDaMesa[l.trinca.valor].get(l.trinca.vetor) ?? 0) + 1);
    else seqs.push(l.seq);
  }
  /** começam[p][naipe] = sequências da mesa que começam na posição p desse naipe. */
  const comecam: number[][][] = Array.from({ length: 16 }, () => [[], [], [], []]);
  seqs.forEach((q, id) => comecam[q.ini][q.naipe].push(id));

  // --- Trincas de um valor: custo mínimo (trincas que não são iguais às da mesa) de dividir o vetor.
  const trincasValidas: number[] = [];
  for (let c = 1; c < B ** 4; c++) {
    const q = [0, 1, 2, 3].map((s) => dig(c, s));
    const naipes = q.filter((x) => x > 0).length;
    if (naipes >= 3 && !(naipes === 4 && q[0] + q[1] + q[2] + q[3] < minimo4)) trincasValidas.push(c);
  }
  const totalTrincasDaMesa = trincasDaMesa.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  /** custo = trincas novas; quebra = trincas da mesa (deste valor) que não ficaram inteiras. */
  const custoTrinca = new Map<number, { custo: number; quebra: number; partes: number[] }>();
  const dividirTrincas = (valor: number, c: number): { custo: number; quebra: number; partes: number[] } => {
    if (c === 0) return { custo: 0, quebra: totalTrincasDaMesa[valor] ?? 0, partes: [] };
    const k = valor * 100 + c;
    const pronto = custoTrinca.get(k);
    if (pronto) return pronto;
    const disponiveis = new Map(trincasDaMesa[valor]);
    let melhor = { custo: Infinity, quebra: Infinity, partes: [] as number[] };
    const rec = (resto: number, partes: number[], custo: number, iguais: number) => {
      if (custo > melhor.custo) return;
      if (resto === 0) {
        const quebra = totalTrincasDaMesa[valor] - iguais;
        if (custo < melhor.custo || quebra < melhor.quebra) melhor = { custo, quebra, partes: [...partes] };
        return;
      }
      const s0 = [0, 1, 2, 3].find((s) => dig(resto, s) > 0)!;
      for (const t of trincasValidas) {
        if (dig(t, s0) === 0) continue;
        let cabe = true;
        for (let s = 0; s < 4 && cabe; s++) if (dig(t, s) > dig(resto, s)) cabe = false;
        if (!cabe) continue;
        const livre = disponiveis.get(t) ?? 0;
        if (livre > 0) disponiveis.set(t, livre - 1);
        partes.push(t);
        rec(resto - t, partes, custo + (livre > 0 ? 0 : 1), iguais + (livre > 0 ? 1 : 0));
        partes.pop();
        if (livre > 0) disponiveis.set(t, livre);
      }
    };
    rec(c, [], 0, 0);
    custoTrinca.set(k, melhor);
    return melhor;
  };

  // --- Corte rápido: carta sem vizinho possível (igual ao do verificador).
  const temPos = (s: number, w: number) => w >= 1 && w <= 14 && qtd[s * POR_NAIPE + (w === 14 ? 0 : w - 1)] > 0;
  for (let s = 0; s < 4; s++) {
    for (let v = 1; v <= 13; v++) {
      if (qtd[s * POR_NAIPE + v - 1] === 0) continue;
      let naipes = 0;
      for (let t = 0; t < 4; t++) if (qtd[t * POR_NAIPE + v - 1] > 0) naipes++;
      if (naipes >= 3) continue;
      const alcance = curingas === 0 ? 1 : ladoALado ? curingas + 1 : 2;
      let perto = false;
      for (const w of v === 1 ? [1, 14] : [v]) for (let d = 1; d <= alcance && !perto; d++) perto = temPos(s, w - d) || temPos(s, w + d);
      if (!perto) return null;
    }
  }

  const ases = [0, 1, 2, 3].map((s) => qtd[s * POR_NAIPE]);
  const maxAlto = [0, 1, 2, 3].map((s) => {
    const k = qtd[s * POR_NAIPE + 12];
    const q = qtd[s * POR_NAIPE + 11];
    return k + q === 0 && !ladoALado ? 0 : Math.min(ases[s], k + curingas);
  });
  const alto = [0, 0, 0, 0];
  const disponivel = (p: number, s: number) => (p === 1 ? ases[s] - alto[s] : p === 14 ? alto[s] : p > 14 ? 0 : qtd[s * POR_NAIPE + p - 1]);
  let estados = 0;

  interface Escolha {
    acoes: number[];
    mantidas: number[];
    novas: number;
    trinca: number;
  }

  /** Enumera as escolhas da posição p; cb recebe o próximo estado, coringas que sobram, escolhas e o custo desta posição. */
  const transicoes = (
    p: number,
    runs: number[][],
    j: number,
    orc: number,
    orcQ: number,
    cb: (prox: number[][], j: number, esc: Escolha[], delta: number, deltaQ: number) => boolean,
  ): boolean => {
    const prox: number[][] = [[], [], [], []];
    const esc: Escolha[] = [0, 1, 2, 3].map(() => ({ acoes: [], mantidas: [], novas: 0, trinca: 0 }));
    let vetor = 0;
    const porNaipe = (s: number, jl: number, delta: number, dq: number): boolean => {
      if (s === 4) {
        const t = p <= 13 ? dividirTrincas(p, vetor) : { custo: 0, quebra: 0 };
        if (delta + t.custo > orc || dq + t.quebra > orcQ) return false;
        return cb(
          prox.map((l) => [...l].sort((a, b) => a - b)),
          jl,
          esc,
          delta + t.custo,
          dq + t.quebra,
        );
      }
      prox[s].length = 0;
      esc[s].acoes.length = 0;
      esc[s].mantidas.length = 0;
      const lista = runs[s];
      let nn = disponivel(p, s);
      let jj = jl;
      const adiante = disponivel(p + 1, s);
      // 1) Sequências da mesa mantidas: cada uma gasta exatamente o que tem nesta posição (ou acabou antes).
      let novasAbertas = 0;
      for (const r of lista) {
        if (r < MANTIDA) {
          novasAbertas++;
          continue;
        }
        const q = seqs[r - MANTIDA];
        if (q.fim < p) continue;
        if (q.pos[p] === 1) {
          if (nn === 0) return false;
          nn--;
        } else {
          if (jj === 0) return false;
          jj--;
        }
        prox[s].push(r);
      }
      const daMesaAqui = p <= 14 ? comecam[p][s] : [];
      // 2) Sequências novas abertas: carta normal, coringa ou fechar.
      const porRun = (i: number, n1: number, j1: number, minAcao: number): boolean => {
        if (i === novasAbertas) return comecarMantidas(0, n1, j1, dq);
        const run = lista[i];
        const inicio = i > 0 && lista[i - 1] === run ? minAcao : 0;
        const tam = Math.min(3, tamDe(run) + 1);
        for (let a = inicio; a <= 2; a++) {
          if (a === 0) {
            if (n1 === 0) continue;
            if (p === 14 && doAsDe(run) && !asAteAs) continue;
            esc[s].acoes.push(0);
            prox[s].push(codRun(tam, 0, doAsDe(run)));
            if (porRun(i + 1, n1 - 1, j1, 0)) return true;
            prox[s].pop();
            esc[s].acoes.pop();
          } else if (a === 1) {
            if (j1 === 0 || p >= 14 || (ultCuringaDe(run) && !ladoALado)) continue;
            if (!ladoALado && adiante === 0) continue;
            esc[s].acoes.push(1);
            prox[s].push(codRun(tam, 1, doAsDe(run)));
            if (porRun(i + 1, n1, j1 - 1, 1)) return true;
            prox[s].pop();
            esc[s].acoes.pop();
          } else {
            if (!podeFechar(run)) continue;
            esc[s].acoes.push(2);
            if (porRun(i + 1, n1, j1, 2)) return true;
            esc[s].acoes.pop();
          }
        }
        return false;
      };
      // 3) Sequências da mesa que começam aqui: manter inteira (custo 0) ou não.
      const comecarMantidas = (k: number, n1: number, j1: number, q1: number): boolean => {
        if (k === daMesaAqui.length) return comecarNovas(n1, j1, q1);
        const id = daMesaAqui[k];
        if (n1 > 0) {
          esc[s].mantidas.push(id);
          prox[s].push(MANTIDA + id);
          if (comecarMantidas(k + 1, n1 - 1, j1, q1)) return true;
          prox[s].pop();
          esc[s].mantidas.pop();
        }
        // Não manter: essa sequência da mesa foi mexida (conta para o desempate).
        return q1 + 1 <= orcQ && comecarMantidas(k + 1, n1, j1, q1 + 1);
      };
      // 4) Sequências novas (custo 1 cada) e o resto vai para trinca.
      const comecarNovas = (n1: number, j1: number, q1: number): boolean => {
        const daParaComecar = p <= 12 && (adiante > 0 || (j1 > 0 && (ladoALado || disponivel(p + 2, s) > 0)));
        const maxNovas = daParaComecar ? Math.min(n1, orc - delta) : 0;
        const tamAntes = prox[s].length;
        for (let k = 0; k <= maxNovas; k++) {
          const resto = n1 - k;
          if (p === 14 && resto > 0) continue;
          if (resto > 2) continue;
          for (let x = 0; x < k; x++) prox[s].push(codRun(1, 0, p === 1 ? 1 : 0));
          // Quem não pode acabar aqui precisa de carta na próxima posição deste naipe.
          let precisaNormal = 0;
          let precisa = 0;
          for (const r of prox[s]) {
            if (r >= MANTIDA) {
              const q = seqs[r - MANTIDA];
              if (q.fim > p) {
                precisa++;
                if (q.pos[p + 1] === 1) precisaNormal++;
              }
            } else {
              if (ultCuringaDe(r) && !ladoALado) precisaNormal++;
              if (!podeFechar(r)) precisa++;
            }
          }
          let ok = precisaNormal <= adiante && precisa <= adiante + j1;
          if (ok) {
            esc[s].novas = k;
            esc[s].trinca = resto;
            vetor += resto * B ** s;
            ok = porNaipe(s + 1, j1, delta + k, q1);
            vetor -= resto * B ** s;
          }
          prox[s].length = tamAntes;
          if (ok) return true;
        }
        return false;
      };
      return porRun(0, nn, jj, 0);
    };
    return porNaipe(0, j, 0, 0);
  };

  /** Por estado: pares (orçamento de jogos novos, orçamento de jogos mexidos) que já se sabe que falham / dão certo. */
  type Memo = Map<string, { falhas: number[]; oks: number[] }>;
  const letras = (l: number[]) => String.fromCharCode(...l.map((r) => 64 + r));
  const chaveDe = (p: number, runs: number[][], j: number) => `${String.fromCharCode(64 + p, 48 + j)}${letras(runs[0])}/${letras(runs[1])}/${letras(runs[2])}/${letras(runs[3])}`;
  let memo: Memo = new Map();

  /** Dá para terminar a partir daqui com custo ≤ orc e mexendo em ≤ orcQ jogos da mesa? */
  const rec = (p: number, runs: number[][], j: number, orc: number, orcQ: number): boolean => {
    if (orc < 0 || orcQ < 0) return false;
    if (p === 15) return j === 0 && runs.every((l) => l.every((r) => r >= MANTIDA || podeFechar(r)));
    if (p === 14 && j > 0) return false;
    const k = chaveDe(p, runs, j);
    const m = memo.get(k);
    if (m) {
      for (let i = 0; i < m.falhas.length; i += 2) if (orc <= m.falhas[i] && orcQ <= m.falhas[i + 1]) return false;
      for (let i = 0; i < m.oks.length; i += 2) if (orc >= m.oks[i] && orcQ >= m.oks[i + 1]) return true;
    }
    if (++estados > limite) throw DESISTIU;
    const r = transicoes(p, runs, j, orc, orcQ, (prox, jl, _e, delta, dq) => rec(p + 1, prox, jl, orc - delta, orcQ - dq));
    const n = m ?? { falhas: [], oks: [] };
    (r ? n.oks : n.falhas).push(orc, orcQ);
    memo.set(k, n);
    return r;
  };

  // Combinações de Ases guardados para o Ás alto (cada uma com sua memória, que vale para todos os orçamentos).
  const combos: number[][] = [];
  const gerar = (s: number) => {
    if (s === 4) return void combos.push([...alto]);
    for (let a = 0; a <= maxAlto[s]; a++) {
      alto[s] = a;
      gerar(s + 1);
    }
    alto[s] = 0;
  };
  gerar(0);
  // Começa pela combinação que a mesa já usa (Ases altos das sequências da mesa): costuma ser a que dá certo.
  const daMesa = [0, 1, 2, 3].map((n) => Math.min(maxAlto[n], seqs.filter((q) => q.naipe === n && q.fim === 14).length));
  const distancia = (c: number[]) => c.reduce((a, x, n) => a + Math.abs(x - daMesa[n]), 0);
  combos.sort((a, b) => distancia(a) - distancia(b));
  const memorias: Memo[] = combos.map(() => new Map());
  const vazio = () => [[], [], [], []] as number[][];

  const tentar = (orc: number, orcQ: number): boolean => {
    for (let c = 0; c < combos.length; c++) {
      for (let s = 0; s < 4; s++) alto[s] = combos[c][s];
      memo = memorias[c];
      if (rec(1, vazio(), curingas, orc, orcQ)) return true;
    }
    return false;
  };
  return { tentar, montar, jogosDaMesa: mesa.length };

  /** Refaz o caminho que deu certo com o orçamento "orc" e monta os jogos. */
  function montar(orc: number, orcQ: number): number[][] {
    const jogos: number[][] = [];
    let abertas: Array<Array<{ cod: number; cartas: number[] }>> = [[], [], [], []];
    let j = curingas;
    let resta = orc;
    let restaQ = orcQ;
    // As sequências mantidas não precisam ser acompanhadas carta a carta: entram inteiras quando começam
    // (aqui só fica o código delas, para o estado ser o mesmo da busca).
    const mantidas: number[][] = [[], [], [], []];
    const mesclar = (runs: number[][]) => runs.map((l, s) => [...l, ...mantidas[s]].sort((a, b) => a - b));
    for (let p = 1; p <= 14; p++) {
      const runs = abertas.map((l) => l.map((r) => r.cod));
      let feito = false;
      transicoes(p, mesclar(runs), j, resta, restaQ, (prox, jl, esc, delta, dq) => {
        if (!rec(p + 1, prox, jl, resta - delta, restaQ - dq)) return false;
        const novas: typeof abertas = [[], [], [], []];
        const vetor = [0, 0, 0, 0];
        for (let s = 0; s < 4; s++) {
          const carta = s * POR_NAIPE + (p === 14 ? 0 : p - 1);
          esc[s].acoes.forEach((a, i) => {
            const r = abertas[s][i];
            const tam = Math.min(3, tamDe(r.cod) + 1);
            if (a === 2) jogos.push(r.cartas);
            else if (a === 0) novas[s].push({ cod: codRun(tam, 0, doAsDe(r.cod)), cartas: [...r.cartas, carta] });
            else novas[s].push({ cod: codRun(tam, 1, doAsDe(r.cod)), cartas: [...r.cartas, CURINGA] });
          });
          // Mantidas que já tinham acabado saem do estado (como na busca); as que começam aqui entram inteiras.
          mantidas[s] = mantidas[s].filter((r) => seqs[r - MANTIDA].fim >= p);
          for (const id of esc[s].mantidas) {
            jogos.push(seqs[id].cartas);
            mantidas[s].push(MANTIDA + id);
          }
          for (let k = 0; k < esc[s].novas; k++) novas[s].push({ cod: codRun(1, 0, p === 1 ? 1 : 0), cartas: [carta] });
          vetor[s] = esc[s].trinca;
          novas[s].sort((a, b) => a.cod - b.cod);
        }
        for (const t of dividirTrincas(p, cod4(vetor)).partes) {
          const jogo: number[] = [];
          for (let s = 0; s < 4; s++) for (let x = 0; x < dig(t, s); x++) jogo.push(s * POR_NAIPE + p - 1);
          jogos.push(jogo);
        }
        abertas = novas;
        j = jl;
        resta -= delta;
        restaQ -= dq;
        feito = true;
        return true;
      });
      if (!feito) throw new Error('arrumacao: caminho perdido');
    }
    for (const l of abertas) for (const r of l) jogos.push(r.cartas);
    return jogos;
  }
}
