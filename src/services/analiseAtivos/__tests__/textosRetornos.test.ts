/**
 * A6 (fatia C): varredura própria dos textos da "Variação da cotação" — nada de 'queda' nem
 * 'desconto' (a distância da máxima é só um número, sem leitura de oportunidade), retorno total
 * ("proventos reinvestidos") no rodapé e o texto do FII sobre rendimentos. O card não usa classe de cor semântica.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { folhasTexto } from '@/services/analiseAtivos/regras/comum/varreduraTextos';
import { TEXTOS_RETORNOS } from '@/services/analiseAtivos/textosRetornos';

const PROIBIDAS_RETORNOS = [/\bqueda/i, /\bdesconto/i, /\bdescontad/i, /\bcai[ru]\b/i];

describe('textos da variação da cotação (fatia C)', () => {
  const folhas = folhasTexto(TEXTOS_RETORNOS, 'TEXTOS_RETORNOS');

  it("sem 'queda'/'desconto' em nenhum texto", () => {
    expect(folhas.length).toBeGreaterThan(10);
    for (const [, texto] of folhas)
      for (const re of PROIBIDAS_RETORNOS) expect(texto).not.toMatch(re);
  });

  it('rodapé com "proventos reinvestidos" e o texto do FII sobre rendimentos', () => {
    expect(TEXTOS_RETORNOS.rodape).toContain('proventos reinvestidos');
    expect(TEXTOS_RETORNOS.rodape).toContain('{data}');
    expect(TEXTOS_RETORNOS.rodapeFii).toMatch(/reinvestidos na data-ex/);
  });

  it('o componente não tem texto solto proibido nem cor semântica', () => {
    const fonte = readFileSync(
      resolve(process.cwd(), 'src/components/analiseAtivos/ativo/topo/BlocoRetornosCotacao.tsx'),
      'utf8',
    );
    for (const re of PROIBIDAS_RETORNOS) expect(fonte).not.toMatch(re);
    expect(fonte).not.toMatch(
      /\b(?:text|bg|border|fill|stroke)-(?:green|red|emerald|rose|lime|success|error|danger)-/,
    );
    expect(fonte).not.toMatch(/#(?:[0-9a-f]{3}){1,2}\b/i);
  });
});
