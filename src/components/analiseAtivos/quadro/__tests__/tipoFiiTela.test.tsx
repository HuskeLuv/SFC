// @vitest-environment jsdom
/**
 * v2.5 (fatia B): coluna Tipo só com Tijolo | Papel e FoF/Híbrido como prefixo do segmento
 * (TabelaQuadro.conteudoCelula), e a nota de perfil do tooltip pelo tipo CVM bruto (segmentoTipo).
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { conteudoCelula, observacaoPerfil } from '../TabelaQuadro';
import { comTipoFiiExibido } from '@/services/analiseAtivos/quadro/tipoFiiExibido';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';

function linhaFii(fiiTipo: string, perfil: 'fii_tijolo' | 'fii_papel') {
  return comTipoFiiExibido(
    paraLinhaQuadroApi(
      linhaQuadroDb({
        symbol: 'BCFF11',
        classe: 'fii',
        fiiTipo,
        segmentoCvm: 'Títulos e Valores Mobiliários',
        perfilCriterios: perfil,
        criterios: { '5': { n: 3, de: 6, m: [] } },
      }),
    ),
  );
}

const texto = (n: ReactNode) => render(<>{n}</>).container.textContent;

describe('Tipo e segmento do FII na tabela (v2.5)', () => {
  it('FoF: Tipo = Papel; Segmento = "FoF · Títulos e Valores Mobiliários"', () => {
    const l = linhaFii('fof', 'fii_papel');
    expect(texto(conteudoCelula('tipo', l))).toBe('Papel');
    expect(texto(conteudoCelula('segmento', l))).toBe('FoF · Títulos e Valores Mobiliários');
    expect(observacaoPerfil(l)).toBe(TEXTOS_CRITERIOS.perfil.fof);
  });

  it('híbrido com imóveis ≥ 50% do PL: Tipo = Tijolo; "Híbrido · …" no segmento', () => {
    const l = linhaFii('hibrido', 'fii_tijolo');
    expect(texto(conteudoCelula('tipo', l))).toBe('Tijolo');
    expect(texto(conteudoCelula('segmento', l))).toBe('Híbrido · Títulos e Valores Mobiliários');
    expect(observacaoPerfil(l)).toContain('tijolo');
  });

  it('tijolo e papel puros: sem prefixo no segmento, sem nota de perfil', () => {
    const l = linhaFii('papel', 'fii_papel');
    expect(texto(conteudoCelula('tipo', l))).toBe('Papel');
    expect(texto(conteudoCelula('segmento', l))).toBe('Títulos e Valores Mobiliários');
    expect(observacaoPerfil(l)).toBeNull();
  });
});
