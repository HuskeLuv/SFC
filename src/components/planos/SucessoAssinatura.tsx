'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { PLANO_QUERY_KEY, buscarAssinaturaMe } from '@/hooks/usePlano';
import { EMAIL_SUPORTE } from '@/content/faq';
import {
  NOME_PLANO,
  PRECOS_PLANOS,
  formatarReais,
  ofertaVigente,
  type Intervalo,
  type PlanoPago,
} from '@/lib/planos';
import type { AssinaturaMe } from '@/types/assinatura';
import { BTN_PRIMARIO, BTN_SECUNDARIO, IconeCheck, formatarData } from './planosUi';

/** Polling do retorno: a cada 2 s por até 30 s. */
export const INTERVALO_POLLING_MS = 2_000;
export const LIMITE_POLLING_MS = 30_000;

/** A assinatura do Checkout já chegou pelo webhook (ou pelo sync do /me?session_id=)? */
export function assinaturaConfirmada(me: AssinaturaMe): boolean {
  return (
    me.habilitado &&
    me.origem === 'assinatura' &&
    !!me.planoAssinatura &&
    (me.status === 'active' || me.status === 'trialing')
  );
}

/** Valor pago hoje, pelo espelho dos preços (o recibo oficial é o do Stripe, por e-mail). */
function valorPago(plano: PlanoPago, intervalo: Intervalo | null, agora: Date): string {
  const p = PRECOS_PLANOS[plano];
  if (intervalo === 'mes') return formatarReais(p.mensalCentavos);
  return formatarReais(ofertaVigente(agora) ? p.anualOfertaCentavos : p.anualCentavos);
}

function valorRenovacao(plano: PlanoPago, intervalo: Intervalo | null): string {
  const p = PRECOS_PLANOS[plano];
  return formatarReais(intervalo === 'mes' ? p.mensalCentavos : p.anualCentavos);
}

type Fase = 'processando' | 'confirmada' | 'demorou';

const CARTAO =
  'mx-auto mt-6 flex w-full max-w-[560px] flex-col items-center gap-3.5 rounded-2xl border border-gray-200 bg-white px-6 py-8 text-center dark:border-gray-800 dark:bg-white/[0.03] max-[520px]:px-[18px] max-[520px]:py-6';

/**
 * /planos/sucesso?session_id= (protótipo docs/assinaturas, aba "Retorno"): polling de
 * /api/assinaturas/me?session_id= a cada 2 s por até 30 s. Processando → Confirmada (valor,
 * renovação, prazo para desistir) → passados 30 s, "o acesso libera em instantes, não haverá
 * cobrança dupla" com "Verificar de novo". Confirmada atualiza a cache do usePlano: os
 * cadeados somem sem recarregar.
 */
export default function SucessoAssinatura({ agora }: { agora?: Date }) {
  const params = useSearchParams();
  const sessionId = params.get('session_id');
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [fase, setFase] = useState<Fase>('processando');
  const [me, setMe] = useState<AssinaturaMe | null>(null);
  const [rodada, setRodada] = useState(0);
  const vivoRef = useRef(true);

  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
    };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const inicio = Date.now();
    const tentar = async () => {
      const atual = await buscarAssinaturaMe({ sessionId }).catch(() => null);
      if (!vivoRef.current) return;
      if (atual && assinaturaConfirmada(atual)) {
        setMe(atual);
        setFase('confirmada');
        queryClient.setQueryData(PLANO_QUERY_KEY, atual);
        return;
      }
      if (Date.now() - inicio + INTERVALO_POLLING_MS > LIMITE_POLLING_MS) {
        setFase('demorou');
        return;
      }
      timer = setTimeout(() => void tentar(), INTERVALO_POLLING_MS);
    };
    setFase('processando');
    void tentar();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, queryClient, rodada]);

  const verificarDeNovo = useCallback(() => setRodada((n) => n + 1), []);
  const ref = agora ?? new Date();

  if (fase === 'processando') {
    return (
      <div className={CARTAO} data-mf-retorno="processando">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[#EDF2F8] dark:bg-white/5">
          <div
            role="status"
            aria-label="Carregando"
            className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#DCE6F2] border-t-mf-outside motion-reduce:[animation-duration:3s] dark:border-gray-700 dark:border-t-mf-outside"
          />
        </div>
        <h2 className="text-[22px] font-semibold text-mf-seguranca dark:text-white">
          Processando seu pagamento…
        </h2>
        <p className="max-w-[44ch] text-gray-500 dark:text-gray-400">
          Isso costuma levar poucos segundos. Não feche esta página.
        </p>
      </div>
    );
  }

  if (fase === 'demorou' || !me?.planoAssinatura) {
    return (
      <div className={CARTAO} data-mf-retorno="demorou">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[#EDF2F8] text-mf-outside dark:bg-white/5">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </div>
        <h2 className="text-[22px] font-semibold text-mf-seguranca dark:text-white">
          Seu pagamento está sendo processado
        </h2>
        <p className="max-w-[44ch] text-gray-500 dark:text-gray-400">
          O acesso ao plano libera em instantes. Se em alguns minutos ainda não aparecer, escreva
          para {EMAIL_SUPORTE}. Você não será cobrado duas vezes.
        </p>
        <div className="flex flex-wrap justify-center gap-2 max-[520px]:w-full max-[520px]:flex-col">
          <button type="button" onClick={verificarDeNovo} className={BTN_PRIMARIO}>
            Verificar de novo
          </button>
          <Link href="/profile" className={BTN_SECUNDARIO}>
            Minha assinatura
          </Link>
        </div>
      </div>
    );
  }

  const plano = me.planoAssinatura;
  const linhas: Array<[string, string]> = [
    ['Plano', `${NOME_PLANO[plano]} ${me.intervalo === 'mes' ? 'mensal' : 'anual'}`],
    ['Pago hoje', valorPago(plano, me.intervalo, ref)],
  ];
  if (me.currentPeriodEnd) {
    linhas.push([
      'Renova em',
      `${formatarData(me.currentPeriodEnd)} por ${valorRenovacao(plano, me.intervalo)}`,
    ]);
  }
  if (me.podeDesistirAte) {
    linhas.push(['Pode desistir com reembolso até', formatarData(me.podeDesistirAte)]);
  }

  return (
    <div className={CARTAO} data-mf-retorno="confirmada">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[#ECFDF3] text-[#067647] dark:bg-[rgba(18,183,106,0.12)] dark:text-[#32D583]">
        <IconeCheck className="h-7 w-7" />
      </div>
      <h2 className="text-[22px] font-semibold text-mf-seguranca dark:text-white">
        Assinatura confirmada: {NOME_PLANO[plano]}
      </h2>
      <p className="max-w-[44ch] text-gray-500 dark:text-gray-400">
        Tudo do {NOME_PLANO[plano]} já está liberado.
        {user?.email
          ? ` O recibo foi enviado para ${user.email}.`
          : ' O recibo chega no seu e-mail.'}
      </p>
      <div className="flex w-full flex-col gap-1.5 rounded-xl bg-gray-100 px-4 py-3.5 text-left text-[13.5px] tabular-nums dark:bg-white/[0.05]">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-gray-400">{rotulo}</span>
            <span className="text-right text-gray-800 dark:text-gray-100">{valor}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-[520px]:w-full max-[520px]:flex-col">
        <Link href="/carteira" className={BTN_PRIMARIO}>
          Ir para a Carteira
        </Link>
        <Link href="/profile" className={BTN_SECUNDARIO}>
          Minha assinatura
        </Link>
      </div>
    </div>
  );
}
