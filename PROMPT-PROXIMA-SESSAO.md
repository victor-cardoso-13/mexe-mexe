Vamos continuar o **Mexe-Mexe** (`Computador/mexe-mexe/`). Leia `Computador/APRENDIZADOS.md`, `Computador/CLAUDE.md` e as suas memórias. Eu não programo: explique em português simples e, no fim, diga como testar no iPhone e no iPad.

## Já feito (31/10/2026)
- A (login + retrospecto) e B (publicação + PWA) prontos e no ar: https://victor-cardoso-13.github.io/jogos-sem-anuncio/mexe-mexe/
- Mocks de C, D e E **aprovados**: `mexe-mexe/scripts/mock-visual.html` (abrir `mock-escolha.html`). Siga esses desenhos.

## Fazer agora (implementar o que foi aprovado)
1. **C) Dois modos visuais**, escolhidos em Ajustes ("Visual: Melhor idade / Bonito"). **Padrão: Melhor idade.** Identidade do Miaudoku (creme, tinta #3b2f2a, âmbar, fontes Fredoka + Nunito via `@fontsource`, como em `Jogos/miaudoku/src/estilo.css`). Copie o CSS do mock (classes `body.bonito` / `body.idade`).
2. **D) Tutorial** de 7 passos (textos e desenhos do mock), na primeira vez, com "Pular" sempre visível, e revisto em Ajustes → "Como jogar". A faixa de aviso fica só com frases curtas ("Sua vez", "Tudo certo! Passando a vez…", erros). Tirar o textão de `src/ui/textos.ts`.
3. **E) Fim do "Novo jogo"**: remover o quadrado e o "+ Novo jogo".
   - 3 cartas escolhidas da mão que formam jogo (2-2-2 ou 2-3-4) → botão **"Baixar jogo"** na linha "Suas cartas" (lugar fixo) → cria o jogo; a vez passa sozinha se a mesa ficar válida.
   - Com carta escolhida ou arrastando: **espaço vazio pontilhado** na mesa; tocar nele ou soltar ali cria um jogo novo (de carta da mão ou de um jogo da mesa).
   - Não quebrar as regras críticas (1 ou 3 cartas da mão, trava já no movimento, etc.). Destino `{ tipo: 'novoJogo' }` já existe em `src/motor/partida.ts`.
4. `npm test` (Node via nvm), prints com Playwright **só** em iPad (1180×820 e 820×1180) e iPhones 12/13/15/16 normal e Pro Max (ex.: 440×800 e 956×360). **Nunca iPhone SE.**
5. Commit só de `mexe-mexe/` (ver `CLAUDE.md`: sem `git add -A`, sem trocar de ramo), PR, merge, conferir o site e me avisar. Atualizar `APRENDIZADOS.md`.
