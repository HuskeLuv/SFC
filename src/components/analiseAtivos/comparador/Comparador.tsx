'use client';

/**
 * Página do Comparador (Bloco D, fatia C). Estado em ?t= (useEstadoComparadorUrl); aba Ações | FIIs
 * pela classe do 1º ticker (a API decide; sem tickers, ?c=); até MAX_ATIVOS_COMPARADOR slots.
 *
 * Computador: card com abas, avisos, legenda do ★ + "Copiar link", slots em grade (+ slot
 * "Adicionar" com sugestões do mesmo segmento), aviso de tijolo + papel, tabela critério × ativo
 * com mini-gráficos e a nota de regras; depois o Resumo numérico (sem placar). Celular: slots
 * empilhados, "Adicionar" em BottomSheet, critérios em cartões, mini-gráficos em grade, Resumo e
 * "Copiar link". Estados: vazio, 1 ativo ("adicione mais um"), carregando (esqueleto sem pulsar com
 * reduced-motion) e erro com "Tentar de novo". Sem CTA de compra, sem "Salvar comparação", sem PDF.
 * O título/pílulas da área ficam na casca (fatia D); o rodapé legal também.
 */
import { useCallback, useMemo } from 'react';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';
import { CARD_ANALISE } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import AlertaMisto, {
  AvisoComparador,
  LinhaInformativa,
} from '@/components/analiseAtivos/comparador/AlertaMisto';
import BotaoCopiarLink from '@/components/analiseAtivos/comparador/BotaoCopiarLink';
import CartoesComparador from '@/components/analiseAtivos/comparador/CartoesComparador';
import MiniGraficosComparador, {
  legendaEscala,
} from '@/components/analiseAtivos/comparador/MiniGraficosComparador';
import ResumoNumerico from '@/components/analiseAtivos/comparador/ResumoNumerico';
import SlotAdicionar, { FOCO } from '@/components/analiseAtivos/comparador/SlotAdicionar';
import SlotsComparador from '@/components/analiseAtivos/comparador/SlotsComparador';
import TabelaComparador from '@/components/analiseAtivos/comparador/TabelaComparador';
import {
  adicionarTicker,
  removerTicker,
  useEstadoComparadorUrl,
} from '@/components/analiseAtivos/comparador/useEstadoComparadorUrl';
import { useNaCarteira } from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useIndiceBusca, useOverlayCarteira } from '@/hooks/useAnaliseAtivos';
import { useComparador } from '@/hooks/useAnaliseAtivosBlocoD';
import { MAX_ATIVOS_COMPARADOR } from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ComparadorProps, ComparadorResposta } from '@/types/analiseAtivosBlocoD';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

const TC = TEXTOS_COMPARADOR;
const MAX = String(MAX_ATIVOS_COMPARADOR);
const OUTRA: Record<ClasseQuadro, ClasseQuadro> = { acao: 'fii', fii: 'acao' };

/** Texto do aviso de um ticker ignorado do link. */
export function textoIgnorado(
  ig: ComparadorResposta['ignorados'][number],
  classe: ClasseQuadro,
): string {
  if (ig.motivo === 'outra_classe') {
    const outra = OUTRA[classe];
    return formatarTexto(TC.ignorados.outra_classe, {
      ticker: ig.ticker,
      classe: TC.ignorados.classes[outra],
      aba: TC.abas[outra],
    });
  }
  if (ig.motivo === 'formato') return formatarTexto(TC.ignorados.formato, { valor: ig.ticker });
  if (ig.motivo === 'excesso')
    return formatarTexto(TC.ignorados.excesso, { ticker: ig.ticker, max: MAX });
  return formatarTexto(TC.ignorados.inexistente, { ticker: ig.ticker });
}

/** Até 3 sugestões: pares dos ativos (na ordem dos slots), fora dos que já estão. */
export function sugestoesDosPares(
  dados: ComparadorResposta | undefined,
  slots: readonly string[],
): string[] {
  const out: string[] = [];
  for (const a of dados?.ativos ?? []) {
    for (const p of a.pares) {
      if (!slots.includes(p) && !out.includes(p)) out.push(p);
      if (out.length === 3) return out;
    }
  }
  return out;
}

function Esqueleto({ celular }: { celular: boolean }) {
  return (
    <div role="status" aria-label={TC.estados.carregando} className="flex flex-col gap-3">
      <div className={`grid gap-3 ${celular ? 'grid-cols-1' : 'grid-cols-2 xl:grid-cols-4'}`}>
        {Array.from({ length: celular ? 2 : 4 }, (_, i) => (
          <span
            key={i}
            className={`block rounded-[14px] bg-gray-100 motion-safe:animate-pulse dark:bg-white/[0.04] ${
              celular ? 'h-[60px]' : 'h-[118px]'
            }`}
          />
        ))}
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          className="block h-9 rounded-lg bg-gray-100 motion-safe:animate-pulse dark:bg-white/[0.04]"
        />
      ))}
    </div>
  );
}

export default function Comparador({ className = '' }: ComparadorProps) {
  const url = useEstadoComparadorUrl();
  const celular = useIsBelowLg();
  const q = useComparador(url.tickers, { enabled: url.tickers.length > 0 });
  const dados = url.tickers.length > 0 ? q.data : undefined;

  const ignorados = useMemo(() => new Set(dados?.ignorados.map((i) => i.ticker)), [dados]);
  const slots = useMemo(
    () => url.tickers.filter((t) => !ignorados.has(t)).slice(0, MAX_ATIVOS_COMPARADOR),
    [url.tickers, ignorados],
  );
  const classe: ClasseQuadro =
    (url.tickers.length > 0 ? dados?.classe : null) ?? url.classe ?? 'acao';
  const ativosPor = useMemo(
    () => new Map((dados?.ativos ?? []).map((a) => [a.ticker, a])),
    [dados],
  );
  const na = useNaCarteira(classe, slots.length > 0);
  const vazio = url.tickers.length === 0;
  const overlay = useOverlayCarteira({ enabled: vazio });
  const indice = useIndiceBusca({ enabled: vazio });

  const adicionar = useCallback(
    (t: string) => url.setTickers(adicionarTicker(slots, t)),
    [url, slots],
  );
  const remover = useCallback(
    (t: string) => url.setTickers(removerTicker(slots, t), classe),
    [url, slots, classe],
  );

  const abas = (['acao', 'fii'] as const).map((c) => ({ id: c, label: TC.abas[c] }));
  const nav = (
    <ResponsiveTabNav
      tabs={abas}
      activeId={classe}
      onChange={(id) => {
        if (id !== classe) url.trocarClasse(id as ClasseQuadro);
      }}
      ariaLabel={TC.abas.rotulo}
      variant="segmented-sub"
      // decisão 13: todo controle com 44px (o segmentado do celular tem 38px por padrão)
      className="shrink-0 [&>button]:min-h-11"
    />
  );
  const cheio = slots.length >= MAX_ATIVOS_COMPARADOR;
  const sugestoes = sugestoesDosPares(dados, slots);
  const card = `${CARD_ANALISE} flex flex-col gap-4`;

  // ---- vazio ----
  if (vazio) {
    const nomes = new Map((indice.data?.itens ?? []).map((i) => [i.t, i]));
    const daCarteira = Object.keys(overlay.data?.posicoes ?? {})
      .filter((t) => nomes.get(t)?.c === classe)
      .slice(0, 4);
    return (
      <div className={`flex min-w-0 flex-col gap-4 ${className}`} data-comparador="vazio">
        <section className={card} aria-labelledby="comparador-vazio">
          {nav}
          <div className="flex flex-col items-start gap-3 py-2">
            <h2
              id="comparador-vazio"
              className="text-base font-semibold text-gray-800 dark:text-white/90"
            >
              {TC.vazio.titulo}
            </h2>
            <p className="max-w-[640px] text-sm text-gray-700 dark:text-gray-300">
              {classe === 'fii' ? TC.vazio.textoFii : TC.vazio.textoAcao}
            </p>
            <SlotAdicionar
              classe={classe}
              slots={[]}
              sugestoes={[]}
              onAdicionar={adicionar}
              variante={celular ? 'celular' : 'botao'}
              celular={celular}
            />
            {daCarteira.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                <span>{TC.vazio.daCarteira}</span>
                {daCarteira.map((t) => (
                  <button
                    key={t}
                    type="button"
                    data-sugestao={t}
                    onClick={() => adicionar(t)}
                    className={`inline-flex min-h-11 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-[13px] text-gray-700 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300 ${FOCO}`}
                  >
                    <b className="font-semibold text-gray-800 dark:text-white/90">{t}</b>
                    {nomes.get(t)?.n ?? ''}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-gray-500 dark:text-gray-400">{TC.vazio.outrasEntradas}</p>
          </div>
        </section>
      </div>
    );
  }

  // ---- carregando / erro geral ----
  if (!dados) {
    return (
      <div className={`flex min-w-0 flex-col gap-4 ${className}`} data-comparador="estado">
        <section className={card} aria-busy={q.isError ? undefined : true}>
          {nav}
          {q.isError ? (
            <div role="alert" className="flex flex-col items-start gap-3">
              <p className="text-sm text-gray-800 dark:text-white/90">{TC.estados.erro}</p>
              <button
                type="button"
                onClick={() => q.refetch()}
                className={`inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 ${FOCO}`}
              >
                {TC.estados.tentarNovamente}
              </button>
            </div>
          ) : (
            <Esqueleto celular={celular} />
          )}
        </section>
      </div>
    );
  }

  // ---- com dados ----
  const avisos =
    dados.ignorados.length > 0 ? (
      <div className="flex flex-col gap-2">
        {dados.ignorados.map((ig) => (
          <AvisoComparador key={`${ig.motivo}-${ig.ticker}`} role="status">
            {textoIgnorado(ig, classe)}
          </AvisoComparador>
        ))}
      </div>
    ) : null;
  const erroAtualizar = q.isError ? (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 text-sm text-gray-800 dark:text-white/90"
    >
      {TC.estados.erro}
      <button
        type="button"
        onClick={() => q.refetch()}
        className={`inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium dark:border-gray-700 dark:bg-white/[0.03] ${FOCO}`}
      >
        {TC.estados.tentarNovamente}
      </button>
    </div>
  ) : null;
  const umAtivo = slots.length === 1 ? <LinhaInformativa>{TC.umAtivo}</LinhaInformativa> : null;
  const limite = cheio ? (
    <LinhaInformativa>{formatarTexto(TC.slots.limite, { max: MAX })}</LinhaInformativa>
  ) : null;
  const atualizando = q.isPlaceholderData || q.isFetching ? 'opacity-70' : '';
  const legenda = (
    <p className="text-[13px] text-gray-700 dark:text-gray-300" data-legenda-destaque="">
      {celular ? TC.destaque.legendaCurta : TC.destaque.legenda}
    </p>
  );
  const nota = [
    dados.graficos ? legendaEscala(dados.graficos) : null,
    TC.destaque.regras,
    classe === 'fii' ? TC.destaque.regrasFii : null,
    classe === 'fii' ? TC.destaque.semDestaqueFii : TC.destaque.semDestaqueAcao,
  ]
    .filter(Boolean)
    .join(' ');

  if (celular) {
    return (
      <div
        className={`flex min-w-0 flex-col gap-3 ${className}`}
        data-comparador={dados.classe}
        aria-busy={q.isFetching || undefined}
      >
        {na.fonte}
        {nav}
        {avisos}
        {erroAtualizar}
        <SlotsComparador slots={slots} ativos={ativosPor} onRemover={remover} celular />
        {cheio ? (
          limite
        ) : (
          <SlotAdicionar
            classe={classe}
            slots={slots}
            sugestoes={sugestoes}
            onAdicionar={adicionar}
            variante="celular"
            celular
          />
        )}
        {dados.misto ? <AlertaMisto /> : null}
        {legenda}
        {umAtivo}
        <div className={`flex flex-col gap-3 ${atualizando}`}>
          <CartoesComparador dados={dados} classe={classe} naCarteira={na.info} />
          {dados.graficos ? <MiniGraficosComparador graficos={dados.graficos} /> : null}
        </div>
        <ResumoNumerico resumo={dados.resumo} />
        <BotaoCopiarLink slots={slots} larguraToda />
      </div>
    );
  }

  return (
    <div
      className={`flex min-w-0 flex-col gap-4 ${className}`}
      data-comparador={dados.classe}
      aria-busy={q.isFetching || undefined}
    >
      {na.fonte}
      <section className={card} aria-label={TC.titulo}>
        {nav}
        {avisos}
        {erroAtualizar}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {legenda}
          <BotaoCopiarLink slots={slots} />
        </div>
        <SlotsComparador
          slots={slots}
          ativos={ativosPor}
          onRemover={remover}
          celular={false}
          adicionar={
            cheio ? undefined : (
              <SlotAdicionar
                classe={classe}
                slots={slots}
                sugestoes={sugestoes}
                onAdicionar={adicionar}
                variante="slot"
                celular={false}
              />
            )
          }
        />
        {limite}
        {dados.misto ? <AlertaMisto /> : null}
        {umAtivo}
        <div className={atualizando}>
          <TabelaComparador dados={dados} classe={classe} naCarteira={na.info} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{nota}</p>
      </section>
      <ResumoNumerico resumo={dados.resumo} />
    </div>
  );
}
