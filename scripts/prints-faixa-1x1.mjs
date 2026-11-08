// Mostra a faixa "Adversário ... Sua vez" no 1 contra 1. Uso: com vite na 5199: node scripts/prints-faixa-1x1.mjs prints
import { chromium } from 'playwright';
const saida = process.argv[2] ?? 'prints';
const b = await chromium.launch();
for (const [nome, [w, h]] of Object.entries({ 'iphone-390': [390, 844], 'iphone-440': [440, 800], ipad: [1180, 820] })) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const pg = await ctx.newPage();
  pg.on('pageerror', (er) => console.log('ERRO', er.message));
  await pg.addInitScript(() => {
    if (sessionStorage.getItem('feito')) return;
    sessionStorage.setItem('feito', '1');
    localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ nivel: 'facil', curinga: false, adversarios: 1, quatroCores: false, velocidade: 'normal', animacoes: false, visual: 'idade', tutorialVisto: true, modo: 'casual', sons: false }));
  });
  await pg.goto('http://localhost:5199/');
  await pg.click('[data-acao="pedirNova"]');
  await pg.click('[data-acao="comecarComoEscolhido"]');
  await pg.waitForSelector('.janela-sorteio');
  await pg.click('[data-acao="sorteioVirar"]');
  while (await pg.$('[data-acao="sorteioOutra"]')) { await pg.click('[data-acao="sorteioOutra"]'); await pg.click('[data-acao="sorteioVirar"]'); }
  await pg.click('[data-acao="sorteioFechar"]');
  const vistos = new Set();
  for (let t = 0; t < 8; t++) {
    await pg.waitForFunction(() => /Sua\svez/.test(document.querySelector('.faixa .msg')?.textContent ?? '') && !document.querySelector('.computador-jogando'), null, { timeout: 30000 });
    const msg = await pg.locator('.faixa .msg').innerText();
    const fonte = await pg.locator('.faixa .msg').evaluate((el) => getComputedStyle(el).fontSize);
    if (!vistos.has(msg.replace(/[0-9AKQJ♥♦♠♣ ]+/g, '#'))) { vistos.add(msg.replace(/[0-9AKQJ♥♦♠♣ ]+/g, '#')); await pg.screenshot({ path: `${saida}/faixa-${nome}-${vistos.size}.png` }); }
    console.log(nome, '|', msg, '|', fonte, '| botão:', await pg.locator('[data-acao="rever"]').count(), '| selos laranja:', await pg.locator('.mesa .carta.do-computador').count());
    await pg.click('[data-acao="comprar"]');
    await pg.waitForTimeout(400);
  }
  // frase bem longa: confere que a letra encolhe e cabe
  const r = await pg.evaluate(() => {
    const msg = document.querySelector('.faixa .msg'); const faixa = msg.parentElement;
    msg.classList.add('ajustar'); msg.textContent = 'Adversário abaixou 10♥ 10♣ 10♦ 10♠ 10♥ 10♣ 10♦ 10♠. Sua vez';
    msg.style.fontSize = '';
    const st = getComputedStyle(faixa); const lim = faixa.clientHeight - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
    let t = parseFloat(getComputedStyle(msg).fontSize); const ini = t;
    while (t > 13 && msg.getBoundingClientRect().height > lim + .5) { t--; msg.style.fontSize = t + 'px'; }
    return { ini, fim: t, altura: msg.getBoundingClientRect().height, limite: lim };
  });
  console.log(nome, 'frase longa:', JSON.stringify(r));
  await ctx.close();
}
await b.close();
