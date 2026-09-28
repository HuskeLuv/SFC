'use client';

import React, { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { useCsrf } from '@/hooks/useCsrf';
import { MobileStatusPill } from '@/components/ui/mobile/MobileStatusPill';

interface SetupResponse {
  secret: string;
  qrCodeDataUrl: string;
  otpauthUrl: string;
}

/**
 * Card de 2FA TOTP (LGPD #12) — entra abaixo de PrivacyControls no
 * /profile. Fluxo:
 *   1. Status "inativo" mostra botão "Configurar".
 *   2. Clicar configura → backend gera secret + QR, exibe na tela.
 *   3. User escaneia, digita código, confirma → backend ativa.
 *   4. Status "ativo" mostra botão "Desativar" (exige senha atual).
 */
export default function TwoFactorAuth({ initialEnabled }: { initialEnabled: boolean }) {
  const { csrfFetch } = useCsrf();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [disablePwd, setDisablePwd] = useState('');
  const [chaveCopiada, setChaveCopiada] = useState(false);

  // PWA fase 3: no celular o app autenticador está no MESMO aparelho — copiar a chave em vez de
  // escanear o QR. Só existe abaixo de lg.
  const copiarChave = async () => {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setChaveCopiada(true);
      window.setTimeout(() => setChaveCopiada(false), 2000);
    } catch {
      setMsg({ type: 'err', text: 'Não consegui copiar. Selecione a chave e copie à mão.' });
    }
  };

  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  const startSetup = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await csrfFetch('/api/auth/totp/setup', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao iniciar 2FA');
      setSetup(await res.json());
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erro' });
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await csrfFetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao confirmar');
      setEnabled(true);
      setSetup(null);
      setCode('');
      setMsg({ type: 'ok', text: '2FA ativado com sucesso.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erro' });
    } finally {
      setBusy(false);
    }
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await csrfFetch('/api/auth/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: disablePwd }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao desativar');
      setEnabled(false);
      setDisablePwd('');
      setMsg({ type: 'ok', text: '2FA desativado.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erro' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-0 dark:max-lg:bg-transparent">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 max-lg:hidden">
            Autenticação em duas etapas (2FA)
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Use um aplicativo autenticador (Google Authenticator, Authy, 1Password, etc.) pra gerar
            códigos de 6 dígitos a cada login.
          </p>
        </div>
        {/* Celular: ponto + palavra, sem verde (decisão 4). */}
        <span className="shrink-0 pt-0.5 lg:hidden" data-mf-mobile="">
          <MobileStatusPill tone={enabled ? 'ok' : 'neutro'}>
            {enabled ? 'Ativo' : 'Inativo'}
          </MobileStatusPill>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold max-lg:hidden ${
            enabled
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          {enabled ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      {!enabled && !setup && (
        <div className="mt-4">
          <button
            type="button"
            onClick={startSetup}
            disabled={busy}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60 max-lg:min-h-11 max-lg:w-full"
          >
            {busy ? 'Gerando…' : 'Configurar 2FA'}
          </button>
        </div>
      )}

      {!enabled && setup && (
        <form onSubmit={confirmSetup} className="mt-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Escaneie o QR Code abaixo no seu aplicativo autenticador:
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qrCodeDataUrl}
            alt="QR Code 2FA"
            width={200}
            height={200}
            className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 max-lg:mx-auto max-lg:block"
          />
          <div className="space-y-2 lg:hidden" data-mf-mobile="" data-mf-2fa-mesmo-aparelho="">
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              O app autenticador está neste celular? Abra direto nele ou copie a chave.
            </p>
            <a
              href={setup.otpauthUrl}
              className="flex min-h-11 w-full items-center justify-center rounded-lg bg-mf-seguranca px-4 text-sm font-semibold text-white dark:bg-mf-patrimonio"
            >
              Abrir no app autenticador
            </a>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-gray-100 px-3 py-2.5 font-mono text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                {setup.secret}
              </code>
              <button
                type="button"
                onClick={copiarChave}
                className="min-h-11 shrink-0 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
              >
                {chaveCopiada ? 'Copiada!' : 'Copiar chave'}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-lg:hidden">
            Ou digite o segredo manualmente:{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">
              {setup.secret}
            </code>
          </p>
          <label className="block text-sm">
            <span className="text-gray-600 dark:text-gray-400">Digite o código de 6 dígitos</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm tracking-widest max-lg:min-h-11 max-lg:text-center max-lg:text-lg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60 max-lg:min-h-11 max-lg:flex-1"
            >
              {busy ? 'Confirmando…' : 'Ativar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSetup(null);
                setCode('');
              }}
              className="text-sm text-gray-600 underline-offset-2 hover:underline dark:text-gray-400 max-lg:min-h-11 max-lg:px-3"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {enabled && (
        <form onSubmit={disable} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              Pra desativar, informe sua senha atual:
            </span>
            <input
              type="password"
              value={disablePwd}
              onChange={(e) => setDisablePwd(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm max-lg:min-h-11 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !disablePwd}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 max-lg:min-h-11 max-lg:w-full hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-900/20"
          >
            {busy ? 'Desativando…' : 'Desativar 2FA'}
          </button>
        </form>
      )}

      {msg && (
        <p
          className={`mt-3 text-sm ${
            msg.type === 'ok'
              ? 'text-emerald-600 dark:text-emerald-400 max-lg:text-mf-patrimonio dark:max-lg:text-mf-tranquilidade'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}

// Wrapper que descobre o estado inicial. Mantém o card autossuficiente sem
// obrigar a página /profile a buscar essa info — tradeoff: faz request extra.
export function TwoFactorAuthAutoLoad() {
  const [initial, setInitial] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/totp/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setInitial(Boolean(d.enabled)))
      .catch((err) => {
        logger.warn('Falha ao carregar status 2FA:', err);
        setInitial(false);
      });
  }, []);

  if (initial === null) return null;
  return <TwoFactorAuth initialEnabled={initial} />;
}
