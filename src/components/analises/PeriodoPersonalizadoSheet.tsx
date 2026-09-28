'use client';

import React, { useEffect, useId, useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import {
  MOBILE_FIELD_CLASS,
  MOBILE_FIELD_ERROR_TEXT_CLASS,
  MOBILE_FIELD_HINT_CLASS,
  MOBILE_FIELD_LABEL_CLASS,
} from '@/components/ui/sheet/MobileNumberField';

export interface PeriodoPersonalizadoSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Datas iniciais (ISO 'yyyy-mm-dd'; '' = vazio). */
  inicio: string;
  fim: string;
  /** Hoje (ISO) — teto dos dois campos. */
  maxIso?: string;
  /**
   * Aplica o intervalo (a MESMA regra do desktop: `resolverPeriodoPersonalizado`). Devolve a
   * mensagem de erro, ou `null` quando aplicou — aí o sheet fecha.
   */
  onApply: (inicio: string, fim: string) => string | null;
  /** Aviso do último intervalo aplicado (ex.: início ajustado para o 1º investimento). */
  aviso?: string | null;
}

/**
 * Período personalizado da Rentabilidade no celular (PWA fase 1): BottomSheet com dois
 * `<input type=date>` nativos. No desktop continua o par de DatePicker da RentabilidadeGeral.
 */
export default function PeriodoPersonalizadoSheet({
  isOpen,
  onClose,
  inicio,
  fim,
  maxIso,
  onApply,
  aviso,
}: PeriodoPersonalizadoSheetProps) {
  const baseId = useId();
  const inicioId = `${baseId}-inicio`;
  const fimId = `${baseId}-fim`;
  const erroId = `${baseId}-erro`;
  const [draftInicio, setDraftInicio] = useState(inicio);
  const [draftFim, setDraftFim] = useState(fim);
  const [erro, setErro] = useState<string | null>(null);

  // Reabre sempre com o intervalo atual.
  useEffect(() => {
    if (!isOpen) return;
    setDraftInicio(inicio);
    setDraftFim(fim);
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const aplicar = (e?: React.FormEvent) => {
    e?.preventDefault();
    const msg = onApply(draftInicio, draftFim);
    if (msg) {
      setErro(msg);
      return;
    }
    onClose();
  };

  const formId = `${baseId}-form`;
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Período personalizado"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-mf-patrimonio text-sm font-semibold text-white"
          >
            Aplicar
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={aplicar} className="space-y-4" noValidate>
        <div>
          <label htmlFor={inicioId} className={MOBILE_FIELD_LABEL_CLASS}>
            Data inicial
          </label>
          <input
            id={inicioId}
            type="date"
            value={draftInicio}
            max={maxIso}
            onChange={(e) => setDraftInicio(e.target.value)}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? erroId : undefined}
            className={MOBILE_FIELD_CLASS}
          />
        </div>
        <div>
          <label htmlFor={fimId} className={MOBILE_FIELD_LABEL_CLASS}>
            Data final
          </label>
          <input
            id={fimId}
            type="date"
            value={draftFim}
            max={maxIso}
            onChange={(e) => setDraftFim(e.target.value)}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? erroId : undefined}
            className={MOBILE_FIELD_CLASS}
          />
        </div>
        {erro ? (
          <p id={erroId} role="alert" className={MOBILE_FIELD_ERROR_TEXT_CLASS}>
            {erro}
          </p>
        ) : aviso ? (
          <p className={MOBILE_FIELD_HINT_CLASS}>{aviso}</p>
        ) : (
          <p className={MOBILE_FIELD_HINT_CLASS}>
            O retorno é calculado entre as duas datas, como no computador.
          </p>
        )}
      </form>
    </BottomSheet>
  );
}
