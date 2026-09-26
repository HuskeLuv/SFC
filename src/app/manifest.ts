import type { MetadataRoute } from 'next';

/**
 * Web App Manifest (PWA fase 0), servido em /manifest.webmanifest.
 * Sem `orientation` de propósito: o Fluxo de caixa em paisagem precisa girar.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My Finance',
    short_name: 'My Finance',
    description: 'Gestão financeira pessoal',
    id: '/',
    start_url: '/carteira?source=pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#FFFFFF',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['finance'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Carteira', url: '/carteira' },
      { name: 'Fluxo de caixa', url: '/fluxodecaixa' },
    ],
  };
}
