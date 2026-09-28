'use client';

import React, { useEffect, useId, useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { MobileNumberField } from '@/components/ui/sheet/MobileNumberField';

export type AlocacaoMetaField = 'minimo' | 'maximo' | 'target';

export type AlocacaoMetaValues = Record<AlocacaoMetaField, number>;

export interface AlocacaoMetaSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Nome da classe (título do painel). */
  classe: string;
  /**
   * Reserva de Emergência: os três campos são em R$ (o valor guardado continua sendo % da
   * carteira; `toDisplay`/`parse` fazem a conversão, como o `parseValorReserva` do desktop).
   */
  emReais: boolean;
  /** Valores guardados hoje (em % da carteira). */
  values: AlocacaoMetaValues;
  /** % guardado → texto do campo. */
  toDisplay: (percent: number) => string;
  /** Texto digitado → % a guardar (`null` = inválido). */
  parse: (raw: string) => number | null;
  /** Limite máximo (em %) → texto da mensagem de erro. */
  describeLimit: (percent: number) => string;
  /** Dica sob o % Target (ex.: 'Hoje: 12,4% da carteira'). */
  hint?: string;
  /**
   * Aplica SÓ os campos alterados — é o `handleConfigChange` da tabela (estado local); quem grava
   * é o "Salvar configurações", como no desktop. Nada aqui mostra "salvo".
   */
  onApply: (changes: Partial<AlocacaoMetaValues>) => void;
}

/** Mesmos limites das células do desktop (EditableCell: mínimo/máximo até 100, target até 999999). */
const MAX_BY_FIELD: Record<AlocacaoMetaField, number> = {
  minimo: 100,
  maximo: 100,
  target: 999999,
};

const FIELDS: AlocacaoMetaField[] = ['minimo', 'maximo', 'target'];

/**
 * Meta de alocação de UMA classe no celular (PWA fase 1): mínimo, máximo e alvo num painel com
 * "Aplicar". Aplicar só muda a tela (updateConfiguracao); a barra "alterações não salvas" da
 * AlocacaoAtivosTable grava com o MESMO saveChanges do botão "Salvar Configurações".
 */
export default function AlocacaoMetaSheet({
  isOpen,
  onClose,
  classe,
  emReais,
  values,
  toDisplay,
  parse,
  describeLimit,
  hint,
  onApply,
}: AlocacaoMetaSheetProps) {
  const baseId = useId();
  const formId = `${baseId}-form`;
  const [texts, setTexts] = useState<Record<AlocacaoMetaField, string>>({
    minimo: '',
    maximo: '',
    target: '',
  });
  const [errors, setErrors] = useState<Partial<Record<AlocacaoMetaField, string>>>({});
  const [initialTexts, setInitialTexts] = useState(texts);

  // Reabre sempre com os valores atuais.
  useEffect(() => {
    if (!isOpen) return;
    const next = {
      minimo: toDisplay(values.minimo),
      maximo: toDisplay(values.maximo),
      target: toDisplay(values.target),
    };
    setTexts(next);
    setInitialTexts(next);
    setErrors({});
    // Só na abertura: não sobrescrever o que o usuário está digitando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const labels: Record<AlocacaoMetaField, string> = emReais
    ? { minimo: 'Mínimo', maximo: 'Máximo', target: 'Alvo' }
    : {
        minimo: 'Mínimo (% da carteira)',
        maximo: 'Máximo (% da carteira)',
        target: '% Target',
      };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Partial<Record<AlocacaoMetaField, string>> = {};
    const changes: Partial<AlocacaoMetaValues> = {};
    for (const field of FIELDS) {
      const raw = texts[field];
      if (raw === initialTexts[field]) continue; // campo intocado: não reaplica
      if (raw.trim() === '') {
        nextErrors[field] = 'Preencha este campo.';
        continue;
      }
      const parsed = parse(raw);
      if (parsed === null || !Number.isFinite(parsed)) {
        nextErrors[field] = 'Digite um número válido.';
        continue;
      }
      if (parsed < 0) {
        nextErrors[field] = 'O valor não pode ser negativo.';
        continue;
      }
      if (parsed > MAX_BY_FIELD[field]) {
        nextErrors[field] = `O valor máximo é ${describeLimit(MAX_BY_FIELD[field])}.`;
        continue;
      }
      changes[field] = parsed;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (Object.keys(changes).length > 0) onApply(changes);
    onClose();
  };

  const footer = (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onClose}
        className="h-12 flex-1 rounded-xl border border-gray-300 text-base font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form={formId}
        className="h-12 flex-1 rounded-xl bg-mf-patrimonio text-base font-semibold text-white"
      >
        Aplicar
      </button>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={classe} footer={footer}>
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-3 pb-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Meta de alocação. {emReais ? 'Valores em reais.' : 'Percentuais da carteira total.'}{' '}
          Aplicar muda só a tela; grave em &ldquo;Salvar configurações&rdquo;.
        </p>
        {FIELDS.map((field, i) => (
          <MobileNumberField
            key={field}
            id={`${baseId}-${field}`}
            label={labels[field]}
            kind={emReais ? 'currency' : 'percent'}
            value={texts[field]}
            onChange={(v) => {
              setTexts((t) => ({ ...t, [field]: v }));
              if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
            }}
            prefix={emReais ? 'R$' : undefined}
            suffix={emReais ? undefined : '%'}
            error={errors[field]}
            hint={field === 'target' ? hint : undefined}
            enterKeyHint={i === FIELDS.length - 1 ? 'done' : 'next'}
            autoFocus={i === 0}
          />
        ))}
      </form>
    </BottomSheet>
  );
}
