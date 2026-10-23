'use client';

/**
 * Modal "Comparar ‹ticker› com até 3 ‹classe›" (fatia C1). O ativo atual fica fixo no 1º slot; o
 * usuário escolhe até 3 entre as sugestões (GET comparar-sugestoes: pares do mesmo setor/segmento
 * primeiro, depois A–Z; em FII só o mesmo perfil) ou pela busca. "Abrir comparador" navega para o
 * Comparador com os tickers na ordem — NÃO grava nada (rec. 7; o Comparador tem "Copiar link").
 * Linhas são role=checkbox (aria-checked; aria-disabled quando já há 4). Sem cor de placar: a
 * contagem "n de k crit." é neutra.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import ModalAnalise, {
  BOTAO_MODAL_PRIMARIO,
  BOTAO_MODAL_SECUNDARIO,
  DICA_RODAPE,
  FOCO_MODAL,
  SUBTITULO_MODAL,
} from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { useAtivoTopo } from '@/hooks/useAnaliseAtivos';
import { useSugestoesComparar } from '@/hooks/useAcoesCarteiraAnalise';
import { MAX_ATIVOS_COMPARADOR, ROTAS_BLOCO_D } from '@/services/analiseAtivos/cenarios/contrato';
import { tipoCvmDoTopo } from '@/services/analiseAtivos/regras/carteira/secaoOperacao';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import {
  CLASSE_CARTEIRA,
  TEXTOS_ACOES_CARTEIRA,
} from '@/services/analiseAtivos/textosAcoesCarteira';
import { JANELA_PADRAO, type ModalCompararProps } from '@/types/analiseAtivosCriterios';
import type { SugestaoComparar } from '@/types/analiseAtivosCriterios';

export type { ModalCompararProps };

const T = TEXTOS_ACOES_CARTEIRA.comparar;
const CHIP =
  'inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap';

/** Link do Comparador com os tickers nos slots (e a janela, se não for a padrão). */
export function linkComparador(tickers: readonly string[], janela: number): string {
  const base = ROTAS_BLOCO_D.comparar(tickers);
  return janela === JANELA_PADRAO ? base : `${base}&janela=${janela}`;
}

function textoMetrica(s: SugestaoComparar): string | null {
  if (!s.metrica) return null;
  const v = s.metrica.valor;
  return `${s.metrica.rotulo} ${v.estado === 'ok' ? formatarAnalise(v.valor, s.metrica.formato) : '—'}`;
}

export default function ModalComparar({
  aberto,
  onFechar,
  ticker,
  classe,
  janela = JANELA_PADRAO,
}: ModalCompararProps) {
  const t = ticker.toUpperCase();
  const cl = CLASSE_CARTEIRA[classe];
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const topo = useAtivoTopo(t, { enabled: aberto && classe === 'fii' });
  const sugestoes = useSugestoesComparar(t, janela, buscaAtiva, aberto);

  // Reabrir começa do zero.
  useEffect(() => {
    if (aberto) return;
    setBusca('');
    setBuscaAtiva('');
    setEscolhidos([]);
  }, [aberto]);

  // Busca com 250 ms de folga (uma requisição por pausa de digitação).
  useEffect(() => {
    const id = window.setTimeout(() => setBuscaAtiva(busca.trim()), 250);
    return () => window.clearTimeout(id);
  }, [busca]);

  const vagas = MAX_ATIVOS_COMPARADOR - 1;
  const cheio = escolhidos.length >= vagas;
  const alternar = (x: string) =>
    setEscolhidos((atual) =>
      atual.includes(x)
        ? atual.filter((y) => y !== x)
        : atual.length >= vagas
          ? atual
          : [...atual, x],
    );

  // Mesmo perfil do servidor: tijolo = tijolo; o resto (papel, FoF, híbrido sem avaliação) = papel.
  const tijolo = topo.data ? tipoCvmDoTopo(topo.data) === 'tijolo' : null;
  const subtitulo =
    classe === 'fii' && tijolo !== null
      ? formatarTexto(T.subtituloFii, { tipo: tijolo ? T.tipoTijolo : T.tipoPapel })
      : T.subtituloAcao;
  const itens = sugestoes.data?.itens ?? [];

  const rodape = (
    <>
      <span className={DICA_RODAPE} aria-live="polite">
        {escolhidos.length === 0
          ? T.escolhaUm
          : cheio
            ? T.nDe4Cheio
            : formatarTexto(T.nDe4, { n: escolhidos.length + 1 })}
      </span>
      <button type="button" className={BOTAO_MODAL_SECUNDARIO} onClick={onFechar}>
        {TEXTOS_ACOES_CARTEIRA.modal.cancelar}
      </button>
      {escolhidos.length === 0 ? (
        <button type="button" aria-disabled="true" className={`${BOTAO_MODAL_PRIMARIO} opacity-50`}>
          {T.abrir}
        </button>
      ) : (
        <Link
          href={linkComparador([t, ...escolhidos], janela)}
          className={BOTAO_MODAL_PRIMARIO}
          data-abrir-comparador=""
        >
          {T.abrir}
        </Link>
      )}
    </>
  );

  return (
    <ModalAnalise
      aberto={aberto}
      onFechar={onFechar}
      titulo={formatarTexto(T.titulo, { ticker: t, plural: cl.plural })}
      largura="larga"
      rodape={rodape}
    >
      <p className={SUBTITULO_MODAL}>{subtitulo}</p>
      <div aria-label={T.selecionados} role="group" className="flex flex-wrap gap-1.5 pb-2.5">
        <span className={`${CHIP} border-[#314666] bg-[#314666] text-white`}>{t}</span>
        {escolhidos.map((x) => (
          <button
            key={x}
            type="button"
            aria-label={formatarTexto(T.tirar, { ticker: x })}
            onClick={() => alternar(x)}
            className={`${CHIP} border-[#396CAA] bg-[#EDF2F8] text-[#314666] dark:border-[#6E9DC4] dark:bg-white/10 dark:text-white/90 ${FOCO_MODAL}`}
          >
            {x} ×
          </button>
        ))}
        {Array.from({ length: Math.max(0, vagas - escolhidos.length) }, (_, i) => (
          <span
            key={`vaga-${i}`}
            aria-hidden="true"
            className={`${CHIP} border-dashed border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400`}
          >
            {T.maisAtivo}
          </span>
        ))}
      </div>
      <label className="mb-2 block">
        <span className="sr-only">{T.busca}</span>
        <input
          type="search"
          data-autofocus=""
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={T.busca}
          maxLength={40}
          className={`min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-800 lg:min-h-11 lg:text-sm placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${FOCO_MODAL}`}
        />
      </label>
      {sugestoes.isError && !sugestoes.data ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 py-3 text-sm">
          <span className="text-gray-700 dark:text-gray-300">{T.erro}</span>
          <button
            type="button"
            className={BOTAO_MODAL_SECUNDARIO}
            onClick={() => void sugestoes.refetch()}
          >
            {TEXTOS_ACOES_CARTEIRA.modal.tentarDeNovo}
          </button>
        </div>
      ) : sugestoes.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-1.5" data-sugestoes-carregando="">
          <span className="sr-only">{TEXTOS_ACOES_CARTEIRA.modal.carregando}</span>
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="h-[52px] animate-pulse rounded-[10px] bg-gray-100 motion-reduce:animate-none dark:bg-white/5"
            />
          ))}
        </div>
      ) : itens.length === 0 ? (
        <p className="py-3 text-sm text-gray-500 dark:text-gray-400">{T.vazio}</p>
      ) : (
        <div role="group" aria-label={T.sugestoes} className="flex flex-col gap-0.5">
          {itens.map((s) => {
            const marcado = escolhidos.includes(s.ticker);
            const desabilitado = !marcado && cheio;
            const metrica = textoMetrica(s);
            return (
              <button
                key={s.ticker}
                type="button"
                role="checkbox"
                aria-checked={marcado}
                aria-disabled={desabilitado}
                data-sugestao={s.ticker}
                onClick={() => {
                  if (!desabilitado) alternar(s.ticker);
                }}
                className={`grid min-h-[52px] w-full grid-cols-[36px_minmax(0,1fr)_32px] items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left lg:grid-cols-[40px_minmax(0,1fr)_auto_auto_32px] ${
                  marcado
                    ? 'bg-[#EDF2F8] dark:bg-white/10'
                    : 'hover:bg-gray-50 dark:hover:bg-white/5'
                } ${desabilitado ? 'cursor-not-allowed opacity-45' : ''} ${FOCO_MODAL}`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 place-items-center rounded-lg bg-[#314666] text-[11px] font-bold text-white lg:w-10"
                >
                  {s.ticker.slice(0, 4)}
                </span>
                <span className="min-w-0">
                  <b className="block text-sm font-semibold text-gray-800 dark:text-white/90">
                    {s.ticker}
                  </b>
                  <small className="block truncate text-xs text-gray-500 dark:text-gray-400">
                    <span data-nome-ativo="">{s.nome}</span>
                    {s.mesmoSetor ? ` · ${T.mesmoSetor}` : ''}
                  </small>
                </span>
                <span className="hidden text-[12.5px] whitespace-nowrap text-gray-500 tabular-nums lg:inline dark:text-gray-400">
                  {metrica ?? ''}
                </span>
                <span className="hidden text-[12.5px] whitespace-nowrap text-gray-500 tabular-nums lg:inline dark:text-gray-400">
                  {s.criterios ? (
                    <span
                      aria-label={formatarTexto(T.criteriosAria, {
                        n: s.criterios.n,
                        de: s.criterios.de,
                        janela,
                      })}
                    >
                      {formatarTexto(T.criterios, { n: s.criterios.n, de: s.criterios.de })}
                    </span>
                  ) : (
                    T.semCriterios
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className={`grid h-7 w-7 place-items-center rounded-full border text-sm font-bold ${
                    marcado
                      ? 'border-[#396CAA] bg-[#396CAA] text-white'
                      : 'border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400'
                  }`}
                >
                  {marcado ? '✓' : '+'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </ModalAnalise>
  );
}
