import localFont from 'next/font/local';

/**
 * Fontes do Relatório financeiro (protótipo do Pedro): display Titillium Web 600/700,
 * self-hosted em src/fonts (padrão de LandingPage.tsx; o CSP só permite font-src 'self').
 * O corpo (Albert Sans) já é global: --font-albert-sans, do RootLayout.
 *
 * Uso: <div className={`mf-rel ${classeFontesRelatorio}`}>. Só a página importa este módulo
 * (next/font não roda no Vitest; os primitivos não dependem dele).
 */
export const titilliumRelatorio = localFont({
  src: [
    { path: '../../../fonts/titillium-web-600-latin.woff2', weight: '600', style: 'normal' },
    { path: '../../../fonts/titillium-web-700-latin.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-titillium',
  display: 'swap',
});

/** Classe que define --font-titillium no contêiner .mf-rel. */
export const classeFontesRelatorio = titilliumRelatorio.variable;
