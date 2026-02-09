"use client";
import React, { useEffect, useState } from "react";
import { WizardFormData, WizardErrors, Asset, AutocompleteOption, RENDA_FIXA_TIPOS } from "@/types/wizard";
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
  const selectedRendaFixaType = RENDA_FIXA_TIPOS.find((tipo) => tipo.value === formData.rendaFixaTipo);

  // Não carregar ativos iniciais - apenas quando o usuário digitar

  // Buscar ativos
  const fetchAssets = async (search: string) => {
    if (!formData.tipoAtivo) {
      setAssetOptions([]);
      onErrorsChange({ ativo: "Selecione o tipo de ativo antes de buscar." });
      return;
    }

    // Para reserva de emergência, oportunidade e personalizado, criar automaticamente sem busca
    if (formData.tipoAtivo === "reserva-emergencia" || formData.tipoAtivo === "reserva-oportunidade" || formData.tipoAtivo === "personalizado") {
      if (formData.tipoAtivo === "reserva-emergencia") {
        onFormDataChange({
          ativo: "Reserva de Emergência",
          assetId: "RESERVA-EMERG", // Será processado pela API
        });
      } else if (formData.tipoAtivo === "reserva-oportunidade") {
        onFormDataChange({
          ativo: "Reserva de Oportunidade",
          assetId: "RESERVA-OPORT", // Será processado pela API
        });
      } else if (formData.tipoAtivo === "personalizado") {
        // Para personalizado, o nome será definido no Step4
        onFormDataChange({
          ativo: "Personalizado",
          assetId: "PERSONALIZADO", // Será processado pela API
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
        const options: AutocompleteOption[] = (data.assets || []).map((asset: Asset) => ({
          value: asset.id,
          label: `${asset.symbol} - ${asset.name}`,
          subtitle: asset.type,
        }));
        setAssetOptions(options);
        if (options.length === 0 && search.length >= 2) {
          onErrorsChange({ ativo: "Nenhum ativo encontrado para o tipo selecionado." });
        } else if (options.length === 0) {
          onErrorsChange({ ativo: undefined });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Erro ao buscar ativos:', errorData);
        onErrorsChange({ ativo: errorData.message || "Não foi possível carregar os ativos. Tente novamente." });
      }
    } catch (error) {
      console.error('Erro ao buscar ativos:', error);
      onErrorsChange({ ativo: "Não foi possível carregar os ativos. Tente novamente." });
    } finally {
      setLoading(false);
    }
  };

  const handleAssetChange = (value: string) => {
    onFormDataChange({ 
      ativo: value,
      assetId: "" // Limpar assetId quando usuário digita
    });
    
    if (!formData.tipoAtivo) {
      onErrorsChange({ ativo: "Selecione o tipo de ativo antes de buscar." });
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
    onFormDataChange({
      ativo: option.label,
      assetId: option.value,
    });
    onErrorsChange({ ativo: undefined });
  };

  useEffect(() => {
    setAssetOptions([]);
    if (formData.tipoAtivo) {
      onErrorsChange({ ativo: undefined });
      
      // Para reserva de emergência, oportunidade e personalizado, definir automaticamente
      if (formData.tipoAtivo === "reserva-emergencia" || formData.tipoAtivo === "reserva-oportunidade" || formData.tipoAtivo === "personalizado") {
        if (formData.tipoAtivo === "reserva-emergencia") {
          onFormDataChange({
            ativo: "Reserva de Emergência",
            assetId: "RESERVA-EMERG", // Será processado pela API
          });
        } else if (formData.tipoAtivo === "reserva-oportunidade") {
          onFormDataChange({
            ativo: "Reserva de Oportunidade",
            assetId: "RESERVA-OPORT", // Será processado pela API
          });
        } else if (formData.tipoAtivo === "personalizado") {
          onFormDataChange({
            ativo: "Personalizado",
            assetId: "PERSONALIZADO", // Será processado pela API
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.tipoAtivo]);

  const handleRendaFixaSelect = (tipoValue: string) => {
    const tipoSelecionado = RENDA_FIXA_TIPOS.find((tipo) => tipo.value === tipoValue);
    onFormDataChange({
      rendaFixaTipo: tipoValue,
      ativo: tipoSelecionado?.label || "Renda Fixa",
      assetId: "",
    });
    if (errors.rendaFixaTipo) {
      onErrorsChange({ rendaFixaTipo: undefined });
    }
  };

  const getPlaceholderText = () => {
    const placeholders: Record<string, string> = {
      "reserva-emergencia": "Reserva de Emergência (automático)",
      "reserva-oportunidade": "Reserva de Oportunidade (automático)",
      "acao": "Digite pelo menos 2 caracteres (ex: PETR4, VALE3, ITUB4)",
      "bdr": "Digite pelo menos 2 caracteres (ex: AAPL34, MSFT34)",
      "fii": "Digite pelo menos 2 caracteres (ex: HGLG11, XPML11)",
      "etf": "Digite pelo menos 2 caracteres (ex: BOVA11, SMAL11)",
      "reit": "Digite pelo menos 2 caracteres (ex: VICI, AMT)",
      "stock": "Digite pelo menos 2 caracteres (ex: AAPL, MSFT)",
      "debenture": "Digite pelo menos 2 caracteres (código ou nome da empresa)",
      "fundo": "Digite pelo menos 2 caracteres (nome do fundo)",
      "tesouro-direto": "Digite pelo menos 2 caracteres (ex: Tesouro Selic 2029)",
      "renda-fixa-prefixada": "Digite pelo menos 2 caracteres (nome do título)",
      "renda-fixa-posfixada": "Digite pelo menos 2 caracteres (nome do título)",
      "renda-fixa": "Selecione o tipo de renda fixa abaixo",
      "previdencia": "Digite pelo menos 2 caracteres (nome do plano)",
      "criptoativo": "Digite pelo menos 2 caracteres (ex: Bitcoin, Ethereum)",
      "moeda": "Digite pelo menos 2 caracteres (ex: Dólar, Euro)",
      "personalizado": "Digite pelo menos 2 caracteres (nome do ativo)",
      "conta-corrente": "Digite pelo menos 2 caracteres (nome da conta)",
      "poupanca": "Digite pelo menos 2 caracteres (nome da poupança)",
    };
    
    return placeholders[formData.tipoAtivo] || "Digite pelo menos 2 caracteres para buscar";
  };

  // Para reserva de emergência, oportunidade e personalizado, não mostrar campo de busca
  if (formData.tipoAtivo === "reserva-emergencia" || formData.tipoAtivo === "reserva-oportunidade" || formData.tipoAtivo === "personalizado") {
    let nome = "";
    let descricao = "";
    
    if (formData.tipoAtivo === "reserva-emergencia") {
      nome = "Reserva de Emergência";
      descricao = `O ativo será criado automaticamente como "${nome}". Continue para o próximo passo para informar o valor e a data.`;
    } else if (formData.tipoAtivo === "reserva-oportunidade") {
      nome = "Reserva de Oportunidade";
      descricao = `O ativo será criado automaticamente como "${nome}". Continue para o próximo passo para informar o valor e a data.`;
    } else if (formData.tipoAtivo === "personalizado") {
      nome = "Personalizado";
      descricao = "O ativo personalizado será criado com o nome que você informar. Continue para o próximo passo para preencher os dados do investimento.";
    }
    
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            {nome}
          </h4>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {descricao}
          </p>
        </div>
        {formData.assetId && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
              Ativo Configurado
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300">
              {formData.ativo}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (formData.tipoAtivo === "renda-fixa") {
    return (
      <div className="space-y-6">
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:bg-brand-400/20 dark:text-brand-200">
              <span className="text-sm font-semibold">RF</span>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                Renda Fixa Prefixada
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Escolha o tipo de título para continuar o cadastro.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Tipos disponíveis *
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RENDA_FIXA_TIPOS.map((tipo) => {
              const isSelected = formData.rendaFixaTipo === tipo.value;
              const baseClasses = "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors";
              const selectedClasses = "border-brand-500 bg-brand-500/10 text-brand-700 dark:border-brand-400 dark:bg-brand-400/10 dark:text-brand-200";
              const defaultClasses = "border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-brand-400 dark:hover:bg-gray-800";
              const cardClasses = `${baseClasses} ${isSelected ? selectedClasses : defaultClasses}`;

              return (
                <button
                  key={tipo.value}
                  type="button"
                  className={cardClasses}
                  onClick={() => handleRendaFixaSelect(tipo.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleRendaFixaSelect(tipo.value);
                    }
                  }}
                  aria-pressed={isSelected}
                  aria-label={`Selecionar ${tipo.label}`}
                >
                  <span className="font-medium">{tipo.label}</span>
                  {isSelected && (
                    <span className="text-xs font-semibold">Selecionado</span>
                  )}
                </button>
              );
            })}
          </div>
          {errors.rendaFixaTipo && (
            <p className="mt-1 text-sm text-red-500">{errors.rendaFixaTipo}</p>
          )}
        </div>

        {selectedRendaFixaType && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
              Tipo selecionado
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300">
              {selectedRendaFixaType.label}
            </p>
          </div>
        )}
      </div>
    );
  }

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
    "reserva-emergencia": "O ativo será criado automaticamente como Reserva de Emergência.",
    "reserva-oportunidade": "O ativo será criado automaticamente como Reserva de Oportunidade.",
    "acao": "Digite pelo menos 2 caracteres do código da ação (ex: PETR4, VALE3). O sistema buscará ações brasileiras listadas na B3.",
    "bdr": "Digite pelo menos 2 caracteres do código do BDR (ex: AAPL34, MSFT34). BDRs são certificados de ações estrangeiras.",
    "fii": "Digite pelo menos 2 caracteres do código do FII (ex: HGLG11, XPML11). Fundos Imobiliários investem em imóveis.",
    "etf": "Digite pelo menos 2 caracteres do código do ETF (ex: BOVA11, SMAL11). ETFs replicam índices de mercado.",
    "reit": "Digite pelo menos 2 caracteres do código do REIT (ex: VICI, AMT). REITs são fundos imobiliários estrangeiros.",
    "stock": "Digite pelo menos 2 caracteres do ticker da ação internacional (ex: AAPL, MSFT).",
    "debenture": "Digite pelo menos 2 caracteres do nome da empresa emissora ou código da debênture.",
    "fundo": "Digite pelo menos 2 caracteres do nome do fundo de investimento que você possui.",
    "tesouro-direto": "Digite pelo menos 2 caracteres do nome do título do Tesouro Direto (ex: Tesouro Selic 2029).",
    "renda-fixa-prefixada": "Digite pelo menos 2 caracteres do nome do título de renda fixa com taxa prefixada.",
    "renda-fixa-posfixada": "Digite pelo menos 2 caracteres do nome do título de renda fixa com taxa pós-fixada.",
    "renda-fixa": "Selecione o tipo de renda fixa prefixada disponível para continuar.",
    "previdencia": "Digite pelo menos 2 caracteres do nome do plano de previdência privada.",
    "criptoativo": "Digite pelo menos 2 caracteres do nome da criptomoeda (ex: Bitcoin, Ethereum, Cardano).",
    "moeda": "Digite pelo menos 2 caracteres do nome da moeda estrangeira (ex: Dólar Americano, Euro).",
    "personalizado": "Digite pelo menos 2 caracteres do nome do seu ativo personalizado.",
    "conta-corrente": "Digite pelo menos 2 caracteres do nome da conta corrente (ex: Conta Corrente Itaú).",
    "poupanca": "Digite pelo menos 2 caracteres do nome da poupança (ex: Poupança Bradesco).",
  };
  
  return instructions[tipoAtivo] || "Digite pelo menos 2 caracteres do código ou nome do ativo que você deseja adicionar.";
}
