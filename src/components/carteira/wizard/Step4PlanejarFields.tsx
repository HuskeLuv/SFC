'use client';
import React, { useState } from 'react';
import { WizardFormData, WizardErrors } from '@/types/wizard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';

interface Step4PlanejarFieldsProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

/**
 * Passo "Informações" do fluxo PLANEJAR (16/09/2026): sem data, quantidade
 * ou preço — só a seção da aba (estratégia / tipo do FII / região do ETF) e
 * o objetivo (%). Moedas e criptos caem na seção pelo próprio ativo.
 */
export default function Step4PlanejarFields({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step4PlanejarFieldsProps) {
  const [objetivoTexto, setObjetivoTexto] = useState(
    formData.objetivo && formData.objetivo > 0 ? String(formData.objetivo).replace('.', ',') : '',
  );

  const setField = (field: keyof WizardFormData, value: string | number) => {
    onFormDataChange({ [field]: value });
    if (errors[field as keyof WizardErrors]) onErrorsChange({ [field]: undefined });
  };

  const handleObjetivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setObjetivoTexto(raw);
    const parsed = parseFloat(raw.replace(',', '.'));
    setField('objetivo', Number.isFinite(parsed) ? parsed : 0);
  };

  const renderSecao = () => {
    switch (formData.tipoAtivo) {
      case 'acoes-brasil':
        return (
          <div>
            <Label htmlFor="estrategia">Estratégia *</Label>
            <Select
              options={[
                { value: 'value', label: 'Value' },
                { value: 'growth', label: 'Growth' },
                { value: 'risk', label: 'Risk' },
              ]}
              placeholder="Selecione a estratégia"
              defaultValue={formData.estrategia}
              onChange={(value) => setField('estrategia', value)}
              className={errors.estrategia ? 'border-red-500' : ''}
            />
            {errors.estrategia && <p className="mt-1 text-sm text-red-500">{errors.estrategia}</p>}
          </div>
        );
      case 'fii':
        return (
          <div>
            <Label htmlFor="tipoFii">Tipo de FII *</Label>
            <Select
              options={[
                { value: 'fofi', label: 'FOF (Fundos de Fundos)' },
                { value: 'tvm', label: 'TVM (Títulos e Valores Mobiliários)' },
                { value: 'tijolo', label: 'Tijolo' },
                { value: 'infra', label: 'Infra (Fundos de Infraestrutura)' },
              ]}
              placeholder="Selecione o tipo"
              value={formData.tipoFii}
              onChange={(value) => setField('tipoFii', value)}
              className={errors.tipoFii ? 'border-red-500' : ''}
            />
            {errors.tipoFii && <p className="mt-1 text-sm text-red-500">{errors.tipoFii}</p>}
          </div>
        );
      case 'etf':
        return (
          <div>
            <Label htmlFor="regiaoEtf">Região *</Label>
            <Select
              id="regiaoEtf"
              options={[
                { value: 'brasil', label: 'Brasil' },
                { value: 'estados_unidos', label: 'EUA' },
              ]}
              placeholder="Selecione a região do ETF"
              value={formData.regiaoEtf ?? ''}
              onChange={(value) => setField('regiaoEtf', value)}
              className={errors.regiaoEtf ? 'border-red-500' : ''}
            />
            {errors.regiaoEtf && <p className="mt-1 text-sm text-red-500">{errors.regiaoEtf}</p>}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Planejando {formData.ativo || 'o ativo'}
        </h4>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Sem quantidade nem valor por enquanto. Informe só o objetivo (% da aba) e, se pedido, em
          qual seção ele deve aparecer. As colunas Quanto Falta e Necessidade de Aporte da aba
          passam a considerar este ativo.
        </p>
      </div>

      {renderSecao()}

      <div>
        <Label htmlFor="objetivo">Objetivo (% da aba)</Label>
        <Input
          id="objetivo"
          type="text"
          inputMode="decimal"
          placeholder="Ex: 5"
          value={objetivoTexto}
          onChange={handleObjetivoChange}
          error={!!errors.objetivo}
          hint={errors.objetivo ?? 'Entre 0 e 100. Você pode ajustar depois, direto na tabela.'}
        />
      </div>

      <div>
        <Label htmlFor="observacoes">Observações</Label>
        <Input
          id="observacoes"
          type="text"
          placeholder="Ex: comprar quando cair abaixo de R$ 30"
          value={formData.observacoes ?? ''}
          onChange={(e) => setField('observacoes', e.target.value)}
        />
      </div>
    </div>
  );
}
