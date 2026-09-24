'use client';

import React, { useEffect, useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

interface InstallAppCardProps {
  /** 'banner': convite no topo da Carteira. 'row': linha fixa "Instalar app" no painel Mais. */
  variant: 'banner' | 'row';
  className?: string;
}

const ICON_SRC = '/icons/icon-192.png';
const ICON_FALLBACK = '/images/logo/logo-icon.svg';

function AppIcon({ size }: { size: 40 | 28 }) {
  const [src, setSrc] = useState(ICON_SRC);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setSrc(ICON_FALLBACK)}
      className={`shrink-0 rounded-xl bg-white object-contain ${size === 40 ? 'h-10 w-10 p-0.5' : 'h-7 w-7 p-0.5'}`}
    />
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AddSquareIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Passo a passo do Safari (iOS não tem prompt de instalação). */
function IosInstructionsSheet({
  isOpen,
  onClose,
  onNever,
}: {
  isOpen: boolean;
  onClose: () => void;
  onNever?: () => void;
}) {
  const step = 'flex items-center gap-3 text-[15px] leading-snug text-gray-700 dark:text-gray-200';
  const num =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mf-outside/10 text-[13px] font-semibold text-mf-patrimonio dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade';
  const kbd =
    'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5 font-medium dark:border-gray-700 dark:bg-white/5';
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Instale no iPhone"
      titleAdornment={<AppIcon size={28} />}
      footer={
        <div className="flex gap-2">
          {onNever ? (
            <button
              type="button"
              onClick={onNever}
              className="min-h-12 flex-1 rounded-xl text-[15px] font-medium text-gray-500 dark:text-gray-400"
            >
              Não mostrar de novo
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 flex-1 rounded-xl bg-mf-patrimonio text-[15px] font-medium text-white active:bg-mf-seguranca"
          >
            Entendi
          </button>
        </div>
      }
    >
      <p className="mx-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
        Com o app na tela inicial, o My Finance abre em tela cheia, sem a barra do navegador.
      </p>
      <ol className="flex flex-col gap-3">
        <li className={step}>
          <span className={num}>1</span>
          <span>
            Toque em{' '}
            <span className={kbd}>
              <span className="text-mf-outside dark:text-mf-tranquilidade">
                <ShareIcon />
              </span>
              Compartilhar
            </span>{' '}
            na barra do Safari
            <span
              aria-hidden="true"
              className="ml-1 inline-block text-mf-outside motion-safe:animate-bounce dark:text-mf-tranquilidade"
            >
              ↓
            </span>
          </span>
        </li>
        <li className={step}>
          <span className={num}>2</span>
          <span>
            Role e escolha{' '}
            <span className={kbd}>
              <AddSquareIcon />
              Adicionar à Tela de Início
            </span>
          </span>
        </li>
        <li className={step}>
          <span className={num}>3</span>
          <span>
            Toque em <b className="font-semibold">Adicionar</b>, no canto superior
          </span>
        </li>
      </ol>
      <p className="mx-1 mt-4 mb-2 text-[13px] text-gray-500 dark:text-gray-400">
        No app instalado você entra de novo com seu login.
      </p>
    </BottomSheet>
  );
}

/**
 * Convite para instalar o app (PWA fase 0). O banner só aparece na Carteira a partir da 2ª
 * visita, some por 30 dias com "Agora não"/X e, no iOS, para sempre com "Não mostrar de novo".
 * A linha do Mais ignora a dispensa. Nada aparece no app já instalado nem sem storage.
 */
export default function InstallAppCard({ variant, className = '' }: InstallAppCardProps) {
  const [mounted, setMounted] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const {
    platform,
    canPrompt,
    isStandalone,
    promptInstall,
    eligibleForBanner,
    dismiss,
    dismissForever,
  } = useInstallPrompt();

  useEffect(() => setMounted(true), []);

  if (!mounted || isStandalone) return null;

  const isIos = platform === 'ios';
  if (!canPrompt && !isIos) return null;

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (variant === 'banner' && outcome === 'dismissed') dismiss();
  };

  if (variant === 'row') {
    return (
      <>
        <button
          type="button"
          onClick={() => (isIos ? setIosOpen(true) : void handleInstall())}
          className={`flex min-h-12 w-full items-center gap-3 border-b border-gray-100 px-1 text-left font-medium text-gray-800 active:bg-gray-100 dark:border-gray-800 dark:text-white/90 dark:active:bg-white/5 ${className}`}
        >
          <span className="text-gray-500 dark:text-gray-400">
            <AddSquareIcon size={22} />
          </span>
          Instalar app
          <span className="ml-auto text-[13px] font-normal text-gray-500 dark:text-gray-400">
            Tela inicial
          </span>
        </button>
        {isIos ? <IosInstructionsSheet isOpen={iosOpen} onClose={() => setIosOpen(false)} /> : null}
      </>
    );
  }

  if (!eligibleForBanner) return null;

  return (
    <section
      aria-label="Instalar o aplicativo"
      className={`relative flex flex-col gap-3 rounded-2xl bg-mf-seguranca p-4 text-white ${className}`}
    >
      <button
        type="button"
        onClick={() => dismiss()}
        aria-label="Dispensar"
        className="absolute top-1.5 right-1.5 flex h-11 w-11 items-center justify-center rounded-xl text-white active:bg-white/10"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className="flex items-center gap-3 pr-10">
        <AppIcon size={40} />
        <div className="min-w-0">
          <p className="text-base font-semibold">Instale o My Finance</p>
          <p className="text-[13px] leading-snug text-white/85">Acesso rápido, em tela cheia</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => dismiss()}
          className="min-h-11 flex-1 rounded-xl px-4 text-sm font-medium text-white/85 active:bg-white/10"
        >
          Agora não
        </button>
        {isIos ? (
          <button
            type="button"
            onClick={() => setIosOpen(true)}
            className="min-h-11 flex-1 rounded-xl bg-white px-4 text-sm font-semibold text-mf-seguranca"
          >
            Como instalar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="min-h-11 flex-1 rounded-xl bg-white px-4 text-sm font-semibold text-mf-seguranca"
          >
            Instalar
          </button>
        )}
      </div>
      {isIos ? (
        <IosInstructionsSheet
          isOpen={iosOpen}
          onClose={() => setIosOpen(false)}
          onNever={() => {
            setIosOpen(false);
            dismissForever();
          }}
        />
      ) : null}
    </section>
  );
}
