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
}

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
function AutoBadge({
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

export default function LeftPanel({ params, onChange, autoValues, onResync }: LeftPanelProps) {
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
            label="Idade"
            value={params.idade}
            min={1}
            max={79}
            onChange={(v) => onChange({ idade: v })}
          />
          <SliderField
            label="Aposenta"
            value={params.apos}
            min={1}
            max={85}
            onChange={(v) => onChange({ apos: v })}
          />
          <SliderField
            label="Exp. vida"
            value={params.vida}
            min={3}
            max={105}
            onChange={(v) => onChange({ vida: v })}
          />
        </div>
      </section>

      <hr className="border-gray-200 dark:border-gray-800" />

      {/* Taxas */}
      <section>
        <SectionTitle dotColor="#3B6D11">Taxas</SectionTitle>
        <SliderField
          label="Rentabilidade nominal a.a."
          value={params.rentNom}
          min={4}
          max={30}
          step={0.5}
          display={fPct(params.rentNom)}
          showNumber={false}
          onChange={(v) => onChange({ rentNom: v })}
          hint={badge('rentNom', fmtPct)}
        />
        <SliderField
          label="Expectativa de inflação a.a."
          value={params.inflacao}
          min={2}
          max={30}
          step={0.5}
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
          label="Rent. nominal na aposentadoria a.a."
          value={retiroNom}
          min={4}
          max={30}
          step={0.5}
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
            label="Patrimônio inicial"
            value={params.patrimonio}
            sliderMax={1_000_000}
            step={1000}
            onChange={(v) => onChange({ patrimonio: v })}
            hint={badge('patrimonio', formatBRL)}
          />
          <MoneyField
            label="Aportes mensais"
            value={params.aporteM}
            sliderMax={30_000}
            step={100}
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
          label="Renda desejada (R$ de hoje)"
          value={params.renda}
          sliderMax={100_000}
          step={500}
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
