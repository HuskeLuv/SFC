// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';

const mockCsrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mockCsrfFetch, getCsrfToken: vi.fn() }),
}));

import {
  useDividas,
  useCreateDivida,
  useRegistrarPagamento,
  useDividaCronograma,
  type DividaDTO,
} from '../useDividas';

const dividaDTO = (over: Partial<DividaDTO> = {}): DividaDTO => ({
  id: 'div-1',
  nome: 'Apê',
  instituicao: null,
  tipo: 'financiamento_imobiliario',
  modalidade: 'financiamento',
  principal: 100000,
  taxaAm: 0.01,
  taxaUnidadeEntrada: 'am',
  prazoMeses: 120,
  sistema: 'PRICE',
  indexador: 'PREFIXADO',
  primeiroVencimento: '2026-01',
  saldoInicial: null,
  dataSaldoInicial: null,
  status: 'ativa',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
  mockCsrfFetch.mockReset();
});

describe('useDividas', () => {
  it('carrega a lista com credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ dividas: [dividaDTO()] }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHookWithClient(() => useDividas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dividas).toHaveLength(1);
    expect(result.current.dividas[0].nome).toBe('Apê');
    expect(fetchMock).toHaveBeenCalledWith('/api/dividas', { credentials: 'include' });
  });

  it('expõe erro quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({}, 500)));

    const { result } = renderHookWithClient(() => useDividas());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.dividas).toEqual([]);
  });
});

describe('useDividaCronograma', () => {
  it('busca o cronograma só quando habilitado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse({
        cronograma: [
          {
            numero: 1,
            mes: '2026-01',
            parcela: 1434.71,
            juros: 1000,
            amortizacao: 434.71,
            saldoDevedor: 99565.29,
          },
        ],
        saldo: { saldoDevedor: 100000, parcelasPagas: 0, proximaParcela: null },
        indexador: 'PREFIXADO',
        fatorIndexacao: 1,
        saldoCorrigido: 100000,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHookWithClient(() => useDividaCronograma('div-1'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data!.cronograma).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/dividas/div-1/cronograma', {
      credentials: 'include',
    });
  });

  it('não busca com id null', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderHookWithClient(() => useDividaCronograma(null));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useCreateDivida', () => {
  it('faz POST via csrfFetch e devolve o DTO', async () => {
    mockCsrfFetch.mockResolvedValue(mockFetchResponse({ divida: dividaDTO() }, 201));

    const { result } = renderHookWithClient(() => useCreateDivida());
    const dto = await result.current.mutateAsync({
      modalidade: 'financiamento',
      nome: 'Apê',
      tipo: 'financiamento_imobiliario',
      principal: 100000,
      taxaAm: 0.01,
      prazoMeses: 120,
      sistema: 'PRICE',
      primeiroVencimento: '2026-01',
    });

    expect(dto.id).toBe('div-1');
    expect(mockCsrfFetch).toHaveBeenCalledWith(
      '/api/dividas',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('propaga a mensagem de erro da API', async () => {
    mockCsrfFetch.mockResolvedValue(
      mockFetchResponse({ error: 'Dados inválidos: principal' }, 400),
    );

    const { result } = renderHookWithClient(() => useCreateDivida());
    await expect(
      result.current.mutateAsync({
        modalidade: 'rotativa',
        nome: 'Cartão',
        tipo: 'cartao_credito',
        saldoInicial: 5000,
        dataSaldoInicial: '2026-01',
      }),
    ).rejects.toThrow('Dados inválidos: principal');
  });
});

describe('useRegistrarPagamento', () => {
  it('faz POST no sub-recurso de pagamentos', async () => {
    mockCsrfFetch.mockResolvedValue(
      mockFetchResponse({ pagamento: { id: 'pg-1' }, divida: dividaDTO() }, 201),
    );

    const { result } = renderHookWithClient(() => useRegistrarPagamento('div-1'));
    await result.current.mutateAsync({ month: '2026-01', valor: 1434.71, parcelaNumero: 1 });

    expect(mockCsrfFetch).toHaveBeenCalledWith(
      '/api/dividas/div-1/pagamentos',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('propaga 409 de parcela duplicada', async () => {
    mockCsrfFetch.mockResolvedValue(
      mockFetchResponse({ error: 'Parcela 1 já registrada como paga' }, 409),
    );

    const { result } = renderHookWithClient(() => useRegistrarPagamento('div-1'));
    await expect(
      result.current.mutateAsync({ month: '2026-01', valor: 100, parcelaNumero: 1 }),
    ).rejects.toThrow('Parcela 1 já registrada como paga');
  });
});
