"use client";
import React, { useState, useEffect } from "react";
import Sidebar from "@/components/ui/sidebar/Sidebar";
import Button from "@/components/ui/button/Button";
import { WizardFormData, WizardErrors, WizardStep } from "@/types/wizard";
import Step1AssetType from "./wizard/Step1AssetType";
import Step2Institution from "./wizard/Step2Institution";
import Step3Asset from "./wizard/Step3Asset";
import Step4AssetInfo from "./wizard/Step4AssetInfo";
import Step5Confirmation from "./wizard/Step5Confirmation";

interface AddAssetWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const INITIAL_FORM_DATA: WizardFormData = {
  tipoAtivo: "",
  instituicao: "",
  instituicaoId: "",
  ativo: "",
  assetId: "",
  dataCompra: "",
  dataInicio: "",
  dataVencimento: "",
  quantidade: 0,
  cotacaoUnitaria: 0,
  cotacaoCompra: 0,
  valorInvestido: 0,
  valorAplicado: 0,
  taxaCorretagem: 0,
  taxaJurosAnual: 0,
  percentualCDI: 0,
  indexador: "",
  emissor: "",
  emissorId: "",
  periodo: "",
  descricao: "",
  observacoes: "",
  metodo: 'valor',
  moeda: "",
  nomePersonalizado: "",
  precoUnitario: 0,
  cotizacaoResgate: "",
  liquidacaoResgate: "",
  vencimento: "",
  benchmark: "",
  estrategia: "",
  tipoFii: "",
};

const STEPS: WizardStep[] = [
  { id: "asset-type", title: "Tipo de Ativo", description: "Escolha o tipo de ativo que deseja adicionar", isValid: false },
  { id: "institution", title: "Instituição", description: "Selecione a instituição financeira", isValid: false },
  { id: "asset", title: "Ativo", description: "Escolha o ativo específico", isValid: false },
  { id: "info", title: "Informações", description: "Preencha os dados do investimento", isValid: false },
  { id: "confirmation", title: "Confirmação", description: "Revise e confirme os dados", isValid: false },
];

export default function AddAssetWizard({ isOpen, onClose, onSuccess }: AddAssetWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<WizardFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<WizardErrors>({});
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<WizardStep[]>(STEPS);

  // Atualizar validação dos passos
  useEffect(() => {
    const validateStep4 = (): boolean => {
      const { tipoAtivo, dataCompra, dataInicio } = formData;
      
      // Validação básica - cada tipo terá validações específicas
      if (tipoAtivo === "reserva-emergencia" || tipoAtivo === "reserva-oportunidade") {
        return !!(
          dataCompra && 
          formData.valorInvestido > 0 &&
          formData.cotizacaoResgate &&
          formData.liquidacaoResgate &&
          formData.vencimento &&
          formData.benchmark
        );
      }
      
      if (tipoAtivo === "conta-corrente" || tipoAtivo === "poupanca") {
        return !!(dataInicio && formData.valorAplicado > 0);
      }
      
      if (tipoAtivo === "criptoativo") {
        return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoCompra > 0);
      }
      
      if (tipoAtivo === "moeda") {
        return !!(dataCompra && formData.moeda && formData.cotacaoCompra > 0 && formData.valorInvestido > 0);
      }
      
      if (tipoAtivo === "personalizado") {
        return !!(dataInicio && formData.nomePersonalizado && formData.quantidade > 0 && formData.precoUnitario > 0 && formData.metodo);
      }
      
      if (tipoAtivo === "renda-fixa-prefixada" || tipoAtivo === "renda-fixa-posfixada") {
        return !!(dataInicio && formData.emissorId && formData.periodo && formData.valorAplicado > 0 && formData.taxaJurosAnual > 0);
      }
      
      if (tipoAtivo === "tesouro-direto" || tipoAtivo === "debenture" || tipoAtivo === "fundo" || tipoAtivo === "previdencia") {
        return !!(dataCompra && formData.valorInvestido > 0);
      }
      
      if (tipoAtivo === "fii") {
        return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoUnitaria > 0 && formData.taxaCorretagem >= 0 && formData.tipoFii);
      }
      
      if (tipoAtivo === "acao") {
        return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoUnitaria > 0 && formData.estrategia);
      }
      
      // Para BDRs, ETFs, REITs, etc.
      return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoUnitaria > 0);
    };

    setSteps(prevSteps => 
      prevSteps.map((step) => {
        let isValid = false;
        
        switch (step.id) {
          case "asset-type":
            isValid = !!formData.tipoAtivo;
            break;
          case "institution":
            isValid = !!formData.instituicaoId;
            break;
          case "asset":
            // Para reserva de emergência, oportunidade e personalizado, o assetId será um placeholder
            isValid = !!formData.assetId || formData.tipoAtivo === "reserva-emergencia" || formData.tipoAtivo === "reserva-oportunidade" || formData.tipoAtivo === "personalizado";
            break;
          case "info":
            isValid = validateStep4();
            break;
          case "confirmation":
            isValid = true; // Sempre válido no último passo
            break;
        }
        
        return { ...step, isValid };
      })
    );
  }, [formData]);


  const handleNext = () => {
    // Para ativos personalizados, pular o passo 3 (Step3Asset)
    const isPersonalizado = formData.tipoAtivo === "personalizado";
    
    if (isPersonalizado && currentStep === 2) {
      // Do passo 2 (institution) pular para passo 4 (info)
      setCurrentStep(3);
    } else if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    // Para ativos personalizados, pular o passo 3 (Step3Asset)
    const isPersonalizado = formData.tipoAtivo === "personalizado";
    
    if (isPersonalizado && currentStep === 3) {
      // Do passo 4 (info) voltar para passo 2 (institution)
      setCurrentStep(1);
    } else if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    setCurrentStep(0);
    setFormData(INITIAL_FORM_DATA);
    setErrors({});
    onClose();
  };

  const handleFormDataChange = (newData: Partial<WizardFormData>) => {
    setFormData(prev => ({ ...prev, ...newData }));
  };

  const handleErrorsChange = (newErrors: Partial<WizardErrors>) => {
    setErrors(prev => ({ ...prev, ...newErrors }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Converter 'reserva-emergencia' e 'reserva-oportunidade' para o formato da API
      const apiFormData = { ...formData };
      if (apiFormData.tipoAtivo === "reserva-emergencia") {
        apiFormData.tipoAtivo = "emergency" as any;
        // Ajustar campos para formato esperado pela API
        apiFormData.quantidade = 1;
        apiFormData.cotacaoUnitaria = apiFormData.valorInvestido;
      } else if (apiFormData.tipoAtivo === "reserva-oportunidade") {
        apiFormData.tipoAtivo = "opportunity" as any;
        // Ajustar campos para formato esperado pela API
        apiFormData.quantidade = 1;
        apiFormData.cotacaoUnitaria = apiFormData.valorInvestido;
      }
      
      const response = await fetch('/api/carteira/operacao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(apiFormData),
      });

      if (response.ok) {
        onSuccess();
        handleCancel();
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.error || errorData.message || 'Erro desconhecido';
        console.error('Erro ao adicionar investimento:', errorMessage);
        if (errorData.details) {
          console.error('Detalhes do erro:', errorData.details);
        }
        // Aqui você pode mostrar uma notificação de erro
      }
    } catch (error) {
      console.error('Erro ao adicionar investimento:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderCurrentStep = () => {
    const stepProps = {
      formData,
      errors,
      onFormDataChange: handleFormDataChange,
      onErrorsChange: handleErrorsChange,
    };

    const isPersonalizado = formData.tipoAtivo === "personalizado";

    switch (currentStep) {
      case 0:
        return <Step1AssetType {...stepProps} />;
      case 1:
        return <Step2Institution {...stepProps} />;
      case 2:
        // Para personalizado, pular Step3Asset e ir direto para Step4AssetInfo
        if (isPersonalizado) {
          return <Step4AssetInfo {...stepProps} />;
        }
        return <Step3Asset {...stepProps} />;
      case 3:
        // Para personalizado, este é o Step5Confirmation
        if (isPersonalizado) {
          return <Step5Confirmation {...stepProps} onSubmit={handleSubmit} loading={loading} autoSubmit={true} />;
        }
        return <Step4AssetInfo {...stepProps} />;
      case 4:
        // Auto-submit apenas para personalizado, reserva-emergencia e reserva-oportunidade
        const shouldAutoSubmit = formData.tipoAtivo === "personalizado" || 
                                 formData.tipoAtivo === "reserva-emergencia" || 
                                 formData.tipoAtivo === "reserva-oportunidade";
        return <Step5Confirmation {...stepProps} onSubmit={handleSubmit} loading={loading} autoSubmit={shouldAutoSubmit} />;
      default:
        return null;
    }
  };

  const isPersonalizado = formData.tipoAtivo === "personalizado";
  
  const canProceed = (() => {
    // Para personalizado, ajustar validação dos passos
    if (isPersonalizado) {
      if (currentStep === 0) return steps[0]?.isValid || false;
      if (currentStep === 1) return steps[1]?.isValid || false;
      if (currentStep === 2) return steps[3]?.isValid || false; // Info (step 3 no array)
      if (currentStep === 3) return true; // Confirmation sempre válido
    }
    return steps[currentStep]?.isValid || false;
  })();
  
  const isLastStep = isPersonalizado ? currentStep === 3 : currentStep === steps.length - 1;

  return (
    <Sidebar
      isOpen={isOpen}
      onClose={handleCancel}
      title="Adicionar Ativo à Carteira"
    >
      <div className="space-y-6">
        {/* Progress Indicator */}
        {(() => {
          const isPersonalizado = formData.tipoAtivo === "personalizado";
          const totalSteps = isPersonalizado ? 4 : 5;
          const currentStepNumber = isPersonalizado 
            ? (currentStep === 0 ? 1 : currentStep === 1 ? 2 : currentStep === 2 ? 3 : 4)
            : currentStep + 1;
          
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Passo {currentStepNumber} de {totalSteps}</span>
                <span>{Math.round((currentStepNumber / totalSteps) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(currentStepNumber / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          );
        })()}

        {/* Step Title */}
        {(() => {
          const isPersonalizado = formData.tipoAtivo === "personalizado";
          let stepTitle = "";
          let stepDescription = "";
          
          if (isPersonalizado) {
            if (currentStep === 0) {
              stepTitle = steps[0].title;
              stepDescription = steps[0].description;
            } else if (currentStep === 1) {
              stepTitle = steps[1].title;
              stepDescription = steps[1].description;
            } else if (currentStep === 2) {
              stepTitle = steps[3].title; // Info
              stepDescription = steps[3].description;
            } else if (currentStep === 3) {
              stepTitle = steps[4].title; // Confirmation
              stepDescription = steps[4].description;
            }
          } else {
            stepTitle = steps[currentStep]?.title || "";
            stepDescription = steps[currentStep]?.description || "";
          }
          
          return (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {stepTitle}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {stepDescription}
              </p>
            </div>
          );
        })()}

        {/* Step Content */}
        <div className="min-h-[400px]">
          {renderCurrentStep()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="flex-1"
            disabled={loading}
          >
            Cancelar
          </Button>
          
          {currentStep > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevious}
              className="flex-1"
              disabled={loading}
            >
              Voltar
            </Button>
          )}
          
          {!isLastStep ? (
            <Button
              type="button"
              onClick={handleNext}
              className="flex-1"
              disabled={!canProceed || loading}
            >
              Avançar
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              className="flex-1"
              disabled={loading}
            >
              {loading ? "Salvando..." : "Confirmar"}
            </Button>
          )}
        </div>
      </div>
    </Sidebar>
  );
}
