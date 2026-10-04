'use client';

/**
 * Detalhe do caso (bloco C, fatia C; protótipo K1/K3, M6): o que o usuário viu, regra automática
 * (com "a regra deixou de marcar"), relatos (autor, consultor/cliente, valor esperado, onde viu),
 * linha atual do Quadro, fontes oficiais, decisão e histórico.
 *
 * TODO texto livre do usuário (mensagem, valor esperado, onde viu, retrato) é renderizado como TEXTO
 * pelo React — nunca dangerouslySetInnerHTML, nunca link automático. Só as fontes oficiais (montadas
 * no servidor) viram link.
 */
import Link from 'next/link';
import { useCallback, useId, useState } from 'react';
import { ROTAS_CURADORIA } from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import { useCasoCuradoria, ErroAcessoNegado } from '@/hooks/useCuradoriaAnalise';
import type { CasoDetalheResposta } from '@/types/analiseAtivosCuradoria';
import DecisaoCaso from './DecisaoCaso';
import {
  AvisoSalvo,
  CLASSE_BOTAO_SECUNDARIO,
  CLASSE_LINK,
  IconeAlerta,
  IconeInfo,
  MarcaEfeito,
  MarcaOrigem,
  MarcaPrazo,
  MarcaStatus,
  T_CUR,
  TEXTOS_FILA,
  ehCasoRevisao,
  fmtDataCurta,
  fmtDataHora,
  rotuloCampo,
  rotuloGrupo,
} from './marcasCaso';

const T_DET = T_CUR.detalhe;
const T_FORM = TEXTOS_TELA.relatos.form;
const T_BLOCOS = TEXTOS_TELA.relatos.blocos as Record<string, string>;

export interface DetalheCasoProps {
  id: string;
  /** página própria (/admin/curadoria/[id], celular): mostra "Voltar para a fila" */
  paginaPropria?: boolean;
  onSalvo: (mensagem: string) => void;
}

function Secao({ titulo, children }: { titulo: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-gray-100 py-4 first:border-t-0 first:pt-0 dark:border-gray-800">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white/90">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Linhas({ itens }: { itens: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
      {itens.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-gray-600 max-sm:mt-1.5 dark:text-gray-300">{k}</dt>
          <dd className="break-words whitespace-pre-wrap text-gray-900 dark:text-gray-100">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function valorLinha(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  if (typeof v === 'boolean') return v ? TEXTOS_FILA.sim : TEXTOS_FILA.nao;
  return String(v);
}

function Aviso({ tom, children }: { tom: 'info' | 'alerta'; children: React.ReactNode }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
        tom === 'alerta'
          ? 'bg-gray-100 text-gray-900 dark:bg-white/[0.06] dark:text-gray-100'
          : 'bg-[#6E9DC4]/[0.14] text-[#314666] dark:bg-[#6E9DC4]/[0.12] dark:text-gray-100'
      }`}
    >
      <span className="mt-0.5 shrink-0">{tom === 'alerta' ? <IconeAlerta /> : <IconeInfo />}</span>
      <span>{children}</span>
    </div>
  );
}

export function ConteudoDetalhe({
  detalhe,
  onSalvo,
  onRecarregar,
}: {
  detalhe: CasoDetalheResposta;
  onSalvo: (m: string) => void;
  onRecarregar: () => void;
}) {
  const { caso } = detalhe;
  const ids = useId();
  const titulo = `${caso.symbol} · ${rotuloCampo(caso.campo)}${caso.periodo ? ` ${caso.periodo}` : ''}`;
  const grupo = rotuloGrupo(caso.grupo);
  const aberto = caso.status === 'aberto' || caso.status === 'em_analise';
  const regraParou = aberto && !!caso.regraCodigo && !caso.regraAtiva;
  const revisao = ehCasoRevisao(caso);

  return (
    <article aria-labelledby={`${ids}-h`} className="flex flex-col" data-caso={caso.id}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`${ids}-h`} className="text-lg font-semibold text-gray-900 dark:text-white/90">
            {titulo}
          </h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-600 dark:text-gray-300">
            {grupo && <span>{grupo}</span>}
            {grupo && <span aria-hidden="true">·</span>}
            <span>
              {formatarTexto(TEXTOS_FILA.abertoEm, { data: fmtDataCurta(caso.abertoEm) })}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {formatarTexto(TEXTOS_FILA.responsavel, {
                valor: caso.responsavel?.nome ?? T_CUR.ninguem,
              })}
            </span>
            <span aria-hidden="true">·</span>
            <Link
              href={`/analise-ativos/${encodeURIComponent(caso.symbol)}`}
              className={`inline-flex min-h-11 items-center ${CLASSE_LINK}`}
            >
              {TEXTOS_FILA.abrirPagina}
            </Link>
          </p>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <MarcaStatus status={caso.status} />
        <MarcaPrazo caso={caso} />
        <MarcaOrigem origem={caso.origem} />
        <MarcaEfeito caso={caso} />
        {caso.resolvidoEm && (
          <span className="text-[13px] text-gray-600 dark:text-gray-300">
            {formatarTexto(TEXTOS_FILA.fechadoEm, { data: fmtDataCurta(caso.resolvidoEm) })}
          </span>
        )}
      </div>

      {(regraParou || revisao) && (
        <div className="mb-3 flex flex-col gap-2">
          {regraParou && (
            <Aviso tom="alerta">
              <b className="font-semibold">{T_CUR.regraParou}.</b>{' '}
              {caso.nReportes > 0
                ? TEXTOS_FILA.regraParouComRelato
                : TEXTOS_FILA.regraParouSemValor}
            </Aviso>
          )}
          {revisao && <Aviso tom="info">{TEXTOS_FILA.revisaoAviso}</Aviso>}
        </div>
      )}

      {detalhe.oQueUsuarioViu && (
        <Secao titulo={T_DET.oQueViu}>
          <Linhas
            itens={[
              [
                T_FORM.bloco,
                T_BLOCOS[detalhe.oQueUsuarioViu.bloco] ?? detalhe.oQueUsuarioViu.bloco,
              ],
              [
                T_FORM.valor,
                `${rotuloCampo(detalhe.oQueUsuarioViu.campo)} · ${detalhe.oQueUsuarioViu.valorExibido ?? '—'}`,
              ],
              [T_FORM.periodo, detalhe.oQueUsuarioViu.periodo ?? '—'],
              [T_FORM.fonte, detalhe.oQueUsuarioViu.fonteExibida ?? '—'],
              [T_FORM.atualizacao, detalhe.oQueUsuarioViu.frescorExibido ?? '—'],
            ]}
          />
        </Secao>
      )}

      {detalhe.regra && (
        <Secao
          titulo={
            <>
              {T_DET.regra}
              <span className="text-xs font-normal text-gray-600 dark:text-gray-300">
                {detalhe.regra.ativa ? T_DET.regraAtiva : T_CUR.regraParou}
              </span>
            </>
          }
        >
          <Linhas
            itens={[
              [TEXTOS_FILA.regraCodigo, detalhe.regra.codigo],
              [TEXTOS_FILA.chave, detalhe.regra.chave ?? '—'],
              [TEXTOS_FILA.desde, fmtDataCurta(detalhe.regra.desde)],
            ]}
          />
        </Secao>
      )}

      <Secao titulo={`${T_DET.relatos} (${detalhe.reportes.length})`}>
        {detalhe.reportes.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">{TEXTOS_FILA.semRelatos}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detalhe.reportes.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
                data-relato={r.protocolo}
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-gray-600 dark:text-gray-300">
                  <b className="font-semibold text-gray-900 dark:text-white/90">{r.autor.nome}</b>
                  <span className="break-all">{r.autor.email}</span>
                  <span aria-hidden="true">·</span>
                  <span>{fmtDataHora(r.criadoEm)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{r.protocolo}</span>
                  <span aria-hidden="true">·</span>
                  <span>{rotuloCampo(r.campo)}</span>
                  {r.cliente && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-white/10">
                      {formatarTexto(T_DET.agindoPeloCliente, { valor: r.cliente.nome })}
                    </span>
                  )}
                </span>
                <p
                  className="break-words whitespace-pre-wrap text-gray-900 dark:text-gray-100"
                  data-mensagem
                >
                  {r.anonimizado ? T_DET.anonimizado : r.mensagem}
                </p>
                <span className="break-words whitespace-pre-wrap text-[12.5px] text-gray-600 dark:text-gray-300">
                  {T_DET.valorEsperado}: {r.valorEsperado ?? '—'} · {T_DET.ondeViu}:{' '}
                  {r.fonteEsperada ?? '—'}
                </span>
                <details className="text-[12.5px] text-gray-600 dark:text-gray-300">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center">
                    {T_DET.retratoServidor}
                  </summary>
                  <pre className="max-h-64 overflow-auto rounded bg-gray-50 p-2 text-xs whitespace-pre-wrap break-words dark:bg-white/[0.04]">
                    {JSON.stringify(r.contextoServidor, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {detalhe.linhaAtual && (
        <Secao titulo={T_DET.linhaAtual}>
          <details>
            <summary
              className={`inline-flex min-h-11 cursor-pointer items-center text-sm ${CLASSE_LINK}`}
            >
              {caso.symbol}
            </summary>
            <Linhas
              itens={Object.entries(detalhe.linhaAtual).map(([k, v]) => [k, valorLinha(v)])}
            />
          </details>
        </Secao>
      )}

      <Secao titulo={T_DET.fontes}>
        <ul className="flex flex-wrap gap-x-4">
          {detalhe.fontes.map((f) => (
            <li key={f.url}>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex min-h-11 items-center text-sm ${CLASSE_LINK}`}
              >
                {f.rotulo}
              </a>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao titulo={null}>
        <DecisaoCaso
          key={caso.id}
          detalhe={detalhe}
          onSalvo={onSalvo}
          onRecarregar={onRecarregar}
        />
      </Secao>

      <Secao titulo={T_DET.historico}>
        <ol className="flex flex-col gap-2 text-[13px]">
          {detalhe.eventos.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 max-sm:grid-cols-1 max-sm:gap-0"
            >
              <time dateTime={e.criadoEm} className="text-gray-600 tabular-nums dark:text-gray-300">
                {fmtDataHora(e.criadoEm)}
              </time>
              <span className="break-words text-gray-900 dark:text-gray-100">
                {T_DET.eventos[e.tipo] ?? e.tipo}
                {e.autor ? ` · ${e.autor.nome}` : ''}
                {e.de && e.para ? ` · ${e.de} → ${e.para}` : ''}
                {e.texto && e.tipo !== 'nota' ? ` · ${e.texto}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </Secao>
    </article>
  );
}

export default function DetalheCaso({ id, paginaPropria = false, onSalvo }: DetalheCasoProps) {
  const q = useCasoCuradoria(id);
  const voltar = paginaPropria ? (
    <Link
      href={ROTAS_CURADORIA.fila}
      className={`mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium ${CLASSE_LINK}`}
    >
      ← {T_DET.voltar}
    </Link>
  ) : null;

  const cartao =
    'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';

  if (q.isLoading) {
    return (
      <div className={cartao} aria-busy="true">
        {voltar}
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-gray-100 dark:bg-white/[0.06]" />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {T_CUR.carregando}
        </p>
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className={cartao} role="alert">
        {voltar}
        <p className="text-sm text-gray-900 dark:text-gray-100">
          {q.error instanceof ErroAcessoNegado
            ? TEXTOS_FILA.acessoRestrito
            : q.error
              ? q.error.message
              : TEXTOS_FILA.casoNaoEncontrado}
        </p>
        <button
          type="button"
          className={`${CLASSE_BOTAO_SECUNDARIO} mt-3`}
          onClick={() => q.refetch()}
        >
          {T_CUR.tentarDeNovo}
        </button>
      </div>
    );
  }
  return (
    <div className={cartao}>
      {voltar}
      <ConteudoDetalhe detalhe={q.data} onSalvo={onSalvo} onRecarregar={() => void q.refetch()} />
    </div>
  );
}

/** /admin/curadoria/[id] (celular e link direto): o caso em página própria + aviso de salvo. */
export function PaginaCaso({ id }: { id: string }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const fechar = useCallback(() => setAviso(null), []);
  return (
    <>
      <DetalheCaso id={id} paginaPropria onSalvo={setAviso} />
      <AvisoSalvo mensagem={aviso} onFechar={fechar} />
    </>
  );
}
