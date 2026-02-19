"use client";
import React, { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/ui/sidebar/Sidebar";
import Button from "@/components/ui/button/Button";
import { WizardFormData, WizardErrors, WizardStep } from "@/types/wizard";
import Step1AssetType from "./wizard/Step1AssetType";
import Step2Institution from "./wizard/Step2Institution";
import Step3Asset from "./wizard/Step3Asset";
import Step4AssetInfo from "./wizard/Step4AssetInfo";
import Step5Confirmation from "./wizard/Step5Confirmation";
import Step2AporteInstitution from "./wizard/Step2AporteInstitution";
import Step3AporteAsset from "./wizard/Step3AporteAsset";
import Step4AporteInfo from "./wizard/Step4AporteInfo";
import Step5AporteConfirmation from "./wizard/Step5AporteConfirmation";

interface AddAssetWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const INITIAL_FORM_DATA: WizardFormData = {
  operacao: "compra",
  tipoAtivo: "",
  rendaFixaTipo: "",
  rendaFixaIndexer: "",
  rendaFixaIndexerPercent: 0,
  rendaFixaLiquidity: "",
  rendaFixaTaxExempt: false,
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
  cotacaoMoeda: 0,
  valorInvestido: 0,
  valorAplicado: 0,
  taxaCorretagem: 0,
  taxaJurosAnual: 0,
  taxaFixaAnual: 0,
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
  tipoDebenture: undefined,
  tipoFundo: undefined,
  estrategiaReit: undefined,
  contaCorrenteDestino: undefined,
  portfolioId: "",
  dataAporte: "",
  valorAporte: 0,
  availableQuantity: 0,
  availableTotal: 0,
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
  const isSubmittingRef = useRef(false);

  // Atualizar validação dos passos
  useEffect(() => {
    const validateStep4 = (): boolean => {
      const { tipoAtivo, dataCompra, dataInicio } = formData;
      if (formData.operacao === "aporte") {
        return !!(formData.dataAporte && formData.valorAporte > 0);
      }
      
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
      
      if (tipoAtivo === "conta-corrente") {
        return !!(dataInicio && formData.valorAplicado > 0 && formData.contaCorrenteDestino);
      }
      if (tipoAtivo === "poupanca") {
        return !!(dataInicio && formData.valorAplicado > 0);
      }
      
      if (tipoAtivo === "criptoativo") {
        return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoCompra > 0);
      }
      
      if (tipoAtivo === "moeda") {
        return !!(
          dataCompra &&
          formData.assetId &&
          formData.quantidade > 0 &&
          formData.cotacaoCompra > 0
        );
      }
      
      if (tipoAtivo === "personalizado") {
        return !!(dataInicio && formData.nomePersonalizado && formData.quantidade > 0 && formData.precoUnitario > 0 && formData.metodo);
      }
      
      if (tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada" || tipoAtivo === "renda-fixa-hibrida") {
        const dataInicioParsed = dataInicio ? new Date(dataInicio) : null;
        const dataVencimentoParsed = formData.dataVencimento ? new Date(formData.dataVencimento) : null;
        const hasValidDates = !!(
          dataInicioParsed &&
          dataVencimentoParsed &&
          Number.isFinite(dataInicioParsed.getTime()) &&
          Number.isFinite(dataVencimentoParsed.getTime()) &&
          dataInicioParsed.getTime() < dataVencimentoParsed.getTime()
        );
        const isTaxaJurosValida = formData.taxaJurosAnual > 0 && formData.taxaJurosAnual <= 1000;
        const isTaxaFixaValida = tipoAtivo !== "renda-fixa-hibrida" || ((formData.taxaFixaAnual ?? 0) > 0 && (formData.taxaFixaAnual ?? 0) <= 1000);
        const isIndexerPercentValid = !formData.rendaFixaIndexerPercent || (formData.rendaFixaIndexerPercent >= 0 && formData.rendaFixaIndexerPercent <= 1000);
        const isIndexerValid = tipoAtivo === "renda-fixa"
          ? true
          : !!formData.rendaFixaIndexer && ["CDI", "IPCA"].includes(formData.rendaFixaIndexer);

        return !!(
          formData.rendaFixaTipo &&
          dataInicio &&
          formData.valorAplicado > 0 &&
          isTaxaJurosValida &&
          isTaxaFixaValida &&
          formData.descricao &&
          hasValidDates &&
          isIndexerPercentValid &&
          isIndexerValid
        );
      }
      
      if (tipoAtivo === "tesouro-direto" || tipoAtivo === "debenture" || tipoAtivo === "fundo" || tipoAtivo === "previdencia") {
        const metodoValor = formData.metodo === 'valor' || !formData.metodo;
        const metodoCotas = formData.metodo === 'cotas' || formData.metodo === 'percentual';
        const debentureTipoRequired = tipoAtivo === "debenture" && !!formData.tipoDebenture;
        const fundoTipoRequired = tipoAtivo === "fundo" && !!formData.tipoFundo;
        if (metodoCotas) {
          return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoUnitaria > 0 && (tipoAtivo !== "debenture" || debentureTipoRequired) && (tipoAtivo !== "fundo" || fundoTipoRequired));
        }
        return !!(dataCompra && formData.valorInvestido > 0 && (tipoAtivo !== "debenture" || debentureTipoRequired) && (tipoAtivo !== "fundo" || fundoTipoRequired));
      }
      
      if (tipoAtivo === "fii") {
        return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoUnitaria > 0 && formData.taxaCorretagem >= 0 && formData.tipoFii);
      }
      
      if (tipoAtivo === "acao") {
        return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoUnitaria > 0 && formData.estrategia);
      }

      if (tipoAtivo === "stock") {
        return !!(
          dataCompra &&
          formData.quantidade > 0 &&
          formData.cotacaoUnitaria > 0 &&
          formData.moeda &&
          formData.cotacaoMoeda > 0 &&
          formData.estrategia
        );
      }

      if (tipoAtivo === "reit") {
        return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoUnitaria > 0 && formData.estrategiaReit);
      }
      
      // Para BDRs, ETFs, etc.
      return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoUnitaria > 0);
    };

    if (formData.tipoAtivo === "debenture") {
      setErrors(prev => ({
        ...prev,
        tipoDebenture: !formData.tipoDebenture ? "Selecione o tipo de debênture (Pré, Pós ou Híbrida)" : undefined,
      }));
    }
    if (formData.tipoAtivo === "fundo") {
      setErrors(prev => ({
        ...prev,
        tipoFundo: !formData.tipoFundo ? "Selecione o tipo de fundo (FIM ou FIA)" : undefined,
      }));
    }
    if (formData.tipoAtivo === "reit") {
      setErrors(prev => ({
        ...prev,
        estrategiaReit: !formData.estrategiaReit ? "Selecione o tipo de investimento (Value, Growth ou Risk)" : undefined,
      }));
    }
    if (formData.tipoAtivo === "stock") {
      setErrors(prev => ({
        ...prev,
        estrategia: !formData.estrategia ? "Selecione a estratégia (Value, Growth ou Risk)" : undefined,
      }));
    }

    setSteps(prevSteps => 
      prevSteps.map((step) => {
        let isValid = false;
        
        switch (step.id) {
          case "asset-type":
            isValid = !!formData.operacao && !!formData.tipoAtivo;
            break;
          case "institution":
            isValid = !!formData.instituicaoId;
            break;
          case "asset":
            if (formData.operacao === "aporte") {
              isValid = !!formData.portfolioId;
            } else {
              if (formData.tipoAtivo === "renda-fixa" || formData.tipoAtivo === "renda-fixa-posfixada" || formData.tipoAtivo === "renda-fixa-hibrida") {
                isValid = !!formData.rendaFixaTipo;
              } else if (formData.tipoAtivo === "conta-corrente") {
                isValid = true;
              } else if (formData.tipoAtivo === "debenture") {
                isValid = !!(formData.ativo?.trim() && formData.assetId === "DEBENTURE-MANUAL");
              } else if (formData.tipoAtivo === "fundo") {
                isValid = !!(formData.ativo?.trim() && formData.assetId === "FUNDO-MANUAL");
              } else if (formData.tipoAtivo === "reit") {
                isValid = !!(formData.ativo?.trim() && formData.assetId === "REIT-MANUAL");
              } else {
                isValid = !!formData.assetId || formData.tipoAtivo === "reserva-emergencia" || formData.tipoAtivo === "reserva-oportunidade" || formData.tipoAtivo === "personalizado";
              }
            }
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
    const skipStep3 = formData.tipoAtivo === "personalizado" || formData.tipoAtivo === "conta-corrente";

    if (skipStep3 && currentStep === 2) {
      setCurrentStep(3);
    } else if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    const skipStep3 = formData.tipoAtivo === "personalizado" || formData.tipoAtivo === "conta-corrente";

    if (skipStep3 && currentStep === 3) {
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
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setLoading(true);
    try {
      if (formData.operacao === "aporte") {
        const response = await fetch('/api/carteira/aporte', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            portfolioId: formData.portfolioId,
            dataAporte: formData.dataAporte,
            valorAporte: formData.valorAporte,
            tipoAtivo: formData.tipoAtivo,
            instituicaoId: formData.instituicaoId,
          }),
        });

        if (response.ok) {
          onSuccess();
          handleCancel();
        } else {
          const errorData = await response.json();
          const errorMessage = errorData.error || errorData.message || 'Erro desconhecido';
          console.error('Erro ao realizar aporte:', errorMessage);
        }
        return;
      }

      // Converter 'reserva-emergencia' e 'reserva-oportunidade' para o formato da API
      const apiFormData = { ...formData };
      if (apiFormData.tipoAtivo === "renda-fixa") {
        apiFormData.rendaFixaIndexer = apiFormData.rendaFixaIndexer || "PRE";
      }
      if (apiFormData.tipoAtivo === "reserva-emergencia") {
        apiFormData.tipoAtivo = "emergency" as any;
        apiFormData.quantidade = 1;
        apiFormData.cotacaoUnitaria = apiFormData.valorInvestido;
      } else if (apiFormData.tipoAtivo === "reserva-oportunidade") {
        apiFormData.tipoAtivo = "opportunity" as any;
        apiFormData.quantidade = 1;
        apiFormData.cotacaoUnitaria = apiFormData.valorInvestido;
      } else if ((apiFormData.tipoAtivo === "debenture" || apiFormData.tipoAtivo === "fundo") && (apiFormData.metodo === 'cotas' || apiFormData.metodo === 'percentual')) {
        apiFormData.valorInvestido = apiFormData.quantidade * apiFormData.cotacaoUnitaria;
      } else if (apiFormData.tipoAtivo === "reit") {
        apiFormData.valorInvestido = apiFormData.quantidade * apiFormData.cotacaoUnitaria;
      } else if ((apiFormData.tipoAtivo === "tesouro-direto" || apiFormData.tipoAtivo === "previdencia") && (apiFormData.metodo === 'cotas' || apiFormData.metodo === 'percentual')) {
        apiFormData.valorInvestido = apiFormData.quantidade * apiFormData.cotacaoUnitaria;
      } else if (apiFormData.tipoAtivo === "moeda") {
        apiFormData.valorInvestido = apiFormData.quantidade * apiFormData.cotacaoCompra;
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
      isSubmittingRef.current = false;
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
    const isContaCorrente = formData.tipoAtivo === "conta-corrente";
    const skipStep3 = isPersonalizado || isContaCorrente;
    const isAporte = formData.operacao === "aporte";

    switch (currentStep) {
      case 0:
        return <Step1AssetType {...stepProps} />;
      case 1:
        return isAporte ? <Step2AporteInstitution {...stepProps} /> : <Step2Institution {...stepProps} />;
      case 2:
        if (skipStep3) {
          return <Step4AssetInfo {...stepProps} />;
        }
        return isAporte ? <Step3AporteAsset {...stepProps} /> : <Step3Asset {...stepProps} />;
      case 3:
        if (skipStep3) {
          return <Step5Confirmation {...stepProps} onSubmit={handleSubmit} loading={loading} autoSubmit={isPersonalizado} />;
        }
        return isAporte ? <Step4AporteInfo {...stepProps} /> : <Step4AssetInfo {...stepProps} />;
      case 4:
        if (isAporte) {
          return <Step5AporteConfirmation {...stepProps} />;
        }
        // Auto-submit apenas para personalizado
        const shouldAutoSubmit = formData.tipoAtivo === "personalizado";
        return <Step5Confirmation {...stepProps} onSubmit={handleSubmit} loading={loading} autoSubmit={shouldAutoSubmit} />;
      default:
        return null;
    }
  };

  const skipStep3 = formData.tipoAtivo === "personalizado" || formData.tipoAtivo === "conta-corrente";

  const canProceed = (() => {
    if (skipStep3) {
      if (currentStep === 0) return steps[0]?.isValid || false;
      if (currentStep === 1) return steps[1]?.isValid || false;
      if (currentStep === 2) return steps[3]?.isValid || false;
      if (currentStep === 3) return true;
    }
    return steps[currentStep]?.isValid || false;
  })();

  const isLastStep = skipStep3 ? currentStep === 3 : currentStep === steps.length - 1;

  return (
    <Sidebar
      isOpen={isOpen}
      onClose={handleCancel}
      title="Adicionar Ativo à Carteira"
    >
      <div className="space-y-6">
        {/* Progress Indicator */}
        {(() => {
          const totalSteps = skipStep3 ? 4 : 5;
          const currentStepNumber = skipStep3
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
          let stepTitle = "";
          let stepDescription = "";
          
          if (skipStep3) {
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
