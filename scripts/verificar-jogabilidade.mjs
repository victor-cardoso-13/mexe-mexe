// Confere no navegador (iPhone/iPad simulados) as melhorias de jogabilidade.
// Uso: com "npx vite --port 5199" rodando:  node scripts/verificar-jogabilidade.mjs
// A mesa é MONTADA (de mentira) com 16 jogos para forçar a rolagem.
import { chromium } from 'playwright';

const URL = 'http://localhost:5199/';
const MONTAR = async (vezDoComputador) => {
  const { novaPartida } = await import('/src/motor/partida.ts');
  const { criarRegras } = await import('/src/motor/regras.ts');
  const NA = { c: 'copas', o: 'ouros', e: 'espadas', p: 'paus' }, VA = { A: 1, J: 11, Q: 12, K: 13 };
  let k = 0;
  const c = (t) => ({ id: `${t}-${k++}`, curinga: false, naipe: NA[t.slice(-1)], valor: VA[t.slice(0, -1)] ?? Number(t.slice(0, -1)) });
  const cs = (s) => s.split(' ').map(c);
  const jogos = ['3e 4e 5e 6e', '9c 9p 9o', 'Jo Qo Ko', '7p 8p 9p 10p', '4c 4e 4o', '2c 3c 4c 5c', 'Ap 2p 3p', '8o 8e 8c', '5o 6o 7o 8o 9o', 'Qe Ke Ae', '2e 3e 4e', '6c 7c 8c', 'Kc Kp Ko', '3o 4o 5o', '10c Jc Qc', '5p 6p 7p'];
  const mesa = jogos.map((s, i) => ({ id: `j${i + 1}`, cartas: cs(s) }));
  const mao = cs('2c 5c 6c 7c 8e Ao 4o 10p Kp');
  const maoPC = cs('8p Jc');
  const p0 = novaPartida(criarRegras(), 1);
  const partida = { ...p0, vez: vezDoComputador ? 1 : 0, jogadores: [{ ...p0.jogadores[0], mao }, { ...p0.jogadores[1], mao: maoPC }], mesa, monte: cs('2p 3p'), inicioDaVez: { mao: vezDoComputador ? maoPC : mao, mesa }, proximoIdJogo: 100 };
  localStorage.setItem('mexe-mexe:partida:v1', JSON.stringify({ id: 'teste', partida, ordenacao: 'naipe', ordemManual: [], novaCartaId: null, baixadasPeloComputador: [], em: Date.now() }));
};

let falhas = 0;
const confere = (ok, texto) => { console.log(`${ok ? '✔' : '✘'} ${texto}`); if (!ok) falhas++; };
const b = await chromium.launch();
const abrir = async (w, h, vezDoComputador) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 900 || h < 500, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => { console.log('ERRO', e.message); falhas++; });
  await pg.goto(URL);
  await pg.evaluate(() => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ visual: 'idade', tutorialVisto: true })));
  await pg.goto(URL + '#');
  await pg.evaluate(MONTAR, vezDoComputador);
  await pg.reload();
  await pg.getByText('Continuar partida').click();
  await pg.waitForTimeout(600);
  return { ctx, pg };
};
const tocar = async (pg, loc) => { const bx = await loc.boundingBox(); await pg.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height / 2); await pg.waitForTimeout(350); };
const medir = (pg) => pg.evaluate(() => {
  const m = document.querySelector('.mesa');
  return { rolavel: m.classList.contains('rolavel'), overflow: getComputedStyle(m).overflowY, topo: Math.round(m.scrollTop), cabe: m.clientHeight, total: m.scrollHeight, w: getComputedStyle(document.documentElement).getPropertyValue('--mesa-w').trim(),
    jogos: [...document.querySelectorAll('.mesa .jogo')].map((j) => Math.round(j.getBoundingClientRect().top)).join(',') };
});

// 1) Escolher cartas da mão não mexe em nada (rolagem, altura da mesa, posição dos jogos)
for (const [w, h] of [[440, 800], [390, 844], [956, 360]]) {
  const { ctx, pg } = await abrir(w, h, false);
  await pg.evaluate(() => { const m = document.querySelector('.mesa'); m.scrollTop = m.scrollHeight; });
  await pg.waitForTimeout(250);
  const antes = await medir(pg);
  for (const i of [1, 2, 3]) await tocar(pg, pg.locator('.mao .carta').nth(i));
  const depois = await medir(pg);
  confere(depois.rolavel && depois.overflow === 'auto', `${w}×${h}: mesa continua rolável com 3 cartas escolhidas`);
  confere(antes.topo === depois.topo && antes.cabe === depois.cabe && antes.total === depois.total && antes.jogos === depois.jogos,
    `${w}×${h}: rolagem, altura e posição dos jogos iguais (${antes.topo}/${antes.cabe}/${antes.total} → ${depois.topo}/${depois.cabe}/${depois.total})`);
  await ctx.close();
}

// 2) "+" com área de toque maior: tocar no canto de cima da última carta cai no "+"
{
  const { ctx, pg } = await abrir(440, 800, false);
  await tocar(pg, pg.locator('.mao .carta').nth(1)); // escolhe uma carta da mão
  const alvo = await pg.evaluate(() => {
    const jogo = [...document.querySelectorAll('.mesa .jogo')].find((j) => j.dataset.destino === 'jogo:j4');
    const mais = jogo.querySelector('.mais-aqui').getBoundingClientRect();
    const cartas = jogo.querySelectorAll('.carta'); const ultima = cartas[cartas.length - 1].getBoundingClientRect();
    // ponto na última carta, ~16 px abaixo do centro da bolinha (fora da bolinha, dentro da área de toque)
    const x = mais.left + mais.width / 2 - 6, y = mais.bottom + 5;
    return { x, y, naCarta: x > ultima.left && x < ultima.right && y > ultima.top && y < ultima.bottom, isMais: !!document.elementFromPoint(x, y)?.closest('.mais-aqui') };
  });
  confere(alvo.naCarta && alvo.isMais, '"+": um toque na parte de cima da última carta (fora da bolinha) cai no "+"');
  const abaixo = await pg.evaluate(() => {
    const jogo = [...document.querySelectorAll('.mesa .jogo')].find((j) => j.dataset.destino === 'jogo:j4');
    const cartas = jogo.querySelectorAll('.carta'); const u = cartas[cartas.length - 1].getBoundingClientRect();
    const x = u.left + u.width * 0.6, y = u.bottom - 6;
    return !!document.elementFromPoint(x, y)?.closest('[data-carta]');
  });
  confere(abaixo, 'a parte de baixo da última carta continua sendo a carta');
  await ctx.close();
}

// 3) Vez do computador: nada passa por cima da mão e o jogo onde ele joga fica à vista
{
  const { ctx, pg } = await abrir(440, 800, true);
  let vazou = 0, visivel = false, vistaFinal = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 14000) {
    const r = await pg.evaluate(() => {
      const mao = document.querySelector('.area-mao').getBoundingClientRect();
      const mesa = document.querySelector('.mesa').getBoundingClientRect();
      const vazando = [...document.querySelectorAll('.mesa .carta')].some((c) => { const r = c.getBoundingClientRect(); return r.width && r.bottom > mesa.bottom + 2 && r.top < mao.bottom && r.top > mesa.bottom - 1 && getComputedStyle(c).visibility !== 'hidden' && (() => { const e = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + 4, innerHeight - 1)); return !!e?.closest('.mesa'); })(); });
      const j16 = document.querySelector('.mesa [data-destino="jogo:j16"]'); let ok = false;
      if (j16) { const r = j16.getBoundingClientRect(); ok = r.top >= mesa.top - 1 && r.bottom <= mesa.bottom + 1; }
      return { vazando, ok, ativo: window.__e.computadorJogando };
    });
    if (r.vazando) vazou++;
    if (r.ok && r.ativo) visivel = true;
    if (!r.ativo) break;
    await pg.waitForTimeout(80);
  }
  confere(vazou === 0, 'vez do computador: nenhuma carta da mesa aparece por cima da mão');
  confere(visivel, 'vez do computador: o último jogo (onde ele joga) fica à vista durante a jogada');
  vistaFinal = await medir(pg);
  confere(vistaFinal.rolavel, 'depois da vez dele a mesa continua rolável');
  await ctx.close();
}

// 4) Tamanho das cartas: não encolhe nem pula ao escolher/soltar carta (iPad também)
for (const [w, h] of [[1180, 820], [820, 1180]]) {
  const { ctx, pg } = await abrir(w, h, false);
  const antes = await medir(pg);
  await tocar(pg, pg.locator('.mao .carta').nth(1));
  const depois = await medir(pg);
  confere(antes.w === depois.w && antes.jogos === depois.jogos, `${w}×${h}: escolher carta não muda o tamanho nem a fileira dos jogos (cartas ${antes.w})`);
  await ctx.close();
}
// 5) A mão se reordena sempre que muda; arrastar dentro da mão vale como ordem manual só até a próxima mudança
{
  const { ctx, pg } = await abrir(440, 800, false);
  await pg.evaluate(() => { window.__e.ordenacao = 'manual'; window.__e.ordemManual = window.__e.partida.jogadores[0].mao.map((c) => c.id).reverse(); window.__desenhar(); });
  const ordem = () => pg.evaluate(() => [...document.querySelectorAll('.mao .carta')].map((c) => c.dataset.carta).join(','));
  const manual = await ordem();
  await tocar(pg, pg.locator('.mao .carta').nth(1)); // só escolher não muda nada
  confere((await pg.evaluate(() => window.__e.ordenacao)) === 'manual' && (await ordem()) === manual, 'só escolher uma carta não mexe na ordem manual');
  await tocar(pg, pg.locator('.mao .carta').nth(1)); // tira a escolha
  await pg.locator('[data-acao="comprar"]').click(); // a mão muda (carta nova)
  await pg.waitForTimeout(500);
  const depois = await pg.evaluate(() => ({ o: window.__e.ordenacao, m: window.__e.ordemManual.length }));
  confere(depois.o === 'naipe' && depois.m === 0, 'mudou a mão (comprou): voltou para a ordem automática (por naipe)');
  await ctx.close();
}
await b.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
