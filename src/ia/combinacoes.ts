/**
 * Procura jogos (sequências e trincas) que dá para montar com um grupo de cartas.
 * Usado pelo computador e pelo botão "Dica".
 *
 * Como há 2 baralhos, pode haver duas cartas iguais (ex.: dois 7♥).
 * Por isso a busca trabalha com o "tipo" da carta (ex.: "7-copas") e
 * a QUANTIDADE de cada tipo, e só no fim escolhe as cartas de verdade.
 */
import { NAIPES, type Carta, type Naipe } from '../motor/cartas';
import type { Regras } from '../motor/regras';
import { jogoValido } from '../motor/validacao';

const CURINGA = 'curinga';

/** Quantas cartas de cada tipo. */
export type Contagem = Map<string, number>;

/** Limite de esforço da busca (para nunca travar o iPad). */
export interface Orcamento {
  passos: number;
  /** Momento (performance.now) em que a busca tem que parar. */
  fim: number;
}

export function novoOrcamento(ms: number, passos = Infinity): Orcamento {
  return { passos, fim: performance.now() + ms };
}

function esgotou(o: Orcamento): boolean {
  o.passos--;
  // Olhar o relógio custa caro; olhamos só de vez em quando.
  return o.passos <= 0 || (o.passos % 64 === 0 && performance.now() > o.fim);
}

/** Carta "de exemplo" a partir do tipo (ex.: "7-espadas"), para conferir regras. */
export function cartaDoTipo(tipo: string): Carta {
  if (tipo === CURINGA) return { id: tipo, curinga: true };
  const [v, naipe] = tipo.split('-');
  return { id: tipo, curinga: false, valor: Number(v), naipe: naipe as Naipe };
}

export function tipoDaCarta(c: Carta): string {
  return c.curinga ? CURINGA : `${c.valor}-${c.naipe}`;
}

export function contar(cartas: Carta[]): Contagem {
  const m: Contagem = new Map();
  for (const c of cartas) m.set(tipoDaCarta(c), (m.get(tipoDaCarta(c)) ?? 0) + 1);
  return m;
}

/** Lista de todos os jogos possíveis com essas cartas (como listas de tipos). */
export function jogosPossiveis(cartas: Carta[], regras: Regras): string[][] {
  return jogosPossiveisDaContagem(contar(cartas), regras);
}

export function jogosPossiveisDaContagem(qtd: Contagem, regras: Regras): string[][] {
  const tem = (t: string) => (qtd.get(t) ?? 0) > 0;
  const curingas = regras.curinga.ativo ? qtd.get(CURINGA) ?? 0 : 0;
  const maxCuringas = Math.min(curingas, regras.curinga.maximoPorJogo ?? Infinity);
  const resultado: string[][] = [];

  // Trincas: mesmo valor, até 2 cartas de cada naipe (2 baralhos).
  // Testa cada combinação de quantidades por naipe e guarda as que valem.
  for (let valor = 1; valor <= 13; valor++) {
    const max = NAIPES.map((n) => Math.min(2, qtd.get(`${valor}-${n}`) ?? 0));
    if (max.filter((m) => m > 0).length < 3) continue;
    const escolha = [0, 0, 0, 0];
    const percorrer = (i: number) => {
      if (i === 4) {
        const naipes = escolha.filter((q) => q > 0).length;
        const total = escolha.reduce((a, b) => a + b, 0);
        if (naipes < 3 || (naipes === 4 && total < regras.trinca.minimoComQuatroNaipes)) return;
        const tipos: string[] = [];
        NAIPES.forEach((n, k) => {
          for (let q = 0; q < escolha[k]; q++) tipos.push(`${valor}-${n}`);
        });
        resultado.push(tipos);
        return;
      }
      for (let q = 0; q <= max[i]; q++) {
        escolha[i] = q;
        percorrer(i + 1);
      }
    };
    percorrer(0);
  }

  // Sequências: o valor 14 é o Ás alto.
  for (const naipe of NAIPES) {
    const tipo = (v: number) => `${v === 14 ? 1 : v}-${naipe}`;
    for (let inicio = 1; inicio <= 12; inicio++) {
      if (!tem(tipo(inicio))) continue;
      let buracos = 0;
      let anteriorEraBuraco = false;
      for (let fim = inicio + 1; fim <= 14; fim++) {
        if (inicio === 1 && fim === 14 && !regras.permitirSequenciaAsAteAs) break;
        if (!tem(tipo(fim))) {
          buracos++;
          // Dois curingas seguidos não podem (regra da casa).
          if (buracos > maxCuringas || (anteriorEraBuraco && !regras.curinga.permitirLadoALado)) break;
          anteriorEraBuraco = true;
          continue; // a ponta de uma sequência nunca pode ser curinga
        }
        anteriorEraBuraco = false;
        if (fim - inicio + 1 < 3) continue;
        const tipos: string[] = [];
        for (let v = inicio; v <= fim; v++) tipos.push(tem(tipo(v)) ? tipo(v) : CURINGA);
        // Ás baixo e alto juntos exige dois Ases.
        if (inicio === 1 && fim === 14 && (qtd.get(tipo(1)) ?? 0) < 2) continue;
        resultado.push(tipos);
      }
    }
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Resolver: a peça principal do computador
// ---------------------------------------------------------------------------

/**
 * Divide as cartas em jogos válidos.
 * - "obrigatorias": cartas que TÊM que ficar em algum jogo (as que já estavam na mesa).
 * - "opcionais": cartas que PODEM ser usadas (as da mão).
 * Procura usar o maior número possível de cartas opcionais, MAS só aceita
 * quantidades permitidas pela regra (regras.cartasDaMaoPorVez, ex.: 1 ou 3).
 * Devolve a lista de jogos e quantas cartas da mão foram usadas,
 * ou null se não deu para encaixar todas as obrigatórias.
 */
export function resolver(
  obrigatorias: Carta[],
  opcionais: Carta[],
  regras: Regras,
  orcamento: Orcamento,
  desempate?: Desempate,
): { jogos: Carta[][]; usadasDaMao: number } | null {
  const obrig = contar(obrigatorias);
  const opc = contar(opcionais);
  let faltamObrig = obrigatorias.length;
  let totalOpc = opcionais.length;

  // Quantidades de cartas da mão que a regra permite baixar de uma vez (ex.: [3, 1]).
  const permitidos = regras.cartasDaMaoPorVez.filter((n) => n <= opcionais.length).sort((a, b) => b - a);
  const maximo = permitidos[0] ?? 0;

  let melhor: string[][] | null = null;
  let melhorUsadas = -1;
  let melhorNota = -Infinity;
  const atual: string[][] = [];
  // Regra da casa: as cartas da mão vão todas para UM jogo só.
  const umJogoSo = regras.cartasDaMaoNoMesmoJogo;
  let jogosComMao = 0;

  /** Gasta as cartas de um jogo (obrigatórias primeiro). Devolve quantas opcionais usou. */
  function usar(jogo: string[]): { deObrig: string[]; deOpc: string[] } {
    const deObrig: string[] = [];
    const deOpc: string[] = [];
    for (const t of jogo) {
      if ((obrig.get(t) ?? 0) > 0) {
        obrig.set(t, obrig.get(t)! - 1);
        deObrig.push(t);
      } else {
        opc.set(t, opc.get(t)! - 1);
        deOpc.push(t);
      }
    }
    faltamObrig -= deObrig.length;
    totalOpc -= deOpc.length;
    return { deObrig, deOpc };
  }
  function devolver(g: { deObrig: string[]; deOpc: string[] }) {
    for (const t of g.deObrig) obrig.set(t, obrig.get(t)! + 1);
    for (const t of g.deOpc) opc.set(t, opc.get(t)! + 1);
    faltamObrig += g.deObrig.length;
    totalOpc += g.deOpc.length;
  }
  function juntas(): Contagem {
    const m: Contagem = new Map(opc);
    for (const [t, n] of obrig) m.set(t, (m.get(t) ?? 0) + n);
    return m;
  }

  function buscar(usadas: number) {
    if (esgotou(orcamento)) return;
    if (usadas > maximo) return; // já usou cartas da mão demais
    // Não dá para superar a melhor? Desiste deste caminho.
    // (Com desempate, um empate ainda pode ser melhor, então só desiste se for pior.)
    const teto = Math.min(usadas + totalOpc, maximo);
    if (melhor && (desempate ? teto < melhorUsadas : teto <= melhorUsadas)) return;

    if (faltamObrig === 0) {
      // Todas as cartas da mesa estão encaixadas. Agora, completa com jogos só da mão
      // para chegar a uma quantidade permitida (ex.: usou 0 → faz um jogo novo de 3).
      for (const alvo of permitidos) {
        if (alvo < usadas) continue;
        // Já tem um jogo com cartas da mão? Então não pode abrir outro.
        if (alvo > usadas && umJogoSo && jogosComMao > 0) continue;
        const extra = jogosComTotalExato(opc, alvo - usadas, regras, desempate, umJogoSo);
        if (!extra) continue;
        if (alvo > melhorUsadas || (alvo === melhorUsadas && extra.nota > melhorNota)) {
          melhorUsadas = alvo;
          melhorNota = extra.nota;
          melhor = [...atual, ...extra.jogos];
        }
        if (!desempate) break; // achou a maior quantidade possível neste caminho
      }
      return;
    }

    // Escolhe uma carta obrigatória e tenta cada jogo que a contém.
    const alvo = [...obrig.entries()].find(([, n]) => n > 0)![0];
    const candidatos = jogosPossiveisDaContagem(juntas(), regras).filter((j) => j.includes(alvo));
    // Jogos que usam mais cartas da mesa primeiro (costuma achar solução mais rápido).
    candidatos.sort((a, b) => b.length - a.length);
    for (const jogo of candidatos) {
      const g = usar(jogo);
      const usaMao = g.deOpc.length > 0;
      const proibido =
        (usaMao && umJogoSo && jogosComMao > 0) || // segundo jogo com cartas da mão
        (g.deOpc.length > 1 && regras.cartasDaMaoFormamJogo && !jogoValido(g.deOpc.map(cartaDoTipo), regras)); // as da mão não formam jogo sozinhas
      if (proibido) {
        devolver(g);
        continue;
      }
      if (usaMao) jogosComMao++;
      atual.push(jogo);
      buscar(usadas + g.deOpc.length);
      atual.pop();
      if (usaMao) jogosComMao--;
      devolver(g);
      if (orcamento.passos <= 0 || performance.now() > orcamento.fim) return;
      if (melhorUsadas === maximo && !desempate) return; // já achou o máximo permitido
    }
  }
  buscar(0);

  if (!melhor) return null;
  return { jogos: materializar(melhor, obrigatorias, opcionais, regras), usadasDaMao: melhorUsadas };
}

/**
 * Escolhe jogos só com cartas da mão que somem EXATAMENTE "total" cartas.
 * Devolve null se não existir. Com desempate, escolhe a combinação que deixa a melhor sobra.
 */
function jogosComTotalExato(
  qtdOriginal: Contagem,
  total: number,
  regras: Regras,
  desempate?: Desempate,
  umJogoSo = false,
): { jogos: string[][]; nota: number } | null {
  const qtd: Contagem = new Map(qtdOriginal);
  const nota = () => (desempate ? desempate(qtd) : 0);
  if (total === 0) return { jogos: [], nota: nota() };

  // Com "um jogo só", vale apenas um jogo com exatamente "total" cartas.
  const candidatos = jogosPossiveisDaContagem(qtd, regras).filter((j) => (umJogoSo ? j.length === total : j.length <= total));
  let melhor: { jogos: string[][]; nota: number } | null = null;
  const atual: string[][] = [];
  let passos = 2000;

  function cabe(jogo: string[]): boolean {
    const precisa: Contagem = new Map();
    for (const t of jogo) precisa.set(t, (precisa.get(t) ?? 0) + 1);
    for (const [t, n] of precisa) if ((qtd.get(t) ?? 0) < n) return false;
    return true;
  }
  function buscar(i: number, falta: number) {
    if (--passos <= 0) return;
    if (falta === 0) {
      const n = nota();
      if (!melhor || n > melhor.nota) melhor = { jogos: [...atual], nota: n };
      return;
    }
    for (let k = i; k < candidatos.length; k++) {
      const jogo = candidatos[k];
      if (jogo.length > falta || !cabe(jogo)) continue;
      for (const t of jogo) qtd.set(t, qtd.get(t)! - 1);
      atual.push(jogo);
      buscar(k, falta - jogo.length);
      atual.pop();
      for (const t of jogo) qtd.set(t, qtd.get(t)! + 1);
      if (melhor && !desempate) return;
    }
  }
  buscar(0, total);
  return melhor;
}

/**
 * Nota das cartas que SOBRAM na mão (maior = melhor). Usada para escolher
 * entre jogadas que baixam o mesmo número de cartas (nível Difícil).
 */
export type Desempate = (sobra: Contagem) => number;

/** Troca os tipos pelas cartas de verdade (primeiro as obrigatórias). */
function materializar(jogos: string[][], obrigatorias: Carta[], opcionais: Carta[], regras: Regras): Carta[][] {
  const sobraObrig = [...obrigatorias];
  const sobraOpc = [...opcionais];
  const pegar = (t: string): Carta => {
    let i = sobraObrig.findIndex((c) => tipoDaCarta(c) === t);
    if (i >= 0) return sobraObrig.splice(i, 1)[0];
    i = sobraOpc.findIndex((c) => tipoDaCarta(c) === t);
    return sobraOpc.splice(i, 1)[0];
  };
  return jogos.map((j) => j.map(pegar)).filter((j) => jogoValido(j, regras));
}
