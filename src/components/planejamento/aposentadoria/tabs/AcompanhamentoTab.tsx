'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  planTraj,
  revisedTraj,
  off2date,
  entryByOff,
  prevPat,
  calcRent,
  maxEOff,
  nomM,
  type AposentadoriaEntry,
} from '@/services/planejamento/aposentadoria';
import type { PlanoUpsertPayload, AposentadoriaEntryDTO } from '@/hooks/useAposentadoria';
import { formatBRL, formatBRLCompact, fPct, fMonth } from '../utils';

interface AcompanhamentoTabProps {
  params: PlanoUpsertPayload;
  entries: AposentadoriaEntryDTO[];
  onSaveEntry: (off: number, aporteReal: number, patFinal: number) => void;
  onDeleteEntry: (off: number) => void;
  saving: boolean;
}

function DeltaBadge({ value, label }: { value: number | null; label: string }) {
  if (value == null) {
    return (
      <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        Sem registro
      </span>
    );
  }
  const cls =
    value > 0.01
      ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
      : value < -0.01
        ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  return (
    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {value >= 0 ? '+' : ''}
      {label}
    </span>
  );
}

export default function AcompanhamentoTab({
  params,
  entries,
  onSaveEntry,
  onDeleteEntry,
  saving,
}: AcompanhamentoTabProps) {
  const svcEntries = entries as AposentadoriaEntry[];
  const { T, C, retM } = useMemo(() => planTraj(params), [params]);
  const maxOff = maxEOff(svcEntries);
  const reqRentM = nomM(params) * 100;

  const [curOffset, setCurOffset] = useState(1);
  const [aporteStr, setAporteStr] = useState('');
  const [patStr, setPatStr] = useState('');

  // Quando muda o offset selecionado (ou entries), carrega valores no form.
  useEffect(() => {
    const e = entryByOff(svcEntries, curOffset);
    setAporteStr(e ? String(e.aporteReal) : '');
    setPatStr(e ? String(e.patFinal) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curOffset, entries]);

  // Posiciona o form no próximo mês a registrar na 1ª montagem.
  useEffect(() => {
    setCurOffset(Math.min(Math.max(maxOff + 1, 1), Math.max(retM, 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dashboard ──
  const latE = entryByOff(svcEntries, maxOff);
  const currPat = latE ? latE.patFinal : params.patrimonio;
  const reqPat = T[maxOff] ?? params.patrimonio;
  const reqC = C[maxOff] ?? 0;
  const prevP = prevPat(params, svcEntries, maxOff);
  const actRent = latE && prevP != null ? calcRent(prevP, latE.aporteReal, latE.patFinal) : null;
  const dPat = currPat - reqPat;
  const dPatPct = reqPat > 0 ? (dPat / reqPat) * 100 : 0;
  const dAporte = latE ? latE.aporteReal - reqC : null;
  const dRent = actRent != null ? actRent - reqRentM : null;
  const RT = useMemo(() => revisedTraj(params, currPat, maxOff), [params, currPat, maxOff]);
  const origRet = T[retM] ?? 0;
  const revRet = RT[Math.max(0, retM - maxOff)] ?? 0;

  // ── Banner de recálculo ──
  let recalcMsg: string | null = null;
  if (latE && dPatPct < -10) {
    const rN = nomM(params);
    const rem = Math.max(1, retM - maxOff);
    const fac = Math.pow(1 + rN, rem);
    const newNom = ((origRet - currPat * fac) * rN) / (fac - 1);
    const newReal =
      newNom / Math.pow(1 + (Math.pow(1 + params.inflacao / 100, 1 / 12) - 1), maxOff);
    recalcMsg = `Para atingir o objetivo original precisará contribuir aprox. ${formatBRL(newNom)}/mês nominal = ${formatBRL(newReal)}/mês em R$ de hoje.`;
  }

  // ── Entry form ──
  const formPrev = prevPat(params, svcEntries, curOffset);
  const ap = Number(aporteStr) || 0;
  const pat = Number(patStr) || 0;
  const formRent = formPrev && pat ? calcRent(formPrev, ap, pat) : null;
  const formReqPat = T[curOffset] ?? 0;
  const formDPat = pat && formReqPat ? pat - formReqPat : null;
  const formDPatPct = pat && formReqPat > 0 ? (formDPat! / formReqPat) * 100 : 0;
  const { year: curY, month: curM } = off2date(params, curOffset);
  const editingExists = !!entryByOff(svcEntries, curOffset);

  const handleSave = () => {
    if (!pat) return;
    onSaveEntry(curOffset, ap, pat);
    if (curOffset === maxOff && retM > curOffset) setCurOffset(curOffset + 1);
  };

  // ── Tabela ──
  const showMax = Math.min(retM, Math.max(maxOff + 3, 6));
  const rows: number[] = [];
  for (let off = 1; off <= showMax; off++) rows.push(off);

  return (
    <div className="space-y-4">
      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="rounded-full border border-gray-200 px-2.5 py-0.5 dark:border-gray-700">
          Início: {fMonth(params.trackStartMonth, params.trackStartYear)}
        </span>
        <span className="rounded-full border border-gray-200 px-2.5 py-0.5 dark:border-gray-700">
          Apos.: {params.apos} anos
        </span>
        <span className="rounded-full border border-gray-200 px-2.5 py-0.5 dark:border-gray-700">
          Rent. nominal: {fPct(params.rentNom)}
        </span>
        <span className="rounded-full border border-gray-200 px-2.5 py-0.5 dark:border-gray-700">
          Aporte: {formatBRLCompact(params.aporteM)}/mês
        </span>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">
            Patrimônio
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
            {formatBRLCompact(currPat)}
          </p>
          <p className="text-[10px] text-gray-400">Necessário: {formatBRLCompact(reqPat)}</p>
          <DeltaBadge
            value={latE ? dPat : null}
            label={`${formatBRLCompact(Math.abs(dPat))} (${Math.abs(dPatPct).toFixed(1).replace('.', ',')}%)`}
          />
        </div>
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">
            Último Aporte
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
            {latE ? formatBRLCompact(latE.aporteReal) : '—'}
          </p>
          <p className="text-[10px] text-gray-400">Necessário: {formatBRLCompact(reqC)}</p>
          <DeltaBadge value={dAporte} label={formatBRLCompact(Math.abs(dAporte ?? 0))} />
        </div>
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">
            Rentabilidade
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
            {actRent != null ? fPct(actRent, 2) : '—'}
          </p>
          <p className="text-[10px] text-gray-400">Necessária: {fPct(reqRentM, 2)}/mês</p>
          <DeltaBadge value={dRent} label={fPct(Math.abs(dRent ?? 0), 2)} />
        </div>
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">
            Projeção Revisada
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
            {formatBRLCompact(revRet)}
          </p>
          <p className="text-[10px] text-gray-400">Original: {formatBRLCompact(origRet)}</p>
          {origRet > 0 ? (
            <DeltaBadge
              value={revRet - origRet}
              label={fPct(Math.abs((revRet / origRet - 1) * 100), 1)}
            />
          ) : null}
        </div>
      </div>

      {/* Banner recálculo */}
      {recalcMsg ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          ⚠ {recalcMsg}
        </div>
      ) : null}

      {/* Form + Tabela */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* Entry form */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-900/40 dark:bg-brand-900/10">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white/90">
                {fMonth(curM, curY)}
              </p>
              <p className="text-[10px] text-gray-400">
                mês {curOffset} de {retM} do plano
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={curOffset <= 1}
                onClick={() => setCurOffset(Math.max(1, curOffset - 1))}
                className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-500 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900"
              >
                ◀
              </button>
              <button
                type="button"
                disabled={curOffset >= retM}
                onClick={() => setCurOffset(Math.min(retM, curOffset + 1))}
                className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-500 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900"
              >
                ▶
              </button>
            </div>
          </div>

          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
            Aporte realizado
          </label>
          <div className="mb-1 flex">
            <span className="flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-100 px-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800">
              R$
            </span>
            <input
              type="number"
              value={aporteStr}
              min={0}
              step={100}
              onChange={(e) => setAporteStr(e.target.value)}
              className="w-full rounded-r-md border border-gray-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <p className="mb-2 text-[10px] text-gray-400">
            Necessário: {formatBRL(C[curOffset] ?? 0)}
          </p>

          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
            Patrimônio final do mês
          </label>
          <div className="mb-1 flex">
            <span className="flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-100 px-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800">
              R$
            </span>
            <input
              type="number"
              value={patStr}
              min={0}
              step={1000}
              onChange={(e) => setPatStr(e.target.value)}
              className="w-full rounded-r-md border border-gray-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <p className="mb-2 text-[10px] text-gray-400">Necessário: {formatBRL(formReqPat)}</p>

          <div className="mb-3 rounded-lg border border-gray-200 bg-white/60 p-2 text-xs dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="flex justify-between py-0.5">
              <span className="text-gray-500 dark:text-gray-400">Rentabilidade do mês</span>
              <span
                className={`font-semibold ${formRent != null ? (formRent >= reqRentM ? 'text-green-600' : 'text-red-600') : ''}`}
              >
                {formRent != null ? fPct(formRent, 2) : '—'}
              </span>
            </div>
            <div className="flex justify-between border-t border-gray-100 py-0.5 dark:border-gray-800">
              <span className="text-gray-500 dark:text-gray-400">Meta mensal</span>
              <span className="font-semibold text-gray-800 dark:text-white/90">
                {fPct(reqRentM, 2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-gray-100 py-0.5 dark:border-gray-800">
              <span className="text-gray-500 dark:text-gray-400">Δ Patrimônio vs plano</span>
              <span
                className={`font-semibold ${formDPat != null ? (formDPat >= 0 ? 'text-green-600' : 'text-red-600') : ''}`}
              >
                {formDPat != null
                  ? `${formDPat >= 0 ? '+' : ''}${formatBRLCompact(formDPat)} (${formDPatPct.toFixed(1).replace('.', ',')}%)`
                  : '—'}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!pat || saving}
              className="flex-1 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              ✔ Salvar
            </button>
            {editingExists ? (
              <button
                type="button"
                onClick={() => onDeleteEntry(curOffset)}
                disabled={saving}
                className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-300"
              >
                🗑
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-center text-[10px] text-gray-400">
            Clique em qualquer linha para editar
          </p>
        </div>

        {/* Tabela */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-800 dark:bg-white/[0.03]">
            <span className="text-sm font-semibold text-gray-900 dark:text-white/90">
              Histórico Mensal
            </span>
            <span className="text-[10px] text-gray-400">
              {entries.length} registro{entries.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="max-h-[380px] overflow-auto">
            <table className="w-full text-right text-[11px]">
              <thead className="sticky top-0 bg-gray-50 dark:bg-white/[0.03]">
                <tr className="text-[9.5px] uppercase tracking-wide text-gray-400">
                  <th className="px-2 py-2 text-left">Mês</th>
                  <th className="px-2 py-2">Aporte</th>
                  <th className="px-2 py-2">Nec.</th>
                  <th className="px-2 py-2">Rent.</th>
                  <th className="px-2 py-2">Meta</th>
                  <th className="px-2 py-2">Patrim.</th>
                  <th className="px-2 py-2">Nec.</th>
                  <th className="px-2 py-2">Δ%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((off) => {
                  const e = entryByOff(svcEntries, off);
                  const { year, month } = off2date(params, off);
                  const pP = prevPat(params, svcEntries, off);
                  const rent = e && pP != null ? calcRent(pP, e.aporteReal, e.patFinal) : null;
                  const reqPa = T[off] ?? 0;
                  const reqCo = C[off] ?? 0;
                  const pct = reqPa > 0 && e ? (e.patFinal / reqPa - 1) * 100 : null;
                  const isActive = off === curOffset;
                  return (
                    <tr
                      key={off}
                      onClick={() => setCurOffset(off)}
                      className={`cursor-pointer border-b border-gray-100 dark:border-gray-800 ${
                        isActive
                          ? 'bg-brand-50 dark:bg-brand-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                      } ${!e && !isActive ? 'opacity-60' : ''}`}
                    >
                      <td className="px-2 py-1.5 text-left">
                        <span className="font-semibold text-gray-800 dark:text-white/90">
                          {fMonth(month, year)}
                        </span>{' '}
                        <span className="text-[9px] text-gray-400">M{off}</span>
                      </td>
                      <td
                        className={`px-2 py-1.5 ${e ? 'font-semibold text-gray-800 dark:text-white/90' : 'text-gray-400'}`}
                      >
                        {e ? formatBRLCompact(e.aporteReal) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-400">{formatBRLCompact(reqCo)}</td>
                      <td
                        className={`px-2 py-1.5 ${rent != null ? 'font-semibold text-gray-800 dark:text-white/90' : 'text-gray-400'}`}
                      >
                        {rent != null ? fPct(rent, 2) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-400">{fPct(reqRentM, 2)}</td>
                      <td
                        className={`px-2 py-1.5 ${e ? 'font-semibold text-gray-800 dark:text-white/90' : 'text-gray-400'}`}
                      >
                        {e ? formatBRLCompact(e.patFinal) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-400">{formatBRLCompact(reqPa)}</td>
                      <td
                        className={`px-2 py-1.5 font-semibold ${pct == null ? 'text-gray-400' : pct >= 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {pct == null
                          ? '—'
                          : `${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
