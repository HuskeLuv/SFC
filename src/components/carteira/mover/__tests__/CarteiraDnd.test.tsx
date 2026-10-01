// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import GenericAssetTable, {
  type ColumnDef,
  type GenericAssetMoverConfig,
} from '@/components/carteira/shared/GenericAssetTable';
import { createTestQueryClient } from '@/test/wrappers';
import { MOTIVO_EM_REAIS } from '@/lib/carteiraMover';
import {
  alvoDaLinha,
  avisoAbaRecusada,
  destinoDoFantasma,
  type LinhaDragData,
} from '../CarteiraDnd';
import { chipsDaBandeja, motivoCurto } from '../AbaDropTarget';

// ── Mocks ───────────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  belowLg: false,
  mover: vi.fn(),
  restaurar: vi.fn(),
  opcoes: null as null | { destinos: { categoria: string; permitido: boolean; motivo?: string }[] },
}));

vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => h.belowLg }));
vi.mock('@/hooks/useMoverInvestimento', () => ({
  useMoverInvestimento: () => ({
    mover: h.mover,
    restaurar: h.restaurar,
    isPending: false,
    pendingId: undefined,
  }),
}));
vi.mock('@/hooks/useMoverOpcoes', () => ({
  useMoverOpcoes: () => ({ data: h.opcoes ?? undefined, isLoading: false }),
}));
vi.mock('@/components/carteira/mover/EscolherSecaoPopover', () => ({
  EscolherSecaoPopover: ({
    destino,
    onConfirm,
    onCancel,
  }: {
    destino: string;
    onConfirm: (s: string) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="popover-secao" data-destino={destino}>
      <button type="button" onClick={() => onConfirm('fiagro')}>
        confirmar
      </button>
      <button type="button" onClick={onCancel}>
        cancelar
      </button>
    </div>
  ),
}));
vi.mock('@/components/carteira/mover/MoverInvestimento', () => ({
  MoverInvestimento: ({ alvo, onClose }: { alvo: { id: string }; onClose: () => void }) => (
    <div role="dialog" data-testid="dialogo-mover" data-alvo={alvo.id}>
      <button type="button" onClick={onClose}>
        fechar
      </button>
    </div>
  ),
}));
vi.mock('@/components/carteira/mover/MovidoBadge', () => ({
  MovidoBadge: () => <span data-testid="selo-movido">movido</span>,
  SoltarAquiChip: () => <span data-testid="soltar-aqui">Soltar aqui</span>,
}));
vi.mock('@/components/common/LoadingSpinner', () => ({ default: () => <div /> }));
vi.mock('@/components/common/ComponentCard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/icons', () => ({ ChevronDownIcon: () => <svg />, ChevronUpIcon: () => <svg /> }));
vi.mock('@/context/CarteiraResumoContext', () => ({
  useCarteiraResumoContext: () => ({ necessidadeAporteMap: {} }),
  useCarteiraResumoContextOptional: () => null,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

// ── Dados ───────────────────────────────────────────────────────────────────────────────────

interface Ativo {
  id: string;
  ticker: string;
  nome: string;
  tipo: string;
  valorAtualizado: number;
  objetivo: number;
  planejado?: boolean;
  movido?: boolean;
  movidoEm?: string;
}
interface Secao {
  tipo: string;
  nome: string;
  ativos: Ativo[];
}

const linha = (id: string, ticker: string, tipo: string, extra: Partial<Ativo> = {}): Ativo => ({
  id,
  ticker,
  nome: ticker,
  tipo,
  valorAtualizado: 100,
  objetivo: 0,
  ...extra,
});

const data = {
  secoes: [
    {
      tipo: 'fof',
      nome: 'FOF',
      ativos: [linha('p1', 'KDIF11', 'fofi'), linha('p2', 'HGLG11', 'fofi')],
    },
    { tipo: 'tvm', nome: 'TVM', ativos: [linha('p3', 'KNCA11', 'tvm', { movido: true })] },
  ] as Secao[],
  totalGeral: { valorAtualizado: 300 },
  resumo: { caixaParaInvestir: 0 },
};

const columns: ColumnDef<Ativo, Secao>[] = [
  { key: 'nome', header: 'Nome', render: (a) => <span>{a.ticker}</span> },
  {
    key: 'valorAtualizado',
    header: 'Valor',
    align: 'right',
    render: (a, f) => f.formatCurrency(a.valorAtualizado),
  },
];

const MOVER: GenericAssetMoverConfig<Ativo> = {
  categoria: 'fiis',
  subgrupoDaSecao: (k) =>
    ({ fof: 'fofi', tvm: 'tvm', tijolo: 'tijolo', infra: 'infra' })[k] ?? null,
};

function renderTabela(mover?: GenericAssetMoverConfig<Ativo>) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <GenericAssetTable<Ativo, Secao>
        data={data as unknown as Record<string, unknown>}
        loading={false}
        error={null}
        columns={columns}
        getSecoes={(d) => d.secoes as Secao[]}
        getSectionAtivos={(s) => s.ativos}
        getSectionKey={(s) => s.tipo}
        getSectionName={(s) => s.nome}
        getTotalGeral={(d) => d.totalGeral as Record<string, unknown>}
        getResumo={(d) => d.resumo as Record<string, unknown>}
        metricCards={[]}
        onUpdateCaixaParaInvestir={vi.fn()}
        sectionOrder={['fof', 'tvm', 'tijolo', 'infra']}
        sectionNames={{ fof: 'FOF', tvm: 'TVM', tijolo: 'Tijolo', infra: 'Infra' }}
        tableTitle="FIIs"
        formatCurrency={(v) => `R$ ${v}`}
        formatPercentage={(v) => `${v}%`}
        formatNumber={(v) => String(v)}
        mover={mover}
      />
    </QueryClientProvider>,
  );
}

/** Arrasto por teclado (dnd-kit): espaço pega, setas, espaço solta. */
async function pegar(handle: HTMLElement) {
  handle.focus();
  fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
async function tecla(code: string) {
  fireEvent.keyDown(document.activeElement ?? document.body, { code });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  h.belowLg = false;
  h.mover.mockReset().mockResolvedValue({ ok: true, noop: true });
  h.restaurar.mockReset().mockResolvedValue({ ok: true, noop: true });
  h.opcoes = {
    destinos: [
      { categoria: 'fimFia', permitido: true },
      { categoria: 'acoes', permitido: true },
      { categoria: 'stocks', permitido: false, motivo: MOTIVO_EM_REAIS },
      { categoria: 'reits', permitido: false, motivo: MOTIVO_EM_REAIS },
      { categoria: 'etfs', permitido: true },
      { categoria: 'fiis', permitido: true },
    ],
  };
});
afterEach(() => {
  vi.clearAllMocks();
});

// ── Testes ──────────────────────────────────────────────────────────────────────────────────

describe('GenericAssetTable sem a prop mover', () => {
  it('não ganha alça, menu, coluna extra nem alvos de seção', () => {
    const { container } = renderTabela();
    expect(container.querySelectorAll('[data-mover-alca]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-mover-menu]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-mover-secao]')).toHaveLength(0);
    expect(container.querySelectorAll('thead th')).toHaveLength(columns.length);
    expect(container.querySelectorAll('tbody')).toHaveLength(1);
  });
});

describe('GenericAssetTable com a prop mover (desktop)', () => {
  it('alça e menu nas linhas; cada seção (inclusive vazia) é um alvo', () => {
    const { container } = renderTabela(MOVER);
    expect(screen.getByRole('button', { name: 'Arrastar KDIF11' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ações de KDIF11' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-mover-alca]')).toHaveLength(3);
    const secoes = Array.from(container.querySelectorAll('tbody[data-mover-secao]')).map((t) =>
      t.getAttribute('data-mover-secao'),
    );
    expect(secoes).toEqual(['fofi', 'tvm', 'tijolo', 'infra']);
    expect(container.querySelectorAll('thead th')).toHaveLength(columns.length + 1);
    expect(screen.getByTestId('selo-movido')).toBeInTheDocument();
  });

  it('soltar em outra seção (teclado) chama mover com a aba atual e o subgrupo da seção', async () => {
    renderTabela(MOVER);
    await pegar(screen.getByRole('button', { name: 'Arrastar KDIF11' }));
    await tecla('ArrowDown');
    await waitFor(() =>
      expect(document.querySelector('[data-drop-on]')).toHaveAttribute('data-mover-secao', 'tvm'),
    );
    expect(screen.getByTestId('soltar-aqui')).toBeInTheDocument();
    await tecla('Space');
    await waitFor(() => expect(h.mover).toHaveBeenCalledTimes(1));
    expect(h.mover).toHaveBeenCalledWith({
      alvo: expect.objectContaining({
        tipo: 'posicao',
        id: 'p1',
        categoria: 'fiis',
        secaoAtual: 'fofi',
      }),
      categoria: 'fiis',
      subgrupo: 'tvm',
    });
  });

  it('soltar na própria seção não chama mover', async () => {
    renderTabela(MOVER);
    await pegar(screen.getByRole('button', { name: 'Arrastar KNCA11' }));
    await tecla('ArrowDown');
    await tecla('ArrowUp');
    await tecla('Space');
    expect(h.mover).not.toHaveBeenCalled();
  });

  it('teclado: depois das seções vêm as abas da bandeja; soltar numa aba aceita abre o popover', async () => {
    renderTabela(MOVER);
    await pegar(screen.getByRole('button', { name: 'Arrastar KDIF11' }));
    const bandeja = await screen.findByRole('group', { name: 'Mover para outra aba' });
    // Aceitas primeiro (Fundos, Ações, ETF's), recusadas no fim (Stocks, REIT's).
    expect(
      Array.from(bandeja.querySelectorAll('[data-aba-drop]')).map((c) =>
        c.getAttribute('data-aba-drop'),
      ),
    ).toEqual(['fimFia', 'acoes', 'etfs', 'stocks', 'reits']);
    // fof → tvm → tijolo → infra → Fundos
    for (let i = 0; i < 4; i++) await tecla('ArrowDown');
    await tecla('Space');
    const pop = await screen.findByTestId('popover-secao');
    expect(pop).toHaveAttribute('data-destino', 'fimFia');
    expect(h.mover).not.toHaveBeenCalled();
    fireEvent.click(within(pop).getByText('confirmar'));
    await waitFor(() =>
      expect(h.mover).toHaveBeenCalledWith({
        alvo: expect.objectContaining({ id: 'p1' }),
        categoria: 'fimFia',
        subgrupo: 'fiagro',
      }),
    );
    expect(screen.queryByTestId('popover-secao')).not.toBeInTheDocument();
  });

  it('soltar numa aba recusada não chama mover e mostra o motivo', async () => {
    renderTabela(MOVER);
    await pegar(screen.getByRole('button', { name: 'Arrastar KDIF11' }));
    // 4 seções + Fundos, Ações, ETF's → Stocks (recusada)
    for (let i = 0; i < 7; i++) await tecla('ArrowDown');
    await tecla('Space');
    expect(h.mover).not.toHaveBeenCalled();
    expect(screen.queryByTestId('popover-secao')).not.toBeInTheDocument();
    const aviso = await screen.findByText(`Stocks não aceita KDIF11: ${MOTIVO_EM_REAIS}.`, {
      selector: '[role="status"] span',
    });
    expect(aviso).toBeInTheDocument();
  });

  it('Esc cancela sem mover', async () => {
    renderTabela(MOVER);
    await pegar(screen.getByRole('button', { name: 'Arrastar KDIF11' }));
    await tecla('ArrowDown');
    await tecla('Escape');
    expect(h.mover).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Mover para outra aba' })).not.toBeInTheDocument();
  });

  it('menu ⋯: "Mover para…" abre o diálogo; linha movida oferece voltar ao original', async () => {
    renderTabela(MOVER);
    fireEvent.click(screen.getByRole('button', { name: 'Ações de KDIF11' }));
    const menu = screen.getByRole('menu', { name: 'Ações de KDIF11' });
    expect(within(menu).getByRole('menuitem', { name: 'Abrir ativo' })).toHaveAttribute(
      'href',
      '/ativos/p1',
    );
    expect(within(menu).queryByText(/Voltar/)).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Mover para/ }));
    expect(screen.getByTestId('dialogo-mover')).toHaveAttribute('data-alvo', 'p1');
    fireEvent.click(screen.getByText('fechar'));

    fireEvent.click(screen.getByRole('button', { name: 'Ações de KNCA11' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Voltar ao original/ }));
    expect(h.restaurar).toHaveBeenCalledWith(expect.objectContaining({ id: 'p3' }));
  });
});

describe('celular (abaixo de lg)', () => {
  it('cartão aberto ganha "Mover" (sem alça) e abre o diálogo/sheet', () => {
    h.belowLg = true;
    const { container } = renderTabela(MOVER);
    expect(container.querySelectorAll('[data-mover-alca]')).toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: /KDIF11/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Mover KDIF11' }));
    expect(screen.getByTestId('dialogo-mover')).toHaveAttribute('data-alvo', 'p1');
  });

  it('sem a prop mover, nenhum botão "Mover"', () => {
    h.belowLg = true;
    renderTabela();
    fireEvent.click(screen.getAllByRole('button', { name: /KDIF11/ })[0]);
    expect(screen.queryByRole('button', { name: 'Mover KDIF11' })).not.toBeInTheDocument();
  });
});

describe('helpers', () => {
  it('alvoDaLinha: planejado, subgrupo traduzido e linha não movível', () => {
    expect(
      alvoDaLinha('fiis', { id: 'w1', ticker: 'XPML11', tipo: 'fof', planejado: true }, (s) =>
        s === 'fof' ? 'fofi' : s,
      ),
    ).toEqual({
      tipo: 'planejado',
      id: 'w1',
      categoria: 'fiis',
      secaoAtual: 'fofi',
      label: 'XPML11',
    });
    expect(alvoDaLinha('acoes', { id: 'p', ticker: 'X', naoMovivelMotivo: 'x' })).toBeNull();
    expect(alvoDaLinha('acoes', { ticker: 'X' })).toBeNull();
  });

  it('fantasma: seção, aba aceita e aba recusada', () => {
    const l: LinhaDragData = {
      kind: 'linha',
      alvo: { tipo: 'posicao', id: 'p1', categoria: 'fiis', secaoAtual: 'fofi', label: 'KDIF11' },
      secaoDropId: 'secao:fiis:fof',
      secaoLabel: 'FOF',
    };
    expect(
      destinoDoFantasma(l, {
        kind: 'secao',
        categoria: 'fiis',
        sectionKey: 'fof',
        subgrupo: 'fofi',
        label: 'FOF',
      }),
    ).toBeNull();
    expect(
      destinoDoFantasma(l, {
        kind: 'secao',
        categoria: 'fiis',
        sectionKey: 'infra',
        subgrupo: 'infra',
        label: 'Infra',
      }),
    ).toEqual({ texto: 'Infra', recusado: false });
    expect(
      destinoDoFantasma(l, {
        kind: 'aba',
        categoria: 'stocks',
        label: 'Stocks',
        permitido: false,
        motivo: 'Em reais',
      }),
    ).toEqual({ texto: 'Stocks: Em reais', recusado: true });
    expect(
      avisoAbaRecusada(
        { kind: 'aba', categoria: 'stocks', label: 'Stocks', permitido: false },
        'KDIF11',
      ),
    ).toBe('Stocks não aceita KDIF11: indisponível.');
  });

  it('chipsDaBandeja: sem a aba atual; sem resposta = null (aceita); motivo curto', () => {
    const chips = chipsDaBandeja('fiis', undefined);
    expect(chips.map((c) => c.categoria)).toEqual(['fimFia', 'acoes', 'stocks', 'reits', 'etfs']);
    expect(chips.every((c) => c.permitido === null)).toBe(true);
    expect(motivoCurto(MOTIVO_EM_REAIS)).toBe('em reais');
    expect(motivoCurto(undefined)).toBe('indisponível');
  });
});
