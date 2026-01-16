"use client";
import React, { useEffect, useState } from "react";
import Sidebar from "@/components/ui/sidebar/Sidebar";
import Button from "@/components/ui/button/Button";
import {
  RedeemWizardFormData,
  RedeemWizardErrors,
  RedeemWizardStep,
} from "@/types/redeemWizard";
import Step1RedeemAssetType from "./redeemWizard/Step1RedeemAssetType";
import Step2RedeemInstitution from "./redeemWizard/Step2RedeemInstitution";
import Step3RedeemAsset from "./redeemWizard/Step3RedeemAsset";
import Step4RedeemInfo from "./redeemWizard/Step4RedeemInfo";
import Step5RedeemConfirmation from "./redeemWizard/Step5RedeemConfirmation";

interface RedeemAssetWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const INITIAL_FORM_DATA: RedeemWizardFormData = {
  tipoAtivo: "",
  instituicao: "",
  instituicaoId: "",
  ativo: "",
  portfolioId: "",
  assetId: "",
  stockId: "",
  moeda: "",
  dataResgate: "",
  metodoResgate: "quantidade",
  quantidade: 0,
  cotacaoUnitaria: 0,
  valorResgate: 0,
  observacoes: "",
  availableQuantity: 0,
  availableTotal: 0,
};

const STEPS: RedeemWizardStep[] = [
  { id: "asset-type", title: "Tipo de Investimento", description: "Selecione o tipo de investimento para resgatar", isValid: false },
  { id: "institution", title: "Instituição", description: "Selecione a instituição financeira", isValid: false },
  { id: "asset", title: "Investimento", description: "Escolha o investimento específico para resgate", isValid: false },
  { id: "info", title: "Informações", description: "Informe os dados do resgate", isValid: false },
  { id: "confirmation", title: "Confirmação", description: "Revise e confirme os dados", isValid: false },
];

export default function RedeemAssetWizard({ isOpen, onClose, onSuccess }: RedeemAssetWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<RedeemWizardFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<RedeemWizardErrors>({});
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<RedeemWizardStep[]>(STEPS);

  useEffect(() => {
    const validateStep4 = (): boolean => {
      if (!formData.dataResgate) return false;

      if (formData.metodoResgate === "quantidade") {
        return (
          formData.quantidade > 0 &&
          formData.quantidade <= formData.availableQuantity &&
          formData.cotacaoUnitaria > 0
        );
      }

      return formData.valorResgate > 0 && formData.valorResgate <= formData.availableTotal;
    };

    setSteps((prevSteps) =>
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
            isValid = !!formData.portfolioId;
            break;
          case "info":
            isValid = validateStep4();
            break;
          case "confirmation":
            isValid = true;
            break;
        }
        return { ...step, isValid };
      })
    );
  }, [formData]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    setCurrentStep(0);
    setFormData(INITIAL_FORM_DATA);
    setErrors({});
    onClose();
  };

  const handleFormDataChange = (newData: Partial<RedeemWizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...newData }));
  };

  const handleErrorsChange = (newErrors: Partial<RedeemWizardErrors>) => {
    setErrors((prev) => ({ ...prev, ...newErrors }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/carteira/resgate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onSuccess();
        handleCancel();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao resgatar investimento:", errorData);
      }
    } catch (error) {
      console.error("Erro ao resgatar investimento:", error);
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

    switch (currentStep) {
      case 0:
        return <Step1RedeemAssetType {...stepProps} />;
      case 1:
        return <Step2RedeemInstitution {...stepProps} />;
      case 2:
        return <Step3RedeemAsset {...stepProps} />;
      case 3:
        return <Step4RedeemInfo {...stepProps} />;
      case 4:
        return <Step5RedeemConfirmation formData={formData} />;
      default:
        return null;
    }
  };

  const canProceed = steps[currentStep]?.isValid || false;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <Sidebar isOpen={isOpen} onClose={handleCancel} title="Resgatar Investimento">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>Passo {currentStep + 1} de {steps.length}</span>
            <span>{Math.round(((currentStep + 1) / steps.length) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-brand-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {steps[currentStep]?.title || ""}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {steps[currentStep]?.description || ""}
          </p>
        </div>

        <div className="min-h-[360px]">
          {renderCurrentStep()}
        </div>

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
              {loading ? "Resgatando..." : "Confirmar"}
            </Button>
          )}
        </div>
      </div>
    </Sidebar>
  );
}
