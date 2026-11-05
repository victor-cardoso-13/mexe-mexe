/**
 * Como mostrar um jogo da mesa que NÃO vale (vermelho): em pedaços, com um vão entre eles,
 * para a pessoa ver onde separar. Mock aprovado: scripts/mock-jogo-errado.html (proposta B + coringa).
 *
 * Regras (do Victor):
 * 1. Primeiro os pedaços que JÁ são jogo só com cartas normais (o máximo de cartas possível).
 *    Um jogo inteiro sem coringa nunca é desfeito por causa do coringa (ex.: 7♥ 7♠ 7♣ | 5♣ | 🃏).
 * 2. Depois, o coringa só entra num jogo formado com as cartas que SOBRARAM (ex.: 6 7 🃏 9 | 9;
 *    7♥ 7♣ 5♣ 🃏 vira 5♣ 🃏 7♣ | 7♥ — a trinca já tinha se desfeito).
 * 3. O que sobra fica em ordem (naipe, número) com vão onde a sequência quebra; coringa solto vai sozinho no fim.
 */
import { NAIPES, type Carta, type CartaNormal } from './cartas';
import type { Regras } from './regras';
import { jogoValido, ordemParaMostrar } from './validacao';

const LIMITE_DE_PASSOS = 50_000; // a busca é pequena (jogo de mesa), mas nunca trava a tela

const ordemNatural = (a: CartaNormal, b: CartaNormal) => NAIPES.indexOf(a.naipe) - NAIPES.indexOf(b.naipe) || a.valor - b.valor;

/** Jogos possíveis só com cartas normais: trincas (subconjuntos do mesmo número) e sequências (trechos de um naipe). */
function candidatos(normais: CartaNormal[], regras: Regras): CartaNormal[][] {
  const lista: CartaNormal[][] = [];
  const vistos = new Set<string>();
  const juntar = (g: CartaNormal[]) => {
    const chave = g.map((c) => c.id).sort().join(',');
    if (g.length >= 3 && !vistos.has(chave) && jogoValido(g, regras)) {
      vistos.add(chave);
      lista.push(g);
    }
  };
  // Trincas: todos os grupos (de 3 ou mais) do mesmo número.
  const porValor = new Map<number, CartaNormal[]>();
  for (const c of normais) porValor.set(c.valor, [...(porValor.get(c.valor) ?? []), c]);
  for (const grupo of porValor.values()) {
    if (grupo.length < 3 || grupo.length > 10) continue;
    for (let m = 1; m < 1 << grupo.length; m++) juntar(grupo.filter((_, i) => m & (1 << i)));
  }
  // Sequências: cada trecho seguido de um naipe (Ás embaixo ou em cima), com a 1ª ou a 2ª cópia de cada carta.
  for (const naipe of NAIPES) {
    const doNaipe = normais.filter((c) => c.naipe === naipe);
    const copias = (v: number) => doNaipe.filter((c) => c.valor === (v === 14 ? 1 : v));
    for (let ini = 1; ini <= 12; ini++) {
      for (let fim = ini + 2; fim <= 14; fim++) {
        const valores = Array.from({ length: fim - ini + 1 }, (_, i) => ini + i);
        if (valores.some((v) => copias(v).length === 0)) break;
        for (const k of [0, 1]) {
          if (valores.every((v) => copias(v)[k])) juntar(valores.map((v) => copias(v)[k]));
        }
      }
    }
  }
  return lista;
}

/** Escolhe jogos sem cartas em comum que cubram o MÁXIMO de cartas (no empate, o primeiro achado, de cartas mais baixas). */
function melhorCobertura(cartas: CartaNormal[], jogos: CartaNormal[][]): CartaNormal[][] {
  const ordenadas = [...cartas].sort(ordemNatural);
  const comCarta = new Map<string, CartaNormal[][]>();
  for (const c of ordenadas) comCarta.set(c.id, jogos.filter((j) => j.some((x) => x.id === c.id)));
  let melhor: { cobertas: number; jogos: CartaNormal[][] } = { cobertas: 0, jogos: [] };
  let passos = 0;
  const usadas = new Set<string>();
  const buscar = (i: number, cobertas: number, escolhidos: CartaNormal[][]) => {
    if (++passos > LIMITE_DE_PASSOS) return;
    while (i < ordenadas.length && usadas.has(ordenadas[i].id)) i++;
    if (cobertas > melhor.cobertas) melhor = { cobertas, jogos: [...escolhidos] };
    if (i >= ordenadas.length) return;
    const restantes = ordenadas.slice(i).filter((c) => !usadas.has(c.id)).length;
    if (cobertas + restantes <= melhor.cobertas) return; // não dá para melhorar
    const carta = ordenadas[i];
    for (const jogo of comCarta.get(carta.id)!) {
      if (jogo.some((c) => usadas.has(c.id))) continue;
      for (const c of jogo) usadas.add(c.id);
      escolhidos.push(jogo);
      buscar(i + 1, cobertas + jogo.length, escolhidos);
      escolhidos.pop();
      for (const c of jogo) usadas.delete(c.id);
    }
    usadas.add(carta.id); // esta carta fica de fora
    buscar(i + 1, cobertas, escolhidos);
    usadas.delete(carta.id);
  };
  buscar(0, 0, []);
  return melhor.jogos;
}

/** Com o que sobrou + os coringas: o maior jogo que der (no empate, com menos coringas). Repete enquanto achar. */
function jogosComCoringa(sobra: CartaNormal[], coringas: Carta[], regras: Regras) {
  const jogos: Carta[][] = [];
  let livres = [...coringas];
  let resto = [...sobra];
  while (livres.length && resto.length >= 2 && resto.length <= 12) {
    let achado: { normais: CartaNormal[]; k: number } | null = null;
    for (let m = 1; m < 1 << resto.length; m++) {
      const normais = resto.filter((_, i) => m & (1 << i));
      if (normais.length < 2 || (achado && normais.length < achado.normais.length)) continue;
      for (let k = 1; k <= livres.length; k++) {
        if (achado && normais.length === achado.normais.length && k >= achado.k) break;
        if (jogoValido([...normais, ...livres.slice(0, k)], regras)) { achado = { normais, k }; break; }
      }
    }
    if (!achado) break;
    const usadas = new Set(achado.normais.map((c) => c.id));
    jogos.push([...achado.normais, ...livres.slice(0, achado.k)]);
    livres = livres.slice(achado.k);
    resto = resto.filter((c) => !usadas.has(c.id));
  }
  return { jogos, resto, livres };
}

/** O que sobrou, em ordem, cortado onde a sequência quebra (número repetido, buraco ou outro naipe). */
function pedacosDaSobra(sobra: CartaNormal[]): CartaNormal[][] {
  if (sobra.length > 1 && sobra.every((c) => c.valor === sobra[0].valor)) return [[...sobra].sort(ordemNatural)];
  const pedacos: CartaNormal[][] = [];
  for (const c of [...sobra].sort(ordemNatural)) {
    const atual = pedacos[pedacos.length - 1];
    const ultima = atual?.[atual.length - 1];
    if (ultima && ultima.naipe === c.naipe && c.valor === ultima.valor + 1) atual.push(c);
    else pedacos.push([c]);
  }
  return pedacos;
}

/** Os pedaços de um jogo que não vale, na ordem de mostrar (um vão entre cada pedaço). */
export function pedacosDoJogoErrado(cartas: Carta[], regras: Regras): Carta[][] {
  const normais = cartas.filter((c): c is CartaNormal => !c.curinga);
  const coringas = cartas.filter((c) => c.curinga);
  const inteiros = normais.length <= 20 ? melhorCobertura(normais, candidatos(normais, regras)) : [];
  const nosInteiros = new Set(inteiros.flat().map((c) => c.id));
  const sobra = normais.filter((c) => !nosInteiros.has(c.id));
  const comCoringa = jogosComCoringa(sobra, coringas, regras);
  const primeira = (j: Carta[]) => j.find((c): c is CartaNormal => !c.curinga)!;
  const jogos = [...inteiros, ...comCoringa.jogos]
    .map((j) => ordemParaMostrar(j, regras))
    .sort((a, b) => ordemNatural(primeira(a), primeira(b)));
  const pedacos: Carta[][] = [...jogos, ...pedacosDaSobra(comCoringa.resto)];
  if (comCoringa.livres.length) pedacos.push(comCoringa.livres);
  return pedacos;
}
