// Filma/printa a distribuição das cartas. Uso: com "npx vite --port 5199" rodando: node scripts/prints-distribuicao.mjs prints
import { chromium } from 'playwright';
const saida = process.argv[2] ?? 'prints';
const b = await chromium.launch();
for (const [nome, [w, h]] of Object.entries({ iphone: [390, 844], ipad: [1180, 820] })) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const pg = await ctx.newPage();
  pg.on('pageerror', (er) => console.log('ERRO', er.message));
  await pg.addInitScript(() => {
    if (sessionStorage.getItem('feito')) return;
    sessionStorage.setItem('feito', '1');
    localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ nivel: 'facil', curinga: false, adversarios: 2, quatroCores: false, velocidade: 'devagar', animacoes: true, visual: 'idade', tutorialVisto: true, modo: 'casual', sons: false }));
  });
  await pg.goto('http://localhost:5199/');
  await pg.click('[data-acao="pedirNova"]');
  await pg.click('[data-acao="comecarComoEscolhido"]');
  await pg.waitForSelector('.janela-sorteio');
  await pg.click('[data-acao="sorteioVirar"]');
  while (await pg.$('[data-acao="sorteioOutra"]')) { await pg.click('[data-acao="sorteioOutra"]'); await pg.click('[data-acao="sorteioVirar"]'); }
  const quem = await pg.textContent('.janela-sorteio h2');
  await pg.click('[data-acao="sorteioFechar"]');
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `${saida}/dist-1-${nome}.png` });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `${saida}/dist-2-${nome}.png` });
  await pg.waitForFunction(() => !document.querySelector('.carta.aguardando') && !document.querySelector('.deck-dist'), null, { timeout: 20000 });
  const cartas = await pg.$$eval('.mao .carta', (l) => l.length);
  console.log(nome, quem, '| cartas na mão no fim:', cartas, '| faixa:', await pg.locator('.faixa .msg').innerText());
  await pg.screenshot({ path: `${saida}/dist-3-${nome}.png` });
  await ctx.close();
}
await b.close();
