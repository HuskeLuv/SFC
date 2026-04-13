'use client';
import React, { useEffect, useState } from 'react';
import { WizardFormData, WizardErrors, AutocompleteOption, Asset } from '@/types/wizard';
import AutocompleteInput from '@/components/form/AutocompleteInput';
import {
  Step3ReservaEmergencia,
  Step3ReservaOportunidade,
  Step3Personalizado,
  Step3SimpleManual,
} from './Step3ManualEntry';
import Step3RendaFixaSelect from './Step3RendaFixaSelect';
import Step3MoedaSelect from './Step3MoedaSelect';
import Step3SearchWithManualFallback from './Step3SearchWithManualFallback';

interface Step3AssetProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export default function Step3Asset({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step3AssetProps) {
  const [assetOptions, setAssetOptions] = useState<AutocompleteOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Buscar ativos
  const fetchAssets = async (search: string) => {
    if (!formData.tipoAtivo) {
      setAssetOptions([]);
      onErrorsChange({ ativo: 'Selecione o tipo de ativo antes de buscar.' });
      return;
    }

    // Stocks, previdência e opções são adicionados manualmente - não buscar na API
    if (
      formData.tipoAtivo === 'stock' ||
      formData.tipoAtivo === 'previdencia' ||
      formData.tipoAtivo === 'opcoes'
    ) {
      setAssetOptions([]);
      return;
    }

    // Para personalizado, criar automaticamente sem busca
    if (formData.tipoAtivo === 'personalizado') {
      if (formData.tipoAtivo === 'personalizado') {
        onFormDataChange({
          ativo: 'Personalizado',
          assetId: 'PERSONALIZADO',
        });
      }
      return;
    }

    if (search.length > 0 && search.length < 2) {
      return;
    }

    setLoading(true);
    try {
      const url = `/api/assets?search=${encodeURIComponent(search)}&tipo=${formData.tipoAtivo}&limit=20`;

      const response = await fetch(url, { credentials: 'include' });

      if (response.ok) {
        const data = await response.json();
        const options: AutocompleteOption[] = (data.assets || []).map(
          (asset: Asset & { type?: string }) => ({
            value: asset.id,
            label: `${asset.symbol} - ${asset.name}`,
            subtitle:
              formData.tipoAtivo === 'acoes-brasil'
                ? asset.type === 'bdr'
                  ? 'BDR'
                  : 'Ação'
                : asset.type,
          }),
        );
        setAssetOptions(options);
        if (options.length === 0 && search.length >= 2) {
          onErrorsChange({ ativo: 'Nenhum ativo encontrado para o tipo selecionado.' });
        } else if (options.length === 0) {
          onErrorsChange({ ativo: undefined });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Erro ao buscar ativos:', errorData);
        onErrorsChange({
          ativo: errorData.message || 'Não foi possível carregar os ativos. Tente novamente.',
        });
      }
    } catch (error) {
      console.error('Erro ao buscar ativos:', error);
      onErrorsChange({ ativo: 'Não foi possível carregar os ativos. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  const handleAssetChange = (value: string) => {
    onFormDataChange({
      ativo: value,
      assetId: '',
      ...(formData.tipoAtivo === 'acoes-brasil' && { acoesBrasilTipo: undefined }),
    });

    if (!formData.tipoAtivo) {
      onErrorsChange({ ativo: 'Selecione o tipo de ativo antes de buscar.' });
      setAssetOptions([]);
      return;
    }

    // Stocks, previdência e opções são adicionados manualmente - não buscar na API
    if (
      formData.tipoAtivo === 'stock' ||
      formData.tipoAtivo === 'previdencia' ||
      formData.tipoAtivo === 'opcoes'
    ) {
      setAssetOptions([]);
      return;
    }

    if (value.length >= 2) {
      fetchAssets(value);
    } else {
      setAssetOptions([]);
    }

    // Limpar erro quando usuário começar a digitar
    if (errors.ativo) {
      onErrorsChange({ ativo: undefined });
    }
  };

  const handleAssetSelect = (option: AutocompleteOption) => {
    if (
      formData.tipoAtivo === 'acoes-brasil' &&
      (option.value.startsWith('acao:') || option.value.startsWith('bdr:'))
    ) {
      const [tipo, id] = option.value.split(':');
      onFormDataChange({
        ativo: option.label,
        assetId: id,
        acoesBrasilTipo: tipo as 'acao' | 'bdr',
      });
    } else {
      onFormDataChange({
        ativo: option.label,
        assetId: option.value,
      });
    }
    onErrorsChange({ ativo: undefined });
  };

  useEffect(() => {
    setAssetOptions([]);
    if (formData.tipoAtivo) {
      onErrorsChange({ ativo: undefined });

      // Para personalizado, definir automaticamente
      if (formData.tipoAtivo === 'personalizado') {
        if (formData.tipoAtivo === 'personalizado') {
          onFormDataChange({
            ativo: 'Personalizado',
            assetId: 'PERSONALIZADO',
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.tipoAtivo]);

  const stepProps = { formData, errors, onFormDataChange, onErrorsChange };

  // Reserva de emergência
  if (formData.tipoAtivo === 'reserva-emergencia') {
    return <Step3ReservaEmergencia {...stepProps} />;
  }

  // Reserva de oportunidade
  if (formData.tipoAtivo === 'reserva-oportunidade') {
    return <Step3ReservaOportunidade {...stepProps} />;
  }

  // Personalizado
  if (formData.tipoAtivo === 'personalizado') {
    return <Step3Personalizado formData={formData} />;
  }

  // Renda fixa
  if (
    formData.tipoAtivo === 'renda-fixa' ||
    formData.tipoAtivo === 'renda-fixa-posfixada' ||
    formData.tipoAtivo === 'renda-fixa-hibrida'
  ) {
    return <Step3RendaFixaSelect {...stepProps} />;
  }

  // Fundo
  if (formData.tipoAtivo === 'fundo') {
    return (
      <Step3SearchWithManualFallback
        {...stepProps}
        tipoAtivo="fundo"
        searchPlaceholder="Ex: XP Macro FIM, BTG Pactual FIA"
        manualTitle="Não encontrou o fundo?"
        manualPrefix="FUNDO"
        manualPlaceholder="Ex: XP Macro FIM, BTG Pactual FIA"
      />
    );
  }

  // REIT
  if (formData.tipoAtivo === 'reit') {
    return (
      <Step3SimpleManual
        {...stepProps}
        title="💡 Como adicionar REIT manualmente"
        instructions={[
          'Informe o ticker ou nome do REIT (ex: O, AMT, VICI, PLD)',
          'REITs são fundos imobiliários estrangeiros negociados em dólares',
          'No próximo passo você informará quantidade de cotas, preço em USD e tipo de investimento (Growth, Value ou Risk)',
        ]}
        inputLabel="Ticker ou nome do REIT *"
        inputPlaceholder="Ex: O, AMT, VICI, PLD"
        assetIdPrefix="REIT"
        confirmLabel="REIT informado"
      />
    );
  }

  // Previdência
  if (formData.tipoAtivo === 'previdencia') {
    return (
      <Step3SimpleManual
        {...stepProps}
        title="💡 Como adicionar previdência manualmente"
        instructions={[
          'Informe o nome do plano de previdência (ex: Vida Gerador, XP Previdência)',
          'Use o nome como aparece no extrato ou aplicativo',
          'No próximo passo você escolherá o tipo de adição (valor ou cotas) e informará a data da compra',
        ]}
        inputLabel="Nome do plano de previdência *"
        inputPlaceholder="Ex: Vida Gerador, XP Previdência"
        assetIdPrefix="PREVIDENCIA"
        confirmLabel="Plano informado"
      />
    );
  }

  // Tesouro Direto
  if (formData.tipoAtivo === 'tesouro-direto') {
    return (
      <Step3SearchWithManualFallback
        {...stepProps}
        tipoAtivo="tesouro-direto"
        searchPlaceholder="Ex: Tesouro Selic 2029, Tesouro IPCA+ 2035"
        manualTitle="Não encontrou o título?"
        manualPrefix="TESOURO"
        manualPlaceholder="Ex: Tesouro Selic 2029, Tesouro IPCA+ 2035"
      />
    );
  }

  // Stock
  if (formData.tipoAtivo === 'stock') {
    return (
      <Step3SimpleManual
        {...stepProps}
        title="💡 Como adicionar Stocks manualmente"
        instructions={[
          'Stocks são ações internacionais (ex: AAPL, MSFT, GOOGL) - a Brapi só fornece dados brasileiros',
          'Informe o ticker da ação (ex: AAPL, MSFT, NVDA)',
          'No próximo passo você informará quantidade, preço em USD e a cotação do dólar no dia da compra',
        ]}
        inputLabel="Ticker do Stock *"
        inputPlaceholder="Ex: AAPL, MSFT, GOOGL, NVDA"
        assetIdPrefix="STOCK"
        confirmLabel="Stock informado"
        toUpperCase
      />
    );
  }

  // Opções
  if (formData.tipoAtivo === 'opcoes') {
    return (
      <Step3SimpleManual
        {...stepProps}
        title="💡 Como adicionar opções manualmente"
        instructions={[
          'Informe o ticker do ativo base (ex: PETR4, VALE3, ITUB4)',
          'No próximo passo você informará Put ou Call, Compra/Venda, datas, quantidade, preço e corretagem',
          'As opções aparecerão na aba Opções, na seção Put ou Call correspondente ao ativo',
        ]}
        inputLabel="Ticker do ativo base *"
        inputPlaceholder="Ex: PETR4, VALE3, ITUB4"
        assetIdPrefix="OPCAO"
        confirmLabel="Ativo base informado"
        toUpperCase
      />
    );
  }

  // Debênture
  if (formData.tipoAtivo === 'debenture') {
    return (
      <Step3SimpleManual
        {...stepProps}
        title="💡 Como adicionar debênture manualmente"
        instructions={[
          'Informe o nome completo da debênture ou o código de negociação (ex: PETR33, VALE37)',
          'Use o nome da empresa emissora + ano de vencimento quando souber (ex: Debênture Sanepar 2032)',
          'No próximo passo você poderá informar valor ou quantidade de cotas e preço unitário',
        ]}
        inputLabel="Nome ou código da debênture *"
        inputPlaceholder="Ex: Debênture Sanepar 2032, PETR33"
        assetIdPrefix="DEBENTURE"
        confirmLabel="Debênture informada"
      />
    );
  }

  // Moeda
  if (formData.tipoAtivo === 'moeda') {
    return <Step3MoedaSelect {...stepProps} />;
  }

  // Default: autocomplete search
  return (
    <div className="space-y-6">
      <div>
        <AutocompleteInput
          id="ativo"
          label="Ativo *"
          placeholder={getPlaceholderText(formData.tipoAtivo)}
          value={formData.ativo}
          onChange={handleAssetChange}
          onSelect={handleAssetSelect}
          options={assetOptions}
          loading={loading}
          error={!!errors.ativo}
          hint={errors.ativo}
        />
      </div>

      {/* Instruções baseadas no tipo de ativo */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">💡 Como buscar</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {getSearchInstructions(formData.tipoAtivo)}
        </p>
      </div>

      {/* Ativo selecionado */}
      {formData.assetId && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
            Ativo Selecionado
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
        </div>
      )}
    </div>
  );
}

function getPlaceholderText(tipoAtivo: string): string {
  const placeholders: Record<string, string> = {
    'reserva-emergencia': 'Reserva de Emergência (automático)',
    'reserva-oportunidade': 'Reserva de Oportunidade (automático)',
    'acoes-brasil': 'Digite pelo menos 2 caracteres (ex: PETR4, VALE3, AAPL34, MSFT34)',
    fii: 'Digite pelo menos 2 caracteres (ex: HGLG11, XPML11)',
    etf: 'Digite pelo menos 2 caracteres (ex: BOVA11, SMAL11)',
    reit: 'Digite pelo menos 2 caracteres (ex: VICI, AMT)',
    stock: 'Digite pelo menos 2 caracteres (ex: AAPL, MSFT)',
    debenture: 'Digite pelo menos 2 caracteres (código ou nome da empresa)',
    fundo: 'Digite pelo menos 2 caracteres (nome do fundo)',
    'tesouro-direto': 'Digite pelo menos 2 caracteres (ex: Tesouro Selic 2029)',
    'renda-fixa-prefixada': 'Digite pelo menos 2 caracteres (nome do título)',
    'renda-fixa-posfixada': 'Digite pelo menos 2 caracteres (nome do título)',
    'renda-fixa': 'Selecione o tipo de renda fixa abaixo',
    'renda-fixa-hibrida': 'Selecione o tipo de renda fixa híbrida abaixo',
    previdencia: 'Digite pelo menos 2 caracteres (nome do plano)',
    opcoes: 'Digite o ticker do ativo base (ex: PETR4, VALE3)',
    criptoativo: 'Digite pelo menos 2 caracteres (ex: Bitcoin, Ethereum)',
    moeda: 'Digite pelo menos 2 caracteres (ex: Dólar, Euro)',
    personalizado: 'Digite pelo menos 2 caracteres (nome do ativo)',
    'conta-corrente': 'Digite pelo menos 2 caracteres (nome da conta)',
    poupanca: 'Digite pelo menos 2 caracteres (nome da poupança)',
  };

  return placeholders[tipoAtivo] || 'Digite pelo menos 2 caracteres para buscar';
}

function getSearchInstructions(tipoAtivo: string): string {
  const instructions: Record<string, string> = {
    'reserva-emergencia': 'O ativo será criado automaticamente como Reserva de Emergência.',
    'reserva-oportunidade': 'O ativo será criado automaticamente como Reserva de Oportunidade.',
    'acoes-brasil':
      'Digite pelo menos 2 caracteres para buscar ações (ex: PETR4, VALE3) ou BDRs (ex: AAPL34, MSFT34) listados na B3.',
    fii: 'Digite pelo menos 2 caracteres do código do FII (ex: HGLG11, XPML11). Fundos Imobiliários investem em imóveis.',
    etf: 'Digite pelo menos 2 caracteres do código do ETF (ex: BOVA11, SMAL11). ETFs replicam índices de mercado.',
    reit: 'Digite pelo menos 2 caracteres do código do REIT (ex: VICI, AMT). REITs são fundos imobiliários estrangeiros.',
    stock: 'Digite pelo menos 2 caracteres do ticker da ação internacional (ex: AAPL, MSFT).',
    debenture: 'Digite pelo menos 2 caracteres do nome da empresa emissora ou código da debênture.',
    fundo: 'Digite pelo menos 2 caracteres do nome do fundo de investimento que você possui.',
    'tesouro-direto':
      'Digite pelo menos 2 caracteres do nome do título do Tesouro Direto (ex: Tesouro Selic 2029).',
    'renda-fixa-prefixada':
      'Digite pelo menos 2 caracteres do nome do título de renda fixa com taxa prefixada.',
    'renda-fixa': 'Selecione o tipo de renda fixa pré-fixada disponível para continuar.',
    'renda-fixa-posfixada': 'Selecione o tipo de título de renda fixa pós-fixada.',
    'renda-fixa-hibrida': 'Selecione o tipo de título de renda fixa híbrida.',
    previdencia: 'Digite pelo menos 2 caracteres do nome do plano de previdência privada.',
    criptoativo:
      'Digite pelo menos 2 caracteres do nome da criptomoeda (ex: Bitcoin, Ethereum, Cardano).',
    moeda:
      'Digite pelo menos 2 caracteres do nome da moeda estrangeira (ex: Dólar Americano, Euro).',
    personalizado: 'Digite pelo menos 2 caracteres do nome do seu ativo personalizado.',
    'conta-corrente':
      'Digite pelo menos 2 caracteres do nome da conta corrente (ex: Conta Corrente Itaú).',
    poupanca: 'Digite pelo menos 2 caracteres do nome da poupança (ex: Poupança Bradesco).',
  };

  return (
    instructions[tipoAtivo] ||
    'Digite pelo menos 2 caracteres do código ou nome do ativo que você deseja adicionar.'
  );
}
