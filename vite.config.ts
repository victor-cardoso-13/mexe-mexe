import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// "base: './'" faz o jogo funcionar em qualquer endereço: no GitHub Pages
// (.../jogos-sem-anuncio/mexe-mexe/), no computador e no iPad pelo Wi-Fi.
export default defineConfig({
  base: './',
  plugins: [
    // Vira "app": dá para pôr na Tela de Início e jogar sem internet
    // (o jogo inteiro fica guardado no aparelho no primeiro acesso).
    VitePWA({
      registerType: 'autoUpdate', // versão nova é baixada sozinha e vale na próxima vez que abrir
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Mexe-Mexe',
        short_name: 'Mexe-Mexe',
        description: 'Jogo de cartas contra o computador, com as regras da casa. Sem anúncios.',
        lang: 'pt-BR',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#0a4329',
        theme_color: '#0a4329',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        maximumFileSizeToCacheInBytes: 3_000_000, // a parte do Firebase passa do limite padrão
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
