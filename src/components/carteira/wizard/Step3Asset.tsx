"use client";
import React, { useEffect, useState } from "react";
import { WizardFormData, WizardErrors, Asset, AutocompleteOption, RENDA_FIXA_TIPOS, RENDA_FIXA_TIPOS_HIBRIDOS } from "@/types/wizard";
import AutocompleteInput from "@/components/form/AutocompleteInput";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";

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
  const rendaFixaTipos = formData.tipoAtivo === "renda-fixa-hibrida" ? RENDA_FIXA_TIPOS_HIBRIDOS : RENDA_FIXA_TIPOS;
  const selectedRendaFixaType = rendaFixaTipos.find((tipo) => tipo.value === formData.rendaFixaTipo);

  // Não carregar ativos iniciais - apenas quando o usuário digitar

  // Buscar ativos
  const fetchAssets = async (search: string) => {
    if (!formData.tipoAtivo) {
      setAssetOptions([]);
      onErrorsChange({ ativo: "Selecione o tipo de ativo antes de buscar." });
      return;
    }

    // Stocks, previdência, tesouro direto e opções são adicionados manualmente - não buscar na Brapi
    if (formData.tipoAtivo === "stock" || formData.tipoAtivo === "previdencia" || formData.tipoAtivo === "tesouro-direto" || formData.tipoAtivo === "opcoes") {
      setAssetOptions([]);
      return;
    }

    // Para reserva de emergência, oportunidade e personalizado, criar automaticamente sem busca
    if (formData.tipoAtivo === "reserva-emergencia" || formData.tipoAtivo === "reserva-oportunidade" || formData.tipoAtivo === "personalizado") {
      if (formData.tipoAtivo === "reserva-emergencia") {
        onFormDataChange({
          ativo: "Reserva de Emergência",
          assetId: "RESERVA-EMERG",
        });
      } else if (formData.tipoAtivo === "reserva-oportunidade") {
        onFormDataChange({
          ativo: "Reserva de Oportunidade",
          assetId: "RESERVA-OPORT",
        });
      } else if (formData.tipoAtivo === "personalizado") {
        onFormDataChange({
          ativo: "Personalizado",
          assetId: "PERSONALIZADO",
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

    // Stocks, previdência e opções são adicionados manualmente - não buscar na API
    if (formData.tipoAtivo === "stock" || formData.tipoAtivo === "previdencia" || formData.tipoAtivo === "opcoes") {
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
    const tipos = formData.tipoAtivo === "renda-fixa-hibrida" ? RENDA_FIXA_TIPOS_HIBRIDOS : RENDA_FIXA_TIPOS;
    const tipoSelecionado = tipos.find((tipo) => tipo.value === tipoValue);
    const label = tipoSelecionado?.label || "Renda Fixa";
    const ativoLabel = formData.tipoAtivo === "renda-fixa-posfixada"
      ? label.replace(/ Pré$/, "")
      : formData.tipoAtivo === "renda-fixa-hibrida"
        ? label.replace(/ Híbrid[oa]$/, "")
        : label;
    onFormDataChange({
      rendaFixaTipo: tipoValue,
      ativo: ativoLabel,
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
      "renda-fixa-hibrida": "Selecione o tipo de renda fixa híbrida abaixo",
      "previdencia": "Digite pelo menos 2 caracteres (nome do plano)",
      "opcoes": "Digite o ticker do ativo base (ex: PETR4, VALE3)",
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

  if (formData.tipoAtivo === "renda-fixa" || formData.tipoAtivo === "renda-fixa-posfixada" || formData.tipoAtivo === "renda-fixa-hibrida") {
    const varianteVazia = !formData.rendaFixaVariante;
    const RENDA_FIXA_VARIANTES = [
      { value: 'pre' as const, label: 'Pré-fixada', desc: 'Taxa definida no momento da aplicação' },
      { value: 'pos' as const, label: 'Pós-fixada', desc: 'Rentabilidade atrelada a CDI ou IPCA' },
      { value: 'hib' as const, label: 'Híbrida', desc: 'Parte fixa + parte indexada' },
    ];

    const handleVarianteSelect = (variante: 'pre' | 'pos' | 'hib') => {
      onFormDataChange({
        rendaFixaVariante: variante,
        tipoAtivo: variante === 'pre' ? 'renda-fixa' : variante === 'pos' ? 'renda-fixa-posfixada' : 'renda-fixa-hibrida',
        rendaFixaTipo: '',
      });
      onErrorsChange({ rendaFixaTipo: undefined });
    };

    if (varianteVazia) {
      return (
        <div className="space-y-6">
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:bg-brand-400/20 dark:text-brand-200">
                <span className="text-sm font-semibold">RF</span>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Renda Fixa
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Selecione o tipo de rentabilidade do título.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Tipo de rentabilidade *
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {RENDA_FIXA_VARIANTES.map((v) => {
                const baseClasses = "flex flex-col items-start rounded-lg border px-4 py-3 text-left text-sm transition-colors";
                const selectedClasses = "border-brand-500 bg-brand-500/10 text-brand-700 dark:border-brand-400 dark:bg-brand-400/10 dark:text-brand-200";
                const defaultClasses = "border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-brand-400 dark:hover:bg-gray-800";
                const cardClasses = `${baseClasses} ${formData.rendaFixaVariante === v.value ? selectedClasses : defaultClasses}`;
                return (
                  <button
                    key={v.value}
                    type="button"
                    className={cardClasses}
                    onClick={() => handleVarianteSelect(v.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleVarianteSelect(v.value); } }}
                    aria-pressed={formData.rendaFixaVariante === v.value}
                    aria-label={`Selecionar ${v.label}`}
                  >
                    <span className="font-medium">{v.label}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">{v.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:bg-brand-400/20 dark:text-brand-200">
              <span className="text-sm font-semibold">RF</span>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {formData.tipoAtivo === "renda-fixa"
                  ? "Renda Fixa Pré-Fixada"
                  : formData.tipoAtivo === "renda-fixa-hibrida"
                    ? "Renda Fixa Híbrida"
                    : "Renda Fixa Pós-Fixada"}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Escolha o tipo de título para continuar o cadastro.
              </p>
              <button
                type="button"
                className="mt-2 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 underline"
                onClick={() => onFormDataChange({ rendaFixaVariante: "", tipoAtivo: "renda-fixa", rendaFixaTipo: "" })}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFormDataChange({ rendaFixaVariante: "", tipoAtivo: "renda-fixa", rendaFixaTipo: "" }); } }}
                aria-label="Alterar tipo de rentabilidade"
              >
                Alterar tipo de rentabilidade
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Tipos disponíveis *
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rendaFixaTipos.map((tipo) => {
              const isSelected = formData.rendaFixaTipo === tipo.value;
              const displayLabel = formData.tipoAtivo === "renda-fixa-posfixada"
                ? tipo.label.replace(/ Pré$/, "")
                : formData.tipoAtivo === "renda-fixa-hibrida"
                  ? tipo.label
                  : tipo.label;
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
                  aria-label={`Selecionar ${displayLabel}`}
                >
                  <span className="font-medium">{displayLabel}</span>
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
              {formData.tipoAtivo === "renda-fixa-posfixada"
                ? selectedRendaFixaType.label.replace(/ Pré$/, "")
                : formData.tipoAtivo === "renda-fixa-hibrida"
                  ? selectedRendaFixaType.label
                  : selectedRendaFixaType.label}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (formData.tipoAtivo === "fundo") {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 Como adicionar fundo manualmente
          </h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-disc list-inside">
            <li>Informe o nome completo do fundo de investimento (ex: XP Macro FIM, BTG Pactual FIA)</li>
            <li>Use o nome como aparece no extrato ou aplicativo da corretora</li>
            <li>No próximo passo você selecionará se é FIM ou FIA e informará valor ou quantidade de cotas</li>
          </ul>
        </div>
        <div>
          <Label htmlFor="fundo-nome">Nome do fundo *</Label>
          <Input
            id="fundo-nome"
            type="text"
            placeholder="Ex: XP Macro FIM, BTG Pactual FIA"
            value={formData.ativo}
            onChange={(e) => {
              const value = e.target.value;
              const trimmed = value.trim();
              onFormDataChange({
                ativo: value,
                assetId: trimmed ? "FUNDO-MANUAL" : "",
              });
              if (errors.ativo) onErrorsChange({ ativo: undefined });
            }}
            error={!!errors.ativo}
          />
          {errors.ativo && <p className="mt-1 text-sm text-red-500">{errors.ativo}</p>}
        </div>
        {formData.ativo && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">Fundo informado</h4>
            <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
          </div>
        )}
      </div>
    );
  }

  if (formData.tipoAtivo === "reit") {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 Como adicionar REIT manualmente
          </h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-disc list-inside">
            <li>Informe o ticker ou nome do REIT (ex: O, AMT, VICI, PLD)</li>
            <li>REITs são fundos imobiliários estrangeiros negociados em dólares</li>
            <li>No próximo passo você informará quantidade de cotas, preço em USD e tipo de investimento (Growth, Value ou Risk)</li>
          </ul>
        </div>
        <div>
          <Label htmlFor="reit-nome">Ticker ou nome do REIT *</Label>
          <Input
            id="reit-nome"
            type="text"
            placeholder="Ex: O, AMT, VICI, PLD"
            value={formData.ativo}
            onChange={(e) => {
              const value = e.target.value;
              const trimmed = value.trim();
              onFormDataChange({
                ativo: value,
                assetId: trimmed ? "REIT-MANUAL" : "",
              });
              if (errors.ativo) onErrorsChange({ ativo: undefined });
            }}
            error={!!errors.ativo}
          />
          {errors.ativo && <p className="mt-1 text-sm text-red-500">{errors.ativo}</p>}
        </div>
        {formData.ativo && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">REIT informado</h4>
            <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
          </div>
        )}
      </div>
    );
  }

  if (formData.tipoAtivo === "previdencia") {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 Como adicionar previdência manualmente
          </h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-disc list-inside">
            <li>Informe o nome do plano de previdência (ex: Vida Gerador, XP Previdência)</li>
            <li>Use o nome como aparece no extrato ou aplicativo</li>
            <li>No próximo passo você escolherá o tipo de adição (valor ou cotas) e informará a data da compra</li>
          </ul>
        </div>
        <div>
          <Label htmlFor="previdencia-nome">Nome do plano de previdência *</Label>
          <Input
            id="previdencia-nome"
            type="text"
            placeholder="Ex: Vida Gerador, XP Previdência"
            value={formData.ativo}
            onChange={(e) => {
              const value = e.target.value;
              const trimmed = value.trim();
              onFormDataChange({
                ativo: value,
                assetId: trimmed ? "PREVIDENCIA-MANUAL" : "",
              });
              if (errors.ativo) onErrorsChange({ ativo: undefined });
            }}
            error={!!errors.ativo}
          />
          {errors.ativo && <p className="mt-1 text-sm text-red-500">{errors.ativo}</p>}
        </div>
        {formData.ativo && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">Plano informado</h4>
            <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
          </div>
        )}
      </div>
    );
  }

  if (formData.tipoAtivo === "tesouro-direto") {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 Como adicionar Tesouro Direto manualmente
          </h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-disc list-inside">
            <li>Informe o nome do título (ex: Tesouro Selic 2029, Tesouro IPCA+ 2035)</li>
            <li>Use o nome como aparece no extrato ou aplicativo do Tesouro Direto</li>
            <li>No próximo passo você escolherá onde exibir (Reserva de Emergência, Reserva de Oportunidade ou Renda Fixa) e informará os dados do investimento</li>
          </ul>
        </div>
        <div>
          <Label htmlFor="tesouro-nome">Nome do título do Tesouro Direto *</Label>
          <Input
            id="tesouro-nome"
            type="text"
            placeholder="Ex: Tesouro Selic 2029, Tesouro IPCA+ 2035"
            value={formData.ativo}
            onChange={(e) => {
              const value = e.target.value;
              const trimmed = value.trim();
              onFormDataChange({
                ativo: value,
                assetId: trimmed ? "TESOURO-MANUAL" : "",
              });
              if (errors.ativo) onErrorsChange({ ativo: undefined });
            }}
            error={!!errors.ativo}
          />
          {errors.ativo && <p className="mt-1 text-sm text-red-500">{errors.ativo}</p>}
        </div>
        {formData.ativo && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">Título informado</h4>
            <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
          </div>
        )}
      </div>
    );
  }

  if (formData.tipoAtivo === "stock") {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 Como adicionar Stocks manualmente
          </h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-disc list-inside">
            <li>Stocks são ações internacionais (ex: AAPL, MSFT, GOOGL) - a Brapi só fornece dados brasileiros</li>
            <li>Informe o ticker da ação (ex: AAPL, MSFT, NVDA)</li>
            <li>No próximo passo você informará quantidade, preço em USD e a cotação do dólar no dia da compra</li>
          </ul>
        </div>
        <div>
          <Label htmlFor="stock-ticker">Ticker do Stock *</Label>
          <Input
            id="stock-ticker"
            type="text"
            placeholder="Ex: AAPL, MSFT, GOOGL, NVDA"
            value={formData.ativo}
            onChange={(e) => {
              const value = e.target.value;
              const trimmed = value.trim().toUpperCase();
              onFormDataChange({
                ativo: value,
                assetId: trimmed ? "STOCK-MANUAL" : "",
              });
              if (errors.ativo) onErrorsChange({ ativo: undefined });
            }}
            error={!!errors.ativo}
          />
          {errors.ativo && <p className="mt-1 text-sm text-red-500">{errors.ativo}</p>}
        </div>
        {formData.ativo && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">Stock informado</h4>
            <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
          </div>
        )}
      </div>
    );
  }

  if (formData.tipoAtivo === "opcoes") {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 Como adicionar opções manualmente
          </h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-disc list-inside">
            <li>Informe o ticker do ativo base (ex: PETR4, VALE3, ITUB4)</li>
            <li>No próximo passo você informará Put ou Call, Compra/Venda, datas, quantidade, preço e corretagem</li>
            <li>As opções aparecerão na aba Opções, na seção Put ou Call correspondente ao ativo</li>
          </ul>
        </div>
        <div>
          <Label htmlFor="opcao-ticker">Ticker do ativo base *</Label>
          <Input
            id="opcao-ticker"
            type="text"
            placeholder="Ex: PETR4, VALE3, ITUB4"
            value={formData.ativo}
            onChange={(e) => {
              const value = e.target.value;
              const trimmed = value.trim().toUpperCase();
              onFormDataChange({
                ativo: value,
                assetId: trimmed ? "OPCAO-MANUAL" : "",
              });
              if (errors.ativo) onErrorsChange({ ativo: undefined });
            }}
            error={!!errors.ativo}
          />
          {errors.ativo && <p className="mt-1 text-sm text-red-500">{errors.ativo}</p>}
        </div>
        {formData.ativo && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">Ativo base informado</h4>
            <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
          </div>
        )}
      </div>
    );
  }

  if (formData.tipoAtivo === "debenture") {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 Como adicionar debênture manualmente
          </h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-disc list-inside">
            <li>Informe o nome completo da debênture ou o código de negociação (ex: PETR33, VALE37)</li>
            <li>Use o nome da empresa emissora + ano de vencimento quando souber (ex: Debênture Sanepar 2032)</li>
            <li>No próximo passo você poderá informar valor ou quantidade de cotas e preço unitário</li>
          </ul>
        </div>
        <div>
          <Label htmlFor="debenture-nome">Nome ou código da debênture *</Label>
          <Input
            id="debenture-nome"
            type="text"
            placeholder="Ex: Debênture Sanepar 2032, PETR33"
            value={formData.ativo}
            onChange={(e) => {
              const value = e.target.value;
              const trimmed = value.trim();
              onFormDataChange({
                ativo: value,
                assetId: trimmed ? "DEBENTURE-MANUAL" : "",
              });
              if (errors.ativo) onErrorsChange({ ativo: undefined });
            }}
            error={!!errors.ativo}
          />
          {errors.ativo && <p className="mt-1 text-sm text-red-500">{errors.ativo}</p>}
        </div>
        {formData.ativo && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">Debênture informada</h4>
            <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
          </div>
        )}
      </div>
    );
  }

  if (formData.tipoAtivo === "moeda") {
    return (
      <MoedaSelect
        formData={formData}
        errors={errors}
        onFormDataChange={onFormDataChange}
        onErrorsChange={onErrorsChange}
      />
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

interface MoedaOption {
  value: string;
  label: string;
  symbol: string;
}

interface MoedaSelectProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

const MoedaSelect: React.FC<MoedaSelectProps> = ({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}) => {
  const [moedaOptions, setMoedaOptions] = useState<MoedaOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMoedas = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/carteira/moedas', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setMoedaOptions(data.moedas || []);
        }
      } catch (err) {
        console.error('Erro ao buscar moedas:', err);
        onErrorsChange({ ativo: 'Não foi possível carregar as moedas.' });
      } finally {
        setLoading(false);
      }
    };
    fetchMoedas();
  }, [onErrorsChange]);

  const handleMoedaChange = (value: string) => {
    const selected = moedaOptions.find((m) => m.value === value);
    onFormDataChange({
      assetId: value,
      ativo: selected?.label ?? '',
    });
    onErrorsChange({ ativo: undefined });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">Carregando moedas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:bg-brand-400/20 dark:text-brand-200">
            <span className="text-sm font-semibold">💱</span>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              Moedas disponíveis para cotação
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Selecione a moeda que deseja adicionar. As cotações são atualizadas via Brapi.
            </p>
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="moeda-select">Moeda *</Label>
        <Select
          options={moedaOptions}
          placeholder="Selecione a moeda"
          value={formData.assetId}
          onChange={handleMoedaChange}
          className={errors.ativo ? 'border-red-500' : ''}
        />
        {errors.ativo && <p className="mt-1 text-sm text-red-500">{errors.ativo}</p>}
      </div>

      {formData.assetId && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
            Moeda selecionada
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
        </div>
      )}
    </div>
  );
};

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
    "renda-fixa": "Selecione o tipo de renda fixa pré-fixada disponível para continuar.",
    "renda-fixa-posfixada": "Selecione o tipo de título de renda fixa pós-fixada.",
    "renda-fixa-hibrida": "Selecione o tipo de título de renda fixa híbrida.",
    "previdencia": "Digite pelo menos 2 caracteres do nome do plano de previdência privada.",
    "criptoativo": "Digite pelo menos 2 caracteres do nome da criptomoeda (ex: Bitcoin, Ethereum, Cardano).",
    "moeda": "Digite pelo menos 2 caracteres do nome da moeda estrangeira (ex: Dólar Americano, Euro).",
    "personalizado": "Digite pelo menos 2 caracteres do nome do seu ativo personalizado.",
    "conta-corrente": "Digite pelo menos 2 caracteres do nome da conta corrente (ex: Conta Corrente Itaú).",
    "poupanca": "Digite pelo menos 2 caracteres do nome da poupança (ex: Poupança Bradesco).",
  };
  
  return instructions[tipoAtivo] || "Digite pelo menos 2 caracteres do código ou nome do ativo que você deseja adicionar.";
}
