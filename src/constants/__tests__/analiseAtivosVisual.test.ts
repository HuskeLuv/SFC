import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  COLUNAS,
  CORES_PERMITIDAS,
  DIRECAO_PADRAO,
  FILTROS_RAPIDOS,
  STATUS_CRITERIO,
  faixaIndice,
} from '@/constants/analiseAtivosVisual';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';

const FONTE = readFileSync(path.join(__dirname, '..', 'analiseAtivosVisual.ts'), 'utf8');

describe('analiseAtivosVisual', () => {
  it('só cores da paleta My Finance, cinzas do app e negativos', () => {
    const hex = [
      ...new Set([...FONTE.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase())),
    ];
    const permitidas = new Set(CORES_PERMITIDAS.map((c) => c.toUpperCase()));
    expect(hex.filter((h) => !permitidas.has(h))).toEqual([]);
    expect(hex.length).toBeGreaterThan(5);
  });

  it('sem verde/âmbar: nenhuma classe Tailwind de green/emerald/amber/yellow/red-*', () => {
    expect(FONTE).not.toMatch(/\b(?:text|bg|border)-(?:green|emerald|amber|yellow|red|lime)-/);
  });

  it('semáforo: atende e parcial em patrimonio com ícones diferentes; só nao_atende vermelho', () => {
    expect(STATUS_CRITERIO.atende.texto).toContain(MYFINANCE_BRAND.patrimonio);
    expect(STATUS_CRITERIO.parcial.texto).toContain(MYFINANCE_BRAND.patrimonio);
    expect(STATUS_CRITERIO.atende.icone).not.toBe(STATUS_CRITERIO.parcial.icone);
    expect(STATUS_CRITERIO.nao_atende.texto).toContain('#D92D20');
    expect(STATUS_CRITERIO.sem_dado.borda).toContain('border-dashed');
    const vermelhos = Object.entries(STATUS_CRITERIO).filter(([, e]) =>
      e.texto.includes('#D92D20'),
    );
    expect(vermelhos.map(([k]) => k)).toEqual(['nao_atende']);
  });

  it('colunas e filtros referenciam textos existentes; toda ordem tem direção padrão', () => {
    const rotulos = TEXTOS_TELA.quadro.colunas as Record<string, string>;
    const filtros = TEXTOS_TELA.quadro.filtros as Record<string, string>;
    for (const classe of ['acao', 'fii'] as const) {
      for (const modo of ['resumo', 'detalhado'] as const) {
        for (const c of COLUNAS[classe][modo]) {
          expect(rotulos[c.rotulo], c.rotulo).toBeTruthy();
          if (c.ordem) expect(DIRECAO_PADRAO[c.ordem]).toBeTruthy();
        }
      }
      for (const f of FILTROS_RAPIDOS[classe]) expect(filtros[f], f).toBeTruthy();
    }
  });

  it('faixaIndice é só dado', () => {
    expect(faixaIndice(9.01)).toBe('8 a 10');
    expect(faixaIndice(0.08)).toBe('0 a 4');
    expect(faixaIndice(null)).toBeNull();
  });
});
