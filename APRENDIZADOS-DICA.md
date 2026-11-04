# Aprendizados do motor de dica / computador (Mexe-Mexe)

Escrito em 3–4/11/2026. Serve para quem for melhorar `src/ia/` (a busca da Dica e do Difícil).

## Como a busca funciona hoje
- `src/ia/index.ts` → `pensar()`: no Difícil e na Dica chama `buscaExata()`.
- `buscaExata()` (em `index.ts`): para cada jeito permitido de baixar cartas da mão (3 que formam jogo, senão 1),
  pergunta ao `Buscador` (`src/ia/exata.ts`) se **a mesa inteira + as cartas baixadas** podem virar jogos válidos.
  O tamanho maior (3) é tentado antes do menor (1).
- `Divisor.dividir()` (`exata.ts`): backtracking. Escolhe a carta com MENOS jogos possíveis, tenta cada jogo que a
  contém (primeiro os que já existiam na mesa, depois os maiores) e guarda "becos" (restos de cartas que já falharam,
  com o maior orçamento que falhou).
- "Orçamento" = quantos jogos NOVOS (diferentes dos que estavam na mesa) a solução pode ter. A busca sobe os
  degraus `DEGRAUS = [0, 1, 3, ∞]` para a jogada mais simples aparecer primeiro.
- Se a busca exata não termina no tempo, cai nas buscas por tentativas (grupos de jogos, busca crescente).

## O que descobrimos
1. **O diário do jogo já dá o insumo.** `Ajustes → baixar diário` gera um JSON com "dica: não achou", "você jogou", etc.
   Agora também guarda, à parte (30 casos, não rola fora), os casos **"dica perdeu"** (dica achou menos do que o jogador).
2. **Caso real (3/11/2026):** mão `6♥`, mesa de 15 jogos, 2 baralhos + 4 coringas. A dica disse "não achei" depois de ~10 s
   no iPad; o jogador baixou o 6♥ num jogo novo `6♣ 6♠ 6♥` rearrumando a mesa quase toda. A busca acha essa jogada no Mac
   em ~5 s: **era estouro de tempo** (e o diário mentia: marcava "tempo não acabou"; já corrigido, agora há `exataTerminou`).
   O caso está em `tests/dicas-perdidas/` e roda em `tests/dicasPerdidas.test.ts`.
3. **O custo não está em achar, está em provar que não dá.** No caso real, os degraus 0..6 gastavam ~4,2 s só refutando e o
   degrau 8 achou a jogada em ~1,1 s.
4. **Medição em 149 mesas de partidas simuladas** (2 baralhos, coringa, mesa ≥ 7 jogos, mão ≤ 6; limite 8 s por mesa):
   - Degraus `[0,1,2,3,4,6,8,∞]` (antigo): 79 s no total. `[0,1,3,∞]` (atual): 67 s e 130 jogadas achadas (antigo: 128).
   - ~5 de 149 mesas estouram 8 s; **elas gastam mais da metade do tempo total**. Nas demais a busca termina em milissegundos.
   - Mesas em que NÃO existe jogada (≈ 11%) são as piores: é preciso esgotar o espaço.
5. **Ideias testadas que PIORARAM (não repetir assim):**
   - Perguntar primeiro "existe QUALQUER arrumação?" (orçamento ∞ logo de cara): total 2× mais lento. Sem o viés dos
     orçamentos baixos, a primeira descida se perde.
   - Escolher sempre a carta de menor VALOR (estilo programação dinâmica de Rummikub): 83–107 s, mais estouros.
     (Com 4 coringas o estado "sequências abertas" explode, e perde o ganho do "carta com menos opções".)
6. **A tela travava** durante a busca (ela rodava no mesmo lugar que desenha). Agora a Dica e o computador rodam num
   **Web Worker** (`src/ia/trabalhador.ts` + `assincrono.ts`); a Dica pode pensar até 30 s sem travar nada. Se o Worker
   falhar, volta ao jeito antigo (síncrono, 12 s).
7. **Carta solta antes do jogo de 3:** se a melhor jogada é só baixar um jogo de 3 da mão e todo adversário tem ≥ 3 cartas,
   tenta antes baixar UMA carta solta (o jogo de 3 pode esperar; a solta pode perder o lugar). Está em
   `guardarJogoDeTres()` (`index.ts`). Dobra o custo nesses casos.
8. **Animações:** "Fazer" da dica agora anima a mesa passo a passo (mesma função `animarPassos` do computador).
   Ajuste "Ver animações" (dica e adversário) em Ajustes.

## Onde estão as coisas
- Busca: `src/ia/index.ts`, `src/ia/exata.ts`, `src/ia/combinacoes.ts`. Worker: `src/ia/trabalhador.ts`, `src/ia/assincrono.ts`.
- Casos reais: `tests/dicas-perdidas/*.json` (+ `tests/dicasPerdidas.test.ts`, leitor `csDiario` em `tests/ajuda.ts`).
- Conferência no navegador: `node scripts/verificar-worker.mjs prints` (com `npm run build` e `npx vite preview --port 5198`).
- Medir busca: o script de benchmark usado foi descartado; recrie assim: simular ~14 partidas com a IA Médio, guardar
  `inicioDaVez` de cada rodada com mesa ≥ 7 jogos, rodar `buscaExata(regras, estado, 8000, degraus)` e somar tempos.

## Como acrescentar um caso novo
1. Baixar o diário (Ajustes). 2. Achar "dica: não achou" (ou "dicasQuePerderam"). 3. Criar
   `tests/dicas-perdidas/AAAA-MM-DD-nome.json` com `{ "mao": "6♥", "mesa": ["9♥ 9♦ 9♣", ...], "nota": "..." }`.
   4. `npx vitest run tests/dicasPerdidas.test.ts`.
