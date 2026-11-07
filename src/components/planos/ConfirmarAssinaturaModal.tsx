'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useCsrf } from '@/hooks/useCsrf';
import {
  NOME_PLANO,
  OFERTAS_PLANOS,
  PRECOS_PLANOS,
  formatarReais,
  ofertaVigente,
  type Intervalo,
  type PlanoPago,
} from '@/lib/planos';
import type { CheckoutAssinaturaBody, UrlRedirecionamento } from '@/types/assinatura';
import { BTN_PRIMARIO, BTN_SECUNDARIO } from './planosUi';

export interface ConfirmarAssinaturaModalProps {
  plano: PlanoPago;
  intervalo: Intervalo;
  onFechar: () => void;
  agora?: Date;
}

/** Data de hoje + 1 ano em São Paulo ('07/11/2027'): renovação do anual. */
function daquiAUmAno(agora: Date): string {
  const d = new Date(agora.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Linhas do resumo do valor no modal (o servidor decide o cupom; aqui é só o espelho). */
export function resumoDoValor(
  plano: PlanoPago,
  intervalo: Intervalo,
  agora: Date,
): { linhas: Array<[string, string]>; total: string; renovacao: string } {
  const p = PRECOS_PLANOS[plano];
  const nome = NOME_PLANO[plano];
  if (intervalo === 'mes') {
    const mensal = formatarReais(p.mensalCentavos);
    return {
      linhas: [[`${nome} mensal`, mensal]],
      total: mensal,
      renovacao: `todo mês por ${mensal} (preço normal vigente)`,
    };
  }
  const anual = formatarReais(p.anualCentavos);
  if (!ofertaVigente(agora)) {
    return {
      linhas: [[`${nome} anual`, anual]],
      total: anual,
      renovacao: `em ${daquiAUmAno(agora)} por ${anual} (preço normal vigente)`,
    };
  }
  return {
    linhas: [
      [`${nome} anual`, anual],
      [
        `Desconto Black Friday (${OFERTAS_PLANOS[plano].desconto}, só no 1º ano)`,
        formatarReais(-p.cupomOfertaCentavos),
      ],
    ],
    total: formatarReais(p.anualOfertaCentavos),
    renovacao: `em ${daquiAUmAno(agora)} por ${anual} (preço normal vigente)`,
  };
}

/**
 * Confirmação antes do Checkout (Decreto 7.962/2013): resumo do valor, renovação automática,
 * cancelar × desistir, só cartão e aceite obrigatório dos Termos. "Ir para o pagamento" faz
 * POST /api/assinaturas/checkout (CSRF) e redireciona para o Stripe. No celular vira folha da
 * base, com os botões em largura total.
 */
export default function ConfirmarAssinaturaModal({
  plano,
  intervalo,
  onFechar,
  agora,
}: ConfirmarAssinaturaModalProps) {
  const { csrfFetch } = useCsrf();
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aceiteRef = useRef<HTMLInputElement>(null);
  const tituloId = useId();
  const ref = agora ?? new Date();
  const resumo = resumoDoValor(plano, intervalo, ref);

  useEffect(() => {
    aceiteRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar]);

  const irParaPagamento = async () => {
    if (!aceite) return;
    setEnviando(true);
    setErro(null);
    try {
      const body: CheckoutAssinaturaBody = { plano, intervalo, aceiteTermos: true };
      const res = await csrfFetch('/api/assinaturas/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as Partial<UrlRedirecionamento> & {
        error?: string;
      };
      if (!res.ok || !json?.url) throw new Error(json?.error || 'checkout');
      window.location.assign(json.url);
    } catch {
      setErro('Não foi possível abrir o pagamento agora. Nada foi cobrado. Tente de novo.');
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] grid place-items-center bg-[rgba(12,17,29,0.55)] p-4 max-[520px]:place-items-end max-[520px]:p-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        data-mf-confirmar-assinatura=""
        className="flex max-h-[calc(100vh-32px)] w-full max-w-[480px] flex-col gap-3.5 overflow-y-auto rounded-2xl bg-white p-[22px] text-sm text-gray-800 shadow-[0_10px_30px_rgba(28,41,60,0.12)] dark:bg-gray-900 dark:text-gray-100 max-[520px]:max-w-none max-[520px]:rounded-b-none max-[520px]:rounded-t-[18px] max-[520px]:pb-[max(22px,env(safe-area-inset-bottom))]"
      >
        <h3 id={tituloId} className="text-lg font-semibold text-mf-seguranca dark:text-white">
          Assinar o {NOME_PLANO[plano]} {intervalo === 'ano' ? 'anual' : 'mensal'}
        </h3>
        <div className="flex flex-col gap-2 rounded-xl bg-gray-100 p-3.5 tabular-nums dark:bg-white/[0.05]">
          {resumo.linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-3">
              <span>{rotulo}</span>
              <span className="whitespace-nowrap">{valor}</span>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-gray-200 pt-2 font-bold dark:border-gray-700">
            <span>Total hoje</span>
            <span className="whitespace-nowrap">{resumo.total}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-[13.5px]">
          <p>
            A assinatura <b>renova sozinha</b> {resumo.renovacao}. Cancele quando quiser em Perfil
            &gt; Minha assinatura.
          </p>
          <p>
            <b>Cancelar</b> encerra a assinatura no fim do período já pago. <b>Desistir</b> em até 7
            dias depois da compra devolve o valor inteiro: é só usar &quot;Desistir da compra&quot;
            em Perfil &gt; Minha assinatura.
          </p>
          <p>
            Pagamento só no cartão de crédito, numa página segura do Stripe. Não guardamos o número
            do seu cartão.
          </p>
        </div>
        <label className="flex items-start gap-2.5 rounded-[10px] border border-gray-200 p-3 text-[13.5px] dark:border-gray-700">
          <input
            ref={aceiteRef}
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-px h-[18px] w-[18px] shrink-0 accent-mf-outside"
            data-mf-aceite=""
          />
          <span>
            Li e aceito os{' '}
            <Link href="/termos-de-uso" target="_blank" className="font-medium text-mf-outside">
              Termos de uso
            </Link>{' '}
            e a{' '}
            <Link
              href="/politica-de-privacidade"
              target="_blank"
              className="font-medium text-mf-outside"
            >
              Política de privacidade
            </Link>
            , incluindo a renovação automática.
          </span>
        </label>
        {erro ? (
          <p role="alert" className="text-[13px] text-[#B42318] dark:text-[#F97066]">
            {erro}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2.5 max-[520px]:flex-col-reverse">
          <button
            type="button"
            onClick={onFechar}
            className={`${BTN_SECUNDARIO} max-[520px]:w-full`}
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void irParaPagamento()}
            disabled={!aceite || enviando}
            className={`${BTN_PRIMARIO} max-[520px]:w-full`}
          >
            {enviando ? 'Abrindo o pagamento…' : 'Ir para o pagamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
