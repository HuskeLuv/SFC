'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'lgpd-cookie-consent';
const STORAGE_VERSION = '1';

/**
 * Banner de aviso de cookies (LGPD #9, Resolução CD/ANPD 2/2022).
 *
 * Hoje o sistema usa apenas cookies estritamente necessários (autenticação
 * JWT httpOnly + token CSRF double-submit), que dispensam consentimento
 * formal. Ainda assim a Resolução ANPD exige aviso informativo claro,
 * com link pra Política de Privacidade.
 *
 * Quando adicionarmos cookies analíticos/marketing no futuro, esse banner
 * vira opt-in granular por categoria — por ora é informativo + "Entendi".
 *
 * Persiste a escolha em localStorage com versão (`STORAGE_VERSION`); subir
 * a versão força re-exibição quando a política mudar.
 */
export default function CookieConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setShow(true);
        return;
      }
      const parsed = JSON.parse(stored) as { version?: string };
      if (parsed.version !== STORAGE_VERSION) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  const accept = () => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: STORAGE_VERSION, acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // localStorage indisponível (modo privado etc.) — apenas esconde o
      // banner na sessão atual; voltará a aparecer na próxima visita.
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de cookies"
      className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:left-auto sm:right-4 sm:p-5"
    >
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Usamos apenas cookies <strong>estritamente necessários</strong> ao funcionamento da
        plataforma (autenticação e segurança). Não há cookies de marketing ou rastreamento. Saiba
        mais na nossa{' '}
        <Link
          href="/politica-de-privacidade"
          className="text-brand-500 hover:underline dark:text-brand-400"
        >
          Política de Privacidade
        </Link>
        .
      </p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={accept}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
