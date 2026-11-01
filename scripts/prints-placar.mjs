// Prints do placar do campeonato: durante a partida (pílula em ordem) e no fim da rodada, com 2, 3 e 4 jogadores.
// Uso: com "npx vite --port 5199" rodando:  node scripts/prints-placar.mjs <pasta-de-saida>
import { chromium } from 'playwright';

const saida = process.argv[2] ?? '/tmp/mm-prints';
const URL = 'http://localhost:5199/';
const telas = { 'ipad-deitado': [1180, 820], 'ipad-em-pe': [820, 1180], 'iphone-em-pe': [440, 800], 'iphone-deitado': [956, 360] };

const MONTAR = async ({ n, fim }) => {
  const { novaPartida } = await import('/src/motor/partida.ts');
  const { criarRegras } = await import('/src/motor/regras.ts');
  const NA = { c: 'copas', o: 'ouros', e: 'espadas', p: 'paus' }, VA = { A: 1, J: 11, Q: 12, K: 13 };
  let k = 0;
  const c = (t) => ({ id: `${t}-${k++}`, curinga: false, naipe: NA[t.slice(-1)], valor: VA[t.slice(0, -1)] ?? Number(t.slice(0, -1)) });
  const cs = (s) => s.split(' ').map(c);
  const jogos = ['3e 4e 5e 6e', '9c 9p 9o', 'Jo Qo Ko', '7p 8p 9p 10p', '2c 3c 4c 5c', '5o 6o 7o 8o 9o'];
  const mesa = jogos.map((s, i) => ({ id: `j${i + 1}`, cartas: cs(s) }));
  const p0 = novaPartida(criarRegras({ adversarios: n - 1 }), 1);
  const maos = [cs('2c 5c 6c 7c 8e Ao'), cs('Kp Kp Ko'), cs('2p 3p'), cs('9o 4o 10p 7e')];
  const jogadores = p0.jogadores.map((j, i) => ({ ...j, mao: i === 1 && fim ? [] : maos[i] }));
  const pts = [18, 0, 12, 25].slice(0, n);
  const resultado = fim ? { vencedor: 1, pontos: pts, motivo: 'bateu' } : null;
  const partida = { ...p0, jogadores, mesa, monte: cs('2p 3p'), inicioDaVez: { mao: maos[0], mesa }, proximoIdJogo: 100, resultado };
  const totais = [35, 60, 18, 82].slice(0, n);
  const campeonato = { alvo: 100, totais, rodada: 2, contada: fim ? 'teste' : '' };
  localStorage.setItem('mexe-mexe:partida:v1', JSON.stringify({ id: 'teste', partida, ordenacao: 'naipe', ordemManual: [], novaCartaId: null, baixadasPeloComputador: [], campeonato, em: Date.now() }));
};

const b = await chromium.launch();
for (const [nome, [w, h]] of Object.entries(telas)) {
  for (const n of [2, 3, 4]) {
    for (const fim of [false, true]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 900 || h < 500, deviceScaleFactor: 1 });
      const pg = await ctx.newPage();
      pg.on('pageerror', (e) => console.log('ERRO', nome, n, e.message));
      await pg.goto(URL);
      await pg.evaluate(() => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ visual: 'idade', tutorialVisto: true })));
      await pg.goto(URL + '#');
      await pg.evaluate(MONTAR, { n, fim });
      await pg.evaluate(() => localStorage.setItem('mexe-mexe:tela', 'jogo'));
      await pg.reload();
      await pg.waitForTimeout(700);
      await pg.screenshot({ path: `${saida}/placar-${nome}-${n}j-${fim ? 'fim' : 'durante'}.png` });
      await ctx.close();
    }
  }
}
await b.close();
