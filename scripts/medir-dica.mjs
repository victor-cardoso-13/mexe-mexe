// Benchmark da Dica (busca exata).
//   (SEM_CORINGA=1 antes do comando: mesas sem coringa, em scripts/mesas-dica-sem-coringa.json)
//   node scripts/medir-dica.mjs gerar            → cria scripts/mesas-dica.json (mesas de partidas simuladas + casos reais)
//   node scripts/medir-dica.mjs medir saida.json [base.json] [limiteMs]
//        → mede todas as mesas, grava o resultado e (se der a base) compara as respostas.
// Usa o Vite para carregar o código TypeScript do jogo (nada para instalar).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createServer } from 'vite';

const [modo, saida, base, limite] = process.argv.slice(2);
const servidor = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const lib = await servidor.ssrLoadModule('/scripts/medir-dica-lib.ts');
const ARQ = new URL(process.env.SEM_CORINGA ? './mesas-dica-sem-coringa.json' : './mesas-dica.json', import.meta.url);

if (modo === 'gerar') {
  const sementes = Array.from({ length: 40 }, (_, i) => 1000 + i * 7);
  const todas = lib.gerarMesas(sementes, 7);
  // Amostra estratificada: até 30 mesas por tamanho (nº de jogos), começando pelas maiores.
  const porTamanho = new Map();
  for (const m of todas) {
    const k = m.mesa.length;
    if (!porTamanho.has(k)) porTamanho.set(k, []);
    porTamanho.get(k).push(m);
  }
  const escolhidas = [];
  for (const [k, lista] of [...porTamanho].sort((a, b) => b[0] - a[0])) {
    const passo = Math.max(1, Math.floor(lista.length / 30));
    const pegas = lista.filter((_, i) => i % passo === 0).slice(0, 30);
    console.log(`${k} jogos: ${lista.length} mesas, pegas ${pegas.length}`);
    escolhidas.push(...pegas);
  }
  // Casos reais (dicas perdidas).
  const pasta = new URL('../tests/dicas-perdidas/', import.meta.url);
  for (const a of readdirSync(pasta).filter((x) => x.endsWith('.json'))) {
    const c = JSON.parse(readFileSync(new URL(a, pasta), 'utf8'));
    escolhidas.push({ nome: `real-${a}`, mao: c.mao, mesa: c.mesa });
  }
  writeFileSync(ARQ, JSON.stringify(escolhidas, null, 0));
  console.log(`total: ${escolhidas.length} mesas → ${ARQ.pathname.split('/').pop()}`);
} else if (modo === 'medir') {
  const mesas = JSON.parse(readFileSync(ARQ, 'utf8'));
  const lim = Number(limite ?? 8000);
  const res = [];
  for (const m of mesas) {
    const r = lib.medirUma(m, lim);
    res.push(r);
    if (r.ms > 500 || !r.completa) console.log(`  lenta: ${r.nome} ${r.jogos} jogos ${r.ms} ms ${r.completa ? '' : '(TEMPO ACABOU)'} ${r.existe ? 'achou' : 'nada'}`);
  }
  const ms = res.map((r) => r.ms).sort((a, b) => a - b);
  const soma = ms.reduce((a, b) => a + b, 0);
  const pct = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
  console.log(`mesas: ${res.length} | com jogada: ${res.filter((r) => r.existe).length} | sem: ${res.filter((r) => !r.existe).length}`);
  console.log(`tempo total ${(soma / 1000).toFixed(1)} s | mediana ${pct(0.5)} ms | 90% ${pct(0.9)} ms | 99% ${pct(0.99)} ms | máx ${ms[ms.length - 1]} ms`);
  console.log(`tempo acabou: ${res.filter((r) => !r.completa).length} | jogada que não passa no conferir: ${res.filter((r) => !r.conferida).length}`);
  if (saida) writeFileSync(saida, JSON.stringify(res, null, 1));
  if (base) {
    const b = new Map(JSON.parse(readFileSync(base, 'utf8')).map((r) => [r.nome, r]));
    let difExiste = 0, difCartas = 0, menos = 0, mais = 0;
    for (const r of res) {
      const o = b.get(r.nome);
      if (!o || !o.completa || !r.completa) continue;
      if (o.existe !== r.existe) { difExiste++; console.log(`  DIFERENTE (existe): ${r.nome} antes=${o.existe} agora=${r.existe}`); continue; }
      if (!r.existe) continue;
      if (o.baixadas !== r.baixadas) { difCartas++; console.log(`  outras cartas: ${r.nome} antes=[${o.baixadas}] agora=[${r.baixadas}]`); }
      if (r.mexidos < o.mexidos) menos++;
      if (r.mexidos > o.mexidos) { mais++; console.log(`  mexe MAIS: ${r.nome} antes=${o.mexidos} agora=${r.mexidos}`); }
    }
    const novasCompletas = res.filter((r) => r.completa && b.get(r.nome) && !b.get(r.nome).completa).length;
    console.log(`comparação: existe diferente ${difExiste} | cartas diferentes ${difCartas} | mexe menos ${menos} | mexe mais ${mais} | antes sem terminar e agora terminou ${novasCompletas}`);
  }
}
await servidor.close();
