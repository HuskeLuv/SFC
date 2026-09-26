/**
 * Contrato do convite de instalação (PWA fase 0).
 *
 * O swClient captura o `beforeinstallprompt`, guarda em `window.__mfDeferredInstallPrompt` e
 * dispara `INSTALL_EVENTS.available`; o useInstallPrompt consome.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __mfDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
  interface Navigator {
    /** Safari iOS: true quando aberto pela tela de início. */
    standalone?: boolean;
  }
}

export const INSTALL_EVENTS = {
  available: 'mf:installprompt',
  installed: 'mf:appinstalled',
} as const;

export const INSTALL_STORAGE_KEYS = {
  dismissedAt: 'myfinance:install-card-dismissed-at',
  never: 'myfinance:install-card-never',
  visits: 'myfinance:visit-count',
} as const;

/** Dias que o convite fica escondido depois de "Agora não". */
export const INSTALL_DISMISS_DAYS = 30;
