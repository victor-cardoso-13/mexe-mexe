// Confere se dá para ARRASTAR cartas que estão na mesa. Uso: node scripts/testar-arrastar-mesa.mjs  (com vite na 5199)
import { chromium } from 'playwright';
const URL = 'http://localhost:5199/';
const MONTAR = async () => {
  const { novaPartida } = await import('/src/motor/partida.ts');
  const { criarRegras } = await import('/src/motor/regras.ts');
  const NA = { c: 'copas', o: 'ouros', e: 'espadas', p: 'paus' }, VA = { A: 1, J: 11, Q: 12, K: 13 };
  let k = 0;
  const c = (t) => ({ id: `${t}-${k++}`, curinga: false, naipe: NA[t.slice(-1)], valor: VA[t.slice(0, -1)] ?? Number(t.slice(0, -1)) });
  const cs = (s) => s.split(' ').map(c);
  const cheia = location.hash === '#cheia';
  const jogos = [['3e 4e 5e 6e'], ['9c 9p 9o'], ['Jo Qo Ko'], ['7p 8p 9p 10p']];
  if (cheia) jogos.push(['4c 4e 4o 4p 4c 4e'], ['2c 3c 4c 5c'], ['Ap 2p 3p'], ['8o 8e 8c'], ['5o 6o 7o 8o 9o'], ['Qe Ke Ae']);
  const mesa = jogos.map(([s], i) => ({ id: `j${i + 1}`, cartas: cs(s) }));
  const mao = cs('2c 5c 6c 7c 8e Ao 4o 10p Kp');
  const p0 = novaPartida(criarRegras(), 1);
  const partida = { ...p0, jogadores: [{ ...p0.jogadores[0], mao }, { ...p0.jogadores[1], mao: cs('Kp Kp Ko 2p 3p 4p 9o') }], mesa, monte: cs('2p 3p'), inicioDaVez: { mao, mesa }, proximoIdJogo: 100 };
  localStorage.setItem('mexe-mexe:partida:v1', JSON.stringify({ id: 'teste', partida, ordenacao: 'naipe', ordemManual: [], novaCartaId: null, baixadasPeloComputador: [], em: Date.now() }));
};
const b = await chromium.launch();
for (const [nome, [w, h], touch] of [['ipad', [1180, 820], true], ['iphone', [390, 844], true]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 900 });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('ERRO', e.message));
  await pg.goto(URL);
  await pg.evaluate(() => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ tutorialVisto: true })));
  await pg.goto(URL + (process.env.CHEIA ? '#cheia' : '#'));
  await pg.evaluate(MONTAR);
  await pg.reload();
  await pg.getByText('Continuar partida').click({ timeout: 2000 }).catch(() => {});
  await pg.waitForTimeout(500);
  const conta = () => pg.evaluate(() => [...document.querySelectorAll('.mesa .jogo')].map((j) => j.querySelectorAll('[data-carta]').length).join(','));
  console.log(nome, 'mesa antes:', await conta());
  const carta = pg.locator('.mesa .jogo').nth(0).locator('[data-carta]').nth(3); // última do 1º jogo
  const c = await carta.boundingBox();
  const novo = null; console.log(' rolável:', await pg.locator('.mesa.rolavel').count());
  console.log(' carta', JSON.stringify(c), 'vazio', JSON.stringify(novo));
  // arrasta com o DEDO (toque de verdade, pelo protocolo do Chrome)
  const cdp = await ctx.newCDPSession(pg);
  const toque = (tipo, x, y) => cdp.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: tipo === 'touchEnd' ? [] : [{ x, y }] });
  const x0 = c.x + c.width / 2, y0 = c.y + c.height / 2;
  const alvo = await pg.locator('.mesa .vazio').first().boundingBox();
  await toque('touchStart', x0, y0);
  if (process.env.SEGURAR) await pg.waitForTimeout(350);
  for (let i = 1; i <= 15; i++) await toque('touchMove', x0 + (alvo.x + alvo.width / 2 - x0) * i / 15, y0 + (alvo.y + alvo.height / 2 - y0) * i / 15);
  console.log(' dedo: fantasma:', await pg.locator('.fantasma').count());
  await toque('touchEnd', 0, 0);
  await pg.waitForTimeout(300);
  console.log(nome, 'mesa depois do dedo:', await conta(), '| aviso:', await pg.locator('.faixa .msg').innerText());
  await ctx.close();
}
await b.close();
