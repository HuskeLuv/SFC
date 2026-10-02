'use client';

/**
 * "Na sua carteira" (fatia D, decisão 9 / crítica 8). Os números são os da aba da Carteira
 * (useNaCarteiraAtivo) — valor, % da aba, objetivo, quanto falta, rentabilidade e classe × alvo
 * idênticos aos da Carteira, inclusive com o ativo movido de aba (#275).
 *
 * Estados: com posição (números + duas barras) · posição numa aba sem detalhe aqui (só
 * quantidade + link) · planejado (objetivo + quanto falta + editar objetivo) · nada ("Você não
 * tem" + Planejar) · carregando (skeleton só nos números) · erro.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAcoes } from '@/hooks/useAcoes';
import { useFii } from '@/hooks/useFii';
import { queryKeys } from '@/lib/queryKeys';
import { CATEGORIA_API_PATH } from '@/lib/carteiraMover';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import { formatBRL, formatNumber, formatPct } from '@/utils/format';
import BarraPesoAlvo from './BarraPesoAlvo';
import {
  BOTAO_SECUNDARIO,
  useWizardCarteiraAtivo,
} from '@/components/analiseAtivos/ativo/usuario/AcoesCarteiraAtivo';
import {
  useNaCarteiraAtivo,
  type AbaDetalhada,
  type LinhaAbaCarteira,
  type NaCarteiraAtivo,
} from './useNaCarteiraAtivo';
import type { BlocoNaCarteiraProps } from '@/types/analiseAtivosApi';

export type { BlocoNaCarteiraProps };

const CARD =
  'flex min-w-0 flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const LINK = `inline-flex min-h-11 items-center text-sm font-medium ${COR_LINK.classes} hover:underline`;
const t = TEXTOS_TELA.naCarteira;

/** Quantidade como a tabela da aba (useAssetData.formatNumber: pt-BR, sem casas). */
const formatarQuantidade = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const pp = (v: number) => formatNumber(Math.abs(v), 1);

/** dd/mm/aaaa de uma data civil 'AAAA-MM-DD'. */
function dataCurta(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

function statusObjetivo(peso: number, objetivo: number): string {
  if (!(objetivo > 0)) return t.semObjetivo;
  const dif = objetivo - peso;
  if (Math.abs(dif) < 0.05) return t.noObjetivo;
  return dif > 0
    ? formatarTexto(t.faltamParaObjetivo, { valor: pp(dif) })
    : formatarTexto(t.acimaDoObjetivo, { valor: pp(dif) });
}

function statusAlvo(pct: number, alvo: number | null): string {
  if (alvo === null || !(alvo > 0)) return t.semAlvo;
  const dif = pct - alvo;
  if (Math.abs(dif) < 0.05) return t.noAlvo;
  return dif > 0
    ? formatarTexto(t.acimaDoAlvo, { valor: pp(dif) })
    : formatarTexto(t.abaixoDoAlvo, { valor: pp(dif) });
}

function Titulo({ link }: { link?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
        {TEXTOS_TELA.blocos.naCarteira}
      </h2>
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

function BarraClasse({ dados }: { dados: NaCarteiraAtivo }) {
  if (dados.classePct === null || !dados.abaNome) return null;
  const rotulo = formatarTexto(t.classeNoPlanejamento, { aba: dados.abaNome });
  const temAlvo = dados.classeAlvo !== null && dados.classeAlvo > 0;
  return (
    <BarraPesoAlvo
      rotulo={rotulo}
      valor={dados.classePct}
      referencia={temAlvo ? dados.classeAlvo : null}
      rotuloReferencia={
        temAlvo
          ? formatarTexto(t.rotuloBarraAlvo, { valor: formatNumber(dados.classeAlvo, 0) })
          : t.semAlvo
      }
      status={temAlvo ? statusAlvo(dados.classePct, dados.classeAlvo) : undefined}
    />
  );
}

/** Edição do objetivo pelo MESMO updateObjetivo da aba (montado só ao editar). */
function EditorObjetivo({
  aba,
  linha,
  onFechar,
}: {
  aba: AbaDetalhada;
  linha: LinhaAbaCarteira;
  onFechar: () => void;
}) {
  return aba === 'acoes' ? (
    <EditorObjetivoAcoes linha={linha} onFechar={onFechar} />
  ) : (
    <EditorObjetivoFii linha={linha} onFechar={onFechar} />
  );
}

function EditorObjetivoAcoes(p: { linha: LinhaAbaCarteira; onFechar: () => void }) {
  const { updateObjetivo } = useAcoes();
  return <FormObjetivo {...p} aba="acoes" salvar={updateObjetivo} />;
}

function EditorObjetivoFii(p: { linha: LinhaAbaCarteira; onFechar: () => void }) {
  const { updateObjetivo } = useFii();
  return <FormObjetivo {...p} aba="fiis" salvar={updateObjetivo} />;
}

function FormObjetivo({
  aba,
  linha,
  onFechar,
  salvar,
}: {
  aba: AbaDetalhada;
  linha: LinhaAbaCarteira;
  onFechar: () => void;
  salvar: (id: string, objetivo: number) => Promise<boolean>;
}) {
  const qc = useQueryClient();
  const [valor, setValor] = useState(String(linha.objetivo ?? 0).replace('.', ','));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  const numero = Number(valor.replace(',', '.'));
  const valido = valor.trim() !== '' && Number.isFinite(numero) && numero >= 0 && numero <= 100;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido || salvando) return;
    setSalvando(true);
    setErro(false);
    const ok = await salvar(linha.id, numero);
    setSalvando(false);
    if (!ok) {
      setErro(true);
      return;
    }
    void qc.invalidateQueries({ queryKey: queryKeys.analiseAtivos.carteira() });
    void qc.invalidateQueries({ queryKey: queryKeys.assets.type(CATEGORIA_API_PATH[aba]) });
    onFechar();
  };

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-2" data-editor-objetivo="">
      <label className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-300">
        {t.objetivoRotulo}
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-invalid={!valido}
          className="min-h-11 w-28 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 tabular-nums dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </label>
      <button
        type="submit"
        disabled={!valido || salvando}
        className={`${BOTAO_SECUNDARIO} disabled:opacity-50`}
      >
        {t.salvar}
      </button>
      <button type="button" onClick={onFechar} className={LINK}>
        {t.cancelar}
      </button>
      {erro ? (
        <p role="alert" className="w-full text-[13px] text-[#D92D20] dark:text-[#F97066]">
          {t.erroObjetivo}
        </p>
      ) : null}
    </form>
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
  const { actingClient } = useAuth();
  const { abrir, wizard } = useWizardCarteiraAtivo({ ticker: tickerNorm, classe, nome, assetId });
  const [editando, setEditando] = useState(false);

  if (dados.status === 'carregando') {
    return (
      <section aria-label={TEXTOS_TELA.blocos.naCarteira} aria-busy="true" className={CARD}>
        <Titulo />
        <div className="h-24 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
      </section>
    );
  }

  if (dados.status === 'erro') {
    return (
      <section aria-label={TEXTOS_TELA.blocos.naCarteira} className={CARD} data-na-carteira="erro">
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

  if (dados.status === 'nada') {
    return (
      <section aria-label={TEXTOS_TELA.blocos.naCarteira} className={CARD} data-na-carteira="nada">
        <Titulo />
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-gray-300 px-4 py-3.5 dark:border-gray-700">
          <p className="max-w-[62ch] text-sm text-gray-700 dark:text-gray-300">
            {formatarTexto(t.voceNaoTem, { ticker: tickerNorm })}
          </p>
          {actingClient ? null : (
            <button type="button" className={BOTAO_SECUNDARIO} onClick={() => abrir('planejar')}>
              {TEXTOS_TELA.acoes.planejar}
            </button>
          )}
        </div>
        {wizard}
      </section>
    );
  }

  const linha = dados.linha;
  const carregando = dados.carregandoNumeros;
  const abaNome = dados.abaNome ?? '';
  const linkCarteira = dados.portfolioId
    ? `/ativos/${encodeURIComponent(dados.portfolioId)}`
    : '/carteira';

  if (dados.status === 'planejado') {
    const objetivo = linha?.objetivo ?? dados.objetivoPlanejado ?? 0;
    const falta = linha && linha.necessidadeAporte > 0 ? linha.necessidadeAporte : null;
    return (
      <section
        aria-label={TEXTOS_TELA.blocos.naCarteira}
        className={CARD}
        data-na-carteira="planejado"
      >
        <Titulo />
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3.5 dark:border-gray-700">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <strong className="font-semibold text-gray-800 dark:text-white/90">
              {formatarTexto(t.planejadoEm, {
                aba: abaNome,
                objetivo: formatNumber(objetivo, objetivo % 1 === 0 ? 0 : 2),
              })}
              .
            </strong>{' '}
            {t.semPosicao}{' '}
            {falta !== null
              ? formatarTexto(t.faltaPlanejado, { aba: abaNome, valor: formatBRL(falta) })
              : null}
          </p>
          <div className="flex flex-wrap items-center gap-x-4">
            <Link href="/carteira" className={LINK}>
              {TEXTOS_TELA.acoes.verNaCarteira}
            </Link>
            {dados.abaDetalhada && linha && !actingClient && !editando ? (
              <button type="button" className={LINK} onClick={() => setEditando(true)}>
                {TEXTOS_TELA.acoes.editarObjetivo}
              </button>
            ) : null}
          </div>
          {editando && dados.abaDetalhada && linha ? (
            <EditorObjetivo
              aba={dados.abaDetalhada}
              linha={linha}
              onFechar={() => setEditando(false)}
            />
          ) : null}
        </div>
        <BarraClasse dados={dados} />
      </section>
    );
  }

  // Posição numa aba sem detalhe aqui (ex.: movida para Stocks/ETF's): quantidade + link.
  if (!dados.abaDetalhada) {
    return (
      <section aria-label={TEXTOS_TELA.blocos.naCarteira} className={CARD} data-na-carteira="aba">
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

  const objetivo = linha?.objetivo ?? 0;
  const cotacaoDiverge =
    !!linha &&
    precoCabecalho !== null &&
    linha.cotacaoAtual > 0 &&
    Math.abs(linha.cotacaoAtual - precoCabecalho) >= 0.005;

  return (
    <section aria-label={TEXTOS_TELA.blocos.naCarteira} className={CARD} data-na-carteira="posicao">
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
        <Dado
          rotulo={TEXTOS_TELA.naCarteira.objetivoAtivo.replace(/^./, (c) => c.toUpperCase())}
          valor={
            linha
              ? objetivo > 0
                ? formatarTexto(t.objetivoNaAba, {
                    objetivo: formatNumber(objetivo, objetivo % 1 === 0 ? 0 : 2),
                    aba: abaNome,
                  })
                : t.semObjetivo
              : '—'
          }
          carregando={carregando}
        />
      </dl>
      {linha ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <BarraPesoAlvo
            rotulo={formatarTexto(t.pesoNaAba, { aba: abaNome })}
            valor={linha.percentualCarteira}
            referencia={objetivo > 0 ? objetivo : null}
            rotuloReferencia={
              objetivo > 0
                ? formatarTexto(t.rotuloBarraObjetivo, {
                    valor: formatNumber(objetivo, objetivo % 1 === 0 ? 0 : 2),
                  })
                : t.semObjetivo
            }
            status={objetivo > 0 ? statusObjetivo(linha.percentualCarteira, objetivo) : undefined}
          />
          <BarraClasse dados={dados} />
        </div>
      ) : null}
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
          {TEXTOS_TELA.acoes.verNaCarteira}
        </Link>
        <Link href="/carteira" className={LINK}>
          {TEXTOS_TELA.acoes.ajustarAlvo}
        </Link>
      </div>
    </section>
  );
}
