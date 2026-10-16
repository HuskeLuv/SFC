// @vitest-environment jsdom
/**
 * Bloco 1 (fatia B): Exportar PDF do Comparador — o modal sem opções (o que vai, o que fica de
 * fora, prévia com os literais exatos, nome do arquivo); Baixar → "Gerando PDF…" →
 * baixarPdfComparacao com tickers na ordem dos slots + janela + tipo; aviso "PDF pronto: …";
 * NotAllowedError do iOS → "O PDF está pronto." + "Compartilhar PDF" (2º toque); 429 → limite e
 * botão desabilitado; outro erro → "Tentar de novo".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import { LEITURA_DOS_DADOS } from '@/services/analiseAtivos/textosLiterais';

const m = vi.hoisted(() => ({
  baixar: vi.fn(),
  toast: vi.fn((_d: unknown) => 1),
}));

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => false, useMediaQuery: () => false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ actingClient: null }) }));
vi.mock('@/hooks/useAnaliseAtivosSalvos', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  baixarPdfComparacao: m.baixar,
}));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover: m.toast }));

import { BotaoExportarPdf } from '@/components/analiseAtivos/comparador/ModalExportarPdf';
import { ErroAnalise } from '@/hooks/useAnaliseAtivos';

const PROPS = {
  classe: 'acao' as const,
  tickers: ['WEGE3', 'BBAS3', 'TAEE11'],
  janela: 5 as const,
  tipoFii: null,
  leitura: {
    janela: 5,
    contagens: [
      { ticker: 'WEGE3', n: 5, de: 6 },
      { ticker: 'BBAS3', n: 2, de: 6 },
      { ticker: 'TAEE11', n: 4, de: 6 },
    ],
    texto: LEITURA_DOS_DADOS.texto,
  },
};

function abrir() {
  render(<BotaoExportarPdf {...(PROPS as Parameters<typeof BotaoExportarPdf>[0])} />);
  fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/ }));
  return screen.getByRole('dialog', { name: 'Exportar PDF' });
}

beforeEach(() => {
  m.baixar.mockReset();
  m.toast.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T15:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('ModalExportarPdf', () => {
  it('sem opções: o que vai, o que fica de fora, prévia com literais exatos e o nome do arquivo', () => {
    const dialogo = abrir();
    expect(dialogo.textContent).toContain('O que vai no PDF');
    expect(dialogo.textContent).toContain('O que fica de fora');
    expect(dialogo.textContent).toContain('Até 10 PDFs por hora.');
    expect(dialogo.textContent).toContain(
      'Arquivo: comparacao-acoes-WEGE3-BBAS3-TAEE11-2026-10-16.pdf',
    );
    expect(
      screen.getByRole('img', { name: 'Prévia da página 1 do PDF da comparação' }),
    ).toBeTruthy();
    expect(dialogo.querySelectorAll('input, select')).toHaveLength(0);
    esperarDomLimpo(dialogo);
  });

  it('Baixar → Gerando PDF… → baixarPdfComparacao e o aviso "PDF pronto: …"', async () => {
    let resolver: (v: unknown) => void = () => undefined;
    m.baixar.mockImplementation(() => new Promise((r) => (resolver = r)));
    abrir();
    fireEvent.click(screen.getByRole('button', { name: /Baixar PDF/ }));
    const gerando = screen.getByRole('button', { name: /Gerando PDF…/ });
    expect(gerando.getAttribute('aria-busy')).toBe('true');
    expect(m.baixar).toHaveBeenCalledWith({
      classe: 'acao',
      tickers: ['WEGE3', 'BBAS3', 'TAEE11'],
      janela: 5,
      tipoFii: null,
    });
    await act(async () => resolver({ estado: 'baixado', nome: 'comparacao-acoes-x.pdf' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ mensagem: 'PDF pronto: comparacao-acoes-x.pdf' }),
    );
  });

  it('iOS (NotAllowedError): "O PDF está pronto." e o 2º toque em Compartilhar PDF', async () => {
    const compartilhar = vi.fn(async () => undefined);
    m.baixar.mockResolvedValue({ estado: 'compartilhar', nome: 'a.pdf', compartilhar });
    const dialogo = abrir();
    fireEvent.click(screen.getByRole('button', { name: /Baixar PDF/ }));
    const botao = await screen.findByRole('button', { name: /Compartilhar PDF/ });
    expect(dialogo.textContent).toContain('O PDF está pronto.');
    await waitFor(() => expect(document.activeElement).toBe(botao));
    fireEvent.click(botao);
    await waitFor(() => expect(compartilhar).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('429: o aviso do limite e Baixar desabilitado', async () => {
    m.baixar.mockRejectedValue(new ErroAnalise('limite', 429));
    abrir();
    fireEvent.click(screen.getByRole('button', { name: /Baixar PDF/ }));
    expect(
      await screen.findByText(/Você gerou 10 PDFs na última hora, o limite por conta/),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Baixar PDF/ }).hasAttribute('disabled')).toBe(true);
  });

  it('outro erro: a frase de erro e "Tentar de novo"', async () => {
    m.baixar.mockRejectedValueOnce(new ErroAnalise('falhou', 500));
    abrir();
    fireEvent.click(screen.getByRole('button', { name: /Baixar PDF/ }));
    expect(await screen.findByText('Não foi possível gerar o PDF. Tente de novo.')).toBeTruthy();
    m.baixar.mockResolvedValueOnce({ estado: 'baixado', nome: 'b.pdf' });
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    await waitFor(() => expect(m.baixar).toHaveBeenCalledTimes(2));
  });
});
