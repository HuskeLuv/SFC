'use client';

import { useEffect, useRef, useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import MobileNumberField, {
  MOBILE_FIELD_CLASS,
  MOBILE_FIELD_HINT_CLASS,
  MOBILE_FIELD_LABEL_CLASS,
} from '@/components/ui/sheet/MobileNumberField';
import { formatDecimalInput, parseDecimalInput } from '@/lib/ui/numberInput';
import { off2date } from '@/services/planejamento/aposentadoria';
import type { PlanoUpsertPayload } from '@/hooks/useAposentadoria';
import { formatBRL, formatBRLCompact, fMonth, fPct } from '../utils';

/** (ano, mês 1-12) → 'AAAA-MM' do input type=month. */
export function toMonthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * 'AAAA-MM' → offset do plano (inverso de off2date: meses desde o início do acompanhamento).
 * null para texto inválido.
 */
export function monthValueToOff(
  params: Pick<PlanoUpsertPayload, 'trackStartMonth' | 'trackStartYear'>,
  value: string,
): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return (year - params.trackStartYear) * 12 + (month - params.trackStartMonth);
}

/** Texto do campo a partir da string numérica do formulário ('1500.5' → '1.500,50'). */
function toFieldText(raw: string): string {
  if (raw === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? formatDecimalInput(n) : raw;
}

interface MoneyTextFieldProps {
  id: string;
  label: string;
  /** String numérica do formulário do desktop (aporteStr/patStr: '1500.5'). */
  raw: string;
  setRaw: (value: string) => void;
  hint?: string;
}

/**
 * Campo em R$ com vírgula: mostra '1.500,50', grava no estado do formulário `String(n)` — o mesmo
 * formato que o input type=number do desktop produz — ou '' quando vazio.
 */
function MoneyTextField({ id, label, raw, setRaw, hint }: MoneyTextFieldProps) {
  const [text, setText] = useState(() => toFieldText(raw));
  const sentRef = useRef(raw);

  useEffect(() => {
    if (raw === sentRef.current) return;
    sentRef.current = raw;
    setText(toFieldText(raw));
  }, [raw]);

  const handleChange = (next: string) => {
    setText(next);
    const n = parseDecimalInput(next);
    const value = n == null ? '' : String(n);
    sentRef.current = value;
    setRaw(value);
  };

  return (
    <MobileNumberField
      id={id}
      label={label}
      kind="currency"
      prefix="R$"
      value={text}
      onChange={handleChange}
      hint={hint}
    />
  );
}

export interface RegistrarMesPreview {
  /** Rentabilidade do mês (formRent). */
  rent: number | null;
  /** Meta mensal (reqRentM). */
  metaMensal: number;
  /** Δ patrimônio vs plano (formDPat) e em % (formDPatPct). */
  dPat: number | null;
  dPatPct: number;
  /** Aporte e patrimônio necessários no mês (C[off], T[off]). */
  aporteNecessario: number;
  patrimonioNecessario: number;
}

export interface RegistrarMesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  params: PlanoUpsertPayload;
  /** Meses do plano até a aposentadoria (o mês vai de 1 a retM). */
  retM: number;
  curOffset: number;
  setCurOffset: (off: number) => void;
  aporteStr: string;
  setAporteStr: (value: string) => void;
  patStr: string;
  setPatStr: (value: string) => void;
  preview: RegistrarMesPreview;
  /** Sugestão da carteira para o mês (só quando não há registro). */
  sugestao: { aporteReal: number; patFinal: number | null } | null;
  editingExists: boolean;
  saving: boolean;
  /** O MESMO handleSave do formulário do desktop. */
  onSave: () => void;
  /** Remover o registro do mês (o simulador confirma antes). */
  onDelete: () => void;
}

/**
 * Registrar mês do acompanhamento no celular (PWA fase 3, P3). O estado (mês, aporte, patrimônio)
 * continua no AcompanhamentoTab; aqui só a apresentação: mês nativo limitado ao plano, valores
 * com vírgula, a mesma prévia e o Salvar travado sem patrimônio, como no desktop.
 */
export default function RegistrarMesSheet({
  isOpen,
  onClose,
  params,
  retM,
  curOffset,
  setCurOffset,
  aporteStr,
  setAporteStr,
  patStr,
  setPatStr,
  preview,
  sugestao,
  editingExists,
  saving,
  onSave,
  onDelete,
}: RegistrarMesSheetProps) {
  const first = off2date(params, 1);
  const last = off2date(params, Math.max(retM, 1));
  const cur = off2date(params, curOffset);
  const pat = Number(patStr) || 0;

  const handleMonth = (value: string) => {
    const off = monthValueToOff(params, value);
    if (off == null) return;
    setCurOffset(Math.min(Math.max(off, 1), Math.max(retM, 1)));
  };

  const handleSave = () => {
    if (!pat) return;
    onSave();
    onClose();
  };

  const { rent, metaMensal, dPat, dPatPct } = preview;
  const negClass = 'text-[#D92D20] dark:text-[#F97066]';

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar mês"
      footer={
        <div className="flex gap-2">
          {editingExists ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              aria-label="Remover registro"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-300 text-[#D92D20] disabled:opacity-50 dark:border-gray-700 dark:text-[#F97066]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={!pat || saving}
            className="h-12 flex-1 rounded-xl bg-mf-patrimonio text-base font-semibold text-white disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pb-3">
        <div>
          <label htmlFor="registrar-mes-mes" className={MOBILE_FIELD_LABEL_CLASS}>
            Mês de referência
          </label>
          <input
            id="registrar-mes-mes"
            type="month"
            value={toMonthValue(cur.year, cur.month)}
            min={toMonthValue(first.year, first.month)}
            max={toMonthValue(last.year, last.month)}
            onChange={(e) => handleMonth(e.target.value)}
            className={MOBILE_FIELD_CLASS}
          />
          <p className={MOBILE_FIELD_HINT_CLASS}>
            {fMonth(cur.month, cur.year)} · mês {curOffset} de {retM} do plano
          </p>
        </div>

        <MoneyTextField
          id="registrar-mes-aporte"
          label="Aporte do mês"
          raw={aporteStr}
          setRaw={setAporteStr}
          hint={`Necessário: ${formatBRL(preview.aporteNecessario)}`}
        />
        <MoneyTextField
          id="registrar-mes-patrimonio"
          label="Patrimônio final do mês"
          raw={patStr}
          setRaw={setPatStr}
          hint={`Necessário: ${formatBRL(preview.patrimonioNecessario)}`}
        />

        {sugestao && !editingExists ? (
          <div className="rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-800">
            <p className="text-gray-600 dark:text-gray-300">
              <span className="font-semibold text-gray-900 dark:text-white/90">
                Da sua carteira:
              </span>{' '}
              aporte {formatBRL(sugestao.aporteReal)} · patrimônio{' '}
              {sugestao.patFinal != null ? formatBRL(sugestao.patFinal) : '—'}
            </p>
            <button
              type="button"
              onClick={() => {
                setAporteStr(String(sugestao.aporteReal));
                if (sugestao.patFinal != null) setPatStr(String(sugestao.patFinal));
              }}
              className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-mf-patrimonio dark:text-mf-tranquilidade"
            >
              Usar estes valores
            </button>
          </div>
        ) : null}

        <dl
          data-registrar-mes-previa=""
          className="rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-white/[0.04]"
        >
          <div className="flex justify-between py-1">
            <dt className="text-gray-500 dark:text-gray-400">Rentabilidade do mês</dt>
            <dd
              className={`font-semibold tabular-nums ${
                rent != null && rent < metaMensal ? negClass : 'text-gray-900 dark:text-white/90'
              }`}
            >
              {rent != null ? fPct(rent, 2) : '—'}
            </dd>
          </div>
          <div className="flex justify-between border-t border-gray-200 py-1 dark:border-gray-800">
            <dt className="text-gray-500 dark:text-gray-400">Meta mensal</dt>
            <dd className="font-semibold tabular-nums text-gray-900 dark:text-white/90">
              {fPct(metaMensal, 2)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-gray-200 py-1 dark:border-gray-800">
            <dt className="text-gray-500 dark:text-gray-400">Δ Patrimônio vs plano</dt>
            <dd
              className={`font-semibold tabular-nums ${
                dPat != null && dPat < 0 ? negClass : 'text-gray-900 dark:text-white/90'
              }`}
            >
              {dPat != null
                ? `${dPat >= 0 ? '+' : ''}${formatBRLCompact(dPat)} (${dPatPct.toFixed(1).replace('.', ',')}%)`
                : '—'}
            </dd>
          </div>
        </dl>
      </div>
    </BottomSheet>
  );
}
