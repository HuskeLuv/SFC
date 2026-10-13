/**
 * Textos do Comparador e das entradas do Comparador (Bloco D). Dividido de textosBlocoD.test.ts na
 * fatia 0 da v2.4 (mesmas asserções). Dono a partir daqui: fatia D (sem ★/destaque, literais da
 * v2.4 com linguagemV2).
 */
import { describe, expect, it } from 'vitest';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { PLACEHOLDERS_PERMITIDOS } from '@/services/analiseAtivos/textosTela';
import {
  PLACEHOLDERS_BLOCO_D,
  encontrarPalavrasProibidasBlocoD,
  folhasTexto,
} from '@/services/analiseAtivos/regras/comum/varreduraTextos';

const OBJETOS = { TEXTOS_COMPARADOR, TEXTOS_ENTRADAS_COMPARADOR } as const;
const TODAS = Object.entries(OBJETOS).flatMap(([nome, obj]) => folhasTexto(obj, nome));
const PERMITIDOS: readonly string[] = [...PLACEHOLDERS_PERMITIDOS, ...PLACEHOLDERS_BLOCO_D];

describe('textos do comparador (bloco D)', () => {
  it('os 2 objetos têm textos (sanidade da varredura)', () => {
    for (const [nome, obj] of Object.entries(OBJETOS)) {
      expect(folhasTexto(obj).length, nome).toBeGreaterThan(10);
    }
  });

  it('nenhuma palavra proibida do bloco D em nenhuma folha dos 2 objetos', () => {
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

  it('decisão 9: Resumo sem placar (sem "maior", sem contagem de ★)', () => {
    const resumo = folhasTexto(TEXTOS_COMPARADOR.resumo).map(([, v]) => v);
    expect(resumo.filter((v) => /\bmaior\b|★/i.test(v))).toEqual([]);
    expect(TEXTOS_COMPARADOR.resumo.responsabilidade).toContain('Não indicam qual ativo escolher');
  });

  it('★ sempre acompanhado de texto ("destaque")', () => {
    expect(TEXTOS_COMPARADOR.destaque.rotulo).toBe('destaque');
    expect(TEXTOS_COMPARADOR.destaque.srOnly).toMatch(/^destaque: /);
  });
});
