// Mostra os selos NOVA (azul e laranja) numa mão de teste. Uso: node scripts/prints-selo-nova.mjs prints
import { chromium } from 'playwright';
const saida = process.argv[2] ?? 'prints';
const b = await chromium.launch();
for (const [nome, [w, h]] of Object.entries({ iphone: [390, 844], ipad: [1180, 820], 'iphone-deitado': [956, 360] })) {
  const pg = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: true })).newPage();
  await pg.addInitScript(() => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ nivel: 'facil', curinga: false, adversarios: 1, quatroCores: false, velocidade: 'rapido', animacoes: true, visual: 'idade', tutorialVisto: true, modo: 'casual', sons: false })));
  await pg.goto('http://localhost:5199/');
  await pg.click('[data-acao="pedirNova"]');
  await pg.click('[data-acao="comecarComoEscolhido"]');
  await pg.waitForSelector('.mao .carta');
  await pg.evaluate(() => { const c = document.querySelectorAll('.mao .carta'); c[1].classList.add('nova'); c[3].classList.add('do-computador'); });
  await pg.screenshot({ path: `${saida}/selo-nova-${nome}.png` });
}
await b.close();
