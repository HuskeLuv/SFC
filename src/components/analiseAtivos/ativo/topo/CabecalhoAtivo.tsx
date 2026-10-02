/**
 * Cabeçalho da página do ativo (fatia B): sigla, ticker, nome, tags (setor · segmento · listagem
 * nas ações; tipo · segmento CVM nos FIIs — SEM tag de índice de mercado, que não tem fonte), selo
 * da carteira (slot da D), selos de estado e o preço de fechamento do último pregão com a data e
 * a fonte. As ações da carteira (Registrar/Planejar) entram pelo slot da fatia D.
 */
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import SeloIncompleto from '@/components/analiseAtivos/comum/SeloIncompleto';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { CabecalhoAtivoProps } from '@/types/analiseAtivosApi';

export type { CabecalhoAtivoProps };

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const TAG =
  'inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300';

/** '+0,17' / '−0,48' / '0,00' (sinal tipográfico, 2 casas). */
function comSinal(v: number): string {
  const s = Math.abs(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (s === '0,00') return s;
  return v > 0 ? `+${s}` : `\u2212${s}`;
}

function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export default function CabecalhoAtivo({ ativo, seloCarteira, slotAcoes }: CabecalhoAtivoProps) {
  const t = TEXTOS_TELA.ativo;
  const { cotacao } = ativo;
  const variacao = cotacao.variacao;
  const negativa = typeof variacao === 'number' && variacao < 0;
  const corVariacao = negativa
    ? 'text-[#D92D20] dark:text-[#F97066]'
    : 'text-[#396CAA] dark:text-[#6E9DC4]';

  return (
    <header
      aria-labelledby="ativo-titulo"
      data-bloco="cabecalho"
      className={`${CARD} flex min-w-0 flex-col gap-4`}
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[#314666] text-xs font-semibold tracking-wide text-white"
          >
            {ativo.ticker.slice(0, 4)}
          </span>
          <div className="min-w-0">
            <h1
              id="ativo-titulo"
              className="flex flex-wrap items-baseline gap-x-2 text-xl font-semibold text-gray-800 sm:text-2xl dark:text-white/90"
            >
              {ativo.ticker}
              <span className="text-sm font-normal text-gray-500 sm:text-base dark:text-gray-400">
                {ativo.nome}
              </span>
            </h1>
            <div className="mt-1.5 flex flex-wrap gap-1.5" data-tags>
              {ativo.tags.map((tag) => (
                <span key={tag} className={TAG}>
                  {tag}
                </span>
              ))}
              {seloCarteira}
              {ativo.foraDoQuadroMotivo === 'sem_negociacao_30' ? (
                <SeloEstado tipo="sem_negociacao_recente" />
              ) : null}
              {cotacao.baixaLiquidez ? <SeloEstado tipo="baixa_liquidez" /> : null}
              {ativo.indice.estado === 'incompleto' ? (
                <SeloIncompleto motivos={ativo.indice.motivos} ticker={ativo.ticker} />
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex-none sm:text-right" data-preco>
          <p className="sr-only">{t.precoRotulo}</p>
          <p className="text-2xl font-semibold text-gray-800 tabular-nums dark:text-white/90">
            {cotacao.preco === null
              ? TEXTOS_TELA.formato.semDado
              : formatarAnalise(cotacao.preco, 'moeda')}
          </p>
          {typeof variacao === 'number' && typeof cotacao.variacaoPct === 'number' ? (
            <p className={`text-sm tabular-nums ${corVariacao}`}>
              <span className="sr-only">{t.variacaoRotulo}: </span>
              {comSinal(variacao)} ({comSinal(cotacao.variacaoPct)}%)
            </p>
          ) : null}
          {cotacao.data ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatarTexto(t.fechamento, { data: dataCurta(cotacao.data) })}
            </p>
          ) : null}
        </div>
      </div>
      {slotAcoes ? <div className="min-w-0">{slotAcoes}</div> : null}
    </header>
  );
}
