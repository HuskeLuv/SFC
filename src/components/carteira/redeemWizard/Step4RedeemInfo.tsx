'use client';
import React, { useEffect, useState } from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { RedeemWizardErrors, RedeemWizardFormData } from '@/types/redeemWizard';
import ReinvestimentoToggle from '@/components/carteira/wizard/shared/ReinvestimentoToggle';
import { parseDecimalValue, DECIMAL_INPUT_PROPS } from '@/components/carteira/wizard/step4Utils';
import { useIsBelowLg } from '@/hooks/useMediaQuery';

/** Unidade da posição no texto do celular ("Você tem 1.200 ações de ITSA4"). */
const UNIDADE_POR_TIPO: Record<string, string> = {
  acao: 'ações',
  'acoes-brasil': 'ações',
  stock: 'ações',
  bdr: 'BDRs',
  fii: 'cotas',
  etf: 'cotas',
  reit: 'cotas',
  fundo: 'cotas',
  previdencia: 'cotas',
};

const QUICK_FRACTIONS = [
  { label: '25%', fraction: 0.25 },
  { label: '50%', fraction: 0.5 },
] as const;

/** Casas decimais aceitas na quantidade: inteira quando a posição é inteira; senão até 8. */
const quantityDecimals = (available: number) => (Number.isInteger(available) ? 0 : 8);

/** floor(posição × fração) nas casas decimais da posição (nunca passa da posição). */
export const quickRedeemQuantity = (available: number, fraction: number): number => {
  if (!(available > 0)) return 0;
  if (fraction >= 1) return available;
  const factor = 10 ** quantityDecimals(available);
  // Erro de ponto flutuante (0.29 × 0.5 × 1e8 = 14499999.999999998): se já é um inteiro a menos de
  // 1e-9 relativo, arredonda; senão, floor.
  const scaled = available * fraction * factor;
  const nearest = Math.round(scaled);
  const units =
    Math.abs(scaled - nearest) <= 1e-9 * Math.max(1, Math.abs(scaled))
      ? nearest
      : Math.floor(scaled);
  return units / factor;
};

/**
 * Carteira EUA em US$: resgate de Stock EUA (tipo 'acao' com moeda USD no wizard) ou REIT exige a
 * cotação do dólar da venda — o servidor recusa sem ela (400), grava em notes.operation e converte
 * o preço (sempre em US$) para a unidade da posição. ETF em dólar não entra aqui.
 */
export const resgateExigeCambio = (formData: Pick<RedeemWizardFormData, 'tipoAtivo' | 'moeda'>) =>
  formData.moeda === 'USD' && ['acao', 'stock', 'reit'].includes(formData.tipoAtivo);

/** Câmbio com até 4 casas; vírgula OU ponto é o decimal ("5,1111" e "5.1111"). */
const parseCambio = (texto: string): number | undefined => {
  const limpo = texto
    .trim()
    .replace(/[^\d.,]/g, '')
    .replace(',', '.');
  if (!limpo || (limpo.match(/\./g) ?? []).length > 1) return undefined;
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor > 0 ? valor : undefined;
};

const formatCambio = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const formatQuantity = (value: number) =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 8 });

interface Step4RedeemInfoProps {
  formData: RedeemWizardFormData;
  errors: RedeemWizardErrors;
  onFormDataChange: (data: Partial<RedeemWizardFormData>) => void;
  onErrorsChange: (errors: Partial<RedeemWizardErrors>) => void;
}

export default function Step4RedeemInfo({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step4RedeemInfoProps) {
  const isBelowLg = useIsBelowLg();
  // Estrito (=== 1): "Por valor" só existe para posições value-based (qty 1).
  // Posição fracionária (0,5 BTC) oferecia o método que o backend hoje rejeita
  // (e que antes DELETAVA a posição inteira — auditoria 2026-08-06, achado #2).
  const metodoOptions =
    formData.availableQuantity === 1
      ? [
          { value: 'quantidade', label: 'Por quantidade' },
          { value: 'valor', label: 'Por valor' },
        ]
      : [{ value: 'quantidade', label: 'Por quantidade' }];

  // Buffer de string dos campos numéricos (mesmo padrão do Step4AssetInfo do
  // aporte): input controlado por número + parseFloat descartava o separador
  // decimal no re-render — digitar "0,5" registrava 5, colar "1.500,50"
  // registrava 1,50 (auditoria 2026-08-06, achado #4).
  const [decimalInputValues, setDecimalInputValues] = useState<Record<string, string>>({});
  const exigeCambio = resgateExigeCambio(formData);
  const [cambioTexto, setCambioTexto] = useState(
    formData.cotacaoMoeda ? formatCambio(formData.cotacaoMoeda) : '',
  );
  const [cambioTocado, setCambioTocado] = useState(false);
  const cambioInvalido = exigeCambio && !(formData.cotacaoMoeda && formData.cotacaoMoeda > 0);

  // Sugere a cotação atual do dólar (mesma fonte do card "Dólar Comercial"); o usuário ajusta
  // para a taxa da nota de câmbio.
  useEffect(() => {
    if (!exigeCambio || formData.cotacaoMoeda !== undefined) return;
    let ativo = true;
    fetch('/api/analises/indicadores', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { indicators?: { dolar?: { price?: number | null } } } | null) => {
        const price = data?.indicators?.dolar?.price;
        if (ativo && price && price > 0) {
          const arredondado = Math.round(price * 10000) / 10000;
          setCambioTexto(formatCambio(arredondado));
          onFormDataChange({ cotacaoMoeda: arredondado });
        }
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
    // Só na primeira exibição: depois o usuário manda na cotação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exigeCambio]);

  // Rodada 3 (achado frontend #4/#16): o wizard desabilita o Avançar via
  // isValid mas nunca preenchia errors.* — os hints por campo eram código
  // morto e o botão desabilitava sem explicação. As mensagens nascem aqui e
  // espelham as mesmas regras do validateStep4 do wizard (e do backend).
  useEffect(() => {
    const stepErrors: Partial<RedeemWizardErrors> = {
      dataResgate: formData.dataResgate ? undefined : 'Informe a data do resgate.',
      quantidade: undefined,
      cotacaoUnitaria: undefined,
      valorResgate: undefined,
    };
    if (formData.metodoResgate === 'quantidade') {
      if (formData.quantidade <= 0) {
        stepErrors.quantidade = 'Informe uma quantidade maior que zero.';
      } else if (formData.quantidade > formData.availableQuantity) {
        stepErrors.quantidade = `Quantidade maior que a disponível (${formData.availableQuantity.toLocaleString('pt-BR')}).`;
      }
      if (formData.cotacaoUnitaria <= 0) {
        stepErrors.cotacaoUnitaria = 'Informe uma cotação maior que zero.';
      }
    } else if (formData.valorResgate <= 0) {
      stepErrors.valorResgate = 'Informe um valor maior que zero.';
    }
    onErrorsChange(stepErrors);
  }, [
    formData.dataResgate,
    formData.metodoResgate,
    formData.quantidade,
    formData.cotacaoUnitaria,
    formData.valorResgate,
    formData.availableQuantity,
    onErrorsChange,
  ]);

  const handleInputChange = (field: keyof RedeemWizardFormData, value: string | number) => {
    onFormDataChange({ [field]: value });
    if (errors[field as keyof RedeemWizardErrors]) {
      onErrorsChange({ [field]: undefined });
    }
  };

  const getDecimalInputValue = (field: 'quantidade' | 'cotacaoUnitaria' | 'valorResgate') => {
    const localValue = decimalInputValues[field];
    if (localValue !== undefined) {
      return localValue;
    }
    const numericValue = formData[field];
    if (typeof numericValue !== 'number' || Number.isNaN(numericValue) || numericValue === 0) {
      return '';
    }
    return String(numericValue).replace('.', ',');
  };

  const handleDecimalInputChange =
    (field: 'quantidade' | 'cotacaoUnitaria' | 'valorResgate') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
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

  // Celular: atalhos que só PREENCHEM a quantidade (a regra de limite é a mesma de sempre).
  const applyQuickQuantity = (quantity: number) => {
    setDecimalInputValues((prev) => ({
      ...prev,
      quantidade: quantity > 0 ? String(quantity).replace('.', ',') : '',
    }));
    handleInputChange('quantidade', quantity);
  };

  const available = formData.availableQuantity ?? 0;
  const unidade = UNIDADE_POR_TIPO[formData.tipoAtivo] ?? 'unidades';
  // O rótulo da posição vem como "ITSA4 - ITAUSA S.A. (189.82 und | R$ …)": no celular só o nome.
  const ativoNome = (formData.ativo || '').replace(/\s*\(.*\)\s*$/, '').trim();
  const ativoTicker = ativoNome.split(' - ')[0].trim();
  const ativoLabel = ativoTicker || 'este investimento';
  const quantidadeAcima =
    formData.metodoResgate === 'quantidade' && formData.quantidade > available;
  const quantidadeHint =
    isBelowLg && quantidadeAcima
      ? `Você tem ${formatQuantity(available)} ${unidade} de ${ativoLabel}. Use até ${formatQuantity(available)}.`
      : errors.quantidade;

  const handleMetodoChange = (value: string) => {
    setDecimalInputValues({});
    onFormDataChange({
      metodoResgate: value as RedeemWizardFormData['metodoResgate'],
      quantidade: 0,
      cotacaoUnitaria: 0,
      valorResgate: 0,
    });
    if (errors.metodoResgate) {
      onErrorsChange({ metodoResgate: undefined });
    }
  };

  return (
    <div className="space-y-6">
      {isBelowLg && (
        <div
          data-mf-redeem-position=""
          className="rounded-xl bg-gray-100 px-3.5 py-2.5 dark:bg-white/[0.06]"
        >
          <p className="text-xs text-gray-600 dark:text-gray-400">Posição disponível</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {ativoNome ? `${ativoNome} · ` : ''}
            {formatQuantity(available)} {unidade}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {formData.instituicao ? `${formData.instituicao} · ` : ''}
            investido{' '}
            {(formData.availableTotal ?? 0).toLocaleString('pt-BR', {
              style: 'currency',
              currency: formData.moeda || 'BRL',
            })}
          </p>
        </div>
      )}
      <div>
        <DatePicker
          nativeOnMobile
          id="dataResgate"
          label="Data do Resgate *"
          placeholder="Selecione a data"
          defaultDate={formData.dataResgate}
          staticPosition={false}
          appendToBody
          maxDate="today"
          onChange={(selectedDates) => {
            if (selectedDates && selectedDates.length > 0) {
              handleInputChange('dataResgate', selectedDates[0].toISOString().split('T')[0]);
            }
          }}
        />
        {errors.dataResgate && <p className="mt-1 text-sm text-red-500">{errors.dataResgate}</p>}
      </div>

      {!isBelowLg && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <p>Quantidade disponível: {formData.availableQuantity ?? 0}</p>
          <p>
            {/* rótulo honesto: é o CUSTO (totalInvested), não o valor de mercado —
              resgate com rendimento pode (e deve poder) exceder este número */}
            Valor investido:{' '}
            {(formData.availableTotal ?? 0).toLocaleString('pt-BR', {
              style: 'currency',
              currency: formData.moeda || 'BRL',
            })}
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="metodoResgate">Método de Resgate *</Label>
        <Select
          options={metodoOptions}
          placeholder="Selecione o método"
          defaultValue={formData.metodoResgate}
          onChange={handleMetodoChange}
          className={errors.metodoResgate ? 'border-red-500' : ''}
        />
        {errors.metodoResgate && (
          <p className="mt-1 text-sm text-red-500">{errors.metodoResgate}</p>
        )}
      </div>

      {formData.metodoResgate === 'quantidade' ? (
        <>
          <div>
            <Label htmlFor="quantidade">Quantidade a resgatar *</Label>
            <Input
              id="quantidade"
              {...DECIMAL_INPUT_PROPS}
              placeholder="Ex: 10 ou 0,5"
              value={getDecimalInputValue('quantidade')}
              onChange={handleDecimalInputChange('quantidade')}
              error={!!errors.quantidade}
              hint={quantidadeHint}
            />
            {isBelowLg && available > 0 && (
              <div
                role="group"
                aria-label="Atalhos de quantidade"
                className="mt-2 flex flex-wrap gap-2"
              >
                {QUICK_FRACTIONS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => applyQuickQuantity(quickRedeemQuantity(available, q.fraction))}
                    className="min-h-11 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:active:bg-gray-800"
                  >
                    {q.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => applyQuickQuantity(available)}
                  className="min-h-11 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:active:bg-gray-800"
                >
                  Tudo ({formatQuantity(available)})
                </button>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="cotacaoUnitaria">
              Cotação unitária ({formData.moeda === 'USD' ? 'US$' : 'R$'}) *
            </Label>
            <Input
              id="cotacaoUnitaria"
              {...DECIMAL_INPUT_PROPS}
              placeholder="Ex: 32,50"
              value={getDecimalInputValue('cotacaoUnitaria')}
              onChange={handleDecimalInputChange('cotacaoUnitaria')}
              error={!!errors.cotacaoUnitaria}
              hint={errors.cotacaoUnitaria}
            />
          </div>
        </>
      ) : (
        <div>
          <Label htmlFor="valorResgate">
            Valor do resgate ({formData.moeda === 'USD' ? 'US$' : 'R$'}) *
          </Label>
          <Input
            id="valorResgate"
            {...DECIMAL_INPUT_PROPS}
            placeholder="Ex: 1.000,00"
            value={getDecimalInputValue('valorResgate')}
            onChange={handleDecimalInputChange('valorResgate')}
            error={!!errors.valorResgate}
            hint={errors.valorResgate}
          />
        </div>
      )}
      {exigeCambio && (
        <div>
          <Label htmlFor="cotacaoMoedaResgateInfo">Cotação do dólar no dia do resgate (R$) *</Label>
          <Input
            id="cotacaoMoedaResgateInfo"
            type="text"
            inputMode="decimal"
            placeholder="Ex.: 5,40"
            value={cambioTexto}
            onChange={(e) => {
              setCambioTexto(e.target.value);
              setCambioTocado(true);
              onFormDataChange({ cotacaoMoeda: parseCambio(e.target.value) });
            }}
            error={cambioTocado && cambioInvalido}
            hint={
              cambioTocado && cambioInvalido
                ? 'Informe a cotação do dólar (maior que zero).'
                : 'Use a taxa da sua nota de câmbio. O preço acima é em US$.'
            }
          />
        </div>
      )}
      <ReinvestimentoToggle
        mode="resgate"
        checked={!!formData.isReinvestimento}
        onChange={(value) => onFormDataChange({ isReinvestimento: value })}
      />
    </div>
  );
}
