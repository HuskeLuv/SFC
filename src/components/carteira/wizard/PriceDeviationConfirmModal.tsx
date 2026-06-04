'use client';
import React from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import { formatCurrency } from '@/utils/formatters';
import { formatDateBR } from './priceDeviationWarning';

interface PriceDeviationConfirmModalProps {
  isOpen: boolean;
  /** Preço digitado pelo usuário. */
  enteredPrice: number;
  /** Fechamento usado como referência. */
  referencePrice: number;
  /** Data efetiva do fechamento (YYYY-MM-DD). */
  effectiveDate: string;
  /** Razão da divergência (ex.: 0.9 = 90%). */
  ratio: number;
  /** Se o preço informado está acima ou abaixo do fechamento. */
  direction: 'acima' | 'abaixo';
  /** Confirma o preço informado e avança. */
  onConfirm: () => void;
  /** Fecha o popup pra o usuário corrigir o preço. */
  onCancel: () => void;
}

/**
 * Popup de confirmação exibido quando a cotação digitada diverge do
 * fechamento da data de compra. Mostra o preço de fechamento daquele dia
 * para o usuário conferir a casa decimal antes de prosseguir.
 */
export default function PriceDeviationConfirmModal({
  isOpen,
  enteredPrice,
  referencePrice,
  effectiveDate,
  ratio,
  direction,
  onConfirm,
  onCancel,
}: PriceDeviationConfirmModalProps) {
  const pct = (ratio * 100).toFixed(1).replace('.', ',');

  return (
    <Modal isOpen={isOpen} onClose={onCancel} showCloseButton={false} className="max-w-md m-4">
      <div className="p-6">
        <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
          ⚠️ Confirme o preço informado
        </h4>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          A cotação que você informou está{' '}
          <span className="font-semibold">
            {pct}% {direction}
          </span>{' '}
          do fechamento da data selecionada. Verifique se a casa decimal está correta.
        </p>

        <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Preço informado</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              R$ {formatCurrency(enteredPrice)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">
              Fechamento em {formatDateBR(effectiveDate)}
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              R$ {formatCurrency(referencePrice)}
            </span>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Voltar e corrigir
          </Button>
          <Button type="button" className="flex-1" onClick={onConfirm}>
            Confirmar mesmo assim
          </Button>
        </div>
      </div>
    </Modal>
  );
}
