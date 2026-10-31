/**
 * Estado da partida e ações da vez.
 *
 * Todas as funções recebem a partida e devolvem uma NOVA partida
 * (nunca alteram a original). Isso facilita o "Desfazer", o
 * "Recomeçar jogada" e salvar o jogo no aparelho.
 */
import { criarMonte, embaralhar, pontosDaMao, type Carta } from './cartas';
import type { Regras } from './regras';
import { validarJogo } from './validacao';

/** Um jogo na mesa (sequência ou trinca). */
export interface Jogo {
  id: string;
  cartas: Carta[];
}

export interface Jogador {
  nome: string;
  humano: boolean;
  mao: Carta[];
}

/** Uma "foto" da mão de quem joga e da mesa, para desfazer. */
export interface Foto {
  mao: Carta[];
  mesa: Jogo[];
}

export interface Resultado {
  /** Índice do vencedor, ou null em caso de empate. */
  vencedor: number | null;
  motivo: 'bateu' | 'monteAcabou';
  /** Pontos que sobraram na mão de cada jogador. */
  pontos: number[];
}

export interface Partida {
  regras: Regras;
  jogadores: Jogador[];
  mesa: Jogo[];
  monte: Carta[];
  /** Índice do jogador da vez. */
  vez: number;
  /** Semente do sorteio (para continuar a partida igualzinha). */
  semente: number;
  proximoIdJogo: number;
  /** Como estavam mão e mesa no começo da vez ("Recomeçar jogada"). */
  inicioDaVez: Foto;
  /** Fotos anteriores dentro da vez ("Desfazer"). */
  historico: Foto[];
  resultado: Resultado | null;
}

/** Para onde uma carta pode ir. */
export type Destino =
  | { tipo: 'jogo'; jogoId: string }
  | { tipo: 'novoJogo' }
  | { tipo: 'mao' };

export type RespostaAcao = { ok: true; partida: Partida } | { ok: false; motivo: string };

// ---------------------------------------------------------------------------
// Começo da partida
// ---------------------------------------------------------------------------

export function novaPartida(regras: Regras, semente: number, nomes?: string[]): Partida {
  const qtdAdversarios = Math.min(3, Math.max(1, regras.adversarios));
  const nomesPadrao = ['Você', 'Computador', 'Computador 2', 'Computador 3'];

  const { lista: monte, semente: s } = embaralhar(criarMonte(regras), semente);

  const jogadores: Jogador[] = [];
  for (let i = 0; i <= qtdAdversarios; i++) {
    jogadores.push({
      nome: nomes?.[i] ?? nomesPadrao[i],
      humano: i === 0,
      mao: monte.splice(0, regras.cartasPorJogador),
    });
  }

  return {
    regras,
    jogadores,
    mesa: [],
    monte,
    vez: 0,
    semente: s,
    proximoIdJogo: 1,
    inicioDaVez: { mao: jogadores[0].mao, mesa: [] },
    historico: [],
    resultado: null,
  };
}

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

export function jogadorDaVez(p: Partida): Jogador {
  return p.jogadores[p.vez];
}

function fotoAtual(p: Partida): Foto {
  return { mao: jogadorDaVez(p).mao, mesa: p.mesa };
}

/** Troca a mão do jogador da vez e a mesa, guardando a foto anterior. */
function aplicarFoto(p: Partida, nova: Foto, guardarHistorico = true): Partida {
  const jogadores = p.jogadores.map((j, i) => (i === p.vez ? { ...j, mao: nova.mao } : j));
  return {
    ...p,
    jogadores,
    // Jogos vazios somem da mesa automaticamente.
    mesa: nova.mesa.filter((j) => j.cartas.length > 0),
    historico: guardarHistorico ? [...p.historico, fotoAtual(p)] : p.historico,
  };
}

/** Onde está a carta agora: 'mao' ou o id do jogo da mesa. */
export function ondeEstaCarta(p: Partida, cartaId: string): 'mao' | string | null {
  if (jogadorDaVez(p).mao.some((c) => c.id === cartaId)) return 'mao';
  const jogo = p.mesa.find((j) => j.cartas.some((c) => c.id === cartaId));
  return jogo ? jogo.id : null;
}

/** A carta veio da mão nesta vez? (Só essas podem voltar para a mão.) */
export function cartaEraDaMao(p: Partida, cartaId: string): boolean {
  return p.inicioDaVez.mao.some((c) => c.id === cartaId);
}

/** Houve alguma mudança desde o começo da vez? */
export function mexeuNaVez(p: Partida): boolean {
  return p.historico.length > 0;
}

// ---------------------------------------------------------------------------
// Ações durante a vez
// ---------------------------------------------------------------------------

/**
 * Move uma carta (da mão ou da mesa) para um jogo, para um jogo novo ou de volta para a mão.
 * ATENÇÃO: não confere a trava "1 ou 3 cartas da mão". A tela usa sempre moverCartas.
 */
export function moverCarta(p: Partida, cartaId: string, destino: Destino): RespostaAcao {
  if (p.resultado) return { ok: false, motivo: 'A partida já terminou.' };

  const origem = ondeEstaCarta(p, cartaId);
  if (origem === null) return { ok: false, motivo: 'Carta não encontrada.' };

  if (destino.tipo === 'mao') {
    if (!cartaEraDaMao(p, cartaId)) {
      return { ok: false, motivo: 'Cartas que já estavam na mesa não podem ir para a mão.' };
    }
    if (origem === 'mao') return { ok: true, partida: p };
  }
  if (destino.tipo === 'jogo' && destino.jogoId === origem) return { ok: true, partida: p };
  if (destino.tipo === 'jogo' && !p.mesa.some((j) => j.id === destino.jogoId)) {
    return { ok: false, motivo: 'Jogo não encontrado.' };
  }

  // 1) Tira a carta de onde ela está.
  let mao = jogadorDaVez(p).mao;
  let carta: Carta;
  let mesa: Jogo[];
  if (origem === 'mao') {
    carta = mao.find((c) => c.id === cartaId)!;
    mao = mao.filter((c) => c.id !== cartaId);
    mesa = p.mesa;
  } else {
    carta = p.mesa.find((j) => j.id === origem)!.cartas.find((c) => c.id === cartaId)!;
    mesa = p.mesa.map((j) => (j.id === origem ? { ...j, cartas: j.cartas.filter((c) => c.id !== cartaId) } : j));
  }

  // 2) Coloca no destino.
  let proximoIdJogo = p.proximoIdJogo;
  if (destino.tipo === 'mao') {
    mao = [...mao, carta];
  } else if (destino.tipo === 'novoJogo') {
    // Garante um nome (id) que nenhum jogo da mesa usa.
    while (mesa.some((j) => j.id === `j${proximoIdJogo}`)) proximoIdJogo++;
    mesa = [...mesa, { id: `j${proximoIdJogo++}`, cartas: [carta] }];
  } else {
    mesa = mesa.map((j) => (j.id === destino.jogoId ? { ...j, cartas: [...j.cartas, carta] } : j));
  }

  return { ok: true, partida: { ...aplicarFoto(p, { mao, mesa }), proximoIdJogo } };
}

/** Junta todas as cartas do jogo "origem" dentro do jogo "destino". */
export function juntarJogos(p: Partida, origemId: string, destinoId: string): RespostaAcao {
  const origem = p.mesa.find((j) => j.id === origemId);
  const destino = p.mesa.find((j) => j.id === destinoId);
  if (!origem || !destino || origemId === destinoId) return { ok: false, motivo: 'Jogo não encontrado.' };
  const mesa = p.mesa.map((j) => {
    if (j.id === destinoId) return { ...j, cartas: [...j.cartas, ...origem.cartas] };
    if (j.id === origemId) return { ...j, cartas: [] };
    return j;
  });
  return { ok: true, partida: aplicarFoto(p, { mao: jogadorDaVez(p).mao, mesa }) };
}

/** Volta um passo dentro da vez. */
export function desfazer(p: Partida): Partida {
  if (p.historico.length === 0) return p;
  const anterior = p.historico[p.historico.length - 1];
  const sem = aplicarFoto(p, anterior, false);
  return { ...sem, historico: p.historico.slice(0, -1) };
}

/** Volta mão e mesa para como estavam no começo da vez. */
export function recomecarJogada(p: Partida): Partida {
  if (!mexeuNaVez(p)) return p;
  return { ...aplicarFoto(p, p.inicioDaVez, false), historico: [] };
}

// ---------------------------------------------------------------------------
// Conferência e fim da vez
// ---------------------------------------------------------------------------

export interface Conferencia {
  ok: boolean;
  /** Frases amigáveis explicando o que falta. */
  problemas: string[];
  /** Ids dos jogos da mesa que não valem (para a borda vermelha). */
  jogosInvalidos: string[];
}

/**
 * Confere se a vez pode terminar:
 * - todos os jogos da mesa são válidos;
 * - baixou pelo menos 1 carta da mão;
 * - nenhuma carta da mesa voltou para a mão, e nenhuma carta sumiu ou apareceu.
 */
export function conferirJogada(p: Partida): Conferencia {
  return conferir(p.regras, p.inicioDaVez, fotoAtual(p));
}

export function conferir(regras: Regras, inicio: Foto, agora: Foto): Conferencia {
  const problemas: string[] = [];
  const jogosInvalidos: string[] = [];

  // As cartas têm que ser exatamente as mesmas do começo da vez.
  const ids = (cartas: Carta[]) => cartas.map((c) => c.id);
  const antes = [...ids(inicio.mao), ...inicio.mesa.flatMap((j) => ids(j.cartas))].sort();
  const depois = [...ids(agora.mao), ...agora.mesa.flatMap((j) => ids(j.cartas))].sort();
  const mesmasCartas = antes.length === depois.length && antes.every((id, i) => id === depois[i]);
  const idsMesaAgora = new Set(agora.mesa.flatMap((j) => ids(j.cartas)));
  const mesaFicou = inicio.mesa.every((j) => j.cartas.every((c) => idsMesaAgora.has(c.id)));
  if (!mesmasCartas || !mesaFicou) {
    problemas.push('Cartas que já estavam na mesa não podem voltar para a mão.');
  }

  for (const jogo of agora.mesa) {
    if (jogo.cartas.length === 0) continue;
    const r = validarJogo(jogo.cartas, regras);
    if (!r.valido) {
      jogosInvalidos.push(jogo.id);
      if (!problemas.includes(r.motivo)) problemas.push(r.motivo);
    }
  }

  const baixadas = inicio.mao.length - agora.mao.length;
  if (baixadas <= 0) {
    problemas.push('Você precisa baixar pelo menos 1 carta da mão.');
  } else if (!regras.cartasDaMaoPorVez.includes(baixadas)) {
    problemas.push(`De uma vez, só pode baixar ${listaDeQuantidades(regras.cartasDaMaoPorVez)} da mão. Agora você baixou ${baixadas}.`);
  } else if (baixadas > 1 && regras.cartasDaMaoNoMesmoJogo) {
    // As cartas que saíram da mão têm que estar todas no mesmo jogo.
    const naMao = new Set(agora.mao.map((c) => c.id));
    const baixadasIds = inicio.mao.filter((c) => !naMao.has(c.id)).map((c) => c.id);
    const jogos = new Set(agora.mesa.filter((j) => j.cartas.some((c) => baixadasIds.includes(c.id))).map((j) => j.id));
    if (jogos.size > 1) problemas.push(`As ${baixadas} cartas da mão têm que ficar juntas no mesmo jogo.`);
  }
  if (baixadas > 1 && regras.cartasDaMaoFormamJogo) {
    const naMao = new Set(agora.mao.map((c) => c.id));
    const cartas = inicio.mao.filter((c) => !naMao.has(c.id));
    if (!validarJogo(cartas, regras).valido) problemas.push(MENSAGEM_FORMAR_JOGO);
  }

  return { ok: problemas.length === 0, problemas, jogosInvalidos };
}

/** [1, 3] → "1 carta ou 3 cartas" */
function listaDeQuantidades(qtds: number[]): string {
  return qtds.map((n) => `${n} carta${n > 1 ? 's' : ''}`).join(' ou ');
}

/** Passa a vez para o próximo jogador. */
function passarAVez(p: Partida): Partida {
  const vez = (p.vez + 1) % p.jogadores.length;
  const mesa = p.mesa.filter((j) => j.cartas.length > 0);
  return {
    ...p,
    mesa,
    vez,
    inicioDaVez: { mao: p.jogadores[vez].mao, mesa },
    historico: [],
  };
}

/** Termina a vez (só se a conferência estiver ok). */
export function terminarJogada(p: Partida): RespostaAcao {
  if (p.resultado) return { ok: false, motivo: 'A partida já terminou.' };
  const c = conferirJogada(p);
  if (!c.ok) return { ok: false, motivo: c.problemas.join(' ') };

  // Zerou a mão: venceu!
  if (jogadorDaVez(p).mao.length === 0) {
    const pontos = p.jogadores.map((j) => pontosDaMao(j.mao, p.regras));
    return { ok: true, partida: { ...p, historico: [], resultado: { vencedor: p.vez, motivo: 'bateu', pontos } } };
  }
  return { ok: true, partida: passarAVez(p) };
}

/**
 * Compra 1 carta e passa a vez. Se a pessoa tinha mexido na mesa,
 * tudo volta como estava no começo da vez antes de comprar.
 * Se o monte acabou, a partida termina (veja "fimDoMonte" nas regras).
 */
export function comprarEPassar(p: Partida): RespostaAcao {
  if (p.resultado) return { ok: false, motivo: 'A partida já terminou.' };
  const limpa = recomecarJogada(p);

  if (limpa.monte.length === 0) {
    return { ok: true, partida: { ...limpa, resultado: resultadoPorMonteVazio(limpa) } };
  }

  const [comprada, ...monte] = limpa.monte;
  const jogadores = limpa.jogadores.map((j, i) => (i === limpa.vez ? { ...j, mao: [...j.mao, comprada] } : j));
  return { ok: true, partida: passarAVez({ ...limpa, jogadores, monte }) };
}

/** Quem vence quando o monte acaba. */
export function resultadoPorMonteVazio(p: Partida): Resultado {
  const pontos = p.jogadores.map((j) => pontosDaMao(j.mao, p.regras));
  const cartas = p.jogadores.map((j) => j.mao.length);

  // Critério principal e desempate, conforme a regra escolhida.
  const [primeiro, segundo] = p.regras.fimDoMonte === 'menosCartas' ? [cartas, pontos] : [pontos, cartas];

  let melhores = p.jogadores.map((_, i) => i);
  for (const criterio of [primeiro, segundo]) {
    const menor = Math.min(...melhores.map((i) => criterio[i]));
    melhores = melhores.filter((i) => criterio[i] === menor);
  }
  return { vencedor: melhores.length === 1 ? melhores[0] : null, motivo: 'monteAcabou', pontos };
}

/**
 * Aplica de uma vez uma jogada completa (usado pelo computador e pela dica):
 * troca a mão e a mesa pelos valores dados e termina a vez.
 */
export function aplicarJogada(p: Partida, nova: Foto): RespostaAcao {
  const comFoto = aplicarFoto(p, nova);
  const maiorId = nova.mesa.reduce((m, j) => Math.max(m, Number(j.id.replace(/\D/g, '')) || 0), 0);
  return terminarJogada({ ...comFoto, proximoIdJogo: Math.max(p.proximoIdJogo, maiorId + 1) });
}

/**
 * Move várias cartas de uma vez para o mesmo destino.
 * Conta como UM movimento só no "Desfazer".
 * Se o destino for "novoJogo", todas vão para o mesmo jogo novo.
 */
/** Quantas cartas da mão já foram para a mesa nesta vez. */
export function cartasBaixadasDaMao(p: Partida): number {
  return p.inicioDaVez.mao.length - jogadorDaVez(p).mao.length;
}

/**
 * Trava da mão (regra da casa: 1 ou 3 cartas da mão por vez):
 * - só dá para baixar cartas da mão se ainda não baixou nenhuma nesta vez;
 * - e tem que ser de uma vez só a quantidade permitida (1 ou 3).
 *   Baixou 1? A mão trava. Para trocar, desfaz.
 * - Devolver para a mão só pode se não sobrar uma quantidade proibida na mesa (ex.: 2).
 * Devolve a mensagem do problema, ou null se está tudo bem.
 */
const MENSAGEM_FORMAR_JOGO = 'As 3 cartas da mão precisam formar um jogo sozinhas: 3 iguais (2-2-2) ou em sequência (2-3-4).';

function travaDaMao(p: Partida, antes: number, depois: number, baixadas: Carta[]): string | null {
  const permitidos = p.regras.cartasDaMaoPorVez;
  const lista = listaDeQuantidades(permitidos);
  if (depois > antes) {
    if (antes > 0) {
      return 'Você já baixou 1 carta da mão. Para baixar 3, toque em ↶ Desfazer e escolha as 3 juntas antes de colocar.';
    }
    if (!permitidos.includes(depois)) return `Da mão, escolha ${lista} de uma vez. Agora são ${depois}.`;
    if (depois > 1 && p.regras.cartasDaMaoFormamJogo && !validarJogo(baixadas, p.regras).valido) {
      return MENSAGEM_FORMAR_JOGO;
    }
  }
  if (depois < antes && depois !== 0 && !permitidos.includes(depois)) {
    return 'Devolva todas as cartas juntas, ou toque em ↶ Desfazer.';
  }
  return null;
}

export function moverCartas(p: Partida, cartaIds: string[], destino: Destino): RespostaAcao {
  if (cartaIds.length === 0) return { ok: true, partida: p };
  const antes = fotoAtual(p);
  let atual = p;
  let alvo = destino;
  for (const id of cartaIds) {
    const r = moverCarta(atual, id, alvo);
    if (!r.ok) return r;
    // Depois da primeira carta, as outras vão para o jogo novo que acabou de ser criado.
    if (alvo.tipo === 'novoJogo' && r.partida.mesa.length > atual.mesa.length) {
      alvo = { tipo: 'jogo', jogoId: r.partida.mesa[r.partida.mesa.length - 1].id };
    }
    atual = r.partida;
  }
  const naMao = new Set(jogadorDaVez(atual).mao.map((c) => c.id));
  const baixadas = atual.inicioDaVez.mao.filter((c) => !naMao.has(c.id));
  const problema = travaDaMao(p, cartasBaixadasDaMao(p), cartasBaixadasDaMao(atual), baixadas);
  if (problema) return { ok: false, motivo: problema };
  return { ok: true, partida: { ...atual, historico: [...p.historico, antes] } };
}

/** Troca mão e mesa de uma vez (usado pela "Dica: fazer para mim"). Conta como um movimento. */
export function definirFoto(p: Partida, nova: Foto): Partida {
  const maiorId = nova.mesa.reduce((m, j) => Math.max(m, Number(j.id.replace(/\D/g, '')) || 0), 0);
  return { ...aplicarFoto(p, nova), proximoIdJogo: Math.max(p.proximoIdJogo, maiorId + 1) };
}
