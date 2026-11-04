/**
 * Regras da "sugestão" (caixinha de feedback do jogo). Sem tela, sem Firebase: só conta e valida.
 * Os mesmos limites estão nas regras do servidor (Computador/firestore.rules, coleção `sugestoes`).
 */
export const MIN_SUGESTAO = 5;
export const MAX_SUGESTAO = 1000;

export type ResultadoSugestao = { ok: true; texto: string } | { ok: false; motivo: 'curta' | 'longa' };

/** Tira espaços das pontas e confere o tamanho. */
export function validarSugestao(bruto: string): ResultadoSugestao {
  const texto = bruto.trim();
  if (texto.length < MIN_SUGESTAO) return { ok: false, motivo: 'curta' };
  if (texto.length > MAX_SUGESTAO) return { ok: false, motivo: 'longa' };
  return { ok: true, texto };
}
