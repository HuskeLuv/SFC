// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ResponsiveCardList, ResponsiveTable, type ResponsiveColumn } from '../ResponsiveTable';
import { TABLE_MOBILE_STYLES, TABLE_STYLES } from '../tableStyles';

interface Row {
  ticker: string;
  nome: string;
  classe: string;
  qtd: number;
  preco: number;
  valor: number;
  obs: string;
  interno: string;
}

const ROWS: Row[] = [
  {
    ticker: 'BBSE3',
    nome: 'BB Seguridade',
    classe: 'Ações',
    qtd: 10,
    preco: 35,
    valor: 350,
    obs: 'obs-1',
    interno: 'segredo-1',
  },
  {
    ticker: 'XPML11',
    nome: 'XP Malls',
    classe: 'FIIs',
    qtd: 5,
    preco: 100,
    valor: 500,
    obs: 'obs-2',
    interno: 'segredo-2',
  },
  {
    ticker: 'ITSA4',
    nome: 'Itaúsa',
    classe: 'Ações',
    qtd: 20,
    preco: 10,
    valor: 200,
    obs: 'obs-3',
    interno: 'segredo-3',
  },
];

const COLUMNS: ResponsiveColumn<Row>[] = [
  { id: 'ticker', header: 'Ativo', cell: (r) => r.ticker, mobile: 'primary' },
  { id: 'nome', header: 'Nome', cell: (r) => r.nome, mobile: 'subtitle' },
  { id: 'qtd', header: 'Qtd', cell: (r) => `q${r.qtd}`, align: 'right', mobile: 'field' },
  {
    id: 'preco',
    header: 'Preço',
    cell: (r) => `p${r.preco}`,
    align: 'right',
    mobile: 'field',
    mobileLabel: 'Preço médio',
  },
  {
    id: 'valor',
    header: 'Valor',
    cell: (r) => `R$ ${r.valor}`,
    align: 'right',
    mobile: 'value',
    highlight: true,
  },
  { id: 'obs', header: 'Obs', cell: (r) => r.obs, mobile: 'field' },
  { id: 'extra', header: 'Extra', cell: (r) => `x-${r.ticker}`, mobile: 'field' },
  { id: 'interno', header: 'Interno', cell: (r) => r.interno, mobile: 'hidden' },
];

const renderTable = (props: Partial<Parameters<typeof ResponsiveTable<Row>>[0]> = {}) =>
  render(
    <ResponsiveTable<Row>
      columns={COLUMNS}
      rows={ROWS}
      getRowKey={(r) => r.ticker}
      ariaLabel="Ativos"
      {...props}
    />,
  );

const mockMatchMedia = (matches: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResponsiveTable — desktop (<table>)', () => {
  it('usa exatamente TABLE_STYLES, dentro de hidden lg:block', () => {
    renderTable();
    const table = screen.getByRole('table', { name: 'Ativos' });
    expect(table.className).toBe(TABLE_STYLES.table);
    const wrapper = table.parentElement as HTMLElement;
    expect(wrapper.className).toBe(TABLE_STYLES.wrapper);
    expect(wrapper.parentElement).toHaveClass('hidden', 'lg:block');

    const headRow = within(table).getAllByRole('row')[0];
    expect(headRow.className).toBe(TABLE_STYLES.headRow);
    const ths = within(headRow).getAllByRole('columnheader');
    expect(ths).toHaveLength(COLUMNS.length);
    expect(ths[0]).toHaveClass(...TABLE_STYLES.th.split(' '));

    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(3);
    expect(bodyRows[0].className).toBe(TABLE_STYLES.row);
    // coluna em destaque
    const valorTd = within(bodyRows[0]).getByText('R$ 350');
    expect(valorTd).toHaveClass(...TABLE_STYLES.highlightTd.split(' '), 'text-right');
    // colunas `hidden` no mobile continuam no desktop
    expect(within(table).getByText('segredo-1')).toBeInTheDocument();
  });

  it('compact troca th/td pela variante compacta', () => {
    renderTable({ compact: true });
    const table = screen.getByRole('table');
    expect(within(table).getByText('BBSE3')).toHaveClass(...TABLE_STYLES.compact.td.split(' '));
  });
});

describe('ResponsiveTable — cartões (<ul>)', () => {
  const getList = () => screen.getByRole('list', { name: 'Ativos' });

  it('renderiza um cartão por linha, dentro de lg:hidden', () => {
    renderTable();
    const list = getList();
    expect(list).toHaveClass('lg:hidden', ...TABLE_MOBILE_STYLES.list.split(' '));
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('primary no título, value à direita, subtitle, até 3 fields na grade e hidden fora', () => {
    renderTable();
    const card = within(getList()).getAllByRole('listitem')[0];

    expect(within(card).getByText('BBSE3')).toHaveClass(
      ...TABLE_MOBILE_STYLES.cardTitle.split(' '),
    );
    expect(within(card).getByText('BB Seguridade')).toHaveClass(
      ...TABLE_MOBILE_STYLES.cardSubtitle.split(' '),
    );
    expect(within(card).getByText('R$ 350')).toHaveClass(
      ...TABLE_MOBILE_STYLES.valuePrimary.split(' '),
    );

    const [grid, extras] = card.querySelectorAll('dl');
    expect(grid).toHaveClass(...TABLE_MOBILE_STYLES.cardGrid.split(' '));
    const gridLabels = [...grid.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(gridLabels).toEqual(['Qtd', 'Preço médio', 'Obs']);
    expect(within(grid).getByText('q10')).toHaveClass(...TABLE_MOBILE_STYLES.dd.split(' '));

    // 4º field vai para as linhas dt/dd
    expect([...extras.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Extra']);
    expect(within(extras).getByText('x-BBSE3')).toBeInTheDocument();

    expect(within(card).queryByText('segredo-1')).toBeNull();
  });

  it('sem `mobile`, a 1ª coluna vira primary e as demais field', () => {
    render(
      <ResponsiveTable<Row>
        columns={[
          { id: 'ticker', header: 'Ativo', cell: (r) => r.ticker },
          { id: 'qtd', header: 'Qtd', cell: (r) => `q${r.qtd}` },
        ]}
        rows={ROWS.slice(0, 1)}
        getRowKey={(r) => r.ticker}
        ariaLabel="Ativos"
      />,
    );
    const card = within(getList()).getByRole('listitem');
    expect(within(card).getByText('BBSE3')).toHaveClass(
      ...TABLE_MOBILE_STYLES.cardTitle.split(' '),
    );
    expect(within(card).getByText('Qtd').tagName).toBe('DT');
  });

  it('groupBy: banda de grupo com subtotal (mobile) e sectionRow (desktop), na ordem de aparição', () => {
    renderTable({
      groupBy: (r) => ({ key: r.classe, label: r.classe, subtotal: `sub-${r.classe}` }),
    });

    const items = within(getList()).getAllByRole('listitem');
    // Ações (banda) · BBSE3 · ITSA4 · FIIs (banda) · XPML11
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveClass(...TABLE_MOBILE_STYLES.groupBand.split(' '));
    expect(items[0]).toHaveTextContent('Ações');
    expect(items[0]).toHaveTextContent('sub-Ações');
    expect(items[1]).toHaveTextContent('BBSE3');
    expect(items[2]).toHaveTextContent('ITSA4');
    expect(items[3]).toHaveTextContent('FIIs');
    expect(items[4]).toHaveTextContent('XPML11');

    const table = screen.getByRole('table');
    const section = within(table).getAllByRole('row')[1];
    expect(section.className).toBe(TABLE_STYLES.sectionRow);
    expect(section).toHaveTextContent('Ações');
    expect(section).toHaveTextContent('sub-Ações');
  });

  it('total: totalRow no desktop e totalCard no mobile', () => {
    renderTable({ total: { label: 'Total', cells: { valor: 'R$ 1.050', qtd: 'q35' } } });

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    const totalRow = rows[rows.length - 1];
    expect(totalRow.className).toBe(TABLE_STYLES.totalRow);
    expect(totalRow).toHaveTextContent('Total');
    expect(totalRow).toHaveTextContent('R$ 1.050');

    const items = within(getList()).getAllByRole('listitem');
    const totalCard = items[items.length - 1];
    expect(totalCard).toHaveClass(...TABLE_MOBILE_STYLES.totalCard.split(' '));
    expect(totalCard).toHaveTextContent('Total');
    expect(totalCard).toHaveTextContent('R$ 1.050');
    expect(totalCard).toHaveTextContent('q35');
  });

  it('emptyState aparece nas duas versões quando não há linhas', () => {
    renderTable({ rows: [], emptyState: 'Nenhum ativo' });
    expect(screen.getAllByText('Nenhum ativo')).toHaveLength(2);
    const td = within(screen.getByRole('table')).getByText('Nenhum ativo');
    expect(td).toHaveAttribute('colspan', String(COLUMNS.length));
  });

  it('onRowClick: linha e cartão clicáveis (clique, Enter e espaço)', () => {
    const onRowClick = vi.fn();
    renderTable({ onRowClick });

    const table = screen.getByRole('table');
    fireEvent.click(within(table).getByText('XPML11'));
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1], 1);
    expect(within(table).getAllByRole('row')[1]).toHaveClass('cursor-pointer');

    const buttons = within(getList()).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveClass(...TABLE_MOBILE_STYLES.cardClickable.split(' '));
    fireEvent.click(buttons[2]);
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[2], 2);
    fireEvent.keyDown(buttons[0], { key: 'Enter' });
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[0], 0);
    fireEvent.keyDown(buttons[1], { key: ' ' });
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1], 1);
    expect(onRowClick).toHaveBeenCalledTimes(4);
  });

  it('sem onRowClick, o cartão não é botão', () => {
    renderTable();
    expect(within(getList()).queryAllByRole('button')).toHaveLength(0);
  });

  it('renderMobileCard substitui o cartão padrão', () => {
    renderTable({ renderMobileCard: (r) => <span>custom-{r.ticker}</span> });
    const items = within(getList()).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('custom-BBSE3');
    expect(items[0].querySelector('dl')).toBeNull();
  });
});

describe('ResponsiveTable — strategy js', () => {
  it('abaixo de lg renderiza só os cartões', () => {
    mockMatchMedia(true);
    renderTable({ strategy: 'js' });
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'Ativos' });
    expect(list).not.toHaveClass('lg:hidden');
  });

  it('a partir de lg renderiza só a tabela', () => {
    mockMatchMedia(false);
    renderTable({ strategy: 'js' });
    expect(screen.queryByRole('list')).toBeNull();
    const table = screen.getByRole('table');
    expect(table.parentElement?.parentElement).not.toHaveClass('hidden');
  });
});

describe('ResponsiveCardList (fase 1)', () => {
  const LINK_COLUMNS: ResponsiveColumn<Row>[] = [
    {
      id: 'ticker',
      header: 'Ativo',
      // no desktop a célula tem link; no cabeçalho do cartão expansível entra só o texto
      cell: (r) => <a href={`/ativos/${r.ticker}`}>{r.ticker}</a>,
      mobileCell: (r) => r.ticker,
      mobile: 'primary',
    },
    { id: 'valor', header: 'Valor', cell: (r) => `R$ ${r.valor}`, mobile: 'value' },
    { id: 'qtd', header: 'Qtd', cell: (r) => `q${r.qtd}`, mobile: 'field' },
    { id: 'preco', header: 'Preço', cell: (r) => `p${r.preco}`, mobile: 'detail' },
    { id: 'obs', header: 'Obs', cell: (r) => r.obs, mobile: 'detail' },
  ];

  const renderList = (props: Partial<Parameters<typeof ResponsiveCardList<Row>>[0]> = {}) =>
    render(
      <ResponsiveCardList<Row>
        columns={LINK_COLUMNS}
        rows={ROWS}
        getRowKey={(r) => r.ticker}
        ariaLabel="Ativos"
        {...props}
      />,
    );

  it('sem expandable: detail vira linha dt/dd e todo cartão é li[data-mf-card]', () => {
    renderList();
    const list = screen.getByRole('list', { name: 'Ativos' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    items.forEach((li) => expect(li).toHaveAttribute('data-mf-card'));
    expect(within(items[0]).getByText('p35')).toBeInTheDocument();
    expect(within(items[0]).getByText('obs-1')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    // sem expandable, a célula é a de sempre (com link)
    expect(within(items[0]).getByRole('link', { name: 'BBSE3' })).toBeInTheDocument();
  });

  it('expandable: cabeçalho é botão com aria-expanded e o corpo só monta aberto', () => {
    renderList({ expandable: true });
    const toggles = screen.getAllByRole('button');
    expect(toggles).toHaveLength(3);
    const first = toggles[0];
    expect(first).toHaveAttribute('data-mf-card-toggle');
    expect(first).toHaveAttribute('aria-expanded', 'false');
    // cabeçalho usa mobileCell: nenhum link dentro do botão
    expect(within(first).queryByRole('link')).toBeNull();
    expect(within(first).getByText('BBSE3')).toBeInTheDocument();
    expect(within(first).getByText('q10')).toBeInTheDocument();
    expect(document.querySelector('[data-mf-card-body]')).toBeNull();
    expect(screen.queryByText('p35')).toBeNull();

    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    const bodyId = first.getAttribute('aria-controls')!;
    const body = document.getElementById(bodyId)!;
    expect(body).toHaveAttribute('data-mf-card-body');
    expect(within(body).getByText('p35')).toBeInTheDocument();
    expect(within(body).getByText('obs-1')).toBeInTheDocument();
    expect(body.querySelector('dl')).toHaveClass(...TABLE_MOBILE_STYLES.cardDetailGrid.split(' '));

    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(bodyId)).toBeNull();
  });

  it('defaultExpanded, renderCardBody e renderCardFooter', () => {
    renderList({
      expandable: true,
      defaultExpanded: (r) => r.ticker === 'XPML11',
      renderCardBody: (r) => <p>corpo-{r.ticker}</p>,
      renderCardFooter: (r) => <a href={`/ativos/${r.ticker}`}>Ver {r.ticker}</a>,
    });
    expect(screen.getByText('corpo-XPML11')).toBeInTheDocument();
    expect(screen.queryByText('corpo-BBSE3')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ver XPML11' })).toBeInTheDocument();
    // o corpo próprio substitui a grade de detail
    expect(screen.queryByText('p100')).toBeNull();
  });

  it('getRowAttributes e cardClassName', () => {
    renderList({
      expandable: true,
      getRowAttributes: (r) => ({
        'data-planejado': r.ticker === 'ITSA4' ? 'true' : undefined,
      }),
      cardClassName: (r) => (r.ticker === 'ITSA4' ? 'border-dashed' : undefined),
    });
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[2]).toHaveAttribute('data-planejado', 'true');
    expect(items[0]).not.toHaveAttribute('data-planejado');
    expect(items[2].firstElementChild).toHaveClass('border-dashed');
    expect(items[0].firstElementChild).not.toHaveClass('border-dashed');
  });

  it('className vai no <ul>; expandable usa o espaçamento de 8px', () => {
    renderList({ expandable: true, className: 'mt-4' });
    const list = screen.getByRole('list');
    expect(list).toHaveClass('mt-4', ...TABLE_MOBILE_STYLES.cardList.split(' '));
  });
});
