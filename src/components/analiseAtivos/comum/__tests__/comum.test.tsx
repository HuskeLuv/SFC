// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import BarrasDezAnos, { dezAnos, resumoBarras, tituloAno } from '../BarrasDezAnos';
import ValorAnalise from '../ValorAnalise';
import SeloFonteCvm from '../SeloFonteCvm';
import SeloEstado from '../SeloEstado';
import { formatarAnalise, formatarEstado } from '../formatarAnalise';
import { CORES_PERMITIDAS } from '@/constants/analiseAtivosVisual';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/textos';
import type { TipoSeloEstado } from '@/types/analiseAtivosApi';

afterEach(cleanup);

describe('formatarAnalise', () => {
  it('casos da spec', () => {
    expect(formatarAnalise(-0.4, 'multiplo')).toBe('−0,4×');
    expect(formatarAnalise(3.98, 'pct')).toBe('3,98%');
    expect(formatarAnalise(4.3, 'pp')).toBe('+4,3 p.p.');
    expect(formatarAnalise(1.2e9, 'moedaCompacta')).toBe('R$ 1,2 bi');
  });

  it('sinal tipográfico, zero sem sinal e moeda negativa', () => {
    expect(formatarAnalise(-0.4, 'pp')).toBe('−0,4 p.p.');
    expect(formatarAnalise(-36, 'pctSinal')).toBe('−36,0%');
    expect(formatarAnalise(-0.04, 'multiplo')).toBe('0,0×');
    expect(formatarAnalise(0, 'pp')).toBe('0,0 p.p.');
    expect(formatarAnalise(-2.7e6, 'moedaCompacta')).toBe('−R$ 2,7 mi');
    expect(formatarAnalise(147.93, 'moeda')).toBe('R$ 147,93');
    expect(formatarAnalise(1234, 'inteiro')).toBe('1.234');
    expect(formatarAnalise(9.01, 'numero')).toBe('9,0');
    expect(formatarAnalise(0.885, 'numero2')).toBe('0,89');
    expect(formatarAnalise(Number.NaN, 'pct')).toBe('—');
    expect(formatarAnalise(-1.5, 'pct')).not.toContain('-');
  });

  it('formatarEstado: ok, ausente e não se aplica', () => {
    expect(formatarEstado({ estado: 'ok', valor: 10 }, 'multiplo')).toBe('10,0×');
    expect(formatarEstado({ estado: 'ausente', motivo: 'x', texto: 'sem dado' }, 'pct')).toBe('—');
    expect(
      formatarEstado({ estado: 'nao_se_aplica', motivo: 'financeira', texto: 'banco' }, 'pct'),
    ).toBe('n/a');
  });
});

describe('BarrasDezAnos', () => {
  const serie = [
    { ano: 2016, valor: 1.0 },
    { ano: 2017, valor: 1.2 },
    { ano: 2018, valor: -0.4 },
    { ano: 2019, valor: null },
    { ano: 2020, valor: 1.5 },
    { ano: 2021, valor: 1.6 },
    { ano: 2022, valor: 1.7 },
    { ano: 2023, valor: 1.8 },
    { ano: 2024, valor: 1.9 },
    { ano: 2025, valor: 2.45, suspeito: true },
  ];

  it('lucro: 10 barras, prejuízo para baixo, sem dado e em conferência tracejados', () => {
    const { container } = render(<BarrasDezAnos modo="lucro" serie={serie} />);
    expect(container.querySelectorAll('rect')).toHaveLength(10);
    expect(container.querySelectorAll('[data-barra="negativo"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-barra="sem_dado"]')).toHaveLength(1);
    const conf = container.querySelector('[data-barra="em_conferencia"]');
    expect(conf).toHaveAttribute('stroke-dasharray', '3 2');
    expect(container.querySelector('[data-zero]')).not.toBeNull();
    // prejuízo começa na linha do zero (para baixo)
    const zeroY = Number(container.querySelector('[data-zero]')?.getAttribute('y1'));
    const neg = container.querySelector('[data-barra="negativo"]');
    expect(Number(neg?.getAttribute('y'))).toBe(zeroY);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Lucro em 8 de 9 anos com dado, prejuízo em 1, sem dado em 1, em conferência em 1',
    );
  });

  it('title por ano', () => {
    expect(tituloAno({ ano: 2018, valor: -0.4 })).toBe('2018: prejuízo de R$ 0,40');
    expect(tituloAno({ ano: 2019, valor: null })).toBe('2019: sem dado');
    expect(tituloAno({ ano: 2025, valor: 2.45, suspeito: true })).toBe(
      '2025: R$ 2,45, em conferência',
    );
    expect(tituloAno({ ano: 2024, valor: 4.2e9 })).toBe('2024: R$ 4,2 bi');
  });

  it('série curta é completada à esquerda com anos sem dado', () => {
    const pontos = dezAnos([
      { ano: 2022, valor: 0.9 },
      { ano: 2023, valor: 0.5 },
    ]);
    expect(pontos).toHaveLength(10);
    expect(pontos[0]).toEqual({ ano: 2014, valor: null });
    expect(pontos[9].ano).toBe(2023);
    expect(resumoBarras([], 'lucro')).toBe('Sem histórico anual');
  });

  it('aria-label do consumidor prevalece', () => {
    render(<BarrasDezAnos modo="lucro" serie={serie} ariaLabel="Rendimento por cota" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Rendimento por cota');
  });

  it('seguidos: traços cheios até n e rótulo', () => {
    const { container } = render(<BarrasDezAnos modo="seguidos" quantidade={12} />);
    expect(container.querySelectorAll('[data-traco="cheio"]')).toHaveLength(10);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '12 anos seguidos de lucro');
    expect(container.textContent).toContain('12 anos');
    cleanup();
    const { container: c3 } = render(<BarrasDezAnos modo="seguidos" quantidade={3} />);
    expect(c3.querySelectorAll('[data-traco="cheio"]')).toHaveLength(3);
    expect(c3.querySelectorAll('[data-traco="vazio"]')).toHaveLength(7);
    cleanup();
    const { container: c0 } = render(<BarrasDezAnos modo="seguidos" quantidade={null} />);
    expect(c0.querySelectorAll('[data-traco="cheio"]')).toHaveLength(0);
    expect(c0.textContent).toBe('—');
  });
});

describe('ValorAnalise', () => {
  it('ok: número formatado', () => {
    render(<ValorAnalise valor={{ estado: 'ok', valor: 3.98 }} formato="pct" />);
    expect(screen.getByText('3,98%')).toBeInTheDocument();
  });

  it('ausente: "—" com title do motivo (e texto para leitor de tela)', () => {
    const { container } = render(
      <ValorAnalise
        valor={{
          estado: 'ausente',
          motivo: 'div:fonte_defasada',
          texto: 'proventos em conferência',
        }}
        formato="pct"
      />,
    );
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz).toHaveAttribute('title', 'proventos em conferência');
    expect(within(raiz).getByText('—')).toBeInTheDocument();
    expect(within(raiz).getByText('proventos em conferência')).toHaveClass('sr-only');
  });

  it('não se aplica: "n/a"; mostrarMotivo deixa o motivo visível', () => {
    const { container } = render(
      <ValorAnalise
        valor={{ estado: 'nao_se_aplica', motivo: 'financeira', texto: 'não se aplica a bancos' }}
        formato="multiplo"
        mostrarMotivo
      />,
    );
    expect(screen.getByText('n/a')).toBeInTheDocument();
    expect(screen.getByText('não se aplica a bancos')).not.toHaveClass('sr-only');
    expect(container.firstElementChild).toHaveAttribute('title', 'não se aplica a bancos');
  });
});

describe('Selos', () => {
  it('SeloFonteCvm: completo e compacto', () => {
    render(<SeloFonteCvm />);
    expect(screen.getByText('fonte CVM · pode diferir do relatório do gestor')).toBeInTheDocument();
    cleanup();
    const { container } = render(<SeloFonteCvm compacto />);
    expect(container.firstElementChild).toHaveAttribute(
      'title',
      'fonte CVM · pode diferir do relatório do gestor',
    );
    expect(screen.getByText('fonte CVM')).toBeInTheDocument();
  });

  it('SeloEstado: texto de cada tipo; planejado tracejado; texto alternativo', () => {
    const tipos: TipoSeloEstado[] = [
      'criterios_provisorios',
      'data_estimada',
      'proventos_em_conferencia',
      'sem_negociacao_recente',
      'baixa_liquidez',
      'planejado',
      'na_carteira',
      'em_conferencia',
      'cotacao_esporadica',
    ];
    for (const tipo of tipos) {
      const { container } = render(<SeloEstado tipo={tipo} />);
      expect(container.textContent?.length).toBeGreaterThan(0);
      expect(encontrarPalavrasProibidas(container.textContent ?? '')).toEqual([]);
      cleanup();
    }
    const { container } = render(<SeloEstado tipo="planejado" texto="Planejado · 5%" />);
    expect(container.textContent).toBe('Planejado · 5%');
    expect(container.firstElementChild?.className).toContain('border-dashed');
  });
});

describe('paleta', () => {
  it('nenhuma cor fora da paleta nos componentes comuns e na casca da 0b', () => {
    const arquivos = [
      'BarrasDezAnos.tsx',
      'ValorAnalise.tsx',
      'SeloFonteCvm.tsx',
      'SeloEstado.tsx',
      '../shell/RodapeLegal.tsx',
      '../shell/BannerNovidade.tsx',
    ];
    const permitidas = new Set(CORES_PERMITIDAS.map((c) => c.toUpperCase()));
    const fora: string[] = [];
    for (const a of arquivos) {
      const fonte = readFileSync(path.join(__dirname, '..', a), 'utf8');
      for (const m of fonte.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        if (!permitidas.has(m[0].toUpperCase())) fora.push(`${a}: ${m[0]}`);
      }
    }
    expect(fora).toEqual([]);
  });
});
