/**
 * Textos de "Meus cenários" (Bloco D). Dividido de textosBlocoD.test.ts na fatia 0 da v2.4 (mesmas
 * asserções). Dono a partir daqui: fatia C2 (premissas em branco, caso 23 com linguagemV2).
 */
import { describe, expect, it } from 'vitest';
import {
  ID_RODAPE_CENARIOS,
  RODAPE_CENARIOS,
  TEXTOS_CENARIOS,
} from '@/services/analiseAtivos/textosCenarios';
import {
  TEXTOS_LITERAIS_OBRIGATORIOS,
  ehTextoLiteral,
} from '@/services/analiseAtivos/textosLiterais';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
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

  it('caso 23 (v2.4): linguagemV2 em todas as folhas; o rodapé só passa por ser literal registrado', () => {
    const achados = TODAS.map(([k, v]) => [k, encontrarProibidasV2(v)] as const).filter(
      ([, p]) => p.length > 0,
    );
    expect(achados).toEqual([]);
    expect(TEXTOS_LITERAIS_OBRIGATORIOS[ID_RODAPE_CENARIOS]?.texto).toBe(RODAPE_CENARIOS);
    expect(ehTextoLiteral(RODAPE_CENARIOS)).toBe(true);
    expect(encontrarProibidasV2(RODAPE_CENARIOS, { ignorarLiterais: true })).toEqual([]);
    expect(encontrarProibidasV2(RODAPE_CENARIOS).length).toBeGreaterThan(0);
  });

  it('v2.4 (spec §4.4): nenhum valor sugerido; placeholders só de formato; nunca "faltam"', () => {
    const valores = TODAS.map(([, v]) => v);
    expect(valores.filter((v) => /padrão:/i.test(v))).toEqual([]);
    expect(valores.filter((v) => /\bfaltam?\b/i.test(v))).toEqual([]);
    const c = TEXTOS_CENARIOS.campos;
    for (const p of [
      c.yieldAcao.placeholder,
      c.plAlvo.placeholder,
      c.gPct.placeholder,
      c.kPct.placeholder,
      c.yieldFii.placeholder,
      c.pvpAlvo.placeholder,
      c.rendaMensal.placeholder,
    ]) {
      expect(p).toMatch(/^ex\.: /);
    }
    expect(TEXTOS_CENARIOS.secoes.premissasSub).toBe('em branco até você preencher');
    expect(TEXTOS_CENARIOS.salvamento.restaurar).toBe('Limpar minhas premissas');
    expect(TEXTOS_CENARIOS.metaRenda.diferencaTexto).toContain(
      'diferença para a meta configurada por você',
    );
  });
});
