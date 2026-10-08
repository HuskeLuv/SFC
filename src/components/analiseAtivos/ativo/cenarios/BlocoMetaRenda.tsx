'use client';

/**
 * Meta de renda (FII; Bloco D, fatia B; decisão 8): quantas cotas, ao rendimento dos últimos 12
 * meses, pagam a renda mensal desejada — cotas · custo à cotação de hoje · faltam (posição da
 * Carteira, ou a do cliente com o consultor).
 *
 * "Criar objetivo no Planejamento" SÓ quando faltam cotas: com faltam = 0, um texto explica que a
 * posição já cobre a meta (nunca um botão desabilitado sem motivo, e nunca um objetivo de valor 0).
 */
import { useState } from 'react';
import ConfirmarObjetivoPlanejamento from '@/components/analiseAtivos/ativo/cenarios/ConfirmarObjetivoPlanejamento';
import { FOCO_CENARIOS } from '@/components/analiseAtivos/ativo/cenarios/FormPremissas';
import { formatarNumeroBR } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import type { MetaRendaCenario } from '@/services/analiseAtivos/regras/valuation/montarCenarios';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';

const T = TEXTOS_CENARIOS.metaRenda;

interface Props {
  ticker: string;
  meta: MetaRendaCenario | null;
  /** renda digitada (para o título quando a meta não tem resultado) */
  temPosicao: boolean;
  consultor: boolean;
  onCriado: (mensagem: string) => void;
}

const KPI =
  'flex min-w-0 flex-col gap-0.5 rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3 dark:border-gray-800 dark:bg-white/[0.03]';

export default function BlocoMetaRenda({ ticker, meta, temPosicao, consultor, onCriado }: Props) {
  const [aberto, setAberto] = useState(false);
  if (!meta) {
    return (
      <section
        className="flex flex-col gap-1 rounded-xl border border-dashed border-gray-400 bg-gray-50 px-3.5 py-3 text-[13.5px] text-gray-700 dark:border-gray-600 dark:bg-white/[0.03] dark:text-gray-200"
        data-meta-renda="sem"
      >
        <b className="text-gray-800 dark:text-white/90">{T.titulo}</b>
        <span>{T.semRendimento}</span>
      </section>
    );
  }
  const cot = formatarNumeroBR(meta.cotacao, 2);
  const sub = temPosicao
    ? `${formatarTexto(consultor ? T.clienteTem : T.voceTem, {
        n: formatarNumeroBR(meta.quantidade, 0),
      })}${meta.faltam > 0 ? ` · R$ ${formatarNumeroBR(meta.faltam * meta.cotacao, 2)}` : ''}`
    : consultor
      ? T.semFundoCliente
      : T.semFundo;
  return (
    <section
      aria-labelledby={`meta-${ticker}`}
      className="flex flex-col gap-2.5"
      data-meta-renda=""
    >
      <h3
        id={`meta-${ticker}`}
        className="text-[15px] font-semibold text-gray-800 dark:text-white/90"
      >
        {formatarTexto(T.tituloComRenda, { valor: formatarNumeroBR(meta.rendaMensal, 2) })}
      </h3>
      <p className="text-[13px] text-gray-600 dark:text-gray-300">{T.explicacao}</p>
      <div className="grid grid-cols-1 gap-2.5 @min-[560px]:grid-cols-3">
        <div className={KPI}>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {T.cotasNecessarias}
          </span>
          <span className="text-lg font-semibold text-gray-800 tabular-nums dark:text-white/90">
            {formatarNumeroBR(meta.cotas, 0)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatarTexto(T.formulaCotas, { valor: formatarNumeroBR(meta.rend12m, 3) })}
          </span>
        </div>
        <div className={KPI}>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {T.custoHoje}
          </span>
          <span className="text-lg font-semibold text-gray-800 tabular-nums dark:text-white/90">
            R$ {formatarNumeroBR(meta.custo, 2)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatarTexto(T.formulaCusto, { cotas: formatarNumeroBR(meta.cotas, 0), valor: cot })}
          </span>
        </div>
        <div className={KPI}>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{T.faltam}</span>
          <span
            className="text-lg font-semibold text-gray-800 tabular-nums dark:text-white/90"
            data-meta-faltam={meta.faltam}
          >
            {formatarTexto(T.cotas, { cotas: formatarNumeroBR(meta.faltam, 0) })}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{sub}</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{T.aviso}</p>
      {meta.faltam === 0 ? (
        <p
          className="flex items-start gap-1.5 text-[13px] text-gray-700 dark:text-gray-200"
          data-meta-coberta=""
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-[#396CAA] dark:text-[#6E9DC4]"
          >
            <path
              d="M5 12.5l4.2 4.2L19 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {consultor ? T.cobertaCliente : T.coberta}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          data-criar-objetivo=""
          className={`inline-flex min-h-12 items-center justify-center gap-2 self-stretch rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-[#396CAA] hover:bg-gray-50 sm:self-start lg:min-h-11 dark:border-gray-700 dark:bg-transparent dark:text-[#6E9DC4] dark:hover:bg-white/[0.04] ${FOCO_CENARIOS}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          {consultor ? T.botaoCliente : T.botao}
        </button>
      )}
      {meta.faltam > 0 ? (
        <ConfirmarObjetivoPlanejamento
          aberto={aberto}
          onFechar={() => setAberto(false)}
          ticker={ticker}
          meta={meta}
          consultor={consultor}
          onCriado={(m) => {
            setAberto(false);
            onCriado(m);
          }}
        />
      ) : null}
    </section>
  );
}
