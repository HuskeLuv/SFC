// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ComValoresOcultos,
  expectPilulas,
  expectSemValoresExpostos,
  representacoesDoSentinela,
} from '@/test/valoresOcultos';

/**
 * Esconder valores (Fase 5, fatia 2): Relatórios (a tela). Fixtures com sentinelas em R$/US$
 * (patrimônio, resultado, proventos, aportes, posição por ativo, movimentações). Com o olho
 * fechado nenhum R$/US$ nem sentinela aparece no texto nem em title/aria-label; % (TWR, CDI, % da
 * carteira), nomes, datas e operações continuam. Olho aberto: o mesmo HTML de hoje.
 */

const ambiente = vi.hoisted(() => ({ isBelowLg: false }));
vi.mock('next/navigation', () => ({ usePathname: () => '/relatorios' }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => ambiente.isBelowLg,
  useMediaQuery: () => ambiente.isBelowLg,
}));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: vi.fn() }) }));

import ResumoExecutivo from '../ResumoExecutivo';
import PosicaoConsolidada, { type PosicaoSecao } from '../PosicaoConsolidada';
import MovimentacoesTable, { type Movimentacao } from '../MovimentacoesTable';

const S = {
  patrimonio: 9876543.21,
  resultado: 123456.78,
  proventos: 4567.89,
  aportes: 87654.32,
  ativoA: 3456.71,
  ativoB: 6543.29,
  fii: 2468.13,
  compra: 1357.91,
  venda: 864.27,
  usd: 742.18,
  usdBrl: 3891.46,
} as const;
const SENTINELAS = Object.values(S);

const resumoProps = {
  patrimonioFim: S.patrimonio,
  resultadoPeriodo: S.resultado,
  rentabilidadePeriodo: 12.34,
  cdiPeriodo: 10.87,
  proventosPeriodo: S.proventos,
  aportesLiquidosPeriodo: S.aportes,
};

const secoes: PosicaoSecao[] = [
  {
    categoria: 'acoes',
    ativos: [
      { portfolioId: 'p1', nome: 'ITSA4', symbol: 'ITSA4', valorAtual: S.ativoA },
      { portfolioId: 'p2', nome: 'WEGE3', symbol: 'WEGE3', valorAtual: S.ativoB },
    ],
  },
  {
    categoria: 'fiis',
    ativos: [{ portfolioId: 'p3', nome: 'MXRF11', symbol: 'MXRF11', valorAtual: S.fii }],
  },
];

const base = {
  tipoAtivo: 'stock',
  categoria: 'acoes',
  quantidade: 10,
  jaInvestido: false,
} as const;
const movimentacoes: Movimentacao[] = [
  { ...base, id: 'm1', data: '2026-09-12', operacao: 'compra', ativo: 'ITSA4', total: S.compra },
  {
    ...base,
    id: 'm2',
    data: '2026-08-12',
    operacao: 'venda',
    ativo: 'WEGE3',
    total: S.venda,
    jaInvestido: true,
  },
  {
    ...base,
    id: 'm3',
    data: '2026-07-10',
    operacao: 'compra',
    ativo: 'AAPL',
    tipoAtivo: 'stock',
    categoria: 'stocks',
    total: S.usdBrl,
    moeda: 'USD',
    totalMoeda: S.usd,
    cotacaoMoeda: null,
    valorBRL: S.usdBrl,
  },
];

function Tela() {
  return (
    <>
      <ResumoExecutivo {...resumoProps} />
      <PosicaoConsolidada secoes={secoes} />
      <MovimentacoesTable movimentacoes={movimentacoes} totalNoPeriodo={3} />
    </>
  );
}

function renderTela(ocultos: boolean) {
  return render(
    <ComValoresOcultos ocultos={ocultos}>
      <Tela />
    </ComValoresOcultos>,
  );
}

afterEach(() => {
  cleanup();
  ambiente.isBelowLg = false;
});

describe.each([
  ['desktop', false],
  ['celular', true],
])('Relatórios — %s', (_nome, isBelowLg) => {
  it('olho fechado: nenhum R$/US$ nem sentinela; %, nomes e datas ficam', () => {
    ambiente.isBelowLg = isBelowLg;
    const { container } = renderTela(true);
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS });
    expectPilulas(container);
    const texto = container.textContent ?? '';
    expect(texto).toContain('+12,34%');
    expect(texto).toContain('CDI no período: +10,87%');
    expect(texto).toContain('ITSA4');
    expect(texto).toContain('MXRF11');
    expect(texto).toContain('12/09/2026');
    // % da carteira de cada ativo (visível).
    const total = S.ativoA + S.ativoB + S.fii;
    const pct = ((S.fii / total) * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    expect(texto).toContain(`${pct}%`);
    expect(texto).toContain('100%');
  });

  it('olho aberto: os valores aparecem e o HTML é o mesmo de sem o provider', () => {
    ambiente.isBelowLg = isBelowLg;
    const { container } = renderTela(false);
    expect(container.querySelectorAll('.mf-sensivel')).toHaveLength(0);
    for (const n of [S.patrimonio, S.fii, S.compra, S.usd]) {
      const [forma] = representacoesDoSentinela(n);
      expect(container.textContent).toContain(forma);
    }
    const aberto = container.innerHTML;
    cleanup();
    const { container: semProvider } = render(<Tela />);
    expect(semProvider.innerHTML).toBe(aberto);
  });
});

describe('Relatórios — detalhes da marcação', () => {
  it('linha de seção e faixa do celular usam a pílula de superfície inversa só com o olho fechado', () => {
    const { container } = renderTela(true);
    const secaoDesktop = container.querySelector('tbody tr');
    expect(secaoDesktop).toHaveClass('mf-sup-inverso');
    cleanup();
    const { container: aberto } = renderTela(false);
    expect(aberto.querySelector('.mf-sup-inverso')).toBeNull();
  });

  it('movimentação em US$: US$ e "≈ R$" viram pílula; sem câmbio continua o aviso', () => {
    const { container } = render(
      <ComValoresOcultos>
        <MovimentacoesTable
          movimentacoes={[movimentacoes[2], { ...movimentacoes[2], id: 'm4', valorBRL: null }]}
          totalNoPeriodo={2}
        />
      </ComValoresOcultos>,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS });
    expect(container.textContent).toContain('≈ ');
    expect(container.textContent).toContain('sem câmbio');
    expectPilulas(container, 3);
  });
});
