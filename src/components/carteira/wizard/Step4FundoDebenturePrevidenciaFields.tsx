'use client';
import React, { useEffect, useRef, useState } from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import BusinessDayDatePicker from './shared/BusinessDayDatePicker';
import { Step4FieldsProps } from './step4Types';
import ReinvestimentoToggle from './shared/ReinvestimentoToggle';
import { useFundQuotaAt } from './useFundQuotaAt';
import { formatDateBR } from './priceDeviationWarning';
import {
  fundoSubtipoFromAssetType,
  isFundoSubtipo,
  FUNDO_SUBTIPO_LABEL,
  type FundoSubtipo,
} from '@/lib/fundoTypes';

/** Cotas de fundo são fracionárias (CVM publica VL_QUOTA com 8 casas). */
const QTY_DECIMALS = 8;
const roundQty = (n: number): number => Math.round(n * 10 ** QTY_DECIMALS) / 10 ** QTY_DECIMALS;
const toInputString = (n: number): string => (n > 0 ? String(n).replace('.', ',') : '');

export default function Step4FundoDebenturePrevidenciaFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  parseDecimalValue,
  decimalInputProps,
  onFormDataChange,
}: Step4FieldsProps) {
  const isCvmFund =
    (formData.tipoAtivo === 'fundo' && formData.assetId && formData.assetId !== 'FUNDO-MANUAL') ||
    (formData.tipoAtivo === 'previdencia' &&
      formData.assetId &&
      formData.assetId !== 'SEGURO-MANUAL');

  // Quando o ativo selecionado é um fundo classificado pela CVM (FIDC/FIP/etc),
  // resolvemos o subtipo automaticamente — o destino na aba "Fundos" deixa de
  // ser ambíguo e o dropdown vira info read-only.
  const autoSubtipo: FundoSubtipo | null = isCvmFund
    ? fundoSubtipoFromAssetType(formData.assetType)
    : null;

  // Ticket Pedro 27/08/2026: o cliente sabe quanto APLICOU ("R$ 5 mil pela
  // XP"), não a quantidade de cotas. Pra fundo CVM o fluxo vira: valor aplicado
  // → cota do dia (buscada na CVM) → quantidade = valor ÷ cota. Os três campos
  // ficam editáveis e se recalculam entre si; strings locais evitam que o
  // auto-preenchimento brigue com o cache de digitação do Step4AssetInfo.
  const quotaLookup = useFundQuotaAt(
    isCvmFund ? formData.ativo : null,
    isCvmFund ? formData.dataCompra || null : null,
  );
  const [valorStr, setValorStr] = useState(() => toInputString(formData.valorInvestido));
  const [cotaStr, setCotaStr] = useState(() => toInputString(formData.cotacaoUnitaria));
  const [qtyStr, setQtyStr] = useState(() => toInputString(formData.quantidade));
  const lastAutoQuotaSigRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isCvmFund || !quotaLookup.quota) return;
    const { price, effectiveDate } = quotaLookup.quota;
    const sig = `${formData.assetId}|${effectiveDate}|${price}`;
    if (lastAutoQuotaSigRef.current === sig) return;
    lastAutoQuotaSigRef.current = sig;
    if (!(price > 0)) return;
    setCotaStr(toInputString(price));
    const patch: Partial<typeof formData> = { cotacaoUnitaria: price };
    if (formData.valorInvestido > 0) {
      const qty = roundQty(formData.valorInvestido / price);
      patch.quantidade = qty;
      setQtyStr(toInputString(qty));
    } else if (formData.quantidade > 0) {
      patch.valorInvestido = formData.quantidade * price;
      setValorStr(toInputString(patch.valorInvestido));
    }
    onFormDataChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCvmFund, quotaLookup.quota, formData.assetId]);

  const handleValorAplicado = (raw: string) => {
    setValorStr(raw);
    const valor = raw.trim() ? parseDecimalValue(raw) : 0;
    if (valor === null) return;
    const patch: Partial<typeof formData> = { valorInvestido: valor };
    const cota = formData.cotacaoUnitaria || 0;
    if (valor > 0 && cota > 0) {
      const qty = roundQty(valor / cota);
      patch.quantidade = qty;
      setQtyStr(toInputString(qty));
    }
    onFormDataChange(patch);
  };

  const handleCotaManual = (raw: string) => {
    setCotaStr(raw);
    const cota = raw.trim() ? parseDecimalValue(raw) : 0;
    if (cota === null) return;
    const patch: Partial<typeof formData> = { cotacaoUnitaria: cota };
    if (cota > 0 && formData.valorInvestido > 0) {
      const qty = roundQty(formData.valorInvestido / cota);
      patch.quantidade = qty;
      setQtyStr(toInputString(qty));
    } else if (cota > 0 && formData.quantidade > 0) {
      patch.valorInvestido = formData.quantidade * cota;
      setValorStr(toInputString(patch.valorInvestido));
    }
    onFormDataChange(patch);
  };

  const handleQtyManual = (raw: string) => {
    setQtyStr(raw);
    const qty = raw.trim() ? parseDecimalValue(raw) : 0;
    if (qty === null) return;
    const patch: Partial<typeof formData> = { quantidade: qty };
    const cota = formData.cotacaoUnitaria || 0;
    if (qty > 0 && cota > 0) {
      patch.valorInvestido = qty * cota;
      setValorStr(toInputString(patch.valorInvestido));
    }
    onFormDataChange(patch);
  };

  const cotaHint = (() => {
    if (errors.cotacaoUnitaria) return errors.cotacaoUnitaria;
    if (!isCvmFund) return undefined;
    if (!formData.dataCompra) return 'Informe a data de compra para buscarmos a cota do dia.';
    if (quotaLookup.isLoading) return 'Buscando a cota do dia na CVM…';
    if (quotaLookup.quota) {
      const dataCota = formatDateBR(quotaLookup.quota.effectiveDate);
      const mesmaData = quotaLookup.quota.effectiveDate === formData.dataCompra;
      return mesmaData
        ? `Cota oficial CVM de ${dataCota}, preenchida automaticamente. Ajuste se o extrato mostrar outro valor.`
        : `Última cota CVM disponível antes da data (${dataCota}), preenchida automaticamente. Ajuste se o extrato mostrar outro valor.`;
    }
    if (quotaLookup.notFound)
      return 'Não encontramos a cota da CVM para essa data. Informe o valor da cota que consta no extrato da corretora.';
    return undefined;
  })();

  // Fundos da CVM são SEMPRE por cotas (qtd × preço da cota), como uma ação —
  // entrada por valor gerava posição qty=1 que não acompanha a cota. Força o
  // método e o toggle some (abaixo).
  useEffect(() => {
    if (!isCvmFund) return;
    if (formData.metodo !== 'cotas') {
      onFormDataChange({ metodo: 'cotas' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.assetId, isCvmFund, formData.metodo]);

  // Auto-preencher fundoDestino e tipoFundo quando o Asset.type é classificado.
  useEffect(() => {
    if (!autoSubtipo) return;
    if (formData.fundoDestino === autoSubtipo && formData.tipoFundo === autoSubtipo) return;
    onFormDataChange({
      fundoDestino: autoSubtipo,
      tipoFundo: autoSubtipo,
      fundoRendaFixaTipo: undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubtipo]);

  const metodoCotas = formData.metodo === 'cotas' || formData.metodo === 'percentual';
  const totalCalculado = formData.quantidade * formData.cotacaoUnitaria;
  const TIPO_DEBENTURE_OPTIONS = [
    { value: 'prefixada', label: 'Pré-fixada' },
    { value: 'pos-fixada', label: 'Pós-fixada' },
    { value: 'hibrida', label: 'Híbrida' },
  ];

  return (
    <>
      <BusinessDayDatePicker
        id="dataCompra"
        label="Data de Compra *"
        placeholder="Selecione a data"
        value={formData.dataCompra}
        onChange={(iso) => handleInputChange('dataCompra', iso)}
        error={errors.dataCompra}
      />

      {formData.tipoAtivo === 'debenture' && (
        <div>
          <Label htmlFor="tipoDebenture">Tipo de Debênture *</Label>
          <Select
            id="tipoDebenture"
            options={TIPO_DEBENTURE_OPTIONS}
            placeholder="Selecione o tipo (define em qual seção da aba Renda Fixa será exibida)"
            value={formData.tipoDebenture ?? ''}
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

      {/* Sem API de preços de debêntures, a rentabilidade é marcada na curva com
          a taxa contratada — igual emissão bancária (ticket QA 19/08/2026). */}
      {formData.tipoAtivo === 'debenture' && formData.tipoDebenture === 'prefixada' && (
        <div>
          <Label htmlFor="taxaJurosAnual">Taxa contratada (% a.a.) *</Label>
          <Input
            id="taxaJurosAnual"
            {...decimalInputProps}
            placeholder="Ex.: 12,5"
            value={getDecimalInputValue('taxaJurosAnual')}
            onChange={handleDecimalInputChange('taxaJurosAnual')}
            error={!!errors.taxaJurosAnual}
            hint={
              errors.taxaJurosAnual ??
              'A rentabilidade acompanha esta taxa desde a compra (marcação na curva).'
            }
            min="0"
            step="0.01"
          />
        </div>
      )}
      {formData.tipoAtivo === 'debenture' && formData.tipoDebenture === 'pos-fixada' && (
        <div>
          <Label htmlFor="percentualCDI">Rentabilidade contratada (% do CDI)</Label>
          <Input
            id="percentualCDI"
            {...decimalInputProps}
            placeholder="Ex.: 110 (padrão 100)"
            value={getDecimalInputValue('percentualCDI')}
            onChange={handleDecimalInputChange('percentualCDI')}
            min="0"
            step="0.01"
            hint="Ex.: 110 = 110% do CDI. Em branco, consideramos 100% do CDI."
          />
        </div>
      )}
      {formData.tipoAtivo === 'debenture' && formData.tipoDebenture === 'hibrida' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rendaFixaIndexer">Indexador</Label>
            <Select
              id="rendaFixaIndexer"
              options={[
                { value: 'IPCA', label: 'IPCA' },
                { value: 'CDI', label: 'CDI' },
              ]}
              placeholder="IPCA (padrão)"
              value={formData.rendaFixaIndexer || ''}
              onChange={(value) => handleInputChange('rendaFixaIndexer', value)}
            />
          </div>
          <div>
            <Label htmlFor="taxaFixaAnual">Taxa fixa (% a.a.)</Label>
            <Input
              id="taxaFixaAnual"
              {...decimalInputProps}
              placeholder="Ex.: 6,5"
              value={getDecimalInputValue('taxaFixaAnual')}
              onChange={handleDecimalInputChange('taxaFixaAnual')}
              min="0"
              step="0.01"
              hint="Indexador + taxa fixa (ex.: IPCA + 6,5% a.a.)."
            />
          </div>
        </div>
      )}
      {formData.tipoAtivo === 'debenture' && formData.tipoDebenture && (
        <>
          {/* Vencimento é data FUTURA por natureza — não usar BusinessDayDatePicker,
              que trava em hoje (maxDate) por ser pensado p/ datas de operação.
              Mesmo padrão do Step4RendaFixaFields. */}
          <div>
            <DatePicker
              id="dataVencimento"
              label="Data de Vencimento"
              placeholder="Opcional — em branco, consideramos 10 anos"
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
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={!!formData.rendaFixaTaxExempt}
              onChange={(e) => handleInputChange('rendaFixaTaxExempt', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Debênture incentivada (isenta de IR)
          </label>
        </>
      )}

      {formData.tipoAtivo === 'fundo' && autoSubtipo && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Classificação CVM: <strong>{FUNDO_SUBTIPO_LABEL[autoSubtipo]}</strong>. Este fundo será
            exibido na seção {FUNDO_SUBTIPO_LABEL[autoSubtipo]} da aba Fundos e a cota será
            atualizada automaticamente.
          </p>
        </div>
      )}
      {formData.tipoAtivo === 'fundo' && !autoSubtipo && (
        <div>
          <Label htmlFor="fundoDestino">Onde este fundo deve aparecer *</Label>
          <Select
            id="fundoDestino"
            options={[
              { value: 'reserva-emergencia', label: 'Reserva de Emergência' },
              { value: 'reserva-oportunidade', label: 'Reserva de Oportunidade' },
              { value: 'renda-fixa', label: 'Renda Fixa' },
              { value: 'previdencia-seguros', label: 'Previdência e Seguros' },
              { value: 'fim', label: 'FIM (Fundo Multimercado)' },
              { value: 'fia', label: 'FIA (Fundo de Ações)' },
              { value: 'rf', label: 'Fundo de Renda Fixa (aba Fundos)' },
              { value: 'cambial', label: 'Fundo Cambial (aba Fundos)' },
              { value: 'fip', label: 'FIP (Fundo de Participações)' },
              { value: 'fip-infra', label: 'FIP Infraestrutura (Lei 12.431)' },
              { value: 'fidc', label: 'FIDC (Direitos Creditórios)' },
              { value: 'fiagro', label: 'Fiagro' },
            ]}
            placeholder="Selecione onde exibir"
            value={formData.fundoDestino ?? ''}
            onChange={(value) => {
              handleInputChange('fundoDestino', value);
              if (isFundoSubtipo(value)) {
                handleInputChange('tipoFundo', value);
              } else {
                onFormDataChange({
                  tipoFundo: undefined,
                  ...(value !== 'renda-fixa' && { fundoRendaFixaTipo: undefined }),
                });
              }
            }}
            className={errors.fundoDestino ? 'border-red-500' : ''}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Para fundos manuais o destino é informado. Fundos vinculados à CVM têm o destino
            classificado automaticamente.
          </p>
          {errors.fundoDestino && (
            <p className="mt-1 text-sm text-red-500">{errors.fundoDestino}</p>
          )}
        </div>
      )}

      {isCvmFund && !autoSubtipo && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Fundo vinculado ao cadastro CVM. O valor da cota será atualizado automaticamente via
            dados abertos da CVM.
          </p>
        </div>
      )}

      {formData.tipoAtivo === 'fundo' && formData.fundoDestino === 'renda-fixa' && (
        <div>
          <Label htmlFor="fundoRendaFixaTipo">Tipo de Renda Fixa *</Label>
          <Select
            id="fundoRendaFixaTipo"
            options={[
              { value: 'prefixada', label: 'Pré-fixada' },
              { value: 'pos-fixada', label: 'Pós-fixada' },
              { value: 'hibrida', label: 'Híbrida' },
            ]}
            placeholder="Selecione o tipo"
            value={formData.fundoRendaFixaTipo ?? ''}
            onChange={(value) => handleInputChange('fundoRendaFixaTipo', value)}
            className={errors.fundoRendaFixaTipo ? 'border-red-500' : ''}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            O fundo será exibido na seção correspondente da aba Renda Fixa.
          </p>
          {errors.fundoRendaFixaTipo && (
            <p className="mt-1 text-sm text-red-500">{errors.fundoRendaFixaTipo}</p>
          )}
        </div>
      )}

      {formData.tipoAtivo === 'fundo' && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90 mb-1">
            Prazo de resgate
          </h4>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Conforme o regulamento do fundo. Define a liquidez no balanço patrimonial (até D+360 =
            curto prazo).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cotizacaoResgate">Cotização do resgate *</Label>
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
              <Label htmlFor="liquidacaoResgate">Liquidação do resgate *</Label>
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
          </div>
        </div>
      )}

      {/* Fundos CVM: entrada sempre por cotas (como ação) — toggle escondido. */}
      {isCvmFund ? (
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          A posição é registrada por <strong>cotas</strong> (quantidade × preço da cota), como uma
          ação.
        </p>
      ) : (
        <div className="mb-4">
          <Label>Escolha o tipo de adição *</Label>
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name={`metodo-${formData.tipoAtivo}`}
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
                name={`metodo-${formData.tipoAtivo}`}
                value="cotas"
                checked={metodoCotas}
                onChange={() => handleInputChange('metodo', 'cotas')}
                className="mr-2"
              />
              Por preço de cota e quantidade
            </label>
          </div>
        </div>
      )}

      {(formData.metodo === 'valor' || !metodoCotas) && !isCvmFund ? (
        <div>
          <Label htmlFor="valorInvestido">Valor Investido (R$) *</Label>
          <Input
            id="valorInvestido"
            {...decimalInputProps}
            placeholder="Ex: 10000.00"
            value={getDecimalInputValue('valorInvestido')}
            onChange={handleDecimalInputChange('valorInvestido')}
            error={!!errors.valorInvestido}
            hint={errors.valorInvestido}
            min="0"
            step="0.01"
          />
        </div>
      ) : isCvmFund ? (
        <>
          <div>
            <Label htmlFor="valorInvestido">Valor Aplicado (R$) *</Label>
            <Input
              id="valorInvestido"
              {...decimalInputProps}
              placeholder="Ex: 5000,00"
              value={valorStr}
              onChange={(e) => handleValorAplicado(e.target.value)}
              error={!!errors.valorInvestido}
              hint={
                errors.valorInvestido ??
                'Quanto foi aplicado no fundo — o mesmo valor do comprovante da corretora.'
              }
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <Label htmlFor="cotacaoUnitaria">Cota do Dia (R$) *</Label>
            <Input
              id="cotacaoUnitaria"
              {...decimalInputProps}
              placeholder={quotaLookup.isLoading ? 'Buscando…' : 'Ex: 150,00'}
              value={cotaStr}
              onChange={(e) => handleCotaManual(e.target.value)}
              error={!!errors.cotacaoUnitaria}
              hint={cotaHint}
              min="0"
              step="0.00000001"
            />
          </div>
          <div>
            <Label htmlFor="quantidade">Quantidade de Cotas *</Label>
            <Input
              id="quantidade"
              {...decimalInputProps}
              placeholder="Calculada automaticamente"
              value={qtyStr}
              onChange={(e) => handleQtyManual(e.target.value)}
              error={!!errors.quantidade}
              hint={
                errors.quantidade ??
                'Calculada automaticamente: Valor Aplicado ÷ Cota do Dia. Pode ser ajustada.'
              }
              min="0"
              step="0.00000001"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <Label htmlFor="cotacaoUnitaria">Preço da Cota (R$) *</Label>
            <Input
              id="cotacaoUnitaria"
              {...decimalInputProps}
              placeholder="Ex: 150.00"
              value={getDecimalInputValue('cotacaoUnitaria')}
              onChange={(e) => {
                handleDecimalInputChange('cotacaoUnitaria')(e);
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
              value={getDecimalInputValue('quantidade')}
              onChange={(e) => {
                handleDecimalInputChange('quantidade')(e);
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
              value={
                totalCalculado > 0
                  ? totalCalculado.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : ''
              }
              disabled
              className="bg-gray-50 dark:bg-gray-800"
            />
            <p className="mt-1 text-xs text-gray-500">
              Calculado automaticamente: Quantidade × Preço por Cota
            </p>
          </div>
        </>
      )}
      <ReinvestimentoToggle
        checked={!!formData.isReinvestimento}
        onChange={(value) => handleInputChange('isReinvestimento', value)}
      />
    </>
  );
}
