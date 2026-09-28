// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import InstallAppCard from '../InstallAppCard';
import { INSTALL_EVENTS, INSTALL_STORAGE_KEYS } from '@/lib/pwa/installPromptContract';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

let standalone = false;

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function fakePromptEvent() {
  return Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
  });
}

function withDeferredPrompt() {
  window.__mfDeferredInstallPrompt = fakePromptEvent();
}

beforeEach(() => {
  standalone = false;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.__mfDeferredInstallPrompt = null;
  setUserAgent(ANDROID_UA);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('standalone') ? standalone : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InstallAppCard banner', () => {
  it('não renderiza no app instalado (standalone)', () => {
    standalone = true;
    window.localStorage.setItem(INSTALL_STORAGE_KEYS.visits, '5');
    withDeferredPrompt();
    render(<InstallAppCard variant="banner" />);
    expect(screen.queryByText('Instale o My Finance')).not.toBeInTheDocument();
  });

  it('primeira visita não mostra', () => {
    withDeferredPrompt();
    render(<InstallAppCard variant="banner" />);
    expect(screen.queryByText('Instale o My Finance')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INSTALL_STORAGE_KEYS.visits)).toBe('1');
  });

  it('segunda visita mostra, com Instalar no Android', () => {
    window.localStorage.setItem(INSTALL_STORAGE_KEYS.visits, '1');
    withDeferredPrompt();
    render(<InstallAppCard variant="banner" />);
    expect(screen.getByText('Instale o My Finance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Instalar' })).toBeInTheDocument();
  });

  it('conta a visita uma vez só por sessão', () => {
    withDeferredPrompt();
    const { unmount } = render(<InstallAppCard variant="banner" />);
    unmount();
    render(<InstallAppCard variant="banner" />);
    expect(window.localStorage.getItem(INSTALL_STORAGE_KEYS.visits)).toBe('1');
  });

  it('aparece quando o prompt chega depois (evento do swClient)', () => {
    window.localStorage.setItem(INSTALL_STORAGE_KEYS.visits, '3');
    render(<InstallAppCard variant="banner" />);
    expect(screen.queryByText('Instale o My Finance')).not.toBeInTheDocument();
    act(() => {
      withDeferredPrompt();
      window.dispatchEvent(new Event(INSTALL_EVENTS.available));
    });
    expect(screen.getByText('Instale o My Finance')).toBeInTheDocument();
  });

  it('"Agora não" grava o timestamp e esconde por 30 dias', () => {
    const now = new Date('2026-09-23T12:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    window.localStorage.setItem(INSTALL_STORAGE_KEYS.visits, '4');
    withDeferredPrompt();
    render(<InstallAppCard variant="banner" />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(window.localStorage.getItem(INSTALL_STORAGE_KEYS.dismissedAt)).toBe(String(now));
    expect(screen.queryByText('Instale o My Finance')).not.toBeInTheDocument();
  });

  it('dispensa de 31 dias atrás já venceu', () => {
    const now = Date.now();
    window.localStorage.setItem(INSTALL_STORAGE_KEYS.visits, '4');
    window.localStorage.setItem(
      INSTALL_STORAGE_KEYS.dismissedAt,
      String(now - 31 * 24 * 60 * 60 * 1000),
    );
    withDeferredPrompt();
    render(<InstallAppCard variant="banner" />);
    expect(screen.getByText('Instale o My Finance')).toBeInTheDocument();
  });

  it('storage que lança exceção → não mostra e não quebra', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    withDeferredPrompt();
    expect(() => render(<InstallAppCard variant="banner" />)).not.toThrow();
    expect(screen.queryByText('Instale o My Finance')).not.toBeInTheDocument();
  });

  it('iOS mostra "Como instalar" e o passo a passo com "Não mostrar de novo"', () => {
    setUserAgent(IOS_UA);
    window.localStorage.setItem(INSTALL_STORAGE_KEYS.visits, '2');
    render(<InstallAppCard variant="banner" />);
    fireEvent.click(screen.getByRole('button', { name: 'Como instalar' }));
    expect(screen.getByRole('dialog', { name: 'Instale no iPhone' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Não mostrar de novo' }));
    expect(window.localStorage.getItem(INSTALL_STORAGE_KEYS.never)).toBe('1');
    expect(screen.queryByText('Instale o My Finance')).not.toBeInTheDocument();
  });

  it('sem prompt e fora do iOS não mostra nada', () => {
    window.localStorage.setItem(INSTALL_STORAGE_KEYS.visits, '5');
    render(<InstallAppCard variant="banner" />);
    expect(screen.queryByText('Instale o My Finance')).not.toBeInTheDocument();
  });
});

describe('InstallAppCard row', () => {
  it('ignora a dispensa e a contagem de visitas', () => {
    window.localStorage.setItem(INSTALL_STORAGE_KEYS.never, '1');
    window.localStorage.setItem(INSTALL_STORAGE_KEYS.dismissedAt, String(Date.now()));
    withDeferredPrompt();
    render(<InstallAppCard variant="row" />);
    expect(screen.getByRole('button', { name: /Instalar app/ })).toBeInTheDocument();
  });

  it('chama o prompt nativo no Android', async () => {
    const event = fakePromptEvent();
    window.__mfDeferredInstallPrompt = event;
    render(<InstallAppCard variant="row" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Instalar app/ }));
    });
    expect(event.prompt).toHaveBeenCalled();
  });

  it('some em standalone', () => {
    standalone = true;
    withDeferredPrompt();
    render(<InstallAppCard variant="row" />);
    expect(screen.queryByRole('button', { name: /Instalar app/ })).not.toBeInTheDocument();
  });
});
