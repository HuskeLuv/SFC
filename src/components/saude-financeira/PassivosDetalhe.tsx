'use client';

import Link from 'next/link';
import type {
  SaudeFinanceiraIndicadores,
  SaudeFinanceiraPayload,
  PassivoLinha,
} from '@/hooks/useSaudeFinanceira';
import { TIPO_LABELS, SISTEMA_LABELS, INDEXADOR_LABELS } from '@/components/dividas/utils';
import type { DividaTipo, DividaSistema, DividaIndexador } from '@/hooks/useDividas';
import { formatBRL, formatPercent } from './utils';

interface PassivosDetalheProps {
  indicadores: SaudeFinanceiraIndicadores;
  composicao: SaudeFinanceiraPayload['composicao'];
}

const PRAZO_BADGE: Record<PassivoLinha['prazo'], { label: string; className: string }> = {
  curto: {
    label: 'Curto prazo',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  },
  longo: {
    label: 'Longo prazo',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  },
};

function sistemaLabel(p: PassivoLinha): string {
  if (p.modalidade === 'rotativa') return 'Rotativa';
  const sistema = p.sistema ? (SISTEMA_LABELS[p.sistema as DividaSistema] ?? p.sistema) : '—';
  const indexador =
    p.indexador !== 'PREFIXADO'
      ? ` + ${INDEXADOR_LABELS[p.indexador as DividaIndexador] ?? p.indexador}`
      : '';
  return `${sistema}${indexador}`;
}

/**
 * Bloco "Passivos" da planilha (aba 3): detalhe de cada dívida ativa —
 * sistema de amortização, taxa, parcela e progresso — mais os dois índices
 * de endividamento do bloco de status. Os dados vêm da área de Dívidas.
 */
export default function PassivosDetalhe({ indicadores, composicao }: PassivosDetalheProps) {
  const { metricas } = indicadores;
  const passivos = composicao.passivos;

  return (
    <div className="print:break-inside-avoid rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white/90">
          Detalhe dos Passivos
        </h3>
        <Link
          href="/dividas"
          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 print:hidden"
        >
          Gerenciar dívidas →
        </Link>
      </div>

      {/* Índices de endividamento (bloco de status da planilha) */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Dívidas de curto prazo / ativos líquidos
          </p>
          <p
            className={`text-lg font-semibold ${
              metricas.endividamentoCurtoPrazo != null && metricas.endividamentoCurtoPrazo > 1
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-white/90'
            }`}
          >
            {formatPercent(metricas.endividamentoCurtoPrazo)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            acima de 100% caracteriza endividamento
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Passivo total / ativo total</p>
          <p
            className={`text-lg font-semibold ${
              metricas.passivoSobreAtivo != null && metricas.passivoSobreAtivo > 0.5
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-white/90'
            }`}
          >
            {formatPercent(metricas.passivoSobreAtivo)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            acima de 50% caracteriza endividamento
          </p>
        </div>
      </div>

      {passivos.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Nenhuma dívida ativa cadastrada. Se você tem financiamentos ou dívidas rotativas,
          cadastre-os na área de Dívidas para um diagnóstico completo.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800 dark:text-gray-500">
                <th className="py-2 pr-4 font-medium">Dívida</th>
                <th className="py-2 pr-4 font-medium">Prazo</th>
                <th className="py-2 pr-4 font-medium">Sistema</th>
                <th className="py-2 pr-4 text-right font-medium">Taxa a.m.</th>
                <th className="py-2 pr-4 text-right font-medium">Parcela</th>
                <th className="py-2 pr-4 text-right font-medium">Pagas</th>
                <th className="py-2 text-right font-medium">Saldo devedor</th>
              </tr>
            </thead>
            <tbody>
              {passivos.map((p) => {
                const badge = PRAZO_BADGE[p.prazo];
                return (
                  <tr
                    key={p.id}
                    className="border-b border-gray-50 last:border-0 dark:border-gray-800/50"
                  >
                    <td className="py-2 pr-4">
                      <span className="font-medium text-gray-900 dark:text-white/90">{p.nome}</span>
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                        {TIPO_LABELS[p.tipo as DividaTipo] ?? p.tipo}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">
                      {sistemaLabel(p)}
                    </td>
                    <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-300">
                      {formatPercent(p.taxaAm, 2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-300">
                      {formatBRL(p.valorParcela)}
                    </td>
                    <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-300">
                      {p.parcelasPagas != null && p.totalParcelas != null
                        ? `${p.parcelasPagas}/${p.totalParcelas}`
                        : '—'}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900 dark:text-white/90">
                      {formatBRL(p.saldo)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
