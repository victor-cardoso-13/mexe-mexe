// Prints de jogos errados (vermelhos) com o vão onde separar. Uso (com "npx vite --port 5199"): node scripts/prints-jogo-errado.mjs <pasta>
import { chromium } from 'playwright';
const saida = process.argv[2] ?? 'prints/jogo-errado';
const MONTAR = async () => {
  const { novaPartida } = await import('/src/motor/partida.ts');
  const { criarRegras } = await import('/src/motor/regras.ts');
  const NA = { c: 'copas', o: 'ouros', e: 'espadas', p: 'paus' }, VA = { A: 1, J: 11, Q: 12, K: 13 };
  let k = 0;
  const c = (t) => (t === '*' ? { id: `cor-${k++}`, curinga: true } : { id: `${t}-${k++}`, curinga: false, naipe: NA[t.slice(-1)], valor: VA[t.slice(0, -1)] ?? Number(t.slice(0, -1)) });
  const cs = (s) => s.split(' ').map(c);
  const jogos = ['8o 6o 7o 9o 8o', '5o 6o 8o 9o', '7c 9p 7e 7p', '9o 6o 7o * 9o', '7c * 7e 5p 7p', '3e * 9e', 'Jc Qc Kc'];
  const mesa = jogos.map((s, i) => ({ id: `j${i + 1}`, cartas: cs(s) }));
  const mao = cs('2c 5c 6c 7c 8e Ao 4o');
  const regras = criarRegras();
  const p0 = novaPartida({ ...regras, curinga: { ...regras.curinga, ativo: true } }, 1);
  const partida = { ...p0, jogadores: [{ ...p0.jogadores[0], mao }, { ...p0.jogadores[1], mao: cs('Kp 2p 3p') }], mesa, inicioDaVez: { mao, mesa: [] }, proximoIdJogo: 100 };
  localStorage.setItem('mexe-mexe:partida:v1', JSON.stringify({ id: 'teste', partida, ordenacao: 'naipe', ordemManual: [], novaCartaId: null, baixadasPeloComputador: [], em: Date.now() }));
};
const b = await chromium.launch();
for (const [nome, w, h] of [['ipad-deitado', 1180, 820], ['iphone-em-pe', 390, 844], ['iphone-deitado', 956, 360]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 900 || h < 500 });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('ERRO', nome, e.message));
  await pg.goto('http://localhost:5199/');
  await pg.evaluate(() => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ visual: 'idade', tutorialVisto: true })));
  await pg.evaluate(MONTAR);
  await pg.reload();
  await pg.getByText('Continuar partida').click({ timeout: 2000 }).catch(() => {});
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: `${saida}/${nome}.png` });
  await ctx.close();
}
await b.close();
