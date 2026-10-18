'use client';

/**
 * "Na sua carteira" (fatia D; v2.4 fatia C1). Os números são os da aba da Carteira
 * (useNaCarteiraAtivo) — valor, % da carteira, preço médio e rentabilidade idênticos aos da
 * Carteira, inclusive com o ativo movido de aba (#275).
 *
 * Posição × alvo em linguagem de DESVIO — "posição atual 3,8% da aba · alvo planejado por você:
 * 6,0% em Ações · desvio −2,2 p.p. (R$ 3.633)" (1 casa). Desde 17/10/2026 o alvo é o OBJETIVO DA
 * CARTEIRA (% dentro da aba, o que o Planejar na carteira grava) e a base do desvio é a aba; o
 * "≈ X% da carteira total" é informativo. Nunca "faltam"/"quanto falta". Planejar/Ajustar plano
 * abrem o ModalPlanejar. Consultor agindo: pode planejar (o modal avisa).
 *
 * Estados: com posição · posição numa aba sem detalhe aqui (quantidade + link) · planejado (linha
 * planejada na aba, sem posição: objetivo + valor equivalente) · nada · carregando (skeleton só nos
 * números) · erro.
 *
 * Stocks e REITs (feature EUA, fatia D): a linha vem da aba Stocks/REIT's da Carteira (a mesma
 * função de preço, getAssetPrices). REIT: valores em US$ (a unidade em que a Carteira o guarda),
 * com a nota "Mesmo valor da aba ‹aba› da Carteira." Stock: a Carteira guarda o preço médio em R$
 * e soma a cotação em US$ (valoresMistos) — o card mostra só a quantidade e o link para a aba,
 * nunca um valor em R$ com o rótulo US$. A posição criada pelo wizard ('BRKB-…') casa a página
 * BRK.B.
 */
import Link from 'next/link';
import { useState } from 'react';
import ModalPlanejar, {
  dinheiro0,
  pct1,
  ppComSinal,
} from '@/components/analiseAtivos/ativo/acoes/ModalPlanejar';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { desvioAlvo } from '@/services/analiseAtivos/regras/carteira/desvioAlvo';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_ACOES_CARTEIRA } from '@/services/analiseAtivos/textosAcoesCarteira';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { formatBRL, formatPct, formatUSD } from '@/utils/format';
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
const TP = TEXTOS_ACOES_CARTEIRA.planejar;

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

/** "≈ 2,0% da carteira total": objetivo (% da aba) × peso atual da aba na carteira. */
function LinhaEquivalenteTotal({ dados }: { dados: NaCarteiraAtivo }) {
  if (dados.objetivoAbaPct === null || dados.classePct === null || !(dados.valorAba ?? 0)) {
    return null;
  }
  return (
    <p className="text-xs text-gray-500 dark:text-gray-400" data-equivalente-total="">
      {formatarTexto(t.equivalente, { pct: pct1((dados.objetivoAbaPct * dados.classePct) / 100) })}
    </p>
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
  // valores na unidade da aba: R$ (Ações/FII's) ou US$ (Stocks/REIT's), como a Carteira mostra
  const dinheiro = dados.moeda === 'USD' ? formatUSD : formatBRL;
  const dinheiroInteiro = (v: number) => dinheiro0(v, dados.moeda);
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
  // alvo = Objetivo da Carteira (% dentro da aba)
  const alvo = dados.objetivoAbaPct;
  const abaPlano = dados.abaNome ?? dados.abaBaseNome ?? '';

  if (dados.status === 'nada' || dados.status === 'planejado') {
    const alvoValor =
      alvo !== null && dados.valorAba !== null && dados.valorAba > 0
        ? (alvo / 100) * dados.valorAba
        : null;
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
                {formatarTexto(t.alvoPlanejado, { pct: pct1(alvo), aba: abaPlano })}
                {' · '}
                {botaoPlanejar(t.ajustarPlano)}
              </>
            ) : (
              <>
                {t.semAlvo}
                {' · '}
                {botaoPlanejar(dados.temPlano ? t.ajustarPlano : t.planejar)}
              </>
            )}
          </p>
          {alvo !== null ? (
            <p className="text-xs text-gray-500 dark:text-gray-400" data-valor-alvo="">
              {TP.valorAlvo}:{' '}
              <span className="font-semibold text-gray-700 tabular-nums dark:text-gray-200">
                <Numero
                  valor={alvoValor !== null ? dinheiroInteiro(alvoValor) : '—'}
                  carregando={carregando && alvoValor === null}
                />
              </span>
            </p>
          ) : null}
        </div>
        <LinhaEquivalenteTotal dados={dados} />
        <LinhaClasse dados={dados} />
        {dados.watchlistId ? (
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

  // Posição numa aba sem detalhe aqui (ex.: movida para ETF's) ou stock com preço médio em R$ e
  // cotação em US$ na aba Stocks (sem unidade única): quantidade + link.
  if (!dados.abaDetalhada || dados.valoresMistos) {
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
    linha && dados.valorAba !== null && dados.valorAba > 0
      ? desvioAlvo({
          valorPosicao: linha.valorAtualizado,
          valorBase: dados.valorAba,
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
          valor={linha ? dinheiro(linha.valorAtualizado) : '—'}
          carregando={carregando}
        />
        <Dado
          rotulo={t.pctCarteira}
          valor={dados.pctCarteira !== null ? formatPct(dados.pctCarteira) : '—'}
          carregando={carregando}
        />
        <Dado
          rotulo={t.precoMedio}
          valor={linha ? dinheiro(linha.precoAquisicao) : '—'}
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
          rotulo={formatarTexto(t.posicaoAtual, { pct: pct1(conta.posicaoPct) })}
          valor={conta.posicaoPct}
          referencia={alvo}
          rotuloReferencia={
            alvo !== null && conta.desvioPp !== null
              ? `${formatarTexto(t.alvoPlanejado, { pct: pct1(alvo), aba: abaNome })} · ${formatarTexto(
                  t.desvio,
                  {
                    pp: ppComSinal(conta.desvioPp),
                    valor: dinheiroInteiro(conta.desvioValor ?? 0),
                  },
                )}`
              : t.semAlvo
          }
          acaoReferencia={botaoPlanejar(alvo !== null ? t.ajustarPlano : t.planejar)}
          ariaLabel={formatarTexto(t.barraAria, {
            pos: pct1(conta.posicaoPct),
            alvo:
              alvo !== null
                ? formatarTexto(t.barraAlvoAria, { pct: pct1(alvo) })
                : t.barraSemAlvoAria,
          })}
        />
      ) : null}
      <LinhaEquivalenteTotal dados={dados} />
      <LinhaClasse dados={dados} />
      <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
        <p>{formatarTexto(t.notaAba, { aba: abaNome })}</p>
        {dados.moeda === 'USD' ? (
          <p data-mesmo-valor="">
            {formatarTexto(TEXTOS_EUA.carteira.mesmoValor, { aba: abaNome })}
          </p>
        ) : null}
        {cotacaoDiverge && linha ? (
          <p data-nota-cotacao="">
            {formatarTexto(t.cotacaoDiferente, {
              valor: dinheiro(linha.cotacaoAtual),
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
