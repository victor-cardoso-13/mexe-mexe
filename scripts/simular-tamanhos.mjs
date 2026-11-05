// Joga partidas inteiras pela tela (sozinho: usa "Dica → Fazer para mim" e, se não houver, "Comprar") e conta
// quantas vezes o tamanho das cartas da mesa e da mão muda. Tamanho que muda demais atrapalha o visual.
// Uso: com "npx vite --port 5199" rodando:  node scripts/simular-tamanhos.mjs [turnos] [semente]
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5199/';
const TURNOS = Number(process.argv[2] ?? 14);
const telas = [['iPad deitado', 1180, 820], ['iPad em pé', 820, 1180], ['iPhone 440×800', 440, 800], ['iPhone 390×844', 390, 844], ['iPhone deitado', 956, 360]];
const SEMENTES = [11, 23, 37];
// Opcional: SO=2,3 limita as telas (índices); ADV=1 limita a 1 adversário.
const so = process.env.SO?.split(',').map(Number);
const ADV = process.env.ADV ? [Number(process.env.ADV)] : [1, 3];

const b = await chromium.launch();
let resumo = [];
for (const [nome, w, h] of telas.filter((_, i) => !so || so.includes(i))) {
  for (const adversarios of ADV) {
    for (const semente of SEMENTES.slice(0, adversarios === 1 ? 3 : 1)) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 900 || h < 500, deviceScaleFactor: 1 });
      const pg = await ctx.newPage();
      pg.on('pageerror', (e) => console.log('ERRO', e.message));
      await pg.addInitScript(() => { Math.random = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); })(); });
      await pg.goto(URL);
      await pg.evaluate(([adv]) => localStorage.setItem('mexe-mexe:ajustes:v1', JSON.stringify({ visual: 'idade', tutorialVisto: true, velocidade: 'normal', adversarios: adv, nivel: 'medio' })), [adversarios]);
      await pg.reload();
      await pg.addInitScript(() => {});
      // sorteio fixo: a "semente" do jogo vem de Math.random; muda o estado do gerador antes de começar
      await pg.evaluate((s) => { let x = s; Math.random = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296); }, semente);
      await pg.locator('[data-acao="pedirNova"]').click();
      await pg.locator('[data-acao="comecarComoEscolhido"]').click(); // "Como vai ser?" (valores dos Ajustes)
      // amostrador: anota cada mudança de tamanho
      await pg.evaluate(() => {
        window.__mudancas = [];
        let ult = '';
        const lido = () => {
          const cs = getComputedStyle(document.documentElement);
          const mesa = document.querySelector('.mesa'), mao = document.querySelector('.area-mao');
          if (!mesa || !mao) return null;
          return { mesaW: cs.getPropertyValue('--mesa-w').trim(), maoW: cs.getPropertyValue('--mao-w').trim(), mesaH: mesa.getBoundingClientRect().height | 0, maoH: mao.getBoundingClientRect().height | 0, mesaTop: mesa.getBoundingClientRect().top | 0, topoH: (document.querySelector('.topo')?.getBoundingClientRect().height | 0), avisoH: (document.querySelector('.faixa')?.getBoundingClientRect().height | 0), botoesH: (document.querySelector('.botoes')?.getBoundingClientRect().height | 0) };
        };
        const quadro = () => {
          const l = lido();
          if (l) {
            const chave = `${l.mesaW}|${l.maoW}|${l.mesaH}|${l.maoH}|${l.topoH}|${l.avisoH}|${l.botoesH}`;
            if (chave !== ult) {
              const e = window.__e;
              window.__mudancas.push({ t: Math.round(performance.now()), ...l, vez: e.partida?.vez, pc: e.computadorJogando, sel: e.selecionadas.length, jogos: (e.mesaExibida ?? e.partida?.mesa ?? []).length, mao: e.partida?.jogadores[0].mao.length, aviso: (e.aviso?.texto ?? '').slice(0, 30) });
              ult = chave;
            }
          }
          requestAnimationFrame(quadro);
        };
        requestAnimationFrame(quadro);
      });
      let turnos = 0, t0 = Date.now();
      while (turnos < TURNOS && Date.now() - t0 < 90000) {
        const estado = await pg.evaluate(() => ({ minha: window.__e.partida.vez === 0 && !window.__e.computadorJogando && !window.__e.partida.resultado && !window.__e.janela, fim: !!window.__e.partida.resultado }));
        if (estado.fim) break;
        if (!estado.minha) { await pg.waitForTimeout(150); continue; }
        await pg.waitForTimeout(300);
        await pg.locator('[data-acao="dica"]').click();
        await pg.waitForTimeout(500);
        const faz = pg.locator('[data-acao="fazerDica"]');
        if (await faz.count()) { await faz.click(); await pg.waitForTimeout(1200); }
        else { await pg.locator('[data-acao="comprar"]').click(); await pg.waitForTimeout(300); }
        turnos++;
        await pg.waitForTimeout(400);
      }
      if (process.env.PRINT) await pg.screenshot({ path: `${process.env.PRINT}/tamanhos-${w}x${h}-${adversarios + 1}j.png` });
      const m = await pg.evaluate(() => window.__mudancas);
      // conta mudanças de tamanho de carta (não de altura de caixa) e inversões (A→B→A)
      const tam = m.map((x) => `${x.mesaW}/${x.maoW}`).filter((v, i, a) => i === 0 || v !== a[i - 1]);
      // Mudanças de tamanho que acontecem na vez do adversário (ou no "Fazer"), quando ninguém tocou em nada.
      const naVezDele = m.filter((x, i) => i > 0 && x.pc && `${x.mesaW}/${x.maoW}` !== `${m[i - 1].mesaW}/${m[i - 1].maoW}`).length;
      // Por jogada animada: a 1ª mudança pode ser a planejada (antes de mexer); as outras são "no meio".
      // E "cresceu depois": mudou logo que a sua vez voltou, sem você ter tocado em nada.
      let noMeio = 0, depois = 0, mudouNoBloco = 0;
      for (let i = 1; i < m.length; i++) {
        const mudou = `${m[i].mesaW}/${m[i].maoW}` !== `${m[i - 1].mesaW}/${m[i - 1].maoW}`;
        // Cada jogada animada é um bloco: começa quando a vez muda (o "Fazer" passa direto para o adversário).
        if (m[i].pc && (!m[i - 1].pc || m[i].vez !== m[i - 1].vez)) mudouNoBloco = 0;
        if (!mudou || m[i].aviso.startsWith('Você comprou')) continue; // comprar muda a SUA mão: é toque seu
        if (m[i].pc) { if (mudouNoBloco++ > 0) noMeio++; }
        else if (m[i - 1].pc || (m[i].sel === 0 && m[i].jogos === m[i - 1].jogos && m[i].mao === m[i - 1].mao)) depois++;
      }
      let inversoes = 0;
      for (let i = 2; i < tam.length; i++) if (tam[i] === tam[i - 2]) inversoes++;
      const alturas = m.map((x) => `${x.mesaH}|${x.maoH}|${x.topoH}|${x.avisoH}|${x.botoesH}`).filter((v, i, a) => i === 0 || v !== a[i - 1]).length - 1;
      console.log(`${nome} · ${adversarios + 1} jogadores · semente ${semente}: ${turnos} turnos → tamanhos de carta mudaram ${tam.length - 1}× (inversões ${inversoes}; ${noMeio} no meio da jogada, ${depois} logo depois); altura de mesa/mão mudou ${alturas}×`);
      if (process.env.DETALHE) console.log(tam.join('  '));
      if (process.env.MUDANCAS) m.forEach((x, i) => { if (i && `${x.mesaW}/${x.maoW}` !== `${m[i - 1].mesaW}/${m[i - 1].maoW}`) console.log(`  ${m[i - 1].mesaW}/${m[i - 1].maoW} → ${x.mesaW}/${x.maoW}  pc=${x.pc} vez=${x.vez} jogos=${m[i - 1].jogos}→${x.jogos} mão=${x.mao} "${x.aviso}"`); });
      if (process.env.ALT) { const ev = []; m.forEach((x, i) => { if (i && (x.mesaH !== m[i-1].mesaH || x.maoH !== m[i-1].maoH || x.topoH !== m[i-1].topoH || x.avisoH !== m[i-1].avisoH || x.botoesH !== m[i-1].botoesH)) ev.push(`mesa ${m[i-1].mesaH}→${x.mesaH} mão ${m[i-1].maoH}→${x.maoH} topo ${m[i-1].topoH}→${x.topoH} aviso ${m[i-1].avisoH}→${x.avisoH} botões ${m[i-1].botoesH}→${x.botoesH} [pc=${x.pc} sel=${x.sel} jogos=${x.jogos} mão=${x.mao} "${x.aviso}"]`); }); console.log(ev.slice(0, 40).join('\n')); }
      resumo.push({ nome, mudancas: tam.length - 1, inversoes, turnos, alturas, noMeio, depois });
      await ctx.close();
    }
  }
}
await b.close();
const soma = (k) => resumo.reduce((s, r) => s + r[k], 0);
console.log(`\nTOTAL: ${soma('turnos')} turnos, ${soma('mudancas')} mudanças de tamanho (${soma('inversoes')} inversões, ${soma('noMeio')} no meio da jogada, ${soma('depois')} logo depois), ${soma('alturas')} mudanças de altura`);
