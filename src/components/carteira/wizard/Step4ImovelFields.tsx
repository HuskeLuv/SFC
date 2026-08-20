'use client';
import React, { useEffect } from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import BusinessDayDatePicker from './shared/BusinessDayDatePicker';
import { Step4FieldsProps } from './step4Types';
import ReinvestimentoToggle from './shared/ReinvestimentoToggle';

/**
 * Imóveis & Bens (ticket 20/08/2026): lançamento de PATRIMÔNIO, não de
 * investimento — compõe a Carteira Consolidada e o Balanço Patrimonial e fica
 * FORA da rentabilidade (exclusão por asset.type='imovel' no builder de
 * séries). Reusa nomePersonalizado/precoUnitario do form; quantidade é sempre 1.
 */
export default function Step4ImovelFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
}: Step4FieldsProps) {
  // Unidade única: o valor do bem vai inteiro em precoUnitario.
  useEffect(() => {
    if (formData.quantidade !== 1) handleInputChange('quantidade', 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.quantidade]);

  return (
    <>
      <BusinessDayDatePicker
        id="dataInicio"
        label="Data de Aquisição *"
        placeholder="Selecione a data"
        value={formData.dataInicio}
        onChange={(iso) => handleInputChange('dataInicio', iso)}
        error={errors.dataInicio}
      />
      <div>
        <Label htmlFor="nomePersonalizado">Nome do Imóvel ou Bem *</Label>
        <Input
          id="nomePersonalizado"
          type="text"
          placeholder="Ex: Apartamento Centro, Carro"
          value={formData.nomePersonalizado}
          onChange={(e) => handleInputChange('nomePersonalizado', e.target.value)}
          error={!!errors.nomePersonalizado}
          hint={errors.nomePersonalizado}
        />
      </div>
      <div>
        <Label htmlFor="precoUnitario">Valor de Aquisição (R$) *</Label>
        <Input
          id="precoUnitario"
          {...decimalInputProps}
          placeholder="Ex: 350000.00"
          value={getDecimalInputValue('precoUnitario')}
          onChange={handleDecimalInputChange('precoUnitario')}
          error={!!errors.precoUnitario}
          hint={errors.precoUnitario}
          min="0"
          step="0.01"
        />
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        Este lançamento compõe o seu patrimônio na Carteira Consolidada e no Balanço Patrimonial,
        mas não entra no cálculo de rentabilidade da carteira. O valor atualizado pode ser editado
        depois na aba Imóveis &amp; Bens.
      </div>
      <ReinvestimentoToggle
        checked={!!formData.isReinvestimento}
        onChange={(value) => handleInputChange('isReinvestimento', value)}
      />
    </>
  );
}
