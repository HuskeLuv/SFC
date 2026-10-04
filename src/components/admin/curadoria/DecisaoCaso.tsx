'use client';

/**
 * Decisão do curador (bloco C, fatia C; protótipo K1–K7): assumir/soltar, status (rádios de 44px),
 * resolução obrigatória ao fechar (erro anunciado + foco), efeito na tela ('Liberar o valor' só com
 * "Dado confirmado": vale no próximo cálculo diário), resposta ao usuário (≤ 500, vai só ao fechar,
 * termo proibido bloqueia e é indicado), anotação interna (≤ 2.000) e "Salvar e avisar N usuários".
 * 409: mostra quem alterou e quando, MANTÉM o texto digitado e oferece recarregar o caso.
 * Sem conferência manual (decisão 16).
 */
import { useId, useRef, useState } from 'react';
import {
  LIMITES,
  RESOLUCOES,
  TRANSICOES,
  casoFechado,
  efeitoTelaValido,
  type EfeitoTela,
  type ResolucaoCaso,
  type StatusCaso,
} from '@/services/analiseAtivos/curadoria/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import { ErroConflitoCaso, ErroValidacaoCaso, useAcaoCaso } from '@/hooks/useCuradoriaAnalise';
import type { CasoConflito409, CasoDetalheResposta } from '@/types/analiseAtivosCuradoria';
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_BOTAO_SECUNDARIO,
  IconeAlerta,
  IconeInfo,
  T_CUR,
  TEXTOS_FILA,
  fmtDataHora,
} from './marcasCaso';

const T_DEC = T_CUR.decisao;
const STATUS_ORDEM: StatusCaso[] = ['aberto', 'em_analise', 'corrigido', 'rejeitado'];
const EFEITOS: EfeitoTela[] = ['manter_conferencia', 'liberar_valor', 'sem_efeito'];

export interface DecisaoCasoProps {
  detalhe: CasoDetalheResposta;
  onSalvo: (mensagem: string) => void;
  onRecarregar: () => void;
}

const CAMPO_TEXTO =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-100 max-lg:text-base';

function ErroCampo({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-[13px] text-[#D92D20] dark:text-[#F97066]"
    >
      <IconeAlerta />
      <span>{children}</span>
    </span>
  );
}

export default function DecisaoCaso({ detalhe, onSalvo, onRecarregar }: DecisaoCasoProps) {
  const { caso } = detalhe;
  const statusAtual = caso.status;
  const fechadoAgora = casoFechado(statusAtual);
  const nAutores = new Set(detalhe.reportes.map((r) => r.autor.id)).size;
  const acao = useAcaoCaso(caso.id);
  const ids = useId();
  const resolRef = useRef<HTMLSelectElement>(null);
  const respRef = useRef<HTMLTextAreaElement>(null);

  const [status, setStatus] = useState<StatusCaso>(statusAtual);
  const [resolucao, setResolucao] = useState<ResolucaoCaso | ''>('');
  const [efeito, setEfeito] = useState<EfeitoTela>(
    caso.efeitoTela ?? (caso.emConferencia ? 'manter_conferencia' : 'sem_efeito'),
  );
  const [resposta, setResposta] = useState(caso.respostaPublica ?? '');
  const [nota, setNota] = useState(caso.notaCurador ?? '');
  const [erroResolucao, setErroResolucao] = useState(false);
  const [termo, setTermo] = useState<string | null>(null);
  const [conflito, setConflito] = useState<CasoConflito409 | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const fechar = casoFechado(status);
  const opcoesStatus = STATUS_ORDEM.filter(
    (s) => s === statusAtual || TRANSICOES[statusAtual].includes(s),
  );

  function tratarErro(e: unknown) {
    if (e instanceof ErroConflitoCaso) {
      setConflito(e.corpo);
      return;
    }
    if (e instanceof ErroValidacaoCaso) {
      if (e.details.termos?.length) {
        setTermo(e.details.termos[0]);
        respRef.current?.focus();
        return;
      }
      if (e.details.resolucao) {
        setErroResolucao(true);
        resolRef.current?.focus();
        return;
      }
    }
    setErro(e instanceof Error ? e.message : String(e));
  }

  function limparErros() {
    setConflito(null);
    setErro(null);
    setTermo(null);
  }

  function assumirOuSoltar(qual: 'assumir' | 'soltar') {
    limparErros();
    acao.mutate(
      { acao: qual, atualizadoEmEsperado: caso.atualizadoEm },
      {
        onSuccess: () => {
          setStatus(qual === 'assumir' ? 'em_analise' : 'aberto');
          onSalvo(T_DEC.salvo);
        },
        onError: tratarErro,
      },
    );
  }

  function salvar() {
    limparErros();
    if (fechar && !resolucao) {
      setErroResolucao(true);
      resolRef.current?.focus();
      return;
    }
    setErroResolucao(false);
    const efeitoEnviado: EfeitoTela = fechar
      ? efeito
      : (caso.efeitoTela ?? (caso.emConferencia ? 'manter_conferencia' : 'sem_efeito'));
    acao.mutate(
      {
        acao: 'decidir',
        status,
        ...(fechar && resolucao ? { resolucao } : {}),
        efeitoTela: efeitoEnviado,
        ...(nAutores > 0 ? { respostaPublica: resposta } : {}),
        notaCurador: nota,
        atualizadoEmEsperado: caso.atualizadoEm,
      },
      {
        onSuccess: (r) => {
          if (!fechar) return onSalvo(T_DEC.salvo);
          onSalvo(
            r.notificados === 0
              ? TEXTOS_FILA.fechadoSemAviso
              : r.notificados === 1
                ? TEXTOS_FILA.fechadoUmAvisado
                : formatarTexto(TEXTOS_FILA.fechadoAvisados, { n: r.notificados }),
          );
        },
        onError: tratarErro,
      },
    );
  }

  if (fechadoAgora) {
    return (
      <section aria-labelledby={`${ids}-h`} className="flex flex-col gap-2">
        <h3 id={`${ids}-h`} className="text-sm font-semibold text-gray-900 dark:text-white/90">
          {T_DEC.titulo}
        </h3>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-600 dark:text-gray-300">{T_DEC.resolucao}</dt>
          <dd className="text-gray-900 dark:text-gray-100">
            {caso.resolucao ? T_DEC.resolucoes[caso.resolucao] : '—'}
          </dd>
          <dt className="text-gray-600 dark:text-gray-300">{T_DEC.efeito}</dt>
          <dd className="text-gray-900 dark:text-gray-100">
            {caso.efeitoTela ? T_DEC.efeitos[caso.efeitoTela] : '—'}
          </dd>
          {caso.respostaPublica && (
            <>
              <dt className="text-gray-600 dark:text-gray-300">{T_DEC.resposta}</dt>
              <dd className="whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">
                {caso.respostaPublica}
              </dd>
            </>
          )}
          {caso.notaCurador && (
            <>
              <dt className="text-gray-600 dark:text-gray-300">{T_DEC.anotacao}</dt>
              <dd className="whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">
                {caso.notaCurador}
              </dd>
            </>
          )}
        </dl>
        <p className="flex items-start gap-1.5 text-[13px] text-gray-600 dark:text-gray-300">
          <IconeInfo />
          {TEXTOS_FILA.casoFinal}
        </p>
      </section>
    );
  }

  const textoBotao = fechar
    ? nAutores === 0
      ? TEXTOS_FILA.fecharCaso
      : nAutores === 1
        ? T_DEC.salvarEAvisarUm
        : formatarTexto(T_DEC.salvarEAvisar, { n: nAutores })
    : T_DEC.salvar;

  const radio =
    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm text-gray-800 has-[:checked]:border-[#396CAA] has-[:checked]:bg-[#396CAA]/[0.08] has-[:checked]:shadow-[inset_0_0_0_1px_#396CAA] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 border-gray-300 dark:border-gray-700 dark:text-gray-100 dark:has-[:checked]:border-[#6E9DC4] dark:has-[:checked]:shadow-[inset_0_0_0_1px_#6E9DC4] max-lg:min-h-12';

  return (
    <section aria-labelledby={`${ids}-h`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${ids}-h`} className="text-sm font-semibold text-gray-900 dark:text-white/90">
          {T_DEC.titulo}
        </h3>
        {statusAtual === 'aberto' && (
          <button
            type="button"
            className={CLASSE_BOTAO_SECUNDARIO}
            onClick={() => assumirOuSoltar('assumir')}
            disabled={acao.isPending}
          >
            {T_DEC.assumir}
          </button>
        )}
        {statusAtual === 'em_analise' && (
          <button
            type="button"
            className={CLASSE_BOTAO_SECUNDARIO}
            onClick={() => assumirOuSoltar('soltar')}
            disabled={acao.isPending}
          >
            {T_DEC.soltar}
          </button>
        )}
      </div>

      {conflito && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-[#D92D20]/40 bg-[#D92D20]/[0.06] p-3 text-sm text-gray-900 dark:border-[#F97066]/40 dark:bg-[#F97066]/[0.08] dark:text-gray-100"
        >
          <span className="flex items-start gap-1.5">
            <span className="text-[#D92D20] dark:text-[#F97066]">
              <IconeAlerta />
            </span>
            {formatarTexto(T_DEC.conflito, {
              valor: conflito.atualizadoPor?.nome ?? T_CUR.ninguem,
              data: fmtDataHora(conflito.atualizadoEm),
            })}
          </span>
          <button
            type="button"
            className={`${CLASSE_BOTAO_SECUNDARIO} self-start`}
            onClick={() => {
              setConflito(null);
              onRecarregar();
            }}
          >
            {T_DEC.recarregar}
          </button>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          {T_DEC.status}
        </legend>
        <div className="flex flex-wrap gap-2">
          {opcoesStatus.map((s) => (
            <label key={s} className={radio}>
              <input
                type="radio"
                name={`${ids}-status`}
                value={s}
                checked={status === s}
                onChange={() => {
                  setStatus(s);
                  setResolucao('');
                  setErroResolucao(false);
                }}
                className="h-4 w-4 accent-[#396CAA]"
              />
              {T_CUR.status[s]}
            </label>
          ))}
        </div>
      </fieldset>

      {fechar && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${ids}-resol`}
            className="text-xs font-medium text-gray-600 dark:text-gray-300"
          >
            {T_DEC.resolucao}
          </label>
          <select
            id={`${ids}-resol`}
            ref={resolRef}
            value={resolucao}
            aria-invalid={erroResolucao}
            aria-describedby={erroResolucao ? `${ids}-resol-e` : undefined}
            onChange={(e) => {
              const r = e.target.value as ResolucaoCaso | '';
              setResolucao(r);
              setErroResolucao(false);
              if (
                efeito === 'liberar_valor' &&
                !efeitoTelaValido(status, r || null, 'liberar_valor')
              ) {
                setEfeito(caso.emConferencia ? 'manter_conferencia' : 'sem_efeito');
              }
            }}
            className={`min-h-11 rounded-lg border bg-white px-3 text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-100 max-lg:min-h-12 max-lg:text-base ${
              erroResolucao
                ? 'border-[#D92D20] dark:border-[#F97066]'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <option value="">{T_DEC.resolucao}…</option>
            {(RESOLUCOES[status as 'corrigido' | 'rejeitado'] as readonly ResolucaoCaso[]).map(
              (r) => (
                <option key={r} value={r}>
                  {T_DEC.resolucoes[r]}
                </option>
              ),
            )}
          </select>
          {erroResolucao && (
            <ErroCampo id={`${ids}-resol-e`}>{T_DEC.resolucaoObrigatoria}</ErroCampo>
          )}
        </div>
      )}

      {fechar && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">
            {T_DEC.efeito}
          </legend>
          <div className="flex flex-wrap gap-2">
            {EFEITOS.map((ef) => {
              const permitido = efeitoTelaValido(status, resolucao || null, ef);
              return (
                <label key={ef} className={radio}>
                  <input
                    type="radio"
                    name={`${ids}-efeito`}
                    value={ef}
                    checked={efeito === ef}
                    disabled={!permitido}
                    onChange={() => setEfeito(ef)}
                    className="h-4 w-4 accent-[#396CAA]"
                  />
                  {T_DEC.efeitos[ef]}
                </label>
              );
            })}
          </div>
          <p className="flex items-start gap-1.5 text-[13px] text-gray-600 dark:text-gray-300">
            <IconeInfo />
            {efeito === 'liberar_valor' ? T_DEC.liberarAviso : TEXTOS_FILA.liberarSoConfirmado}
          </p>
        </fieldset>
      )}

      {nAutores > 0 && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${ids}-resp`}
            className="text-xs font-medium text-gray-600 dark:text-gray-300"
          >
            {T_DEC.resposta}{' '}
            {!fechar && <span className="font-normal">{TEXTOS_FILA.soAoFechar}</span>}
          </label>
          <textarea
            id={`${ids}-resp`}
            ref={respRef}
            rows={3}
            maxLength={LIMITES.respostaPublica}
            value={resposta}
            aria-invalid={!!termo}
            aria-describedby={`${ids}-resp-h${termo ? ` ${ids}-resp-e` : ''}`}
            onChange={(e) => {
              setResposta(e.target.value);
              setTermo(null);
            }}
            className={`${CAMPO_TEXTO} ${termo ? 'border-[#D92D20] dark:border-[#F97066]' : 'border-gray-300 dark:border-gray-700'}`}
          />
          {termo && (
            <ErroCampo id={`${ids}-resp-e`}>
              {formatarTexto(T_DEC.termoBloqueado, { valor: termo })}
            </ErroCampo>
          )}
          <span
            id={`${ids}-resp-h`}
            className="flex justify-between gap-2 text-xs text-gray-600 dark:text-gray-300"
          >
            <span>{formatarTexto(T_DEC.respostaAjuda, { max: LIMITES.respostaPublica })}</span>
            <span className="tabular-nums">
              {resposta.length}/{LIMITES.respostaPublica}
            </span>
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${ids}-nota`}
          className="text-xs font-medium text-gray-600 dark:text-gray-300"
        >
          {T_DEC.anotacao}
        </label>
        <textarea
          id={`${ids}-nota`}
          rows={2}
          maxLength={LIMITES.notaCurador}
          value={nota}
          aria-describedby={`${ids}-nota-h`}
          onChange={(e) => setNota(e.target.value)}
          className={`${CAMPO_TEXTO} border-gray-300 dark:border-gray-700`}
        />
        <span id={`${ids}-nota-h`} className="text-xs text-gray-600 dark:text-gray-300">
          {formatarTexto(T_DEC.anotacaoAjuda, { max: LIMITES.notaCurador })}
        </span>
      </div>

      {erro && <ErroCampo id={`${ids}-erro`}>{erro}</ErroCampo>}

      <div className="flex flex-wrap justify-end gap-2 max-lg:flex-col-reverse max-lg:items-stretch">
        <button
          type="button"
          className={CLASSE_BOTAO_PRIMARIO}
          onClick={salvar}
          disabled={acao.isPending}
          data-acao="salvar-decisao"
        >
          {textoBotao}
        </button>
      </div>
    </section>
  );
}
