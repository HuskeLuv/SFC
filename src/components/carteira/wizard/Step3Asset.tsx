"use client";
import React, { useState, useEffect } from "react";
import { WizardFormData, WizardErrors, Asset, AutocompleteOption } from "@/types/wizard";
import AutocompleteInput from "@/components/form/AutocompleteInput";

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

  // Não carregar ativos iniciais - apenas quando o usuário digitar

  // Buscar ativos
  const fetchAssets = async (search: string) => {
    // Permitir busca vazia para carregar todos os ativos do tipo
    if (search.length > 0 && search.length < 2) return;
    
    setLoading(true);
    try {
      const url = `/api/assets?search=${encodeURIComponent(search)}&tipo=${formData.tipoAtivo}&limit=20`;
      
      const response = await fetch(url, { credentials: 'include' });
      
      if (response.ok) {
        const data = await response.json();
        const options: AutocompleteOption[] = data.assets.map((asset: Asset) => ({
          value: asset.id,
          label: `${asset.symbol} - ${asset.name}`,
          subtitle: asset.type,
        }));
        setAssetOptions(options);
      }
    } catch (error) {
      console.error('Erro ao buscar ativos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssetChange = (value: string) => {
    onFormDataChange({ 
      ativo: value,
      assetId: "" // Limpar assetId quando usuário digita
    });
    
    // Fazer busca na API quando o usuário digitar
    if (value.length >= 2) {
      fetchAssets(value);
    } else {
      // Limpar opções se o usuário apagar o texto
      setAssetOptions([]);
    }
    
    // Limpar erro quando usuário começar a digitar
    if (errors.ativo) {
      onErrorsChange({ ativo: undefined });
    }
  };

  const handleAssetSelect = (option: AutocompleteOption) => {
    onFormDataChange({
      ativo: option.label,
      assetId: option.value,
    });
  };

  const getPlaceholderText = () => {
    const placeholders: Record<string, string> = {
      "acao": "Digite pelo menos 2 caracteres (ex: PETR4, VALE3, ITUB4)",
      "bdr": "Digite pelo menos 2 caracteres (ex: AAPL34, MSFT34)",
      "fii": "Digite pelo menos 2 caracteres (ex: HGLG11, XPML11)",
      "etf": "Digite pelo menos 2 caracteres (ex: BOVA11, SMAL11)",
      "reit": "Digite pelo menos 2 caracteres (ex: HGRU11, XPPR11)",
      "debenture": "Digite pelo menos 2 caracteres (código ou nome da empresa)",
      "fundo": "Digite pelo menos 2 caracteres (nome do fundo)",
      "tesouro-direto": "Digite pelo menos 2 caracteres (ex: Tesouro Selic 2029)",
      "renda-fixa-prefixada": "Digite pelo menos 2 caracteres (nome do título)",
      "renda-fixa-posfixada": "Digite pelo menos 2 caracteres (nome do título)",
      "previdencia": "Digite pelo menos 2 caracteres (nome do plano)",
      "criptoativo": "Digite pelo menos 2 caracteres (ex: Bitcoin, Ethereum)",
      "moeda": "Digite pelo menos 2 caracteres (ex: Dólar, Euro)",
      "personalizado": "Digite pelo menos 2 caracteres (nome do ativo)",
      "conta-corrente": "Digite pelo menos 2 caracteres (nome da conta)",
      "poupanca": "Digite pelo menos 2 caracteres (nome da poupança)",
    };
    
    return placeholders[formData.tipoAtivo] || "Digite pelo menos 2 caracteres para buscar";
  };

  return (
    <div className="space-y-6">
      <div>
        <AutocompleteInput
          id="ativo"
          label="Ativo *"
          placeholder={getPlaceholderText()}
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
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          💡 Como buscar
        </h4>
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
          <p className="text-sm text-green-700 dark:text-green-300">
            {formData.ativo}
          </p>
        </div>
      )}
    </div>
  );
}

function getSearchInstructions(tipoAtivo: string): string {
  const instructions: Record<string, string> = {
    "acao": "Digite pelo menos 2 caracteres do código da ação (ex: PETR4, VALE3). O sistema buscará ações brasileiras listadas na B3.",
    "bdr": "Digite pelo menos 2 caracteres do código do BDR (ex: AAPL34, MSFT34). BDRs são certificados de ações estrangeiras.",
    "fii": "Digite pelo menos 2 caracteres do código do FII (ex: HGLG11, XPML11). Fundos Imobiliários investem em imóveis.",
    "etf": "Digite pelo menos 2 caracteres do código do ETF (ex: BOVA11, SMAL11). ETFs replicam índices de mercado.",
    "reit": "Digite pelo menos 2 caracteres do código do REIT (ex: HGRU11, XPPR11). REITs são fundos imobiliários estrangeiros.",
    "debenture": "Digite pelo menos 2 caracteres do nome da empresa emissora ou código da debênture.",
    "fundo": "Digite pelo menos 2 caracteres do nome do fundo de investimento que você possui.",
    "tesouro-direto": "Digite pelo menos 2 caracteres do nome do título do Tesouro Direto (ex: Tesouro Selic 2029).",
    "renda-fixa-prefixada": "Digite pelo menos 2 caracteres do nome do título de renda fixa com taxa prefixada.",
    "renda-fixa-posfixada": "Digite pelo menos 2 caracteres do nome do título de renda fixa com taxa pós-fixada.",
    "previdencia": "Digite pelo menos 2 caracteres do nome do plano de previdência privada.",
    "criptoativo": "Digite pelo menos 2 caracteres do nome da criptomoeda (ex: Bitcoin, Ethereum, Cardano).",
    "moeda": "Digite pelo menos 2 caracteres do nome da moeda estrangeira (ex: Dólar Americano, Euro).",
    "personalizado": "Digite pelo menos 2 caracteres do nome do seu ativo personalizado.",
    "conta-corrente": "Digite pelo menos 2 caracteres do nome da conta corrente (ex: Conta Corrente Itaú).",
    "poupanca": "Digite pelo menos 2 caracteres do nome da poupança (ex: Poupança Bradesco).",
  };
  
  return instructions[tipoAtivo] || "Digite pelo menos 2 caracteres do código ou nome do ativo que você deseja adicionar.";
}
