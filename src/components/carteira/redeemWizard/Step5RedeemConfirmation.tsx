import React from 'react';
import { RedeemWizardFormData } from '@/types/redeemWizard';
import { TIPO_LABELS } from '@/lib/portfolioTipoMapping';

interface Step5RedeemConfirmationProps {
  formData: RedeemWizardFormData;
}

const formatDateDisplay = (value: string) => {
  if (!value) return '-';
  const parts = value.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return value;
};

export default function Step5RedeemConfirmation({ formData }: Step5RedeemConfirmationProps) {
  const valorResgateCalculado =
    formData.metodoResgate === 'valor'
      ? formData.valorResgate
      : formData.quantidade * formData.cotacaoUnitaria;

  // Moeda do ativo (auditoria 2026-08-06, achado #13): BRL hardcoded mostrava
  // "R$" na revisão de resgates em USD (stock/REIT/BDR/cripto).
  const moeda = { style: 'currency', currency: formData.moeda || 'BRL' } as const;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
        <p>
          <span className="font-semibold">Tipo:</span>{' '}
          {TIPO_LABELS[formData.tipoAtivo] ?? (formData.tipoAtivo || '-')}
        </p>
        <p>
          <span className="font-semibold">Investimento:</span> {formData.ativo || '-'}
        </p>
        <p>
          <span className="font-semibold">Data do resgate:</span>{' '}
          {formatDateDisplay(formData.dataResgate)}
        </p>
        <p>
          <span className="font-semibold">Método:</span>{' '}
          {formData.metodoResgate === 'valor' ? 'Valor' : 'Quantidade'}
        </p>
        {formData.metodoResgate === 'quantidade' ? (
          <>
            <p>
              <span className="font-semibold">Quantidade:</span> {formData.quantidade}
            </p>
            <p>
              <span className="font-semibold">Cotação:</span>{' '}
              {formData.cotacaoUnitaria.toLocaleString('pt-BR', moeda)}
            </p>
          </>
        ) : (
          <p>
            <span className="font-semibold">Valor:</span>{' '}
            {formData.valorResgate.toLocaleString('pt-BR', moeda)}
          </p>
        )}
        <p>
          <span className="font-semibold">Total do resgate:</span>{' '}
          {valorResgateCalculado.toLocaleString('pt-BR', moeda)}
        </p>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Revise os dados antes de confirmar o resgate.
      </p>
    </div>
  );
}
