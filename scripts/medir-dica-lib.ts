/**
 * Benchmark da busca exata da Dica/Difícil (usado por scripts/medir-dica.mjs).
 * - gerarMesas(): joga partidas simuladas (computador Médio nos 4 lugares, com coringa) e guarda mesas do meio do jogo.
 * - medir(): roda buscaExata em cada mesa e devolve, por mesa, a resposta (existe? quais cartas? quantos jogos mexidos?) e o tempo.
 */
import { NAIPES, SIMBOLO_NAIPE, nomeDoValor, type Carta, type Naipe } from '../src/motor/cartas';
import { criarRegras } from '../src/motor/regras';
import { aplicarJogada, comprarEPassar, conferir, novaPartida, type Foto, type Partida } from '../src/motor/partida';
import { buscaExata, pensar } from '../src/ia';
import { tipoDaCarta } from '../src/ia/combinacoes';

// SEM_CORINGA=1 no ambiente: partidas sem coringa (o padrão do jogo).
export const regras = criarRegras({ adversarios: 3, nivelIA: 'medio', curinga: { ...criarRegras().curinga, ativo: !process.env.SEM_CORINGA } });

export interface MesaSalva {
  nome: string;
  mao: string;
  mesa: string[];
}

const texto = (cs: Carta[]) => cs.map((c) => (c.curinga ? 'Coringa' : nomeDoValor(c.valor) + SIMBOLO_NAIPE[c.naipe])).join(' ');

let contador = 0;
export function lerCartas(t: string): Carta[] {
  const naipe: Record<string, Naipe> = { '♥': 'copas', '♦': 'ouros', '♠': 'espadas', '♣': 'paus' };
  const valor: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
  return t
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => {
      contador++;
      if (p === 'Coringa') return { id: `cur-${contador}`, curinga: true };
      const v = p.slice(0, -1);
      return { id: `${p}-${contador}`, curinga: false, naipe: naipe[p.slice(-1)], valor: valor[v] ?? Number(v) };
    });
}

export function fotoDe(m: MesaSalva): Foto {
  return { mao: lerCartas(m.mao), mesa: m.mesa.map((t, i) => ({ id: `j${i}`, cartas: lerCartas(t) })) };
}

/** Simula partidas e guarda o começo de cada vez com mesa de pelo menos "minJogos" jogos. */
export function gerarMesas(sementes: number[], minJogos = 7): MesaSalva[] {
  void NAIPES;
  const saida: MesaSalva[] = [];
  for (const semente of sementes) {
    let p: Partida = novaPartida(regras, semente);
    for (let rodada = 0; rodada < 400 && !p.resultado; rodada++) {
      const ini = p.inicioDaVez;
      if (ini.mesa.length >= minJogos) saida.push({ nome: `s${semente}-r${rodada}`, mao: texto(ini.mao), mesa: ini.mesa.map((j) => texto(j.cartas)) });
      const jogada = pensar(p.regras, ini, 'medio', p.proximoIdJogo);
      const r = jogada && conferir(p.regras, ini, jogada.foto).ok ? aplicarJogada(p, jogada.foto) : comprarEPassar(p);
      if (!r.ok) break;
      p = r.partida;
    }
  }
  return saida;
}

export interface Medida {
  nome: string;
  jogos: number;
  cartas: number;
  ms: number;
  completa: boolean;
  existe: boolean;
  baixadas: string;
  /** Jogos da mesa que não ficaram iguais (por tipo). */
  mexidos: number;
  conferida: boolean;
}

const chaveDoJogo = (cs: Carta[]) => cs.map(tipoDaCarta).sort().join(',');

export function medirUma(m: MesaSalva, tempoMs = 8000, degraus?: number[]): Medida {
  const inicio = fotoDe(m);
  const t0 = performance.now();
  const r = buscaExata(regras, inicio, tempoMs, degraus);
  const ms = performance.now() - t0;
  let mexidos = 0;
  let conferida = true;
  let baixadas = '';
  if (r.opcao) {
    const sobra = new Set(r.opcao.maoQueSobra.map((c) => c.id));
    baixadas = inicio.mao
      .filter((c) => !sobra.has(c.id))
      .map(tipoDaCarta)
      .sort()
      .join(' ');
    const novos = r.opcao.novos.map(chaveDoJogo);
    for (const j of inicio.mesa) {
      const k = chaveDoJogo(j.cartas);
      const i = novos.indexOf(k);
      if (i >= 0) novos.splice(i, 1);
      else mexidos++;
    }
    const foto: Foto = { mao: r.opcao.maoQueSobra, mesa: r.opcao.novos.map((cartas, i) => ({ id: `n${i}`, cartas })) };
    conferida = conferir(regras, inicio, foto).ok;
  }
  return {
    nome: m.nome,
    jogos: inicio.mesa.length,
    cartas: inicio.mesa.reduce((a, j) => a + j.cartas.length, 0),
    ms: Math.round(ms * 10) / 10,
    completa: r.completa,
    existe: !!r.opcao,
    baixadas,
    mexidos,
    conferida,
  };
}
