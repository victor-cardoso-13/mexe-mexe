# Aprendizados do motor de dica / computador (Mexe-Mexe)

Escrito em 3–4/11/2026. Serve para quem for melhorar `src/ia/` (a busca da Dica e do Difícil).

## Como a busca funciona hoje (desde 3/11/2026, noite: motor novo)
- `src/ia/index.ts` → `pensar()`: no Difícil e na Dica chama `buscaExata()`.
- `buscaExata()`: para cada jeito permitido de baixar cartas da mão (3 que formam jogo, senão 1), tamanho maior
  primeiro, sobe os degraus `DEGRAUS = [0, 1, 3, ∞]` ("quantos jogos novos pode criar, fora o que recebe a carta").
  No primeiro degrau em que alguma carta serve, fica a que deixa a melhor mão (`notaDaSobra`). Igual a antes.
- **Carta solta (o caso comum): `src/ia/arrumacao.ts` (`Arrumador`)** — a arrumação EXATA de menor custo, por
  programação dinâmica "por coluna": anda do Ás (1) ao Ás alto (14) guardando só as sequências abertas de cada naipe
  (tamanho 1/2/3+, última foi coringa?, começou no Ás?), os coringas que sobram e quais sequências DA MESA estão sendo
  mantidas inteiras. Jogo novo custa 1; jogo da mesa mantido custa 0 (trincas: tabelinha por valor). Procura com
  orçamento 1, 2, 3… e guarda a memória entre um degrau e outro ("aos poucos": `ate(custo)`).
  Desempate na carta escolhida (`desempatada()`): entre as de menos jogos novos, a que mexe em menos jogos da mesa.
- **"Dá de algum jeito?": `src/ia/viavel.ts`** — a mesma ideia, só sim/não, sem custo. Usado no degrau ∞ e para
  filtrar os jogos de 3 da mão. Mesas SEM jogada terminam em milissegundos.
- Ases altos (Q-K-A) dividem os Ases com o Ás baixo: as duas DPs testam combinações "quantos Ases de cada naipe ficam
  para o fim", começando pela que a mesa já usa.
- Cortes exatos que fizeram a diferença (sem eles, 455 mil estados numa mesa sem jogada; com eles, ~20): carta sem
  nenhum vizinho possível → não dá; coringa só onde a próxima posição tem carta normal do naipe; sequência nova só se
  tem carta logo adiante (ou coringa + carta duas adiante); quem não pode fechar precisa de carta na próxima posição.
- Jogos de 3 da mão e regras não cobertas (`suportado()`: limite de coringas por jogo, mais de 2 baralhos) usam a busca
  antiga (`Divisor` em `exata.ts`), agora com limite de PASSOS (igual no Mac e no iPad) e o atalho guloso
  (`tentarGuloso`: trava os jogos mais longe da carta enquanto o verificador disser que dá) como rede de segurança.
- Limites: as DPs desistem ("não sei") depois de 400 mil estados; aí entra o caminho antigo. Nunca vira "não dá".
  Atenção: as DPs NÃO olham o relógio (só o limite de estados). Nas 1.006 mesas medidas o pior foi 0,33 s; se um dia
  aparecer mesa muito lenta (Difícil tem ~3 s; sem Worker a tela trava), pôr checagem de relógio em `rec`.

## Resultado (benchmark, 441 mesas, 3/11/2026)
`node scripts/medir-dica.mjs medir prints/novo.json scripts/medicoes/depois-2026-11-03.json` (mesas em `scripts/mesas-dica.json`:
40 partidas simuladas, Médio nos 4 lugares, com coringa, até 30 mesas por tamanho de 7 a 24 jogos + casos reais).
| | antes | agora |
|---|---|---|
| tempo total | 168 s | 5,5 s |
| mediana / 90% / 99% / máx | 18 ms / 743 ms / 8 s / 8,2 s | 2 ms / 28 ms / 170 ms / 333 ms |
| estourou o tempo (8 s) | 6 | 0 |
| mesas com jogada | 411 | 416 (5 que a antiga não achava a tempo) |
| "existe jogada?" diferente | — | 0 |
| mexe em menos / mais jogos da mesa | — | 82 menos / 2 mais |
As 6 mesas que estouravam (20–24 jogos) TINHAM jogada: a busca antiga gastava o tempo provando que "mexendo em 0, 1
ou 3 jogos não dá". Isso era o defeito que o jogador via ("a dica disse que não tinha").
Sem coringa (o padrão do jogo; `SEM_CORINGA=1`, 565 mesas em `scripts/mesas-dica-sem-coringa.json`): 47 s → 3,2 s;
máx 8 s → 0,22 s; "existe jogada?" igual em todas; 2 mesas que estouravam agora acham; mexe menos em 67, mais em 0.
Diferenças restantes (com coringa, 2 mesas mexem em 1–2 jogos a mais e 2 escolhem outra carta): não investigado a fundo.
Duas causas possíveis: (a) a nova minimiza primeiro os jogos NOVOS e só desempata pelos jogos mexidos, e o benchmark
conta os mexidos; (b) a antiga contava "de graça" um jogo igual a um da mesa quantas vezes aparecesse (a nova, uma vez).
Medições guardadas em `scripts/medicoes/`.

## Tentativas desta rodada que NÃO serviram
- Chamar o verificador em todo passo da busca antiga (`Divisor.rec`): ficou MAIS lento (o verificador custa ~1 ms e o
  Divisor dá milhares de passos) e não ajuda a provar "não dá com orçamento 3", que era o caro.
- Só o atalho guloso (sem a DP com custo): rápido, mas às vezes mexia em muito mais jogos (5 → 12).

## Testes novos
- `tests/viavel.test.ts`: 6.000 montes sorteados (puxados para coringas e Ases): mesma resposta da busca antiga completa
  e toda divisão vale. `tests/arrumacao.test.ts`: custo mínimo = régua exata (todas as escolhas de jogos mantidos ×
  menor número de jogos do resto), com e sem coringa e coringas lado a lado.

## O que descobrimos antes (3–4/11/2026, motor antigo)
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
- Busca: `src/ia/index.ts`, `src/ia/arrumacao.ts`, `src/ia/viavel.ts`, `src/ia/exata.ts`, `src/ia/combinacoes.ts`. Worker: `src/ia/trabalhador.ts`, `src/ia/assincrono.ts`.
- Casos reais: `tests/dicas-perdidas/*.json` (+ `tests/dicasPerdidas.test.ts`, leitor `csDiario` em `tests/ajuda.ts`).
- Conferência no navegador: `node scripts/verificar-worker.mjs prints` (com `npm run build` e `npx vite preview --port 5198`).
- Medir busca: `node scripts/medir-dica.mjs gerar` (refaz as mesas) e `node scripts/medir-dica.mjs medir <saida.json> [base.json]`
  (mede e compara as respostas com uma medição anterior).

## Como acrescentar um caso novo
1. Baixar o diário (Ajustes). 2. Achar "dica: não achou" (ou "dicasQuePerderam"). 3. Criar
   `tests/dicas-perdidas/AAAA-MM-DD-nome.json` com `{ "mao": "6♥", "mesa": ["9♥ 9♦ 9♣", ...], "nota": "..." }`.
   4. `npx vitest run tests/dicasPerdidas.test.ts`.
