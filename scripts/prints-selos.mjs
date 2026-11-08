// Computador começa (sorteio) e selos NOVA. Uso: node scripts/prints-selos.mjs prints  (com vite na 5199)
import { chromium } from 'playwright';
const saida = process.argv[2] ?? 'prints';
const b = await chromium.launch();
for (const [nome, [w, h]] of Object.entries({ iphone: [390, 844], ipad: [1180, 820], 'iphone-deitado': [956, 360] })) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.addInitScript(() => {
    if (sessionStorage.getItem('feito')) return;
    sessionStorage.setItem('feito', '1');
    localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ nivel: 'facil', curinga: false, adversarios: 1, quatroCores: false, velocidade: 'rapido', animacoes: true, visual: 'idade', tutorialVisto: true, modo: 'campeonato', sons: false }));
  });
  await pg.goto('http://localhost:5199/');
  let tentativas = 0, comeca = false;
  while (!comeca && tentativas++ < 12) {
    await pg.click('[data-acao="pedirNova"]').catch(() => {});
    await pg.click('[data-acao="comecarComoEscolhido"]').catch(() => {});
    await pg.waitForSelector('.janela-sorteio');
    await pg.click('[data-acao="sorteioVirar"]');
    while (await pg.$('[data-acao="sorteioOutra"]')) { await pg.click('[data-acao="sorteioOutra"]'); await pg.click('[data-acao="sorteioVirar"]'); }
    comeca = (await pg.textContent('.janela-sorteio h2')).startsWith('Adversário');
    await pg.click('[data-acao="sorteioFechar"]');
    if (!comeca) { await pg.evaluate(() => localStorage.removeItem('mexe-mexe:partida:v1')); await pg.goto('http://localhost:5199/'); }
  }
  await pg.waitForFunction(() => document.querySelector('.carta.nova, .carta.do-computador'), null, { timeout: 40000 }).catch(() => {});
  await pg.waitForTimeout(4000);
  await pg.screenshot({ path: `${saida}/selos-${nome}.png` });
  console.log(nome, 'comecou o computador:', comeca, 'selos:', await pg.$$eval('.carta.nova, .carta.do-computador', (l) => l.length));
  await ctx.close();
}
await b.close();
