// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import InstitutionPicker from '../InstitutionPicker';
import { mockFetchResponse } from '@/test/mocks/fetch';

function deferredResponse<T>(data: T, status = 200) {
  let resolveFn: (v: Response) => void = () => {};
  const promise = new Promise<Response>((resolve) => {
    resolveFn = resolve;
  });
  return {
    promise,
    resolve: () => resolveFn(mockFetchResponse(data, status)),
  };
}

describe('InstitutionPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('mostra estado de loading enquanto a request está pendente', async () => {
    const deferred = deferredResponse({ institutions: [] });
    const fetchMock = vi.fn().mockReturnValue(deferred.promise);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <InstitutionPicker
        endpoint="/api/institutions"
        responseShape="institutions"
        selectedId=""
        selectedName=""
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText(/Digite o nome da instituição/i);
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText(/Carregando/i)).toBeInTheDocument();
    });

    await act(async () => {
      deferred.resolve();
    });
  });

  it('renderiza opções vindas da API com responseShape="institutions"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse({
        institutions: [
          { id: 'inst-1', nome: 'XP Investimentos', codigo: '102' },
          { id: 'inst-2', nome: 'Itaú', codigo: '341' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <InstitutionPicker
        endpoint="/api/institutions"
        responseShape="institutions"
        selectedId=""
        selectedName=""
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText(/Digite o nome da instituição/i);
    fireEvent.focus(input);

    expect(await screen.findByText('XP Investimentos')).toBeInTheDocument();
    expect(screen.getByText('Itaú')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
  });

  it('renderiza opções com responseShape="instituicoes" (aporte/resgate)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse({
        instituicoes: [
          { value: 'inst-1', label: 'XP Investimentos' },
          { value: 'inst-2', label: 'Rico' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <InstitutionPicker
        endpoint="/api/carteira/resgate/instituicoes?tipo=acoes-brasil"
        responseShape="instituicoes"
        selectedId=""
        selectedName=""
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/carteira/resgate/instituicoes?tipo=acoes-brasil');
    expect(calledUrl).toContain('search=');
    expect(calledUrl).toContain('limit=200');

    const input = screen.getByPlaceholderText(/Digite o nome da instituição/i);
    fireEvent.focus(input);

    expect(await screen.findByText('XP Investimentos')).toBeInTheDocument();
    expect(screen.getByText('Rico')).toBeInTheDocument();
  });

  it('não faz fetch quando endpoint é null e mostra mensagem fallback', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <InstitutionPicker
        endpoint={null}
        responseShape="instituicoes"
        selectedId=""
        selectedName=""
        onChange={vi.fn()}
        emptyEndpointMessage="Selecione o tipo de investimento antes de escolher a instituição."
      />,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Selecione o tipo de investimento antes de escolher a instituição/i),
    ).toBeInTheDocument();
  });

  it('dispara onChange com payload {id, nome} ao selecionar uma opção', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse({
        institutions: [{ id: 'inst-1', nome: 'XP Investimentos', codigo: '102' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const onChange = vi.fn();
    const onErrorClear = vi.fn();

    render(
      <InstitutionPicker
        endpoint="/api/institutions"
        responseShape="institutions"
        selectedId=""
        selectedName=""
        onChange={onChange}
        error="Campo obrigatório"
        onErrorClear={onErrorClear}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText(/Digite o nome da instituição/i);
    fireEvent.focus(input);

    const option = await screen.findByText('XP Investimentos');
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith({ id: 'inst-1', nome: 'XP Investimentos' });
    expect(onErrorClear).toHaveBeenCalled();
  });

  it('refaz busca na API quando o usuário digita no input (debounced)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const search = new URL(url, 'http://localhost').searchParams.get('search') ?? '';
      const all = [
        { id: 'inst-1', nome: 'Banco do Brasil', codigo: '001' },
        { id: 'inst-2', nome: 'XP Investimentos', codigo: '102' },
      ];
      const filtered = search
        ? all.filter((i) => i.nome.toLowerCase().includes(search.toLowerCase()))
        : all;
      return Promise.resolve(mockFetchResponse({ institutions: filtered }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const onChange = vi.fn();

    const { rerender } = render(
      <InstitutionPicker
        endpoint="/api/institutions"
        responseShape="institutions"
        selectedId=""
        selectedName=""
        onChange={onChange}
      />,
    );

    // Fetch inicial (search vazio)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const initialUrl = fetchMock.mock.calls[0][0] as string;
    expect(initialUrl).toContain('search=');

    // Simula o pai propagando o que o usuário digitou
    rerender(
      <InstitutionPicker
        endpoint="/api/institutions"
        responseShape="institutions"
        selectedId=""
        selectedName="XP"
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const searchUrl = fetchMock.mock.calls[1][0] as string;
    expect(searchUrl).toContain('search=XP');
  });

  it('limpa selectedId quando o usuário edita o texto após uma seleção', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ institutions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const onChange = vi.fn();

    render(
      <InstitutionPicker
        endpoint="/api/institutions"
        responseShape="institutions"
        selectedId="inst-xp"
        selectedName="XP Investimentos"
        onChange={onChange}
      />,
    );

    const input = screen.getByPlaceholderText(/Digite o nome da instituição/i);
    fireEvent.change(input, { target: { value: 'XP Investimentos Z' } });

    expect(onChange).toHaveBeenCalledWith({ id: '', nome: 'XP Investimentos Z' });
  });

  it('aborta a request anterior quando o endpoint muda', async () => {
    const aborted: boolean[] = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => {
            aborted.push(true);
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }
        setTimeout(() => resolve(mockFetchResponse({ institutions: [] })), 5000);
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <InstitutionPicker
        endpoint="/api/carteira/resgate/instituicoes?tipo=acao"
        responseShape="instituicoes"
        selectedId=""
        selectedName=""
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <InstitutionPicker
        endpoint="/api/carteira/resgate/instituicoes?tipo=fii"
        responseShape="instituicoes"
        selectedId=""
        selectedName=""
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(aborted.length).toBeGreaterThanOrEqual(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
