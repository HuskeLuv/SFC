'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ResponsiveCardList } from '@/components/ui/table/ResponsiveTable';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import type { CategoriaV2, FonteOrcamento, VisaoOrcamento } from '@/types/orcamentoV2';
import AvisoGeral from './AvisoGeral';
import CartaoCategoria from './CartaoCategoria';
import HeroiOrcamento from './HeroiOrcamento';
import { DEBOUNCE_PREFS_MS } from './OrcamentoV2Tabela';
import type { ConteudoOrcamentoV2Props } from './OrcamentoV2Section';
import { textoReferencia } from './OrcamentoV2Section';
import { TEXTO_FONTE_P1, mesLongo, num, pct, plural } from './apresentacao';

const SEGMENTO =
  'grid grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-white/[0.03]';
const opcao = (ativa: boolean) =>
  `min-h-9 truncate rounded-md px-2 text-sm font-medium transition ${
    ativa
      ? 'bg-white text-brand-600 shadow-theme-xs dark:bg-gray-900 dark:text-brand-400'
      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
  }`;
const BTN_MES =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg text-gray-600 disabled:opacity-40 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300';

/** Esqueleto dos cartões (herói + cartões), no lugar do conteúdo enquanto o GET carrega. */
function EsqueletoCartoes() {
  const bloco = 'rounded-2xl bg-gray-200 motion-safe:animate-pulse dark:bg-gray-800';
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando orçamento">
      <div className={`h-40 ${bloco}`} />
      <div className="grid grid-cols-2 gap-2.5">
        <div className={`h-20 ${bloco}`} />
        <div className={`h-20 ${bloco}`} />
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={`h-24 ${bloco} opacity-70`} />
      ))}
    </div>
  );
}

/**
 * Orçamento v2 no celular (abaixo de lg; desenho técnico §8/§9 PR 11 — "cartões mínimos"):
 * mês com ‹ ›, um seletor simples de Mês | Acumulado e outro de Lançado | Consolidado, o herói
 * com o resumo, um cartão por categoria (`ResponsiveCardList` com o cartão próprio) com as subs
 * em duas linhas e o orçado editável, e o total. A tabela nunca aparece aqui. Sem larguras fixas:
 * nada rola na horizontal em 320–430 px (T31/M01).
 *
 * Recolher/expandir usa a mesma preferência do desktop (`prefs.categoriasRecolhidas`, com o mesmo
 * debounce). Chips, busca, gráfico, menu ⋯ e CRUD de subcategoria no celular são da E5.
 */
export default function OrcamentoV2Cartoes({
  data,
  loading,
  error,
  ano,
  mes,
  onMesChange,
  visao,
  onVisaoChange,
  fonte,
  onFonteChange,
  orcamento,
}: ConteudoOrcamentoV2Props) {
  // ── Recolher / expandir (otimista na tela; o PUT sai depois do debounce) ─────────────────
  const [recolhidasLocal, setRecolhidasLocal] = useState<string[] | null>(null);
  const recolhidas = new Set(recolhidasLocal ?? data?.prefs.categoriasRecolhidas ?? []);
  const pendenteRef = useRef<string[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvarRef = useRef((ids: string[]) =>
    orcamento.salvarPrefs.mutate({ categoriasRecolhidas: ids }),
  );
  salvarRef.current = (ids: string[]) =>
    orcamento.salvarPrefs.mutate({ categoriasRecolhidas: ids });

  const descarregar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (pendenteRef.current) salvarRef.current(pendenteRef.current);
    pendenteRef.current = null;
  }, []);
  useEffect(() => descarregar, [descarregar]);

  const definirRecolhidas = (ids: string[]) => {
    setRecolhidasLocal(ids);
    pendenteRef.current = ids;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(descarregar, DEBOUNCE_PREFS_MS);
  };
  const alternar = (id: string) =>
    definirRecolhidas(
      recolhidas.has(id) ? [...recolhidas].filter((x) => x !== id) : [...recolhidas, id],
    );

  const visoes: { valor: VisaoOrcamento; rotulo: string }[] = [
    { valor: 'mes', rotulo: 'Mês' },
    { valor: 'ano', rotulo: 'Acumulado' },
  ];
  const fontes: { valor: FonteOrcamento; rotulo: string }[] = [
    { valor: 'lancado', rotulo: 'Lançado' },
    { valor: 'consolidado', rotulo: 'Consolidado' },
  ];

  let conteudo;
  if (loading) {
    conteudo = <EsqueletoCartoes />;
  } else if (error || !data) {
    conteudo = (
      <p role="alert" className={`py-8 text-center text-sm ${SELO_TEXTO.estourou}`}>
        {error ?? 'Erro ao carregar o orçamento.'}
      </p>
    );
  } else {
    const { referencia, resumo } = data;
    const anual = data.visao === 'ano';
    const mostrarRitmo = anual || referencia.fase === 'corrente';
    const rotuloReal = referencia.rotuloRealizado === 'previsto' ? 'previsto' : 'real';
    const todasAbertas = data.categorias.every((c) => !recolhidas.has(c.id));
    conteudo = (
      <>
        <AvisoGeral
          pendente={data.prefs.avisoGeralPendente}
          onVisto={() => orcamento.salvarPrefs.mutate({ avisoGeralVisto: true })}
        />
        <HeroiOrcamento data={data} />

        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
            Por categoria
          </h3>
          <button
            type="button"
            onClick={() => definirRecolhidas(todasAbertas ? data.categorias.map((c) => c.id) : [])}
            className="min-h-9 shrink-0 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200"
          >
            {todasAbertas ? 'Recolher todas' : 'Expandir todas'}
          </button>
        </div>

        <ResponsiveCardList<CategoriaV2>
          columns={[]}
          rows={data.categorias}
          getRowKey={(c) => c.id}
          ariaLabel="Orçamento por categoria"
          getRowAttributes={(c) => ({ 'data-categoria-id': c.id })}
          emptyState="Nenhuma categoria de despesa no Fluxo de Caixa deste ano."
          renderMobileCard={(c) => (
            <CartaoCategoria
              categoria={c}
              aberta={!recolhidas.has(c.id)}
              onAlternar={() => alternar(c.id)}
              ritmo={referencia.ritmo}
              mostrarRitmo={mostrarRitmo}
              rotuloReal={rotuloReal}
              onSalvarOrcado={(e) => orcamento.salvarOrcado.mutateAsync(e)}
            />
          )}
        />

        <div
          data-mf-orcamento-total-mobile=""
          className={`${TABLE_MOBILE_STYLES.totalCard} flex flex-wrap items-start justify-between gap-x-3 gap-y-1`}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {anual ? 'Total acumulado' : 'Total do mês'}
            </p>
            <p className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
              {plural(resumo.totalCategorias, 'categoria', 'categorias')} ·{' '}
              {plural(resumo.totalSubcategorias, 'subcategoria', 'subcategorias')}
            </p>
          </div>
          <div className="text-right tabular-nums">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {num(resumo.realizado)}
            </p>
            <p className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
              de {num(resumo.orcado)}
              {resumo.realizadoPctOrcado !== null && ` · ${pct(resumo.realizadoPctOrcado, 0)}`}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="min-w-0 space-y-3" data-mf-orcamento-v2-celular="">
      {/* Mês: ‹ Outubro 2026 › (o ano é o do seletor do Fluxo de Caixa) */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={BTN_MES}
          onClick={() => onMesChange(mes - 1)}
          disabled={mes <= 1}
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <p
          className="min-w-0 truncate text-center text-base font-semibold text-gray-800 dark:text-white/90"
          aria-live="polite"
          data-mf-orcamento-mes=""
        >
          {mesLongo({ ano, mes })}
        </p>
        <button
          type="button"
          className={BTN_MES}
          onClick={() => onMesChange(mes + 1)}
          disabled={mes >= 12}
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>

      {/* Seletores simples: visão e fonte do realizado */}
      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        <div role="group" aria-label="Visão" className={SEGMENTO}>
          {visoes.map((v) => (
            <button
              key={v.valor}
              type="button"
              className={opcao(visao === v.valor)}
              aria-pressed={visao === v.valor}
              onClick={() => onVisaoChange(v.valor)}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
        <div
          role="group"
          aria-label="Fonte do realizado"
          title={TEXTO_FONTE_P1}
          className={SEGMENTO}
        >
          {fontes.map((f) => (
            <button
              key={f.valor}
              type="button"
              className={opcao(fonte === f.valor)}
              aria-pressed={fonte === f.valor}
              onClick={() => onFonteChange(f.valor)}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      </div>
      {data && !loading && (
        <p className="text-xs text-gray-500 dark:text-gray-400" data-mf-orcamento-referencia="">
          {textoReferencia(data)}
        </p>
      )}

      {conteudo}
    </div>
  );
}
