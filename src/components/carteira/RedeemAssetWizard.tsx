'use client';

import { logger } from '@/lib/logger';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from '@/components/ui/sidebar/Sidebar';
import Button from '@/components/ui/button/Button';
import { RedeemWizardFormData, RedeemWizardErrors, RedeemWizardStep } from '@/types/redeemWizard';
import Step1RedeemAssetType from './redeemWizard/Step1RedeemAssetType';
import { useCsrf } from '@/hooks/useCsrf';
import Step2RedeemInstitution from './redeemWizard/Step2RedeemInstitution';
import Step3RedeemAsset from './redeemWizard/Step3RedeemAsset';
import Step4RedeemInfo from './redeemWizard/Step4RedeemInfo';
import Step5RedeemConfirmation from './redeemWizard/Step5RedeemConfirmation';
import { usePriceDeviationWarning } from './wizard/usePriceDeviationWarning';
import {
  CRYPTO_PRICE_DEVIATION_THRESHOLD,
  DEFAULT_PRICE_DEVIATION_THRESHOLD,
} from './wizard/priceDeviationWarning';
import PriceDeviationConfirmModal from './wizard/PriceDeviationConfirmModal';

interface RedeemAssetWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const INITIAL_FORM_DATA: RedeemWizardFormData = {
  tipoAtivo: '',
  instituicao: '',
  instituicaoId: '',
  ativo: '',
  portfolioId: '',
  assetId: '',
  stockId: '',
  moeda: '',
  dataResgate: '',
  metodoResgate: 'quantidade',
  quantidade: 0,
  cotacaoUnitaria: 0,
  valorResgate: 0,
  observacoes: '',
  availableQuantity: 0,
  availableTotal: 0,
};

const STEPS: RedeemWizardStep[] = [
  {
    id: 'asset-type',
    title: 'Tipo de Investimento',
    description: 'Selecione o tipo de investimento para resgatar',
    isValid: false,
  },
  {
    id: 'institution',
    title: 'Instituição',
    description: 'Selecione a instituição financeira',
    isValid: false,
  },
  {
    id: 'asset',
    title: 'Investimento',
    description: 'Escolha o investimento específico para resgate',
    isValid: false,
  },
  { id: 'info', title: 'Informações', description: 'Informe os dados do resgate', isValid: false },
  {
    id: 'confirmation',
    title: 'Confirmação',
    description: 'Revise e confirme os dados',
    isValid: false,
  },
];

/**
 * Tipos com cotação de mercado comparável no resgate por quantidade — mesmo
 * critério do AddAssetWizard (rodada 3, achado frontend #17: a compra tinha
 * checagem de desvio de preço, o resgate não tinha nada e um erro de digitação
 * de cotação ia direto pro custo/fluxo). RF/reservas/personalizado resgatam
 * por valor e ficam de fora.
 */
function getPriceCheckParams(
  formData: RedeemWizardFormData,
): { enteredPrice: number; threshold: number } | null {
  if (formData.metodoResgate !== 'quantidade') return null;
  switch (formData.tipoAtivo) {
    case 'acao':
    case 'fii':
    case 'etf':
    case 'bdr':
    case 'reit':
      return {
        enteredPrice: formData.cotacaoUnitaria,
        threshold: DEFAULT_PRICE_DEVIATION_THRESHOLD,
      };
    case 'criptoativo':
    case 'moeda':
      return {
        enteredPrice: formData.cotacaoUnitaria,
        threshold: CRYPTO_PRICE_DEVIATION_THRESHOLD,
      };
    default:
      return null;
  }
}

export default function RedeemAssetWizard({ isOpen, onClose, onSuccess }: RedeemAssetWizardProps) {
  const { csrfFetch } = useCsrf();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<RedeemWizardFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<RedeemWizardErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [steps, setSteps] = useState<RedeemWizardStep[]>(STEPS);
  const isSubmittingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  // Assinatura do preço já confirmado no popup — mudar preço/data/ativo depois
  // muda a assinatura e o popup reaparece (mesmo padrão do AddAssetWizard).
  const [confirmedPriceSig, setConfirmedPriceSig] = useState<string | null>(null);

  // Divergência entre a cotação digitada e o fechamento da data do resgate.
  // Sem currentPrice pré-carregado no resgate: só o modo histórico
  // (/api/ativos/price-at) emite aviso; sem fechamento, não bloqueia.
  const priceCheck = getPriceCheckParams(formData);
  const priceDeviation = usePriceDeviationWarning({
    enteredPrice: priceCheck?.enteredPrice,
    currentPrice: null,
    threshold: priceCheck?.threshold,
    symbol: priceCheck ? formData.ativo : null,
    referenceDate: priceCheck ? formData.dataResgate : null,
  });

  const hasHistoricClose =
    priceDeviation.warning != null &&
    priceCheck != null &&
    priceDeviation.referencePrice != null &&
    priceDeviation.effectiveDate != null;

  const priceSignature = hasHistoricClose
    ? `${priceCheck!.enteredPrice}|${priceDeviation.referencePrice}|${priceDeviation.effectiveDate}`
    : null;
  const isPriceConfirmed = priceSignature !== null && priceSignature === confirmedPriceSig;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const validateStep4 = (): boolean => {
      if (!formData.dataResgate) return false;

      if (formData.metodoResgate === 'quantidade') {
        return (
          formData.quantidade > 0 &&
          formData.quantidade <= formData.availableQuantity &&
          formData.cotacaoUnitaria > 0
        );
      }

      // Sem teto de availableTotal: é o CUSTO, não o valor de mercado — resgate
      // com rendimento (CDB de 10k que virou 12,4k) é legítimo e encerra a
      // posição no backend (auditoria 2026-08-06, achado #10).
      return formData.valorResgate > 0;
    };

    setSteps((prevSteps) =>
      prevSteps.map((step) => {
        let isValid = false;
        switch (step.id) {
          case 'asset-type':
            isValid = !!formData.tipoAtivo;
            break;
          case 'institution':
            isValid = !!formData.instituicaoId;
            break;
          case 'asset':
            isValid = !!formData.portfolioId;
            break;
          case 'info':
            isValid = validateStep4();
            break;
          case 'confirmation':
            isValid = true;
            break;
        }
        return { ...step, isValid };
      }),
    );
  }, [formData]);

  const handleNext = () => {
    // Ao sair do passo de Informações (índice 3) com divergência de preço não
    // confirmada, abre o popup em vez de avançar (rodada 3, achado #17).
    if (currentStep === 3 && hasHistoricClose && !isPriceConfirmed) {
      setPriceModalOpen(true);
      return;
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleConfirmPrice = () => {
    setConfirmedPriceSig(priceSignature);
    setPriceModalOpen(false);
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setSubmitError(null);
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    setCurrentStep(0);
    setFormData(INITIAL_FORM_DATA);
    setErrors({});
    setSubmitError(null);
    setPriceModalOpen(false);
    setConfirmedPriceSig(null);
    onClose();
  };

  const handleFormDataChange = useCallback((newData: Partial<RedeemWizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...newData }));
  }, []);

  const handleErrorsChange = useCallback((newErrors: Partial<RedeemWizardErrors>) => {
    setErrors((prev) => ({ ...prev, ...newErrors }));
  }, []);

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoading(true);
    setSubmitError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await csrfFetch('/api/carteira/resgate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        signal: controller.signal,
      });

      if (response.ok) {
        onSuccess();
        handleCancel();
      } else {
        // Auditoria 2026-08-06 (achado #5): o erro era só logado — usuário
        // ficava preso na confirmação clicando sem nenhum feedback.
        const errorData = await response.json().catch(() => ({}));
        setSubmitError(
          typeof errorData?.error === 'string'
            ? errorData.error
            : 'Não foi possível registrar o resgate. Tente novamente.',
        );
        logger.error('Erro ao resgatar investimento:', errorData);
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      setSubmitError(
        'Falha de rede ao registrar o resgate. Verifique a conexão e tente novamente.',
      );
      logger.error('Erro ao resgatar investimento:', error);
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
    <Sidebar isOpen={isOpen} onClose={handleCancel} title="Resgatar Investimento" noBackdrop>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>
              Passo {currentStep + 1} de {steps.length}
            </span>
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
            {steps[currentStep]?.title || ''}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {steps[currentStep]?.description || ''}
          </p>
        </div>

        <div className="min-h-[360px]">{renderCurrentStep()}</div>

        {submitError && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
            {submitError}
          </div>
        )}

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
            <Button type="button" onClick={handleSubmit} className="flex-1" disabled={loading}>
              {loading ? 'Resgatando...' : 'Confirmar'}
            </Button>
          )}
        </div>
      </div>

      {hasHistoricClose && (
        <PriceDeviationConfirmModal
          isOpen={priceModalOpen}
          enteredPrice={priceCheck!.enteredPrice}
          referencePrice={priceDeviation.referencePrice!}
          effectiveDate={priceDeviation.effectiveDate!}
          ratio={priceDeviation.warning!.ratio}
          direction={priceDeviation.warning!.direction}
          onConfirm={handleConfirmPrice}
          onCancel={() => setPriceModalOpen(false)}
        />
      )}
    </Sidebar>
  );
}
