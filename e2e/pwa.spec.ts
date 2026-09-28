import { test, expect } from '@playwright/test';

// PWA fase 0 — plataforma: manifest, ícones, service worker, página offline, lang e viewport.
// O registro do SW e o modo offline de verdade só existem em build de produção
// (npm run build && npm start); aqui checamos o que vale em qualquer ambiente.

const ICONS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];

test.describe('PWA: plataforma', () => {
  test('manifest com nome, standalone, sem orientation e ícone maskable 512', async ({
    request,
  }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.name).toBe('My Finance');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('pt-BR');
    expect(manifest).not.toHaveProperty('orientation');
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ src: '/icons/icon-maskable-512.png', purpose: 'maskable' }),
    );
  });

  for (const path of ['/sw.js', '/offline.html']) {
    test(`${path} responde 200, sem redirect e com CSP de worker/manifest`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      const csp = res.headers()['content-security-policy'] ?? '';
      expect(csp).toContain("worker-src 'self'");
      expect(csp).toContain("manifest-src 'self'");
    });
  }

  test('offline.html não tem <script>', async ({ request }) => {
    const html = await (await request.get('/offline.html')).text();
    expect(html).toContain('Você está sem conexão');
    expect(html).not.toMatch(/<script/i);
  });

  for (const icon of ICONS) {
    test(`ícone ${icon} é PNG`, async ({ request }) => {
      const res = await request.get(icon);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    });
  }

  test('html lang pt-BR, viewport-fit=cover e link do manifest', async ({ page }) => {
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('pt-BR');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('viewport-fit=cover');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      /manifest\.webmanifest/,
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/icons/apple-touch-icon.png',
    );
  });
});
