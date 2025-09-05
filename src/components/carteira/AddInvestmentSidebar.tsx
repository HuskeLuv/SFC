"use client";
import React, { useState, useEffect } from "react";
import Sidebar from "@/components/ui/sidebar/Sidebar";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import DatePicker from "@/components/form/date-picker";
import AutocompleteInput from "@/components/form/AutocompleteInput";
import Button from "@/components/ui/button/Button";

interface AutocompleteOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface FormData {
  tipoAtivo: string;
  instituicao: string;
  instituicaoId: string;
  ativo: string;
  assetId: string;
  dataCompra: string;
  quantidade: number;
  cotacaoUnitaria: number;
  taxaCorretagem: number;
  valorTotal: number;
  observacoes: string;
}

interface FormErrors {
  tipoAtivo?: string;
  instituicao?: string;
  ativo?: string;
  dataCompra?: string;
  quantidade?: string;
  cotacaoUnitaria?: string;
}

interface AddInvestmentSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TIPOS_ATIVO = [
  { value: "acao", label: "Ação" },
  { value: "fii", label: "FII" },
  { value: "etf", label: "ETF" },
  { value: "bdr", label: "BDR" },
  { value: "reit", label: "REIT" },
  { value: "stock", label: "Stock" },
  { value: "outro", label: "Outro" },
];

export default function AddInvestmentSidebar({
  isOpen,
  onClose,
  onSuccess,
}: AddInvestmentSidebarProps) {
  const [formData, setFormData] = useState<FormData>({
    tipoAtivo: "",
    instituicao: "",
    instituicaoId: "",
    ativo: "",
    assetId: "",
    dataCompra: "",
    quantidade: 0,
    cotacaoUnitaria: 0,
    taxaCorretagem: 0,
    valorTotal: 0,
    observacoes: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [institutionOptions, setInstitutionOptions] = useState<AutocompleteOption[]>([]);
  const [assetOptions, setAssetOptions] = useState<AutocompleteOption[]>([]);
  const [institutionLoading, setInstitutionLoading] = useState(false);
  const [assetLoading, setAssetLoading] = useState(false);

  // Buscar instituições
  const fetchInstitutions = async (search: string) => {
    setInstitutionLoading(true);
    try {
      const response = await fetch(
        `/api/institutions?search=${encodeURIComponent(search)}&limit=20`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setInstitutionOptions(data.institutions);
      }
    } catch (error) {
      console.error('Erro ao buscar instituições:', error);
    } finally {
      setInstitutionLoading(false);
    }
  };

  // Buscar ativos
  const fetchAssets = async (search: string) => {
    setAssetLoading(true);
    try {
      const response = await fetch(
        `/api/assets?search=${encodeURIComponent(search)}&limit=20`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setAssetOptions(data.assets);
      }
    } catch (error) {
      console.error('Erro ao buscar ativos:', error);
    } finally {
      setAssetLoading(false);
    }
  };

  // Calcular valor total automaticamente
  useEffect(() => {
    const valorCalculado = (formData.quantidade * formData.cotacaoUnitaria) + formData.taxaCorretagem;
    setFormData(prev => ({ ...prev, valorTotal: valorCalculado }));
  }, [formData.quantidade, formData.cotacaoUnitaria, formData.taxaCorretagem]);

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpar erro do campo quando usuário começar a digitar
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleInstitutionSelect = (option: AutocompleteOption) => {
    setFormData(prev => ({
      ...prev,
      instituicao: option.label,
      instituicaoId: option.value,
    }));
  };

  const handleAssetSelect = (option: AutocompleteOption) => {
    setFormData(prev => ({
      ...prev,
      ativo: option.label,
      assetId: option.value,
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.tipoAtivo) newErrors.tipoAtivo = "Tipo de ativo é obrigatório";
    if (!formData.instituicaoId) newErrors.instituicao = "Instituição é obrigatória";
    if (!formData.assetId) newErrors.ativo = "Ativo é obrigatório";
    if (!formData.dataCompra) newErrors.dataCompra = "Data da compra é obrigatória";
    if (!formData.quantidade || formData.quantidade <= 0) {
      newErrors.quantidade = "Quantidade deve ser maior que zero";
    }
    if (!formData.cotacaoUnitaria || formData.cotacaoUnitaria <= 0) {
      newErrors.cotacaoUnitaria = "Cotação unitária deve ser maior que zero";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/carteira/operacao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onSuccess();
        onClose();
        // Reset form
        setFormData({
          tipoAtivo: "",
          instituicao: "",
          instituicaoId: "",
          ativo: "",
          assetId: "",
          dataCompra: "",
          quantidade: 0,
          cotacaoUnitaria: 0,
          taxaCorretagem: 0,
          valorTotal: 0,
          observacoes: "",
        });
        setErrors({});
      } else {
        const errorData = await response.json();
        console.error('Erro ao adicionar investimento:', errorData.error);
        // Aqui você pode mostrar uma notificação de erro
      }
    } catch (error) {
      console.error('Erro ao adicionar investimento:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      tipoAtivo: "",
      instituicao: "",
      instituicaoId: "",
      ativo: "",
      assetId: "",
      dataCompra: "",
      quantidade: 0,
      cotacaoUnitaria: 0,
      taxaCorretagem: 0,
      valorTotal: 0,
      observacoes: "",
    });
    setErrors({});
    onClose();
  };

  return (
    <Sidebar
      isOpen={isOpen}
      onClose={handleClose}
      title="Adicionar Investimento"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipo de Ativo */}
        <div>
          <Label>Tipo de Ativo</Label>
          <Select
            options={TIPOS_ATIVO}
            placeholder="Selecione o tipo de ativo"
            onChange={(value) => handleInputChange('tipoAtivo', value)}
            className={errors.tipoAtivo ? 'border-red-500' : ''}
          />
          {errors.tipoAtivo && (
            <p className="mt-1 text-sm text-red-500">{errors.tipoAtivo}</p>
          )}
        </div>

        {/* Instituição */}
        <div>
          <AutocompleteInput
            id="instituicao"
            label="Instituição"
            placeholder="Digite o nome da instituição"
            value={formData.instituicao}
            onChange={(value) => {
              handleInputChange('instituicao', value);
              if (value.length >= 2) {
                fetchInstitutions(value);
              }
            }}
            onSelect={handleInstitutionSelect}
            options={institutionOptions}
            loading={institutionLoading}
            error={!!errors.instituicao}
            hint={errors.instituicao}
          />
        </div>

        {/* Ativo */}
        <div>
          <AutocompleteInput
            id="ativo"
            label="Ativo"
            placeholder="Digite o ticker ou nome do ativo"
            value={formData.ativo}
            onChange={(value) => {
              handleInputChange('ativo', value);
              if (value.length >= 2) {
                fetchAssets(value);
              }
            }}
            onSelect={handleAssetSelect}
            options={assetOptions}
            loading={assetLoading}
            error={!!errors.ativo}
            hint={errors.ativo}
          />
        </div>

        {/* Data da Compra */}
        <div>
          <DatePicker
            id="dataCompra"
            label="Data da Compra"
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

        {/* Quantidade */}
        <div>
          <Label htmlFor="quantidade">Quantidade</Label>
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

        {/* Cotação Unitária */}
        <div>
          <Label htmlFor="cotacaoUnitaria">Cotação Unitária (R$)</Label>
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

        {/* Taxa de Corretagem */}
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

        {/* Valor Total */}
        <div>
          <Label htmlFor="valorTotal">Valor Total Investido (R$)</Label>
          <Input
            id="valorTotal"
            type="number"
            placeholder="Calculado automaticamente"
            value={formData.valorTotal}
            onChange={(e) => handleInputChange('valorTotal', parseFloat(e.target.value) || 0)}
            min="0"
            step="0.01"
          />
          <p className="mt-1 text-xs text-gray-500">
            Calculado automaticamente: (Quantidade × Cotação) + Taxa
          </p>
        </div>

        {/* Observações */}
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

        {/* Botões */}
        <div className="flex space-x-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            className="flex-1"
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={loading}
          >
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Sidebar>
  );
}
