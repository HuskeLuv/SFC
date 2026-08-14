'use client';

import Link from 'next/link';
import type { SaudeFinanceiraPayload } from '@/hooks/useSaudeFinanceira';

interface ClienteHeaderProps {
  nome: string;
  fontes: SaudeFinanceiraPayload['fontes'];
  asOf: string;
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className="text-sm font-medium text-gray-900 dark:text-white/90">{valor}</p>
    </div>
  );
}

/**
 * Cabeçalho da planilha: Cliente / Idade / Idade RT (alvo de aposentadoria) /
 * anos até lá / data do teste. Idades vêm do plano de aposentadoria — sem
 * plano, a faixa convida a preenchê-lo (a idade também destrava o benchmark
 * de patrimônio ideal).
 */
export default function ClienteHeader({ nome, fontes, asOf }: ClienteHeaderProps) {
  const { idade, idadeAlvo } = fontes;
  const anosAteAlvo = idade != null && idadeAlvo != null ? Math.max(0, idadeAlvo - idade) : null;
  const dataTeste = new Date(asOf).toLocaleDateString('pt-BR');

  return (
    <div className="print:break-inside-avoid rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Campo label="Cliente" valor={nome || '—'} />
        <Campo label="Idade" valor={idade != null ? `${idade} anos` : '—'} />
        <Campo
          label="Idade p/ independência"
          valor={idadeAlvo != null ? `${idadeAlvo} anos` : '—'}
        />
        <Campo label="Tempo até lá" valor={anosAteAlvo != null ? `${anosAteAlvo} anos` : '—'} />
        <Campo label="Data do diagnóstico" valor={dataTeste} />
      </div>
      {idade == null ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 print:hidden">
          Informe sua idade no{' '}
          <Link
            href="/planejamento-financeiro?modo=aposentadoria"
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            simulador de aposentadoria
          </Link>{' '}
          — ela também destrava o benchmark de patrimônio ideal.
        </p>
      ) : null}
    </div>
  );
}
