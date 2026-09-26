// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AlocacaoAtivosTable from '../AlocacaoAtivosTable';
import type { UseAlocacaoConfigReturn } from '@/hooks/useAlocacaoConfig';

const zero = { valor: 0, percentual: 0 };
const distribuicao = {
  reservaEmergencia: { valor: 5000, percentual: 5 },
  reservaOportunidade: zero,
  rendaFixaFundos: { valor: 40000, percentual: 40 },
  fimFia: zero,
  fiis: { valor: 20000, percentual: 20 },
  acoes: { valor: 35000, percentual: 35 },
  stocks: zero,
  reits: zero,
  etfs: zero,
  moedasCriptos: zero,
  previdenciaSeguros: zero,
  opcoes: zero,
  imoveisBens: { valor: 300000, percentual: 75 },
};

function makeConfig(overrides: Partial<UseAlocacaoConfigReturn> = {}): UseAlocacaoConfigReturn {
  return {
    configuracoes: [
      { categoria: 'reservaEmergencia', minimo: 5, maximo: 10, target: 10 },
      { categoria: 'acoes', minimo: 20, maximo: 40, target: 30 },
      { categoria: 'fiis', minimo: 10, maximo: 30, target: 25 },
    ],
    loading: false,
    error: null,
    updateConfiguracao: vi.fn(),
    saveChanges: vi.fn().mockResolvedValue(true),
    startEditing: vi.fn(),
    stopEditing: vi.fn(),
    isEditing: vi.fn(() => false),
    totalTargets: 55,
    refetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const renderTable = (config: UseAlocacaoConfigReturn) =>
  render(
    <AlocacaoAtivosTable
      distribuicao={distribuicao}
      alocacaoConfig={config}
      totais={{ dinheiro: 100000, dinheiroMaisBens: 400000 }}
      onNavigateToTab={vi.fn()}
    />,
  );

describe('AlocacaoAtivosTable abaixo de lg (cartões)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  });
  afterEach(() => {
    // @ts-expect-error — jsdom sem matchMedia nos outros arquivos
    delete window.matchMedia;
    document.body.style.overflow = '';
  });

  it('renderiza cartões (sem <table>) e Imóveis fora das metas', () => {
    renderTable(makeConfig());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alocação de ativos' })).toBeInTheDocument();
    expect(screen.getByText('Fora da rentabilidade e das metas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar meta de Ações' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Alocação atual/ })).toBeInTheDocument();
  });

  it('Aplicar chama updateConfiguracao por campo alterado e NÃO chama saveChanges', () => {
    const config = makeConfig();
    renderTable(config);
    fireEvent.click(screen.getByRole('button', { name: 'Editar meta de Ações' }));
    fireEvent.change(screen.getByLabelText('% Target'), { target: { value: '32,5' } });
    fireEvent.change(screen.getByLabelText('Máximo (% da carteira)'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(config.updateConfiguracao).toHaveBeenCalledWith('acoes', 'target', 32.5);
    expect(config.updateConfiguracao).toHaveBeenCalledWith('acoes', 'maximo', 45);
    expect(config.updateConfiguracao).not.toHaveBeenCalledWith(
      'acoes',
      'minimo',
      expect.anything(),
    );
    expect(config.saveChanges).not.toHaveBeenCalled();
    expect(screen.queryByText(/salvo/i)).not.toBeInTheDocument();
  });

  it('a barra "não salvas" aparece e grava com saveChanges', async () => {
    const config = makeConfig();
    renderTable(config);
    fireEvent.click(screen.getByRole('button', { name: "Editar meta de FII's" }));
    fireEvent.change(screen.getByLabelText('% Target'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    const barra = screen.getByRole('region', { name: 'Alterações de alocação não salvas' });
    expect(barra).toHaveTextContent('1 alteração de alocação ainda não salva');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    });
    expect(config.saveChanges).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Alterações de alocação não salvas' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Configurações salvas com sucesso!')).toBeInTheDocument();
  });

  it('falha ao salvar mantém a barra com erro; Descartar volta ao gravado', async () => {
    const config = makeConfig({ saveChanges: vi.fn().mockResolvedValue(false) });
    renderTable(config);
    fireEvent.click(screen.getByRole('button', { name: 'Editar meta de Ações' }));
    fireEvent.change(screen.getByLabelText('% Target'), { target: { value: '31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    });
    expect(await screen.findByText('Não foi possível salvar. Tente de novo.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(config.refetch).toHaveBeenCalled();
    expect(
      screen.queryByRole('region', { name: 'Alterações de alocação não salvas' }),
    ).not.toBeInTheDocument();
  });

  it('Reserva de Emergência: campos em R$ convertidos com parseValorReserva', () => {
    const config = makeConfig();
    renderTable(config);
    fireEvent.click(screen.getByRole('button', { name: 'Editar meta de Reserva de Emergência' }));
    const alvo = screen.getByLabelText('Alvo') as HTMLInputElement;
    // 10% de R$ 100.000 = R$ 10.000,00
    expect(alvo.value).toBe('10.000,00');
    fireEvent.change(alvo, { target: { value: '15.000,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    // R$ 15.000 / R$ 100.000 = 15%
    expect(config.updateConfiguracao).toHaveBeenCalledWith('reservaEmergencia', 'target', 15);
  });

  it('mínimo acima de 100% não aplica e mostra erro', () => {
    const config = makeConfig();
    renderTable(config);
    fireEvent.click(screen.getByRole('button', { name: 'Editar meta de Ações' }));
    fireEvent.change(screen.getByLabelText('Mínimo (% da carteira)'), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(config.updateConfiguracao).not.toHaveBeenCalled();
    expect(screen.getByText(/O valor máximo é 100.00%/)).toBeInTheDocument();
  });
});
