import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import {
  COLUNAS,
  CORES_EXCECAO_ANALISE,
  CORES_EXCECAO_ATENDE,
  CORES_PERMITIDAS,
  DOURADO_ANALISE,
  HEX_EXCECAO_ANALISE,
  VISUAL_V2,
  VERDE_ATENDE,
  DIRECAO_PADRAO,
  ORDEM_PADRAO,
} from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_QUADRO } from '@/services/analiseAtivos/textosQuadro';

const FONTE = readFileSync(path.join(__dirname, '..', 'analiseAtivosVisual.ts'), 'utf8');

describe('analiseAtivosVisual', () => {
  it('só cores da paleta My Finance, cinzas do app, negativos e as exceções (✓ verde, visual v2)', () => {
    const hex = [
      ...new Set([...FONTE.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase())),
    ];
    const permitidas = new Set(
      [...CORES_PERMITIDAS, ...CORES_EXCECAO_ATENDE, ...HEX_EXCECAO_ANALISE].map((c) =>
        c.toUpperCase(),
      ),
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

  describe('F4 (item C): exceção de paleta do visual v2, só na Análise', () => {
    const permitidas = new Set(CORES_PERMITIDAS.map((c) => c.toUpperCase()));

    it('a exceção fica FORA de CORES_PERMITIDAS (componentes seguem reprovando esses hex)', () => {
      for (const h of HEX_EXCECAO_ANALISE) expect(permitidas.has(h.toUpperCase())).toBe(false);
    });

    it('dourado #B8842E nos dois temas', () => {
      expect(CORES_EXCECAO_ANALISE.dourado).toEqual({ claro: '#B8842E', escuro: '#B8842E' });
      expect(DOURADO_ANALISE).toBe('#B8842E');
    });

    it('nenhum verde/vermelho na exceção (o ✓ verde continua sendo a única exceção verde)', () => {
      // matiz: verde ~ 90–160°, vermelho < 20° ou > 340° com saturação alta
      const matiz = (h: string) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        if (d < 0.08) return { h: -1, s: 0 };
        let hh = 0;
        if (max === r) hh = ((g - b) / d) % 6;
        else if (max === g) hh = (b - r) / d + 2;
        else hh = (r - g) / d + 4;
        return { h: (hh * 60 + 360) % 360, s: d / max };
      };
      for (const h of HEX_EXCECAO_ANALISE) {
        const { h: m, s } = matiz(h);
        const verde = m >= 90 && m <= 160;
        const vermelho = (m >= 0 && m < 20) || m > 340;
        expect(verde || (vermelho && s > 0.5), h).toBe(false);
      }
    });

    it('as classes do VISUAL_V2 só usam hex da paleta ou da exceção, com variante dark', () => {
      const todas = new Set(
        [...CORES_PERMITIDAS, ...HEX_EXCECAO_ANALISE].map((c) => c.toUpperCase()),
      );
      const classes = Object.values(VISUAL_V2).flat().join(' ');
      for (const m of classes.matchAll(/#[0-9A-Fa-f]{6}\b/g))
        expect(todas.has(m[0].toUpperCase()), m[0]).toBe(true);
      for (const v of Object.values(VISUAL_V2).flat()) {
        if (/bg-\[#/.test(v)) expect(v, v).toMatch(/dark:/);
      }
    });

    it('nenhum componente da Análise escreve um hex da exceção direto (vem de VISUAL_V2)', () => {
      const raiz = path.join(__dirname, '..', '..', 'components', 'analiseAtivos');
      const exc = new Set(HEX_EXCECAO_ANALISE.map((c) => c.toUpperCase()));
      // #309: o marcador dourado da cotação de Meus cenários (autorizado em 17/10) fica como está
      const ANTERIORES = new Set(['BarrasResultados.tsx']);
      const fora: string[] = [];
      const varrer = (dir: string) => {
        for (const nome of readdirSync(dir)) {
          const p = path.join(dir, nome);
          if (statSync(p).isDirectory()) {
            if (nome !== '__tests__') varrer(p);
          } else if (/\.(tsx?|css)$/.test(nome) && !ANTERIORES.has(nome)) {
            for (const m of readFileSync(p, 'utf8').matchAll(/#[0-9A-Fa-f]{6}\b/g))
              if (exc.has(m[0].toUpperCase())) fora.push(`${nome}: ${m[0]}`);
          }
        }
      };
      varrer(raiz);
      expect(fora).toEqual([]);
    });
  });
});
