/**
 * Toda rota de src/app/api/** precisa estar classificada em ACESSO_ROTAS (F0: só classificação).
 * A F2 estende: rota 'pro'/'adv' sem requireAuthWithActing e sem exigirPlano = falha.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACESSO_ROTAS, classificarRota } from '../acessoRotas';

const RAIZ_API = path.resolve(__dirname, '../../../app/api');

function rotas(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === '__tests__' || nome === 'node_modules') continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...rotas(p));
    else if (nome === 'route.ts' || nome === 'route.tsx') out.push(p);
  }
  return out;
}

/** src/app/api/foo/[id]/route.ts → /api/foo/[id] (grupos de rota "(x)" somem). */
function pathnameDaRota(arquivo: string): string {
  const rel = path.relative(RAIZ_API, path.dirname(arquivo)).split(path.sep);
  const segmentos = rel.filter((s) => s && !/^\(.*\)$/.test(s));
  return ['/api', ...segmentos].join('/');
}

describe('ACESSO_ROTAS cobre todas as rotas da API', () => {
  const todas = rotas(RAIZ_API).map(pathnameDaRota).sort();

  it('encontra as rotas', () => {
    expect(todas.length).toBeGreaterThan(200);
  });

  it('nenhuma rota sem classificação', () => {
    const sem = todas.filter((r) => classificarRota(r) === null);
    expect(sem).toEqual([]);
  });

  it('todo prefixo de ACESSO_ROTAS casa com alguma rota (sem entrada morta)', () => {
    // Reservado: /api/public (citado no desenho, ainda sem rota).
    const reservados = new Set(['/api/public']);
    const mortos = Object.keys(ACESSO_ROTAS).filter(
      (k) => !reservados.has(k) && !todas.some((r) => classificarRota(r)?.prefixo === k),
    );
    expect(mortos).toEqual([]);
  });
});
