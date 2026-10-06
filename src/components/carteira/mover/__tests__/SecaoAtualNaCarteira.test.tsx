// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WizardFormData } from '@/types/wizard';
import { AJUDA_SUBGRUPO, SecaoAtualNaCarteira, tickerDoRotulo } from '../SecaoAtualNaCarteira';

const ASSET_ID = '3f2b8c1e-5d6a-4e7f-8a9b-0c1d2e3f4a5b';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

function montar(
  formData: Partial<WizardFormData>,
  respostas: { categoria: unknown; aba?: unknown },
  categoria: 'fiis' | 'etfs' = 'fiis',
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        jsonResponse(
          String(url).startsWith('/api/carteira/mover/categoria')
            ? respostas.categoria
            : (respostas.aba ?? { secoes: [] }),
        ),
      ),
    ),
  );
  const handleInputChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SecaoAtualNaCarteira
        formData={
          { assetId: ASSET_ID, ativo: 'KDIF11 - Kinea Infra', ...formData } as WizardFormData
        }
        categoria={categoria}
        campo="tipoFii"
        handleInputChange={handleInputChange}
      />
    </QueryClientProvider>,
  );
  return { handleInputChange };
}

const abaFii = {
  secoes: [{ tipo: 'infra', ativos: [{ id: 'pf', ticker: 'KDIF11', tipo: 'infra' }] }],
};

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.clearAllMocks());

describe('SecaoAtualNaCarteira (assistente de compra)', () => {
  it('extrai o ticker do rótulo do assistente', () => {
    expect(tickerDoRotulo('HGLG11 - CSHG Logística')).toBe('HGLG11');
  });

  it('ativo novo: só a ajuda do campo', async () => {
    montar({ tipoFii: '' }, { categoria: { categoria: 'fiis', override: false } });
    expect(screen.getByText(AJUDA_SUBGRUPO)).toBeInTheDocument();
  });

  it('já na carteira: mostra a seção "definida por você" e preenche o campo vazio', async () => {
    const { handleInputChange } = montar(
      { tipoFii: '' },
      { categoria: { categoria: 'fiis', override: false }, aba: abaFii },
    );
    expect(
      await screen.findByText(
        'Infra · definida por você. Comprar mais não muda a seção; para trocar, use Mover na Carteira.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(handleInputChange).toHaveBeenCalledWith('tipoFii', 'infra'));
  });

  it('não sobrescreve uma escolha que já está no campo e avisa que ela não vale', async () => {
    const { handleInputChange } = montar(
      { tipoFii: 'tvm' },
      { categoria: { categoria: 'fiis', override: false }, aba: abaFii },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'KDIF11 já está em Infra na sua Carteira. Esta compra será somada à posição em Infra; a seção escolhida aqui não será aplicada. Para trocar, use Mover na Carteira.',
    );
    expect(handleInputChange).not.toHaveBeenCalled();
  });

  it('mesma seção do campo: sem aviso', async () => {
    montar(
      { tipoFii: 'infra' },
      { categoria: { categoria: 'fiis', override: false }, aba: abaFii },
    );
    await screen.findByText(/definida por você/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('movido para outra aba: diz onde ele está', async () => {
    montar(
      { tipoFii: '' },
      {
        categoria: { categoria: 'fimFia', override: true },
        aba: {
          secoes: [{ tipo: 'fiagro', ativos: [{ id: 'pf', ticker: 'KDIF11', tipo: 'fiagro' }] }],
        },
      },
    );
    expect(
      await screen.findByText(
        'Na sua Carteira, KDIF11 está em Fundos › Fiagro (definida por você). Comprar mais não muda isso.',
      ),
    ).toBeInTheDocument();
  });
});
