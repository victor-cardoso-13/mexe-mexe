// Prints da mesa MUITO cheia rolada no meio (borda de madeira) + Ajustes. Uso: node scripts/prints-rolagem.mjs <pasta>
import { chromium } from 'playwright';
const saida = process.argv[2] ?? 'prints/rolagem';
const URL = process.env.URL ?? 'http://localhost:5199/';
const MONTAR = async () => {
  const { novaPartida } = await import('/src/motor/partida.ts');
  const { criarRegras } = await import('/src/motor/regras.ts');
  const NA = { c: 'copas', o: 'ouros', e: 'espadas', p: 'paus' }, VA = { A: 1, J: 11, Q: 12, K: 13 };
  let k = 0;
  const c = (t) => ({ id: `${t}-${k++}`, curinga: false, naipe: NA[t.slice(-1)], valor: VA[t.slice(0, -1)] ?? Number(t.slice(0, -1)) });
  const cs = (s) => s.split(' ').map(c);
  const jogos = ['3e 4e 5e 6e', '9c 9p 9o', 'Jo Qo Ko', '7p 8p 9p 10p', '4c 4e 4o 4p', '2c 3c 4c 5c', 'Ap 2p 3p', '8o 8e 8c',
    '5o 6o 7o 8o 9o', 'Qe Ke Ae', '10c Jc Qc Kc', '6p 6c 6o', '2o 3o 4o', '7e 8e 9e 10e', 'Kp Ko Ke', '5p 5c 5e', '9e 10e Je', 'Ac Ao Ae'];
  const mesa = jogos.map((s, i) => ({ id: `j${i + 1}`, cartas: cs(s) }));
  const mao = cs('2c 5c 6c 7c 8e Ao 4o 10p Kp');
  const p0 = novaPartida(criarRegras(), 1);
  const partida = { ...p0, jogadores: [{ ...p0.jogadores[0], mao }, { ...p0.jogadores[1], mao: cs('Kp Kp Ko 2p 3p 4p 9o') }], mesa, inicioDaVez: { mao, mesa }, proximoIdJogo: 100 };
  localStorage.setItem('mexe-mexe:partida:v1', JSON.stringify({ id: 'teste', partida, ordenacao: 'naipe', ordemManual: [], novaCartaId: null, baixadasPeloComputador: [], em: Date.now() }));
};
const b = await chromium.launch();
for (const [nome, w, h] of [['iphone-em-pe', 390, 844], ['iphone-deitado', 956, 360], ['ipad-deitado', 1180, 820]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 900 || h < 500 });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('ERRO', nome, e.message));
  await pg.goto(URL);
  await pg.evaluate(() => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ visual: 'idade', tutorialVisto: true })));
  await pg.evaluate(MONTAR);
  await pg.reload();
  await pg.getByText('Continuar partida').click({ timeout: 2000 }).catch(() => {});
  await pg.waitForTimeout(600);
  await pg.evaluate(() => { const m = document.querySelector('.mesa'); if (m) m.scrollTop = 120; });
  await pg.waitForTimeout(200);
  await pg.screenshot({ path: `${saida}/${nome}-mesa-rolada.png` });
  await pg.locator('[data-acao="abrirMenu"]').click();
  await pg.waitForTimeout(200);
  await pg.locator('.janela [data-acao="abrirAjustes"]').click();
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: `${saida}/${nome}-ajustes.png` });
  await ctx.close();
}
await b.close();
