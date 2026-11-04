/**
 * "DÁ OU NÃO DÁ?" — resposta rápida e EXATA para: estas cartas podem ser divididas TODAS em jogos válidos?
 *
 * Em vez de testar jogo por jogo (como o Divisor de exata.ts), anda pelos valores, do Ás ao Ás alto
 * (posições 1..14), como quem lê a mesa da esquerda para a direita. Em cada posição só importa:
 *   - quais sequências estão "abertas" em cada naipe (tamanho 1, 2 ou 3+, e se a última foi coringa);
 *   - quantos coringas ainda sobram.
 * As cartas daquela posição continuam uma sequência aberta, começam uma nova ou vão para trincas
 * (as trincas de um valor são resolvidas por uma tabelinha pronta). Esse "estado" é pequeno, então
 * a memória (estado → já sei que dá/não dá) corta quase tudo.
 *
 * Diferente da tentativa antiga "pegar a carta de menor valor" (que guardava o resto inteiro das cartas
 * e explodia com coringas): aqui a memória guarda só o estado comprimido da coluna.
 *
 * Regras cobertas: trinca (≥ 3 naipes; com os 4 naipes, mínimo configurável; sem coringa), sequência
 * (mesmo naipe, Ás baixo ou alto, A..A só se permitido, coringa nunca na ponta, coringas lado a lado
 * só se permitido, coringa pode tapar carta que existe). Sem limite de coringas por jogo e até 2
 * baralhos (veja suportado()); fora disso a busca antiga continua valendo.
 */
import type { Regras } from '../motor/regras';

const POR_NAIPE = 13;
const CURINGA = 52;
const TOTAL = 53;

/** Este verificador vale para estas regras? (O jogo só deixa mudar "com coringa"; o resto é sempre o padrão.) */
export function suportado(regras: Regras): boolean {
  return regras.curinga.maximoPorJogo === null && regras.numeroDeBaralhos <= 2;
}

// ---------------------------------------------------------------------------------------------
// Trincas de um valor: vetor de quantidades por naipe (0..2 cada) → dá para dividir em trincas?
// ---------------------------------------------------------------------------------------------
const B = 3; // base do código do vetor (0, 1 ou 2 cartas por naipe)
const cod4 = (q: number[]) => q[0] + B * q[1] + B * B * q[2] + B * B * B * q[3];
const dig = (c: number, s: number) => Math.floor(c / B ** s) % B;

interface TabelaTrincas {
  ok: Uint8Array;
  /** Uma trinca que serve (código do vetor) para tirar primeiro, para montar a resposta. */
  primeira: Int16Array;
}
const tabelas = new Map<number, TabelaTrincas>();

function tabelaDeTrincas(minimoComQuatro: number): TabelaTrincas {
  const pronta = tabelas.get(minimoComQuatro);
  if (pronta) return pronta;
  const N = B ** 4;
  const trincas: number[][] = [];
  for (let c = 1; c < N; c++) {
    const q = [0, 1, 2, 3].map((s) => dig(c, s));
    const naipes = q.filter((x) => x > 0).length;
    const total = q[0] + q[1] + q[2] + q[3];
    if (naipes >= 3 && !(naipes === 4 && total < minimoComQuatro)) trincas.push(q);
  }
  const ok = new Uint8Array(N);
  const primeira = new Int16Array(N).fill(-1);
  const estado = new Int8Array(N); // 0 = não calculado, 1 = sim, 2 = não
  const calc = (c: number): boolean => {
    if (c === 0) return true;
    if (estado[c]) return estado[c] === 1;
    const r = [0, 1, 2, 3].map((s) => dig(c, s));
    const s0 = r.findIndex((x) => x > 0);
    let sim = false;
    for (const t of trincas) {
      if (t[s0] === 0 || t.some((x, s) => x > r[s])) continue;
      if (calc(c - cod4(t))) {
        sim = true;
        primeira[c] = cod4(t);
        break;
      }
    }
    estado[c] = sim ? 1 : 2;
    return sim;
  };
  for (let c = 0; c < N; c++) ok[c] = calc(c) ? 1 : 0;
  const t = { ok, primeira };
  tabelas.set(minimoComQuatro, t);
  return t;
}

// ---------------------------------------------------------------------------------------------
// Sequências abertas: código pequeno = tamanho (1, 2, 3 = "3 ou mais") · última foi coringa · começou no Ás baixo
// ---------------------------------------------------------------------------------------------
const codRun = (tam: number, ultCuringa: number, doAs: number) => tam * 4 + ultCuringa * 2 + doAs;
const tamDe = (r: number) => r >> 2;
const ultCuringaDe = (r: number) => (r >> 1) & 1;
const doAsDe = (r: number) => r & 1;
const podeFechar = (r: number) => tamDe(r) === 3 && ultCuringaDe(r) === 0;

/** Ação de uma sequência aberta numa posição: 0 = carta normal, 1 = coringa, 2 = fechar (acabou antes). */
type Acao = 0 | 1 | 2;

interface Escolha {
  acoes: Acao[];
  novas: number;
  trinca: number;
}

/** Um jogo da resposta, como lista de índices de tipo (0..51 cartas, 52 = coringa). */
export type JogoIdx = number[];

const DESISTIU = new Error('viavel: limite de estados');

/** Limite padrão de estados (o pior caso medido em 441 mesas usou ~100 mil; cada estado custa ~1 µs no Mac). */
export const LIMITE_DE_ESTADOS = 400000;

/**
 * Divide as cartas de "qtd" (quantidade por índice de tipo: naipe*13 + valor-1; 52 = coringa) em jogos válidos.
 * Devolve os jogos ou null se não dá. Com "soPergunta", só responde se dá (devolve [] em vez dos jogos).
 * Se passar de "limite" estados, desiste e devolve undefined ("não sei").
 */
export function dividirViavel(
  qtd: ArrayLike<number>,
  regras: Regras,
  soPergunta = false,
  limite = LIMITE_DE_ESTADOS,
  altoPreferido?: number[],
): JogoIdx[] | null | undefined {
  try {
    return dividirSemLimite(qtd, regras, soPergunta, limite, altoPreferido);
  } catch (e) {
    if (e === DESISTIU) return undefined;
    throw e;
  }
}

function dividirSemLimite(qtd: ArrayLike<number>, regras: Regras, soPergunta: boolean, limite: number, altoPreferido?: number[]): JogoIdx[] | null {
  let estados = 0;
  const curingas = qtd[CURINGA];
  if (curingas > 0 && !regras.curinga.ativo) return null;
  let total = 0;
  for (let i = 0; i < TOTAL; i++) total += qtd[i];
  if (total === 0) return [];
  if (total < 3) return null;
  const tab = tabelaDeTrincas(regras.trinca.minimoComQuatroNaipes);
  const ladoALado = regras.curinga.permitirLadoALado;
  const asAteAs = regras.permitirSequenciaAsAteAs;

  // Corte rápido: carta que não cabe em NENHUM jogo (sem trinca possível e sem carta do naipe perto o bastante
  // para uma sequência: vizinha, ou a 2 posições com um coringa no meio) → não dá.
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

  // Quantos Ases de cada naipe ficam guardados para o fim (Ás alto, posição 14).
  const ases = [0, 1, 2, 3].map((s) => qtd[s * POR_NAIPE]);
  const maxAlto = [0, 1, 2, 3].map((s) => {
    const k = qtd[s * POR_NAIPE + 12];
    const q = qtd[s * POR_NAIPE + 11];
    return k + q === 0 && !ladoALado ? 0 : Math.min(ases[s], k + curingas);
  });
  const alto = [0, 0, 0, 0];

  let memo = new Map<string, boolean>();
  const disponivel = (p: number, s: number) => (p === 1 ? ases[s] - alto[s] : p === 14 ? alto[s] : p > 14 ? 0 : qtd[s * POR_NAIPE + p - 1]);
  const letras = (l: number[]) => String.fromCharCode(...l.map((r) => 64 + r));
  const chaveDe = (p: number, runs: number[][], j: number) => `${String.fromCharCode(64 + p, 48 + j)}${letras(runs[0])}/${letras(runs[1])}/${letras(runs[2])}/${letras(runs[3])}`;

  /**
   * Enumera as escolhas da posição p (para cada naipe: o que cada sequência aberta faz, quantas começam,
   * quantas cartas vão para trinca). Chama "cb" com o próximo estado; para quando cb devolve true.
   */
  const transicoes = (p: number, runs: number[][], j: number, cb: (prox: number[][], j: number, escolhas: Escolha[]) => boolean): boolean => {
    const prox: number[][] = [[], [], [], []];
    const escolhas: Escolha[] = [0, 1, 2, 3].map(() => ({ acoes: [], novas: 0, trinca: 0 }));
    let trinca = 0;
    const porNaipe = (s: number, jl: number): boolean => {
      if (s === 4) {
        if (!tab.ok[trinca]) return false;
        return cb(prox.map((l) => [...l].sort((a, b) => a - b)), jl, escolhas);
      }
      const lista = runs[s];
      const n = disponivel(p, s);
      const adiante = disponivel(p + 1, s);
      const acoes = escolhas[s].acoes;
      prox[s].length = 0;
      const base = 0;
      const porRun = (i: number, nn: number, jj: number, minAcao: number): boolean => {
        if (i === lista.length) {
          // Novas sequências (só se ainda cabem 3 posições) e o resto vai para trinca.
          // (uma sequência nova precisa de carta normal logo adiante, ou de coringa + carta normal duas adiante)
          const daParaComecar = p <= 12 && (adiante > 0 || (jj > 0 && (ladoALado || disponivel(p + 2, s) > 0)));
          const maxNovas = daParaComecar ? nn : 0;
          for (let k = maxNovas; k >= 0; k--) {
            const resto = nn - k;
            if (p === 14 && resto > 0) continue; // Ás guardado para o fim só fecha sequência
            if (resto > 2) continue;
            for (let x = 0; x < k; x++) prox[s].push(codRun(1, 0, p === 1 ? 1 : 0));
            escolhas[s].novas = k;
            escolhas[s].trinca = resto;
            trinca += resto * B ** s;
            // Sequências que não podem acabar aqui precisam de carta na próxima posição deste naipe.
            let precisaNormal = 0;
            let precisa = 0;
            for (const r of prox[s]) {
              if (ultCuringaDe(r)) precisaNormal++;
              if (!podeFechar(r)) precisa++;
            }
            const r = (ladoALado || precisaNormal <= adiante) && precisa <= adiante + jj && porNaipe(s + 1, jj);
            trinca -= resto * B ** s;
            prox[s].length = base + lista.length - acoes.filter((a) => a === 2).length;
            if (r) return true;
          }
          return false;
        }
        const run = lista[i];
        // Sequências iguais: escolhe as ações em ordem (não testa a mesma coisa trocada).
        const inicio = i > 0 && lista[i - 1] === run ? minAcao : 0;
        for (let a = inicio as Acao; a <= 2; a++) {
          const tam = Math.min(3, tamDe(run) + 1);
          if (a === 0) {
            if (nn === 0) continue;
            if (p === 14 && doAsDe(run) && !asAteAs) continue;
            acoes.push(0);
            prox[s].push(codRun(tam, 0, doAsDe(run)));
            if (porRun(i + 1, nn - 1, jj, 0)) return true;
            prox[s].pop();
            acoes.pop();
          } else if (a === 1) {
            if (jj === 0 || p >= 14 || (ultCuringaDe(run) && !ladoALado)) continue;
            if (!ladoALado && adiante === 0) continue; // depois do coringa tem que vir carta normal
            acoes.push(1);
            prox[s].push(codRun(tam, 1, doAsDe(run)));
            if (porRun(i + 1, nn, jj - 1, 1)) return true;
            prox[s].pop();
            acoes.pop();
          } else {
            if (!podeFechar(run)) continue;
            acoes.push(2);
            if (porRun(i + 1, nn, jj, 2)) return true;
            acoes.pop();
          }
        }
        return false;
      };
      acoes.length = 0;
      return porRun(0, n, jl, 0);
    };
    return porNaipe(0, j);
  };

  const rec = (p: number, runs: number[][], j: number): boolean => {
    if (p === 15) return j === 0 && runs.every((l) => l.every(podeFechar));
    // Coringa nunca fica na posição 14 (seria ponta): se ainda sobra coringa aqui, não dá.
    if (p === 14 && j > 0) return false;
    const k = chaveDe(p, runs, j);
    const visto = memo.get(k);
    if (visto !== undefined) return visto;
    if (++estados > limite) throw DESISTIU;
    const r = transicoes(p, runs, j, (prox, jl) => rec(p + 1, prox, jl));
    memo.set(k, r);
    return r;
  };

  const vazio = () => [[], [], [], []] as number[][];
  // Combinações de Ases altos, começando pela preferida (a que a mesa já usa) e as mais parecidas com ela.
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
  if (altoPreferido) {
    const d = (c: number[]) => c.reduce((a, x, n) => a + Math.abs(x - Math.min(altoPreferido[n], maxAlto[n])), 0);
    combos.sort((a, b) => d(a) - d(b));
  }
  const tentar = (): JogoIdx[] | null => {
    for (const c of combos) {
      for (let s = 0; s < 4; s++) alto[s] = c[s];
      memo = new Map();
      if (rec(1, vazio(), curingas)) return soPergunta ? [] : montar();
    }
    return null;
  };

  /** Refaz o caminho que deu certo (a memória já sabe quais estados dão) e monta os jogos. */
  const montar = (): JogoIdx[] => {
    const jogos: JogoIdx[] = [];
    // Sequências abertas de verdade, na mesma ordem dos códigos.
    let abertas: Array<Array<{ cod: number; cartas: number[] }>> = [[], [], [], []];
    let j = curingas;
    for (let p = 1; p <= 14; p++) {
      const runs = abertas.map((l) => l.map((r) => r.cod));
      let feito = false;
      transicoes(p, runs, j, (prox, jl, escolhas) => {
        if (!rec(p + 1, prox, jl)) return false;
        const novas: typeof abertas = [[], [], [], []];
        const vetor = [0, 0, 0, 0];
        for (let s = 0; s < 4; s++) {
          const carta = s * POR_NAIPE + (p === 14 ? 0 : p - 1);
          escolhas[s].acoes.forEach((a, i) => {
            const r = abertas[s][i];
            const tam = Math.min(3, tamDe(r.cod) + 1);
            if (a === 2) jogos.push(r.cartas);
            else if (a === 0) novas[s].push({ cod: codRun(tam, 0, doAsDe(r.cod)), cartas: [...r.cartas, carta] });
            else novas[s].push({ cod: codRun(tam, 1, doAsDe(r.cod)), cartas: [...r.cartas, CURINGA] });
          });
          for (let k = 0; k < escolhas[s].novas; k++) novas[s].push({ cod: codRun(1, 0, p === 1 ? 1 : 0), cartas: [carta] });
          vetor[s] = escolhas[s].trinca;
          novas[s].sort((a, b) => a.cod - b.cod);
        }
        // Divide o vetor de trincas.
        let c = cod4(vetor);
        while (c > 0) {
          const t = tab.primeira[c];
          const jogo: number[] = [];
          for (let s = 0; s < 4; s++) for (let x = 0; x < dig(t, s); x++) jogo.push(s * POR_NAIPE + p - 1);
          jogos.push(jogo);
          c -= t;
        }
        abertas = novas;
        j = jl;
        feito = true;
        return true;
      });
      if (!feito) throw new Error('viavel: caminho perdido');
    }
    for (const l of abertas) for (const r of l) jogos.push(r.cartas);
    return jogos;
  };

  return tentar();
}

/** Atalho: só responde se dá (true/false) ou undefined se desistiu ("não sei"). */
export function viavel(qtd: ArrayLike<number>, regras: Regras, limite = LIMITE_DE_ESTADOS, altoPreferido?: number[]): boolean | undefined {
  const r = dividirViavel(qtd, regras, true, limite, altoPreferido);
  return r === undefined ? undefined : r !== null;
}
