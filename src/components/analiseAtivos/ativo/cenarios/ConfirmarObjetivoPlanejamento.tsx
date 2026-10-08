'use client';

/**
 * Criar objetivo no Planejamento a partir da Meta de renda (Bloco D, fatia B; decisão 8).
 * Modal no computador; BottomSheet com useMobileHistoryLayer no celular ("voltar" fecha).
 *
 * POST /api/planejamento-sonhos (existente, csrfFetch via useCreateObjetivo, que invalida o
 * Planejamento e o Fluxo de Caixa): nome editável ('Renda de R$ 1.000/mês com MXRF11'),
 * valor = cotas × cotação (sempre > 0), já disponível = min(posição, cotas) × cotação, prazo em
 * meses (padrão 60), prioridade e situação com os enums do schema. O aviso diz que o objetivo
 * também vira uma linha no Fluxo de Caixa — com o consultor agindo, no Planejamento e no Fluxo de
 * Caixa DO CLIENTE (a rota grava no targetUserId).
 */
import { useId, useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import {
  useCreateObjetivo,
  type PlanejamentoPriority,
  type PlanejamentoStatus,
} from '@/hooks/usePlanejamentoSonhos';
import { categoryFromMonths } from '@/services/planejamento/planejamentoSonhos';
import { FOCO_CENARIOS } from '@/components/analiseAtivos/ativo/cenarios/FormPremissas';
import { formatarNumeroBR } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import type { MetaRendaCenario } from '@/services/analiseAtivos/regras/valuation/montarCenarios';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';

const T = TEXTOS_CENARIOS.objetivo;
export const PRAZO_PADRAO_MESES = 60;
const PRIORIDADES: PlanejamentoPriority[] = ['Alta', 'Moderado', 'Baixa'];
const SITUACOES: PlanejamentoStatus[] = [
  'Em espera',
  'Iniciado',
  'Pausado',
  'Atrasado',
  'Concluído',
];

export const BOTAO_PRI = `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#314666] px-4 text-sm font-semibold text-white hover:bg-[#283a55] disabled:opacity-60 lg:min-h-11 dark:bg-[#396CAA] dark:hover:bg-[#335f96] ${FOCO_CENARIOS}`;
export const BOTAO_SEC = `inline-flex min-h-12 items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 lg:min-h-11 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.04] ${FOCO_CENARIOS}`;
const CAMPO = `w-full min-h-12 rounded-[10px] border border-gray-300 bg-white px-3 text-base text-gray-800 lg:min-h-11 lg:text-[15px] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${FOCO_CENARIOS}`;

/** Corpo do POST (puro, testável). */
export function corpoObjetivo(
  meta: MetaRendaCenario,
  nome: string,
  meses: number,
  priority: PlanejamentoPriority,
  status: PlanejamentoStatus,
) {
  return {
    name: nome.trim(),
    target: meta.target,
    months: meses,
    startDate: null,
    available: meta.available,
    rate: 0,
    priority,
    category: categoryFromMonths(meses),
    status,
    notes: null,
  };
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  ticker: string;
  meta: MetaRendaCenario;
  consultor: boolean;
  onCriado: (mensagem: string) => void;
}

export default function ConfirmarObjetivoPlanejamento({
  aberto,
  onFechar,
  ticker,
  meta,
  consultor,
  onCriado,
}: Props) {
  const celular = useIsBelowLg();
  useMobileHistoryLayer(aberto, onFechar, celular);
  const ids = useId();
  const criar = useCreateObjetivo();
  const nomePadrao = formatarTexto(T.nomePadrao, {
    renda: formatarNumeroBR(meta.rendaMensal, 0),
    ticker,
  });
  const [nome, setNome] = useState(nomePadrao);
  const [prazo, setPrazo] = useState(String(PRAZO_PADRAO_MESES));
  const [prioridade, setPrioridade] = useState<PlanejamentoPriority>('Moderado');
  const [situacao, setSituacao] = useState<PlanejamentoStatus>('Em espera');
  const [tentou, setTentou] = useState(false);

  const meses = /^\d{1,3}$/.test(prazo.trim()) ? Number(prazo.trim()) : NaN;
  const prazoOk = Number.isInteger(meses) && meses >= 1 && meses <= 480;
  const nomeOk = nome.trim().length > 0 && nome.trim().length <= 255;
  const cot = formatarNumeroBR(meta.cotacao, 2);
  const titulo = consultor ? T.tituloCliente : T.titulo;

  const enviar = (e?: FormEvent) => {
    e?.preventDefault();
    setTentou(true);
    if (!prazoOk || !nomeOk || criar.isPending) return;
    criar.mutate(corpoObjetivo(meta, nome, meses, prioridade, situacao), {
      onSuccess: () => onCriado(consultor ? T.toastCliente : T.toast),
    });
  };

  const corpo = (
    <form
      id={`${ids}-form`}
      noValidate
      onSubmit={enviar}
      className="flex flex-col gap-3.5"
      data-objetivo-form=""
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${ids}-nome`}
          className="text-sm font-medium text-gray-800 dark:text-white/90"
        >
          {T.campos.nome}
        </label>
        <input
          id={`${ids}-nome`}
          value={nome}
          maxLength={255}
          onChange={(e) => setNome(e.target.value)}
          aria-invalid={tentou && !nomeOk ? true : undefined}
          className={CAMPO}
        />
        {tentou && !nomeOk ? (
          <span className="text-[12.5px] text-[#D92D20] dark:text-[#F97066]">{T.nomeErro}</span>
        ) : null}
      </div>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13.5px]">
        <dt className="text-gray-500 dark:text-gray-400">{T.campos.valor}</dt>
        <dd
          className="m-0 font-medium text-gray-800 tabular-nums dark:text-white/90"
          data-objetivo-valor=""
        >
          {formatarTexto(T.valorValor, {
            valor: `R$ ${formatarNumeroBR(meta.target, 2)}`,
            cotas: formatarNumeroBR(meta.cotas, 0),
            n: cot,
          })}
        </dd>
        <dt className="text-gray-500 dark:text-gray-400">{T.campos.disponivel}</dt>
        <dd
          className="m-0 font-medium text-gray-800 tabular-nums dark:text-white/90"
          data-objetivo-disponivel=""
        >
          {formatarTexto(T.disponivelValor, {
            valor: `R$ ${formatarNumeroBR(meta.available, 2)}`,
            cotas: formatarNumeroBR(Math.min(meta.quantidade, meta.cotas), 0),
            n: cot,
          })}
        </dd>
      </dl>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${ids}-prazo`}
            className="text-sm font-medium text-gray-800 dark:text-white/90"
          >
            {T.campos.prazo}
          </label>
          <input
            id={`${ids}-prazo`}
            inputMode="numeric"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            aria-invalid={tentou && !prazoOk ? true : undefined}
            className={CAMPO}
          />
          {tentou && !prazoOk ? (
            <span className="text-[12.5px] text-[#D92D20] dark:text-[#F97066]">{T.prazoErro}</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${ids}-prio`}
            className="text-sm font-medium text-gray-800 dark:text-white/90"
          >
            {T.campos.prioridade}
          </label>
          <select
            id={`${ids}-prio`}
            value={prioridade}
            onChange={(e) => setPrioridade(e.target.value as PlanejamentoPriority)}
            className={CAMPO}
          >
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {T.prioridades[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${ids}-sit`}
            className="text-sm font-medium text-gray-800 dark:text-white/90"
          >
            {T.campos.status}
          </label>
          <select
            id={`${ids}-sit`}
            value={situacao}
            onChange={(e) => setSituacao(e.target.value as PlanejamentoStatus)}
            className={CAMPO}
          >
            {SITUACOES.map((s) => (
              <option key={s} value={s}>
                {T.situacoes[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        className="flex items-start gap-2 rounded-[10px] bg-[#396CAA]/10 px-3 py-2.5 text-[13.5px] text-gray-700 dark:bg-[#6E9DC4]/15 dark:text-gray-200"
        data-objetivo-aviso-fluxo=""
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#396CAA] dark:text-[#6E9DC4]"
        >
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 11v5.5M12 7.6v.4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span>
          {consultor ? T.avisoFluxoCliente : T.avisoFluxo} {T.avisoCotacao}
        </span>
      </div>
      {criar.isError ? (
        <p role="alert" className="text-[13px] text-[#D92D20] dark:text-[#F97066]">
          {T.erro}
        </p>
      ) : null}
    </form>
  );

  const botoes = (
    <>
      <button type="button" onClick={onFechar} className={BOTAO_SEC}>
        {T.cancelar}
      </button>
      <button
        type="submit"
        form={`${ids}-form`}
        disabled={criar.isPending}
        aria-busy={criar.isPending || undefined}
        className={BOTAO_PRI}
        data-objetivo-confirmar=""
      >
        {criar.isPending ? T.criando : T.confirmar}
      </button>
    </>
  );

  if (celular) {
    return (
      <BottomSheet
        isOpen={aberto}
        onClose={onFechar}
        title={titulo}
        footer={<div className="flex gap-2 [&>*]:flex-1">{botoes}</div>}
      >
        <div className="pt-1 pb-4">{corpo}</div>
      </BottomSheet>
    );
  }

  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      showCloseButton={false}
      ariaLabelledby={`${ids}-titulo`}
      className="m-4 flex max-h-[calc(100dvh-48px)] w-full max-w-[560px] flex-col"
    >
      <div className="flex max-h-[calc(100dvh-48px)] flex-col">
        <div className="flex items-start justify-between gap-2.5 pt-[18px] pr-3 pb-1.5 pl-5">
          <h2
            id={`${ids}-titulo`}
            className="text-lg font-semibold text-gray-900 dark:text-white/90"
          >
            {titulo}
          </h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label={T.fechar}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 ${FOCO_CENARIOS}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1.5 pb-4">{corpo}</div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-5 pt-3 pb-[18px] dark:border-gray-800">
          {botoes}
        </div>
      </div>
    </Modal>
  );
}
