import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regra da impressão (PWA fase 3): /saude-financeira e /relatorios imprimem numa folha A4 de
 * ~794px, onde `max-lg:` (width < 64rem) CASA e mudaria o PDF do desktop. Nestas pastas toda
 * diferença de celular usa `mscreen:` (tela e < 64rem). Este teste lê o fonte e reprova qualquer
 * `max-lg:` — inclusive nas pastas mobile/.
 */

const ROOT = resolve(__dirname, '../../..');
const PASTAS = ['saude-financeira', 'relatorios'];
// ProventosDistribuicaoChart só é usado nos Relatórios (conferido por grep na fatia B).
const ARQUIVOS_EXTRAS = ['analises/ProventosDistribuicaoChart.tsx'];

function listar(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return listar(caminho);
    return /\.(tsx?|css)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe('páginas que imprimem: zero max-lg:', () => {
  const arquivos = [
    ...PASTAS.flatMap((p) => listar(join(ROOT, p))),
    ...ARQUIVOS_EXTRAS.map((f) => join(ROOT, f)),
  ];

  it('encontra os arquivos das duas páginas', () => {
    expect(arquivos.length).toBeGreaterThan(15);
  });

  it.each(arquivos.map((a) => [relative(ROOT, a), a]))('%s', (_rel, arquivo) => {
    const linhas = readFileSync(arquivo, 'utf8')
      .split('\n')
      .map((texto, i) => ({ texto, n: i + 1 }))
      .filter(({ texto }) => /max-lg:|ResponsiveTable/.test(texto));
    expect(linhas.map(({ n, texto }) => `${n}: ${texto.trim()}`)).toEqual([]);
  });
});
