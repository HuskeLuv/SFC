'use client';
import React, { useEffect, useRef, useState } from 'react';
import {
  RENDA_FIXA_INDEXADORES_POS,
  WizardFormData,
  rendaFixaPedeEmissor,
  rotuloProdutoRendaFixa,
} from '@/types/wizard';
import { ehInstituicaoEmissora } from '@/lib/fgc/produtosCobertos';
import { rotuloCnpj } from '@/lib/instituicoes/cnpj';
import InstitutionPicker, { type InstitutionPickerValue } from './shared/InstitutionPicker';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import BusinessDayDatePicker from './shared/BusinessDayDatePicker';
import { Step4FieldsProps } from './step4Types';
import ReinvestimentoToggle from './shared/ReinvestimentoToggle';

/** Mesma mensagem do Avançar (AddAssetWizard) quando o campo fica sem banco emissor. */
const ERRO_EMISSOR = 'Escolha o banco emissor na lista.';

type EmissorFields = Pick<
  WizardFormData,
  | 'emissorInstituicaoId'
  | 'emissorInstituicaoNome'
  | 'emissorInstituicaoCnpjRotulo'
  | 'emissorEditado'
>;

/**
 * Seção "Emissor" da renda fixa coberta pelo FGC (ClickUp 86e2xqh69). O campo nasce com a
 * corretora do passo 2 e só aceita uma opção da lista: apagar e sair volta ao valor anterior (ou à
 * corretora), então ele não fica vazio no fluxo normal. Sem corretora para voltar, mostra o erro.
 */
function EmissorSection({
  formData,
  errors,
  handleInputChange,
  onFormDataChange,
}: Pick<Step4FieldsProps, 'formData' | 'errors' | 'handleInputChange' | 'onFormDataChange'>) {
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const ultimoEmissorRef = useRef<EmissorFields | null>(null);

  useEffect(() => {
    if (!formData.emissorInstituicaoId) return;
    ultimoEmissorRef.current = {
      emissorInstituicaoId: formData.emissorInstituicaoId,
      emissorInstituicaoNome: formData.emissorInstituicaoNome,
      emissorInstituicaoCnpjRotulo: formData.emissorInstituicaoCnpjRotulo,
      emissorEditado: formData.emissorEditado,
    };
  }, [
    formData.emissorInstituicaoId,
    formData.emissorInstituicaoNome,
    formData.emissorInstituicaoCnpjRotulo,
    formData.emissorEditado,
  ]);

  const idEmissor = formData.emissorInstituicaoId;
  const mesmoDaCorretora = !!idEmissor && idEmissor === formData.instituicaoId;
  const corretoraNaoEmite =
    ehInstituicaoEmissora({ tipoBacen: formData.instituicaoTipoBacen }) === false;
  const erro = errors.emissorInstituicaoId ?? erroLocal ?? undefined;

  /** Tira o erro do campo; `id` é o emissor que acabou de ser gravado (handleInputChange regrava). */
  const limparErro = (id: string) => {
    setErroLocal(null);
    if (errors.emissorInstituicaoId) handleInputChange('emissorInstituicaoId', id);
  };

  const handleChange = (valor: InstitutionPickerValue) => {
    // Digitando: o picker manda id '' (ou o id atual, se o texto ainda é o nome escolhido).
    const escolheuDaLista = 'cnpj' in valor || 'tipoBacen' in valor;
    onFormDataChange({
      emissorInstituicaoId: valor.id,
      emissorInstituicaoNome: valor.nome,
      emissorInstituicaoCnpjRotulo: !valor.id
        ? ''
        : escolheuDaLista
          ? (rotuloCnpj({ cnpj: valor.cnpj, cnpjCalculado: valor.cnpjCalculado }) ?? '')
          : formData.emissorInstituicaoCnpjRotulo,
      emissorEditado: !valor.id || valor.id !== formData.instituicaoId,
    });
    if (valor.id) limparErro(valor.id);
  };

  // Saiu do campo sem escolher na lista: volta ao valor anterior ou à corretora.
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (formData.emissorInstituicaoId) return;
    const anterior = ultimoEmissorRef.current;
    if (anterior) {
      onFormDataChange(anterior);
      limparErro(anterior.emissorInstituicaoId);
      return;
    }
    if (formData.instituicaoId) {
      onFormDataChange({
        emissorInstituicaoId: formData.instituicaoId,
        emissorInstituicaoNome: formData.instituicao,
        emissorInstituicaoCnpjRotulo: formData.instituicaoCnpjRotulo,
        emissorEditado: false,
      });
      limparErro(formData.instituicaoId);
      return;
    }
    setErroLocal(ERRO_EMISSOR);
  };

  return (
    <section
      aria-labelledby="emissor-titulo"
      data-mf-emissor=""
      className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2"
    >
      <h4
        id="emissor-titulo"
        className="text-sm font-semibold text-gray-800 dark:text-white/90 mb-3"
      >
        Emissor
      </h4>
      <div onBlur={handleBlur}>
        <InstitutionPicker
          inputId="emissorInstituicao"
          endpoint="/api/institutions?papel=emissor"
          label="Banco emissor *"
          placeholder="Busque pelo nome ou CNPJ do banco"
          selectedId={idEmissor}
          selectedName={formData.emissorInstituicaoNome}
          onChange={handleChange}
          error={erro}
          onErrorClear={() => setErroLocal(null)}
          emptyMessage={
            <span className="flex flex-col gap-1 text-left">
              <span className="font-medium text-gray-900 dark:text-white">
                Nenhum banco encontrado para “{formData.emissorInstituicaoNome.trim()}”
              </span>
              <span>Confira o nome na nota de negociação ou busque pelo CNPJ.</span>
            </span>
          }
        />
      </div>

      {!erro && mesmoDaCorretora && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span
            data-mf-emissor-pill=""
            className="inline-flex items-center whitespace-nowrap rounded-full border border-[#DCE6F2] bg-[#EDF2F8] px-2.5 py-0.5 text-xs font-medium text-mf-seguranca dark:border-mf-tranquilidade/30 dark:bg-mf-tranquilidade/[0.14] dark:text-mf-escolha"
          >
            Mesmo da corretora
          </span>
          {!corretoraNaoEmite && (
            <p className="text-[13px] text-gray-600 dark:text-gray-400">
              Preenchido com a corretora. Troque se o título for de outro banco.
            </p>
          )}
        </div>
      )}
      {!erro && mesmoDaCorretora && corretoraNaoEmite && (
        <p
          data-mf-emissor-aviso=""
          className="mt-2 rounded-lg border border-[#D97706]/30 bg-[#D97706]/[0.07] px-3 py-2 text-[13px] text-[#B45309] dark:border-[#FBBF24]/30 dark:bg-[#FBBF24]/[0.07] dark:text-[#FBBF24]"
        >
          Corretoras normalmente não emitem títulos. Confira o banco emissor na nota de negociação.
        </p>
      )}
      {!erro && idEmissor && !mesmoDaCorretora && (
        <p className="mt-2 text-[13px] text-gray-600 dark:text-gray-400">
          {formData.emissorInstituicaoCnpjRotulo
            ? `${formData.emissorInstituicaoCnpjRotulo} · `
            : ''}
          Para o FGC, este título conta no limite do{' '}
          {formData.emissorInstituicaoNome.replace(/\.$/, '')}.
        </p>
      )}

      <details className="mt-1 text-[13px] text-gray-600 dark:text-gray-400">
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md font-medium text-mf-patrimonio outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside dark:text-mf-tranquilidade dark:focus-visible:ring-mf-tranquilidade">
          Por que pedimos o emissor?
        </summary>
        <p className="mb-1 max-w-prose rounded-lg border border-[#DCE6F2] bg-[#EDF2F8] px-3 py-2.5 text-mf-seguranca dark:border-mf-tranquilidade/30 dark:bg-mf-tranquilidade/[0.14] dark:text-gray-200">
          O FGC garante até R$ 250 mil por CPF em cada banco que emitiu o título, não na corretora.
          Títulos do mesmo banco comprados em corretoras diferentes somam no mesmo limite.
        </p>
      </details>
    </section>
  );
}

export default function Step4RendaFixaFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
  onFormDataChange,
}: Step4FieldsProps) {
  const isPre = formData.tipoAtivo === 'renda-fixa';
  const isPos = formData.tipoAtivo === 'renda-fixa-posfixada';
  const isHib = formData.tipoAtivo === 'renda-fixa-hibrida';

  // Híbrida não usa "Taxa sobre o Indexador": é só indexador (CDI/IPCA) + Taxa
  // Fixa Anual (ex.: IPCA + 6%). O campo abaixo só aparece em pré e pós-fixada.
  const taxaLabel = isPre ? 'Taxa Pré (% ao ano) *' : 'Taxa sobre o Indexador (%) *';

  const taxaPlaceholder = isPre ? 'Ex: 12.5' : 'Ex: 100 (100% CDI) ou 110 (110% CDI)';

  const taxaHint = isPre
    ? 'Taxa fixa anual paga até o vencimento.'
    : 'Percentual do indexador que o título paga (ex.: 100 = 100% do CDI).';

  const produto = rotuloProdutoRendaFixa(formData);

  return (
    <>
      {/* Contexto do título: por qual corretora entrou e qual produto é. */}
      {formData.instituicao && (
        <p
          data-mf-rf-via=""
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-400"
        >
          <span className="min-w-0">
            Via{' '}
            <b className="font-semibold text-gray-900 dark:text-white">{formData.instituicao}</b>
          </span>
          {produto && (
            <>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gray-400" />
              <span>{produto}</span>
            </>
          )}
        </p>
      )}

      {/* === Seção: Identificação === */}
      <div>
        <Label htmlFor="descricao">Descrição / Apelido *</Label>
        <Input
          id="descricao"
          type="text"
          placeholder="Ex: CDB Banco do Brasil 2026"
          value={formData.descricao}
          onChange={(e) => handleInputChange('descricao', e.target.value)}
          error={!!errors.descricao}
          hint={errors.descricao}
        />
      </div>

      {rendaFixaPedeEmissor(formData) && (
        <EmissorSection
          formData={formData}
          errors={errors}
          handleInputChange={handleInputChange}
          onFormDataChange={onFormDataChange}
        />
      )}

      {/* === Seção: Datas (início + vencimento juntos) === */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90 mb-3">
          Prazo do título
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* #4 (checklist mai/28): com dois pickers lado a lado, o calendar
              renderizado inline (staticPosition default) ficava cortado pela
              coluna vizinha. appendToBody={true} faz o flatpickr flutuar
              livre do grid. */}
          <BusinessDayDatePicker
            id="dataInicio"
            label="Data do Início *"
            placeholder="Selecione a data"
            value={formData.dataInicio}
            onChange={(iso) => handleInputChange('dataInicio', iso)}
            error={errors.dataInicio}
            staticPosition={false}
            appendToBody
          />
          <div>
            <DatePicker
              nativeOnMobile
              id="dataVencimento"
              label="Data de Vencimento *"
              placeholder="Selecione a data"
              defaultDate={formData.dataVencimento}
              staticPosition={false}
              appendToBody
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
        </div>
      </div>

      {/* === Seção: Valor aplicado === */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
        <Label htmlFor="valorAplicado">Valor Aplicado (R$) *</Label>
        <Input
          id="valorAplicado"
          {...decimalInputProps}
          placeholder="Ex: 10000.00"
          value={getDecimalInputValue('valorAplicado')}
          onChange={handleDecimalInputChange('valorAplicado')}
          error={!!errors.valorAplicado}
          hint={errors.valorAplicado}
          min="0"
          step="0.01"
        />
      </div>

      {/* === Seção: Rentabilidade (indexador + taxa juntos) === */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90 mb-3">
          Rentabilidade
        </h4>
        <div className="space-y-4">
          {(isPos || isHib) && (
            <div>
              <Label htmlFor="rendaFixaIndexer">Indexador *</Label>
              <Select
                options={RENDA_FIXA_INDEXADORES_POS}
                placeholder="Selecione o indexador"
                defaultValue={formData.rendaFixaIndexer}
                onChange={(value) => handleInputChange('rendaFixaIndexer', value)}
                className={errors.rendaFixaIndexer ? 'border-red-500' : ''}
              />
              {errors.rendaFixaIndexer && (
                <p className="mt-1 text-sm text-red-500">{errors.rendaFixaIndexer}</p>
              )}
            </div>
          )}
          {isHib && (
            <div>
              <Label htmlFor="taxaFixaAnual">Taxa Fixa Anual (%) *</Label>
              <Input
                id="taxaFixaAnual"
                {...decimalInputProps}
                placeholder="Ex: 6 (IPCA + 6%)"
                value={getDecimalInputValue('taxaFixaAnual')}
                onChange={handleDecimalInputChange('taxaFixaAnual')}
                error={!!errors.taxaFixaAnual}
                hint={
                  errors.taxaFixaAnual ?? 'Parte fixa anual somada ao indexador (ex.: IPCA + 6%).'
                }
                min="0"
                step="0.01"
              />
            </div>
          )}
          {!isHib && (
            <div>
              <Label htmlFor="taxaJurosAnual">{taxaLabel}</Label>
              <Input
                id="taxaJurosAnual"
                {...decimalInputProps}
                placeholder={taxaPlaceholder}
                value={getDecimalInputValue('taxaJurosAnual')}
                onChange={handleDecimalInputChange('taxaJurosAnual')}
                error={!!errors.taxaJurosAnual}
                hint={errors.taxaJurosAnual ?? taxaHint}
                min="0"
                step="0.01"
              />
            </div>
          )}
        </div>
      </div>

      <div className="hidden">
        <Label htmlFor="rendaFixaIndexer">Indexador</Label>
        <Select
          options={[
            { value: 'PRE', label: 'Pré' },
            { value: 'CDI', label: 'CDI' },
            { value: 'IPCA', label: 'IPCA' },
          ]}
          placeholder="Selecione o indexador"
          defaultValue={formData.tipoAtivo === 'renda-fixa' ? 'PRE' : formData.rendaFixaIndexer}
          onChange={(value) => handleInputChange('rendaFixaIndexer', value)}
        />
        <Label htmlFor="rendaFixaLiquidity">Liquidez</Label>
        <Select
          options={[
            { value: 'DAILY', label: 'Diária' },
            { value: 'MATURITY', label: 'No vencimento' },
          ]}
          placeholder="Selecione a liquidez"
          defaultValue={formData.rendaFixaLiquidity}
          onChange={(value) => handleInputChange('rendaFixaLiquidity', value)}
        />
        <div className="flex items-center gap-2">
          <input
            id="rendaFixaTaxExempt"
            type="checkbox"
            checked={!!formData.rendaFixaTaxExempt}
            onChange={(e) => handleInputChange('rendaFixaTaxExempt', e.target.checked)}
          />
          <Label htmlFor="rendaFixaTaxExempt">Isento de IR</Label>
        </div>
      </div>
      <ReinvestimentoToggle
        checked={!!formData.isReinvestimento}
        onChange={(value) => handleInputChange('isReinvestimento', value)}
      />
    </>
  );
}
