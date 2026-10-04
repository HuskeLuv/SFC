// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ContextoBlocoReporte } from '@/types/analiseAtivosCuradoria';

const midia = vi.hoisted(() => ({ celular: false }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => midia.celular,
  useMediaQuery: () => midia.celular,
}));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
}));
const auth = vi.hoisted(() => ({ actingClient: null as unknown }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

import FormReportarDado, { opcoesDado, validarForm } from '../FormReportarDado';
import BotaoReportarDado from '../BotaoReportarDado';

const CONTEXTO: ContextoBlocoReporte = {
  rotuloBloco: 'Valuation · Múltiplos',
  dados: [
    { campo: 'pl', rotulo: 'P/L', valorExibido: '31,2', periodo: 'últ. 12m' },
    { campo: 'payout', rotulo: 'Payout', valorExibido: '55%', periodo: '2025' },
  ],
  fonteExibida: 'CVM DFP 2025',
  frescorExibido: 'atualizado em 29/09',
  versao: '2026-10-03T10:40:00.000Z',
};

const fetchMock = vi.fn();
const onFechar = vi.fn();

function resposta(status: number, corpo: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(corpo), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function renderForm(over: Partial<Parameters<typeof FormReportarDado>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FormReportarDado
        ticker="WEGE3"
        classe="acao"
        bloco="valuation"
        contexto={CONTEXTO}
        campo="payout"
        aberto
        onFechar={onFechar}
        {...over}
      />
    </QueryClientProvider>,
  );
}

const mensagem = () => screen.getByLabelText('O que está errado?') as HTMLTextAreaElement;
const enviar = () => screen.getByRole('button', { name: /Enviar relato|Tentar de novo/ });
const TEXTO_OK = 'O release do 4T25 informa payout de 52% em 2025.';

beforeEach(() => {
  midia.celular = false;
  auth.actingClient = null;
  fetchMock.mockReset();
  onFechar.mockReset();
  nav.push.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'csrf-token=abc';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('funções puras', () => {
  it('opcoesDado: rótulo · valor · período + "Outro dado deste bloco"', () => {
    expect(opcoesDado(CONTEXTO).map((o) => o.rotulo)).toEqual([
      'P/L · 31,2 · últ. 12m',
      'Payout · 55% · 2025',
      'Outro dado deste bloco',
    ]);
  });

  it('opcoesDado: sem valor exibido, só o rótulo (nunca "· —")', () => {
    const semValor = {
      ...CONTEXTO,
      dados: [
        { campo: 'indiceMf' as const, rotulo: 'Índice MF', valorExibido: null, periodo: null },
      ],
    };
    expect(opcoesDado(semValor).map((o) => o.rotulo)).toEqual([
      'Índice MF',
      'Outro dado deste bloco',
    ]);
  });

  it('validarForm: curta, HTML, valor esperado longo', () => {
    expect(validarForm({ mensagem: 'curta', valorEsperado: '', fonteEsperada: '' })).toEqual({
      mensagem: 'Escreva pelo menos 10 caracteres.',
    });
    expect(
      validarForm({ mensagem: '<b>negrito</b> aqui', valorEsperado: '', fonteEsperada: '' })
        .mensagem,
    ).toBe('Escreva só texto, sem marcações.');
    expect(
      validarForm({ mensagem: TEXTO_OK, valorEsperado: 'x'.repeat(41), fonteEsperada: '' })
        .valorEsperado,
    ).toBe('Use no máximo 40 caracteres.');
    // invisíveis não contam para o mínimo
    expect(
      validarForm({ mensagem: 'abcdefghi​‮', valorEsperado: '', fonteEsperada: '' }).mensagem,
    ).toBeDefined();
  });
});

describe('FormReportarDado — computador (modal de 560px)', () => {
  it('abre com o dado pré-escolhido e o contexto só leitura', () => {
    renderForm();
    const dialogo = screen.getByRole('dialog', { name: 'Reportar dado incorreto' });
    expect(dialogo.className).toContain('max-w-[560px]');
    expect((screen.getByLabelText('Qual dado?') as HTMLSelectElement).value).toBe('payout');
    const ctx = document.querySelector('[data-relato-contexto]')!;
    expect(ctx.textContent).toContain('WEGE3');
    expect(ctx.textContent).toContain('Valuation · Múltiplos');
    expect(ctx.textContent).toContain('55%');
    expect(ctx.textContent).toContain('CVM DFP 2025');
    // trocar o dado troca o valor do contexto
    fireEvent.change(screen.getByLabelText('Qual dado?'), { target: { value: 'pl' } });
    expect(ctx.textContent).toContain('31,2');
  });

  it('contador de caracteres acompanha o texto', () => {
    renderForm();
    expect(document.querySelector('[data-relato-contador]')!.textContent).toBe('0 de 1.000');
    fireEvent.change(mensagem(), { target: { value: 'abc' } });
    expect(document.querySelector('[data-relato-contador]')!.textContent).toBe('3 de 1.000');
  });

  it('inválido: resumo role=alert, erro no campo, aria-invalid, nada enviado', () => {
    renderForm();
    fireEvent.change(mensagem(), { target: { value: 'curto' } });
    fireEvent.click(enviar());
    expect(screen.getByRole('alert').textContent).toContain('Confira os campos destacados.');
    expect(mensagem().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Escreva pelo menos 10 caracteres.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(mensagem());
  });

  it('enviado: POST com CSRF e o contexto; mostra protocolo e prazo em data', async () => {
    fetchMock.mockReturnValueOnce(
      resposta(201, {
        id: 'r1',
        casoId: 'c1',
        protocolo: 'K7Q2M9XA',
        status: 'aberto',
        slaAte: '2026-10-09',
      }),
    );
    renderForm();
    fireEvent.change(mensagem(), { target: { value: TEXTO_OK } });
    fireEvent.change(screen.getByLabelText(/Valor que você esperava/), {
      target: { value: '52%' },
    });
    await act(async () => {
      fireEvent.click(enviar());
    });
    await screen.findByText('Relato enviado');
    expect(screen.getByText(/Protocolo K7Q2M9XA/)).toBeTruthy();
    expect(document.body.textContent).toContain('Resposta até 09/10/2026.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/analise-ativos/reportes');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('x-csrf-token')).toBe('abc');
    expect(JSON.parse(init.body)).toEqual({
      ticker: 'WEGE3',
      bloco: 'valuation',
      campo: 'payout',
      valorExibido: '55%',
      periodo: '2025',
      fonteExibida: 'CVM DFP 2025',
      frescorExibido: 'atualizado em 29/09',
      versao: '2026-10-03T10:40:00.000Z',
      mensagem: TEXTO_OK,
      valorEsperado: '52%',
    });
    const link = screen.getByRole('link', { name: 'Ver meus relatos' });
    expect(link.getAttribute('href')).toBe('/analise-ativos/meus-relatos');
  });

  it('rede: mantém o texto e oferece "Tentar de novo"', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderForm();
    fireEvent.change(mensagem(), { target: { value: TEXTO_OK } });
    await act(async () => {
      fireEvent.click(enviar());
    });
    await screen.findByText('Não foi possível enviar agora. Seu texto continua aqui.');
    expect(mensagem().value).toBe(TEXTO_OK);
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });

  it('409 duplicado: avisa e leva ao relato existente', async () => {
    fetchMock.mockReturnValueOnce(
      resposta(409, { error: 'x', casoId: 'c1', reporteId: 'r-antigo' }),
    );
    renderForm();
    fireEvent.change(mensagem(), { target: { value: TEXTO_OK } });
    await act(async () => {
      fireEvent.click(enviar());
    });
    await screen.findByText('Você já reportou este dado, e o relato ainda está aberto.');
    expect(screen.getByRole('link', { name: 'Ver o relato' }).getAttribute('href')).toBe(
      '/analise-ativos/meus-relatos?relato=r-antigo',
    );
  });

  it('429: texto do limite (dia, hora no ativo, IP do middleware)', async () => {
    fetchMock.mockReturnValueOnce(
      resposta(429, { error: 'x', limite: 'hora_ativo', voltaEm: null }),
    );
    renderForm();
    fireEvent.change(mensagem(), { target: { value: TEXTO_OK } });
    await act(async () => {
      fireEvent.click(enviar());
    });
    await screen.findByText(/Você já enviou 3 relatos sobre WEGE3 na última hora/);

    cleanup();
    fetchMock.mockReturnValueOnce(resposta(429, { error: 'Muitas requisições.' }));
    renderForm();
    fireEvent.change(mensagem(), { target: { value: TEXTO_OK } });
    await act(async () => {
      fireEvent.click(enviar());
    });
    await screen.findByText('Muitos envios seguidos. Aguarde um minuto e tente de novo.');
  });

  it('400 do servidor marca o campo; 404 = indisponível', async () => {
    fetchMock.mockReturnValueOnce(
      resposta(400, { error: 'x', details: { fonteEsperada: ['html'] } }),
    );
    renderForm();
    fireEvent.change(mensagem(), { target: { value: TEXTO_OK } });
    await act(async () => {
      fireEvent.click(enviar());
    });
    await screen.findByText('Escreva só texto, sem marcações.');

    cleanup();
    fetchMock.mockReturnValueOnce(resposta(404, { error: 'Recurso não disponível' }));
    renderForm();
    fireEvent.change(mensagem(), { target: { value: TEXTO_OK } });
    await act(async () => {
      fireEvent.click(enviar());
    });
    await screen.findByText('O envio de relatos está indisponível no momento.');
  });

  it('consultor agindo: aviso de que o relato vai no nome dele', () => {
    auth.actingClient = { id: 'c9', name: 'Marina' };
    renderForm();
    expect(screen.getByText(/o relato vai no seu nome/)).toBeTruthy();
  });

  it('texto do usuário nunca vira HTML', () => {
    renderForm();
    fireEvent.change(mensagem(), { target: { value: '<img src=x onerror=alert(1)>' } });
    expect(document.querySelector('img')).toBeNull();
  });

  it('Cancelar e o X chamam onFechar; alvos ≥ 44px', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onFechar).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Fechar' }).className).toMatch(/\bh-11\b/);
    expect(enviar().className).toMatch(/min-h-12|lg:min-h-11/);
  });
});

describe('FormReportarDado — celular (sheet de tela cheia)', () => {
  beforeEach(() => {
    midia.celular = true;
  });

  it('sheet com rodapé fixo de 48px e campos de 48px', () => {
    renderForm();
    const sheet = document.querySelector('[data-mf-sheet]')!;
    expect(sheet.className).toContain('h-[calc(100dvh');
    expect(enviar().className).toContain('min-h-12');
    expect((screen.getByLabelText('Qual dado?') as HTMLElement).className).toContain('min-h-12');
  });

  it('"voltar" do sistema fecha o sheet', async () => {
    const push = vi.spyOn(window.history, 'pushState');
    renderForm();
    expect(push).toHaveBeenCalled();
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 30));
    });
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
    push.mockRestore();
  });
});

describe('BotaoReportarDado', () => {
  const renderBotao = (props: Partial<Parameters<typeof BotaoReportarDado>[0]> = {}) => {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <BotaoReportarDado
          ticker="wege3"
          classe="acao"
          bloco="valuation"
          contexto={CONTEXTO}
          campo="pl"
          variante="link"
          {...props}
        />
      </QueryClientProvider>,
    );
  };

  it("variante 'link': gatilho de 44px abre o formulário com o campo escolhido", () => {
    renderBotao();
    const gatilho = screen.getByRole('button', { name: 'Reportar' });
    expect(gatilho.className).toContain('min-h-11');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(gatilho);
    expect(screen.getByRole('dialog', { name: 'Reportar dado incorreto' })).toBeTruthy();
    expect((screen.getByLabelText('Qual dado?') as HTMLSelectElement).value).toBe('pl');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });

  it("variante 'controlado': sem gatilho; abre com `aberto` e começa limpo a cada abertura", () => {
    const fechar = vi.fn();
    const { rerender } = renderBotao({ variante: 'controlado', aberto: false, onFechar: fechar });
    expect(screen.queryByRole('button', { name: 'Reportar' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    const qc = new QueryClient();
    const com = (aberto: boolean) => (
      <QueryClientProvider client={qc}>
        <BotaoReportarDado
          ticker="WEGE3"
          classe="acao"
          bloco="valuation"
          contexto={CONTEXTO}
          variante="controlado"
          aberto={aberto}
          onFechar={fechar}
        />
      </QueryClientProvider>
    );
    rerender(com(true));
    fireEvent.change(mensagem(), { target: { value: 'rascunho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(fechar).toHaveBeenCalled();
    rerender(com(false));
    rerender(com(true));
    expect(mensagem().value).toBe('');
  });
});
