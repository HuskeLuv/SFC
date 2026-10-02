// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import type { WizardFormData } from '@/types/wizard';

/**
 * Preset OPCIONAL do AddAssetWizard (Análise de Ativos, fatia D). As etapas são trocadas por
 * marcadores que mostram o que chegou no formData — o teste confere a etapa de partida e os dados
 * pré-preenchidos, e que SEM preset nada muda (etapa 1, formulário vazio).
 */
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) => {
          const props: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (['className', 'role', 'aria-modal', 'aria-labelledby', 'id'].includes(k)) {
              props[k] = v;
            }
          }
          return <div {...props}>{children}</div>;
        },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: vi.fn() }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => false }));
vi.mock('@/hooks/useKeyboardInset', () => ({
  useKeyboardInset: () => ({ height: null, offsetTop: 0 }),
}));
vi.mock('../wizard/usePriceDeviationWarning', () => ({
  usePriceDeviationWarning: () => ({ warning: null, referencePrice: null, effectiveDate: null }),
}));

const { marcador } = vi.hoisted(() => ({
  marcador:
    (nome: string) =>
    ({ formData }: { formData: WizardFormData }) => (
      <div data-testid="etapa" data-etapa={nome}>
        <span data-testid="operacao">{formData.operacao}</span>
        <span data-testid="tipo">{formData.tipoAtivo}</span>
        <span data-testid="ativo">{formData.ativo}</span>
        <span data-testid="assetId">{formData.assetId}</span>
        <span data-testid="acoesBrasilTipo">{formData.acoesBrasilTipo ?? ''}</span>
      </div>
    ),
}));
vi.mock('../wizard/Step1AssetType', () => ({ default: marcador('tipo') }));
vi.mock('../wizard/Step2Institution', () => ({ default: marcador('instituicao') }));
vi.mock('../wizard/Step3Asset', () => ({ default: marcador('ativo') }));
vi.mock('../wizard/Step4AssetInfo', () => ({ default: marcador('info') }));
vi.mock('../wizard/Step5Confirmation', () => ({ default: marcador('confirmacao') }));
vi.mock('../wizard/Step2AporteInstitution', () => ({ default: marcador('aporte-inst') }));
vi.mock('../wizard/Step3AporteAsset', () => ({ default: marcador('aporte-ativo') }));
vi.mock('../wizard/Step4AporteInfo', () => ({ default: marcador('aporte-info') }));
vi.mock('../wizard/Step5AporteConfirmation', () => ({ default: marcador('aporte-conf') }));
vi.mock('../wizard/Step4PlanejarFields', () => ({ default: marcador('planejar') }));
vi.mock('../wizard/Step5PlanejarConfirmation', () => ({ default: marcador('planejar-conf') }));

import AddAssetWizard, { aplicarPreset, type AddAssetWizardPreset } from '../AddAssetWizard';

function renderWizard(props: Partial<React.ComponentProps<typeof AddAssetWizard>> = {}) {
  const client = createTestQueryClient();
  const base = { isOpen: true, onClose: vi.fn(), onSuccess: vi.fn() };
  const r = render(
    <QueryClientProvider client={client}>
      <AddAssetWizard {...base} {...props} />
    </QueryClientProvider>,
  );
  const rerender = (p: Partial<React.ComponentProps<typeof AddAssetWizard>>) =>
    r.rerender(
      <QueryClientProvider client={client}>
        <AddAssetWizard {...base} {...p} />
      </QueryClientProvider>,
    );
  return { ...r, rerender };
}

const etapa = () => screen.getByTestId('etapa').getAttribute('data-etapa');
const txt = (id: string) => screen.getByTestId(id).textContent;

const COMPRA_WEGE: AddAssetWizardPreset = {
  operacao: 'compra',
  tipoAtivo: 'acoes-brasil',
  ativo: 'WEGE3 - WEG S.A.',
  assetId: 'asset-wege',
};

beforeEach(() => vi.clearAllMocks());

describe('AddAssetWizard sem preset (regressão zero)', () => {
  it('abre na etapa 1 com o formulário vazio e operação compra', () => {
    renderWizard();
    expect(etapa()).toBe('tipo');
    expect(txt('operacao')).toBe('compra');
    expect(txt('tipo')).toBe('');
    expect(txt('ativo')).toBe('');
    expect(screen.getByText('Adicionar Ativo à Carteira')).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 5')).toBeInTheDocument();
  });
});

describe('AddAssetWizard com preset', () => {
  it('compra com assetId: abre em Instituição com o ativo escolhido (ação)', () => {
    renderWizard({ preset: COMPRA_WEGE });
    expect(etapa()).toBe('instituicao');
    expect(txt('operacao')).toBe('compra');
    expect(txt('tipo')).toBe('acoes-brasil');
    expect(txt('ativo')).toBe('WEGE3 - WEG S.A.');
    expect(txt('assetId')).toBe('asset-wege');
    expect(txt('acoesBrasilTipo')).toBe('acao');
    expect(screen.getByText('Passo 2 de 5')).toBeInTheDocument();
  });

  it('planejar com assetId: abre direto na etapa do objetivo, título de planejar', () => {
    renderWizard({
      preset: { operacao: 'planejar', tipoAtivo: 'fii', ativo: 'HGLG11', assetId: 'asset-hglg' },
    });
    expect(etapa()).toBe('planejar');
    expect(txt('operacao')).toBe('planejar');
    expect(txt('tipo')).toBe('fii');
    expect(txt('acoesBrasilTipo')).toBe('');
    expect(screen.getByText('Planejar Ativo na Carteira')).toBeInTheDocument();
    // planejar não tem Instituição: tipo, ativo, objetivo, confirmação
    expect(screen.getByText('Passo 3 de 4')).toBeInTheDocument();
  });

  it('sem assetId: abre no passo Ativo com a busca preenchida', () => {
    renderWizard({ preset: { ...COMPRA_WEGE, assetId: null, ativo: 'WEGE3' } });
    expect(etapa()).toBe('ativo');
    expect(txt('ativo')).toBe('WEGE3');
    expect(txt('assetId')).toBe('');
  });

  it('fechar e reabrir reaplica o preset', () => {
    const { rerender } = renderWizard({ preset: COMPRA_WEGE });
    expect(etapa()).toBe('instituicao');
    act(() => rerender({ preset: COMPRA_WEGE, isOpen: false }));
    act(() => rerender({ preset: COMPRA_WEGE, isOpen: true }));
    expect(etapa()).toBe('instituicao');
    expect(txt('assetId')).toBe('asset-wege');
  });
});

describe('aplicarPreset', () => {
  it('não muda os demais campos do formulário inicial', () => {
    const { formData } = aplicarPreset(COMPRA_WEGE);
    expect(formData.quantidade).toBe(0);
    expect(formData.instituicaoId).toBe('');
    expect(formData.objetivo).toBe(0);
  });
});
