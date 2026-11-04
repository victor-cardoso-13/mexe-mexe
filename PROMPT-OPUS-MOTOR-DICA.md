Vamos melhorar MUITO o motor de busca da Dica/Difícil do **Mexe-Mexe** (`Jogos Criados/mexe-mexe/`).
Leia `../CLAUDE.md`, `CLAUDE.md` e **`APRENDIZADOS-DICA.md`** (tudo o que já medimos e tentamos). O Victor não programa:
fale em português simples. Ele quer uma SOLUÇÃO: a dica não pode demorar segundos nem errar com mesa grande.

## O problema
Regras: 2 baralhos + 4 coringas, jogos = trincas (≥ 3 naipes, pode repetir naipe, 4 naipes com mínimo configurável) ou
sequências (Ás baixo/alto, coringa no meio, dois coringas não ficam lado a lado, ver `src/motor/validacao.ts`). Da mão baixa-se
1 ou 3 cartas por vez; a mesa pode ser **totalmente rearrumada**, desde que ao fim TODAS as cartas da mesa estejam em jogos válidos.
Pergunta: dada a mão e a mesa, existe uma jogada? Se sim, qual (a mais simples: mexe em poucos jogos, deixa a melhor mão)?

É um problema de partição exata (cobertura) da mesa + cartas baixadas. Mesas reais têm 15–22 jogos (~60–80 cartas).

## Estado atual (`src/ia/exata.ts`, `src/ia/index.ts → buscaExata`)
Backtracking "carta com menos opções primeiro" + memória de becos + degraus de orçamento `[0,1,3,∞]`.
Mede-se em 149 mesas simuladas: total ~67 s com limite de 8 s/mesa; ~5 mesas estouram o limite (e consomem >50% do tempo);
mesas SEM jogada são as piores (esgotar o espaço). Caso real que a dica errou: `tests/dicas-perdidas/2026-11-03-mesa-grande.json`
(acha em ~5 s no Mac; no iPad estourou 12 s). Já roda em Web Worker (30 s), mas **queremos < 100 ms na maioria e < 1 s no pior caso.**

## O que NÃO funcionou (não repita sem motivo novo)
- Probe com orçamento ∞ primeiro (2× mais lento). - Escolher a carta de menor valor (DP por valor): pior com coringas.

## Ideias para atacar (você decide; meça cada uma)
1. **Modelo exato diferente:** programação inteira/SAT/CP. Ex.: variáveis = "quantas cópias de cada jogo possível", restrições de
   cobertura por tipo de carta (≤ 104+4 tipos×cópias). Dá para escrever um solucionador próprio em TS (sem dependências novas; CSP do
   projeto proíbe CDN) ou uma relaxação por fluxo/LP para **provar "não existe" rápido**. Atenção: coringa como variável contada.
2. **Provas rápidas de impossibilidade** (cortes): contagem por valor/naipe, cartas "órfãs" (sem nenhum jogo possível), paridade de
   coringas. Boa parte do custo são mesas sem jogada.
3. **Decomposição em componentes independentes** (naipes/valores que não interagem) com memória por componente; coringas ligam tudo,
   então trate-os como recurso global (0–4) e enumere quantos vão onde.
4. **Busca orientada à carta da mão:** só a vizinhança da(s) carta(s) baixada(s) precisa mudar; o resto da mesa já é válido. Procurar
   uma "cadeia de realocação" (caminho aumentante, como em emparelhamento) que absorva a carta, em vez de refazer a partição toda.
   Prove corretude/completude (ou meça contra a busca exata atual: respostas devem coincidir).
5. Cache entre chamadas (mesma mesa quase igual de uma vez para outra), ordenação de candidatos por heurística aprendida do diário.

## Regras do trabalho
- Mantenha a **mesma resposta** (existe/não existe jogada) da busca atual em todas as mesas do benchmark; toda jogada devolvida passa em
  `conferir()` (`src/motor/partida.ts`). Mantenha a preferência: jogada que mexe pouco e deixa a melhor mão (`notaDaSobra`).
- Monte primeiro um **benchmark reproduzível** (script em `scripts/`, ~150–300 mesas de partidas simuladas + os casos de
  `tests/dicas-perdidas/` + mesas sem jogada) e registre tempo total/máx/timeouts antes e depois de cada mudança.
- Rode `npm test` (leva ~2 min), `npx tsc --noEmit`. Node: `source ~/.nvm/nvm.sh`.
- Não publique sem o "pode publicar" do Victor. Fluxo: ramo → commit → `gh pr create` → merge → `gh run watch` (ver `CLAUDE.md`).
- Ao terminar, atualize `APRENDIZADOS-DICA.md` e deixe `PROMPT-PROXIMA-SESSAO.md`.
- Mantenha o Mac acordado em medições longas (`caffeinate -dims &`).
