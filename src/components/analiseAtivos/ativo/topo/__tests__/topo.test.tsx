// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import BlocoDividendos from '../BlocoDividendos';
import BlocoEventos from '../BlocoEventos';
import BlocoIndiceSemaforo from '../BlocoIndiceSemaforo';
import BlocoKpis from '../BlocoKpis';
import CabecalhoAtivo from '../CabecalhoAtivo';
import CardEducacao from '../CardEducacao';
import GraficoLucroCotacao from '../GraficoLucroCotacao';
import SeloFrescor from '../SeloFrescor';
import { ATIVO_WEGE3 } from '@/test/fixtures/analiseAtivos/respostas';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/textos';
import type { AtivoTopoResposta, IndiceTopo } from '@/types/analiseAtivosApi';

const indice = (over: Partial<IndiceTopo>): IndiceTopo => ({ ...ATIVO_WEGE3.indice, ...over });

describe('CabecalhoAtivo', () => {
  it('ticker, tags sem índice de mercado, preço com data e fonte; slot de ações', () => {
    render(
      <CabecalhoAtivo ativo={ATIVO_WEGE3} slotAcoes={<button type="button">Planejar</button>} />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('WEGE3');
    const header = screen.getByRole('banner');
    expect(header.textContent).not.toMatch(/IBOV|Ibovespa/);
    expect(screen.getByText('R$ 41,20')).toBeInTheDocument();
    expect(screen.getByText('fechamento de 29/09 · fonte B3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planejar' })).toBeInTheDocument();
  });

  it('selo de dados incompletos só no incompleto', () => {
    const inc: AtivoTopoResposta = {
      ...ATIVO_WEGE3,
      indice: indice({
        estado: 'incompleto',
        motivos: [{ codigo: 'div:fonte_defasada', texto: 'proventos em conferência' }],
      }),
    };
    const { rerender } = render(<CabecalhoAtivo ativo={inc} />);
    expect(screen.getByText('dados incompletos')).toBeInTheDocument();
    rerender(<CabecalhoAtivo ativo={ATIVO_WEGE3} />);
    expect(screen.queryByText('dados incompletos')).not.toBeInTheDocument();
  });
});

describe('BlocoIndiceSemaforo', () => {
  it('critérios com ícone + texto (nunca só cor) e leitura n de m', () => {
    render(
      <BlocoIndiceSemaforo
        ticker="WEGE3"
        classe="acao"
        indice={ATIVO_WEGE3.indice}
        semaforo={ATIVO_WEGE3.semaforo}
      />,
    );
    expect(screen.getByText('4 de 5 critérios atendidos')).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: 'Critérios' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    // badge: símbolo (aria-hidden) + texto visível
    expect(within(itens[0]).getByText('Atende')).toBeInTheDocument();
    const iconeAtende = itens[0].querySelector('[data-icone]');
    expect(iconeAtende).toHaveAttribute('data-icone', 'circulo_check');
    expect(iconeAtende).toHaveAttribute('aria-hidden', 'true');
    expect(within(itens[1]).getByText('Parcial')).toBeInTheDocument();
    expect(itens[1].querySelector('[data-icone]')).toHaveAttribute('data-icone', 'meio_circulo');
  });

  it('componentes num <details> com peso e fórmula pública', () => {
    const { container } = render(
      <BlocoIndiceSemaforo
        ticker="WEGE3"
        classe="acao"
        indice={ATIVO_WEGE3.indice}
        semaforo={[]}
      />,
    );
    const det = container.querySelector('[data-componentes]') as HTMLDetailsElement;
    expect(det.tagName).toBe('DETAILS');
    expect(within(det).getByText('Componentes do Índice MF')).toBeInTheDocument();
    expect(within(det).getByText(/peso 35%/)).toBeInTheDocument();
    expect(screen.getByText('Fórmula pública')).toBeInTheDocument();
  });

  it('incompleto = caixa TRACEJADA "O que falta"; zero_regra = caixa CONTÍNUA da regra', () => {
    const { container, rerender } = render(
      <BlocoIndiceSemaforo
        ticker="TGMA3"
        classe="acao"
        indice={indice({
          estado: 'incompleto',
          caixaExplicativa: { titulo: 'O que falta', itens: ['proventos em conferência'] },
        })}
        semaforo={[]}
      />,
    );
    const inc = container.querySelector('[data-caixa="incompleto"]')!;
    expect(inc.className).toMatch(/border-dashed/);
    expect(inc).toHaveTextContent('O número é recalculado quando o dado chegar.');
    expect(container.querySelector('[data-caixa="zero_regra"]')).toBeNull();

    rerender(
      <BlocoIndiceSemaforo
        ticker="AURE3"
        classe="acao"
        indice={indice({
          estado: 'zero_regra',
          valor: 0.08,
          caixaExplicativa: {
            titulo: 'Componente zerado pela regra',
            itens: ['Componente zerado pela regra: prejuízo no último exercício'],
          },
        })}
        semaforo={[]}
      />,
    );
    const zr = container.querySelector('[data-caixa="zero_regra"]')!;
    expect(zr.className).not.toMatch(/border-dashed/);
    expect(zr).toHaveTextContent('Índice baixo pela regra, não por falta de dado.');
    expect(container.querySelector('[data-caixa="incompleto"]')).toBeNull();
  });

  it('sem_score: texto próprio, sem componentes nem fórmula', () => {
    render(
      <BlocoIndiceSemaforo
        ticker="HCTR11"
        classe="fii"
        indice={indice({
          estado: 'sem_score',
          valor: null,
          componentes: [],
          caixaExplicativa: null,
        })}
        semaforo={[]}
      />,
    );
    expect(
      screen.getAllByText('Índice MF não calculado para este fundo nesta data').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Fórmula pública')).not.toBeInTheDocument();
  });

  it('critério desligado aparece como "Não se aplica" e a nota de fora da conta', () => {
    render(
      <BlocoIndiceSemaforo
        ticker="HGLG11"
        classe="fii"
        indice={ATIVO_WEGE3.indice}
        semaforo={[
          {
            codigo: 'vacancia',
            titulo: 'Vacância física',
            status: 'nao_se_aplica',
            frase: 'Não se aplica · critério desligado até a validação da fonte',
            provisorio: false,
            desligado: true,
          },
        ]}
      />,
    );
    expect(screen.getByText('Não se aplica')).toBeInTheDocument();
    expect(screen.getByText('Critérios “Não se aplica” ficam fora da conta.')).toBeInTheDocument();
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
        <BlocoIndiceSemaforo
          ticker="WEGE3"
          classe="acao"
          indice={ATIVO_WEGE3.indice}
          semaforo={ATIVO_WEGE3.semaforo}
        />
        <BlocoKpis classe="acao" kpis={ATIVO_WEGE3.kpis} />
        <BlocoDividendos classe="acao" dividendos={ATIVO_WEGE3.dividendos} />
        <BlocoEventos classe="acao" eventos={ATIVO_WEGE3.eventos} />
        <CardEducacao educacao={ATIVO_WEGE3.educacao} />
      </>,
    );
    expect(encontrarPalavrasProibidas(container.textContent ?? '')).toEqual([]);
  });
});
