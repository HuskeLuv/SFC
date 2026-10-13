// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BlocoDividendos from '../BlocoDividendos';
import BlocoEventos from '../BlocoEventos';
import BlocoKpis from '../BlocoKpis';
import CabecalhoAtivo from '../CabecalhoAtivo';
import CardEducacao from '../CardEducacao';
import GraficoLucroCotacao from '../GraficoLucroCotacao';
import SeloFrescor from '../SeloFrescor';
import { ConferenciaPaginaProvider } from '@/components/analiseAtivos/comum/PorQueConferencia';
import { ATIVO_WEGE3 } from '@/test/fixtures/analiseAtivos/respostas';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/textos';

describe('CabecalhoAtivo', () => {
  it('ticker, tags sem índice de mercado, preço com data e fonte; slot de ações', () => {
    // Bloco D: a linha de ações lê config.recursos.comparador (React Query)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CabecalhoAtivo ativo={ATIVO_WEGE3} slotAcoes={<button type="button">Planejar</button>} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('WEGE3');
    const header = screen.getByRole('banner');
    expect(header.textContent).not.toMatch(/IBOV|Ibovespa/);
    expect(screen.getByText('R$ 41,20')).toBeInTheDocument();
    expect(screen.getByText('fechamento de 29/09 · fonte B3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planejar' })).toBeInTheDocument();
  });

  it('v2.4: sem Índice MF — nem o selo "dados incompletos" do Índice aparece', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <CabecalhoAtivo ativo={ATIVO_WEGE3} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('dados incompletos')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Índice|semáforo|nota/i);
  });

  it('chips "Na carteira" e "Planejado" juntos quando a posição tem alvo (overlay)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        posicoes: {
          WEGE3: { portfolioId: 'p', quantidade: 120, categoria: 'acoes', objetivoPct: 6 },
        },
        planejados: {},
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CabecalhoAtivo ativo={ATIVO_WEGE3} seloCarteira={null} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Planejado')).toBeInTheDocument();
    expect(screen.getByText('Na carteira')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

describe('BlocoKpis', () => {
  it('em conferência: borda tracejada + selo; ausente mostra o motivo em texto', () => {
    const { container } = render(
      <BlocoKpis
        classe="acao"
        kpis={[
          ...ATIVO_WEGE3.kpis,
          {
            codigo: 'payout',
            rotulo: 'Payout',
            valor: {
              estado: 'ausente',
              motivo: 'fonte_defasada',
              texto: 'proventos em conferência',
            },
            formato: 'pct',
            sub: null,
            selo: 'proventos_em_conferencia',
          },
        ]}
      />,
    );
    const dy = container.querySelector('[data-kpi="dy12m"]')!;
    expect(dy.className).toMatch(/border-dashed/);
    expect(within(dy as HTMLElement).getByText('proventos em conferência')).toBeInTheDocument();
    expect(container.querySelector('[data-kpi="pl"]')!.className).not.toMatch(/border-dashed/);
    const payout = container.querySelector('[data-kpi="payout"]') as HTMLElement;
    expect(within(payout).getByText('—')).toBeInTheDocument();
    expect(within(payout).getAllByText('proventos em conferência')).toHaveLength(1);
  });
});

describe('GraficoLucroCotacao', () => {
  const grafico = {
    ...ATIVO_WEGE3.grafico,
    serieA: {
      rotulo: 'Lucro por ação',
      pontos: ['2021', '2022', '2023', '2024', '2025'].map((chave, i) => ({
        chave,
        valor: 1 + i * 0.1,
      })),
    },
    serieB: {
      rotulo: 'Cotação',
      pontos: ['2021', '2022', '2023', '2024', '2025'].map((chave, i) => ({
        chave,
        valor: 30 + i,
      })),
    },
  };

  it('figure + figcaption; pílulas 5A/10A com aria-pressed', () => {
    const { container } = render(
      <GraficoLucroCotacao ticker="WEGE3" classe="acao" grafico={grafico} />,
    );
    expect(container.querySelector('figure figcaption')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Período de 10 anos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Período de 5 anos' }));
    expect(screen.getByRole('button', { name: 'Período de 5 anos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('base 100 em 2021')).toBeInTheDocument();
  });

  it('tooltip pelo teclado: setas percorrem os pontos e o texto vai para aria-live', () => {
    const { container } = render(
      <GraficoLucroCotacao ticker="WEGE3" classe="acao" grafico={grafico} />,
    );
    const alvo = container.querySelector('[data-grafico-svg]') as HTMLElement;
    fireEvent.focus(alvo);
    const live = alvo.querySelector('[aria-live]')!;
    expect(live.textContent).toMatch(/^últ\. 12m:/);
    fireEvent.keyDown(alvo, { key: 'ArrowLeft' });
    expect(live.textContent).toMatch(/^2025: Lucro por ação R\$ 1,40 \(140\)/);
    fireEvent.keyDown(alvo, { key: 'Home' });
    expect(live.textContent).toMatch(/^2021: .* \(100\)/);
    expect(container.querySelector('[data-tooltip]')).toHaveTextContent('2021');
  });

  it('"Ver dados em tabela" troca o SVG por uma tabela real com o mesmo número de anos + últ. 12m', () => {
    const { container } = render(
      <GraficoLucroCotacao ticker="WEGE3" classe="acao" grafico={grafico} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver dados em tabela' }));
    const tabela = container.querySelector('[data-tabela-grafico] table')!;
    expect(within(tabela as HTMLElement).getAllByRole('row')).toHaveLength(1 + 5 + 1);
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver gráfico' }));
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('cotação em conferência desde depois do último ano fechado: últ. 12m tracejado + nota', () => {
    const { container } = render(
      <ConferenciaPaginaProvider
        valor={{
          ticker: 'WEGE3',
          classe: 'acao',
          versao: 'v2',
          reporteHabilitado: false,
          frescorBlocos: null,
          conferencias: [
            {
              grupo: 'preco_base',
              campos: ['preco'],
              exibicao: 'ocultar',
              motivo: 'base da cotação em conferência',
              desde: '2026-04-29',
              origem: 'regra',
              caso: null,
            },
          ],
        }}
      >
        <GraficoLucroCotacao ticker="WEGE3" classe="acao" grafico={grafico} />
      </ConferenciaPaginaProvider>,
    );
    expect(container.querySelector('[data-trecho-conferencia]')).toBeNull();
    expect(container.querySelector('circle[data-ponto-conferencia]')).not.toBeNull();
    expect(container.querySelector('figcaption')!.textContent).toContain(
      'Trecho tracejado: cotação em conferência desde 29/04/2026.',
    );
  });

  it('menos de 3 pontos: "histórico insuficiente para o gráfico"', () => {
    render(
      <GraficoLucroCotacao
        ticker="WEGE3"
        classe="acao"
        grafico={{ ...ATIVO_WEGE3.grafico, insuficiente: true }}
      />,
    );
    expect(screen.getByText('histórico insuficiente para o gráfico')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver dados em tabela' })).not.toBeInTheDocument();
  });
});

describe('BlocoDividendos', () => {
  it('ano em conferência tracejado com título, selo e nota; só anos fechados', () => {
    const { container } = render(
      <BlocoDividendos classe="acao" dividendos={ATIVO_WEGE3.dividendos} />,
    );
    const sus = container.querySelector('rect[data-ano="2025"]')!;
    expect(sus.getAttribute('data-suspeito')).toBe('true');
    expect(sus.getAttribute('stroke-dasharray')).toBe('3 2');
    expect(sus.querySelector('title')!.textContent).toBe('2025: R$ 2,45 (em conferência)');
    expect(
      container.querySelector('rect[data-ano="2024"]')!.getAttribute('stroke-dasharray'),
    ).toBeNull();
    expect(container.querySelector('rect[data-ano="2026"]')).toBeNull();
    expect(screen.getAllByText('proventos em conferência').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/fora do crescimento anual/).length).toBeGreaterThan(0);
    expect(screen.getByText('Últimos 12 meses: R$ 1,64')).toBeInTheDocument();
  });
});

describe('BlocoEventos, CardEducacao e SeloFrescor', () => {
  it('evento estimado com selo "data estimada"; vazio de FII com texto próprio', () => {
    const { rerender } = render(<BlocoEventos classe="acao" eventos={ATIVO_WEGE3.eventos} />);
    expect(screen.getByText('data estimada')).toBeInTheDocument();
    expect(screen.queryByText(/JCP estimado/i)).not.toBeInTheDocument();
    rerender(<BlocoEventos classe="fii" eventos={[]} />);
    expect(screen.getByText(/Para FIIs, aparecem aqui as datas-com/)).toBeInTheDocument();
  });

  it('Educação aponta para o link da classe', () => {
    render(<CardEducacao educacao={ATIVO_WEGE3.educacao} />);
    expect(screen.getByRole('link', { name: 'Abrir na Educação' })).toHaveAttribute(
      'href',
      '/educacao',
    );
  });

  it('frescor com fontes e aviso de atraso com ícone + texto', () => {
    const { container, rerender } = render(
      <SeloFrescor
        frescor={{
          cotacao: 'cotação B3 de 29/09',
          fundamentos: 'CVM DFP 2025 / ITR 2T26',
          fii: null,
          painelAtrasado: false,
        }}
      />,
    );
    expect(container.textContent).toBe('Dados: cotação B3 de 29/09 · CVM DFP 2025 / ITR 2T26');
    rerender(
      <SeloFrescor
        frescor={{
          cotacao: 'cotação B3 de 29/09',
          fundamentos: null,
          fii: 'informe FII ago/26',
          painelAtrasado: true,
        }}
      />,
    );
    expect(screen.getByText('atualização em atraso')).toBeInTheDocument();
  });

  it('varredura de linguagem no topo renderizado', () => {
    const { container } = render(
      <>
        <CabecalhoAtivo ativo={ATIVO_WEGE3} />
        <BlocoKpis classe="acao" kpis={ATIVO_WEGE3.kpis} />
        <BlocoDividendos classe="acao" dividendos={ATIVO_WEGE3.dividendos} />
        <BlocoEventos classe="acao" eventos={ATIVO_WEGE3.eventos} />
        <CardEducacao educacao={ATIVO_WEGE3.educacao} />
      </>,
    );
    expect(encontrarPalavrasProibidas(container.textContent ?? '')).toEqual([]);
  });
});
