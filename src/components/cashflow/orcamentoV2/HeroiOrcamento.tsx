'use client';

import type { ReactNode } from 'react';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import type { OrcamentoV2Response } from '@/types/orcamentoV2';
import { formatBRL, formatNumber } from '@/utils/format';
import MedidorRitmo from './MedidorRitmo';
import { pct, plural, textoExcesso } from './apresentacao';

/** Tint azul dos cartões de destaque (MYFINANCE_TONS fundoSelecionado/bordaSelecionada). */
const AZUL = 'border-[#DCE6F2] bg-[#EDF2F8] dark:border-gray-800 dark:bg-white/[0.06]';
const CINZA = 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]';

/** Rótulo do realizado (decidido pelo servidor em `referencia.rotuloRealizado`, Q18). */
export function rotuloRealizadoHeroi(data: OrcamentoV2Response): string {
  const { referencia: r, visao } = data;
  const anual = visao === 'ano';
  if (r.rotuloRealizado === 'previsto') return anual ? 'Previsto no ano' : 'Previsto no mês';
  const base = r.rotuloRealizado === 'lancado' ? 'Lançado' : 'Realizado';
  if (anual) {
    const ddmm = `${String(r.dia || r.diasNoMes).padStart(2, '0')}/${String(data.mes).padStart(2, '0')}`;
    return `${base} até ${ddmm}`;
  }
  if (r.fase === 'corrente') return `${base} até dia ${r.dia}`;
  return `${base} no mês`;
}

function Quadro({
  id,
  rotulo,
  valor,
  apoio,
  azul = false,
}: {
  id: string;
  rotulo: string;
  valor: string;
  apoio: ReactNode;
  azul?: boolean;
}) {
  return (
    <div
      data-mf-kpi={id}
      className={`min-w-0 rounded-xl border px-3.5 py-3 ${azul ? AZUL : CINZA}`}
    >
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{rotulo}</p>
      <p className="mt-0.5 break-words text-base font-semibold tabular-nums text-gray-900 dark:text-white/90">
        {valor}
      </p>
      <div className="mt-0.5 break-words text-[11px] text-gray-500 dark:text-gray-400">{apoio}</div>
    </div>
  );
}

/**
 * Resumo do mês no topo dos cartões do celular (spec mobile, "herói"): o realizado em destaque,
 * "de R$ X orçados · y% · z% do mês passou", o medidor com o ritmo, o disponível e os dias
 * restantes; embaixo, Receita prevista e Índice de poupança. Tudo do `resumo`/`referencia`/
 * `receitaPrevista` do payload (os mesmos números dos KPIs do desktop).
 */
export default function HeroiOrcamento({ data }: { data: OrcamentoV2Response }) {
  const { resumo, referencia, receitaPrevista, visao } = data;
  const anual = visao === 'ano';
  const corrente = referencia.fase === 'corrente';
  const mostrarRitmo = anual || corrente;
  const restantes = referencia.diasNoMes - referencia.dia;
  const excesso = textoExcesso(data.categorias);

  const apoioReceita: ReactNode =
    receitaPrevista.valor === null ? (
      <a
        href="/fluxodecaixa"
        className="font-medium text-mf-patrimonio underline underline-offset-2 dark:text-mf-tranquilidade"
      >
        Informe a receita no Fluxo de Caixa
      </a>
    ) : resumo.orcadoPctReceita !== null ? (
      `orçado = ${pct(resumo.orcadoPctReceita)}`
    ) : receitaPrevista.origem === 'media3m' ? (
      'média dos últimos meses'
    ) : (
      'do Fluxo de Caixa'
    );

  const apoioIndice: ReactNode =
    resumo.sobraPrevista === null ? (
      'sem receita prevista'
    ) : resumo.sobraPrevista >= 0 ? (
      `sobra ${formatBRL(resumo.sobraPrevista)} para investir${
        resumo.orcadoObjetivos > 0
          ? ` (inclui ${formatBRL(resumo.orcadoObjetivos)} em objetivos)`
          : ''
      }`
    ) : (
      <span className={SELO_TEXTO.estourou}>
        gastos orçados passam da receita em {formatBRL(Math.abs(resumo.sobraPrevista))}
      </span>
    );

  return (
    <section aria-label="Resumo do orçamento" className="space-y-2.5" data-mf-orcamento-heroi="">
      <div className={`rounded-2xl border p-4 ${AZUL}`}>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {rotuloRealizadoHeroi(data)}
        </p>
        <p
          data-mf-heroi-realizado=""
          className="mt-1 break-words text-[26px] leading-tight font-bold tabular-nums text-gray-900 dark:text-white/90"
        >
          {formatBRL(resumo.realizado)}
        </p>
        <p className="mt-1.5 text-xs text-gray-500 tabular-nums dark:text-gray-400">
          de{' '}
          <b className="font-semibold text-gray-800 dark:text-white/90">
            {formatBRL(resumo.orcado)}
          </b>{' '}
          orçados
          {resumo.realizadoPctOrcado !== null && (
            <>
              {' · '}
              <b className="font-semibold text-gray-800 dark:text-white/90">
                {pct(resumo.realizadoPctOrcado, 0)}
              </b>
            </>
          )}
          {mostrarRitmo &&
            ` · ${formatNumber(referencia.ritmo * 100, 0)}% do ${anual ? 'ano' : 'mês'} passou`}
        </p>
        <MedidorRitmo
          consumido={resumo.realizadoPctOrcado === null ? null : resumo.realizadoPctOrcado / 100}
          status={resumo.status}
          ritmo={referencia.ritmo}
          mostrarRitmo={mostrarRitmo}
          trilho="bg-white dark:bg-gray-800"
          className="mt-3"
        />
        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs text-gray-500 tabular-nums dark:text-gray-400">
          <span data-mf-heroi-disponivel="">
            Disponível{' '}
            <b
              className={`font-semibold ${
                resumo.disponivel < 0 ? SELO_TEXTO.estourou : 'text-gray-800 dark:text-white/90'
              }`}
            >
              {formatBRL(resumo.disponivel)}
            </b>
          </span>
          {!anual && corrente && <span>{plural(restantes, 'dia restante', 'dias restantes')}</span>}
        </div>
        {excesso && (
          <p data-mf-heroi-excesso="" className={`mt-1 text-[11px] ${SELO_TEXTO.estourou}`}>
            {excesso}
            {resumo.disponivel >= 0 && ', compensados pela folga das outras'}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Quadro
          id="receita"
          azul
          rotulo={anual ? 'Receita prevista no ano' : 'Receita prevista'}
          valor={receitaPrevista.valor === null ? '—' : formatBRL(receitaPrevista.valor)}
          apoio={apoioReceita}
        />
        <Quadro
          id="indice"
          rotulo="Índice de poupança"
          valor={pct(resumo.indicePoupanca)}
          apoio={apoioIndice}
        />
      </div>
    </section>
  );
}
