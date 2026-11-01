// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AssetCardSections, {
  AssetTabMobileSummary,
  ResumoAportesCards,
  UsdTotalMobile,
} from '../AssetCardSections';
import EditableValorCell from '../EditableValorCell';
import type { ColumnDef, Formatters } from '../GenericAssetTable';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
} from '@/test/valoresOcultos';
import { formatBRL, formatPct, formatUSD } from '@/utils/format';

/**
 * Esconder valores (fatia 1): cartões do celular das abas da Carteira (fechado e aberto),
 * subtítulo da quantidade ("[pílula] ações"), totais, resumo da aba e "Resumo de Aportes".
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => true }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/icons', () => ({ DollarLineIcon: () => <svg /> }));

interface Ativo {
  id: string;
  ticker: string;
  nome: string;
  quantidade: number;
  precoAquisicao: number;
  cotacaoAtual: number;
  valorAtualizado: number;
  rentabilidade: number;
  objetivo: number;
  percentualCarteira: number;
  quantoFalta: number;
  necessidadeAporte: number;
}
interface Secao {
  key: string;
  nome: string;
  ativos: Ativo[];
  totalValorAtualizado: number;
}

const fmt: Formatters = {
  formatCurrency: (v) => formatBRL(v),
  formatPercentage: (v) => formatPct(v),
  formatNumber: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
};

const ATIVO: Ativo = {
  id: 'a1',
  ticker: 'VALE3',
  nome: 'Vale ON',
  quantidade: SENTINELAS.quantidade,
  precoAquisicao: SENTINELAS.precoMedio,
  cotacaoAtual: 12.34,
  valorAtualizado: SENTINELAS.saldo,
  rentabilidade: 8.5,
  objetivo: 20,
  percentualCarteira: 100,
  quantoFalta: -80,
  necessidadeAporte: SENTINELAS.aplicado,
};
const SECOES: Secao[] = [
  { key: 'valor', nome: 'Valor', ativos: [ATIVO], totalValorAtualizado: SENTINELAS.saldo },
];
const TOTAL = {
  valorAtualizado: SENTINELAS.saldo,
  valorAplicado: SENTINELAS.aplicado,
  necessidadeAporte: SENTINELAS.aplicado,
  proventos: SENTINELAS.aplicado,
  rentabilidade: 8.5,
};

const onUpdate = vi.fn().mockResolvedValue(true);
const COLUNAS: ColumnDef<Ativo, Secao>[] = [
  { key: 'nome', header: 'Ativo', render: (a) => a.ticker },
  {
    key: 'quantidade',
    valor: 'sensivel-curto',
    header: 'Quantidade',
    render: (a, f) => f.formatNumber(a.quantidade),
  },
  {
    key: 'precoAquisicao',
    valor: 'sensivel',
    header: 'Preço Médio',
    render: (a, f) => f.formatCurrency(a.precoAquisicao),
  },
  {
    key: 'cotacaoAtual',
    valor: 'visivel',
    header: 'Cotação Atual',
    render: (a, f) => f.formatCurrency(a.cotacaoAtual),
  },
  {
    key: 'valorAtualizado',
    header: 'Valor Atualizado',
    mobileRender: (a, f) => f.formatCurrency(a.valorAtualizado),
    mobileEdit: true,
    render: (a, f) => (
      <EditableValorCell
        ativoId={a.id}
        valorAtualizado={a.valorAtualizado}
        formatCurrency={f.formatCurrency}
        onUpdateValorAtualizado={onUpdate}
      />
    ),
    renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAtualizado),
    renderGrandTotal: (t, f) => f.formatCurrency(t.valorAtualizado as number),
  },
  {
    key: 'valorTotal',
    header: 'Valor Total',
    render: (a, f) => f.formatCurrency(a.valorAtualizado),
    renderGrandTotal: (t, f) => f.formatCurrency(t.valorAplicado as number),
  },
  {
    key: 'rentabilidade',
    header: 'Rentabilidade',
    render: (a, f) => f.formatPercentage(a.rentabilidade),
    renderGrandTotal: (t, f) => f.formatPercentage(t.rentabilidade as number),
  },
  {
    key: 'objetivo',
    header: 'Objetivo',
    render: (a, f) => f.formatPercentage(a.objetivo),
  },
  {
    key: 'percentualCarteira',
    header: '% da Aba',
    render: (a, f) => f.formatPercentage(a.percentualCarteira),
  },
  {
    key: 'quantoFalta',
    header: 'Quanto Falta',
    render: (a, f) => f.formatPercentage(a.quantoFalta),
  },
  {
    key: 'necessidadeAporte',
    header: 'Nec. Aporte',
    render: (a, f) => f.formatCurrency(a.necessidadeAporte),
    renderGrandTotal: (t, f) => f.formatCurrency(t.necessidadeAporte as number),
  },
  {
    key: 'proventos',
    header: 'Proventos',
    render: () => formatBRL(SENTINELAS.aplicado),
    renderGrandTotal: (t, f) => f.formatCurrency(t.proventos as number),
  },
];

const cartoes = (
  <AssetCardSections<Ativo, Secao>
    sections={SECOES}
    columns={COLUNAS}
    formatters={fmt}
    getSectionKey={(s) => s.key}
    getSectionName={(s) => s.nome}
    getSectionAtivos={(s) => s.ativos}
    expandedSections={new Set(['valor'])}
    onToggleSection={() => {}}
    totalGeral={TOTAL}
    onRemovePlanejado={() => {}}
    ariaLabel="Ações - Detalhamento"
    quantityUnit="ações"
  />
);

const abrirCartao = (container: HTMLElement) =>
  fireEvent.click(container.querySelector<HTMLButtonElement>('[data-mf-card-toggle]')!);

describe('AssetCardSections com o olho fechado', () => {
  it('cartão fechado: valor, subtotal e totais em pílula; % e nome visíveis', () => {
    const { container } = render(<ComValoresOcultos>{cartoes}</ComValoresOcultos>);
    expectSemValoresExpostos(container);
    expectPilulas(container);
    expect(container).toHaveTextContent('VALE3');
    expect(container).toHaveTextContent(formatPct(8.5));
  });

  it('subtítulo: só o número da quantidade vira pílula CURTA ("[pílula] ações")', () => {
    const { container } = render(<ComValoresOcultos>{cartoes}</ComValoresOcultos>);
    const curta = container.querySelector('[data-mf-card-toggle] .mf-sensivel--curto');
    expect(curta).not.toBeNull();
    expect(curta!.parentElement).toHaveTextContent(/Vale ON · .*ações/);
  });

  it('cartão aberto: grade, preço médio, quantidade e a célula editável sem valores', () => {
    const { container } = render(<ComValoresOcultos>{cartoes}</ComValoresOcultos>);
    abrirCartao(container);
    expectSemValoresExpostos(container);
    // Cotação atual é dado de mercado (decisão 1).
    expect(container.querySelector('[data-mf-valor-visivel]')).toHaveTextContent('12,34');
    // O aria do botão Editar não revela o valor.
    const editar = container.querySelector('[data-mf-edit="valor"]');
    expect(editar).toHaveAttribute('aria-label', expect.stringContaining('R$ •••••'));
  });

  it('nome acessível do botão do cartão com o olho aberto: igual ao de hoje', () => {
    const hoje = render(cartoes);
    const nomeHoje = screen.getByRole('button', { name: /VALE3/ }).textContent;
    expect(nomeHoje).toContain(formatBRL(SENTINELAS.saldo));
    hoje.unmount();
    render(<ComValoresOcultos ocultos={false}>{cartoes}</ComValoresOcultos>);
    expect(screen.getByRole('button', { name: /VALE3/ }).textContent).toBe(nomeHoje);
  });

  it('olho aberto: DOM igual ao de sem provider (cartão aberto)', () => {
    const html = (c: HTMLElement) => c.innerHTML.replace(/_r_[a-z0-9]+_/g, '_r_');
    const a = render(cartoes);
    abrirCartao(a.container);
    const semProvider = html(a.container);
    a.unmount();
    const b = render(<ComValoresOcultos ocultos={false}>{cartoes}</ComValoresOcultos>);
    abrirCartao(b.container);
    expect(html(b.container)).toBe(semProvider);
  });
});

describe('resumo da aba, Resumo de Aportes e Total em USD com o olho fechado', () => {
  it('AssetTabMobileSummary: herói, minis, necessidade e subtítulos em pílula', () => {
    const { container } = render(
      <ComValoresOcultos>
        <AssetTabMobileSummary
          heroLabel="Valor atualizado"
          heroValue={formatUSD(SENTINELAS.saldo)}
          heroSubtitles={[`equivale a ${formatBRL(SENTINELAS.aplicado)}`]}
          rentabilidade={{ value: 3.2, formatPercentage: formatPct }}
          minis={[{ label: 'Rendimento', value: formatBRL(SENTINELAS.aplicado) }]}
          necessidadeAporte={formatBRL(SENTINELAS.aplicado)}
        />
      </ComValoresOcultos>,
    );
    expectSemValoresExpostos(container);
    expect(container).toHaveTextContent('equivale a');
    expect(container).toHaveTextContent(formatPct(3.2));
  });

  it('ResumoAportesCards: necessidade e lote somem; cotação fica', () => {
    const { container } = render(
      <ComValoresOcultos>
        <ResumoAportesCards
          items={[
            {
              key: 1,
              nome: 'HGLG11',
              cotacao: formatBRL(12.34),
              necessidade: formatBRL(SENTINELAS.aplicado),
              lote: SENTINELAS.quantidade.toLocaleString('pt-BR'),
            },
          ]}
        />
      </ComValoresOcultos>,
    );
    expectSemValoresExpostos(container);
    expect(container.querySelector('[data-mf-valor-visivel]')).toHaveTextContent('12,34');
  });

  it('UsdTotalMobile: aplicado e atualizado em US$ somem', () => {
    const { container } = render(
      <ComValoresOcultos>
        <UsdTotalMobile
          aplicado={formatUSD(SENTINELAS.aplicado)}
          atualizado={formatUSD(SENTINELAS.saldo)}
        />
      </ComValoresOcultos>,
    );
    expectSemValoresExpostos(container);
    expectPilulas(container, 2);
  });
});
