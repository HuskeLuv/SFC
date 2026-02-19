"use client";
import React, { useEffect, useState } from "react";
import { WizardFormData, WizardErrors, AutocompleteOption, PERIODOS, MOEDAS_FIXAS, RENDA_FIXA_INDEXADORES_POS } from "@/types/wizard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import DatePicker from "@/components/form/date-picker";
import AutocompleteInput from "@/components/form/AutocompleteInput";

interface Step4AssetInfoProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export default function Step4AssetInfo({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step4AssetInfoProps) {
  // const [emissorOptions, setEmissorOptions] = useState<AutocompleteOption[]>([]);
  // const [loading, setLoading] = useState(false);

  // Buscar emissores para renda fixa
  // const fetchEmissores = async (search: string) => {
  //   if (search.length < 2) return;
  //   
  //   setLoading(true);
  //   try {
  //     const response = await fetch(
  //       `/api/emissores?search=${encodeURIComponent(search)}&limit=20`,
  //       { credentials: 'include' }
  //     );
  //     if (response.ok) {
  //       const data = await response.json();
  //       const options: AutocompleteOption[] = data.emissores.map((emissor: Emissor) => ({
  //         value: emissor.id,
  //         label: emissor.nome,
  //         subtitle: emissor.tipo,
  //       }));
  //       setEmissorOptions(options);
  //     }
  //   } catch (error) {
  //     console.error('Erro ao buscar emissores:', error);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const handleInputChange = (field: keyof WizardFormData, value: string | number | boolean) => {
    onFormDataChange({ [field]: value });
    
    // Limpar erro quando usuário começar a digitar
    if (errors[field as keyof WizardErrors]) {
      onErrorsChange({ [field]: undefined });
    }
  };

  const handleEmissorChange = (value: string) => {
    onFormDataChange({ 
      emissor: value,
      emissorId: value ? formData.emissorId : ""
    });
  };

  const handleEmissorSelect = (option: AutocompleteOption) => {
    onFormDataChange({
      emissor: option.label,
      emissorId: option.value,
    });
  };

  const [decimalInputValues, setDecimalInputValues] = useState<Record<string, string>>({});

  const parseDecimalValue = (rawValue: string): number | null => {
    const trimmedValue = rawValue.trim();
    if (!trimmedValue) {
      return null;
    }
    const normalizedValue = trimmedValue.replace(/\s/g, "");
    const hasComma = normalizedValue.includes(",");
    const cleanedValue = hasComma
      ? normalizedValue.replace(/\./g, "").replace(",", ".")
      : normalizedValue;
    const numericValue = Number.parseFloat(cleanedValue.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numericValue) ? numericValue : null;
  };

  const getDecimalInputValue = (field: keyof WizardFormData) => {
    const localValue = decimalInputValues[field];
    if (localValue !== undefined) {
      return localValue;
    }
    const numericValue = formData[field];
    if (typeof numericValue !== "number" || Number.isNaN(numericValue)) {
      return "";
    }
    return String(numericValue).replace(".", ",");
  };

  const handleDecimalInputChange = (field: keyof WizardFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setDecimalInputValues((prev) => ({ ...prev, [field]: rawValue }));

    if (!rawValue.trim()) {
      handleInputChange(field, 0);
      return;
    }

    const parsedValue = parseDecimalValue(rawValue);
    if (parsedValue === null) {
      return;
    }
    handleInputChange(field, parsedValue);
  };

  const decimalInputProps = {
    type: "text" as const,
    inputMode: "decimal" as const,
    pattern: "[0-9]*[.,]?[0-9]*",
  };

  const integerInputProps = {
    type: "text" as const,
    inputMode: "numeric" as const,
    pattern: "[0-9]*",
  };

  // Calcular valor total automaticamente para alguns tipos
  useEffect(() => {
    if (formData.tipoAtivo === "fii" && formData.quantidade > 0 && formData.cotacaoUnitaria > 0) {
      const valorCalculado = (formData.quantidade * formData.cotacaoUnitaria) + (formData.taxaCorretagem || 0);
      if (Math.abs(formData.valorInvestido - valorCalculado) > 0.01) {
        onFormDataChange({ valorInvestido: valorCalculado });
      }
    }
    const metodoCotas = formData.metodo === 'cotas' || formData.metodo === 'percentual';
    if ((formData.tipoAtivo === "debenture" || formData.tipoAtivo === "fundo" || formData.tipoAtivo === "previdencia" || formData.tipoAtivo === "tesouro-direto") && metodoCotas && formData.quantidade > 0 && formData.cotacaoUnitaria > 0) {
      const valorCalculado = formData.quantidade * formData.cotacaoUnitaria;
      if (Math.abs(formData.valorInvestido - valorCalculado) > 0.01) {
        onFormDataChange({ valorInvestido: valorCalculado });
      }
    }
    if (formData.tipoAtivo === "reit" && formData.quantidade > 0 && formData.cotacaoUnitaria > 0) {
      const valorCalculado = formData.quantidade * formData.cotacaoUnitaria;
      if (Math.abs(formData.valorInvestido - valorCalculado) > 0.01) {
        onFormDataChange({ valorInvestido: valorCalculado });
      }
    }
  }, [formData.quantidade, formData.cotacaoUnitaria, formData.taxaCorretagem, formData.tipoAtivo, formData.metodo, formData.valorInvestido, onFormDataChange]);

  const renderFieldsByAssetType = () => {
    switch (formData.tipoAtivo) {
      case "reserva-emergencia":
      case "reserva-oportunidade":
        return (
          <>
            <div>
              <DatePicker
                id="dataCompra"
                label="Data *"
                placeholder="Selecione a data"
                defaultDate={formData.dataCompra}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataCompra && (
                <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>
              )}
            </div>
            <div>
              <Label htmlFor="valorInvestido">Valor (R$) *</Label>
              <Input
                id="valorInvestido"
                {...decimalInputProps}
                placeholder="Ex: 10000.00"
                value={getDecimalInputValue("valorInvestido")}
                onChange={handleDecimalInputChange("valorInvestido")}
                error={!!errors.valorInvestido}
                hint={errors.valorInvestido}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="cotizacaoResgate">Cot. Resgate *</Label>
              <Input
                id="cotizacaoResgate"
                type="text"
                placeholder="Ex: D+0, D+1, D+30"
                value={formData.cotizacaoResgate}
                onChange={(e) => handleInputChange('cotizacaoResgate', e.target.value)}
                error={!!errors.cotizacaoResgate}
                hint={errors.cotizacaoResgate}
              />
            </div>
            <div>
              <Label htmlFor="liquidacaoResgate">Liq. Resgate *</Label>
              <Input
                id="liquidacaoResgate"
                type="text"
                placeholder="Ex: Imediata, D+1, D+2"
                value={formData.liquidacaoResgate}
                onChange={(e) => handleInputChange('liquidacaoResgate', e.target.value)}
                error={!!errors.liquidacaoResgate}
                hint={errors.liquidacaoResgate}
              />
            </div>
            <div>
              <DatePicker
                id="vencimento"
                label="Vencimento *"
                placeholder="Selecione a data"
                defaultDate={formData.vencimento}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('vencimento', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.vencimento && (
                <p className="mt-1 text-sm text-red-500">{errors.vencimento}</p>
              )}
            </div>
            <div>
              <Label htmlFor="benchmark">Benchmark *</Label>
              <Input
                id="benchmark"
                type="text"
                placeholder="Ex: CDI, IPCA, Selic"
                value={formData.benchmark}
                onChange={(e) => handleInputChange('benchmark', e.target.value)}
                error={!!errors.benchmark}
                hint={errors.benchmark}
              />
            </div>
          </>
        );

      case "conta-corrente":
        return (
          <>
            <div>
              <DatePicker
                id="dataInicio"
                label="Data de Início *"
                placeholder="Selecione a data"
                defaultDate={formData.dataInicio}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataInicio', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataInicio && (
                <p className="mt-1 text-sm text-red-500">{errors.dataInicio}</p>
              )}
            </div>
            <div>
              <Label htmlFor="valorAplicado">Valor Aplicado (R$) *</Label>
              <Input
                id="valorAplicado"
                {...decimalInputProps}
                placeholder="Ex: 10000.00"
                value={getDecimalInputValue("valorAplicado")}
                onChange={handleDecimalInputChange("valorAplicado")}
                error={!!errors.valorAplicado}
                hint={errors.valorAplicado}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="percentualCDI">Percentual sobre o CDI (%)</Label>
              <Input
                id="percentualCDI"
                {...decimalInputProps}
                placeholder="Ex: 100 (opcional)"
                value={getDecimalInputValue("percentualCDI")}
                onChange={handleDecimalInputChange("percentualCDI")}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="contaCorrenteDestino">Onde este investimento deve aparecer *</Label>
              <Select
                id="contaCorrenteDestino"
                options={[
                  { value: "reserva-emergencia", label: "Reserva de Emergência" },
                  { value: "reserva-oportunidade", label: "Reserva de Oportunidade" },
                ]}
                placeholder="Selecione onde exibir"
                value={formData.contaCorrenteDestino ?? ""}
                onChange={(value) => handleInputChange('contaCorrenteDestino', value)}
                className={errors.contaCorrenteDestino ? 'border-red-500' : ''}
              />
              {errors.contaCorrenteDestino && (
                <p className="mt-1 text-sm text-red-500">{errors.contaCorrenteDestino}</p>
              )}
            </div>
          </>
        );

      case "criptoativo":
        return (
          <>
            <div>
              <DatePicker
                id="dataCompra"
                label="Data de Compra *"
                placeholder="Selecione a data"
                defaultDate={formData.dataCompra}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataCompra && (
                <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>
              )}
            </div>
            <div>
              <Label htmlFor="quantidade">Quantidade *</Label>
              <Input
                id="quantidade"
                {...decimalInputProps}
                placeholder="Ex: 0.5"
                value={getDecimalInputValue("quantidade")}
                onChange={handleDecimalInputChange("quantidade")}
                error={!!errors.quantidade}
                hint={errors.quantidade}
                min="0"
                step="0.00000001"
              />
            </div>
            <div>
              <Label htmlFor="cotacaoCompra">Cotação de Compra (R$) *</Label>
              <Input
                id="cotacaoCompra"
                {...decimalInputProps}
                placeholder="Ex: 150000.00"
                value={getDecimalInputValue("cotacaoCompra")}
                onChange={handleDecimalInputChange("cotacaoCompra")}
                error={!!errors.cotacaoCompra}
                hint={errors.cotacaoCompra}
                min="0"
                step="0.01"
              />
            </div>
          </>
        );

      case "moeda":
        return (
          <>
            <div>
              <Label htmlFor="moeda">Moeda *</Label>
              <Input
                id="moeda"
                type="text"
                placeholder="Selecionada no passo anterior"
                value={formData.ativo}
                disabled
                className="bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
              />
            </div>
            <div>
              <DatePicker
                id="dataCompra"
                label="Data de Compra *"
                placeholder="Selecione a data"
                defaultDate={formData.dataCompra}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataCompra && (
                <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>
              )}
            </div>
            <div>
              <Label htmlFor="quantidade">Quantidade de unidades *</Label>
              <Input
                id="quantidade"
                {...decimalInputProps}
                placeholder="Ex: 100 ou 100.50"
                value={getDecimalInputValue("quantidade")}
                onChange={handleDecimalInputChange("quantidade")}
                error={!!errors.quantidade}
                hint={errors.quantidade}
                min="0"
                step="0.01"
              />
              {errors.quantidade && <p className="mt-1 text-sm text-red-500">{errors.quantidade}</p>}
            </div>
            <div>
              <Label htmlFor="cotacaoCompra">Preço de aquisição por unidade (R$) *</Label>
              <Input
                id="cotacaoCompra"
                {...decimalInputProps}
                placeholder="Ex: 5.20"
                value={getDecimalInputValue("cotacaoCompra")}
                onChange={handleDecimalInputChange("cotacaoCompra")}
                error={!!errors.cotacaoCompra}
                hint={errors.cotacaoCompra}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="valorInvestido">Valor do Investimento (R$) *</Label>
              <Input
                id="valorInvestido"
                type="text"
                placeholder="Calculado automaticamente"
                value={formData.quantidade > 0 && formData.cotacaoCompra > 0
                  ? (formData.quantidade * formData.cotacaoCompra).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                  : ''}
                disabled
                className="bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
              />
            </div>
          </>
        );

      case "personalizado":
        return (
          <>
            <div>
              <DatePicker
                id="dataInicio"
                label="Data de Início *"
                placeholder="Selecione a data"
                defaultDate={formData.dataInicio}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataInicio', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataInicio && (
                <p className="mt-1 text-sm text-red-500">{errors.dataInicio}</p>
              )}
            </div>
            <div>
              <Label htmlFor="nomePersonalizado">Nome do Ativo *</Label>
              <Input
                id="nomePersonalizado"
                type="text"
                placeholder="Ex: Minha Empresa LTDA"
                value={formData.nomePersonalizado}
                onChange={(e) => handleInputChange('nomePersonalizado', e.target.value)}
                error={!!errors.nomePersonalizado}
                hint={errors.nomePersonalizado}
              />
            </div>
            <div>
              <Label htmlFor="quantidade">Quantidade de Cotas *</Label>
              <Input
                id="quantidade"
                {...integerInputProps}
                placeholder="Ex: 1000"
                value={getDecimalInputValue("quantidade")}
                onChange={handleDecimalInputChange("quantidade")}
                error={!!errors.quantidade}
                hint={errors.quantidade}
                min="0"
                step="1"
              />
            </div>
            <div>
              <Label htmlFor="precoUnitario">Preço Unitário (R$) *</Label>
              <Input
                id="precoUnitario"
                {...decimalInputProps}
                placeholder="Ex: 10.50"
                value={getDecimalInputValue("precoUnitario")}
                onChange={handleDecimalInputChange("precoUnitario")}
                error={!!errors.precoUnitario}
                hint={errors.precoUnitario}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="metodo">Método de Acompanhamento *</Label>
              <Select
                options={[
                  { value: "valor", label: "Por Valor Financeiro: A cada mês você informa o valor atualizado do seu investimento" },
                  { value: "percentual", label: "Por Variação Percentual: A cada mês, você informa quantos % seu investimento rendeu" }
                ]}
                placeholder="Selecione o método"
                defaultValue={formData.metodo}
                onChange={(value) => handleInputChange('metodo', value)}
                className={errors.metodo ? 'border-red-500' : ''}
              />
              {errors.metodo && (
                <p className="mt-1 text-sm text-red-500">{errors.metodo}</p>
              )}
            </div>
          </>
        );

      case "poupanca":
        return (
          <>
            <div>
              <DatePicker
                id="dataCompra"
                label="Data de Aplicação *"
                placeholder="Selecione a data"
                defaultDate={formData.dataCompra}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataCompra && (
                <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>
              )}
            </div>
            <div>
              <Label htmlFor="valorAplicado">Valor Aplicado (R$) *</Label>
              <Input
                id="valorAplicado"
                {...decimalInputProps}
                placeholder="Ex: 5000.00"
                value={getDecimalInputValue("valorAplicado")}
                onChange={handleDecimalInputChange("valorAplicado")}
                error={!!errors.valorAplicado}
                hint={errors.valorAplicado}
                min="0"
                step="0.01"
              />
            </div>
          </>
        );

      case "renda-fixa":
      case "renda-fixa-posfixada":
      case "renda-fixa-hibrida":
        return (
          <>
            <div>
              <DatePicker
                id="dataInicio"
                label="Data do Início *"
                placeholder="Selecione a data"
                defaultDate={formData.dataInicio}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataInicio', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataInicio && (
                <p className="mt-1 text-sm text-red-500">{errors.dataInicio}</p>
              )}
            </div>
            <div>
              <Label htmlFor="valorAplicado">Valor Aplicado (R$) *</Label>
              <Input
                id="valorAplicado"
                {...decimalInputProps}
                placeholder="Ex: 10000.00"
                value={getDecimalInputValue("valorAplicado")}
                onChange={handleDecimalInputChange("valorAplicado")}
                error={!!errors.valorAplicado}
                hint={errors.valorAplicado}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <DatePicker
                id="dataVencimento"
                label="Data de Vencimento *"
                placeholder="Selecione a data"
                defaultDate={formData.dataVencimento}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataVencimento', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataVencimento && (
                <p className="mt-1 text-sm text-red-500">{errors.dataVencimento}</p>
              )}
            </div>
            {formData.tipoAtivo === "renda-fixa-hibrida" && (
              <div>
                <Label htmlFor="taxaFixaAnual">Taxa Fixa Anual (%) *</Label>
                <Input
                  id="taxaFixaAnual"
                  {...decimalInputProps}
                  placeholder="Ex: 6 (parte prefixada)"
                  value={getDecimalInputValue("taxaFixaAnual")}
                  onChange={handleDecimalInputChange("taxaFixaAnual")}
                  error={!!errors.taxaFixaAnual}
                  hint={errors.taxaFixaAnual}
                  min="0"
                  step="0.01"
                />
              </div>
            )}
            <div>
              <Label htmlFor="taxaJurosAnual">
                {formData.tipoAtivo === "renda-fixa-posfixada"
                  ? "Taxa sobre o Indexador (%) *"
                  : formData.tipoAtivo === "renda-fixa-hibrida"
                    ? "Taxa sobre o Indexador (%) *"
                    : "Taxa de Juros Anual (%) *"}
              </Label>
              <Input
                id="taxaJurosAnual"
                {...decimalInputProps}
                placeholder={
                  formData.tipoAtivo === "renda-fixa-posfixada"
                    ? "Ex: 100 (100% CDI) ou 1.5 (CDI + 1.5%)"
                    : formData.tipoAtivo === "renda-fixa-hibrida"
                      ? "Ex: 100 (100% CDI) ou 5 (IPCA + 5%)"
                      : "Ex: 12.5"
                }
                value={getDecimalInputValue("taxaJurosAnual")}
                onChange={handleDecimalInputChange("taxaJurosAnual")}
                error={!!errors.taxaJurosAnual}
                hint={errors.taxaJurosAnual}
                min="0"
                step="0.01"
              />
            </div>
            {(formData.tipoAtivo === "renda-fixa-posfixada" || formData.tipoAtivo === "renda-fixa-hibrida") && (
              <>
                <div>
                  <Label htmlFor="rendaFixaIndexer">Indexador *</Label>
                  <Select
                    options={RENDA_FIXA_INDEXADORES_POS}
                    placeholder="Selecione o indexador"
                    defaultValue={formData.rendaFixaIndexer}
                    onChange={(value) => handleInputChange('rendaFixaIndexer', value)}
                    className={errors.rendaFixaIndexer ? 'border-red-500' : ''}
                  />
                  {errors.rendaFixaIndexer && (
                    <p className="mt-1 text-sm text-red-500">{errors.rendaFixaIndexer}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="rendaFixaIndexerPercent">% do Indexador</Label>
                  <Input
                    id="rendaFixaIndexerPercent"
                    {...decimalInputProps}
                    placeholder="Ex: 100 (100% do CDI)"
                    value={getDecimalInputValue("rendaFixaIndexerPercent")}
                    onChange={handleDecimalInputChange("rendaFixaIndexerPercent")}
                    min="0"
                    step="0.01"
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="descricao">Descrição / Apelido *</Label>
              <Input
                id="descricao"
                type="text"
                placeholder="Ex: CDB Banco do Brasil 2026"
                value={formData.descricao}
                onChange={(e) => handleInputChange('descricao', e.target.value)}
                error={!!errors.descricao}
                hint={errors.descricao}
              />
            </div>

            <div className="hidden">
              <Label htmlFor="rendaFixaIndexer">Indexador</Label>
              <Select
                options={[
                  { value: "PRE", label: "Pré" },
                  { value: "CDI", label: "CDI" },
                  { value: "IPCA", label: "IPCA" },
                ]}
                placeholder="Selecione o indexador"
                defaultValue={formData.tipoAtivo === "renda-fixa" ? "PRE" : formData.rendaFixaIndexer}
                onChange={(value) => handleInputChange('rendaFixaIndexer', value)}
              />
              <Label htmlFor="rendaFixaLiquidity">Liquidez</Label>
              <Select
                options={[
                  { value: "DAILY", label: "Diária" },
                  { value: "MATURITY", label: "No vencimento" },
                ]}
                placeholder="Selecione a liquidez"
                defaultValue={formData.rendaFixaLiquidity}
                onChange={(value) => handleInputChange('rendaFixaLiquidity', value)}
              />
              <div className="flex items-center gap-2">
                <input
                  id="rendaFixaTaxExempt"
                  type="checkbox"
                  checked={!!formData.rendaFixaTaxExempt}
                  onChange={(e) => handleInputChange('rendaFixaTaxExempt', e.target.checked)}
                />
                <Label htmlFor="rendaFixaTaxExempt">Isento de IR</Label>
              </div>
            </div>
          </>
        );

      case "debenture":
      case "fundo":
      case "previdencia":
      case "tesouro-direto":
        const metodoCotas = formData.metodo === 'cotas' || formData.metodo === 'percentual';
        const totalCalculado = formData.quantidade * formData.cotacaoUnitaria;
        const TIPO_DEBENTURE_OPTIONS = [
          { value: "prefixada", label: "Pré-fixada" },
          { value: "pos-fixada", label: "Pós-fixada" },
          { value: "hibrida", label: "Híbrida" },
        ];
        return (
          <>
            <div>
              <DatePicker
                id="dataCompra"
                label="Data de Compra *"
                placeholder="Selecione a data"
                defaultDate={formData.dataCompra}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataCompra && (
                <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>
              )}
            </div>

            {formData.tipoAtivo === "debenture" && (
              <div>
                <Label htmlFor="tipoDebenture">Tipo de Debênture *</Label>
                <Select
                  id="tipoDebenture"
                  options={TIPO_DEBENTURE_OPTIONS}
                  placeholder="Selecione o tipo (define em qual seção da aba Renda Fixa será exibida)"
                  value={formData.tipoDebenture ?? ""}
                  onChange={(value) => handleInputChange('tipoDebenture', value)}
                  className={errors.tipoDebenture ? 'border-red-500' : ''}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  A debênture será exibida na seção correspondente: Pré-fixada, Pós-fixada ou Híbrida.
                </p>
                {errors.tipoDebenture && (
                  <p className="mt-1 text-sm text-red-500">{errors.tipoDebenture}</p>
                )}
              </div>
            )}

            {formData.tipoAtivo === "fundo" && (
              <div>
                <Label htmlFor="tipoFundo">Tipo de Fundo *</Label>
                <Select
                  id="tipoFundo"
                  options={[
                    { value: "fim", label: "FIM (Fundos de Investimento Multimercado)" },
                    { value: "fia", label: "FIA (Fundo de Investimento em Ações)" },
                  ]}
                  placeholder="Selecione o tipo (define em qual seção da aba FIM/FIA será exibido)"
                  value={formData.tipoFundo ?? ""}
                  onChange={(value) => handleInputChange('tipoFundo', value)}
                  className={errors.tipoFundo ? 'border-red-500' : ''}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  O fundo será exibido na seção correspondente: FIM ou FIA.
                </p>
                {errors.tipoFundo && (
                  <p className="mt-1 text-sm text-red-500">{errors.tipoFundo}</p>
                )}
              </div>
            )}

            <div className="mb-4">
              <Label>Tipo de Adição *</Label>
              <div className="flex flex-col sm:flex-row gap-4 mt-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="metodo-debenture"
                    value="valor"
                    checked={formData.metodo === 'valor'}
                    onChange={() => handleInputChange('metodo', 'valor')}
                    className="mr-2"
                  />
                  Por valor investido
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="metodo-debenture"
                    value="cotas"
                    checked={metodoCotas}
                    onChange={() => handleInputChange('metodo', 'cotas')}
                    className="mr-2"
                  />
                  Por preço de cota e quantidade
                </label>
              </div>
            </div>

            {formData.metodo === 'valor' || !metodoCotas ? (
              <div>
                <Label htmlFor="valorInvestido">Valor Investido (R$) *</Label>
                <Input
                  id="valorInvestido"
                  {...decimalInputProps}
                  placeholder="Ex: 10000.00"
                  value={getDecimalInputValue("valorInvestido")}
                  onChange={handleDecimalInputChange("valorInvestido")}
                  error={!!errors.valorInvestido}
                  hint={errors.valorInvestido}
                  min="0"
                  step="0.01"
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="cotacaoUnitaria">Preço da Cota (R$) *</Label>
                  <Input
                    id="cotacaoUnitaria"
                    {...decimalInputProps}
                    placeholder="Ex: 150.00"
                    value={getDecimalInputValue("cotacaoUnitaria")}
                    onChange={(e) => {
                      handleDecimalInputChange("cotacaoUnitaria")(e);
                      const qty = formData.quantidade || 0;
                      const price = parseDecimalValue(e.target.value) ?? 0;
                      if (qty > 0 && price > 0) handleInputChange('valorInvestido', qty * price);
                    }}
                    error={!!errors.cotacaoUnitaria}
                    hint={errors.cotacaoUnitaria}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <Label htmlFor="quantidade">Quantidade de Cotas *</Label>
                  <Input
                    id="quantidade"
                    {...decimalInputProps}
                    placeholder="Ex: 100"
                    value={getDecimalInputValue("quantidade")}
                    onChange={(e) => {
                      handleDecimalInputChange("quantidade")(e);
                      const qty = parseDecimalValue(e.target.value) ?? 0;
                      const price = formData.cotacaoUnitaria || 0;
                      if (qty > 0 && price > 0) handleInputChange('valorInvestido', qty * price);
                    }}
                    error={!!errors.quantidade}
                    hint={errors.quantidade}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <Label htmlFor="totalInvestido">Total Investido (R$)</Label>
                  <Input
                    id="totalInvestido"
                    type="text"
                    placeholder="Calculado automaticamente"
                    value={totalCalculado > 0 ? totalCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                    disabled
                    className="bg-gray-50 dark:bg-gray-800"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Calculado automaticamente: Quantidade × Preço por Cota
                  </p>
                </div>
              </>
            )}
          </>
        );

      case "fii":
        return (
          <>
            <div>
              <DatePicker
                id="dataCompra"
                label="Data de Compra *"
                placeholder="Selecione a data"
                defaultDate={formData.dataCompra}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataCompra && (
                <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>
              )}
            </div>
            <div>
              <Label htmlFor="tipoFii">Tipo de FII *</Label>
              <Select
                options={[
                  { value: "fofi", label: "FOFI (Fundos de Fundos)" },
                  { value: "tvm", label: "TVM (Títulos e Valores Mobiliários)" },
                  { value: "tijolo", label: "Tijolo" }
                ]}
                placeholder="Selecione o tipo"
                value={formData.tipoFii}
                onChange={(value) => handleInputChange('tipoFii', value)}
                className={errors.tipoFii ? 'border-red-500' : ''}
              />
              {errors.tipoFii && (
                <p className="mt-1 text-sm text-red-500">{errors.tipoFii}</p>
              )}
            </div>
            <div>
              <Label htmlFor="quantidade">Quantidade de Cotas *</Label>
              <Input
                id="quantidade"
                {...decimalInputProps}
                placeholder="Ex: 100"
                value={getDecimalInputValue("quantidade")}
                onChange={handleDecimalInputChange("quantidade")}
                error={!!errors.quantidade}
                hint={errors.quantidade}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="cotacaoUnitaria">Cotação Unitária (R$) *</Label>
              <Input
                id="cotacaoUnitaria"
                {...decimalInputProps}
                placeholder="Ex: 95.50"
                value={getDecimalInputValue("cotacaoUnitaria")}
                onChange={handleDecimalInputChange("cotacaoUnitaria")}
                error={!!errors.cotacaoUnitaria}
                hint={errors.cotacaoUnitaria}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="taxaCorretagem">Taxa de Corretagem (R$)</Label>
              <Input
                id="taxaCorretagem"
                {...decimalInputProps}
                placeholder="Ex: 2.50"
                value={getDecimalInputValue("taxaCorretagem")}
                onChange={handleDecimalInputChange("taxaCorretagem")}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="valorInvestido">Total Investido (R$)</Label>
              <Input
                id="valorInvestido"
                {...decimalInputProps}
                placeholder="Calculado automaticamente"
                value={formData.valorInvestido}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
              <p className="mt-1 text-xs text-gray-500">
                Calculado automaticamente: (Quantidade × Cotação) + Taxa
              </p>
            </div>
          </>
        );

      case "acao":
        // Para ações, adicionar campo de estratégia
        return (
          <>
            <div>
              <DatePicker
                id="dataCompra"
                label="Data de Compra *"
                placeholder="Selecione a data"
                defaultDate={formData.dataCompra}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataCompra && (
                <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>
              )}
            </div>
            <div>
              <Label htmlFor="estrategia">Estratégia *</Label>
              <Select
                options={[
                  { value: "value", label: "Value" },
                  { value: "growth", label: "Growth" },
                  { value: "risk", label: "Risk" }
                ]}
                placeholder="Selecione a estratégia"
                defaultValue={formData.estrategia}
                onChange={(value) => handleInputChange('estrategia', value)}
                className={errors.estrategia ? 'border-red-500' : ''}
              />
              {errors.estrategia && (
                <p className="mt-1 text-sm text-red-500">{errors.estrategia}</p>
              )}
            </div>
            <div>
              <Label htmlFor="quantidade">Quantidade *</Label>
              <Input
                id="quantidade"
                {...integerInputProps}
                placeholder="Ex: 100"
                value={getDecimalInputValue("quantidade")}
                onChange={handleDecimalInputChange("quantidade")}
                error={!!errors.quantidade}
                hint={errors.quantidade}
                min="0"
                step="1"
              />
            </div>
            <div>
              <Label htmlFor="cotacaoUnitaria">Cotação Unitária (R$) *</Label>
              <Input
                id="cotacaoUnitaria"
                {...decimalInputProps}
                placeholder="Ex: 25.50"
                value={getDecimalInputValue("cotacaoUnitaria")}
                onChange={handleDecimalInputChange("cotacaoUnitaria")}
                error={!!errors.cotacaoUnitaria}
                hint={errors.cotacaoUnitaria}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="taxaCorretagem">Taxa de Corretagem (R$)</Label>
              <Input
                id="taxaCorretagem"
                {...decimalInputProps}
                placeholder="Ex: 2.50"
                value={getDecimalInputValue("taxaCorretagem")}
                onChange={handleDecimalInputChange("taxaCorretagem")}
                min="0"
                step="0.01"
              />
            </div>
          </>
        );

      case "reit":
        return (
          <>
            <div>
              <DatePicker
                id="dataCompra"
                label="Data de Compra *"
                placeholder="Selecione a data"
                defaultDate={formData.dataCompra}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataCompra && (
                <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>
              )}
            </div>
            <div>
              <Label htmlFor="estrategiaReit">Tipo de Investimento *</Label>
              <Select
                id="estrategiaReit"
                options={[
                  { value: "value", label: "Value" },
                  { value: "growth", label: "Growth" },
                  { value: "risk", label: "Risk" },
                ]}
                placeholder="Selecione (define em qual seção da aba REIT será exibido)"
                value={formData.estrategiaReit ?? ""}
                onChange={(value) => handleInputChange('estrategiaReit', value as 'value' | 'growth' | 'risk')}
                className={errors.estrategiaReit ? 'border-red-500' : ''}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                O REIT será exibido na seção correspondente: Value, Growth ou Risk.
              </p>
              {errors.estrategiaReit && (
                <p className="mt-1 text-sm text-red-500">{errors.estrategiaReit}</p>
              )}
            </div>
            <div>
              <Label htmlFor="quantidade">Quantidade de Cotas *</Label>
              <Input
                id="quantidade"
                {...integerInputProps}
                placeholder="Ex: 100"
                value={getDecimalInputValue("quantidade")}
                onChange={(e) => {
                  handleDecimalInputChange("quantidade")(e);
                  const qty = parseDecimalValue(e.target.value) ?? 0;
                  const price = formData.cotacaoUnitaria || 0;
                  if (qty > 0 && price > 0) handleInputChange('valorInvestido', qty * price);
                }}
                error={!!errors.quantidade}
                hint={errors.quantidade}
                min="0"
                step="1"
              />
            </div>
            <div>
              <Label htmlFor="cotacaoUnitaria">Preço da Cota (USD) *</Label>
              <Input
                id="cotacaoUnitaria"
                {...decimalInputProps}
                placeholder="Ex: 45.50"
                value={getDecimalInputValue("cotacaoUnitaria")}
                onChange={(e) => {
                  handleDecimalInputChange("cotacaoUnitaria")(e);
                  const qty = formData.quantidade || 0;
                  const price = parseDecimalValue(e.target.value) ?? 0;
                  if (qty > 0 && price > 0) handleInputChange('valorInvestido', qty * price);
                }}
                error={!!errors.cotacaoUnitaria}
                hint={errors.cotacaoUnitaria}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="valorInvestido">Total Investido (USD)</Label>
              <Input
                id="valorInvestido"
                type="text"
                placeholder="Calculado automaticamente"
                value={(formData.quantidade * formData.cotacaoUnitaria) > 0 
                  ? (formData.quantidade * formData.cotacaoUnitaria).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD' 
                  : ''}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
              <p className="mt-1 text-xs text-gray-500">
                Calculado automaticamente: Quantidade × Preço por Cota (USD)
              </p>
            </div>
          </>
        );

      case "stock":
        return (
          <>
            <div>
              <DatePicker
                id="dataCompra"
                label="Data de Compra *"
                placeholder="Selecione a data"
                defaultDate={formData.dataCompra}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataCompra && (
                <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>
              )}
            </div>
            <div>
              <Label htmlFor="estrategia">Estratégia *</Label>
              <Select
                id="estrategia"
                options={[
                  { value: "value", label: "Value" },
                  { value: "growth", label: "Growth" },
                  { value: "risk", label: "Risk" },
                ]}
                placeholder="Selecione (define em qual seção da aba Stocks será exibido)"
                value={formData.estrategia ?? ""}
                onChange={(value) => handleInputChange('estrategia', value)}
                className={errors.estrategia ? 'border-red-500' : ''}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                O stock será exibido na seção correspondente: Value, Growth ou Risk.
              </p>
              {errors.estrategia && (
                <p className="mt-1 text-sm text-red-500">{errors.estrategia}</p>
              )}
            </div>
            <div>
              <Label htmlFor="moeda">Moeda *</Label>
              <Select
                options={MOEDAS_FIXAS}
                placeholder="Selecione a moeda"
                defaultValue={formData.moeda}
                onChange={(value) => handleInputChange('moeda', value)}
                className={errors.moeda ? 'border-red-500' : ''}
              />
              {errors.moeda && (
                <p className="mt-1 text-sm text-red-500">{errors.moeda}</p>
              )}
            </div>
            <div>
              <Label htmlFor="cotacaoMoeda">Cotação da Moeda (R$) *</Label>
              <Input
                id="cotacaoMoeda"
                {...decimalInputProps}
                placeholder="Ex: 5.20"
                value={getDecimalInputValue("cotacaoMoeda")}
                onChange={handleDecimalInputChange("cotacaoMoeda")}
                error={!!errors.cotacaoMoeda}
                hint={errors.cotacaoMoeda}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="quantidade">Quantidade *</Label>
              <Input
                id="quantidade"
                {...integerInputProps}
                placeholder="Ex: 10"
                value={getDecimalInputValue("quantidade")}
                onChange={handleDecimalInputChange("quantidade")}
                error={!!errors.quantidade}
                hint={errors.quantidade}
                min="0"
                step="1"
              />
            </div>
            <div>
              <Label htmlFor="cotacaoUnitaria">Preço por Ação (moeda selecionada) *</Label>
              <Input
                id="cotacaoUnitaria"
                {...decimalInputProps}
                placeholder="Ex: 120.50"
                value={getDecimalInputValue("cotacaoUnitaria")}
                onChange={handleDecimalInputChange("cotacaoUnitaria")}
                error={!!errors.cotacaoUnitaria}
                hint={errors.cotacaoUnitaria}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="taxaCorretagem">Taxa de Corretagem (R$)</Label>
              <Input
                id="taxaCorretagem"
                {...decimalInputProps}
                placeholder="Ex: 2.50"
                value={getDecimalInputValue("taxaCorretagem")}
                onChange={handleDecimalInputChange("taxaCorretagem")}
                min="0"
                step="0.01"
              />
            </div>
          </>
        );

      default:
        // Para BDRs, ETFs, REITs, etc.
        return (
          <>
            <div>
              <DatePicker
                id="dataCompra"
                label="Data de Compra *"
                placeholder="Selecione a data"
                defaultDate={formData.dataCompra}
                onChange={(selectedDates) => {
                  if (selectedDates && selectedDates.length > 0) {
                    handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
                  }
                }}
              />
              {errors.dataCompra && (
                <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>
              )}
            </div>
            <div>
              <Label htmlFor="quantidade">Quantidade *</Label>
              <Input
                id="quantidade"
                {...integerInputProps}
                placeholder="Ex: 100"
                value={getDecimalInputValue("quantidade")}
                onChange={handleDecimalInputChange("quantidade")}
                error={!!errors.quantidade}
                hint={errors.quantidade}
                min="0"
                step="1"
              />
            </div>
            <div>
              <Label htmlFor="cotacaoUnitaria">Cotação Unitária (R$) *</Label>
              <Input
                id="cotacaoUnitaria"
                {...decimalInputProps}
                placeholder="Ex: 25.50"
                value={getDecimalInputValue("cotacaoUnitaria")}
                onChange={handleDecimalInputChange("cotacaoUnitaria")}
                error={!!errors.cotacaoUnitaria}
                hint={errors.cotacaoUnitaria}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="taxaCorretagem">Taxa de Corretagem (R$)</Label>
              <Input
                id="taxaCorretagem"
                {...decimalInputProps}
                placeholder="Ex: 2.50"
                value={getDecimalInputValue("taxaCorretagem")}
                onChange={handleDecimalInputChange("taxaCorretagem")}
                min="0"
                step="0.01"
              />
            </div>
          </>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          📝 Informações do Investimento
        </h4>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Preencha os dados específicos para o tipo de ativo selecionado. Os campos marcados com * são obrigatórios.
        </p>
      </div>

      {renderFieldsByAssetType()}

      {/* Observações - sempre disponível */}
      <div>
        <Label htmlFor="observacoes">Observações</Label>
        <textarea
          id="observacoes"
          placeholder="Observações adicionais (opcional)"
          value={formData.observacoes}
          onChange={(e) => handleInputChange('observacoes', e.target.value)}
          className="h-24 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
        />
      </div>
    </div>
  );
}
