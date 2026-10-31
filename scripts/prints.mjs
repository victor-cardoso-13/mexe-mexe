// Tira prints do Mexe-Mexe nos aparelhos que importam (iPad e iPhones; nunca iPhone SE).
// Uso: com "npx vite --port 5199" rodando:  node scripts/prints.mjs <pasta-de-saida>
// A mesa dos prints é MONTADA (de mentira) para mostrar casos difíceis.
import { chromium } from 'playwright';

const saida = process.argv[2] ?? '/tmp/mm-prints';
const URL = 'http://localhost:5199/';
const telas = {
  'ipad-deitado': [1180, 820], 'ipad-em-pe': [820, 1180],
  'iphone-em-pe': [440, 800], 'iphone-deitado': [956, 360],
};

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
for (const visual of ['idade', 'bonito']) {
  for (const [nome, [w, h]] of Object.entries(telas)) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 900 || h < 500, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('ERRO', nome, visual, e.message));
    const foto = (arq) => pg.screenshot({ path: `${saida}/${visual}-${nome}-${arq}.png` });
    await pg.goto(URL);
    await pg.evaluate((v) => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ visual: v, tutorialVisto: true })), visual);
    for (const cheia of [false, true]) {
      await pg.goto(URL + (cheia ? '#cheia' : '#'));
      await pg.evaluate(MONTAR);
      await pg.reload();
      await pg.getByText('Continuar partida').click();
      await pg.waitForTimeout(500);
      const sufixo = cheia ? '-cheia' : '';
      await foto(`1-jogo${sufixo}`);
      // escolhe 5♥ 6♥ 7♥ (a carta é achada pelo texto do canto)
      for (const v of ['5', '6', '7']) await pg.locator('.mao .carta.naipe-copas', { has: pg.locator(`.valor:text-is("${v}")`) }).first().click();
      await pg.waitForTimeout(300);
      await foto(`2-tres-escolhidas${sufixo}`);
    }
    if (nome !== 'ipad-em-pe') {
      await pg.evaluate(() => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ visual: document.body.className, tutorialVisto: true })));
      await pg.getByRole('button', { name: /Ajustes/ }).first().click();
      await pg.waitForTimeout(200);
      await foto('3-ajustes');
      await pg.getByText('Como jogar').click();
      for (const passo of [1, 3, 5, 7]) {
        while ((await pg.locator('.contador').innerText()) !== `PASSO ${passo} DE 7`) await pg.getByRole('button', { name: /Próximo/ }).click();
        await foto(`4-tutorial-${passo}`);
      }
    }
    await ctx.close();
  }
}
await b.close();
