"use client";
import React, { useEffect } from "react";
import { WizardFormData, WizardErrors, AutocompleteOption, INDEXADORES, PERIODOS, MOEDAS_FIXAS } from "@/types/wizard";
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

  const handleInputChange = (field: keyof WizardFormData, value: string | number) => {
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

  // Calcular valor total automaticamente para alguns tipos
  useEffect(() => {
    if (formData.tipoAtivo === "fii" && formData.quantidade > 0 && formData.cotacaoUnitaria > 0) {
      const valorCalculado = (formData.quantidade * formData.cotacaoUnitaria) + formData.taxaCorretagem;
      onFormDataChange({ valorInvestido: valorCalculado });
    }
  }, [formData.quantidade, formData.cotacaoUnitaria, formData.taxaCorretagem, formData.tipoAtivo, onFormDataChange]);

  const renderFieldsByAssetType = () => {
    switch (formData.tipoAtivo) {
      case "reserva-emergencia":
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
                type="number"
                placeholder="Ex: 10000.00"
                value={formData.valorInvestido}
                onChange={(e) => handleInputChange('valorInvestido', parseFloat(e.target.value) || 0)}
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
                type="number"
                placeholder="Ex: 10000.00"
                value={formData.valorAplicado}
                onChange={(e) => handleInputChange('valorAplicado', parseFloat(e.target.value) || 0)}
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
                type="number"
                placeholder="Ex: 100"
                value={formData.percentualCDI}
                onChange={(e) => handleInputChange('percentualCDI', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
              />
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
                type="number"
                placeholder="Ex: 0.5"
                value={formData.quantidade}
                onChange={(e) => handleInputChange('quantidade', parseFloat(e.target.value) || 0)}
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
                type="number"
                placeholder="Ex: 150000.00"
                value={formData.cotacaoCompra}
                onChange={(e) => handleInputChange('cotacaoCompra', parseFloat(e.target.value) || 0)}
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
              <Label htmlFor="cotacaoCompra">Cotação de Compra (R$) *</Label>
              <Input
                id="cotacaoCompra"
                type="number"
                placeholder="Ex: 5.20"
                value={formData.cotacaoCompra}
                onChange={(e) => handleInputChange('cotacaoCompra', parseFloat(e.target.value) || 0)}
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
                type="number"
                placeholder="Ex: 1000.00"
                value={formData.valorInvestido}
                onChange={(e) => handleInputChange('valorInvestido', parseFloat(e.target.value) || 0)}
                error={!!errors.valorInvestido}
                hint={errors.valorInvestido}
                min="0"
                step="0.01"
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
                type="number"
                placeholder="Ex: 1000"
                value={formData.quantidade}
                onChange={(e) => handleInputChange('quantidade', parseFloat(e.target.value) || 0)}
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
                type="number"
                placeholder="Ex: 10.50"
                value={formData.precoUnitario}
                onChange={(e) => handleInputChange('precoUnitario', parseFloat(e.target.value) || 0)}
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
                  { value: "valor", label: "Por Valor Financeiro" },
                  { value: "percentual", label: "Por Variação Percentual" }
                ]}
                placeholder="Selecione o método"
                defaultValue={formData.metodo}
                onChange={(value) => handleInputChange('metodo', value)}
              />
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
                type="number"
                placeholder="Ex: 5000.00"
                value={formData.valorAplicado}
                onChange={(e) => handleInputChange('valorAplicado', parseFloat(e.target.value) || 0)}
                error={!!errors.valorAplicado}
                hint={errors.valorAplicado}
                min="0"
                step="0.01"
              />
            </div>
          </>
        );

      case "renda-fixa-prefixada":
      case "renda-fixa-posfixada":
        return (
          <>
            <div>
              <AutocompleteInput
                id="emissor"
                label="Emissor *"
                placeholder="Digite o nome do emissor"
                value={formData.emissor}
                onChange={handleEmissorChange}
                onSelect={handleEmissorSelect}
                options={[]}
                loading={false}
                error={!!errors.emissor}
                hint={errors.emissor}
              />
            </div>
            <div>
              <Label htmlFor="periodo">Período *</Label>
              <Select
                options={PERIODOS}
                placeholder="Selecione o período"
                defaultValue={formData.periodo}
                onChange={(value) => handleInputChange('periodo', value)}
                className={errors.periodo ? 'border-red-500' : ''}
              />
              {errors.periodo && (
                <p className="mt-1 text-sm text-red-500">{errors.periodo}</p>
              )}
            </div>
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
                type="number"
                placeholder="Ex: 10000.00"
                value={formData.valorAplicado}
                onChange={(e) => handleInputChange('valorAplicado', parseFloat(e.target.value) || 0)}
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
            <div>
              <Label htmlFor="taxaJurosAnual">Taxa de Juros Anual (%) *</Label>
              <Input
                id="taxaJurosAnual"
                type="number"
                placeholder="Ex: 12.5"
                value={formData.taxaJurosAnual}
                onChange={(e) => handleInputChange('taxaJurosAnual', parseFloat(e.target.value) || 0)}
                error={!!errors.taxaJurosAnual}
                hint={errors.taxaJurosAnual}
                min="0"
                step="0.01"
              />
            </div>
            {formData.tipoAtivo === "renda-fixa-posfixada" && (
              <div>
                <Label htmlFor="indexador">Indexador *</Label>
                <Select
                  options={INDEXADORES}
                  placeholder="Selecione o indexador"
                  defaultValue={formData.indexador}
                  onChange={(value) => handleInputChange('indexador', value)}
                  className={errors.indexador ? 'border-red-500' : ''}
                />
                {errors.indexador && (
                  <p className="mt-1 text-sm text-red-500">{errors.indexador}</p>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                type="text"
                placeholder="Ex: CDB Banco do Brasil 2025"
                value={formData.descricao}
                onChange={(e) => handleInputChange('descricao', e.target.value)}
              />
            </div>
          </>
        );

      case "debenture":
      case "fundo":
      case "previdencia":
      case "tesouro-direto":
        return (
          <>
            <div className="mb-4">
              <Label>Método de Preenchimento *</Label>
              <div className="flex space-x-4 mt-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="metodo"
                    value="valor"
                    checked={formData.metodo === 'valor'}
                    onChange={(e) => handleInputChange('metodo', e.target.value)}
                    className="mr-2"
                  />
                  Por Valor Investido
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="metodo"
                    value="percentual"
                    checked={formData.metodo === 'percentual'}
                    onChange={(e) => handleInputChange('metodo', e.target.value)}
                    className="mr-2"
                  />
                  Por Preço da Cota e Quantidade
                </label>
              </div>
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

            {formData.metodo === 'valor' ? (
              <div>
                <Label htmlFor="valorInvestido">Valor Investido (R$) *</Label>
                <Input
                  id="valorInvestido"
                  type="number"
                  placeholder="Ex: 10000.00"
                  value={formData.valorInvestido}
                  onChange={(e) => handleInputChange('valorInvestido', parseFloat(e.target.value) || 0)}
                  error={!!errors.valorInvestido}
                  hint={errors.valorInvestido}
                  min="0"
                  step="0.01"
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="cotacaoUnitaria">Preço por Cota (R$) *</Label>
                  <Input
                    id="cotacaoUnitaria"
                    type="number"
                    placeholder="Ex: 150.00"
                    value={formData.cotacaoUnitaria}
                    onChange={(e) => handleInputChange('cotacaoUnitaria', parseFloat(e.target.value) || 0)}
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
                    type="number"
                    placeholder="Ex: 100"
                    value={formData.quantidade}
                    onChange={(e) => handleInputChange('quantidade', parseFloat(e.target.value) || 0)}
                    error={!!errors.quantidade}
                    hint={errors.quantidade}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <Label htmlFor="valorInvestido">Total Investido (R$)</Label>
                  <Input
                    id="valorInvestido"
                    type="number"
                    placeholder="Calculado automaticamente"
                    value={formData.quantidade * formData.cotacaoUnitaria}
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
              <Label htmlFor="quantidade">Quantidade de Cotas *</Label>
              <Input
                id="quantidade"
                type="number"
                placeholder="Ex: 100"
                value={formData.quantidade}
                onChange={(e) => handleInputChange('quantidade', parseFloat(e.target.value) || 0)}
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
                type="number"
                placeholder="Ex: 95.50"
                value={formData.cotacaoUnitaria}
                onChange={(e) => handleInputChange('cotacaoUnitaria', parseFloat(e.target.value) || 0)}
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
                type="number"
                placeholder="Ex: 2.50"
                value={formData.taxaCorretagem}
                onChange={(e) => handleInputChange('taxaCorretagem', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="valorInvestido">Total Investido (R$)</Label>
              <Input
                id="valorInvestido"
                type="number"
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

      default:
        // Para ações, BDRs, ETFs, REITs, etc.
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
                type="number"
                placeholder="Ex: 100"
                value={formData.quantidade}
                onChange={(e) => handleInputChange('quantidade', parseFloat(e.target.value) || 0)}
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
                type="number"
                placeholder="Ex: 25.50"
                value={formData.cotacaoUnitaria}
                onChange={(e) => handleInputChange('cotacaoUnitaria', parseFloat(e.target.value) || 0)}
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
                type="number"
                placeholder="Ex: 2.50"
                value={formData.taxaCorretagem}
                onChange={(e) => handleInputChange('taxaCorretagem', parseFloat(e.target.value) || 0)}
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
