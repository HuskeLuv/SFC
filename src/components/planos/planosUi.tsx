'use client';

import React, { useCallback, useState } from 'react';
import { useCsrf } from '@/hooks/useCsrf';
import type { UrlRedirecionamento } from '@/types/assinatura';

/**
 * Peças comuns das telas de assinatura (/planos, retorno, Minha assinatura, cadeados): ícones,
 * classes de botão e selo na paleta My Finance (src/constants/brandColors.ts via classes mf-*),
 * datas em São Paulo e a ida ao Portal do Stripe.
 */

export const BTN_PRIMARIO =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-mf-outside px-4 text-sm font-semibold text-white outline-none hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-mf-tranquilidade disabled:cursor-not-allowed disabled:opacity-50';

export const BTN_SECUNDARIO =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 outline-none hover:bg-gray-50 focus-visible:ring-[3px] focus-visible:ring-mf-outside disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 dark:hover:bg-white/[0.06] dark:focus-visible:ring-mf-tranquilidade';

/** Selo/pílula azul do "Seu plano", "Pro", "Advanced" (fundo selecionado da paleta). */
export const SELO_PLANO =
  'inline-flex items-center gap-1 rounded-full border border-[#DCE6F2] bg-[#EDF2F8] px-2 py-px text-[11px] font-semibold text-mf-patrimonio dark:border-gray-700 dark:bg-white/5 dark:text-mf-tranquilidade';

/** Faixa da Black Friday (Segurança → Patrimônio, borda Outside). */
export const FAIXA_OFERTA =
  'rounded-xl border-l-4 border-mf-outside bg-gradient-to-br from-mf-seguranca via-mf-seguranca to-mf-patrimonio text-white';

export function IconeCadeadoPlano({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconeCheck({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function IconeInfo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </svg>
  );
}

export function IconeAlerta({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.01" />
    </svg>
  );
}

const FUSO = 'America/Sao_Paulo';

/** '14/11/2026' (data em São Paulo); '' para ISO ausente ou inválido. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** '14/11' (data em São Paulo). */
export function formatarDiaMes(iso: string | null | undefined): string {
  return formatarData(iso).slice(0, 5);
}

/** A data ISO ainda não passou em `agora`? */
export function aindaVale(iso: string | null | undefined, agora: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= agora.getTime();
}

/**
 * Abre o Portal do Stripe (cartão, faturas, mudar de ciclo, cancelar): POST
 * /api/assinaturas/portal com CSRF e redirect para a URL devolvida.
 */
export function usePortalAssinatura() {
  const { csrfFetch } = useCsrf();
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const abrir = useCallback(async () => {
    setAbrindo(true);
    setErro(null);
    try {
      const res = await csrfFetch('/api/assinaturas/portal', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as Partial<UrlRedirecionamento> | null;
      if (!res.ok || !body?.url) throw new Error('portal');
      window.location.assign(body.url);
    } catch {
      setErro('Não foi possível abrir a página de pagamento agora. Tente de novo em instantes.');
      setAbrindo(false);
    }
  }, [csrfFetch]);
  return { abrir, abrindo, erro };
}
