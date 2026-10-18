// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import BannerNovidade, {
  CHAVE_BANNER_DISPENSADO,
  LINK_SUPORTE,
  bannerDispensadoRecente,
} from '../BannerNovidade';
import RodapeLegal from '../RodapeLegal';
import { mercadoDaUrl } from '../AnaliseAtivosShell';
import {
  AVISO_BANNER,
  RODAPE_LEGAL_EUA,
  RODAPE_LEGAL_V2,
  RODAPE_LEGAL_V2_SELO,
} from '@/services/analiseAtivos/textosLiterais';
import { esperarDomLimpo } from '@/test/utils/varrerDom';

const DIA = 24 * 60 * 60 * 1000;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BannerNovidade', () => {
  it('aparece na primeira visita com o link do Suporte', () => {
    render(<BannerNovidade />);
    expect(screen.getByRole('region', { name: 'Aviso do beta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Suporte' })).toHaveAttribute('href', LINK_SUPORTE);
    expect(screen.getByRole('button', { name: 'Entendi' })).toBeInTheDocument();
  });

  it('"Entendi" esconde e grava a data', () => {
    render(<BannerNovidade />);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('region', { name: 'Aviso do beta' })).toBeNull();
    expect(Number(window.localStorage.getItem(CHAVE_BANNER_DISPENSADO))).toBeGreaterThan(0);
  });

  it('dispensado não volta antes de 30 dias', () => {
    const agora = new Date('2026-10-02T12:00:00Z').getTime();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(agora);
    window.localStorage.setItem(CHAVE_BANNER_DISPENSADO, String(agora - 29 * DIA));
    render(<BannerNovidade />);
    expect(screen.queryByRole('region', { name: 'Aviso do beta' })).toBeNull();
    expect(bannerDispensadoRecente(agora)).toBe(true);
  });

  it('volta depois de 30 dias', () => {
    const agora = new Date('2026-10-02T12:00:00Z').getTime();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(agora);
    window.localStorage.setItem(CHAVE_BANNER_DISPENSADO, String(agora - 31 * DIA));
    render(<BannerNovidade />);
    expect(screen.getByRole('region', { name: 'Aviso do beta' })).toBeInTheDocument();
  });

  it('remontar depois de dispensar continua escondido', () => {
    const { unmount } = render(<BannerNovidade />);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    unmount();
    render(<BannerNovidade />);
    expect(screen.queryByRole('region', { name: 'Aviso do beta' })).toBeNull();
  });

  it('localStorage indisponível: mostra o banner e "Entendi" ainda esconde', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    render(<BannerNovidade />);
    const botao = screen.getByRole('button', { name: 'Entendi' });
    act(() => {
      fireEvent.click(botao);
    });
    expect(screen.queryByRole('region', { name: 'Aviso do beta' })).toBeNull();
  });
});

describe('RodapeLegal', () => {
  it('v2.4: aviso legal único provisório (literal + selo) com o título fora do literal', () => {
    const { container } = render(<RodapeLegal className="mt-2" />);
    const raiz = container.querySelector('[data-rodape-legal]');
    expect(raiz).not.toBeNull();
    expect(raiz?.className).toContain('mt-2');
    expect(raiz?.textContent).toContain('Aviso importante.');
    expect(container.querySelector('[data-texto-legal="aviso-legal-v2"]')?.textContent).toBe(
      RODAPE_LEGAL_V2.texto,
    );
    expect(container.querySelector('[data-texto-legal="aviso-legal-v2-selo"]')?.textContent).toBe(
      RODAPE_LEGAL_V2_SELO.texto,
    );
    expect(raiz?.textContent).not.toMatch(/Índice/);
    const r = esperarDomLimpo(container);
    expect(r.literais).toEqual(['aviso-legal-v2', 'aviso-legal-v2-selo']);
  });

  it('Stocks e REITs: aviso EUA (10-K na SEC) no lugar do v2 (CVM), com o mesmo selo', () => {
    const { container } = render(<RodapeLegal mercado="eua" />);
    const eua = container.querySelector('[data-texto-legal="aviso-legal-eua"]');
    expect(eua?.textContent).toBe(RODAPE_LEGAL_EUA.texto);
    expect(eua?.textContent).toMatch(/10-K entregues à SEC/);
    expect(container.textContent).not.toMatch(/DFP\/ITR|CVM e informes de FIIs/);
    expect(container.querySelector('[data-texto-legal="aviso-legal-v2"]')).toBeNull();
    expect(esperarDomLimpo(container).literais).toEqual(['aviso-legal-eua', 'aviso-legal-v2-selo']);
  });

  it('mercado pela URL: Quadro ?classe=stock|reit; Comparador por ?c= ou pelos tickers', () => {
    const u = (qs: string) => new URLSearchParams(qs);
    expect(mercadoDaUrl('quadro', u('classe=stock'))).toBe('eua');
    expect(mercadoDaUrl('quadro', u('classe=reit&j=5'))).toBe('eua');
    expect(mercadoDaUrl('quadro', u('classe=fii'))).toBe('br');
    expect(mercadoDaUrl('quadro', u(''))).toBe('br');
    expect(mercadoDaUrl('comparador', u('t=AAPL,MSFT'))).toBe('eua');
    expect(mercadoDaUrl('comparador', u('t=BRK-B'))).toBe('eua');
    expect(mercadoDaUrl('comparador', u('t=WEGE3,ITUB4'))).toBe('br');
    expect(mercadoDaUrl('comparador', u('c=reit'))).toBe('eua');
    expect(mercadoDaUrl('comparador', u('c=fii'))).toBe('br');
    expect(mercadoDaUrl('salvos', u('classe=stock'))).toBe('br');
  });
});

describe('BannerNovidade v2.4', () => {
  it('traz o aviso curto literal (aviso-banner) e passa na varredura', () => {
    const { container } = render(<BannerNovidade />);
    expect(container.querySelector('[data-texto-legal="aviso-banner"]')?.textContent).toBe(
      AVISO_BANNER.texto,
    );
    esperarDomLimpo(container);
  });
});
