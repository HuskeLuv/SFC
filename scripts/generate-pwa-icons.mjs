#!/usr/bin/env node
/**
 * Gera os ícones e splashes do PWA (fase 0) a partir dos SVGs do logo.
 *
 * Uso (roda UMA vez; os PNGs são commitados e o script fica fora do build/CI):
 *   node scripts/generate-pwa-icons.mjs
 *
 * Arte (decisão do Wellington, 23/09/2026): marca azul #0079F2 sobre fundo BRANCO.
 *  - icon-192/512 (purpose any): marca com 70% da altura.
 *  - icon-maskable-192/512: marca com 60% da altura (meia-diagonal ≈ 0,37 < 0,40 da zona segura).
 *  - apple-touch-icon 180x180: fundo opaco, marca com 60%.
 *  - favicon-32: marca com 88% da altura.
 *  - splash iOS: logo COMPLETO (logo.svg) com 50% da largura, centralizado.
 *
 * Ferramenta: sharp 0.33.5, que já vem em node_modules como dependência opcional do next
 * (NÃO entra no package.json). Fallback, se o sharp sumir: rasterizar com o chromium do
 * Playwright (page.setContent com o SVG no tamanho-alvo + page.screenshot({ omitBackground }))
 * e compor o fundo branco no próprio HTML.
 *
 * Nitidez: os SVGs declaram width/height pequenos (32px). Antes de rasterizar, reescrevemos
 * esses atributos para o tamanho-alvo em px, então o sharp rasteriza já no tamanho final,
 * sem ampliar bitmap.
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO_ICON = path.join(ROOT, 'public/images/logo/logo-icon.svg');
const LOGO_FULL = path.join(ROOT, 'public/images/logo/logo.svg');
const OUT_DIR = path.join(ROOT, 'public/icons');
const SPLASH_DIR = path.join(OUT_DIR, 'splash');
const BACKGROUND = '#FFFFFF';

/** Lê o viewBox (largura/altura) do SVG. */
function viewBoxOf(svg) {
  const match = svg.match(/viewBox="\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/);
  if (!match) throw new Error('SVG sem viewBox');
  return { vbW: Number(match[1]), vbH: Number(match[2]) };
}

/** Reescreve width/height da raiz <svg> para o tamanho-alvo em px. */
function resizeSvg(svg, width, height) {
  return svg.replace(/<svg([^>]*?)\swidth="[^"]*"\s+height="[^"]*"/, (_m, before) => {
    return `<svg${before} width="${width}" height="${height}"`;
  });
}

/** Rasteriza o SVG com a altura dada (largura proporcional ao viewBox). */
async function rasterByHeight(svg, height) {
  const { vbW, vbH } = viewBoxOf(svg);
  const width = Math.round((height * vbW) / vbH);
  return sharp(Buffer.from(resizeSvg(svg, width, height)))
    .png()
    .toBuffer();
}

/** Rasteriza o SVG com a largura dada (altura proporcional ao viewBox). */
async function rasterByWidth(svg, width) {
  const { vbW, vbH } = viewBoxOf(svg);
  const height = Math.round((width * vbH) / vbW);
  return sharp(Buffer.from(resizeSvg(svg, width, height)))
    .png()
    .toBuffer();
}

async function compose(logoPng, width, height, file) {
  await sharp({ create: { width, height, channels: 4, background: BACKGROUND } })
    .composite([{ input: logoPng, gravity: 'center' }])
    .flatten({ background: BACKGROUND })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log('gerado', path.relative(ROOT, file));
}

const SPLASHES = [
  [1290, 2796],
  [1179, 2556],
  [1170, 2532],
  [1125, 2436],
  [828, 1792],
  [750, 1334],
];

async function main() {
  const iconSvg = await readFile(LOGO_ICON, 'utf8');
  const fullSvg = await readFile(LOGO_FULL, 'utf8');
  await mkdir(SPLASH_DIR, { recursive: true });

  const square = [
    ['icon-192.png', 192, 0.7],
    ['icon-512.png', 512, 0.7],
    ['icon-maskable-192.png', 192, 0.6],
    ['icon-maskable-512.png', 512, 0.6],
    ['apple-touch-icon.png', 180, 0.6],
    ['favicon-32.png', 32, 0.88],
  ];
  for (const [name, size, ratio] of square) {
    const logo = await rasterByHeight(iconSvg, Math.round(size * ratio));
    await compose(logo, size, size, path.join(OUT_DIR, name));
  }

  for (const [w, h] of SPLASHES) {
    const logo = await rasterByWidth(fullSvg, Math.round(w * 0.5));
    await compose(logo, w, h, path.join(SPLASH_DIR, `apple-splash-${w}x${h}.png`));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
