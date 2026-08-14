'use client';

import Link from 'next/link';
import type {
  SaudeFinanceiraIndicadores,
  SaudeFinanceiraPayload,
} from '@/hooks/useSaudeFinanceira';
import { TIPO_LABELS } from '@/components/dividas/utils';
import type { DividaTipo } from '@/hooks/useDividas';
import { formatBRL } from './utils';

interface BalancoPatrimonialProps {
  indicadores: SaudeFinanceiraIndicadores;
  composicao: SaudeFinanceiraPayload['composicao'];
}

function Linha({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white/90">{formatBRL(valor)}</span>
    </div>
  );
}

function Subtotal({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="mt-1 flex items-center justify-between border-t border-gray-100 py-1.5 text-sm font-semibold dark:border-gray-800">
      <span className="text-gray-700 dark:text-gray-200">{label}</span>
      <span className="text-gray-900 dark:text-white/90">{formatBRL(valor)}</span>
    </div>
  );
}

/**
 * Bloco ④ — balanço patrimonial: ativos por liquidez × passivos por prazo,
 * fechando no patrimônio líquido (mesma conta do resumo da carteira).
 */
export default function BalancoPatrimonial({ indicadores, composicao }: BalancoPatrimonialProps) {
  const { balanco } = indicadores;
  const passivosCurto = composicao.passivos.filter((p) => p.prazo === 'curto');
  const passivosLongo = composicao.passivos.filter((p) => p.prazo === 'longo');

  return (
    <div className="print:break-inside-avoid rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white/90">
        Balanço Patrimonial
      </h3>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Ativos */}
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Ativos
          </h4>
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Alta liquidez</p>
            {composicao.altaLiquidez.length > 0 ? (
              composicao.altaLiquidez.map((l) => (
                <Linha key={l.chave} label={l.label} valor={l.valor} />
              ))
            ) : (
              <p className="py-1 text-sm text-gray-400 dark:text-gray-500">Nenhum ativo líquido</p>
            )}
            <Subtotal label="Total alta liquidez" valor={balanco.ativosAltaLiquidez} />
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Baixa liquidez</p>
            {composicao.baixaLiquidez.length > 0 ? (
              composicao.baixaLiquidez.map((l) => (
                <Linha key={l.chave} label={l.label} valor={l.valor} />
              ))
            ) : (
              <p className="py-1 text-sm text-gray-400 dark:text-gray-500">
                Nenhum ativo de longo prazo
              </p>
            )}
            <Subtotal label="Total baixa liquidez" valor={balanco.ativosBaixaLiquidez} />
          </div>
          <Subtotal label="Total de ativos" valor={balanco.ativosTotal} />
        </div>

        {/* Passivos */}
        <div>
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Passivos
            </h4>
            <Link
              href="/dividas"
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 print:hidden"
            >
              Gerenciar dívidas →
            </Link>
          </div>
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Curto prazo</p>
            {passivosCurto.length > 0 ? (
              passivosCurto.map((p) => (
                <Linha
                  key={p.id}
                  label={`${p.nome} (${TIPO_LABELS[p.tipo as DividaTipo] ?? p.tipo})`}
                  valor={p.saldo}
                />
              ))
            ) : (
              <p className="py-1 text-sm text-gray-400 dark:text-gray-500">
                Nenhuma dívida de curto prazo
              </p>
            )}
            <Subtotal label="Total curto prazo" valor={balanco.passivosCurtoPrazo} />
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Longo prazo</p>
            {passivosLongo.length > 0 ? (
              passivosLongo.map((p) => (
                <Linha
                  key={p.id}
                  label={`${p.nome} (${TIPO_LABELS[p.tipo as DividaTipo] ?? p.tipo})`}
                  valor={p.saldo}
                />
              ))
            ) : (
              <p className="py-1 text-sm text-gray-400 dark:text-gray-500">
                Nenhuma dívida de longo prazo
              </p>
            )}
            <Subtotal label="Total longo prazo" valor={balanco.passivosLongoPrazo} />
          </div>
          <Subtotal label="Total de passivos" valor={balanco.passivosTotal} />
        </div>
      </div>

      {/* PL */}
      <div className="mt-5 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Patrimônio Líquido
        </span>
        <span
          className={`text-lg font-bold ${
            balanco.patrimonioLiquido < 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-900 dark:text-white/90'
          }`}
        >
          {formatBRL(balanco.patrimonioLiquido)}
        </span>
      </div>
    </div>
  );
}
