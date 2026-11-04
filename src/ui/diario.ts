/**
 * Diário do jogo: guarda as últimas jogadas e dicas, com a mão e a mesa do momento.
 * Serve para investigar problemas ("a dica não achou o K", "o computador fez algo estranho").
 * Fica no aparelho. Em Ajustes dá para baixar o arquivo; e ele vai junto quando a pessoa manda uma sugestão.
 */
import { nomeDaCarta, type Carta } from '../motor/cartas';
import type { Jogo } from '../motor/partida';

const CHAVE = 'mexe-mexe:diario:v1';
const MAXIMO = 80; // só as últimas anotações

export interface Anotacao {
  hora: string;
  evento: string;
  [campo: string]: unknown;
}

export const textoCartas = (cartas: Carta[]) => cartas.map(nomeDaCarta).join(' ');
export const textoMesa = (mesa: Jogo[]) => mesa.map((j) => textoCartas(j.cartas));

export function lerDiario(): Anotacao[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as Anotacao[];
  } catch {
    return [];
  }
}

export function anotar(evento: string, dados: Record<string, unknown> = {}) {
  try {
    const diario = lerDiario();
    diario.push({ hora: new Date().toISOString(), evento, ...dados });
    localStorage.setItem(CHAVE, JSON.stringify(diario.slice(-MAXIMO)));
  } catch {
    // Sem espaço: o jogo continua, só não anota.
  }
}

// Casos em que a dica ficou atrás do que o jogador achou. Guardados à parte (o diário normal apaga os antigos).
const CHAVE_PERDEU = 'mexe-mexe:dica-perdeu:v1';
const MAXIMO_PERDEU = 30;

export function lerDicasPerdidas(): Anotacao[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_PERDEU) ?? '[]') as Anotacao[];
  } catch {
    return [];
  }
}

export function guardarDicaPerdeu(dados: Record<string, unknown>) {
  try {
    const lista = lerDicasPerdidas();
    lista.push({ hora: new Date().toISOString(), evento: 'dica perdeu', ...dados });
    localStorage.setItem(CHAVE_PERDEU, JSON.stringify(lista.slice(-MAXIMO_PERDEU)));
  } catch {
    // Sem espaço: o jogo continua.
  }
}

const conteudo = (diario: Anotacao[], perdidas: Anotacao[]) =>
  ({ jogo: 'mexe-mexe', baixadoEm: new Date().toISOString(), aparelho: navigator.userAgent, diario, dicasQuePerderam: perdidas });

/** Limite do diário que vai junto com a sugestão (o mesmo das regras do Firebase, coleção `sugestoes`). */
export const MAX_DIARIO_SUGESTAO = 250_000;

/**
 * O diário numa linha só, para ir junto com a sugestão. Se passar do limite, tira as anotações
 * mais antigas (primeiro do diário, depois das dicas perdidas) até caber.
 */
export function diarioParaEnviar(limite = MAX_DIARIO_SUGESTAO, diario = lerDiario(), perdidas = lerDicasPerdidas()): string {
  let d = [...diario];
  let p = [...perdidas];
  let texto = JSON.stringify(conteudo(d, p));
  while (texto.length > limite && (d.length || p.length)) {
    const corte = Math.max(1, Math.ceil((d.length || p.length) / 5)); // tira 20% de cada vez
    if (d.length) d = d.slice(corte);
    else p = p.slice(corte);
    texto = JSON.stringify(conteudo(d, p));
  }
  return texto.length > limite ? JSON.stringify(conteudo([], [])) : texto;
}

/** Baixa o diário como arquivo (vai para a pasta Downloads no computador). */
export function baixarDiario() {
  const texto = JSON.stringify(conteudo(lerDiario(), lerDicasPerdidas()), null, 2);
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mexe-mexe-diario.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
