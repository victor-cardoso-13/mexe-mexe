import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// Política de segurança do navegador: o jogo só roda código dele mesmo e só conversa com o Firebase.
// Entra só no site publicado (no "npm run dev" atrapalharia o recarregamento automático).
const POLITICA = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com",
  "frame-src https://*.firebaseapp.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// "base: './'" faz o jogo funcionar em qualquer endereço: no GitHub Pages
// (.../jogos-sem-anuncio/mexe-mexe/), no computador e no iPad pelo Wi-Fi.
export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'politica-de-seguranca',
      apply: 'build',
      transformIndexHtml: () => [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: POLITICA }, injectTo: 'head-prepend' },
        { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head-prepend' },
      ],
    },
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
        background_color: '#f3e9da',
        theme_color: '#f3e9da',
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
