// @vitest-environment jsdom
/**
 * A6 (fatia C): card "Variação da cotação" — 4 janelas + distância da máxima com sinal +/− em cor
 * NEUTRA (nenhuma classe de cor semântica), 'sem dado' com o motivo, "sem proventos" no rodapé e a
 * nota do FII sobre rendimentos.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import BlocoRetornosCotacao, {
  dataBr,
  mesAno,
} from '@/components/analiseAtivos/ativo/topo/BlocoRetornosCotacao';
import { TEXTOS_RETORNOS } from '@/services/analiseAtivos/textosRetornos';
import type { RetornosCotacaoApi } from '@/types/analiseAtivosComplementos';

afterEach(cleanup);

const ok = (valor: number) => ({ estado: 'ok' as const, valor });

const ACAO: RetornosCotacaoApi = {
  classe: 'acao',
  ateData: '2026-10-16',
  janelas: [
    { janela: '1m', valor: ok(2.4), anualizado: false },
    { janela: '12m', valor: ok(-8.1), anualizado: false },
    { janela: '5a', valor: ok(11.6), anualizado: true },
    { janela: '10a', valor: ok(19.8), anualizado: true },
  ],
  distanciaMaxima: ok(-14.2),
  maxima: { preco: 58.1, data: '2025-08-12' },
  inicioSerie: '2015-01-02',
  flags: [],
};

const FII: RetornosCotacaoApi = {
  ...ACAO,
  classe: 'fii',
  janelas: [
    ...ACAO.janelas.slice(0, 3),
    {
      janela: '10a',
      valor: {
        estado: 'ausente',
        motivo: 'serie_curta',
        texto: TEXTOS_RETORNOS.serieCurta['10a'],
      },
      anualizado: true,
    },
  ],
  flags: ['serie_curta_10a'],
};

const SEMANTICA = /\b(?:text|bg|border|fill|stroke)-(?:green|red|emerald|rose|success|error)-/;

describe('BlocoRetornosCotacao', () => {
  it('mostra as 5 células com sinal +/−, sem cor semântica', () => {
    const { container } = render(<BlocoRetornosCotacao ticker="WEGE3" retornos={ACAO} />);
    expect(screen.getByRole('heading', { name: TEXTOS_RETORNOS.titulo })).toBeTruthy();
    const celulas = [...container.querySelectorAll('[data-janela]')];
    expect(celulas.map((c) => c.getAttribute('data-janela'))).toEqual([
      '1m',
      '12m',
      '5a',
      '10a',
      'maxima',
    ]);
    expect(celulas.map((c) => c.querySelectorAll('span')[1].textContent)).toEqual([
      '+2,4%',
      '−8,1%',
      '+11,6%',
      '+19,8%',
      '−14,2%',
    ]);
    expect(celulas[1].getAttribute('aria-label')).toBe('12 meses: −8,1%');
    expect(container.innerHTML).not.toMatch(SEMANTICA);
    // a subnota da máxima: preço, data e início da série
    expect(celulas[4].textContent).toContain('R$ 58,10');
    expect(celulas[4].textContent).toContain('12/08/2025');
    expect(celulas[4].textContent).toContain('jan/2015');
  });

  it('rodapé: sem proventos, até a data, rentabilidade passada; ação sem a nota do FII', () => {
    const { container } = render(<BlocoRetornosCotacao ticker="WEGE3" retornos={ACAO} />);
    expect(container.textContent).toContain('sem proventos');
    expect(container.textContent).toContain('até 16/10/2026');
    expect(container.textContent).toContain(TEXTOS_RETORNOS.rentabilidadePassada);
    expect(container.querySelector('[data-nota-fii]')).toBeNull();
  });

  it('FII: nota sobre rendimentos e janela sem dado com o motivo', () => {
    const { container } = render(<BlocoRetornosCotacao ticker="HGLG11" retornos={FII} />);
    expect(container.querySelector('[data-nota-fii]')!.textContent).toBe(TEXTOS_RETORNOS.rodapeFii);
    const dez = container.querySelector('[data-janela="10a"]')!;
    expect(dez.getAttribute('data-estado')).toBe('ausente');
    expect(dez.textContent).toContain(TEXTOS_RETORNOS.semDado);
    expect(dez.textContent).toContain(TEXTOS_RETORNOS.serieCurta['10a']);
    expect(container.innerHTML).not.toMatch(SEMANTICA);
  });

  it('sem máxima (evento em conferência): célula sem dado e sem a subnota', () => {
    const r: RetornosCotacaoApi = {
      ...ACAO,
      distanciaMaxima: {
        estado: 'ausente',
        motivo: 'evento_nao_confirmado',
        texto: TEXTOS_RETORNOS.motivos.evento_nao_confirmado,
      },
      maxima: null,
    };
    const { container } = render(<BlocoRetornosCotacao ticker="WEGE3" retornos={r} />);
    const max = container.querySelector('[data-janela="maxima"]')!;
    expect(max.textContent).toContain(TEXTOS_RETORNOS.motivos.evento_nao_confirmado);
    expect(max.textContent).not.toContain('R$');
  });

  it('datas: dd/mm/aaaa e mmm/aaaa', () => {
    expect(dataBr('2026-10-16')).toBe('16/10/2026');
    expect(mesAno('2015-01-02')).toBe('jan/2015');
    expect(mesAno('2018-03-31')).toBe('mar/2018');
  });
});
