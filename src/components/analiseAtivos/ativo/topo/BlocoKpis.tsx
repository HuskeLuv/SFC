/**
 * Os 8 indicadores do ativo (fatia B). Grade por CONTÊINER (o card): 4 colunas com espaço, 2 no
 * card estreito/celular e 1 quando o conteúdo do card fica abaixo de 300px (página abaixo de
 * ~340px, como a 320). Valor ausente = '—' com o motivo em texto visível embaixo
 * (não só no title); n/a = 'n/a' com o motivo. Proventos em conferência: borda tracejada + selo.
 */
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import ValorAnalise from '@/components/analiseAtivos/comum/ValorAnalise';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoKpisProps } from '@/types/analiseAtivosApi';

export type { BlocoKpisProps };

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';

export default function BlocoKpis({ classe, kpis }: BlocoKpisProps) {
  return (
    <section
      aria-labelledby="bloco-kpis-h"
      data-bloco="kpis"
      data-classe={classe}
      className={`${CARD} @container flex min-w-0 flex-col gap-3`}
    >
      <h2 id="bloco-kpis-h" className="text-base font-semibold text-gray-800 dark:text-white/90">
        {TEXTOS_TELA.blocos.kpis}
      </h2>
      <ul
        data-kpis
        className="grid grid-cols-1 gap-3 @min-[300px]:grid-cols-2 @min-[720px]:grid-cols-4"
      >
        {kpis.map((k) => {
          const conferencia = k.selo === 'proventos_em_conferencia';
          return (
            <li
              key={k.codigo}
              data-kpi={k.codigo}
              data-conferencia={conferencia || undefined}
              className={`flex min-w-0 flex-col gap-0.5 rounded-xl bg-gray-50 px-3.5 py-3 dark:bg-white/[0.02] ${
                conferencia
                  ? 'border border-dashed border-gray-500 dark:border-gray-400'
                  : 'border border-gray-100 dark:border-gray-800'
              }`}
            >
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {k.rotulo}
              </span>
              <ValorAnalise
                valor={k.valor}
                formato={k.formato}
                mostrarMotivo
                className="text-lg font-semibold text-gray-800 dark:text-white/90"
              />
              {k.sub ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">{k.sub}</span>
              ) : null}
              {k.selo && k.valor.estado === 'ok' ? (
                <SeloEstado tipo={k.selo} className="mt-1 self-start" />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
