'use client';

import type { SaudeFinanceiraIndicadores } from '@/hooks/useSaudeFinanceira';
import { formatPercent, taxaMensal } from './utils';

interface DadosEconomicosProps {
  indicadores: SaudeFinanceiraIndicadores;
}

interface LinhaTaxa {
  chave: string;
  label: string;
  aa: number | null;
  nota?: string;
  destaque?: boolean;
}

/**
 * Bloco "Dados Econômicos" da planilha: CDI, rentabilidade da carteira,
 * inflação e ganho real, em taxa anual e equivalente mensal composto. O
 * ganho real é a âncora do benchmark de independência (MetasPatrimoniais).
 */
export default function DadosEconomicos({ indicadores }: DadosEconomicosProps) {
  const { economia } = indicadores;

  const linhas: LinhaTaxa[] = [
    { chave: 'cdi', label: 'CDI', aa: economia.cdiAA },
    {
      chave: 'rentabilidade',
      label: 'Rentabilidade da sua carteira',
      aa: economia.rentabilidadeAA,
      nota:
        economia.rentabilidadeFonte === 'carteira'
          ? 'TWR dos últimos 12 meses'
          : economia.rentabilidadeFonte === 'cdi'
            ? 'proxy CDI — carteira com menos de 12 meses'
            : undefined,
    },
    { chave: 'inflacao', label: 'Inflação (IPCA 12m)', aa: economia.inflacaoAA },
    {
      chave: 'ganhoReal',
      label: 'Ganho real',
      aa: economia.ganhoRealAA,
      nota: 'rentabilidade descontada a inflação',
      destaque: true,
    },
  ];

  return (
    <div className="print:break-inside-avoid rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white/90">Dados Econômicos</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800 dark:text-gray-500">
              <th className="py-2 pr-4 font-medium">Indicador</th>
              <th className="py-2 pr-4 text-right font-medium">a.a.</th>
              <th className="py-2 text-right font-medium">a.m.</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr
                key={l.chave}
                className="border-b border-gray-50 last:border-0 dark:border-gray-800/50"
              >
                <td className="py-2 pr-4">
                  <span
                    className={
                      l.destaque
                        ? 'font-semibold text-gray-900 dark:text-white/90'
                        : 'text-gray-600 dark:text-gray-300'
                    }
                  >
                    {l.label}
                  </span>
                  {l.nota ? (
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{l.nota}</span>
                  ) : null}
                </td>
                <td
                  className={`py-2 pr-4 text-right font-medium ${
                    l.destaque && l.aa != null
                      ? l.aa >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                      : 'text-gray-900 dark:text-white/90'
                  }`}
                >
                  {formatPercent(l.aa, 2)}
                </td>
                <td className="py-2 text-right text-gray-600 dark:text-gray-300">
                  {formatPercent(taxaMensal(l.aa), 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
