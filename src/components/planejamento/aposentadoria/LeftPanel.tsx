'use client';

import { useId } from 'react';
import {
  getRealAA,
  getRealM,
  getRetiroNom,
  getRetiroRealAA,
  conservadora80,
  type AposentadoriaEvento,
} from '@/services/planejamento/aposentadoria';
import type { PlanoUpsertPayload } from '@/hooks/useAposentadoria';
import { formatBRL, fPct, MONTH_OPTIONS } from './utils';
import type { AutoField, AutoValues } from './autoFields';

interface LeftPanelProps {
  params: PlanoUpsertPayload;
  onChange: (patch: Partial<PlanoUpsertPayload>) => void;
  autoValues: AutoValues;
  onResync: (field: AutoField) => void;
  /** Rentabilidade anualizada da própria carteira (fonte alternativa ao CDI). */
  rentCarteiraAA: number | null;
  rentCarteiraLoading: boolean;
  onUseCarteira: () => void;
}

// ── Metadados dos campos (compartilhados com o PremissasSheet do celular) ──

/** Campos numéricos do plano editáveis no painel (as 9 premissas). */
export type ParamFieldKey =
  | 'idade'
  | 'apos'
  | 'vida'
  | 'rentNom'
  | 'inflacao'
  | 'rentNomRetiro'
  | 'patrimonio'
  | 'aporteM'
  | 'renda';

export interface ParamFieldMeta {
  key: ParamFieldKey;
  /** Rótulo do painel (desktop) e do sheet do celular. */
  label: string;
  /** Rótulo curto do cartão "Premissas" do celular. */
  cardLabel: string;
  group: 'perfil' | 'taxas' | 'acumulacao' | 'aposentadoria';
  kind: 'integer' | 'percent' | 'currency';
  min: number;
  /** Limite do campo/slider (idade, taxas) ou do slider de valor (moeda). */
  max: number;
  step: number;
}

/**
 * As 9 premissas do plano: chave, rótulo, grupo, tipo e limites. O painel do desktop lê daqui os
 * mesmos rótulos e limites de sempre; o PremissasSheet (celular) monta os mesmos campos.
 */
export const PARAM_FIELDS: Record<ParamFieldKey, ParamFieldMeta> = {
  idade: {
    key: 'idade',
    label: 'Idade',
    cardLabel: 'Idade atual',
    group: 'perfil',
    kind: 'integer',
    min: 1,
    max: 79,
    step: 1,
  },
  apos: {
    key: 'apos',
    label: 'Aposenta',
    cardLabel: 'Aposenta aos',
    group: 'perfil',
    kind: 'integer',
    min: 1,
    max: 85,
    step: 1,
  },
  vida: {
    key: 'vida',
    label: 'Exp. vida',
    cardLabel: 'Expectativa',
    group: 'perfil',
    kind: 'integer',
    min: 3,
    max: 105,
    step: 1,
  },
  rentNom: {
    key: 'rentNom',
    label: 'Rentabilidade nominal a.a.',
    cardLabel: 'Rentab. nominal',
    group: 'taxas',
    kind: 'percent',
    min: 4,
    max: 30,
    step: 0.5,
  },
  inflacao: {
    key: 'inflacao',
    label: 'Expectativa de inflação a.a.',
    cardLabel: 'Inflação',
    group: 'taxas',
    kind: 'percent',
    min: 2,
    max: 30,
    step: 0.5,
  },
  rentNomRetiro: {
    key: 'rentNomRetiro',
    label: 'Rent. nominal na aposentadoria a.a.',
    cardLabel: 'Rentab. na aposentadoria',
    group: 'taxas',
    kind: 'percent',
    min: 4,
    max: 30,
    step: 0.5,
  },
  patrimonio: {
    key: 'patrimonio',
    label: 'Patrimônio inicial',
    cardLabel: 'Patrimônio atual',
    group: 'acumulacao',
    kind: 'currency',
    min: 0,
    max: 1_000_000,
    step: 1000,
  },
  aporteM: {
    key: 'aporteM',
    label: 'Aportes mensais',
    cardLabel: 'Aporte mensal',
    group: 'acumulacao',
    kind: 'currency',
    min: 0,
    max: 30_000,
    step: 100,
  },
  renda: {
    key: 'renda',
    label: 'Renda desejada (R$ de hoje)',
    cardLabel: 'Renda desejada',
    group: 'aposentadoria',
    kind: 'currency',
    min: 0,
    max: 100_000,
    step: 500,
  },
};

const F = PARAM_FIELDS;

// ── Subcomponentes de campo ──────────────────────────────────────────────

function SectionTitle({ dotColor, children }: { dotColor: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {children}
      </span>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
  showNumber = true,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  onChange: (v: number) => void;
  showNumber?: boolean;
  hint?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-xs text-gray-500 dark:text-gray-400">
          {label}
        </label>
        <span className="text-xs font-semibold text-gray-800 dark:text-white/90">
          {display ?? value}
        </span>
      </div>
      {showNumber ? (
        <input
          id={`${id}-n`}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mb-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-center text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      ) : null}
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="block w-full accent-brand-500"
      />
      {hint}
    </div>
  );
}

function MoneyField({
  label,
  value,
  sliderMax,
  step = 100,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  sliderMax: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-xs text-gray-500 dark:text-gray-400">
          {label}
        </label>
        <span className="text-xs font-semibold text-gray-800 dark:text-white/90">
          {formatBRL(value)}
        </span>
      </div>
      <div className="flex">
        <span className="flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-100 px-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          R$
        </span>
        <input
          id={id}
          type="number"
          value={value}
          min={0}
          step={step}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          className="w-full rounded-r-md border border-gray-300 bg-white px-2 py-1.5 text-right text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>
      <input
        type="range"
        value={Math.min(value, sliderMax)}
        min={0}
        max={sliderMax}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-full accent-brand-500"
      />
      {hint}
    </div>
  );
}

/**
 * Badge de procedência do modelo híbrido: mostra se o campo está em modo
 * automático (espelha carteira/fluxo de caixa) ou manual (travado pelo
 * usuário), com atalho para voltar ao automático.
 */
export function AutoBadge({
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
      <p className="mt-1 flex items-center gap-1 text-[10px] text-brand-600 dark:text-brand-400">
        <span aria-hidden>✦</span> auto · {label}
      </p>
    );
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-gray-400">
      <span aria-hidden>✎</span> manual
      {autoValue != null ? (
        <button
          type="button"
          onClick={() => onResync(field)}
          className="rounded border border-gray-300 px-1.5 py-0.5 text-brand-600 hover:bg-brand-50 dark:border-gray-700 dark:text-brand-400 dark:hover:bg-brand-900/10"
          title={`Voltar ao automático (${label})`}
        >
          ↺ usar {format(autoValue)} ({label})
        </button>
      ) : null}
    </p>
  );
}

// ── Painel ────────────────────────────────────────────────────────────────

export default function LeftPanel({
  params,
  onChange,
  autoValues,
  onResync,
  rentCarteiraAA,
  rentCarteiraLoading,
  onUseCarteira,
}: LeftPanelProps) {
  const lockSet = new Set(params.fieldLocks);
  const badge = (field: AutoField, format: (v: number) => string) => (
    <AutoBadge
      field={field}
      locked={lockSet.has(field)}
      autoValue={autoValues[field].autoValue}
      label={autoValues[field].label}
      format={format}
      onResync={onResync}
    />
  );
  const fmtPct = (v: number) => fPct(v);

  // Hint do rentNom: badge CDI/manual + atalho para usar a rentabilidade da
  // própria carteira (3 fontes: CDI, carteira, manual).
  const rentNomHint = (
    <div>
      {badge('rentNom', fmtPct)}
      <button
        type="button"
        onClick={onUseCarteira}
        disabled={rentCarteiraLoading}
        className="mt-1 rounded border border-gray-300 px-1.5 py-0.5 text-[10px] text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:border-gray-700 dark:text-brand-400 dark:hover:bg-brand-900/10"
        title="Usar o retorno anualizado histórico da sua carteira"
      >
        {rentCarteiraLoading
          ? 'calculando…'
          : rentCarteiraAA != null
            ? `📈 usar minha carteira (${fPct(rentCarteiraAA)} a.a.)`
            : '📈 usar rentab. da minha carteira'}
      </button>
    </div>
  );

  const realAA = getRealAA(params) * 100;
  const realM = getRealM(params) * 100;
  const retiroNom = getRetiroNom(params);
  const retiroRealAA = getRetiroRealAA(params) * 100;
  const retiroDiferente = retiroNom !== params.rentNom;

  const eventos = params.eventos;
  const updateEvento = (idx: number, patch: Partial<AposentadoriaEvento>) => {
    const next = eventos.map((e, i) => (i === idx ? { ...e, ...patch } : e));
    onChange({ eventos: next });
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

  return (
    <div className="space-y-4">
      {/* Início */}
      <section>
        <SectionTitle dotColor="#B8935A">Início do Acompanhamento</SectionTitle>
        <div className="flex gap-2">
          <select
            value={params.trackStartMonth}
            onChange={(e) => onChange({ trackStartMonth: Number(e.target.value) })}
            className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={params.trackStartYear}
            min={2000}
            max={2100}
            onChange={(e) => onChange({ trackStartYear: Number(e.target.value) })}
            className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-center text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
      </section>

      <hr className="border-gray-200 dark:border-gray-800" />

      {/* Perfil */}
      <section>
        <SectionTitle dotColor="#465FFF">Perfil</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <SliderField
            label={F.idade.label}
            value={params.idade}
            min={F.idade.min}
            max={F.idade.max}
            onChange={(v) => onChange({ idade: v })}
          />
          <SliderField
            label={F.apos.label}
            value={params.apos}
            min={F.apos.min}
            max={F.apos.max}
            onChange={(v) => onChange({ apos: v })}
          />
          <SliderField
            label={F.vida.label}
            value={params.vida}
            min={F.vida.min}
            max={F.vida.max}
            onChange={(v) => onChange({ vida: v })}
          />
        </div>
      </section>

      <hr className="border-gray-200 dark:border-gray-800" />

      {/* Taxas */}
      <section>
        <SectionTitle dotColor="#3B6D11">Taxas</SectionTitle>
        <SliderField
          label={F.rentNom.label}
          value={params.rentNom}
          min={F.rentNom.min}
          max={F.rentNom.max}
          step={F.rentNom.step}
          display={fPct(params.rentNom)}
          showNumber={false}
          onChange={(v) => onChange({ rentNom: v })}
          hint={rentNomHint}
        />
        <SliderField
          label={F.inflacao.label}
          value={params.inflacao}
          min={F.inflacao.min}
          max={F.inflacao.max}
          step={F.inflacao.step}
          display={fPct(params.inflacao)}
          showNumber={false}
          onChange={(v) => onChange({ inflacao: v })}
          hint={badge('inflacao', fmtPct)}
        />
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              realAA >= 0
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
            }`}
          >
            Real a.a.: {fPct(realAA, 2)}
          </span>
          <span className="text-[10px] text-gray-400">≈ {fPct(realM, 3)} a.m.</span>
        </div>

        <SliderField
          label={F.rentNomRetiro.label}
          value={retiroNom}
          min={F.rentNomRetiro.min}
          max={F.rentNomRetiro.max}
          step={F.rentNomRetiro.step}
          display={fPct(retiroNom)}
          showNumber={false}
          onChange={(v) => onChange({ rentNomRetiro: v })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
              retiroRealAA >= 0
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
            }`}
          >
            Real apos.: {fPct(retiroRealAA, 2)}
          </span>
          <button
            type="button"
            onClick={() => onChange({ rentNomRetiro: null })}
            className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            title="Usar a mesma taxa de acumulação"
          >
            ↺ igual acumulação
          </button>
          <button
            type="button"
            onClick={() => onChange({ rentNomRetiro: conservadora80(params) })}
            className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            title="Aplicar 80% da taxa real (padrão conservador)"
          >
            Conservador 80%
          </button>
        </div>
        {retiroDiferente ? (
          <p className="mt-1 text-[10px] text-gray-400">Taxa de saque separada da acumulação.</p>
        ) : null}
      </section>

      <hr className="border-gray-200 dark:border-gray-800" />

      {/* Acumulação */}
      <section>
        <SectionTitle dotColor="#2B7AC8">Acumulação</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <MoneyField
            label={F.patrimonio.label}
            value={params.patrimonio}
            sliderMax={F.patrimonio.max}
            step={F.patrimonio.step}
            onChange={(v) => onChange({ patrimonio: v })}
            hint={badge('patrimonio', formatBRL)}
          />
          <MoneyField
            label={F.aporteM.label}
            value={params.aporteM}
            sliderMax={F.aporteM.max}
            step={F.aporteM.step}
            onChange={(v) => onChange({ aporteM: v })}
            hint={badge('aporteM', formatBRL)}
          />
        </div>
      </section>

      <hr className="border-gray-200 dark:border-gray-800" />

      {/* Renda desejada */}
      <section>
        <SectionTitle dotColor="#D4A96A">Aposentadoria</SectionTitle>
        <MoneyField
          label={F.renda.label}
          value={params.renda}
          sliderMax={F.renda.max}
          step={F.renda.step}
          onChange={(v) => onChange({ renda: v })}
          hint={badge('renda', formatBRL)}
        />
      </section>

      <hr className="border-gray-200 dark:border-gray-800" />

      {/* Eventos pontuais */}
      <section>
        <SectionTitle dotColor="#8B1A1A">Eventos Pontuais</SectionTitle>
        <div className="mb-2 space-y-1.5">
          {eventos.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum evento.</p>
          ) : (
            eventos.map((e, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_64px_1fr_24px] items-end gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <div>
                  <div className="mb-0.5 text-[10px] text-gray-400">Tipo</div>
                  <select
                    value={e.tipo}
                    onChange={(ev) =>
                      updateEvento(idx, { tipo: ev.target.value as 'aporte' | 'resgate' })
                    }
                    className="w-full rounded border border-gray-300 bg-white px-1 py-1 text-[11px] text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="aporte">Aporte</option>
                    <option value="resgate">Resgate</option>
                  </select>
                </div>
                <div>
                  <div className="mb-0.5 text-[10px] text-gray-400">Aos</div>
                  <input
                    type="number"
                    value={e.idade}
                    min={1}
                    max={105}
                    onChange={(ev) => updateEvento(idx, { idade: Number(ev.target.value) })}
                    className="w-full rounded border border-gray-300 bg-white px-1 py-1 text-right text-[11px] text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
                <div>
                  <div className="mb-0.5 text-[10px] text-gray-400">Valor</div>
                  <input
                    type="number"
                    value={e.valor}
                    min={0}
                    step={1000}
                    onChange={(ev) =>
                      updateEvento(idx, { valor: Math.max(0, Number(ev.target.value)) })
                    }
                    className="w-full rounded border border-gray-300 bg-white px-1 py-1 text-right text-[11px] text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeEvento(idx)}
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  aria-label="Remover evento"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={addEvento}
          className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-gray-700 dark:text-brand-400 dark:hover:bg-brand-900/10"
        >
          + Adicionar evento
        </button>
      </section>
    </div>
  );
}
