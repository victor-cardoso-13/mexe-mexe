/**
 * Segurança da tela. REGRA: todo texto que veio de uma pessoa (nome, apelido, código de sala,
 * e-mail…) ou da nuvem passa por `escapar()` antes de entrar num `innerHTML`.
 * Assim, um nome como  <img onerror=…>  aparece como texto e nunca roda como código.
 * Texto fixo escrito por nós no código não precisa.
 */
const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapar(texto: unknown): string {
  return String(texto ?? '').replace(/[&<>"']/g, c => ENTIDADES[c]!);
}
