'use client';

/**
 * "Na sua carteira" (fatia D; v2.4 fatia C1). Os números são os da aba da Carteira
 * (useNaCarteiraAtivo) — valor, % da carteira, preço médio e rentabilidade idênticos aos da
 * Carteira, inclusive com o ativo movido de aba (#275).
 *
 * v2.4 (rec. 1, caso 33): posição × alvo SEMPRE na base da aba e em linguagem de DESVIO —
 * "posição atual 20,4% de Ações · alvo planejado por você: 25,0% de Ações · desvio −4,6 p.p.
 * (R$ 1.349)"; embaixo, "equivale hoje a ≈ 4,7% da carteira (informativo; muda com o mercado)".
 * Nunca "faltam"/"quanto falta". Planejar/Ajustar plano abrem o ModalPlanejar (Objetivo que já
 * existe na Carteira). Consultor agindo: pode planejar (o modal avisa).
 *
 * Estados: com posição · posição numa aba sem detalhe aqui (quantidade + link) · planejado · nada ·
 * carregando (skeleton só nos números) · erro.
 */
import Link from 'next/link';
import { useState } from 'react';
import ModalPlanejar, {
  pct1,
  ppComSinal,
  reais0,
} from '@/components/analiseAtivos/ativo/acoes/ModalPlanejar';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { desvioAlvo } from '@/services/analiseAtivos/regras/carteira/desvioAlvo';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_ACOES_CARTEIRA } from '@/services/analiseAtivos/textosAcoesCarteira';
import { formatBRL, formatPct } from '@/utils/format';
import BarraPesoAlvo from './BarraPesoAlvo';
import { BOTAO_SECUNDARIO } from '@/components/analiseAtivos/ativo/acoes/BarraAcoesAtivo';
import { useNaCarteiraAtivo, type NaCarteiraAtivo } from './useNaCarteiraAtivo';
import type { BlocoNaCarteiraProps } from '@/types/analiseAtivosApi';

export type { BlocoNaCarteiraProps };

const CARD =
  'flex min-w-0 flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const LINK = `inline-flex min-h-11 items-center text-sm font-medium ${COR_LINK.classes} hover:underline`;
const LINK_INLINE = `inline-flex min-h-11 items-center font-medium ${COR_LINK.classes} underline-offset-2 hover:underline`;
const t = TEXTOS_ACOES_CARTEIRA.naCarteira;

/** Quantidade como a tabela da aba (useAssetData.formatNumber: pt-BR, sem casas). */
const formatarQuantidade = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** dd/mm/aaaa de uma data civil 'AAAA-MM-DD'. */
function dataCurta(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

function Titulo({ link }: { link?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{t.titulo}</h2>
      {link}
    </div>
  );
}

function Numero({ valor, carregando }: { valor: React.ReactNode; carregando: boolean }) {
  if (carregando) {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-5 w-20 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-white/10"
      />
    );
  }
  return <>{valor}</>;
}

function Dado({
  rotulo,
  valor,
  carregando,
  nota,
}: {
  rotulo: string;
  valor: React.ReactNode;
  carregando: boolean;
  nota?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{rotulo}</dt>
      <dd className="text-[15px] font-semibold text-gray-800 tabular-nums dark:text-white/90">
        <Numero valor={valor} carregando={carregando} />
      </dd>
      {nota ? <span className="text-[11px] text-gray-500 dark:text-gray-400">{nota}</span> : null}
    </div>
  );
}

/** "Classe Ações no Planejamento: 21,9% da carteira (alvo 20%)". */
function LinhaClasse({ dados }: { dados: NaCarteiraAtivo }) {
  const aba = dados.abaNome ?? dados.abaBaseNome;
  if (dados.classePct === null || !aba) return null;
  const temAlvo = dados.classeAlvo !== null && dados.classeAlvo > 0;
  return (
    <p className="text-xs text-gray-500 dark:text-gray-400" data-linha-classe="">
      {formatarTexto(t.classe, { aba, pct: pct1(dados.classePct) })}{' '}
      {temAlvo
        ? formatarTexto(t.classeAlvo, { alvo: `${formatPct(dados.classeAlvo ?? 0, 0)}` })
        : t.classeSemAlvo}
    </p>
  );
}

export default function BlocoNaCarteira({
  ticker,
  classe,
  nome,
  assetId,
  precoCabecalho,
  precoData,
}: BlocoNaCarteiraProps) {
  const tickerNorm = ticker.toUpperCase();
  const dados = useNaCarteiraAtivo(tickerNorm, classe);
  const [planejando, setPlanejando] = useState(false);

  const modal = (
    <ModalPlanejar
      aberto={planejando}
      onFechar={() => setPlanejando(false)}
      ticker={tickerNorm}
      classe={classe}
      nome={nome}
      assetId={assetId}
      preco={precoCabecalho}
    />
  );
  const botaoPlanejar = (rotulo: string) => (
    <button
      type="button"
      className={LINK_INLINE}
      onClick={() => setPlanejando(true)}
      data-planejar-card=""
    >
      {rotulo}
    </button>
  );

  if (dados.status === 'carregando') {
    return (
      <section aria-label={t.titulo} aria-busy="true" className={CARD}>
        <Titulo />
        <div className="h-24 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
      </section>
    );
  }

  if (dados.status === 'erro') {
    return (
      <section aria-label={t.titulo} className={CARD} data-na-carteira="erro">
        <Titulo />
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-700 dark:text-gray-300">{t.erro}</span>
          <button type="button" onClick={dados.refetch} className={BOTAO_SECUNDARIO}>
            {t.tentarNovamente}
          </button>
        </div>
      </section>
    );
  }

  const abaNome = dados.abaNome ?? '';
  const linha = dados.linha;
  const carregando = dados.carregandoNumeros;
  const alvo = dados.objetivoPct;
  const equivalente =
    alvo !== null && dados.valorBaseAba !== null && dados.totalCarteira
      ? formatarTexto(t.equivalente, {
          pct: pct1(((alvo / 100) * dados.valorBaseAba * 100) / dados.totalCarteira),
        })
      : null;

  if (dados.status === 'nada' || dados.status === 'planejado') {
    return (
      <section aria-label={t.titulo} className={CARD} data-na-carteira={dados.status}>
        <Titulo />
        <div className="flex flex-col gap-1 rounded-xl border border-dashed border-gray-300 px-4 py-3.5 dark:border-gray-700">
          <p className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {formatarTexto(t.voceNaoTem, { ticker: tickerNorm })}
          </p>
          <p className="flex flex-wrap items-center gap-x-1 text-[13px] text-gray-600 dark:text-gray-300">
            {alvo !== null ? (
              <>
                {formatarTexto(t.alvoPlanejado, { pct: pct1(alvo), aba: abaNome })}
                {' · '}
                {botaoPlanejar(t.ajustarPlano)}
              </>
            ) : (
              <>
                {t.semAlvo}
                {' · '}
                {botaoPlanejar(t.planejar)}
              </>
            )}
          </p>
          {equivalente ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{equivalente}</p>
          ) : null}
        </div>
        <LinhaClasse dados={dados} />
        {dados.status === 'planejado' ? (
          <div className="flex flex-wrap gap-x-4">
            <Link href="/carteira" className={LINK}>
              {t.verNaCarteira}
            </Link>
          </div>
        ) : null}
        {modal}
      </section>
    );
  }

  const linkCarteira = dados.portfolioId
    ? `/ativos/${encodeURIComponent(dados.portfolioId)}`
    : '/carteira';

  // Posição numa aba sem detalhe aqui (ex.: movida para Stocks/ETF's): quantidade + link.
  if (!dados.abaDetalhada) {
    return (
      <section aria-label={t.titulo} className={CARD} data-na-carteira="aba">
        <Titulo
          link={
            <Link href={linkCarteira} className={LINK}>
              {t.abrirNaCarteira}
            </Link>
          }
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Dado
            rotulo={formatarTexto(t.naAba, { aba: abaNome })}
            valor={abaNome}
            carregando={false}
          />
          <Dado
            rotulo={t.quantidade}
            valor={formatarQuantidade(dados.quantidade ?? 0)}
            carregando={false}
          />
        </dl>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {formatarTexto(t.abaSemDetalhe, { aba: abaNome })}
        </p>
      </section>
    );
  }

  const conta =
    linha && dados.valorBaseAba !== null
      ? desvioAlvo({
          valorPosicao: linha.valorAtualizado,
          valorBase: dados.valorBaseAba,
          alvoPct: alvo,
          preco: null,
        })
      : null;
  const cotacaoDiverge =
    !!linha &&
    precoCabecalho !== null &&
    linha.cotacaoAtual > 0 &&
    Math.abs(linha.cotacaoAtual - precoCabecalho) >= 0.005;

  return (
    <section aria-label={t.titulo} className={CARD} data-na-carteira="posicao">
      <Titulo />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Dado
          rotulo={t.quantidade}
          valor={formatarQuantidade(linha?.quantidade ?? dados.quantidade ?? 0)}
          carregando={carregando && !linha}
        />
        <Dado
          rotulo={t.valor}
          valor={linha ? formatBRL(linha.valorAtualizado) : '—'}
          carregando={carregando}
        />
        <Dado
          rotulo={t.pctCarteira}
          valor={dados.pctCarteira !== null ? formatPct(dados.pctCarteira) : '—'}
          carregando={carregando}
        />
        <Dado
          rotulo={t.precoMedio}
          valor={linha ? formatBRL(linha.precoAquisicao) : '—'}
          carregando={carregando}
        />
        <Dado
          rotulo={t.rentabilidade}
          valor={
            linha ? (
              <span className={linha.rentabilidade < 0 ? 'text-[#D92D20] dark:text-[#F97066]' : ''}>
                {formatPct(linha.rentabilidade)}
              </span>
            ) : (
              '—'
            )
          }
          nota={t.rentabilidadeNota}
          carregando={carregando}
        />
      </dl>
      {conta ? (
        <BarraPesoAlvo
          rotulo={formatarTexto(t.posicaoAtual, { pct: pct1(conta.posicaoPct), aba: abaNome })}
          valor={conta.posicaoPct}
          referencia={alvo}
          rotuloReferencia={
            alvo !== null && conta.desvioPp !== null
              ? `${formatarTexto(t.alvoPlanejado, { pct: pct1(alvo), aba: abaNome })} · ${formatarTexto(
                  t.desvio,
                  { pp: ppComSinal(conta.desvioPp), valor: reais0(conta.desvioValor ?? 0) },
                )}`
              : t.semAlvo
          }
          acaoReferencia={botaoPlanejar(alvo !== null ? t.ajustarPlano : t.planejar)}
          ariaLabel={formatarTexto(t.barraAria, {
            pos: pct1(conta.posicaoPct),
            aba: abaNome,
            alvo:
              alvo !== null
                ? formatarTexto(t.barraAlvoAria, { pct: pct1(alvo), aba: abaNome })
                : t.barraSemAlvoAria,
          })}
          status={equivalente ?? undefined}
        />
      ) : null}
      <LinhaClasse dados={dados} />
      <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
        <p>{formatarTexto(t.notaAba, { aba: abaNome })}</p>
        {cotacaoDiverge && linha ? (
          <p data-nota-cotacao="">
            {formatarTexto(t.cotacaoDiferente, {
              valor: formatBRL(linha.cotacaoAtual),
              data: dataCurta(precoData),
            })}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-4">
        <Link href={linkCarteira} className={LINK}>
          {t.verNaCarteira}
        </Link>
      </div>
      {modal}
    </section>
  );
}
