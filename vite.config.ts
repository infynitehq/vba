import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import files from './emulator-files.json';

const base = process.env.VITE_BASE || '/';
function devServer() {
  const value = process.env.PORT;
  const port = value === undefined ? 5173 : Number(value);
  if (
    (value !== undefined && !/^\d+$/.test(value)) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return {
    host: process.env.HOST || '0.0.0.0',
    port,
    strictPort: true,
    allowedHosts: ['gba.local'],
  };
}

export default defineConfig(({ command }) => ({
  base,
  server: command === 'serve' ? devServer() : undefined,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    tailwindcss(),
    {
      name: 'require-offline-emulator',
      apply: 'build',
      buildStart() {
        for (const file of files) {
          if (!existsSync(`public/emulatorjs/${file}`))
            this.error(
              `Missing offline emulator asset: ${file}. Run pnpm fetch-emulator before building.`,
            );
        }
      },
    },
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'logo.svg',
        'icons/*.png',
        'icons/source.svg',
        'player.html',
        'player.js',
        'player-checkpoints.js',
        'player-toolbar.js',
        'player-toolbar.css',
        'player-controls.css',
        'player-settings.js',
        'player-settings.css',
      ],
      manifest: {
        name: 'Pocket GBA',
        short_name: 'Pocket GBA',
        description: 'Your own GBA games. Offline, on your device.',
        display: 'standalone',
        start_url: base,
        scope: base,
        theme_color: '#191715',
        background_color: '#191715',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,png,svg,woff2}',
          ...files.map((file) => `emulatorjs/${file}`),
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/player\.html/, /\/emulatorjs\//],
        ignoreURLParametersMatching: [
          /^gameId$/,
          /^channel$/,
          /^utm_/,
          /^fbclid$/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/emulatorjs/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'emulatorjs-4.2.3',
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
}));
