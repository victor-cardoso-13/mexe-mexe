// Confere no navegador (build de produção): a dica roda em segundo plano e "Fazer" mostra a animação.
// Uso: npm run build; npx vite preview --port 5198; node scripts/verificar-worker.mjs prints
import { chromium } from 'playwright';
const URL = 'http://localhost:5198/';
const pasta = process.argv[2] ?? 'prints';
const MONTAR = async () => {
  const NA = { c: 'copas', o: 'ouros', e: 'espadas', p: 'paus' }, VA = { A: 1, J: 11, Q: 12, K: 13 };
  let k = 0;
  const c = (t) => ({ id: `${t}-${k++}`, curinga: false, naipe: NA[t.slice(-1)], valor: VA[t.slice(0, -1)] ?? Number(t.slice(0, -1)) });
  const cs = (s) => s.split(' ').map(c);
  const jogos = ['3e 4e 5e 6e', '9c 9p 9o', '7p 8p 9p 10p', '4c 4e 4o', '2c 3c 4c 5c', '8o 8e 8c', '5o 6o 7o 8o 9o'];
  const mesa = jogos.map((s, i) => ({ id: `j${i + 1}`, cartas: cs(s) }));
  const mao = cs('6c Kp 10p');
  const base = JSON.parse(localStorage.getItem('base'));
  const partida = { ...base, vez: 0, jogadores: [{ ...base.jogadores[0], mao }, { ...base.jogadores[1], mao: cs('Jc Qp') }], mesa, monte: cs('2p 3p'), inicioDaVez: { mao, mesa }, historico: [], proximoIdJogo: 100 };
  localStorage.setItem('mexe-mexe:partida:v1', JSON.stringify({ id: 'teste', partida, ordenacao: 'naipe', ordemManual: [], novaCartaId: null, baixadasPeloComputador: [], em: Date.now() }));
};
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', (e) => erros.push(e.message));
pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
let trabalhadores = 0;
pg.on('worker', () => trabalhadores++);
await pg.goto(URL);
await pg.evaluate(() => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ visual: 'idade', tutorialVisto: true })));
// Cria uma partida de verdade para pegar o formato certo, depois troca a mesa.
await pg.getByText('Começar a jogar').click();
await pg.waitForTimeout(500);
await pg.getByText('▶ Começar').click();
await pg.waitForTimeout(800);
await pg.evaluate(() => {
  const chaves = Object.keys(localStorage).filter((k) => k.includes('partida'));
  localStorage.setItem('base', JSON.stringify(JSON.parse(localStorage.getItem(chaves[0])).partida));
});
await pg.evaluate(MONTAR);
await pg.reload();
await pg.getByText('Continuar partida').click({ timeout: 2500 }).catch(() => {});
await pg.waitForTimeout(600);
await pg.getByText('Dica', { exact: false }).first().click();
await pg.waitForTimeout(150);
await pg.screenshot({ path: `${pasta}/dica-procurando.png` });
await pg.waitForSelector('text=/💡/', { timeout: 40000 });
console.log('dica apareceu; workers criados:', trabalhadores);
await pg.screenshot({ path: `${pasta}/dica-achou.png` });
await pg.getByText('Fazer', { exact: false }).first().click();
await pg.waitForTimeout(900);
await pg.screenshot({ path: `${pasta}/dica-animando.png` });
await pg.waitForTimeout(4000);
await pg.screenshot({ path: `${pasta}/dica-fim.png` });
const texto = await pg.locator('body').innerText();
console.log(texto.includes('Pronto!') ? '✔ terminou com "Pronto!"' : '✘ não chegou ao Pronto');
// Sem animações
await pg.evaluate(() => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ visual: 'idade', tutorialVisto: true, animacoes: false })));
console.log('erros:', erros.length ? erros.join(' // ') : 'nenhum');
await b.close();
