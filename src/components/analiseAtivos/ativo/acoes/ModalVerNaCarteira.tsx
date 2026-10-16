'use client';

/**
 * Modal "‹ticker› na sua Carteira" (fatia C1; v2.5 fatia C). Com posição: GET
 * /api/ativos/[portfolioId] (a mesma rota da tela /ativos/[id]) — posição, valor atual, preço médio,
 * resultado, proventos recebidos, alvo planejado (planning_asset_targets, % da carteira TOTAL) com
 * o desvio na mesma base e as últimas operações; "Registrar operação" e "Abrir Carteira completa".
 * Sem posição: "Você ainda não tem ‹ticker› na carteira" e, se houver, o alvo planejado. Objetivo da
 * aba na Carteira > 0 → linha informativa (decisão 1). Consultor agindo: vê a carteira do cliente, com o aviso. O tipo de cada operação sai
 * como a Carteira mostra (Aporte, Resgate, Reinvestimento…).
 */
import Link from 'next/link';
import ModalAnalise, {
  AvisoConsultor,
  BOTAO_MODAL_PRIMARIO,
  BOTAO_MODAL_SECUNDARIO,
  DICA_RODAPE,
  SUBTITULO_MODAL,
} from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { pct1, ppComSinal, reais0 } from '@/components/analiseAtivos/ativo/acoes/ModalPlanejar';
import { useNaCarteiraAtivo } from '@/components/analiseAtivos/ativo/usuario/useNaCarteiraAtivo';
import { usePosicaoCarteira } from '@/hooks/useAcoesCarteiraAnalise';
import { desvioAlvo } from '@/services/analiseAtivos/regras/carteira/desvioAlvo';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import {
  CLASSE_CARTEIRA,
  TEXTOS_ACOES_CARTEIRA,
} from '@/services/analiseAtivos/textosAcoesCarteira';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { formatBRL, formatNumber } from '@/utils/format';
import type { ModalVerNaCarteiraProps } from '@/types/analiseAtivosCriterios';

export type { ModalVerNaCarteiraProps };

const T = TEXTOS_ACOES_CARTEIRA.ver;
const N_OPERACOES = 5;

const inteiro = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
};
function Celula({
  rotulo,
  valor,
  nota,
  negativo,
}: {
  rotulo: string;
  valor: React.ReactNode;
  nota?: React.ReactNode;
  negativo?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[10px] border border-gray-200 px-3 py-2.5 dark:border-gray-800">
      <dt className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase dark:text-gray-400">
        {rotulo}
      </dt>
      <dd
        className={`text-[17px] font-semibold tabular-nums ${
          negativo ? 'text-[#D92D20] dark:text-[#F97066]' : 'text-gray-900 dark:text-white'
        }`}
      >
        {valor}
      </dd>
      {nota ? <dd className="text-xs text-gray-500 dark:text-gray-400">{nota}</dd> : null}
    </div>
  );
}

export default function ModalVerNaCarteira({
  aberto,
  onFechar,
  ticker,
  classe,
  onRegistrar,
}: ModalVerNaCarteiraProps & { onRegistrar?: () => void }) {
  const t = ticker.toUpperCase();
  const cl = CLASSE_CARTEIRA[classe];
  const dados = useNaCarteiraAtivo(t, classe, { base: aberto });
  const temPosicao = dados.status === 'posicao' && !!dados.portfolioId;
  const posicaoQ = usePosicaoCarteira(dados.portfolioId, aberto && temPosicao);
  const aba = dados.abaNome ?? dados.abaBaseNome ?? cl.aba;

  const alvo = dados.alvoPct;
  const conta =
    dados.valorBase !== null && dados.linha
      ? desvioAlvo({
          valorPosicao: dados.linha.valorAtualizado,
          valorBase: dados.valorBase,
          alvoPct: alvo,
          preco: null,
        })
      : null;

  let corpo: React.ReactNode;
  if (dados.status === 'carregando' || (temPosicao && posicaoQ.isPending)) {
    corpo = (
      <div aria-busy="true" className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <span className="sr-only">{TEXTOS_ACOES_CARTEIRA.modal.carregando}</span>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="h-[74px] animate-pulse rounded-[10px] bg-gray-100 motion-reduce:animate-none dark:bg-white/5"
          />
        ))}
      </div>
    );
  } else if (dados.status === 'erro' || (temPosicao && posicaoQ.isError)) {
    corpo = (
      <div role="alert" className="flex flex-wrap items-center gap-3 py-3 text-sm">
        <span className="text-gray-700 dark:text-gray-300">{T.erro}</span>
        <button
          type="button"
          className={BOTAO_MODAL_SECUNDARIO}
          onClick={() => {
            dados.refetch();
            void posicaoQ.refetch();
          }}
        >
          {TEXTOS_ACOES_CARTEIRA.modal.tentarDeNovo}
        </button>
      </div>
    );
  } else if (!temPosicao) {
    corpo = (
      <p className="py-3.5 text-sm text-gray-700 dark:text-gray-300" data-ver-vazio="">
        {formatarTexto(T.vazio, { ticker: t })}
        {alvo !== null ? <> {formatarTexto(T.vazioAlvo, { pct: pct1(alvo) })}</> : null}
      </p>
    );
  } else {
    const p = posicaoQ.data!.posicao;
    const ops = (posicaoQ.data!.transacoes ?? []).slice(0, N_OPERACOES);
    const custo = p.valorAplicado;
    corpo = (
      <>
        <dl className="my-1.5 grid grid-cols-2 gap-2.5 lg:grid-cols-3" data-ver-posicao="">
          <Celula
            rotulo={T.posicao}
            valor={`${inteiro(p.quantidade)} ${cl.un}`}
            nota={
              dados.pctCarteira !== null
                ? formatarTexto(T.pctCarteira, { pct: pct1(dados.pctCarteira) })
                : undefined
            }
          />
          <Celula
            rotulo={T.valorAtual}
            valor={reais0(p.saldoBruto)}
            nota={formatarTexto(T.aCotacao, { preco: formatBRL(p.cotacaoAtual) })}
          />
          <Celula
            rotulo={T.precoMedio}
            valor={formatBRL(p.precoMedio)}
            nota={formatarTexto(T.custo, { valor: reais0(custo) })}
          />
          <Celula
            rotulo={T.resultado}
            valor={`${p.rentabilidade < 0 ? '−' : '+'}${formatNumber(Math.abs(p.rentabilidade), 1)}%`}
            nota={`${p.resultado < 0 ? '−' : ''}${reais0(p.resultado)} · ${T.resultadoNota}`}
            negativo={p.rentabilidade < 0}
          />
          <Celula
            rotulo={T.proventos}
            valor={reais0(p.proventosRecebidos)}
            nota={T.proventosNota}
          />
          <Celula
            rotulo={T.alvo}
            valor={alvo !== null ? formatarTexto(T.alvoValor, { pct: pct1(alvo) }) : '—'}
            nota={
              alvo !== null && conta && conta.desvioPp !== null
                ? formatarTexto(T.alvoDesvio, {
                    pos: pct1(conta.posicaoPct),
                    pp: ppComSinal(conta.desvioPp),
                  })
                : T.semAlvo
            }
          />
        </dl>
        <div className="mt-3">
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase dark:text-gray-400">
            {T.ultimas}
          </h3>
          {ops.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{T.semOperacoes}</p>
          ) : (
            <div className={`${TABLE_STYLES.wrapper} relative`}>
              <table className={TABLE_STYLES.table}>
                <thead>
                  <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                    {[T.colData, T.colOperacao, T.colQtd, T.colPreco, T.colTotal].map((h) => (
                      <th key={h} scope="col" className={TABLE_STYLES.compact.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ops.map((o) => (
                    <tr key={o.id} className={TABLE_STYLES.row}>
                      <td className={TABLE_STYLES.compact.td}>{dataBr(o.date)}</td>
                      <td className={TABLE_STYLES.compact.td}>{o.tipoOperacao}</td>
                      <td className={`${TABLE_STYLES.compact.td} tabular-nums`}>
                        {inteiro(o.quantity)}
                      </td>
                      <td className={`${TABLE_STYLES.compact.td} tabular-nums`}>
                        {formatBRL(o.price)}
                      </td>
                      <td className={`${TABLE_STYLES.compact.td} tabular-nums`}>
                        {reais0(o.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  const rodape = (
    <>
      <span className={DICA_RODAPE}>{T.rodape}</span>
      <button type="button" className={BOTAO_MODAL_SECUNDARIO} onClick={onFechar}>
        {TEXTOS_ACOES_CARTEIRA.modal.fechar}
      </button>
      {onRegistrar ? (
        <button type="button" className={BOTAO_MODAL_SECUNDARIO} onClick={onRegistrar}>
          {TEXTOS_ACOES_CARTEIRA.barra.registrar}
        </button>
      ) : null}
      {temPosicao ? (
        <Link
          href={`/ativos/${encodeURIComponent(dados.portfolioId as string)}`}
          className={BOTAO_MODAL_PRIMARIO}
        >
          {T.abrirCompleta}
        </Link>
      ) : null}
    </>
  );

  return (
    <ModalAnalise
      aberto={aberto}
      onFechar={onFechar}
      titulo={formatarTexto(T.titulo, { ticker: t })}
      largura="larga"
      rodape={rodape}
    >
      <p className={SUBTITULO_MODAL}>{T.subtitulo}</p>
      <AvisoConsultor className="mb-2" />
      {corpo}
      {dados.objetivoAbaPct !== null && dados.status !== 'carregando' ? (
        <p className="mt-2 text-[12.5px] text-gray-500 dark:text-gray-400" data-objetivo-aba="">
          {formatarTexto(T.objetivoAba, {
            aba,
            pct: `${formatNumber(dados.objetivoAbaPct, 0)}%`,
          })}
        </p>
      ) : null}
    </ModalAnalise>
  );
}
