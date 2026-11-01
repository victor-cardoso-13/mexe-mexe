/**
 * Computador (IA).
 *
 * Níveis (ajustáveis em src/motor/regras.ts):
 * - FÁCIL:   mexe em no máximo 1 jogo que já estava na mesa por vez.
 * - MÉDIO:   mexe em no máximo 3 jogos da mesa.
 * - DIFÍCIL: sem limite; procura a jogada que baixa mais cartas e, no empate,
 *            a que deixa na mão as cartas com mais chance de virar jogo depois.
 * Em todos os níveis ele pode baixar jogos novos só com cartas da mão.
 *
 * A IA não altera a partida: devolve como ficariam mão e mesa e uma lista
 * de passos, para a tela mostrar devagar o que ele fez.
 */
import { pontosDaMao, type Carta } from '../motor/cartas';
import { jogoValido } from '../motor/validacao';
import { conferir, type Foto, type Jogo, type Partida } from '../motor/partida';
import type { NivelIA, Regras } from '../motor/regras';
import { cartaDoTipo, contar, novoOrcamento, resolver, tipoDaCarta, type Contagem, type Desempate, type Orcamento } from './combinacoes';
import { Buscador, type Relogio } from './exata';

export interface Passo {
  /** baixou = jogo novo só com cartas da mão; encostou = pôs cartas num jogo; rearrumou = mexeu em vários. */
  tipo: 'baixou' | 'encostou' | 'rearrumou';
  /** Cartas da mão usadas neste passo. */
  cartasDaMao: Carta[];
  /** Jogos que mudaram (para destacar na tela). */
  jogoIds: string[];
  /** Como fica a mesa depois deste passo (para animar). */
  mesa: Jogo[];
}

export interface JogadaIA {
  /** Como ficam a mão e a mesa no fim da jogada. */
  foto: Foto;
  passos: Passo[];
}

/** Escolhe a jogada do jogador da vez. Devolve null se não há o que baixar (então ele compra). */
/** Quanto tempo a dica pode pensar, no máximo (milissegundos). A busca exata quase sempre termina muito antes. */
export const TEMPO_DA_DICA_MS = 12000;

export function escolherJogada(p: Partida, nivel: NivelIA = p.regras.nivelIA, opcoes: { dica?: boolean } = {}): JogadaIA | null {
  const jogada = pensar(p.regras, p.inicioDaVez, nivel, p.proximoIdJogo, opcoes);
  // Segurança: nunca devolve uma jogada que as regras não aceitam.
  if (!jogada || !conferir(p.regras, p.inicioDaVez, jogada.foto).ok) return null;
  return jogada;
}

interface Opcao {
  /** Jogos da mesa que ele desmontou/mexeu. */
  mexidos: Jogo[];
  /** Jogos que ficaram no lugar deles (mais os novos). */
  novos: Carta[][];
  usadas: number;
  maoQueSobra: Carta[];
}

/** A IA "crua", sem a conferência final (usada nos testes). */
export function pensar(
  regras: Regras,
  inicio: Foto,
  nivel: NivelIA,
  proximoIdJogo: number,
  opcoes: { dica?: boolean } = {},
): JogadaIA | null {
  const config = regras.niveis[nivel];
  // A dica pode pensar mais (a tela mostra "Procurando uma jogada…").
  const tempoMs = opcoes.dica ? Math.max(config.tempoMaximoMs, TEMPO_DA_DICA_MS) : config.tempoMaximoMs;
  let orcamento = novoOrcamento(tempoMs);
  const mao = inicio.mao;
  const limite = config.maximoDeJogosMexidos ?? Infinity;

  const desempate = config.otimizar ? notaDaSobra(regras) : undefined;
  let melhor: Opcao | null = null;

  // Difícil e Dica: busca EXATA (testa todas as maneiras de arrumar a mesa, sem limite de jogos mexidos).
  // Se ela termina, a resposta é definitiva: ou é a jogada perfeita, ou realmente não existe jogada.
  // Só se o tempo acabar antes é que caímos nas buscas por tentativas, mais abaixo.
  if (config.maximoDeJogosMexidos === null) {
    const exata = buscaExata(regras, inicio, opcoes.dica ? tempoMs : tempoMs * 0.6);
    ultimaBusca = { ms: Math.round(performance.now() - (orcamento.fim - tempoMs)), tempoAcabou: !exata.completa };
    if (exata.completa) return exata.opcao ? montarPassos(inicio, exata.opcao, proximoIdJogo) : null;
    melhor = exata.opcao;
    if (!melhor) orcamento = novoOrcamento(opcoes.dica ? 3000 : tempoMs * 0.4); // a busca exata gastou o tempo; as tentativas ganham um pouco mais
  }
  /** Tenta mexer nesses jogos usando só estas cartas da mão. */
  const considerarSo = (mexidos: Jogo[], cartasDaMao: Carta[], parteDoTempo = 0.25) => {
    const r = resolver(mexidos.flatMap((j) => j.cartas), cartasDaMao, regras, fatia(orcamento, parteDoTempo), desempate);
    if (!r || r.usadasDaMao === 0) return;
    const usadasIds = new Set(r.jogos.flat().map((c) => c.id));
    const opcao: Opcao = { mexidos, novos: r.jogos, usadas: r.usadasDaMao, maoQueSobra: mao.filter((c) => !usadasIds.has(c.id)) };
    if (!melhor || melhorQue(opcao, melhor, config.otimizar, regras)) melhor = opcao;
  };
  const considerar = (mexidos: Jogo[]) => considerarSo(mexidos, mao);

  // Busca de UMA carta: tenta cada carta da mão sozinha, mexendo em até 4 jogos ligados a ela
  // (e nos ligados a esses) e, se precisar, num grupo que vai crescendo.
  // Acha rearrumações grandes, como as do K♦ e do 9♦ que a família mostrou.
  const buscaDeUmaCarta = () => {
    // Para cada carta: os jogos ligados a ela ("perto") e os ligados a esses ("vizinhos").
    const preparar = (carta: Carta) => {
      const perto = inicio.mesa.filter((j) => ligacao(j, [carta]) > 0);
      const vizinhos = inicio.mesa
        .filter((j) => !perto.includes(j))
        .map((j) => ({ j, nota: perto.reduce((soma, q) => soma + ligacao(j, q.cartas), 0) }))
        .filter((x) => x.nota > 0)
        .sort((a, b) => b.nota - a.nota)
        .map((x) => x.j);
      return { carta, perto, candidatos: [...perto, ...vizinhos].slice(0, 8) };
    };
    const cartas = mao.map(preparar);
    const parar = () => tempoAcabou(orcamento) || !!melhor; // achou uma: já serve

    // Em etapas, do mais rápido ao mais demorado, passando por TODAS as cartas em cada etapa
    // (assim uma carta sem jogada não gasta o tempo todo antes de testar as outras).
    for (const tamanho of [2, 4]) {
      for (const { carta, candidatos } of cartas) {
        for (const grupo of grupos(candidatos, Math.min(limite, tamanho))) {
          if (parar()) return;
          if (tamanho === 4 && grupo.length <= 2) continue; // já testado na etapa anterior
          considerarSo(grupo, [carta]);
        }
      }
    }
    // Última etapa — busca crescente: começa nos jogos ligados à carta e vai juntando, um a um,
    // o jogo mais ligado ao grupo (pode chegar à mesa inteira, sempre dentro do tempo).
    // Juntar jogos nunca atrapalha (eles podem ficar como estão), então acha rearrumações
    // grandes, como a do 9♦ com o curinga que a família mostrou.
    // (Só na dica: para o computador, ela deixaria a vez dele lenta quando não há jogada.)
    if (!opcoes.dica) return;
    for (const { carta, perto } of cartas) {
      const grupo = [...perto];
      while (!parar() && grupo.length <= Math.min(limite, inicio.mesa.length)) {
        // Passa uma CÓPIA: o grupo continua crescendo e a jogada guardada não pode mudar junto.
        if (grupo.length > 0) considerarSo([...grupo], [carta], 0.5);
        if (parar()) return;
        const proximo = inicio.mesa
          .filter((j) => !grupo.includes(j))
          .map((j) => ({ j, nota: ligacao(j, grupo.flatMap((g) => g.cartas)) }))
          .filter((x) => x.nota > 0)
          .sort((a, b) => b.nota - a.nota)[0];
        if (!proximo) break;
        grupo.push(proximo.j);
      }
    }
  };

  // Na dica, começa pela busca de 1 carta (é o caso mais comum e costuma ser rápida).
  if (opcoes.dica) buscaDeUmaCarta();

  // 1) Só jogos novos com a mão (não mexe na mesa).
  considerar([]);

  // 2) Jogos da mesa que têm ligação com as cartas da mão, dos mais promissores aos menos.
  const relevantes = inicio.mesa
    .map((j) => ({ j, nota: ligacao(j, mao) }))
    .filter((x) => x.nota > 0)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, 10)
    .map((x) => x.j);

  // Grupos de 1, 2 e 3 jogos (até o limite do nível).
  for (const grupo of grupos(relevantes, Math.min(limite, 3))) {
    if (tempoAcabou(orcamento)) break;
    considerar(grupo);
  }
  // Difícil: também tenta mexer em vários jogos de uma vez (os 4, 5, ... mais promissores).
  for (let n = 4; n <= Math.min(limite, relevantes.length); n++) {
    if (tempoAcabou(orcamento)) break;
    considerar(relevantes.slice(0, n));
  }

  if (nivel === 'dificil' && !melhor && !opcoes.dica) buscaDeUmaCarta();

  ultimaBusca = { ms: Math.round(performance.now() - (orcamento.fim - tempoMs)), tempoAcabou: tempoAcabou(orcamento) };
  if (!melhor) return null;
  return montarPassos(inicio, melhor, proximoIdJogo);
}

/**
 * Busca exata: para cada jeito permitido de baixar cartas da mão (3 que formam jogo sozinhas, senão 1),
 * pergunta ao divisor se TODA a mesa pode ser arrumada em jogos válidos. Entre os jeitos possíveis,
 * fica com o que deixa a melhor mão e, nele, com a arrumação que mexe em menos jogos.
 * "completa" = a busca terminou sem o tempo acabar (então "nenhuma jogada" é definitivo).
 */
function buscaExata(regras: Regras, inicio: Foto, tempoMs: number): { completa: boolean; opcao: Opcao | null } {
  const relogio: Relogio = { fim: performance.now() + tempoMs, acabou: false };
  const mao = inicio.mao;
  const mesaCartas = inicio.mesa.map((j) => j.cartas);
  const nota = notaDaSobra(regras);

  // Jeitos de baixar: grupos de cartas da mão com a quantidade permitida (e que formam jogo, se a regra pede).
  const grupos: Carta[][] = [];
  const vistos = new Set<string>();
  const juntar = (cartas: Carta[]) => {
    const k = cartas.map(tipoDaCarta).sort().join('|');
    if (vistos.has(k)) return;
    vistos.add(k);
    grupos.push(cartas);
  };
  for (const n of [...regras.cartasDaMaoPorVez].sort((a, b) => b - a)) {
    if (n > mao.length) continue;
    const rec = (de: number, atual: Carta[]) => {
      if (atual.length === n) {
        if (n === 1 || !regras.cartasDaMaoFormamJogo || jogoValido(atual, regras)) juntar([...atual]);
        return;
      }
      for (let i = de; i < mao.length; i++) rec(i + 1, [...atual, mao[i]]);
    };
    rec(0, []);
  }

  // Do maior número de cartas para o menor: o primeiro tamanho que tiver jogada vence.
  // Para cada tamanho, vai aumentando o número de jogos que pode mexer (0, 1, 2, ... sem limite):
  // assim a jogada mais simples aparece primeiro e só no fim vêm as rearrumações gigantes.
  const buscador = new Buscador(mesaCartas, regras, relogio);
  const tamanhos = [...new Set(grupos.map((g) => g.length))].sort((a, b) => b - a);
  for (const n of tamanhos) {
    const doTamanho = grupos.filter((g) => g.length === n);
    for (const orcamento of [0, 1, 2, 3, 4, 6, 8, Infinity]) {
      const achadas: Array<{ baixadas: Carta[]; jogos: string[][] }> = [];
      for (const baixadas of doTamanho) {
        const jogos = buscador.tentar(baixadas, orcamento);
        if (jogos) achadas.push({ baixadas, jogos });
        if (relogio.acabou) break;
      }
      if (achadas.length > 0) {
        // Entre as que servem, a que deixa a melhor mão.
        const sobra = (b: Carta[]) => nota(contar(mao.filter((c) => !b.includes(c))));
        achadas.sort((a, b) => sobra(b.baixadas) - sobra(a.baixadas));
        const opcao = opcaoDaDivisao(inicio, achadas[0].baixadas, achadas[0].jogos);
        // Se o tempo acabou no meio desta rodada, pode haver jogada melhor que não deu tempo de olhar.
        return { completa: !relogio.acabou && !!opcao, opcao };
      }
      if (relogio.acabou) return { completa: false, opcao: null };
    }
  }
  return { completa: true, opcao: null };
}

/** Troca a divisão por tipos ("7-copas") pelas cartas de verdade, aproveitando os jogos que já estavam na mesa. */
function opcaoDaDivisao(inicio: Foto, baixadas: Carta[], divisao: string[][]): Opcao | null {
  const iguais = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const livres = [...inicio.mesa];
  const novos: Array<Carta[] | null> = divisao.map(() => null);
  const tiposDasBaixadas = baixadas.map(tipoDaCarta);

  // O primeiro jogo da divisão recebe as cartas da mão (o resto dele pode ser um jogo inteiro da mesa: "encostou").
  const resto = [...divisao[0]];
  for (const t of tiposDasBaixadas) resto.splice(resto.indexOf(t), 1);
  const antigoDoPrimeiro = livres.find((j) => iguais(j.cartas.map(tipoDaCarta), resto));
  if (antigoDoPrimeiro) {
    livres.splice(livres.indexOf(antigoDoPrimeiro), 1);
    novos[0] = [...antigoDoPrimeiro.cartas, ...baixadas];
  }
  // Jogos iguais aos que já estavam na mesa ficam como estão.
  for (let k = 1; k < divisao.length; k++) {
    const antigo = livres.find((j) => iguais(j.cartas.map(tipoDaCarta), divisao[k]));
    if (!antigo) continue;
    livres.splice(livres.indexOf(antigo), 1);
    novos[k] = antigo.cartas;
  }
  // O resto: monta com as cartas dos jogos que sobraram.
  const reserva = livres.flatMap((j) => j.cartas);
  const pegar = (t: string): Carta | null => {
    const i = reserva.findIndex((c) => tipoDaCarta(c) === t);
    return i < 0 ? null : reserva.splice(i, 1)[0];
  };
  for (let k = 0; k < divisao.length; k++) {
    if (novos[k]) continue;
    const cartas: Carta[] = [];
    const tipos = [...divisao[k]];
    if (k === 0) for (const b of baixadas) cartas.push(b), tipos.splice(tipos.indexOf(tipoDaCarta(b)), 1);
    for (const t of tipos) {
      const c = pegar(t);
      if (!c) return null; // não deveria acontecer
      cartas.push(c);
    }
    novos[k] = cartas;
  }
  const usadas = new Set(baixadas.map((c) => c.id));
  return {
    mexidos: inicio.mesa,
    novos: novos as Carta[][],
    usadas: baixadas.length,
    maoQueSobra: inicio.mao.filter((c) => !usadas.has(c.id)),
  };
}

/**
 * "Deixar o curinga solto": procura um lugar na mesa para o curinga da mão
 * (pode rearrumar a mesa). Devolve a jogada pronta só com o curinga, ou null se não há lugar.
 */
export function jogadaDoCuringa(p: Partida): JogadaIA | null {
  const curinga = p.inicioDaVez.mao.find((c) => c.curinga);
  if (!curinga || !p.regras.curinga.ativo) return null;
  const j = pensar(p.regras, { mao: [curinga], mesa: p.inicioDaVez.mesa }, 'dificil', p.proximoIdJogo, { dica: true });
  if (!j) return null;
  const foto: Foto = { mao: p.inicioDaVez.mao.filter((c) => c.id !== curinga.id), mesa: j.foto.mesa };
  return conferir(p.regras, p.inicioDaVez, foto).ok ? { ...j, foto } : null;
}

/** Como foi a última busca (para o diário): quanto tempo levou e se o tempo acabou antes. */
export let ultimaBusca = { ms: 0, tempoAcabou: false };

/** Nota da mão que sobra: primeiro o "futuro" das cartas, depois menos pontos. */
function notaDaSobra(regras: Regras): Desempate {
  return (sobra: Contagem) => {
    const cartas: Carta[] = [];
    for (const [tipo, n] of sobra) for (let i = 0; i < n; i++) cartas.push(cartaDoTipo(tipo));
    return potencial(cartas) * 1000 - pontosDaMao(cartas, regras);
  };
}

/** A opção "a" é melhor que a "b"? */
function melhorQue(a: Opcao, b: Opcao, otimizar: boolean, regras: Regras): boolean {
  if (a.usadas !== b.usadas) return a.usadas > b.usadas;
  if (!otimizar) return a.mexidos.length < b.mexidos.length; // prefere mexer menos na mesa
  // Difícil: no empate, deixa na mão as cartas com mais futuro e menos pontos.
  const fa = potencial(a.maoQueSobra);
  const fb = potencial(b.maoQueSobra);
  if (fa !== fb) return fa > fb;
  return pontosDaMao(a.maoQueSobra, regras) < pontosDaMao(b.maoQueSobra, regras);
}

/**
 * "Futuro" da mão: quantos pares de cartas podem virar jogo depois
 * (mesmo valor e naipes diferentes, ou mesmo naipe e valores próximos).
 */
export function potencial(mao: Carta[]): number {
  let n = 0;
  for (let i = 0; i < mao.length; i++) {
    for (let k = i + 1; k < mao.length; k++) {
      const a = mao[i];
      const b = mao[k];
      if (a.curinga || b.curinga) n += 1;
      else if (a.valor === b.valor && a.naipe !== b.naipe) n += 2;
      else if (a.naipe === b.naipe && a.valor !== b.valor && Math.abs(a.valor - b.valor) <= 2) n += 2;
    }
  }
  return n;
}

/** Quanto as cartas da mão têm a ver com esse jogo (mesmo valor, ou mesmo naipe por perto). */
function ligacao(jogo: Jogo, mao: Carta[]): number {
  // Um curinga na mesa pode ser levado para qualquer lugar: esse jogo sempre "conversa" com a mão.
  let nota = jogo.cartas.some((c) => c.curinga) ? 2 : 0;
  for (const c of mao) {
    if (c.curinga) {
      nota += 1;
      continue;
    }
    const liga = jogo.cartas.some((d) => {
      if (d.curinga) return false;
      if (d.valor === c.valor) return true;
      if (d.naipe !== c.naipe) return false;
      const dist = Math.abs(d.valor - c.valor);
      return dist <= 2 || 13 - dist <= 1; // perto, contando o Ás alto
    });
    if (liga) nota += 2;
  }
  return nota;
}

/** Todos os grupos de 1 até "max" itens da lista. */
function* grupos<T>(lista: T[], max: number): Generator<T[]> {
  function* rec(inicio: number, atual: T[]): Generator<T[]> {
    if (atual.length > 0) yield [...atual];
    if (atual.length === max) return;
    for (let i = inicio; i < lista.length; i++) {
      atual.push(lista[i]);
      yield* rec(i + 1, atual);
      atual.pop();
    }
  }
  yield* rec(0, []);
}

function tempoAcabou(o: Orcamento): boolean {
  return performance.now() > o.fim || o.passos <= 0;
}

/** Um pedaço do tempo que sobrou, para uma tentativa só não gastar tudo. */
function fatia(o: Orcamento, parte: number): Orcamento {
  const agora = performance.now();
  return { passos: 20000, fim: agora + Math.max(5, (o.fim - agora) * parte) };
}

/**
 * Transforma a opção escolhida em passos para a tela mostrar:
 * primeiro a rearrumação (se houver), depois as cartas encostadas, depois os jogos novos.
 */
function montarPassos(inicio: Foto, op: Opcao, proximoIdJogo: number): JogadaIA {
  const idsDaMao = new Set(inicio.mao.map((c) => c.id));
  let proximo = proximoIdJogo;
  const novoId = () => `j${proximo++}`;

  const intactos = inicio.mesa.filter((j) => !op.mexidos.includes(j));
  const encostados: Array<{ jogo: Jogo; cartas: Carta[] }> = [];
  const rearrumados: Jogo[] = [];
  const baixados: Jogo[] = [];
  const restantes = [...op.mexidos];

  for (const cartas of op.novos) {
    const daMesa = cartas.filter((c) => !idsDaMao.has(c.id));
    const daMao = cartas.filter((c) => idsDaMao.has(c.id));
    if (daMesa.length === 0) {
      baixados.push({ id: novoId(), cartas });
      continue;
    }
    // Ficou com todas as cartas de um jogo antigo e só ganhou cartas da mão? Então "encostou".
    const antigo = restantes.find((j) => j.cartas.length === daMesa.length && j.cartas.every((c) => daMesa.includes(c)));
    if (antigo) {
      restantes.splice(restantes.indexOf(antigo), 1);
      if (daMao.length === 0) intactos.push(antigo);
      else encostados.push({ jogo: antigo, cartas: daMao });
    } else {
      rearrumados.push({ id: '', cartas });
    }
  }
  // Cada jogo rearrumado herda o id do jogo antigo de onde veio a MAIORIA das suas cartas
  // (assim, na animação, só as cartas que realmente mudam de lugar se mexem).
  const pares: Array<{ novo: Jogo; antigo: Jogo; comuns: number }> = [];
  for (const novo of rearrumados) {
    for (const antigo of restantes) {
      const comuns = novo.cartas.filter((c) => antigo.cartas.includes(c)).length;
      if (comuns > 0) pares.push({ novo, antigo, comuns });
    }
  }
  pares.sort((a, b) => b.comuns - a.comuns);
  const usados = new Set<Jogo>();
  for (const { novo, antigo, comuns } of pares) {
    if (novo.id || usados.has(antigo) || comuns === 0) continue;
    novo.id = antigo.id;
    usados.add(antigo);
  }
  for (const j of rearrumados) if (!j.id) j.id = novoId();

  // Mantém os jogos na mesma posição de antes na mesa; os novos vão para o fim.
  const naOrdem = (mesa: Jogo[]) => {
    const pos = (j: Jogo) => {
      const i = inicio.mesa.findIndex((o) => o.id === j.id);
      return i === -1 ? Infinity : i;
    };
    return [...mesa].sort((a, b) => pos(a) - pos(b));
  };

  const passos: Passo[] = [];
  let mesa = naOrdem([...intactos, ...encostados.map((e) => e.jogo), ...rearrumados]);
  if (rearrumados.length > 0) {
    const usadas = rearrumados.flatMap((j) => j.cartas).filter((c) => idsDaMao.has(c.id));
    passos.push({ tipo: 'rearrumou', cartasDaMao: usadas, jogoIds: rearrumados.map((j) => j.id), mesa });
  }
  for (const e of encostados) {
    mesa = mesa.map((j) => (j.id === e.jogo.id ? { ...j, cartas: [...j.cartas, ...e.cartas] } : j));
    passos.push({ tipo: 'encostou', cartasDaMao: e.cartas, jogoIds: [e.jogo.id], mesa });
  }
  for (const b of baixados) {
    mesa = [...mesa, b];
    passos.push({ tipo: 'baixou', cartasDaMao: b.cartas, jogoIds: [b.id], mesa });
  }

  return { foto: { mao: op.maoQueSobra, mesa }, passos };
}
