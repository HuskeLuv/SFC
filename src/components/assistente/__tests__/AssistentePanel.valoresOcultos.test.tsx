// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ValoresOcultosProvider, useValoresOcultos } from '@/context/ValoresOcultosContext';
import { mockFetchResponse } from '@/test/mocks/fetch';
import AssistentePanel from '../AssistentePanel';

/**
 * Esconder valores — Assistente de IA (Fase 6, decisão 14): com o olho fechado só aparece um aviso
 * fixo no painel; o texto da IA, as mensagens e os cartões de proposta NÃO viram pílula (as
 * sentinelas continuam no texto). Com o olho aberto ou a flag desligada, o painel é o de hoje.
 * A rota é uma tela fora das rotas cobertas: o aviso não depende de rotasCobertas.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/educacao' }));
vi.mock('@/context/CashflowYearContext', () => ({
  useCashflowYear: () => ({ year: 2026, setYear: () => {} }),
}));

const RESPOSTA =
  'Em outubro você gastou R$ 4.567,89 com mercado. Posso registrar R$ 1.357,91 de aluguel em novembro?';
const PROPOSTA = {
  token: 't-1',
  tipo: 'despesa',
  linha: 'Aluguel',
  grupo: 'Habitação',
  valor: 1357.91,
  modo: 'definir',
  recorrente: false,
  periodo: 'novembro/2026',
  ano: 2026,
  descricao: null,
  celulas: [{ mes: 10, mesNome: 'novembro', valorAtual: 0, valorNovo: 1357.91 }],
  valorTotal: 1357.91,
  expiraEm: Date.now() + 600_000,
};
const USO = { usadas: 3, limite: 300, restantes: 297, economico: false };

const csrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch }) }));

const AVISO = 'Com o olho fechado, as respostas do assistente ainda podem mostrar valores.';

function Olho() {
  const { alternar } = useValoresOcultos();
  return (
    <button type="button" onClick={alternar}>
      olho
    </button>
  );
}

function renderPainel({
  habilitado,
  ocultos,
  comOlho = false,
}: {
  habilitado: boolean;
  ocultos: boolean;
  comOlho?: boolean;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ValoresOcultosProvider habilitado={habilitado} inicial={ocultos}>
        <AssistentePanel />
        {comOlho && <Olho />}
      </ValoresOcultosProvider>
    </QueryClientProvider>,
  );
}

async function abrirEPerguntar() {
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir assistente' }));
  const painel = screen.getByRole('dialog', { name: 'Assistente My Finance' });
  fireEvent.change(screen.getByPlaceholderText('Escreva sua pergunta…'), {
    target: { value: 'Quanto gastei?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  await screen.findByText(/Em outubro você gastou/);
  return painel;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(mockFetchResponse({ habilitado: true, uso: USO })),
  );
  csrfFetch.mockImplementation(async (url: string) =>
    url === '/api/assistente'
      ? mockFetchResponse({ resposta: RESPOSTA, propostas: [PROPOSTA], uso: USO })
      : mockFetchResponse({ ok: true }),
  );
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  csrfFetch.mockReset();
  document.documentElement.removeAttribute('data-valores-ocultos');
});

describe('AssistentePanel — esconder valores (decisão 14)', () => {
  it('olho fechado: mostra o aviso e NÃO mascara a resposta nem o cartão', async () => {
    renderPainel({ habilitado: true, ocultos: true });
    const painel = await abrirEPerguntar();

    const aviso = screen.getByRole('note');
    expect(aviso).toHaveTextContent(AVISO);
    expect(painel).toContainElement(aviso);

    // As sentinelas continuam no texto (resposta e cartão de proposta), sem pílula.
    expect(painel.textContent).toContain('R$ 4.567,89');
    expect(painel.textContent).toContain('R$ 1.357,91');
    expect(painel.querySelector('.mf-sensivel')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('o aviso segue o olho ao alternar', async () => {
    renderPainel({ habilitado: true, ocultos: false, comOlho: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir assistente' }));
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'olho' }));
    expect(await screen.findByRole('note')).toHaveTextContent(AVISO);
    fireEvent.click(screen.getByRole('button', { name: 'olho' }));
    await waitFor(() => expect(screen.queryByRole('note')).toBeNull());
  });

  it('olho aberto: painel idêntico ao da flag desligada (sem aviso)', async () => {
    const aberto = renderPainel({ habilitado: true, ocultos: false });
    const htmlAberto = (await abrirEPerguntar()).outerHTML;
    expect(screen.queryByText(AVISO)).toBeNull();
    aberto.unmount();

    renderPainel({ habilitado: false, ocultos: true });
    const htmlSemFlag = (await abrirEPerguntar()).outerHTML;
    expect(screen.queryByText(AVISO)).toBeNull();

    // `expiraEm` não aparece no DOM; o resto é igual byte a byte.
    expect(htmlAberto).toBe(htmlSemFlag);
  });

  it('flag desligada: o cookie de olho fechado não liga o aviso', async () => {
    renderPainel({ habilitado: false, ocultos: true });
    await abrirEPerguntar();
    expect(screen.queryByRole('note')).toBeNull();
    await waitFor(() => expect(csrfFetch).toHaveBeenCalledTimes(1));
  });
});
