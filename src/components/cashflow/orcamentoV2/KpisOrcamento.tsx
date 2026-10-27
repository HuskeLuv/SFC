'use client';

import type { ReactNode } from 'react';
import Tooltip from '@/components/ui/tooltip/Tooltip';
import { SELO_TEXTO, TOM_FUNDO } from '@/lib/orcamento/tons';
import type { OrcamentoV2Response } from '@/types/orcamentoV2';
import { formatBRL, formatNumber } from '@/utils/format';
import {
  MESES_LONGOS,
  TEXTO_DISPONIVEL,
  inicioAcumulado,
  TOM_DO_STATUS,
  mesLongo,
  pct,
  plural,
  textoExcesso,
} from './apresentacao';

/** Tint azul dos cartões 1 e 5 (MYFINANCE_TONS fundoSelecionado/bordaSelecionada) e cinza nos demais. */
const CARTAO_AZUL = 'border-[#DCE6F2] bg-[#EDF2F8] dark:border-gray-800 dark:bg-white/[0.06]';
const CARTAO_CINZA = 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]';

function Cartao({
  id,
  rotulo,
  valor,
  apoio,
  azul = false,
  valorClassName = 'text-gray-900 dark:text-white/90',
  ajuda,
  children,
}: {
  id: string;
  rotulo: string;
  /** Texto do "?" ao lado do rótulo. */
  ajuda?: string;
  valor: string;
  apoio: ReactNode;
  azul?: boolean;
  valorClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-mf-kpi={id}
      className={`min-w-0 rounded-xl border p-4 ${azul ? CARTAO_AZUL : CARTAO_CINZA}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        <p>{rotulo}</p>
        {ajuda && (
          <Tooltip content={ajuda} placement="bottom">
            <button
              type="button"
              aria-label={`Ajuda: ${ajuda}`}
              className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-500 hover:border-gray-400 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:border-gray-600 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ?
            </button>
          </Tooltip>
        )}
      </div>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${valorClassName}`}>{valor}</p>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{apoio}</div>
      {children}
    </div>
  );
}

/** Mês 1–12 abreviado para a lista de meses sem orçado do acumulado. */
const mesAbrev = (m: number) => MESES_LONGOS[m - 1].slice(0, 3).toLowerCase();

/**
 * Os 5 KPIs do topo (spec §4.2; desenho técnico §6.3): Receita prevista (texto por origem:
 * fluxo / média de 3 meses / nenhuma com o link para o Fluxo), Orçado, Realizado (rótulo do
 * servidor: Lançado / Realizado / Previsto), Disponível e Índice de poupança. Tudo vem do
 * `resumo` e da `referencia` do payload; nada é recalculado aqui.
 */
export default function KpisOrcamento({ data }: { data: OrcamentoV2Response }) {
  const { resumo, referencia, receitaPrevista, visao } = data;
  const anual = visao === 'ano';
  const corrente = referencia.fase === 'corrente';
  const futuro = referencia.fase === 'futuro';
  const periodo = anual ? 'ano' : 'mês';

  // ── Receita prevista ──────────────────────────────────────────────────────────────────────
  const n = receitaPrevista.mesesBase?.length ?? 3;
  const apoioReceita: ReactNode =
    receitaPrevista.origem === 'fluxo' ? (
      `do Fluxo de Caixa · ${
        anual && inicioAcumulado(data) < data.mes
          ? `${MESES_LONGOS[inicioAcumulado(data) - 1]} a ${mesLongo(data)}`
          : mesLongo(data)
      }`
    ) : receitaPrevista.origem === 'media3m' ? (
      `média dos últimos ${n === 1 ? 'mês' : `${n} meses`}`
    ) : (
      <a
        href="/fluxodecaixa"
        className="font-medium text-mf-patrimonio underline underline-offset-2 hover:text-mf-seguranca dark:text-mf-tranquilidade dark:hover:text-white"
      >
        Informe a receita prevista no Fluxo de Caixa
      </a>
    );

  // ── Realizado ─────────────────────────────────────────────────────────────────────────────
  const rotulo = referencia.rotuloRealizado;
  const ddmm = `${String(referencia.dia || referencia.diasNoMes).padStart(2, '0')}/${String(
    data.mes,
  ).padStart(2, '0')}`;
  let rotuloRealizado: string;
  if (rotulo === 'previsto') rotuloRealizado = anual ? 'Previsto no ano' : 'Previsto no mês';
  else if (anual) rotuloRealizado = `${rotulo === 'lancado' ? 'Lançado' : 'Realizado'} até ${ddmm}`;
  else if (rotulo === 'lancado')
    rotuloRealizado = corrente
      ? `Lançado no mês · dia ${referencia.dia} de ${referencia.diasNoMes}`
      : 'Lançado no mês';
  else rotuloRealizado = corrente ? `Realizado até dia ${referencia.dia}` : 'Realizado no mês';

  const ritmoPct = formatNumber(referencia.ritmo * 100, 0);
  const apoioRealizado = (
    <>
      {resumo.realizadoPctOrcado === null ? (
        'sem orçado'
      ) : (
        <>
          <b className="font-semibold text-gray-700 dark:text-gray-200">
            {pct(resumo.realizadoPctOrcado, 0)}
          </b>{' '}
          do orçado
        </>
      )}
      {(anual || corrente) && ` · ${ritmoPct}% do ${periodo} passou`}
    </>
  );
  const tom = TOM_DO_STATUS[resumo.status];

  // ── Disponível ────────────────────────────────────────────────────────────────────────────
  const restantes = referencia.diasNoMes - referencia.dia;
  const apoioDisponivel = futuro
    ? 'orçado − previsto'
    : !anual && corrente
      ? `orçado − realizado · ${plural(restantes, 'dia restante', 'dias restantes')}`
      : 'orçado − realizado';
  const excesso = textoExcesso(data.categorias);

  // ── Índice de poupança ────────────────────────────────────────────────────────────────────
  const apoioIndice: ReactNode =
    resumo.sobraPrevista === null ? (
      'sem receita prevista'
    ) : resumo.sobraPrevista >= 0 ? (
      <>
        sobra prevista{' '}
        <b className="font-semibold text-gray-700 dark:text-gray-200">
          {formatBRL(resumo.sobraPrevista)}
        </b>{' '}
        para investir
      </>
    ) : (
      <>
        orçado passa da receita em{' '}
        <b className={`font-semibold ${SELO_TEXTO.estourou}`}>
          {formatBRL(Math.abs(resumo.sobraPrevista))}
        </b>
      </>
    );

  const semOrcamento = anual ? (data.mesesSemOrcamento ?? []) : [];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 min-[1180px]:grid-cols-5">
      <Cartao
        id="receita"
        azul
        rotulo={anual ? 'Receita prevista no ano' : 'Receita prevista do mês'}
        valor={receitaPrevista.valor === null ? '—' : formatBRL(receitaPrevista.valor)}
        apoio={apoioReceita}
      />
      <Cartao
        id="orcado"
        rotulo={anual ? 'Orçado no ano' : 'Orçado'}
        valor={formatBRL(resumo.orcado)}
        apoio={
          <>
            {resumo.orcadoPctReceita !== null && (
              <>
                <b className="font-semibold text-gray-700 dark:text-gray-200">
                  {pct(resumo.orcadoPctReceita)}
                </b>{' '}
                da receita ·{' '}
              </>
            )}
            {plural(resumo.totalCategorias, 'categoria', 'categorias')}
            {semOrcamento.length > 0 && (
              <span className="mt-0.5 block">
                sem orçado em {semOrcamento.map(mesAbrev).join(', ')}
              </span>
            )}
          </>
        }
      />
      <Cartao
        id="realizado"
        rotulo={rotuloRealizado}
        valor={formatBRL(resumo.realizado)}
        apoio={apoioRealizado}
      >
        {resumo.realizadoPctOrcado !== null && (
          <div className="relative mt-2 h-1.5 rounded-full bg-gray-200 dark:bg-gray-800">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${TOM_FUNDO[tom]}`}
              style={{ width: `${Math.min(100, Math.max(0, resumo.realizadoPctOrcado))}%` }}
            />
            {(anual || corrente) && (
              <span
                aria-hidden
                title={`ritmo do ${periodo}`}
                className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-gray-700 dark:bg-gray-200"
                style={{ left: `${(Math.min(1, referencia.ritmo) * 100).toFixed(1)}%` }}
              />
            )}
          </div>
        )}
      </Cartao>
      <Cartao
        id="disponivel"
        rotulo={anual ? 'Disponível no ano' : 'Disponível no mês'}
        valor={formatBRL(resumo.disponivel)}
        valorClassName={
          resumo.disponivel < 0 ? SELO_TEXTO.estourou : 'text-gray-900 dark:text-white/90'
        }
        ajuda={TEXTO_DISPONIVEL}
        apoio={
          <>
            {apoioDisponivel}
            {excesso && (
              <span data-mf-kpi-excesso="" className={`block ${SELO_TEXTO.estourou}`}>
                {excesso}
              </span>
            )}
          </>
        }
      />
      <Cartao
        id="indice"
        azul
        rotulo="Índice de poupança previsto"
        valor={pct(resumo.indicePoupanca)}
        apoio={apoioIndice}
      />
    </div>
  );
}
