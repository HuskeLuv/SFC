// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import AssetCardSections, { sortAtivos } from '../AssetCardSections';
import type { ColumnDef, Formatters } from '../GenericAssetTable';
import { resolveAssetMobileRole, orderDetailColumns } from '../mobileColumnRoles';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/icons', () => ({
  DollarLineIcon: () => <svg data-testid="icone-vazio" />,
}));

interface Ativo {
  id: string;
  ticker: string;
  nome: string;
  quantidade: number;
  valorAtualizado: number;
  rentabilidade: number;
  objetivo: number;
  percentualCarteira: number;
  quantoFalta: number;
  necessidadeAporte: number;
  setor: string;
  planejado?: boolean;
}

interface Secao {
  key: string;
  nome: string;
  ativos: Ativo[];
  totalValorAtualizado: number;
}

const fmt: Formatters = {
  formatCurrency: (v) => `R$ ${v.toFixed(2)}`,
  formatPercentage: (v) => `${v.toFixed(2)}%`,
  formatNumber: (v) => String(v),
};

const ativo = (over: Partial<Ativo>): Ativo => ({
  id: 'x',
  ticker: 'XXXX3',
  nome: 'X SA',
  quantidade: 10,
  valorAtualizado: 100,
  rentabilidade: 1,
  objetivo: 10,
  percentualCarteira: 10,
  quantoFalta: 0,
  necessidadeAporte: 0,
  setor: 'Bancos',
  ...over,
});

const BBAS = ativo({
  id: 'a1',
  ticker: 'BBAS3',
  nome: 'Banco do Brasil',
  valorAtualizado: 300,
  rentabilidade: 5,
  quantoFalta: 2,
});
const ITSA = ativo({
  id: 'a2',
  ticker: 'ITSA4',
  nome: 'Itaúsa',
  valorAtualizado: 900,
  rentabilidade: -3,
  quantoFalta: -1,
});
const PRIO = ativo({
  id: 'p1',
  ticker: 'PRIO3',
  nome: 'PRIO',
  valorAtualizado: 0,
  quantidade: 0,
  planejado: true,
  necessidadeAporte: 50,
});

const SECOES: Secao[] = [
  { key: 'value', nome: 'Value', ativos: [BBAS, ITSA, PRIO], totalValorAtualizado: 1200 },
  { key: 'growth', nome: 'Growth', ativos: [], totalValorAtualizado: 0 },
];

const COLUMNS: ColumnDef<Ativo, Secao>[] = [
  { key: 'nome', header: 'Nome', render: (a) => <a href={`/ativos/${a.id}`}>{a.ticker}</a> },
  { key: 'setor', header: 'Setor', render: (a) => a.setor },
  { key: 'quantidade', header: 'Quantidade', render: (a, f) => f.formatNumber(a.quantidade) },
  {
    key: 'valorAtualizado',
    header: 'Valor Atualizado',
    render: (a, f) => f.formatCurrency(a.valorAtualizado),
    renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAtualizado),
    renderGrandTotal: (t, f) => f.formatCurrency(t.valorAtualizado as number),
  },
  {
    key: 'riscoPorAtivo',
    header: <span>Risco</span>,
    render: () => '1%',
  },
  {
    key: 'percentualCarteira',
    header: '% da Aba',
    render: (a, f) => f.formatPercentage(a.percentualCarteira),
  },
  {
    key: 'objetivo',
    header: 'Objetivo',
    render: (a, f) => <span data-testid={`obj-${a.id}`}>{f.formatPercentage(a.objetivo)}</span>,
    renderGrandTotal: (t, f) => f.formatPercentage(t.objetivo as number),
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
  },
  { key: 'rentabilidade', header: 'Rentabilidade', render: (a) => `${a.rentabilidade}` },
];

function Harness({ onRemove = vi.fn() }: { onRemove?: (id: string) => void }) {
  const [expanded, setExpanded] = useState(new Set(['value', 'growth']));
  return (
    <AssetCardSections<Ativo, Secao>
      sections={SECOES}
      columns={COLUMNS}
      formatters={fmt}
      getSectionKey={(s) => s.key}
      getSectionName={(s) => s.nome}
      getSectionAtivos={(s) => s.ativos}
      expandedSections={expanded}
      onToggleSection={(k) =>
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(k)) next.delete(k);
          else next.add(k);
          return next;
        })
      }
      totalGeral={{ valorAtualizado: 1200, objetivo: 20 }}
      onRemovePlanejado={onRemove}
      ariaLabel="Ações"
      quantityUnit="ações"
    />
  );
}

const cardTitles = () =>
  Array.from(document.querySelectorAll('[data-mf-card] [data-mf-card-toggle]')).map(
    (b) => b.textContent ?? '',
  );

describe('mobileColumnRoles', () => {
  it('papéis padrão por chave e detail na falta', () => {
    expect(resolveAssetMobileRole({ key: 'nome', header: 'x' })).toBe('primary');
    expect(resolveAssetMobileRole({ key: 'valorAtualizado', header: 'x' })).toBe('value');
    expect(resolveAssetMobileRole({ key: 'objetivo', header: 'x' })).toBe('edit');
    expect(resolveAssetMobileRole({ key: 'setor', header: 'x' })).toBe('detail');
    expect(resolveAssetMobileRole({ key: 'setor', header: 'x', mobile: 'hidden' })).toBe('hidden');
  });

  it('ordena a grade pela prioridade do protótipo e depois pela ordem da tabela', () => {
    const keys = orderDetailColumns([
      { key: 'setor', header: '' },
      { key: 'necessidadeAporte', header: '' },
      { key: 'quantidade', header: '' },
      { key: 'subsetor', header: '' },
    ]).map((c) => c.key);
    expect(keys).toEqual(['quantidade', 'necessidadeAporte', 'setor', 'subsetor']);
  });
});

describe('AssetCardSections', () => {
  it('renderiza cartões com data-mf-card, faixa com subtotal e esconde a seção vazia', () => {
    render(<Harness />);
    expect(document.querySelectorAll('[data-mf-card]')).toHaveLength(3);
    const bands = document.querySelectorAll('[data-mf-section]');
    expect(bands).toHaveLength(1); // Growth (vazia) escondida
    expect(bands[0]).toHaveTextContent('Value');
    expect(bands[0]).toHaveTextContent('3 ativos');
    expect(bands[0]).toHaveTextContent('R$ 1200.00');
    expect(screen.getByText('2 ativos · 1 planejado')).toBeInTheDocument();
    expect(document.querySelector('table')).toBeNull();
  });

  it('cabeçalho do cartão é só texto (sem link dentro do botão) e abre o corpo', () => {
    render(<Harness />);
    const toggle = document.querySelector('[data-mf-card-toggle]') as HTMLElement;
    expect(toggle.querySelector('a, button')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('BBAS3');
    expect(toggle).toHaveTextContent('Banco do Brasil · 10 ações');
    expect(toggle).toHaveTextContent('Falta 2.00%');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const body = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(within(body).getByText('Quantidade')).toBeInTheDocument();
    expect(within(body).getByText('Risco cart.')).toBeInTheDocument();
    expect(within(body).getByTestId('obj-a1')).toBeInTheDocument();
    expect(within(body).getByRole('link', { name: /Ver detalhes do ativo/ })).toHaveAttribute(
      'href',
      '/ativos/a1',
    );
  });

  it('a faixa recolhe e reabre a seção (estado vem do pai)', () => {
    render(<Harness />);
    const band = document.querySelector('[data-mf-section]') as HTMLElement;
    fireEvent.click(band);
    expect(band).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelectorAll('[data-mf-card]')).toHaveLength(0);
    fireEvent.click(band);
    expect(document.querySelectorAll('[data-mf-card]')).toHaveLength(3);
  });

  it('Ordenar reordena dentro da seção sem mudar os totais', () => {
    render(<Harness />);
    const totalAntes = document.querySelector('[data-mf-total-card]')!.textContent;
    const subtotalAntes = document.querySelector('[data-mf-section]')!.textContent;
    expect(cardTitles()[0]).toContain('BBAS3');
    fireEvent.change(screen.getByLabelText('Ordenar'), { target: { value: 'valor' } });
    expect(cardTitles()[0]).toContain('ITSA4');
    fireEvent.change(screen.getByLabelText('Ordenar'), { target: { value: 'nome' } });
    expect(cardTitles().map((t) => t.slice(0, 5))).toEqual(['BBAS3', 'ITSA4', 'PRIO3']);
    expect(document.querySelector('[data-mf-total-card]')!.textContent).toBe(totalAntes);
    expect(document.querySelector('[data-mf-section]')!.textContent).toBe(subtotalAntes);
  });

  it('sortAtivos devolve cópia e mantém a ordem original', () => {
    const lista = [BBAS, ITSA];
    const ordenada = sortAtivos(lista, 'valor', (a) => a.ticker);
    expect(ordenada.map((a) => a.id)).toEqual(['a2', 'a1']);
    expect(lista.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(sortAtivos(lista, 'qf', (a) => a.ticker)[0].id).toBe('a1');
  });

  it('planejado: borda tracejada, selo, só colunas permitidas e Remover chama o handler', () => {
    const onRemove = vi.fn();
    render(<Harness onRemove={onRemove} />);
    const li = document.querySelector('[data-mf-card][data-planejado="true"]') as HTMLElement;
    expect(li).toHaveTextContent('Planejado');
    expect(li).toHaveTextContent('sem posição');
    expect(li.querySelector('.border-dashed')).not.toBeNull();
    fireEvent.click(li.querySelector('[data-mf-card-toggle]')!);
    expect(within(li).queryByText('Quantidade')).toBeNull();
    expect(within(li).queryByText('Setor')).toBeNull();
    expect(within(li).getByText('Nec. aporte')).toBeInTheDocument();
    expect(within(li).queryByRole('link')).toBeNull();
    fireEvent.click(within(li).getByRole('button', { name: /Remover do planejamento/ }));
    expect(onRemove).toHaveBeenCalledWith('p1');
  });

  it('aba sem ativos mostra o estado vazio', () => {
    render(
      <AssetCardSections<Ativo, Secao>
        sections={[{ key: 'value', nome: 'Value', ativos: [], totalValorAtualizado: 0 }]}
        columns={COLUMNS}
        formatters={fmt}
        getSectionKey={(s) => s.key}
        getSectionName={(s) => s.nome}
        getSectionAtivos={(s) => s.ativos}
        expandedSections={new Set(['value'])}
        onToggleSection={vi.fn()}
        totalGeral={{}}
        onRemovePlanejado={vi.fn()}
        ariaLabel="Ações"
      />,
    );
    expect(screen.getByText('Nenhum ativo nesta aba')).toBeInTheDocument();
    expect(document.querySelector('[data-mf-card]')).toBeNull();
  });
});
