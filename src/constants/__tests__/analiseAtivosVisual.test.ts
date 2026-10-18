import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  COLUNAS,
  CORES_EXCECAO_ATENDE,
  CORES_PERMITIDAS,
  VERDE_ATENDE,
  DIRECAO_PADRAO,
  ORDEM_PADRAO,
} from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_QUADRO } from '@/services/analiseAtivos/textosQuadro';

const FONTE = readFileSync(path.join(__dirname, '..', 'analiseAtivosVisual.ts'), 'utf8');

describe('analiseAtivosVisual', () => {
  it('só cores da paleta My Finance, cinzas do app, negativos e a exceção do ✓ verde', () => {
    const hex = [
      ...new Set([...FONTE.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase())),
    ];
    const permitidas = new Set(
      [...CORES_PERMITIDAS, ...CORES_EXCECAO_ATENDE].map((c) => c.toUpperCase()),
    );
    expect(hex.filter((h) => !permitidas.has(h))).toEqual([]);
    expect(hex.length).toBeGreaterThan(5);
  });

  it('exceção 17/10: o verde do ✓ atendido fica FORA de CORES_PERMITIDAS', () => {
    const permitidas = new Set(CORES_PERMITIDAS.map((c) => c.toUpperCase()));
    for (const v of Object.values(VERDE_ATENDE))
      expect(permitidas.has(v.toUpperCase())).toBe(false);
    expect(CORES_EXCECAO_ATENDE).toEqual([VERDE_ATENDE.claro, VERDE_ATENDE.escuro]);
  });

  it('sem verde/âmbar: nenhuma classe Tailwind de green/emerald/amber/yellow/red-*', () => {
    expect(FONTE).not.toMatch(/\b(?:text|bg|border)-(?:green|emerald|amber|yellow|red|lime)-/);
  });

  it('colunas referenciam textos existentes; toda ordem tem direção padrão', () => {
    // v2.4: colunas novas (Critérios) têm o rótulo em textosQuadro (o textosTela só muda na F)
    const rotulos = {
      ...(TEXTOS_TELA.quadro.colunas as Record<string, string>),
      ...(TEXTOS_QUADRO.colunas as Record<string, string>),
    };
    const dicas = TEXTOS_QUADRO.dicas as Record<string, string>;
    for (const classe of ['acao', 'fii'] as const) {
      for (const modo of ['resumo', 'detalhado'] as const) {
        for (const c of COLUNAS[classe][modo]) {
          expect(rotulos[c.rotulo], c.rotulo).toBeTruthy();
          if (c.ordem) expect(DIRECAO_PADRAO[c.ordem]).toBeTruthy();
          if (c.dica) expect(dicas[c.dica], c.dica).toBeTruthy();
          expect(c.codigo).not.toBe('indiceMf');
        }
      }
    }
  });

  it('v2.4: ordem padrão A–Z e nenhuma constante do indicador antigo', () => {
    expect(ORDEM_PADRAO).toBe('ticker');
    expect(Object.keys(DIRECAO_PADRAO)).not.toContain('indiceMf');
    expect(FONTE).not.toMatch(/\b(?:ANEL|FAIXA_INDICE|STATUS_CRITERIO|FILTROS_RAPIDOS)\b/);
  });
});
