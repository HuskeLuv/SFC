'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import MobileNumberField, {
  MOBILE_FIELD_CLASS,
  MOBILE_FIELD_LABEL_CLASS,
  type MobileNumberKind,
} from '@/components/ui/sheet/MobileNumberField';
import { MobileStatusPill } from '@/components/ui/mobile/MobileStatusPill';
import { formatDecimalInput, parseDecimalInput } from '@/lib/ui/numberInput';
import {
  conservadora80,
  getRealAA,
  getRealM,
  getRetiroNom,
  getRetiroRealAA,
  type AposentadoriaEvento,
  type ProjecaoResult,
} from '@/services/planejamento/aposentadoria';
import type { PlanoUpsertPayload } from '@/hooks/useAposentadoria';
import { PARAM_FIELDS, type ParamFieldKey, type ParamFieldMeta } from '../LeftPanel';
import type { AutoField, AutoValues } from '../autoFields';
import { formatBRL, formatBRLCompact, fPct, MONTH_OPTIONS } from '../utils';

/** Texto do campo a partir do número (vírgula decimal; moeda com 2 casas). */
export function formatParamInput(kind: MobileNumberKind, value: number): string {
  if (!Number.isFinite(value)) return '';
  if (kind === 'currency') return formatDecimalInput(value);
  if (kind === 'integer') return String(value);
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false });
}

interface ParamInputProps {
  id: string;
  label: ReactNode;
  kind: MobileNumberKind;
  value: number;
  /** Recebe o NÚMERO (o mesmo que o campo do desktop manda ao onChange). */
  onValue: (value: number) => void;
  /** Como o MoneyField do desktop: `Math.max(0, n)`. */
  nonNegative?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  autoFocus?: boolean;
}

/**
 * Campo numérico do sheet: o usuário digita com vírgula ('10,5'), o texto fica como digitado e o
 * número (parseDecimalInput) vai para o mesmo onChange do desktop. Entrada vazia ou parcial não
 * envia nada. Se o valor mudar por fora (atalho "usar carteira", "voltar ao automático"), o texto
 * acompanha.
 */
function ParamInput({
  id,
  label,
  kind,
  value,
  onValue,
  nonNegative,
  prefix,
  suffix,
  autoFocus,
}: ParamInputProps) {
  const [text, setText] = useState(() => formatParamInput(kind, value));
  const sentRef = useRef<number>(value);

  useEffect(() => {
    if (value === sentRef.current) return;
    sentRef.current = value;
    setText(formatParamInput(kind, value));
  }, [value, kind]);

  const handleChange = (next: string) => {
    setText(next);
    const parsed = parseDecimalInput(next);
    if (parsed == null) return;
    const n = nonNegative ? Math.max(0, parsed) : parsed;
    sentRef.current = n;
    onValue(n);
  };

  return (
    <MobileNumberField
      id={id}
      label={label}
      kind={kind}
      value={text}
      onChange={handleChange}
      prefix={prefix}
      suffix={suffix}
      autoFocus={autoFocus}
    />
  );
}

const GROUP_TITLE =
  'mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400';
const SHORTCUT =
  'inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-3 text-sm font-medium text-mf-patrimonio disabled:opacity-50 dark:border-gray-700 dark:text-mf-tranquilidade';

/** Procedência do campo auto (mesma lógica do AutoBadge do painel), com atalho de 44px. */
function AutoHint({
  field,
  locked,
  autoValue,
  label,
  format,
  onResync,
}: {
  field: AutoField;
  locked: boolean;
  autoValue: number | null;
  label: string;
  format: (v: number) => string;
  onResync: (field: AutoField) => void;
}) {
  if (autoValue == null && !locked) return null;
  if (!locked) {
    return (
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        <span aria-hidden>✦</span> auto · {label}
      </p>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span>
        <span aria-hidden>✎</span> manual
      </span>
      {autoValue != null ? (
        <button type="button" onClick={() => onResync(field)} className={SHORTCUT}>
          ↺ usar {format(autoValue)} ({label})
        </button>
      ) : null}
    </div>
  );
}

export interface PremissasSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Campo que recebe o foco ao abrir (o valor tocado no cartão). */
  focusField?: ParamFieldKey | null;
  params: PlanoUpsertPayload;
  projection: ProjecaoResult | null;
  /** O MESMO handleChange do painel do desktop (trava o campo auto e agenda o autosave). */
  onChange: (patch: Partial<PlanoUpsertPayload>) => void;
  autoValues: AutoValues;
  onResync: (field: AutoField) => void;
  rentCarteiraAA: number | null;
  rentCarteiraLoading: boolean;
  onUseCarteira: () => void;
}

/**
 * Sheet alto de premissas do simulador (PWA fase 3, P2). Os mesmos campos do LeftPanel, agrupados
 * (Início, Perfil, Taxas, Acumulação, Aposentadoria e Eventos pontuais), com MobileNumberField
 * (vírgula decimal, fonte de 16px) no lugar de type=number e sem os sliders. Cada número vai para
 * o mesmo `onChange` do desktop — mesmo autosave com debounce. A faixa fixa no topo mostra o
 * resultado ao vivo (o gráfico atrás do sheet também recalcula).
 */
export default function PremissasSheet({
  isOpen,
  onClose,
  focusField,
  params,
  projection,
  onChange,
  autoValues,
  onResync,
  rentCarteiraAA,
  rentCarteiraLoading,
  onUseCarteira,
}: PremissasSheetProps) {
  const lockSet = new Set(params.fieldLocks);
  const hint = (field: AutoField, format: (v: number) => string) => (
    <AutoHint
      field={field}
      locked={lockSet.has(field)}
      autoValue={autoValues[field].autoValue}
      label={autoValues[field].label}
      format={format}
      onResync={onResync}
    />
  );
  const fmtPct = (v: number) => fPct(v);

  const realAA = getRealAA(params) * 100;
  const realM = getRealM(params) * 100;
  const retiroNom = getRetiroNom(params);
  const retiroRealAA = getRetiroRealAA(params) * 100;

  const valueOf = (key: ParamFieldKey): number =>
    key === 'rentNomRetiro' ? retiroNom : params[key];

  // Os atalhos ficam FORA do MobileNumberField (a dica dele é um <p>; aqui há botões).
  const field = (meta: ParamFieldMeta, extra?: ReactNode) => (
    <div key={meta.key} data-premissa-campo={meta.key}>
      <ParamInput
        id={`premissa-${meta.key}`}
        label={meta.label}
        kind={meta.kind}
        value={valueOf(meta.key)}
        nonNegative={meta.kind === 'currency'}
        onValue={(n) => onChange({ [meta.key]: n } as Partial<PlanoUpsertPayload>)}
        prefix={meta.kind === 'currency' ? 'R$' : undefined}
        suffix={meta.kind === 'percent' ? '%' : meta.kind === 'integer' ? 'anos' : undefined}
        autoFocus={focusField === meta.key}
      />
      {extra}
    </div>
  );

  const eventos = params.eventos;
  const updateEvento = (idx: number, patch: Partial<AposentadoriaEvento>) => {
    onChange({ eventos: eventos.map((e, i) => (i === idx ? { ...e, ...patch } : e)) });
  };
  const removeEvento = (idx: number) => {
    onChange({ eventos: eventos.filter((_, i) => i !== idx) });
  };
  const addEvento = () => {
    onChange({
      eventos: [
        ...eventos,
        { tipo: 'aporte', idade: Math.round((params.idade + params.apos) / 2), valor: 10000 },
      ],
    });
  };

  // ── Resumo ao vivo ──
  let resumo: ReactNode;
  if (!projection) {
    resumo = (
      <MobileStatusPill tone="atencao">
        A expectativa de vida deve ser maior que a idade de aposentadoria.
      </MobileStatusPill>
    );
  } else {
    const nuncaAcaba = !Number.isFinite(projection.idadeAcaba) || projection.idadeAcaba > 110;
    const acabaAntes = !nuncaAcaba && projection.idadeAcaba < params.vida;
    const dura = nuncaAcaba ? 'sempre' : `${projection.idadeAcaba.toFixed(0)} anos`;
    resumo = (
      <p className="text-sm text-gray-700 dark:text-gray-200">
        Aos {params.apos}:{' '}
        <strong className="tabular-nums text-gray-900 dark:text-white">
          {formatBRLCompact(projection.Pr)}
        </strong>{' '}
        · Renda dura até{' '}
        {acabaAntes ? (
          <MobileStatusPill tone="atencao" className="text-sm">
            {dura}
          </MobileStatusPill>
        ) : (
          <strong className="text-gray-900 dark:text-white">{dura}</strong>
        )}
      </p>
    );
  }

  const selectClass = `${MOBILE_FIELD_CLASS} appearance-auto`;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Premissas"
      className="h-[calc(100dvh-env(safe-area-inset-top)-12px)]"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-xl bg-mf-patrimonio text-base font-semibold text-white"
        >
          Pronto
        </button>
      }
    >
      <div
        data-premissas-resumo=""
        aria-live="polite"
        className="sticky top-0 z-10 -mx-4 border-b border-gray-100 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900"
      >
        {resumo}
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          O gráfico e os números mudam enquanto você digita. Salva sozinho.
        </p>
      </div>

      <div className="pb-4">
        {/* Início */}
        <h3 className={GROUP_TITLE}>Início do acompanhamento</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="premissa-trackStartMonth" className={MOBILE_FIELD_LABEL_CLASS}>
              Mês
            </label>
            <select
              id="premissa-trackStartMonth"
              value={params.trackStartMonth}
              onChange={(e) => onChange({ trackStartMonth: Number(e.target.value) })}
              className={selectClass}
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <ParamInput
            id="premissa-trackStartYear"
            label="Ano"
            kind="integer"
            value={params.trackStartYear}
            onValue={(n) => onChange({ trackStartYear: n })}
          />
        </div>

        {/* Perfil */}
        <h3 className={GROUP_TITLE}>Perfil</h3>
        <div className="grid grid-cols-1 gap-3">
          {field(PARAM_FIELDS.idade)}
          {field(PARAM_FIELDS.apos)}
          {field(PARAM_FIELDS.vida)}
        </div>

        {/* Taxas */}
        <h3 className={GROUP_TITLE}>Taxas</h3>
        <div className="grid grid-cols-1 gap-3">
          {field(
            PARAM_FIELDS.rentNom,
            <>
              {hint('rentNom', fmtPct)}
              <button
                type="button"
                onClick={onUseCarteira}
                disabled={rentCarteiraLoading}
                className={`${SHORTCUT} mt-1.5`}
              >
                {rentCarteiraLoading
                  ? 'calculando…'
                  : rentCarteiraAA != null
                    ? `Usar minha carteira (${fPct(rentCarteiraAA)} a.a.)`
                    : 'Usar o retorno da minha carteira'}
              </button>
            </>,
          )}
          {field(PARAM_FIELDS.inflacao, hint('inflacao', fmtPct))}
          <div className="flex flex-wrap items-center gap-2">
            <MobileStatusPill tone={realAA >= 0 ? 'ok' : 'problema'}>
              Real a.a.: {fPct(realAA, 2)}
            </MobileStatusPill>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ≈ {fPct(realM, 3)} a.m.
            </span>
          </div>
          {field(
            PARAM_FIELDS.rentNomRetiro,
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <MobileStatusPill tone={retiroRealAA >= 0 ? 'ok' : 'problema'}>
                Real apos.: {fPct(retiroRealAA, 2)}
              </MobileStatusPill>
              <button
                type="button"
                onClick={() => onChange({ rentNomRetiro: null })}
                className={SHORTCUT}
              >
                ↺ igual acumulação
              </button>
              <button
                type="button"
                onClick={() => onChange({ rentNomRetiro: conservadora80(params) })}
                className={SHORTCUT}
              >
                Conservador 80%
              </button>
            </div>,
          )}
        </div>

        {/* Acumulação */}
        <h3 className={GROUP_TITLE}>Acumulação</h3>
        <div className="grid grid-cols-1 gap-3">
          {field(PARAM_FIELDS.patrimonio, hint('patrimonio', formatBRL))}
          {field(PARAM_FIELDS.aporteM, hint('aporteM', formatBRL))}
        </div>

        {/* Aposentadoria */}
        <h3 className={GROUP_TITLE}>Aposentadoria</h3>
        {field(PARAM_FIELDS.renda, hint('renda', formatBRL))}

        {/* Eventos pontuais */}
        <h3 className={GROUP_TITLE}>Eventos pontuais</h3>
        <div className="space-y-2">
          {eventos.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum evento.</p>
          ) : (
            eventos.map((e, idx) => (
              <div
                key={idx}
                data-premissa-evento=""
                className="rounded-2xl border border-gray-200 p-3 dark:border-gray-800"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`evento-${idx}-tipo`} className={MOBILE_FIELD_LABEL_CLASS}>
                      Tipo
                    </label>
                    <select
                      id={`evento-${idx}-tipo`}
                      value={e.tipo}
                      onChange={(ev) =>
                        updateEvento(idx, { tipo: ev.target.value as 'aporte' | 'resgate' })
                      }
                      className={selectClass}
                    >
                      <option value="aporte">Aporte</option>
                      <option value="resgate">Resgate</option>
                    </select>
                  </div>
                  <ParamInput
                    id={`evento-${idx}-idade`}
                    label="Aos"
                    kind="integer"
                    suffix="anos"
                    value={e.idade}
                    onValue={(n) => updateEvento(idx, { idade: n })}
                  />
                </div>
                <div className="mt-3">
                  <ParamInput
                    id={`evento-${idx}-valor`}
                    label="Valor"
                    kind="currency"
                    prefix="R$"
                    nonNegative
                    value={e.valor}
                    onValue={(n) => updateEvento(idx, { valor: n })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeEvento(idx)}
                  aria-label={`Remover evento ${idx + 1}`}
                  className="mt-2 inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold text-[#D92D20] dark:text-[#F97066]"
                >
                  Remover
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={addEvento}
            className="h-12 w-full rounded-xl border border-dashed border-gray-300 text-sm font-semibold text-mf-patrimonio dark:border-gray-700 dark:text-mf-tranquilidade"
          >
            + Adicionar evento
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
