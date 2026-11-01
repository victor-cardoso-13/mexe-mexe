# Mexe-Mexe — instruções para o Claude

Jogo de cartas (rummy da família) contra o computador, feito para o Victor e a família.
**Esta pasta é só do Mexe-Mexe**: é o repositório https://github.com/victor-cardoso-13/mexe-mexe,
publicado em https://victor-cardoso-13.github.io/mexe-mexe/ .
O Miaudoku e os outros jogos ficam em outras pastas/repositórios: **não mexa neles daqui.**
Regras do Firebase (`firestore.rules`), página inicial do site e `APRENDIZADOS.md` ficam em
`../Computador/` (repositório `jogos-sem-anuncio`).

## Como falar com o usuário
- Português, linguagem simples, passo a passo (ele não programa). No fim, diga como testar no iPhone e no iPad.
- **Mudança visual: primeiro um mock** (HTML em `scripts/mock-*.html`), só depois mexer no jogo.

## Organização
- `src/motor/regras.ts` regras da casa; `src/motor/` regras puras; `src/ia/` computador; `src/ui/` telas; `src/nuvem/` conta no Firebase.
- `tests/` Vitest (levam alguns minutos: partidas simuladas).

## Antes de publicar
1. `npm test` e `npx tsc --noEmit` (Node via nvm: `source ~/.nvm/nvm.sh`).
2. Prints com Playwright (`node scripts/prints.mjs <pasta>`, com `npx vite --port 5199` rodando) em iPad (1180×820, 820×1180)
   e iPhones 12/13/15/16 (440×800 em pé, 956×360 deitado). **Nunca iPhone SE.**

## Publicar
- `gh` fica em `~/.local/bin/gh` (`export PATH="$HOME/.local/bin:$PATH"`), logado como victor-cardoso-13.
- Ramo novo → commit → `gh pr create` → `gh pr merge --merge --delete-branch` → `gh run watch`.
  O GitHub roda os testes e publica sozinho; se falhar, o site continua na versão anterior.
