'use client';

/**
 * Próximos eventos (fatia B): no máximo 3, só datas com fonte (resultado informado ou estimado
 * pelo histórico — selo 'data estimada' —, assembleia, data-com já anunciada). Sem eventos:
 * texto próprio (FIIs: só datas-com). Nota da Agenda no rodapé.
 *
 * Visual v2 (fundamentei-regras F4, item C16): cabeçalho `.hd` com o hint 'vai para a sua Agenda'
 * (no lugar da nota do rodapé) e a data em caixa de 42 px em superfície 2. Sem a chave, o de hoje.
 */
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoEventosProps } from '@/types/analiseAtivosApi';
import {
  CARD_V2,
  CORPO_V2,
  CabecalhoCartaoV2,
} from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { useVisualV2 } from '@/components/analiseAtivos/shell/VisualV2';
import { VISUAL_V2 } from '@/constants/analiseAtivosVisual';
import { TEXTOS_VISUAL } from '@/services/analiseAtivos/textosVisual';

export type { BlocoEventosProps };

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export default function BlocoEventos({ classe, eventos }: BlocoEventosProps) {
  const t = TEXTOS_TELA.ativo;
  const v2 = useVisualV2();
  if (v2) {
    return (
      <section
        aria-labelledby="bloco-eventos-h"
        data-bloco="eventos"
        data-visual-v2=""
        className={`${CARD_V2} flex flex-col`}
      >
        <CabecalhoCartaoV2
          id="bloco-eventos-h"
          titulo={TEXTOS_TELA.blocos.eventos}
          hint={TEXTOS_VISUAL.eventos.hint}
        />
        <div className={CORPO_V2}>
          {eventos.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400" data-sem-eventos>
              {classe === 'fii' ? t.semEventosFii : t.semEventos}
            </p>
          ) : (
            <ul className="flex flex-col">
              {eventos.map((e) => (
                <li
                  key={`${e.data}-${e.tipo}-${e.titulo}`}
                  data-evento={e.tipo}
                  className="flex items-center gap-3 border-b border-gray-100 py-2.5 last:border-b-0 dark:border-gray-800"
                >
                  <time
                    dateTime={e.data}
                    className={`w-[42px] flex-none rounded-lg border border-gray-200 py-1 text-center leading-none dark:border-gray-700 ${VISUAL_V2.superficie2}`}
                  >
                    <b className="block text-[13px] font-bold text-gray-800 dark:text-white/90">
                      {e.data.slice(8, 10)}
                    </b>
                    <small className="mt-0.5 block text-[9px] font-semibold tracking-[0.08em] text-gray-500 dark:text-gray-400">
                      {MESES[Number(e.data.slice(5, 7)) - 1]}
                      {e.data.slice(0, 4) !== new Date().getFullYear().toString()
                        ? ` ${e.data.slice(2, 4)}`
                        : ''}
                    </small>
                  </time>
                  <div className="min-w-0">
                    <h3 className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-gray-800 dark:text-white/90">
                      {e.titulo}
                      {e.estimado ? <SeloEstado tipo="data_estimada" /> : null}
                    </h3>
                    {e.descricao ? (
                      <p className="text-xs break-words text-gray-500 dark:text-gray-400">
                        {e.descricao}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="bloco-eventos-h"
      data-bloco="eventos"
      className={`${CARD} flex min-w-0 flex-col gap-3`}
    >
      <h2 id="bloco-eventos-h" className="text-base font-semibold text-gray-800 dark:text-white/90">
        {TEXTOS_TELA.blocos.eventos}
      </h2>
      {eventos.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400" data-sem-eventos>
          {classe === 'fii' ? t.semEventosFii : t.semEventos}
        </p>
      ) : (
        <ul className="flex flex-col">
          {eventos.map((e) => (
            <li
              key={`${e.data}-${e.tipo}-${e.titulo}`}
              data-evento={e.tipo}
              className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-3 border-b border-gray-100 py-2.5 last:border-b-0 dark:border-gray-800"
            >
              <time
                dateTime={e.data}
                className="rounded-lg border border-gray-200 py-1 text-center leading-tight dark:border-gray-700"
              >
                <b className="block text-lg text-gray-800 dark:text-white/90">
                  {e.data.slice(8, 10)}
                </b>
                <small className="text-[11px] tracking-wide text-gray-500 dark:text-gray-400">
                  {MESES[Number(e.data.slice(5, 7)) - 1]}
                  {e.data.slice(0, 4) !== new Date().getFullYear().toString()
                    ? ` ${e.data.slice(2, 4)}`
                    : ''}
                </small>
              </time>
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-white/90">
                  {e.titulo}
                  {e.estimado ? <SeloEstado tipo="data_estimada" /> : null}
                </h3>
                {e.descricao ? (
                  <p className="text-sm break-words text-gray-500 dark:text-gray-400">
                    {e.descricao}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">{t.notaAgenda}</p>
    </section>
  );
}
