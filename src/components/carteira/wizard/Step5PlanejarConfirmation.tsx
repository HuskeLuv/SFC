'use client';
import React from 'react';
import { WizardFormData, TIPOS_ATIVO } from '@/types/wizard';
import { FUNDO_SUBTIPO_LABEL } from '@/lib/fundoTypes';

interface Step5PlanejarConfirmationProps {
  formData: WizardFormData;
}

const SECAO_LABEL: Record<string, string> = {
  value: 'Value',
  growth: 'Growth',
  risk: 'Risk',
  fofi: 'FOF (Fundos de Fundos)',
  tvm: 'TVM (Títulos e Valores Mobiliários)',
  tijolo: 'Tijolo',
  infra: 'Infra (Fundos de Infraestrutura)',
  brasil: 'Brasil',
  estados_unidos: 'EUA',
  ...FUNDO_SUBTIPO_LABEL,
};

/** Confirmação do fluxo PLANEJAR (16/09/2026): resumo enxuto, sem vínculo nem valores. */
export default function Step5PlanejarConfirmation({ formData }: Step5PlanejarConfirmationProps) {
  const tipoLabel =
    TIPOS_ATIVO.find((t) => t.value === formData.tipoAtivo)?.label ?? formData.tipoAtivo;
  const secao =
    formData.tipoAtivo === 'acoes-brasil'
      ? formData.estrategia
      : formData.tipoAtivo === 'fii'
        ? formData.tipoFii
        : formData.tipoAtivo === 'etf'
          ? formData.regiaoEtf
          : formData.tipoAtivo === 'stock'
            ? formData.estrategia
            : formData.tipoAtivo === 'reit'
              ? formData.estrategiaReit
              : formData.tipoAtivo === 'fundo'
                ? formData.fundoDestino
                : undefined;

  const linha = (label: string, valor?: string | number | null) =>
    valor === undefined || valor === null || valor === '' ? null : (
      <div className="flex justify-between gap-4">
        <span className="text-sm text-gray-600 dark:text-gray-400">{label}:</span>
        <span className="text-sm font-medium text-gray-900 dark:text-white text-right">
          {valor}
        </span>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">
          ✅ Confirmação do planejamento
        </h4>
        <p className="text-sm text-green-700 dark:text-green-300">
          O ativo entra na aba como <strong>Planejado</strong>, sem posição. Quando você registrar a
          primeira compra, ele vira uma posição normal e mantém o objetivo.
        </p>
      </div>

      <div className="space-y-4">
        <h5 className="text-lg font-semibold text-gray-900 dark:text-white">Resumo</h5>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="space-y-2">
            {linha('Tipo de Ativo', tipoLabel)}
            {linha('Ativo', formData.ativo)}
            {linha('Seção', secao ? (SECAO_LABEL[secao] ?? secao) : undefined)}
            {linha('Objetivo', `${(formData.objetivo ?? 0).toLocaleString('pt-BR')}%`)}
            {linha('Observações', formData.observacoes)}
          </div>
        </div>
      </div>
    </div>
  );
}
