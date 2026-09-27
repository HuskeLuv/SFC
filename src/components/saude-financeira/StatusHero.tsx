'use client';

import type { SaudeFinanceiraIndicadores, TendenciasSaude } from '@/hooks/useSaudeFinanceira';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { MobileStatusPill, type MobileStatusTone } from '@/components/ui/mobile/MobileStatusPill';
import { STATUS_META, formatMeses, formatPercent, tendenciaSeta } from './utils';

interface StatusHeroProps {
  indicadores: SaudeFinanceiraIndicadores;
  tendencias: TendenciasSaude;
  /** Classes extras da raiz (o celular sobe o bloco com `mscreen:order-first`). */
  className?: string;
}

/** Veredito → selo do celular (ponto + palavra, sem verde). Mesmo enum do STATUS_META. */
export const STATUS_TONE: Record<keyof typeof STATUS_META, MobileStatusTone> = {
  EQ: 'ok',
  FR: 'atencao',
  ED: 'problema',
};

/** Escala de 3 níveis, da pior para a melhor (a ordem da planilha: ED < FR < EQ). */
const ESCALA: Array<keyof typeof STATUS_META> = ['ED', 'FR', 'EQ'];
const ESCALA_COR: Record<keyof typeof STATUS_META, string> = {
  ED: 'bg-[#D92D20] dark:bg-[#F97066]',
  FR: 'bg-[#D97706] dark:bg-[#FBBF24]',
  EQ: 'bg-[#0079F2]',
};

/** Selo + escala do veredito, só no celular (montado no ramo `useIsBelowLg`). */
function StatusMobile({ codigo }: { codigo: keyof typeof STATUS_META }) {
  const meta = STATUS_META[codigo];
  return (
    <div data-mf-mobile="" className="hidden mscreen:block">
      <MobileStatusPill tone={STATUS_TONE[codigo]}>{meta.label}</MobileStatusPill>
      <div className="mt-2" aria-hidden="true">
        <div className="grid grid-cols-3 gap-1">
          {ESCALA.map((c) => (
            <span
              key={c}
              className={`h-1.5 rounded-full ${
                c === codigo ? ESCALA_COR[c] : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-gray-500 dark:text-gray-400">
          <span>Endividamento</span>
          <span className="text-center">Frágil</span>
          <span className="text-right">Equilibrado</span>
        </div>
      </div>
    </div>
  );
}

/** Celular sem verde (PWA fase 3): a seta "boa" vira azul da paleta só na tela abaixo de lg. */
const SETA_SEM_VERDE = (className: string) =>
  className.includes('green')
    ? ' mscreen:text-mf-patrimonio dark:mscreen:text-mf-tranquilidade'
    : '';

function Seta({ seta }: { seta: ReturnType<typeof tendenciaSeta> }) {
  if (!seta) return null;
  return (
    <span
      className={`ml-1 text-sm font-semibold ${seta.className}${SETA_SEM_VERDE(seta.className)}`}
      title="vs mês anterior"
    >
      {seta.glyph}
    </span>
  );
}

/**
 * Bloco "Status Saúde Financeira" da planilha: o veredito ED/FR/EQ com
 * motivos, ladeado pelas três métricas que sustentam a classificação —
 * meses de cobertura, endividamento de curto prazo e passivo/ativo total.
 */
export default function StatusHero({ indicadores, tendencias, className }: StatusHeroProps) {
  const { status, metricas } = indicadores;
  const meta = STATUS_META[status.codigo];
  const isBelowLg = useIsBelowLg();

  return (
    <div
      className={`print:break-inside-avoid rounded-2xl border bg-white p-5 dark:bg-white/[0.03] ${meta.cardClass}${
        isBelowLg ? ' mscreen:border-gray-200 dark:mscreen:border-gray-800' : ''
      }${className ? ` ${className}` : ''}`}
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-white/90">
        Status Saúde Financeira
      </h3>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          {isBelowLg ? <StatusMobile codigo={status.codigo} /> : null}
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${meta.badgeClass}${
              isBelowLg ? ' mscreen:hidden' : ''
            }`}
          >
            {meta.label}
          </span>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{meta.descricao}</p>
          {status.motivos.length > 0 ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
              {status.motivos.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Meses de cobertura</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
              {formatMeses(metricas.mesesCobertura)}
              <Seta seta={tendenciaSeta(tendencias.mesesCobertura, true)} />
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              de gastos em ativos líquidos
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Endividamento curto prazo</p>
            <p
              className={`text-lg font-semibold ${
                metricas.endividamentoCurtoPrazo != null && metricas.endividamentoCurtoPrazo > 1
                  ? 'text-red-600 dark:text-red-400 mscreen:text-[#D92D20] dark:mscreen:text-[#F97066]'
                  : 'text-gray-900 dark:text-white/90'
              }`}
            >
              {formatPercent(metricas.endividamentoCurtoPrazo)}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              dívidas CP / ativos líquidos
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Passivo / ativo total</p>
            <p
              className={`text-lg font-semibold ${
                metricas.passivoSobreAtivo != null && metricas.passivoSobreAtivo > 0.5
                  ? 'text-red-600 dark:text-red-400 mscreen:text-[#D92D20] dark:mscreen:text-[#F97066]'
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
      </div>
    </div>
  );
}
