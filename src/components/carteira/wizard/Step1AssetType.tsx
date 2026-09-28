'use client';

import { logger } from '@/lib/logger';
import React, { useEffect, useState } from 'react';
import { WizardFormData, WizardErrors, TIPOS_ATIVO, TIPOS_ATIVO_PLANEJAVEIS } from '@/types/wizard';
import Label from '@/components/form/Label';
import Select from '@/components/form/Select';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { groupTiposAtivo, type TipoAtivoOption } from './tipoAtivoGroups';

const OPERACOES = [
  { value: 'compra', label: 'Adicionar investimento', hint: 'Algo que você já comprou' },
  { value: 'aporte', label: 'Aporte', hint: 'Mais dinheiro em algo que já está na carteira' },
  { value: 'planejar', label: 'Planejar', hint: 'Ainda não comprei; quero ver quanto falta' },
] as const;

const RADIO_CARD_CLASS =
  'relative flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#0079F2]/40';
const RADIO_CARD_OFF =
  'border-gray-200 bg-white text-gray-800 active:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
const RADIO_CARD_ON =
  'border-mf-patrimonio bg-mf-patrimonio/[0.08] text-gray-900 dark:border-mf-tranquilidade dark:bg-mf-tranquilidade/[0.14] dark:text-white';

/** Bolinha do rádio (decorativa: o estado vai no aria-checked do botão). */
function RadioDot({ checked, className = '' }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
        checked
          ? 'border-mf-patrimonio dark:border-mf-tranquilidade'
          : 'border-gray-300 dark:border-gray-600'
      }`}
    >
      {checked && (
        <span className="h-2.5 w-2.5 rounded-full bg-mf-patrimonio dark:bg-mf-tranquilidade" />
      )}
    </span>
  );
}

/** Setas movem a escolha dentro do grupo (padrão de radiogroup). */
function handleRadioKeys(
  event: React.KeyboardEvent<HTMLButtonElement>,
  values: readonly string[],
  current: string,
  onChange: (value: string) => void,
) {
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
  if (!keys.includes(event.key) || values.length === 0) return;
  event.preventDefault();
  const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
  const index = Math.max(values.indexOf(current), 0);
  const next = values[(index + step + values.length) % values.length];
  onChange(next);
  const group = event.currentTarget.closest('[data-mf-radio-scope]');
  group?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next)}"]`)?.focus();
}

interface Step1AssetTypeProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export default function Step1AssetType({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step1AssetTypeProps) {
  const isBelowLg = useIsBelowLg();
  const [aporteTipos, setAporteTipos] = useState<{ value: string; label: string }[]>([]);
  const [loadingTipos, setLoadingTipos] = useState(false);
  const [aporteTiposError, setAporteTiposError] = useState<string | null>(null);

  useEffect(() => {
    if (formData.operacao === 'aporte') {
      fetchTiposAporte();
    }
  }, [formData.operacao]);

  const fetchTiposAporte = async () => {
    setLoadingTipos(true);
    setAporteTiposError(null);
    try {
      const response = await fetch('/api/carteira/aporte/tipos', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json().catch(() => null);
      if (!data || !Array.isArray(data.tipos)) {
        throw new Error('Resposta inválida do servidor');
      }
      setAporteTipos(data.tipos);
    } catch (error) {
      logger.error('Erro ao buscar tipos para aporte:', error);
      setAporteTipos([]);
      setAporteTiposError('Não foi possível carregar os tipos disponíveis. Tente novamente.');
    } finally {
      setLoadingTipos(false);
    }
  };

  const handleOperacaoChange = (value: string) => {
    onFormDataChange({
      operacao: value as WizardFormData['operacao'],
      tipoAtivo: '',
      ativo: '',
      assetId: '',
      portfolioId: '',
      availableQuantity: 0,
      availableTotal: 0,
      instituicaoId: '',
      instituicao: '',
    });
    if (errors.operacao) {
      onErrorsChange({ operacao: undefined });
    }
  };

  const handleTipoAtivoChange = (value: string) => {
    onFormDataChange({
      tipoAtivo: value,
      ativo: '',
      assetId: '',
      rendaFixaTipo: '',
      rendaFixaVariante: '',
      rendaFixaIndexer: '',
      // F1.6: campo removido da UI; sempre 100% (cobre ~95% dos casos práticos)
      rendaFixaIndexerPercent: 100,
      rendaFixaLiquidity: '',
      rendaFixaTaxExempt: false,
      taxaFixaAnual: 0,
      tesouroDestino: undefined,
    });

    // Limpar erro quando usuário selecionar
    if (errors.tipoAtivo) {
      onErrorsChange({ tipoAtivo: undefined });
    }
  };

  const tipoOptions: TipoAtivoOption[] =
    formData.operacao === 'aporte'
      ? aporteTipos
      : formData.operacao === 'planejar'
        ? TIPOS_ATIVO.filter((t) =>
            (TIPOS_ATIVO_PLANEJAVEIS as readonly string[]).includes(t.value),
          )
        : TIPOS_ATIVO;

  // Celular (PWA fase 1): cartões de rádio em vez de Select, sobre a MESMA lista e os MESMOS
  // handlers. Adicionar e Planejar agrupados; Aporte na ordem da API, sem agrupar.
  if (isBelowLg) {
    const operacaoValues = OPERACOES.map((o) => o.value);
    const grupos =
      formData.operacao === 'aporte'
        ? [{ id: 'aporte', label: 'Tipos que você já tem', options: tipoOptions }]
        : groupTiposAtivo(tipoOptions);
    // Setas seguem a ordem da tela (grupo a grupo), não a de TIPOS_ATIVO.
    const allTipoValues = grupos.flatMap((g) => g.options.map((o) => o.value));

    return (
      <div className="space-y-5" data-mf-radio-scope="">
        <div>
          <p
            id="operacao-label"
            className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Operação
          </p>
          <div role="radiogroup" aria-labelledby="operacao-label" className="flex flex-col gap-2">
            {OPERACOES.map((op) => {
              const checked = formData.operacao === op.value;
              return (
                <button
                  key={op.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  data-value={op.value}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => !checked && handleOperacaoChange(op.value)}
                  onKeyDown={(e) =>
                    handleRadioKeys(e, operacaoValues, formData.operacao, handleOperacaoChange)
                  }
                  className={`${RADIO_CARD_CLASS} min-h-14 ${checked ? RADIO_CARD_ON : RADIO_CARD_OFF}`}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{op.label}</span>
                    <span className="block text-xs text-gray-600 dark:text-gray-400">
                      {op.hint}
                    </span>
                  </span>
                  <RadioDot checked={checked} />
                </button>
              );
            })}
          </div>
          {errors.operacao && <p className="mt-1 text-sm text-red-500">{errors.operacao}</p>}
        </div>

        <div>
          <p
            id="tipoAtivo-label"
            className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Tipo de ativo
          </p>
          {formData.operacao === 'aporte' && loadingTipos && (
            <p className="py-2 text-sm text-gray-500 dark:text-gray-400">Carregando tipos...</p>
          )}
          {grupos.map((grupo) => (
            <div key={grupo.id} className="mt-3">
              <p
                id={`tipo-grupo-${grupo.id}`}
                className="mb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400"
              >
                {grupo.label}
              </p>
              <div
                role="radiogroup"
                aria-labelledby={`tipoAtivo-label tipo-grupo-${grupo.id}`}
                className="grid grid-cols-2 gap-2"
              >
                {grupo.options.map((opt) => {
                  const checked = formData.tipoAtivo === opt.value;
                  const focusable =
                    checked || (!formData.tipoAtivo && opt.value === allTipoValues[0]);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      data-value={opt.value}
                      tabIndex={focusable ? 0 : -1}
                      onClick={() => !checked && handleTipoAtivoChange(opt.value)}
                      onKeyDown={(e) =>
                        handleRadioKeys(e, allTipoValues, formData.tipoAtivo, handleTipoAtivoChange)
                      }
                      className={`${RADIO_CARD_CLASS} min-h-12 ${checked ? RADIO_CARD_ON : RADIO_CARD_OFF}`}
                    >
                      <span className="min-w-0 break-words font-medium">{opt.label}</span>
                      <RadioDot checked={checked} className="max-[359px]:hidden" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {errors.tipoAtivo && <p className="mt-1 text-sm text-red-500">{errors.tipoAtivo}</p>}
          {aporteTiposError && formData.operacao === 'aporte' && (
            <p className="mt-1 text-sm text-red-500">{aporteTiposError}</p>
          )}
          {formData.operacao === 'aporte' &&
            !loadingTipos &&
            !aporteTiposError &&
            aporteTipos.length === 0 && (
              <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
                Nenhum investimento na carteira para aportar.
              </p>
            )}
        </div>

        {formData.operacao === 'planejar' && (
          <p className="rounded-xl bg-gray-100 p-3 text-sm text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
            O ativo entra na aba da carteira sem quantidade nem valor, só com o objetivo (%). Na
            primeira compra ele vira uma posição normal e herda o objetivo.
          </p>
        )}

        {formData.tipoAtivo && formData.operacao !== 'aporte' && (
          <p className="rounded-xl bg-gray-100 p-3 text-sm text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
            {getAssetTypeDescription(formData.tipoAtivo)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="operacao">Operação *</Label>
        <Select
          options={[
            { value: 'compra', label: 'Adicionar investimento' },
            { value: 'aporte', label: 'Aporte' },
            { value: 'planejar', label: 'Planejar (ainda não comprei)' },
          ]}
          placeholder="Selecione a operação"
          defaultValue={formData.operacao}
          onChange={handleOperacaoChange}
          className={errors.operacao ? 'border-red-500' : ''}
        />
        {errors.operacao && <p className="mt-1 text-sm text-red-500">{errors.operacao}</p>}
      </div>
      <div>
        <Label htmlFor="tipoAtivo">Tipo de Ativo *</Label>
        <Select
          options={
            formData.operacao === 'aporte'
              ? aporteTipos
              : formData.operacao === 'planejar'
                ? TIPOS_ATIVO.filter((t) =>
                    (TIPOS_ATIVO_PLANEJAVEIS as readonly string[]).includes(t.value),
                  )
                : TIPOS_ATIVO
          }
          placeholder={
            formData.operacao === 'aporte'
              ? loadingTipos
                ? 'Carregando tipos...'
                : 'Selecione o tipo para aporte'
              : formData.operacao === 'planejar'
                ? 'Selecione o tipo do ativo que pretende comprar'
                : 'Selecione o tipo de ativo que deseja adicionar'
          }
          defaultValue={formData.tipoAtivo}
          onChange={handleTipoAtivoChange}
          className={errors.tipoAtivo ? 'border-red-500' : ''}
        />
        {errors.tipoAtivo && <p className="mt-1 text-sm text-red-500">{errors.tipoAtivo}</p>}
        {aporteTiposError && formData.operacao === 'aporte' && (
          <p className="mt-1 text-sm text-red-500">{aporteTiposError}</p>
        )}
      </div>

      {formData.operacao === 'planejar' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Planejar um ativo
          </h4>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            O ativo entra na aba da carteira sem quantidade nem valor, só com o objetivo (%). As
            colunas Quanto Falta e Necessidade de Aporte mostram quanto comprar. Na primeira compra
            ele vira uma posição normal e herda o objetivo. Disponível para ações e BDRs,
            FII&apos;s, ETF&apos;s, moedas, criptomoedas, stocks, REIT&apos;s, fundos e previdência.
          </p>
        </div>
      )}

      {/* Informações sobre o tipo selecionado */}
      {formData.tipoAtivo && formData.operacao !== 'aporte' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Informações sobre {TIPOS_ATIVO.find((t) => t.value === formData.tipoAtivo)?.label}
          </h4>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {getAssetTypeDescription(formData.tipoAtivo)}
          </p>
        </div>
      )}
    </div>
  );
}

function getAssetTypeDescription(tipoAtivo: string): string {
  const descriptions: Record<string, string> = {
    'reserva-emergencia':
      'Reserva de emergência é um valor guardado para cobrir imprevistos e situações de necessidade. Idealmente deve corresponder a 6 meses das suas despesas mensais.',
    'reserva-oportunidade':
      'Reserva de oportunidade é um valor mantido disponível para aproveitar oportunidades de investimento que possam surgir no mercado, com boa liquidez para movimentação rápida.',
    'acoes-brasil':
      'Ações Brasil inclui ações brasileiras (PETR4, VALE3) e BDRs (AAPL34, MSFT34) negociados na B3. Ações representam participação no capital de empresas; BDRs são certificados de ações estrangeiras.',
    'conta-corrente':
      'Conta corrente é uma conta bancária tradicional para movimentação de dinheiro e pagamentos.',
    criptoativo: 'Criptoativos são moedas digitais como Bitcoin, Ethereum e outras criptomoedas.',
    debenture:
      'Debêntures são títulos de dívida emitidos por empresas para captar recursos no mercado.',
    fundo:
      'Fundos de investimento são veículos que reúnem recursos de vários investidores para aplicar em diferentes ativos.',
    fii: "Fundos Imobiliários (FII's) investem em imóveis no Brasil e distribuem renda através de aluguéis e valorização.",
    reit: 'REITs são fundos imobiliários estrangeiros que investem em imóveis e distribuem renda ao investidor.',
    stock: 'Stocks são ações internacionais negociadas em bolsas estrangeiras.',
    moeda: 'Moedas estrangeiras como dólar, euro e outras moedas internacionais.',
    personalizado:
      'Ativos personalizados permitem criar investimentos customizados com suas próprias regras.',
    poupanca:
      'Poupança é uma aplicação de renda fixa com liquidez diária e rendimento baseado na poupança.',
    previdencia: 'Previdência privada e seguros para aposentadoria e proteção financeira.',
    'renda-fixa':
      'Renda fixa inclui títulos pré-fixados (taxa definida na aplicação), pós-fixados (atrelados a CDI ou IPCA) ou híbridos (parte fixa + indexador). No próximo passo você escolherá o tipo de rentabilidade.',
    'tesouro-direto': 'Títulos públicos federais negociados diretamente com o Tesouro Nacional.',
    imovel:
      'Imóveis e bens (apartamento, casa, carro, terreno etc.) compõem o seu patrimônio na Carteira Consolidada e no Balanço Patrimonial, mas não entram no cálculo de rentabilidade da carteira.',
  };

  return descriptions[tipoAtivo] || 'Selecione um tipo de ativo para ver mais informações.';
}
