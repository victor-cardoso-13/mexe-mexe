#!/bin/bash
# Dê dois cliques neste arquivo para abrir o Mexe-Mexe no navegador.
# Para fechar o jogo, feche esta janela do Terminal.
cd "$(dirname "$0")"
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
if [ ! -d node_modules ]; then
  echo "Preparando o jogo pela primeira vez (pode levar 1 minuto)..."
  npm install
fi
echo ""
echo "  O jogo vai abrir no navegador."
echo "  Para jogar no iPad (mesmo Wi-Fi), abra no Safari o endereço 'Network' abaixo."
echo "  NÃO feche esta janela enquanto estiver jogando."
echo ""
npx vite --host --open
