'use client';

import { logger } from '@/lib/logger';
import React, { useState, useCallback } from 'react';
import { WizardFormData, WizardErrors, AutocompleteOption, Asset } from '@/types/wizard';
import AutocompleteInput from '@/components/form/AutocompleteInput';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import Select from '@/components/form/Select';
import { fundoSubtipoFromAssetType } from '@/lib/fundoTypes';

const FUNDO_SUBTIPO_OPTIONS = [
  { value: '', label: 'Todos os subtipos' },
  { value: 'fim', label: 'FIM (Multimercado)' },
  { value: 'multimercado', label: 'Multimercado (CVM)' },
  { value: 'fia', label: 'FIA (Ações)' },
  { value: 'fip', label: 'FIP (Participações)' },
  { value: 'fip-infra', label: 'FIP Infraestrutura' },
  { value: 'fidc', label: 'FIDC (Direitos Creditórios)' },
  { value: 'fiagro', label: 'Fiagro' },
  { value: 'fund-rf', label: 'Fundos Renda Fixa' },
  { value: 'fund-cambial', label: 'Fundos Cambiais' },
];

interface Step3SearchWithManualFallbackProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
  tipoAtivo: string;
  searchPlaceholder: string;
  manualTitle: string;
  manualPrefix: string;
  manualPlaceholder: string;
}

export default function Step3SearchWithManualFallback({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
  tipoAtivo,
  searchPlaceholder,
  manualTitle,
  manualPrefix,
  manualPlaceholder,
}: Step3SearchWithManualFallbackProps) {
  const [assetOptions, setAssetOptions] = useState<AutocompleteOption[]>([]);
  const [assetsById, setAssetsById] = useState<Map<string, Asset & { currentPrice?: number }>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [fundoSubtipoFiltro, setFundoSubtipoFiltro] = useState<string>('');

  const fetchAssets = useCallback(
    async (search: string) => {
      if (search.length < 2) {
        setAssetOptions([]);
        return;
      }

      setLoading(true);
      try {
        const subtipoParam =
          tipoAtivo === 'fundo' && fundoSubtipoFiltro
            ? `&subtipo=${encodeURIComponent(fundoSubtipoFiltro)}`
            : '';
        const url = `/api/assets?search=${encodeURIComponent(search)}&tipo=${tipoAtivo}&limit=20${subtipoParam}`;
        const response = await fetch(url, { credentials: 'include' });

        if (response.ok) {
          const data = await response.json();
          const assets: (Asset & { currentPrice?: number })[] = data.assets || [];
          const options: AutocompleteOption[] = assets.map((asset) => ({
            value: asset.id,
            label: `${asset.symbol} - ${asset.name}`,
            subtitle: asset.currentPrice
              ? `R$ ${Number(asset.currentPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : undefined,
          }));
          setAssetOptions(options);
          setAssetsById(new Map(assets.map((a) => [a.id, a])));
          setSearchPerformed(true);

          if (options.length === 0 && search.length >= 2) {
            onErrorsChange({ ativo: undefined });
          }
        }
      } catch (error) {
        logger.error('Erro ao buscar ativos:', error);
        onErrorsChange({ ativo: 'Não foi possível carregar os ativos. Tente novamente.' });
      } finally {
        setLoading(false);
      }
    },
    [tipoAtivo, fundoSubtipoFiltro, onErrorsChange],
  );

  const debouncedFetchAssets = useDebouncedCallback(fetchAssets, 250);

  const handleSearchChange = (value: string) => {
    onFormDataChange({
      ativo: value,
      assetId: '',
      assetType: undefined,
      assetCurrentPrice: null,
    });
    setShowManual(false);

    if (value.length >= 2) {
      debouncedFetchAssets(value);
    } else {
      setAssetOptions([]);
      setSearchPerformed(false);
    }

    if (errors.ativo) {
      onErrorsChange({ ativo: undefined });
    }
  };

  const handleSelect = (option: AutocompleteOption) => {
    const asset = assetsById.get(option.value);
    const subtipo = tipoAtivo === 'fundo' ? fundoSubtipoFromAssetType(asset?.type) : null;
    onFormDataChange({
      ativo: option.label,
      assetId: option.value,
      assetType: asset?.type,
      assetCurrentPrice: asset?.currentPrice ?? null,
      // Pra fundos classificados pela CVM, preenche destino/subtipo já no Step3
      // pra não exigir um clique manual em campo redundante no Step4.
      ...(subtipo && { fundoDestino: subtipo, tipoFundo: subtipo }),
    });
    onErrorsChange({ ativo: undefined });
  };

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const trimmed = value.trim();
    onFormDataChange({
      ativo: value,
      assetId: trimmed ? `${manualPrefix}-MANUAL` : '',
      assetType: undefined,
      assetCurrentPrice: null,
    });
    if (errors.ativo) onErrorsChange({ ativo: undefined });
  };

  const switchToManual = () => {
    setShowManual(true);
    onFormDataChange({ ativo: '', assetId: '', assetType: undefined, assetCurrentPrice: null });
    setAssetOptions([]);
    setSearchPerformed(false);
  };

  const switchToSearch = () => {
    setShowManual(false);
    onFormDataChange({ ativo: '', assetId: '', assetType: undefined, assetCurrentPrice: null });
  };

  // Manual entry mode
  if (showManual) {
    return (
      <div className="space-y-6">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
            Entrada manual
          </h4>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Digite o nome manualmente. O ativo será criado sem vínculo automático com dados de
            mercado.
          </p>
        </div>
        <div>
          <Label htmlFor={`${manualPrefix.toLowerCase()}-manual`}>Nome do ativo *</Label>
          <Input
            id={`${manualPrefix.toLowerCase()}-manual`}
            type="text"
            placeholder={manualPlaceholder}
            value={formData.ativo}
            onChange={handleManualChange}
            error={!!errors.ativo}
            hint={errors.ativo}
          />
        </div>
        {formData.ativo && formData.assetId && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
              Ativo informado
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
          </div>
        )}
        <button
          type="button"
          onClick={switchToSearch}
          className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400 underline"
        >
          Voltar para busca
        </button>
      </div>
    );
  }

  // Search mode (default)
  return (
    <div className="space-y-6">
      {tipoAtivo === 'fundo' && (
        <div>
          <Label htmlFor="fundo-subtipo-filter">Tipo de fundo</Label>
          <Select
            id="fundo-subtipo-filter"
            options={FUNDO_SUBTIPO_OPTIONS}
            placeholder="Todos os subtipos"
            value={fundoSubtipoFiltro}
            onChange={(value) => {
              setFundoSubtipoFiltro(value);
              // Re-buscar com novo filtro se já há termo de busca.
              if (formData.ativo.length >= 2) {
                debouncedFetchAssets(formData.ativo);
              }
            }}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Restringe a busca a um subtipo da CVM. Deixe em &quot;Todos&quot; pra varrer toda a
            base.
          </p>
        </div>
      )}
      <div>
        <AutocompleteInput
          id={`${tipoAtivo}-search`}
          label="Buscar ativo *"
          placeholder={searchPlaceholder}
          value={formData.ativo}
          onChange={handleSearchChange}
          onSelect={handleSelect}
          options={assetOptions}
          loading={loading}
          error={!!errors.ativo}
          hint={errors.ativo}
        />
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Como buscar</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Digite pelo menos 2 caracteres para buscar na base de dados. Selecione o ativo desejado na
          lista de resultados.
        </p>
      </div>

      {/* Selected asset */}
      {formData.assetId && !formData.assetId.endsWith('-MANUAL') && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
            Ativo Selecionado
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
        </div>
      )}

      {/* Manual fallback link — shown after a search with few results */}
      {searchPerformed && (
        <button
          type="button"
          onClick={switchToManual}
          className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400 underline"
        >
          {manualTitle} Adicionar manualmente
        </button>
      )}
    </div>
  );
}
