'use client';
import React, { useEffect, useState } from 'react';
import Label from '@/components/form/Label';
import Select from '@/components/form/Select';
import { Step4FieldsProps } from './step4Types';
import Step4TesouroReservaFields from './Step4TesouroReservaFields';
import Step4TesouroRendaFixaFields from './Step4TesouroRendaFixaFields';
import ReinvestimentoToggle from './shared/ReinvestimentoToggle';
import { useCategoriaEfetivaAtivo } from '@/hooks/useCategoriaEfetivaAtivo';
import { isCategoriaCaixaRf, rotuloCategoria, type CategoriaMovivel } from '@/lib/carteiraMover';

const TESOURO_DESTINO_OPTIONS = [
  { value: 'reserva-emergencia', label: 'Reserva de Emergência' },
  { value: 'reserva-oportunidade', label: 'Reserva de Oportunidade' },
  { value: 'renda-fixa-prefixada', label: 'Renda Fixa (Pré-fixada)' },
  { value: 'renda-fixa-posfixada', label: 'Renda Fixa (Pós-fixada)' },
  { value: 'renda-fixa-hibrida', label: 'Renda Fixa (Híbrida)' },
];

/**
 * Mover fase 2 (out/2026): título já MOVIDO pelo usuário para outra aba do trio Reservas +
 * Renda Fixa. A compra entra onde ele está (o servidor grava a aba base, que não muda), então o
 * select some e o destino do formulário segue a aba efetiva — na RF, a seção do tipo do título
 * (Selic → pós; Prefixado → pré; IPCA+/Renda+/Educa+ → híbrida, como secaoRendaFixa).
 * null = não dá para inferir (o select continua visível).
 */
export function destinoTesouroDaAba(
  categoria: CategoriaMovivel | null,
  tipoTitulo: string | null | undefined,
): string | null {
  if (categoria === 'reservaEmergencia') return 'reserva-emergencia';
  if (categoria === 'reservaOportunidade') return 'reserva-oportunidade';
  if (categoria !== 'rendaFixaFundos') return null;
  const t = (tipoTitulo ?? '').toLowerCase();
  if (/selic/.test(t)) return 'renda-fixa-posfixada';
  if (/prefixad/.test(t)) return 'renda-fixa-prefixada';
  if (/ipca|renda\+|educa\+|igp/.test(t)) return 'renda-fixa-hibrida';
  return null;
}

export const textoTesouroMovido = (categoria: CategoriaMovivel) =>
  `Este título está em ${rotuloCategoria(categoria)} (movido). A compra entra lá; para trocar, use Mover.`;

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

  // Título movido no trio Reservas + RF (só com a fase 2 ligada: senão a categoria vem null).
  const { categoria: abaEfetiva, override } = useCategoriaEfetivaAtivo(
    isDbBacked ? formData.assetId : null,
  );
  const abaMovida = override && isCategoriaCaixaRf(abaEfetiva) ? abaEfetiva : null;
  const destinoMovido = abaMovida
    ? destinoTesouroDaAba(abaMovida, tesouroDetails?.asset?.bondType ?? tesouroDetails?.asset?.name)
    : null;

  useEffect(() => {
    if (destinoMovido && destinoMovido !== formData.tesouroDestino) {
      handleInputChange('tesouroDestino', destinoMovido);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinoMovido]);

  const tesouroDestino = formData.tesouroDestino;
  const tesouroEmReserva =
    tesouroDestino === 'reserva-emergencia' || tesouroDestino === 'reserva-oportunidade';
  const tesouroEmRendaFixa =
    tesouroDestino === 'renda-fixa-prefixada' ||
    tesouroDestino === 'renda-fixa-posfixada' ||
    tesouroDestino === 'renda-fixa-hibrida';

  return (
    <>
      {abaMovida && destinoMovido ? (
        <p
          data-mf-tesouro-movido=""
          className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-700 dark:bg-white/[0.04] dark:text-gray-200"
        >
          {textoTesouroMovido(abaMovida)}
        </p>
      ) : (
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
      )}

      {isDbBacked && tesouroDetails?.price && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Dados do Tesouro Transparente
          </h4>
          <div className="grid grid-cols-1 gap-2 text-sm text-blue-700 sm:grid-cols-2 dark:text-blue-300">
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
      <ReinvestimentoToggle
        checked={!!formData.isReinvestimento}
        onChange={(value) => handleInputChange('isReinvestimento', value)}
      />
    </>
  );
}
