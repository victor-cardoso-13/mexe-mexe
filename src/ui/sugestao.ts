/**
 * Janela "Dar sugestão" (Ajustes → Sugestão): a pessoa escreve e envia; o diário das últimas partidas vai junto.
 * Adaptada de `_modelo/src/ui/sugestao.ts`. Mock aprovado: scripts/mock-ajustes-sugestao.html.
 *
 * Fica numa camada PRÓPRIA por cima do jogo (fora do #app): o jogo se redesenha inteiro várias vezes
 * (vez do computador, girar o aparelho, online) e apagaria o texto que a pessoa está digitando.
 * A janela não conhece o Firebase (recebe `enviar`), então o jogo continua abrindo rápido e offline.
 */
import { MAX_SUGESTAO, validarSugestao } from '../motor/sugestao';

export interface OpcoesSugestao {
  /** A pessoa entrou numa conta com e-mail? Sem conta, a janela só explica e oferece "Entrar". */
  comConta: boolean;
  /** Manda o texto (já validado) para a nuvem; deve falhar com erro se não conseguir. */
  enviar: (texto: string) => Promise<void>;
  /** Transforma o erro numa frase em português simples (use `mensagemDeErro`). */
  erro: (e: unknown) => string;
  /** "Entrar" (sem conta): abre a janela da conta. */
  aoEntrar: () => void;
  /** Fechou. `enviou` = true depois do "Obrigado" ("Voltar ao jogo"). */
  aoFechar: (enviou: boolean) => void;
}

let camada: HTMLElement | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string) {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto; // textContent: nada do que a pessoa digita vira código
  return e;
}

function botao(texto: string, classe: string, acao: () => void) {
  const b = el('button', classe, texto);
  b.type = 'button';
  b.onclick = acao;
  return b;
}

export function fecharSugestao() {
  camada?.remove();
  camada = null;
}

export const sugestaoAberta = () => !!camada;

/** Abre a janela por cima de tudo. */
export function abrirSugestao(o: OpcoesSugestao) {
  fecharSugestao();
  camada = el('div', 'fundo-janela camada-sugestao');
  document.body.append(camada);
  if (o.comConta) desenharCaixa(camada, o);
  else desenharSemConta(camada, o);
}

function desenharSemConta(destino: HTMLElement, o: OpcoesSugestao) {
  const janela = el('div', 'janela janela-sugestao');
  const rodape = el('div', 'rodape-ajustes');
  rodape.append(
    botao('Voltar', 'grande secundario', () => { fecharSugestao(); o.aoFechar(false); }),
    botao('☁️ Entrar', 'grande', () => { fecharSugestao(); o.aoEntrar(); }),
  );
  janela.append(
    el('h2', '', '💬 Dar sugestão'),
    el('p', 'sug-texto', 'Para mandar uma sugestão, entre na sua conta (é de graça). Assim podemos responder no seu e-mail.'),
    rodape,
  );
  destino.replaceChildren(janela);
}

function desenharCaixa(destino: HTMLElement, o: OpcoesSugestao) {
  const janela = el('div', 'janela janela-sugestao cheia');
  const caixa = el('textarea', 'sug-caixa');
  caixa.maxLength = MAX_SUGESTAO;
  caixa.placeholder = 'Toque aqui e escreva…';
  caixa.setAttribute('aria-label', 'Sua sugestão');
  const contador = el('div', 'sug-contador', `0/${MAX_SUGESTAO}`);
  const aviso = el('p', 'sug-aviso-erro');
  aviso.hidden = true;
  aviso.setAttribute('role', 'alert');

  const vaiJunto = el('div', 'sug-vai-junto');
  const explica = el('span', '');
  explica.append(el('b', '', 'Vai junto o diário das últimas partidas.'), document.createElement('br'), 'Assim dá para ver as cartas e achar o problema.');
  vaiJunto.append(el('span', '', '📋'), explica);

  const enviar = botao('Enviar', 'grande', () => void mandar());
  enviar.disabled = true;
  const rodape = el('div', 'rodape-ajustes');
  rodape.append(botao('Voltar', 'grande secundario', () => { fecharSugestao(); o.aoFechar(false); }), enviar);

  janela.append(
    el('h2', '', '💬 O que podemos melhorar?'),
    el('p', 'sug-texto', 'Escreva do seu jeito. Pode ser uma ideia, um problema ou um elogio.'),
    caixa, contador, aviso, vaiJunto,
    el('p', 'sug-nota', 'Só a equipe do jogo lê. Vai junto o seu e-mail, para podermos responder.'),
    rodape,
  );
  destino.replaceChildren(janela);

  const atualizar = () => {
    contador.textContent = `${caixa.value.length}/${MAX_SUGESTAO}`;
    enviar.disabled = enviando || !validarSugestao(caixa.value).ok;
  };
  caixa.addEventListener('input', atualizar);

  let enviando = false;
  async function mandar() {
    const v = validarSugestao(caixa.value);
    if (!v.ok || enviando) return;
    enviando = true;
    enviar.textContent = 'Enviando…';
    aviso.hidden = true;
    atualizar();
    try {
      await o.enviar(v.texto);
      if (camada === destino) agradecer(destino, o);
    } catch (e) {
      // O texto continua na caixa: a pessoa só toca de novo.
      aviso.textContent = `${o.erro(e)} Seu texto continua aqui.`;
      aviso.hidden = false;
      enviar.textContent = 'Tentar de novo';
      enviando = false;
      atualizar();
    }
  }
}

function agradecer(destino: HTMLElement, o: OpcoesSugestao) {
  const janela = el('div', 'janela janela-sugestao');
  const rodape = el('div', 'rodape-ajustes');
  rodape.append(botao('Voltar ao jogo', 'grande', () => { fecharSugestao(); o.aoFechar(true); }));
  janela.append(
    el('div', 'emoji', '🧡'),
    el('h2', '', 'Obrigado!'),
    el('p', 'sug-texto', 'Recebemos a sua sugestão. Ela nos ajuda a deixar o jogo melhor.'),
    rodape,
  );
  destino.replaceChildren(janela);
}
