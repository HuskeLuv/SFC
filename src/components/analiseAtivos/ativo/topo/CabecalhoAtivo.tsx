/**
 * Cabeçalho da página do ativo (fatia B): sigla, ticker, nome, tags (setor · segmento · listagem
 * nas ações; tipo · segmento CVM nos FIIs — SEM tag de índice de mercado, que não tem fonte), chips
 * de estado "Na carteira"/"Planejado" (seloCarteira), selos de estado e o preço de fechamento do
 * último pregão com a data e a fonte.
 *
 * v2.4 (fatia C1): SEM Índice MF/semáforo (saiu o selo "dados incompletos", que vinha do Índice).
 * Os chips "Na carteira"/"Planejado" vêm do overlay (ChipsCarteira) — os dois juntos quando a
 * posição tem alvo; `seloCarteira` só liga os chips (a página do ativo passa; a F remove a prop).
 * v2.5 (fatia C): "Planejado" = alvo do Planejar na carteira (planning_asset_targets, % da carteira
 * total); some ao "Remover do plano" (caso 33). O Objetivo da aba na Carteira não acende o chip.
 * A linha de ações (slotAcoes = AcoesCarteiraAtivo → BarraAcoesAtivo: Comparar · Planejar ·
 * Ver na Carteira · Registrar operação) fica embaixo, alinhada à direita no computador.
 *
 * Visual v2 (fundamentei-regras F4, itens C1 e C16): sem card (`.dhead` do HTML do Pedro), tags sem
 * borda em superfície 2, nome em '· nome' cinza ao lado do ticker, sigla 52 px raio 12 e o menu ⋯
 * dos indicadores (reportar) ao lado do preço — o bloco de KPIs perde o card. Sem a chave, o de hoje.
 */
import { ChipsCarteira } from '@/components/analiseAtivos/ativo/acoes/BarraAcoesAtivo';
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { TEXTOS_EUA_TELAS } from '@/services/analiseAtivos/textosEuaTelas';
import type { CabecalhoAtivoProps } from '@/types/analiseAtivosApi';
import { MenuBlocoPagina } from '@/components/analiseAtivos/comum/PorQueConferencia';
import { dadosDosKpis } from '@/components/analiseAtivos/ativo/topo/BlocoKpis';
import { useVisualV2 } from '@/components/analiseAtivos/shell/VisualV2';
import { VISUAL_V2 } from '@/constants/analiseAtivosVisual';

export type { CabecalhoAtivoProps };

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const TAG =
  'inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300';
const TAG_V2 = `inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 ${VISUAL_V2.superficie2}`;

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
  const v2 = useVisualV2();

  return (
    <header
      aria-labelledby="ativo-titulo"
      data-bloco="cabecalho"
      data-visual-v2={v2 ? '' : undefined}
      className={v2 ? 'flex min-w-0 flex-col gap-4' : `${CARD} flex min-w-0 flex-col gap-4`}
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={
              v2
                ? 'grid h-[52px] w-[52px] flex-none place-items-center rounded-xl bg-[#314666] text-sm font-bold text-white'
                : 'grid h-12 w-12 flex-none place-items-center rounded-xl bg-[#314666] text-xs font-semibold tracking-wide text-white'
            }
          >
            {ativo.ticker.slice(0, 4)}
          </span>
          <div className="min-w-0">
            <h1
              id="ativo-titulo"
              className="flex flex-wrap items-baseline gap-x-2 text-xl font-semibold text-gray-800 sm:text-2xl dark:text-white/90"
            >
              {ativo.ticker}
              {v2 ? (
                <span className="text-sm font-normal text-gray-500 sm:text-base dark:text-gray-400">
                  <span aria-hidden="true">· </span>
                  {ativo.nome}
                </span>
              ) : (
                <span className="text-sm font-normal text-gray-500 sm:text-base dark:text-gray-400">
                  {ativo.nome}
                </span>
              )}
            </h1>
            <div className="mt-1.5 flex flex-wrap gap-1.5" data-tags>
              {ativo.tags.map((tag) => (
                <span key={tag} className={v2 ? TAG_V2 : TAG}>
                  {tag}
                </span>
              ))}
              {seloCarteira !== undefined || slotAcoes ? (
                <ChipsCarteira ticker={ativo.ticker} classe={ativo.classe} />
              ) : null}
              {ativo.foraDoQuadroMotivo === 'sem_negociacao_30' ||
              ativo.foraDoQuadroMotivo === 'deslistada' ? (
                <SeloEstado tipo="sem_negociacao_recente" />
              ) : null}
              {cotacao.baixaLiquidez ? <SeloEstado tipo="baixa_liquidez" /> : null}
            </div>
          </div>
        </div>

        {ativo.eua?.motivoSemPreco ? (
          // Stocks e REITs sem a chave de preço (decisão do Wellington de 17/10): variante
          // "sem cotação", texto neutro, nenhum número de preço
          <div className="min-w-0 sm:max-w-[22rem] sm:text-right" data-preco="" data-sem-cotacao="">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {TEXTOS_EUA_TELAS.ativo.cotacaoTitulo}
            </p>
            <p className="text-xs leading-snug text-gray-500 dark:text-gray-400">
              {TEXTOS_EUA.cotacao.indisponivel}. {TEXTOS_EUA.cotacao.indisponivelDetalhe}
            </p>
          </div>
        ) : (
          <div className="flex-none sm:text-right" data-preco>
            <p className="sr-only">{t.precoRotulo}</p>
            <p className="text-2xl font-semibold text-gray-800 tabular-nums dark:text-white/90">
              {cotacao.preco === null
                ? TEXTOS_TELA.formato.semDado
                : ativo.eua
                  ? `${TEXTOS_EUA.cotacao.moeda} ${formatarAnalise(cotacao.preco, 'numero2')}`
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
        )}
      </div>
      {slotAcoes ? (
        <div data-acoes-cabecalho="" className="flex min-w-0 sm:justify-end">
          {slotAcoes}
          {v2 ? (
            <span className="ml-1 flex-none self-center">
              <MenuBlocoPagina bloco="kpis" dados={dadosDosKpis(ativo.kpis)} />
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
