'use client';

import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import Button from '@/components/ui/button/Button';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { logger } from '@/lib/logger';
import { aaToAm, amToAa } from '@/utils/rateConversion';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import {
  MOBILE_FIELD_CLASS,
  MOBILE_FIELD_ERROR_CLASS,
  MOBILE_FIELD_ERROR_TEXT_CLASS,
  MOBILE_FIELD_HINT_CLASS,
  MOBILE_FIELD_LABEL_CLASS,
  MobileNumberField,
} from '@/components/ui/sheet/MobileNumberField';
import { parseDecimalInput } from '@/lib/ui/numberInput';
import {
  useCreateDivida,
  useUpdateDivida,
  type DividaDTO,
  type DividaCreatePayload,
  type DividaModalidade,
  type DividaSistema,
  type DividaIndexador,
  type DividaTipo,
} from '@/hooks/useDividas';
import {
  INDEXADOR_LABELS,
  SISTEMA_LABELS,
  TIPO_LABELS,
  TIPOS_FINANCIAMENTO,
  TIPOS_ROTATIVA,
  currentYearMonth,
} from './utils';

interface DividaFormProps {
  divida: DividaDTO | null; // null = criar
  onCancel: () => void;
  onSaved: (id: string) => void;
  /**
   * PWA fase 3: 'sheet' = BottomSheet alto do celular (quem usa já está no ramo isBelowLg e só
   * monta o form enquanto o sheet está aberto): números com vírgula (MobileNumberField), erro no
   * próprio campo e rodapé fixo. Padrão 'inline' = o cartão de hoje.
   */
  presentation?: 'inline' | 'sheet';
}

type CampoComErro = 'nome' | 'dia';

const CAMPO_ID: Record<CampoComErro, string> = {
  nome: 'divida-nome',
  dia: 'divida-dia-vencimento',
};

/** Segmentado de 44px com semântica de radiogroup (só no sheet do celular). */
function SegmentedRadio<T extends string>({
  labelId,
  options,
  value,
  onChange,
}: {
  labelId: string;
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (value: T) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index - 1;
    if (next === null) return;
    event.preventDefault();
    const target = options[(next + options.length) % options.length][0];
    onChange(target);
    const group = event.currentTarget.parentElement;
    requestAnimationFrame(() =>
      group?.querySelector<HTMLButtonElement>(`[data-value="${target}"]`)?.focus(),
    );
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="flex gap-0.5 rounded-xl bg-gray-100 p-0.5 dark:bg-white/[0.06]"
    >
      {options.map(([v, label], index) => {
        const checked = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-value={v}
            onClick={() => onChange(v)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-[10px] px-3 text-sm font-medium whitespace-nowrap ${
              checked
                ? 'bg-mf-seguranca font-semibold text-white'
                : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SheetField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={MOBILE_FIELD_LABEL_CLASS}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-erro`} role="alert" className={MOBILE_FIELD_ERROR_TEXT_CLASS}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-dica`} className={MOBILE_FIELD_HINT_CLASS}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Form de criar/editar dívida. Campos condicionais por modalidade
 * (financiamento tem cronograma; rotativa só saldo). A taxa aceita % ao mês
 * ou % ao ano — é sempre normalizada a.m. antes do POST (aaToAm), e o modo
 * digitado fica em taxaUnidadeEntrada pra reedição fiel.
 */
export default function DividaForm({
  divida,
  onCancel,
  onSaved,
  presentation = 'inline',
}: DividaFormProps) {
  const isEdit = divida !== null;
  const isSheet = presentation === 'sheet';
  // No sheet os números aparecem com vírgula (o parse abaixo devolve o MESMO número).
  const numInicial = (n: number | null | undefined) =>
    n == null ? '' : isSheet ? String(n).replace('.', ',') : String(n);
  const [modalidade, setModalidade] = useState<DividaModalidade>(
    divida?.modalidade ?? 'financiamento',
  );

  const [nome, setNome] = useState(divida?.nome ?? '');
  const [instituicao, setInstituicao] = useState(divida?.instituicao ?? '');
  const [tipo, setTipo] = useState<DividaTipo>(
    divida?.tipo ??
      (modalidade === 'financiamento' ? 'financiamento_imobiliario' : 'cartao_credito'),
  );
  const [notes, setNotes] = useState(divida?.notes ?? '');

  // ── Financiamento ──
  const [principal, setPrincipal] = useState(() => numInicial(divida?.principal));
  const [taxaUnidade, setTaxaUnidade] = useState<'am' | 'aa'>(divida?.taxaUnidadeEntrada ?? 'am');
  const [taxaPct, setTaxaPct] = useState(() => {
    if (divida?.taxaAm == null) return '';
    const decimal =
      (divida.taxaUnidadeEntrada === 'aa' ? amToAa(divida.taxaAm) : divida.taxaAm) * 100;
    const texto = decimal.toFixed(4).replace(/\.?0+$/, '');
    return isSheet ? texto.replace('.', ',') : texto;
  });
  const [prazoMeses, setPrazoMeses] = useState(divida?.prazoMeses?.toString() ?? '');
  const [sistema, setSistema] = useState<DividaSistema>(divida?.sistema ?? 'PRICE');
  const [indexador, setIndexador] = useState<DividaIndexador>(divida?.indexador ?? 'PREFIXADO');
  const [primeiroVencimento, setPrimeiroVencimento] = useState(
    divida?.primeiroVencimento ?? currentYearMonth(),
  );

  // ── Comum às duas modalidades ──
  // Dia do vencimento (parcela do financiamento / fatura da rotativa). Só a
  // Agenda usa: o cronograma e o fluxo de caixa continuam mensais.
  const [diaVencimento, setDiaVencimento] = useState(divida?.diaVencimento?.toString() ?? '');

  // ── Rotativa ──
  const [saldoInicial, setSaldoInicial] = useState(() => numInicial(divida?.saldoInicial));
  const [dataSaldoInicial, setDataSaldoInicial] = useState(
    divida?.dataSaldoInicial ?? currentYearMonth(),
  );

  const [error, setError] = useState<string | null>(null);
  // Sheet do celular: a validação aparece no campo (aria-invalid + aria-describedby + foco).
  const [campoErro, setCampoErro] = useState<{ campo: CampoComErro; msg: string } | null>(null);
  const createDivida = useCreateDivida();
  const updateDivida = useUpdateDivida();
  const saving = createDivida.isPending || updateDivida.isPending;

  const tiposDisponiveis = modalidade === 'financiamento' ? TIPOS_FINANCIAMENTO : TIPOS_ROTATIVA;

  // Taxa normalizada a.m. (decimal) a partir do que foi digitado. Campo vazio
  // → null (em rotativa significa "sem CET informado"; financiamento usa ?? 0).
  const taxaAmNormalizada = useMemo(() => {
    if (taxaPct.trim() === '') return null;
    const pct = isSheet ? parseDecimalInput(taxaPct) : Number(taxaPct.replace(',', '.'));
    if (pct == null || !Number.isFinite(pct) || pct < 0) return null;
    const decimal = pct / 100;
    return taxaUnidade === 'aa' ? aaToAm(decimal) : decimal;
  }, [taxaPct, taxaUnidade, isSheet]);

  // Campo numérico → número do payload. Inline = o Number() de hoje; no sheet, o texto com
  // vírgula passa pelo parseDecimalInput (vazio = 0, como o Number('') do desktop).
  const toNumber = (texto: string): number => {
    if (!isSheet) return Number(texto);
    if (texto.trim() === '') return 0;
    return parseDecimalInput(texto) ?? Number.NaN;
  };

  const falhaNoCampo = (campo: CampoComErro, msg: string) => {
    if (!isSheet) {
      setError(msg);
      return;
    }
    setCampoErro({ campo, msg });
    requestAnimationFrame(() => document.getElementById(CAMPO_ID[campo])?.focus());
  };

  // Vazio = não informado (a Agenda cai no dia 1 e avisa). Fora de 1..31 vira
  // NaN e é barrado antes do POST pra não tomar 400 do zod.
  const diaVencimentoNormalizado = useMemo(() => {
    if (diaVencimento.trim() === '') return null;
    const dia = Number(diaVencimento);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) return NaN;
    return dia;
  }, [diaVencimento]);

  const handleSave = async () => {
    setError(null);
    setCampoErro(null);
    if (!nome.trim()) {
      falhaNoCampo('nome', 'Informe o nome da dívida.');
      return;
    }
    if (Number.isNaN(diaVencimentoNormalizado)) {
      falhaNoCampo('dia', 'O dia do vencimento precisa ser um número de 1 a 31.');
      return;
    }

    try {
      if (isEdit) {
        const payload =
          modalidade === 'financiamento'
            ? {
                nome: nome.trim(),
                instituicao: instituicao.trim() || null,
                tipo,
                notes: notes.trim() || null,
                diaVencimento: diaVencimentoNormalizado,
                principal: toNumber(principal),
                taxaAm: taxaAmNormalizada ?? 0,
                taxaUnidadeEntrada: taxaUnidade,
                prazoMeses: toNumber(prazoMeses),
                sistema,
                indexador,
                primeiroVencimento,
              }
            : {
                nome: nome.trim(),
                instituicao: instituicao.trim() || null,
                tipo,
                notes: notes.trim() || null,
                diaVencimento: diaVencimentoNormalizado,
                saldoInicial: toNumber(saldoInicial),
                dataSaldoInicial,
                taxaAm: taxaAmNormalizada,
                taxaUnidadeEntrada: taxaUnidade,
              };
        const updated = await updateDivida.mutateAsync({ id: divida.id, payload });
        onSaved(updated.id);
        return;
      }

      const payload: DividaCreatePayload =
        modalidade === 'financiamento'
          ? {
              modalidade: 'financiamento',
              nome: nome.trim(),
              instituicao: instituicao.trim() || null,
              tipo,
              notes: notes.trim() || null,
              diaVencimento: diaVencimentoNormalizado,
              principal: toNumber(principal),
              taxaAm: taxaAmNormalizada ?? 0,
              taxaUnidadeEntrada: taxaUnidade,
              prazoMeses: toNumber(prazoMeses),
              sistema,
              indexador,
              primeiroVencimento,
            }
          : {
              modalidade: 'rotativa',
              nome: nome.trim(),
              instituicao: instituicao.trim() || null,
              tipo,
              notes: notes.trim() || null,
              diaVencimento: diaVencimentoNormalizado,
              saldoInicial: toNumber(saldoInicial),
              dataSaldoInicial,
              taxaAm: taxaAmNormalizada,
              taxaUnidadeEntrada: taxaUnidade,
            };
      const created = await createDivida.mutateAsync(payload);
      onSaved(created.id);
    } catch (err) {
      logger.error('Erro ao salvar dívida:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar dívida.');
    }
  };

  // Mesmo campo nas duas modalidades (só muda o texto de ajuda) — montado uma
  // vez e posicionado em cada ramo do grid.
  const campoDiaVencimento = (
    <div>
      <Label htmlFor="divida-dia-vencimento">Dia do vencimento (opcional)</Label>
      <Input
        id="divida-dia-vencimento"
        type="number"
        value={diaVencimento}
        onChange={(e) => setDiaVencimento(e.target.value)}
        min="1"
        max="31"
        step="1"
        placeholder="Ex.: 10"
      />
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Dia do mês em que {modalidade === 'financiamento' ? 'a parcela vence' : 'a fatura vence'} —
        usado só para posicionar o lançamento na Agenda. Em branco, a Agenda usa o dia 1 e avisa que
        o dia não foi informado.
      </p>
    </div>
  );

  if (isSheet) {
    const erroDe = (campo: CampoComErro) => (campoErro?.campo === campo ? campoErro.msg : null);
    const campoClasse = (campo: CampoComErro) =>
      `${MOBILE_FIELD_CLASS} ${erroDe(campo) ? MOBILE_FIELD_ERROR_CLASS : ''}`;
    const limparErro = (campo: CampoComErro) => {
      if (campoErro?.campo === campo) setCampoErro(null);
    };
    const unidadeTaxa = (
      <div className="mt-2">
        <span id="divida-taxa-unidade" className="sr-only">
          Unidade da taxa
        </span>
        <SegmentedRadio
          labelId="divida-taxa-unidade"
          options={[
            ['am', 'ao mês'],
            ['aa', 'ao ano'],
          ]}
          value={taxaUnidade}
          onChange={setTaxaUnidade}
        />
      </div>
    );
    const taxaConvertida =
      taxaUnidade === 'aa' && taxaAmNormalizada != null && taxaAmNormalizada > 0
        ? `≈ ${(taxaAmNormalizada * 100).toFixed(4).replace('.', ',')}% a.m.`
        : undefined;
    const campoDia = (
      <SheetField
        id={CAMPO_ID.dia}
        label="Dia do vencimento (opcional)"
        error={erroDe('dia')}
        hint={`Dia do mês em que ${
          modalidade === 'financiamento' ? 'a parcela vence' : 'a fatura vence'
        } — só posiciona o lançamento na Agenda. Em branco, a Agenda usa o dia 1.`}
      >
        <input
          id={CAMPO_ID.dia}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          value={diaVencimento}
          onChange={(e) => {
            setDiaVencimento(e.target.value);
            limparErro('dia');
          }}
          placeholder="Ex.: 10"
          aria-invalid={erroDe('dia') ? true : undefined}
          aria-describedby={erroDe('dia') ? `${CAMPO_ID.dia}-erro` : `${CAMPO_ID.dia}-dica`}
          className={campoClasse('dia')}
        />
      </SheetField>
    );

    return (
      <BottomSheet
        isOpen={true}
        onClose={onCancel}
        title={isEdit ? 'Editar dívida' : 'Nova dívida'}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-12 flex-1 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-mf-seguranca px-4 text-sm font-semibold text-white disabled:opacity-70 dark:bg-mf-patrimonio"
            >
              {saving ? (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : null}
              {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 pt-1 pb-4">
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-[#D92D20]/30 bg-[#D92D20]/5 px-3 py-2 text-sm text-[#D92D20] dark:border-[#F97066]/30 dark:bg-[#F97066]/10 dark:text-[#F97066]"
            >
              {error}
            </p>
          ) : null}

          {!isEdit ? (
            <div>
              <span id="divida-modalidade" className={MOBILE_FIELD_LABEL_CLASS}>
                Modalidade
              </span>
              <SegmentedRadio
                labelId="divida-modalidade"
                options={[
                  ['financiamento', 'Financiamento'],
                  ['rotativa', 'Rotativa'],
                ]}
                value={modalidade}
                onChange={(value) => {
                  setModalidade(value);
                  setTipo(
                    value === 'financiamento' ? 'financiamento_imobiliario' : 'cartao_credito',
                  );
                }}
              />
              <p className={MOBILE_FIELD_HINT_CLASS}>
                {modalidade === 'financiamento'
                  ? 'Financiamento (SAC/Price)'
                  : 'Rotativa (cartão, cheque especial)'}
              </p>
            </div>
          ) : null}

          <SheetField id={CAMPO_ID.nome} label="Nome" error={erroDe('nome')}>
            <input
              id={CAMPO_ID.nome}
              type="text"
              autoComplete="off"
              enterKeyHint="next"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                limparErro('nome');
              }}
              placeholder="Ex.: Financiamento do apartamento"
              aria-invalid={erroDe('nome') ? true : undefined}
              aria-describedby={erroDe('nome') ? `${CAMPO_ID.nome}-erro` : undefined}
              className={campoClasse('nome')}
            />
          </SheetField>

          <SheetField id="divida-instituicao" label="Instituição (opcional)">
            <input
              id="divida-instituicao"
              type="text"
              autoComplete="off"
              enterKeyHint="next"
              value={instituicao}
              onChange={(e) => setInstituicao(e.target.value)}
              placeholder="Ex.: Caixa"
              className={MOBILE_FIELD_CLASS}
            />
          </SheetField>

          <SheetField id="divida-tipo" label="Tipo">
            <select
              id="divida-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as DividaTipo)}
              className={MOBILE_FIELD_CLASS}
            >
              {tiposDisponiveis.map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABELS[t]}
                </option>
              ))}
            </select>
          </SheetField>

          {modalidade === 'financiamento' ? (
            <>
              <MobileNumberField
                id="divida-principal"
                label="Valor financiado"
                kind="currency"
                prefix="R$"
                value={principal}
                onChange={setPrincipal}
                enterKeyHint="next"
              />
              <div>
                <MobileNumberField
                  id="divida-taxa"
                  label="Taxa de juros (%)"
                  kind="percent"
                  suffix="%"
                  value={taxaPct}
                  onChange={setTaxaPct}
                  hint={taxaConvertida}
                  enterKeyHint="next"
                />
                {unidadeTaxa}
              </div>
              <MobileNumberField
                id="divida-prazo"
                label="Prazo"
                kind="integer"
                suffix="meses"
                value={prazoMeses}
                onChange={setPrazoMeses}
                enterKeyHint="next"
              />
              <div>
                <span id="divida-sistema" className={MOBILE_FIELD_LABEL_CLASS}>
                  Sistema de amortização
                </span>
                <SegmentedRadio
                  labelId="divida-sistema"
                  options={[
                    ['PRICE', 'Price'],
                    ['SAC', 'SAC'],
                  ]}
                  value={sistema}
                  onChange={setSistema}
                />
                <p className={MOBILE_FIELD_HINT_CLASS}>{SISTEMA_LABELS[sistema]}</p>
              </div>
              <SheetField id="divida-indexador" label="Indexador">
                <select
                  id="divida-indexador"
                  value={indexador}
                  onChange={(e) => setIndexador(e.target.value as DividaIndexador)}
                  className={MOBILE_FIELD_CLASS}
                >
                  {(['PREFIXADO', 'TR', 'IPCA', 'IGPM', 'CDI'] as const).map((i) => (
                    <option key={i} value={i}>
                      {INDEXADOR_LABELS[i]}
                    </option>
                  ))}
                </select>
              </SheetField>
              <SheetField id="divida-vencimento" label="Primeiro vencimento">
                <input
                  id="divida-vencimento"
                  type="month"
                  value={primeiroVencimento}
                  onChange={(e) => setPrimeiroVencimento(e.target.value)}
                  className={MOBILE_FIELD_CLASS}
                />
              </SheetField>
              {campoDia}
            </>
          ) : (
            <>
              <MobileNumberField
                id="divida-saldo"
                label="Saldo devedor atual"
                kind="currency"
                prefix="R$"
                value={saldoInicial}
                onChange={setSaldoInicial}
                enterKeyHint="next"
              />
              <SheetField id="divida-data-saldo" label="Data do saldo">
                <input
                  id="divida-data-saldo"
                  type="month"
                  value={dataSaldoInicial}
                  onChange={(e) => setDataSaldoInicial(e.target.value)}
                  className={MOBILE_FIELD_CLASS}
                />
              </SheetField>
              {campoDia}
              <div>
                <MobileNumberField
                  id="divida-cet"
                  label="CET (%) — opcional"
                  kind="percent"
                  suffix="%"
                  value={taxaPct}
                  onChange={setTaxaPct}
                  hint={
                    <>
                      Custo efetivo total da dívida — usado para comparar e priorizar a quitação.
                      {taxaConvertida ? ` ${taxaConvertida}` : ''}
                    </>
                  }
                  enterKeyHint="next"
                />
                {unidadeTaxa}
              </div>
            </>
          )}

          <SheetField id="divida-notes" label="Observações (opcional)">
            <input
              id="divida-notes"
              type="text"
              autoComplete="off"
              enterKeyHint="done"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: contrato nº 1234"
              className={MOBILE_FIELD_CLASS}
            />
          </SheetField>
        </div>
      </BottomSheet>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white/90">
        {isEdit ? `Editar — ${divida.nome}` : 'Nova dívida'}
      </h3>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {/* Modalidade (só na criação) */}
      {!isEdit ? (
        <div className="mb-4 inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
          {(
            [
              ['financiamento', 'Financiamento (SAC/Price)'],
              ['rotativa', 'Rotativa (cartão, cheque especial)'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setModalidade(value);
                setTipo(value === 'financiamento' ? 'financiamento_imobiliario' : 'cartao_credito');
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                modalidade === value
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              aria-pressed={modalidade === value}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="divida-nome">Nome</Label>
          <Input
            id="divida-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Financiamento do apartamento"
          />
        </div>
        <div>
          <Label htmlFor="divida-instituicao">Instituição (opcional)</Label>
          <Input
            id="divida-instituicao"
            value={instituicao}
            onChange={(e) => setInstituicao(e.target.value)}
            placeholder="Ex.: Caixa"
          />
        </div>
        <div>
          <Label htmlFor="divida-tipo">Tipo</Label>
          <Select
            id="divida-tipo"
            value={tipo}
            onChange={(v) => setTipo(v as DividaTipo)}
            options={tiposDisponiveis.map((t) => ({ value: t, label: TIPO_LABELS[t] }))}
          />
        </div>

        {modalidade === 'financiamento' ? (
          <>
            <div>
              <Label htmlFor="divida-principal">Valor financiado (R$)</Label>
              <Input
                id="divida-principal"
                type="number"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                min="0"
                step="1000"
              />
            </div>
            <div>
              <Label htmlFor="divida-taxa">Taxa de juros (%)</Label>
              <div className="flex gap-2">
                <Input
                  id="divida-taxa"
                  type="number"
                  value={taxaPct}
                  onChange={(e) => setTaxaPct(e.target.value)}
                  min="0"
                  step="0.01"
                  className="flex-1"
                />
                <div className="inline-flex shrink-0 rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
                  {(['am', 'aa'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setTaxaUnidade(u)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                        taxaUnidade === u
                          ? 'bg-brand-500 text-white'
                          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                      aria-pressed={taxaUnidade === u}
                    >
                      {u === 'am' ? 'a.m.' : 'a.a.'}
                    </button>
                  ))}
                </div>
              </div>
              {taxaUnidade === 'aa' && taxaAmNormalizada != null && taxaAmNormalizada > 0 ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  ≈ {(taxaAmNormalizada * 100).toFixed(4)}% a.m.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="divida-prazo">Prazo (meses)</Label>
              <Input
                id="divida-prazo"
                type="number"
                value={prazoMeses}
                onChange={(e) => setPrazoMeses(e.target.value)}
                min="1"
                max="480"
                step="1"
              />
            </div>
            <div>
              <Label htmlFor="divida-sistema">Sistema de amortização</Label>
              <Select
                id="divida-sistema"
                value={sistema}
                onChange={(v) => setSistema(v as DividaSistema)}
                options={(['PRICE', 'SAC'] as const).map((s) => ({
                  value: s,
                  label: SISTEMA_LABELS[s],
                }))}
              />
            </div>
            <div>
              <Label htmlFor="divida-indexador">Indexador</Label>
              <Select
                id="divida-indexador"
                value={indexador}
                onChange={(v) => setIndexador(v as DividaIndexador)}
                options={(['PREFIXADO', 'TR', 'IPCA', 'IGPM', 'CDI'] as const).map((i) => ({
                  value: i,
                  label: INDEXADOR_LABELS[i],
                }))}
              />
            </div>
            <div>
              <Label htmlFor="divida-vencimento">Primeiro vencimento</Label>
              <Input
                id="divida-vencimento"
                type="month"
                value={primeiroVencimento}
                onChange={(e) => setPrimeiroVencimento(e.target.value)}
              />
            </div>
            {campoDiaVencimento}
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="divida-saldo">Saldo devedor atual (R$)</Label>
              <Input
                id="divida-saldo"
                type="number"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                min="0"
                step="100"
              />
            </div>
            <div>
              <Label htmlFor="divida-data-saldo">Data do saldo</Label>
              <Input
                id="divida-data-saldo"
                type="month"
                value={dataSaldoInicial}
                onChange={(e) => setDataSaldoInicial(e.target.value)}
              />
            </div>
            {campoDiaVencimento}
            {/* CET informativo (pedido ago/2026): ranqueia a dívida mais cara
                na tabela; NÃO acrui no saldo (âncora = saldo + pagamentos). */}
            <div>
              <Label htmlFor="divida-cet">CET (%) — opcional</Label>
              <div className="flex gap-2">
                <Input
                  id="divida-cet"
                  type="number"
                  value={taxaPct}
                  onChange={(e) => setTaxaPct(e.target.value)}
                  min="0"
                  step="0.01"
                  className="flex-1"
                />
                <div className="inline-flex shrink-0 rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
                  {(['am', 'aa'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setTaxaUnidade(u)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                        taxaUnidade === u
                          ? 'bg-brand-500 text-white'
                          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                      aria-pressed={taxaUnidade === u}
                    >
                      {u === 'am' ? 'a.m.' : 'a.a.'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Custo efetivo total da dívida — usado para comparar e priorizar a quitação.
                {taxaUnidade === 'aa' && taxaAmNormalizada != null && taxaAmNormalizada > 0
                  ? ` ≈ ${(taxaAmNormalizada * 100).toFixed(4)}% a.m.`
                  : ''}
              </p>
            </div>
          </>
        )}

        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="divida-notes">Observações (opcional)</Label>
          <Input
            id="divida-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: contrato nº 1234"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel} size="sm" variant="outline">
          Cancelar
        </Button>
        <Button onClick={handleSave} size="sm" disabled={saving}>
          {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Cadastrar dívida'}
        </Button>
      </div>
    </div>
  );
}
