// Prints do sorteio de quem começa e dos selos "NOVA". Uso: com "npx vite --port 5199" rodando: node scripts/prints-sorteio.mjs prints
import { chromium } from 'playwright';
const saida = process.argv[2] ?? 'prints';
const URL = process.env.URL ?? 'http://localhost:5199/';
const telas = { 'ipad': [1180, 820], 'iphone': [390, 844], 'iphone-deitado': [956, 360] };
const b = await chromium.launch();
for (const [nome, [w, h]] of Object.entries(telas)) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.addInitScript(() => {
    if (sessionStorage.getItem('feito')) return;
    sessionStorage.setItem('feito', '1');
    localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ nivel: 'facil', curinga: false, adversarios: 2, quatroCores: false, velocidade: 'devagar', animacoes: true, visual: 'idade', tutorialVisto: true, modo: 'campeonato', sons: false }));
  });
  await pg.goto(URL);
  await pg.click('[data-acao="pedirNova"]');
  await pg.click('[data-acao="comecarComoEscolhido"]');
  await pg.waitForSelector('.janela-sorteio');
  await pg.screenshot({ path: `${saida}/sorteio-1-${nome}.png` });
  await pg.click('[data-acao="sorteioVirar"]');
  await pg.screenshot({ path: `${saida}/sorteio-2-${nome}.png` });
  let guarda = 0;
  while ((await pg.$('[data-acao="sorteioOutra"]')) && guarda++ < 10) { await pg.click('[data-acao="sorteioOutra"]'); await pg.click('[data-acao="sorteioVirar"]'); }
  await pg.screenshot({ path: `${saida}/sorteio-3-${nome}.png` });
  console.log(nome, await pg.textContent('.janela-sorteio h2'));
  await ctx.close();
}
await b.close();
