'use client';

import { getRetiroNom } from '@/services/planejamento/aposentadoria';
import type { PlanoUpsertPayload } from '@/hooks/useAposentadoria';
import { PARAM_FIELDS, type ParamFieldKey } from '../LeftPanel';
import { formatBRL, fPct } from '../utils';

/** Ordem do cartão 3×3: perfil · acumulação/renda · taxas. */
export const PREMISSAS_CARD_ORDER: ParamFieldKey[] = [
  'idade',
  'apos',
  'vida',
  'aporteM',
  'patrimonio',
  'renda',
  'rentNom',
  'inflacao',
  'rentNomRetiro',
];

/** Valor de uma premissa como aparece no cartão (mesmos formatadores do painel do desktop). */
export function formatPremissa(params: PlanoUpsertPayload, key: ParamFieldKey): string {
  const meta = PARAM_FIELDS[key];
  const value = key === 'rentNomRetiro' ? getRetiroNom(params) : params[key];
  if (meta.kind === 'currency') return formatBRL(value);
  if (meta.kind === 'percent') return fPct(value);
  return `${value} anos`;
}

interface PremissasCardProps {
  params: PlanoUpsertPayload;
  /** Abre o sheet de premissas (focado no campo tocado, quando houver). */
  onOpen: (field?: ParamFieldKey) => void;
  /** Selo de salvamento ('Salvando…' / '✔ Salvo'), o mesmo do cabeçalho. */
  savedLabel?: string;
}

/**
 * Cartão "Premissas" do simulador no celular (PWA fase 3, P1): as 9 premissas do plano em grade
 * 3×3 (2 colunas abaixo de 360px). Cada valor é um botão de 44px que abre o PremissasSheet focado
 * naquele campo. Só é montado no ramo mobile (`useIsBelowLg`).
 */
export default function PremissasCard({ params, onOpen, savedLabel }: PremissasCardProps) {
  return (
    <section
      data-mf-mobile=""
      aria-labelledby="premissas-card-titulo"
      className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3
          id="premissas-card-titulo"
          className="text-base font-semibold text-gray-900 dark:text-white/90"
        >
          Premissas
        </h3>
        {savedLabel ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">{savedLabel}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-1.5 max-[359px]:grid-cols-2">
        {PREMISSAS_CARD_ORDER.map((key) => {
          const meta = PARAM_FIELDS[key];
          const value = formatPremissa(params, key);
          return (
            <button
              key={key}
              type="button"
              data-premissa={key}
              onClick={() => onOpen(key)}
              aria-label={`${meta.cardLabel}: ${value}. Tocar para editar`}
              className="flex min-h-11 min-w-0 flex-col items-start justify-center rounded-xl bg-gray-50 px-2.5 py-2 text-left active:bg-gray-100 dark:bg-white/[0.04] dark:active:bg-white/[0.08]"
            >
              <span className="w-full truncate text-[11px] text-gray-500 dark:text-gray-400">
                {meta.cardLabel}
              </span>
              <span className="w-full truncate text-sm font-semibold tabular-nums text-gray-900 dark:text-white/90">
                {value}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onOpen()}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-mf-patrimonio dark:text-mf-tranquilidade"
      >
        Editar premissas e eventos pontuais
      </button>
    </section>
  );
}
