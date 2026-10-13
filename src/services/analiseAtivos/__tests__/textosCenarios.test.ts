/**
 * Textos de "Meus cenários" (Bloco D). Dividido de textosBlocoD.test.ts na fatia 0 da v2.4 (mesmas
 * asserções). Dono a partir daqui: fatia C2 (premissas em branco, caso 23 com linguagemV2).
 */
import { describe, expect, it } from 'vitest';
import { RODAPE_CENARIOS, TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { TEXTOS_ANALISE, formatarTexto } from '@/services/analiseAtivos/textos';
import { PLACEHOLDERS_PERMITIDOS } from '@/services/analiseAtivos/textosTela';
import {
  PLACEHOLDERS_BLOCO_D,
  encontrarPalavrasProibidasBlocoD,
  folhasTexto,
} from '@/services/analiseAtivos/regras/comum/varreduraTextos';

const TODAS = folhasTexto(TEXTOS_CENARIOS, 'TEXTOS_CENARIOS');
const PERMITIDOS: readonly string[] = [...PLACEHOLDERS_PERMITIDOS, ...PLACEHOLDERS_BLOCO_D];

describe('textos dos cenários (bloco D)', () => {
  it('o objeto tem textos (sanidade da varredura)', () => {
    expect(folhasTexto(TEXTOS_CENARIOS).length).toBeGreaterThan(10);
  });

  it('nenhuma palavra proibida do bloco D em nenhuma folha', () => {
    const achados = TODAS.map(([k, v]) => [k, encontrarPalavrasProibidasBlocoD(v)] as const).filter(
      ([, p]) => p.length > 0,
    );
    expect(achados).toEqual([]);
  });

  it('nunca "Notas" como rótulo', () => {
    expect(TODAS.filter(([, v]) => /\bnotas?\b/i.test(v))).toEqual([]);
  });

  it('placeholders: só os permitidos e todos preenchidos por formatarTexto', () => {
    const vars = Object.fromEntries(PERMITIDOS.map((p) => [p, 'X']));
    for (const [k, v] of TODAS) {
      for (const m of v.matchAll(/\{(\w+)\}/g)) {
        expect(PERMITIDOS, `${k}: {${m[1]}}`).toContain(m[1]);
      }
      expect(formatarTexto(v, vars), k).not.toMatch(/[{}]/);
    }
  });

  it('decisão 14: rodapé dos cenários é o rodapeValuation literal (fora da varredura)', () => {
    expect(RODAPE_CENARIOS).toBe(TEXTOS_ANALISE.rodapeValuation);
    expect(TODAS.map(([, v]) => v)).not.toContain(TEXTOS_ANALISE.rodapeValuation);
  });
});
