'use client';

import { logger } from '@/lib/logger';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import Sidebar from '@/components/ui/sidebar/Sidebar';
import Button from '@/components/ui/button/Button';
import { WizardFormData, WizardErrors, WizardStep } from '@/types/wizard';
import Step1AssetType from './wizard/Step1AssetType';
import Step2Institution from './wizard/Step2Institution';
import Step3Asset from './wizard/Step3Asset';
import Step4AssetInfo from './wizard/Step4AssetInfo';
import Step5Confirmation from './wizard/Step5Confirmation';
import { useCsrf } from '@/hooks/useCsrf';
import Step2AporteInstitution from './wizard/Step2AporteInstitution';
import Step3AporteAsset from './wizard/Step3AporteAsset';
import Step4AporteInfo from './wizard/Step4AporteInfo';
import Step5AporteConfirmation from './wizard/Step5AporteConfirmation';
import { usePriceDeviationWarning } from './wizard/usePriceDeviationWarning';
import {
  DEFAULT_PRICE_DEVIATION_THRESHOLD,
  CRYPTO_PRICE_DEVIATION_THRESHOLD,
  computeSplitScaleHint,
} from './wizard/priceDeviationWarning';
import PriceDeviationConfirmModal from './wizard/PriceDeviationConfirmModal';

interface AddAssetWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const INITIAL_FORM_DATA: WizardFormData = {
  operacao: 'compra',
  tipoAtivo: '',
  rendaFixaTipo: '',
  rendaFixaVariante: '',
  rendaFixaIndexer: '',
  // F1.6: campo removido da UI; sempre 100% (cobre ~95% dos casos práticos)
  rendaFixaIndexerPercent: 100,
  rendaFixaLiquidity: '',
  rendaFixaTaxExempt: false,
  instituicao: '',
  instituicaoId: '',
  ativo: '',
  assetId: '',
  dataCompra: '',
  dataInicio: '',
  dataVencimento: '',
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
  indexador: '',
  emissor: '',
  emissorId: '',
  periodo: '',
  descricao: '',
  observacoes: '',
  metodo: 'valor',
  moeda: '',
  nomePersonalizado: '',
  precoUnitario: 0,
  cotizacaoResgate: '',
  liquidacaoResgate: '',
  vencimento: '',
  benchmark: '',
  estrategia: '',
  tipoFii: '',
  tipoDebenture: undefined,
  tipoFundo: undefined,
  estrategiaReit: undefined,
  contaCorrenteDestino: undefined,
  tesouroDestino: undefined,
  fundoDestino: undefined,
  fundoRendaFixaTipo: undefined,
  opcaoTipo: undefined,
  opcaoCompraVenda: undefined,
  isReinvestimento: false,
  vinculoTipo: null,
  vinculoObjetivoId: null,
  portfolioId: '',
  dataAporte: '',
  valorAporte: 0,
  availableQuantity: 0,
  availableTotal: 0,
};

const STEPS: WizardStep[] = [
  {
    id: 'asset-type',
    title: 'Tipo de Ativo',
    description: 'Escolha o tipo de ativo que deseja adicionar',
    isValid: false,
  },
  {
    id: 'institution',
    title: 'Instituição',
    description: 'Selecione a instituição financeira',
    isValid: false,
  },
  { id: 'asset', title: 'Ativo', description: 'Escolha o ativo específico', isValid: false },
  {
    id: 'info',
    title: 'Informações',
    description: 'Preencha os dados do investimento',
    isValid: false,
  },
  {
    id: 'confirmation',
    title: 'Confirmação',
    description: 'Revise e confirme os dados',
    isValid: false,
  },
];

/**
 * Passos visíveis para o estado atual do formulário. Fluxos de compra com
 * asset manual (personalizado, imóvel, conta-corrente, poupança) pulam o
 * passo "Ativo"; Imóveis & Bens também pula "Instituição" — é patrimônio,
 * não investimento custodiado (ticket 27/08/2026). O fluxo de aporte usa
 * sempre os 5 passos (o tipo vem de /api/carteira/aporte/tipos e o passo
 * "Ativo" é a escolha da posição existente).
 */
function getVisibleStepIds(formData: WizardFormData): string[] {
  if (formData.operacao === 'aporte') {
    return STEPS.map((step) => step.id);
  }
  const skipAssetStep =
    formData.tipoAtivo === 'personalizado' ||
    formData.tipoAtivo === 'imovel' ||
    formData.tipoAtivo === 'conta-corrente' ||
    formData.tipoAtivo === 'poupanca';
  const skipInstitutionStep = formData.tipoAtivo === 'imovel';
  return STEPS.map((step) => step.id).filter(
    (id) => !(id === 'asset' && skipAssetStep) && !(id === 'institution' && skipInstitutionStep),
  );
}

/**
 * Mapeia o tipo de ativo para os parâmetros de checagem de divergência de
 * preço, espelhando exatamente o que o PriceDeviationHint usa em cada
 * Step4*Fields (ações/FII/ETF usam cotacaoUnitaria + threshold padrão;
 * cripto/moeda usam cotacaoCompra + threshold mais frouxo). Retorna null
 * para tipos sem cotação de mercado comparável.
 */
function getPriceCheckParams(
  formData: WizardFormData,
): { enteredPrice: number; threshold: number } | null {
  switch (formData.tipoAtivo) {
    case 'acao':
    case 'acoes-brasil':
    case 'fii':
    case 'etf':
      return {
        enteredPrice: formData.cotacaoUnitaria,
        threshold: DEFAULT_PRICE_DEVIATION_THRESHOLD,
      };
    case 'criptoativo':
    case 'moeda':
      return {
        enteredPrice: formData.cotacaoCompra,
        threshold: CRYPTO_PRICE_DEVIATION_THRESHOLD,
      };
    default:
      return null;
  }
}

export default function AddAssetWizard({ isOpen, onClose, onSuccess }: AddAssetWizardProps) {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  // A operação pode refletir no fluxo de caixa (Aporte/Resgate e, com vínculo
  // de sonho, o realizado da linha-espelho) e no planejamento — invalida junto.
  const invalidatePlanejamentoCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.planejamento.all });
    queryClient.invalidateQueries({ queryKey: ['planejamento-sonhos'] });
  }, [queryClient]);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<WizardFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<WizardErrors>({});
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<WizardStep[]>(STEPS);
  const isSubmittingRef = useRef(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  // Assinatura do preço já confirmado no popup. Se o usuário mudar
  // preço/data/ativo depois, a assinatura muda e o popup reaparece.
  const [confirmedPriceSig, setConfirmedPriceSig] = useState<string | null>(null);

  // Divergência entre a cotação digitada e o fechamento da data de compra.
  // Só vale para tipos com cotação de mercado (ações/FII/ETF/cripto/moeda).
  const priceCheck = formData.operacao === 'aporte' ? null : getPriceCheckParams(formData);
  const priceDeviation = usePriceDeviationWarning({
    enteredPrice: priceCheck?.enteredPrice,
    currentPrice: formData.assetCurrentPrice,
    threshold: priceCheck?.threshold,
    symbol: priceCheck ? formData.ativo : null,
    referenceDate: priceCheck ? formData.dataCompra : null,
  });

  // Só pedimos confirmação quando temos o fechamento histórico do dia da
  // compra (price-at retornou dados). Sem ele não há "preço de fechamento
  // daquele dia" pra mostrar — aí o hint inline basta, sem bloquear.
  const hasHistoricClose =
    priceDeviation.warning != null &&
    priceCheck != null &&
    priceDeviation.referencePrice != null &&
    priceDeviation.effectiveDate != null;

  const priceSignature = hasHistoricClose
    ? `${priceCheck!.enteredPrice}|${priceDeviation.referencePrice}|${priceDeviation.effectiveDate}`
    : null;
  const isPriceConfirmed = priceSignature !== null && priceSignature === confirmedPriceSig;

  // Atualizar validação dos passos
  useEffect(() => {
    const validateStep4 = (): boolean => {
      const { tipoAtivo, dataCompra, dataInicio } = formData;
      if (formData.operacao === 'aporte') {
        return !!(formData.dataAporte && formData.valorAporte > 0);
      }

      // Validação básica - cada tipo terá validações específicas
      if (tipoAtivo === 'reserva-emergencia' || tipoAtivo === 'reserva-oportunidade') {
        return !!(
          dataCompra &&
          formData.valorInvestido > 0 &&
          formData.cotizacaoResgate &&
          formData.liquidacaoResgate &&
          formData.vencimento &&
          formData.benchmark &&
          formData.percentualCDI > 0
        );
      }

      if (tipoAtivo === 'conta-corrente') {
        return !!(dataInicio && formData.valorAplicado > 0 && formData.contaCorrenteDestino);
      }
      if (tipoAtivo === 'poupanca') {
        return !!(dataInicio && formData.valorAplicado > 0 && formData.contaCorrenteDestino);
      }

      if (tipoAtivo === 'criptoativo') {
        return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoCompra > 0);
      }

      if (tipoAtivo === 'moeda') {
        return !!(
          dataCompra &&
          formData.assetId &&
          formData.quantidade > 0 &&
          formData.cotacaoCompra > 0
        );
      }

      if (tipoAtivo === 'personalizado') {
        return !!(
          dataInicio &&
          formData.nomePersonalizado &&
          formData.quantidade > 0 &&
          formData.precoUnitario > 0 &&
          formData.metodo
        );
      }

      if (tipoAtivo === 'imovel') {
        return !!(dataInicio && formData.nomePersonalizado && formData.precoUnitario > 0);
      }

      if (
        tipoAtivo === 'renda-fixa' ||
        tipoAtivo === 'renda-fixa-posfixada' ||
        tipoAtivo === 'renda-fixa-hibrida'
      ) {
        const dataInicioParsed = dataInicio ? new Date(dataInicio) : null;
        const dataVencimentoParsed = formData.dataVencimento
          ? new Date(formData.dataVencimento)
          : null;
        const hasValidDates = !!(
          dataInicioParsed &&
          dataVencimentoParsed &&
          Number.isFinite(dataInicioParsed.getTime()) &&
          Number.isFinite(dataVencimentoParsed.getTime()) &&
          dataInicioParsed.getTime() < dataVencimentoParsed.getTime()
        );
        // Híbrida usa só Taxa Fixa Anual (indexador + taxa fixa); não exige
        // "Taxa sobre o Indexador". Pré e pós continuam exigindo taxaJurosAnual.
        const isTaxaJurosValida =
          tipoAtivo === 'renda-fixa-hibrida' ||
          (formData.taxaJurosAnual > 0 && formData.taxaJurosAnual <= 1000);
        const isTaxaFixaValida =
          tipoAtivo !== 'renda-fixa-hibrida' ||
          ((formData.taxaFixaAnual ?? 0) > 0 && (formData.taxaFixaAnual ?? 0) <= 1000);
        const isIndexerValid =
          tipoAtivo === 'renda-fixa'
            ? true
            : !!formData.rendaFixaIndexer && ['CDI', 'IPCA'].includes(formData.rendaFixaIndexer);

        return !!(
          formData.rendaFixaTipo &&
          dataInicio &&
          formData.valorAplicado > 0 &&
          isTaxaJurosValida &&
          isTaxaFixaValida &&
          formData.descricao &&
          hasValidDates &&
          isIndexerValid
        );
      }

      if (tipoAtivo === 'tesouro-direto') {
        const dest = formData.tesouroDestino;
        if (!dest) return false;
        if (dest === 'reserva-emergencia' || dest === 'reserva-oportunidade') {
          return !!(
            dataCompra &&
            formData.valorInvestido > 0 &&
            formData.cotizacaoResgate &&
            formData.liquidacaoResgate &&
            formData.vencimento &&
            formData.benchmark &&
            formData.percentualCDI > 0
          );
        }
        if (
          dest === 'renda-fixa-prefixada' ||
          dest === 'renda-fixa-posfixada' ||
          dest === 'renda-fixa-hibrida'
        ) {
          const metodoCotasTesouro =
            formData.metodo === 'cotas' || formData.metodo === 'percentual';
          const valorOk = metodoCotasTesouro
            ? formData.quantidade > 0 && formData.cotacaoUnitaria > 0
            : formData.valorInvestido > 0;
          const dataVencOk = formData.dataVencimento;
          const descOk = !!formData.descricao;
          const taxaPreOk =
            dest !== 'renda-fixa-prefixada' ||
            (formData.taxaJurosAnual > 0 && formData.taxaJurosAnual <= 1000);
          const indexadorOk =
            dest === 'renda-fixa-prefixada' ||
            (!!formData.rendaFixaIndexer && ['CDI', 'IPCA'].includes(formData.rendaFixaIndexer));
          return !!(dataCompra && valorOk && dataVencOk && descOk && taxaPreOk && indexadorOk);
        }
        return false;
      }

      if (tipoAtivo === 'debenture' || tipoAtivo === 'fundo' || tipoAtivo === 'previdencia') {
        const metodoCotas = formData.metodo === 'cotas' || formData.metodo === 'percentual';
        const debentureTipoRequired = tipoAtivo === 'debenture' && !!formData.tipoDebenture;
        // Debênture pré-fixada exige a taxa contratada — sem ela a marcação
        // na curva (igual emissão bancária) não tem o que acruar.
        const debentureTaxaOk =
          tipoAtivo !== 'debenture' ||
          formData.tipoDebenture !== 'prefixada' ||
          (formData.taxaJurosAnual > 0 && formData.taxaJurosAnual <= 1000);
        const fundoDestinoRequired = tipoAtivo === 'fundo' && !!formData.fundoDestino;
        // Ticket 02/09/2026: prazo de resgate obrigatório pra fundo (antes
        // nem era perguntado e a aba mostrava "D+0/Imediata" pra todos).
        const fundoLiquidezOk =
          tipoAtivo !== 'fundo' ||
          (!!formData.cotizacaoResgate?.trim() && !!formData.liquidacaoResgate?.trim());
        const fundoRendaFixaTipoRequired =
          tipoAtivo === 'fundo' &&
          formData.fundoDestino === 'renda-fixa' &&
          !!formData.fundoRendaFixaTipo;
        if (metodoCotas) {
          return !!(
            dataCompra &&
            formData.quantidade > 0 &&
            formData.cotacaoUnitaria > 0 &&
            (tipoAtivo !== 'debenture' || debentureTipoRequired) &&
            debentureTaxaOk &&
            (tipoAtivo !== 'fundo' || fundoDestinoRequired) &&
            fundoLiquidezOk &&
            (tipoAtivo !== 'fundo' ||
              formData.fundoDestino !== 'renda-fixa' ||
              fundoRendaFixaTipoRequired)
          );
        }
        return !!(
          dataCompra &&
          formData.valorInvestido > 0 &&
          (tipoAtivo !== 'debenture' || debentureTipoRequired) &&
          debentureTaxaOk &&
          (tipoAtivo !== 'fundo' || fundoDestinoRequired) &&
          fundoLiquidezOk &&
          (tipoAtivo !== 'fundo' ||
            formData.fundoDestino !== 'renda-fixa' ||
            fundoRendaFixaTipoRequired)
        );
      }

      if (tipoAtivo === 'fii') {
        return !!(
          dataCompra &&
          formData.quantidade > 0 &&
          formData.cotacaoUnitaria > 0 &&
          formData.taxaCorretagem >= 0 &&
          formData.tipoFii
        );
      }

      if (tipoAtivo === 'acao' || tipoAtivo === 'acoes-brasil') {
        return !!(
          dataCompra &&
          formData.quantidade > 0 &&
          formData.cotacaoUnitaria > 0 &&
          formData.estrategia
        );
      }

      if (tipoAtivo === 'stock') {
        return !!(
          dataCompra &&
          formData.quantidade > 0 &&
          formData.cotacaoUnitaria > 0 &&
          formData.moeda &&
          formData.cotacaoMoeda > 0 &&
          formData.estrategia
        );
      }

      if (tipoAtivo === 'reit') {
        return !!(
          dataCompra &&
          formData.quantidade > 0 &&
          formData.cotacaoUnitaria > 0 &&
          formData.cotacaoMoeda > 0 &&
          formData.estrategiaReit
        );
      }

      if (tipoAtivo === 'opcoes') {
        return !!(
          dataCompra &&
          formData.opcaoTipo &&
          formData.opcaoCompraVenda &&
          formData.dataVencimento &&
          formData.quantidade > 0 &&
          formData.cotacaoUnitaria > 0
        );
      }

      if (tipoAtivo === 'etf') {
        return !!(
          dataCompra &&
          formData.regiaoEtf &&
          formData.quantidade > 0 &&
          formData.cotacaoUnitaria > 0
        );
      }

      // Para BDRs, REITs, etc.
      return !!(dataCompra && formData.quantidade > 0 && formData.cotacaoUnitaria > 0);
    };

    if (formData.tipoAtivo === 'debenture') {
      setErrors((prev) => ({
        ...prev,
        tipoDebenture: !formData.tipoDebenture
          ? 'Selecione o tipo de debênture (Pré, Pós ou Híbrida)'
          : undefined,
      }));
    }
    if (formData.tipoAtivo === 'fundo') {
      setErrors((prev) => ({
        ...prev,
        fundoDestino: !formData.fundoDestino
          ? 'Selecione onde o fundo deve aparecer (Renda Fixa, Reserva ou subtipo da aba Fundos)'
          : undefined,
        fundoRendaFixaTipo:
          formData.fundoDestino === 'renda-fixa' && !formData.fundoRendaFixaTipo
            ? 'Selecione o tipo de renda fixa (Pré, Pós ou Híbrida)'
            : undefined,
        cotizacaoResgate: !formData.cotizacaoResgate?.trim()
          ? 'Informe o prazo de cotização do resgate (ex.: D+0, D+30)'
          : undefined,
        liquidacaoResgate: !formData.liquidacaoResgate?.trim()
          ? 'Informe o prazo de liquidação do resgate (ex.: Imediata, D+1)'
          : undefined,
      }));
    }
    if (formData.tipoAtivo === 'reit') {
      setErrors((prev) => ({
        ...prev,
        estrategiaReit: !formData.estrategiaReit
          ? 'Selecione o tipo de investimento (Value, Growth ou Risk)'
          : undefined,
      }));
    }
    if (formData.tipoAtivo === 'etf') {
      setErrors((prev) => ({
        ...prev,
        regiaoEtf: !formData.regiaoEtf ? 'Selecione a região do ETF (Brasil ou EUA)' : undefined,
      }));
    }
    if (formData.tipoAtivo === 'stock') {
      setErrors((prev) => ({
        ...prev,
        estrategia: !formData.estrategia
          ? 'Selecione a estratégia (Value, Growth ou Risk)'
          : undefined,
      }));
    }
    if (formData.tipoAtivo === 'opcoes') {
      setErrors((prev) => ({
        ...prev,
        opcaoTipo: !formData.opcaoTipo ? 'Selecione Put ou Call' : undefined,
        opcaoCompraVenda: !formData.opcaoCompraVenda ? 'Selecione Compra ou Venda' : undefined,
      }));
    }

    setSteps((prevSteps) =>
      prevSteps.map((step) => {
        let isValid = false;

        switch (step.id) {
          case 'asset-type':
            isValid = !!formData.operacao && !!formData.tipoAtivo;
            break;
          case 'institution':
            isValid = !!formData.instituicaoId;
            break;
          case 'asset':
            if (formData.operacao === 'aporte') {
              isValid = !!formData.portfolioId;
            } else {
              if (
                formData.tipoAtivo === 'renda-fixa' ||
                formData.tipoAtivo === 'renda-fixa-posfixada' ||
                formData.tipoAtivo === 'renda-fixa-hibrida'
              ) {
                isValid = !!(formData.rendaFixaVariante && formData.rendaFixaTipo);
              } else if (
                formData.tipoAtivo === 'conta-corrente' ||
                formData.tipoAtivo === 'poupanca'
              ) {
                isValid = true;
              } else if (formData.tipoAtivo === 'debenture') {
                isValid = !!(formData.ativo?.trim() && formData.assetId === 'DEBENTURE-MANUAL');
              } else if (formData.tipoAtivo === 'fundo') {
                isValid = !!(formData.ativo?.trim() && formData.assetId);
              } else if (formData.tipoAtivo === 'reit') {
                isValid = !!(formData.ativo?.trim() && formData.assetId === 'REIT-MANUAL');
              } else if (formData.tipoAtivo === 'stock') {
                isValid = !!(formData.ativo?.trim() && formData.assetId === 'STOCK-MANUAL');
              } else if (formData.tipoAtivo === 'acoes-brasil') {
                isValid = !!(formData.assetId && formData.acoesBrasilTipo);
              } else if (formData.tipoAtivo === 'previdencia') {
                // Fundo de previdência do catálogo (assetId real) OU seguro manual
                isValid = !!(formData.ativo?.trim() && formData.assetId);
              } else if (formData.tipoAtivo === 'tesouro-direto') {
                isValid = !!(formData.ativo?.trim() && formData.assetId);
              } else if (formData.tipoAtivo === 'opcoes') {
                isValid = !!(formData.ativo?.trim() && formData.assetId === 'OPCAO-MANUAL');
              } else if (formData.tipoAtivo === 'reserva-oportunidade') {
                isValid = !!(formData.ativo?.trim() && formData.assetId === 'RESERVA-OPORT');
              } else if (formData.tipoAtivo === 'reserva-emergencia') {
                isValid = !!(formData.ativo?.trim() && formData.assetId === 'RESERVA-EMERG');
              } else {
                isValid =
                  !!formData.assetId ||
                  formData.tipoAtivo === 'personalizado' ||
                  formData.tipoAtivo === 'imovel';
              }
            }
            break;
          case 'info':
            isValid = validateStep4();
            break;
          case 'confirmation':
            isValid = true; // Sempre válido no último passo
            break;
        }

        return { ...step, isValid };
      }),
    );
  }, [formData]);

  const visibleStepIds = getVisibleStepIds(formData);
  const currentStepId = visibleStepIds[currentStep];

  const proceedToNextStep = () => {
    if (currentStep < visibleStepIds.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleNext = () => {
    // Ao sair do passo de Informações (onde a cotação é digitada) com
    // divergência de preço não confirmada, abre o popup em vez de avançar.
    if (currentStepId === 'info' && hasHistoricClose && !isPriceConfirmed) {
      setPriceModalOpen(true);
      return;
    }

    proceedToNextStep();
  };

  const handleConfirmPrice = () => {
    setConfirmedPriceSig(priceSignature);
    setPriceModalOpen(false);
    proceedToNextStep();
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
    setPriceModalOpen(false);
    setConfirmedPriceSig(null);
    onClose();
  };

  const handleFormDataChange = useCallback((newData: Partial<WizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...newData }));
  }, []);

  const handleErrorsChange = useCallback((newErrors: Partial<WizardErrors>) => {
    setErrors((prev) => ({ ...prev, ...newErrors }));
  }, []);

  const handleSubmit = async () => {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setLoading(true);
    try {
      if (formData.operacao === 'aporte') {
        const response = await csrfFetch('/api/carteira/aporte', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            portfolioId: formData.portfolioId,
            dataAporte: formData.dataAporte,
            valorAporte: formData.valorAporte,
            tipoAtivo: formData.tipoAtivo,
            instituicaoId: formData.instituicaoId,
            vinculoTipo: formData.vinculoTipo ?? null,
            vinculoObjetivoId: formData.vinculoObjetivoId ?? null,
            isReinvestimento: !!formData.isReinvestimento,
          }),
        });

        if (response.ok) {
          invalidatePlanejamentoCaches();
          onSuccess();
          handleCancel();
        } else {
          const errorData = await response.json();
          const errorMessage = errorData.error || errorData.message || 'Erro desconhecido';
          logger.error('Erro ao realizar aporte:', errorMessage);
        }
        return;
      }

      // Converter 'reserva-emergencia' e 'reserva-oportunidade' para o formato da API
      const apiFormData = { ...formData };
      if (apiFormData.tipoAtivo === 'renda-fixa') {
        apiFormData.rendaFixaIndexer = apiFormData.rendaFixaIndexer || 'PRE';
      }
      if (apiFormData.tipoAtivo === 'reserva-emergencia') {
        apiFormData.tipoAtivo = 'emergency';
        apiFormData.quantidade = 1;
        apiFormData.cotacaoUnitaria = apiFormData.valorInvestido;
      } else if (apiFormData.tipoAtivo === 'reserva-oportunidade') {
        apiFormData.tipoAtivo = 'opportunity';
        apiFormData.quantidade = 1;
        apiFormData.cotacaoUnitaria = apiFormData.valorInvestido;
      } else if (apiFormData.tipoAtivo === 'acoes-brasil' && apiFormData.acoesBrasilTipo) {
        apiFormData.tipoAtivo = apiFormData.acoesBrasilTipo;
      } else if (
        (apiFormData.tipoAtivo === 'debenture' || apiFormData.tipoAtivo === 'fundo') &&
        (apiFormData.metodo === 'cotas' || apiFormData.metodo === 'percentual')
      ) {
        apiFormData.valorInvestido = apiFormData.quantidade * apiFormData.cotacaoUnitaria;
      } else if (apiFormData.tipoAtivo === 'reit') {
        apiFormData.valorInvestido = apiFormData.quantidade * apiFormData.cotacaoUnitaria;
      } else if (
        apiFormData.tipoAtivo === 'tesouro-direto' &&
        (apiFormData.metodo === 'cotas' || apiFormData.metodo === 'percentual')
      ) {
        apiFormData.valorInvestido = apiFormData.quantidade * apiFormData.cotacaoUnitaria;
      } else if (
        apiFormData.tipoAtivo === 'previdencia' &&
        (apiFormData.metodo === 'cotas' || apiFormData.metodo === 'percentual')
      ) {
        apiFormData.valorInvestido = apiFormData.quantidade * apiFormData.cotacaoUnitaria;
      } else if (apiFormData.tipoAtivo === 'moeda') {
        apiFormData.valorInvestido = apiFormData.quantidade * apiFormData.cotacaoCompra;
      } else if (apiFormData.tipoAtivo === 'opcoes') {
        apiFormData.valorInvestido =
          apiFormData.quantidade * apiFormData.cotacaoUnitaria + (apiFormData.taxaCorretagem || 0);
      } else if (apiFormData.tipoAtivo === 'imovel') {
        // Imóveis & Bens: unidade única — o valor do bem vai inteiro no preço.
        apiFormData.quantidade = 1;
        apiFormData.valorInvestido = apiFormData.precoUnitario;
        apiFormData.metodo = 'valor';
      }

      const response = await csrfFetch('/api/carteira/operacao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiFormData),
      });

      if (response.ok) {
        invalidatePlanejamentoCaches();
        onSuccess();
        handleCancel();
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.error || errorData.message || 'Erro desconhecido';
        logger.error('Erro ao adicionar investimento:', errorMessage);
        if (errorData.details) {
          logger.error('Detalhes do erro:', errorData.details);
        }
        // Aqui você pode mostrar uma notificação de erro
      }
    } catch (error) {
      logger.error('Erro ao adicionar investimento:', error);
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

    const isAporte = formData.operacao === 'aporte';

    switch (currentStepId) {
      case 'asset-type':
        return <Step1AssetType {...stepProps} />;
      case 'institution':
        return isAporte ? (
          <Step2AporteInstitution {...stepProps} />
        ) : (
          <Step2Institution {...stepProps} />
        );
      case 'asset':
        return isAporte ? <Step3AporteAsset {...stepProps} /> : <Step3Asset {...stepProps} />;
      case 'info':
        return isAporte ? <Step4AporteInfo {...stepProps} /> : <Step4AssetInfo {...stepProps} />;
      case 'confirmation':
        if (isAporte) {
          return <Step5AporteConfirmation {...stepProps} />;
        }
        return (
          <Step5Confirmation
            {...stepProps}
            onSubmit={handleSubmit}
            loading={loading}
            autoSubmit={formData.tipoAtivo === 'personalizado'}
          />
        );
      default:
        return null;
    }
  };

  const currentStepMeta = steps.find((step) => step.id === currentStepId);
  const canProceed = currentStepMeta?.isValid || false;
  const isLastStep = currentStep === visibleStepIds.length - 1;

  return (
    <Sidebar isOpen={isOpen} onClose={handleCancel} title="Adicionar Ativo à Carteira" noBackdrop>
      <div className="space-y-6">
        {/* Progress Indicator */}
        {(() => {
          const totalSteps = visibleStepIds.length;
          const currentStepNumber = currentStep + 1;

          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>
                  Passo {currentStepNumber} de {totalSteps}
                </span>
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
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {currentStepMeta?.title || ''}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {currentStepMeta?.description || ''}
          </p>
        </div>

        {/* Step Content */}
        <div className="min-h-[400px]">{renderCurrentStep()}</div>

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
            <Button type="button" onClick={handleSubmit} className="flex-1" disabled={loading}>
              {loading ? 'Salvando...' : 'Confirmar'}
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
          splitHint={computeSplitScaleHint(
            priceCheck!.enteredPrice,
            priceDeviation.referencePrice,
            priceDeviation.corporateActionsAfter,
          )}
          onConfirm={handleConfirmPrice}
          onCancel={() => setPriceModalOpen(false)}
        />
      )}
    </Sidebar>
  );
}
