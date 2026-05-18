'use client';
import React, { useEffect, useState } from 'react';
import Label from '@/components/form/Label';
import Select from '@/components/form/Select';
import { Step4FieldsProps } from './step4Types';
import Step4TesouroReservaFields from './Step4TesouroReservaFields';
import Step4TesouroRendaFixaFields from './Step4TesouroRendaFixaFields';

const TESOURO_DESTINO_OPTIONS = [
  { value: 'reserva-emergencia', label: 'Reserva de Emergência' },
  { value: 'reserva-oportunidade', label: 'Reserva de Oportunidade' },
  { value: 'renda-fixa-prefixada', label: 'Renda Fixa (Pré-fixada)' },
  { value: 'renda-fixa-posfixada', label: 'Renda Fixa (Pós-fixada)' },
  { value: 'renda-fixa-hibrida', label: 'Renda Fixa (Híbrida)' },
];

interface TesouroPriceData {
  baseDate: string;
  buyRate: number | null;
  sellRate: number | null;
  buyPU: number | null;
  sellPU: number | null;
}

interface TesouroAssetData {
  name: string;
  bondType?: string;
  maturityDate?: string;
}

export default function Step4TesouroDiretoFields(props: Step4FieldsProps) {
  const { formData, errors, handleInputChange, onFormDataChange } = props;
  const [tesouroDetails, setTesouroDetails] = useState<{
    asset: TesouroAssetData;
    price: TesouroPriceData | null;
  } | null>(null);

  const isDbBacked = formData.assetId && formData.assetId !== 'TESOURO-MANUAL';

  useEffect(() => {
    if (!isDbBacked) {
      setTesouroDetails(null);
      return;
    }

    const fetchDetails = async () => {
      try {
        const res = await fetch(
          `/api/tesouro-direto/details?assetId=${encodeURIComponent(formData.assetId)}`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
          setTesouroDetails(data);

          if (data.asset?.maturityDate) {
            const maturity = data.asset.maturityDate.split('T')[0];
            onFormDataChange({
              dataVencimento: maturity,
              vencimento: maturity,
              descricao: data.asset.name || formData.descricao,
            });
          }

          if (data.price?.sellPU) {
            onFormDataChange({ cotacaoUnitaria: data.price.sellPU });
          }

          if (data.price?.sellRate) {
            onFormDataChange({ taxaJurosAnual: data.price.sellRate });
          }
        }
      } catch {
        // Silently fail — fields can still be filled manually
      }
    };

    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.assetId]);

  const tesouroDestino = formData.tesouroDestino;
  const tesouroEmReserva =
    tesouroDestino === 'reserva-emergencia' || tesouroDestino === 'reserva-oportunidade';
  const tesouroEmRendaFixa =
    tesouroDestino === 'renda-fixa-prefixada' ||
    tesouroDestino === 'renda-fixa-posfixada' ||
    tesouroDestino === 'renda-fixa-hibrida';

  return (
    <>
      <div>
        <Label htmlFor="tesouroDestino">Onde este título deve aparecer *</Label>
        <Select
          id="tesouroDestino"
          options={TESOURO_DESTINO_OPTIONS}
          placeholder="Selecione onde exibir"
          value={formData.tesouroDestino ?? ''}
          onChange={(value) => handleInputChange('tesouroDestino', value)}
          className={errors.tesouroDestino ? 'border-red-500' : ''}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          O título será exibido na aba correspondente: Reserva de Emergência, Reserva de
          Oportunidade ou Renda Fixa.
        </p>
        {errors.tesouroDestino && (
          <p className="mt-1 text-sm text-red-500">{errors.tesouroDestino}</p>
        )}
      </div>

      {isDbBacked && tesouroDetails?.price && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Dados do Tesouro Transparente
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm text-blue-700 dark:text-blue-300">
            {tesouroDetails.price.sellPU && (
              <div>
                <span className="font-medium">PU Venda:</span>{' '}
                {`R$ ${tesouroDetails.price.sellPU.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`}
              </div>
            )}
            {tesouroDetails.price.sellRate !== null && (
              <div>
                <span className="font-medium">Taxa Venda:</span>{' '}
                {`${tesouroDetails.price.sellRate.toFixed(4)}% a.a.`}
              </div>
            )}
            {tesouroDetails.asset?.maturityDate && (
              <div>
                <span className="font-medium">Vencimento:</span>{' '}
                {new Date(tesouroDetails.asset.maturityDate).toLocaleDateString('pt-BR', {
                  timeZone: 'UTC',
                })}
              </div>
            )}
            <div>
              <span className="font-medium">Data base:</span>{' '}
              {new Date(tesouroDetails.price.baseDate).toLocaleDateString('pt-BR', {
                timeZone: 'UTC',
              })}
            </div>
          </div>
        </div>
      )}

      {tesouroEmReserva && <Step4TesouroReservaFields {...props} />}
      {tesouroEmRendaFixa && <Step4TesouroRendaFixaFields {...props} />}
    </>
  );
}
