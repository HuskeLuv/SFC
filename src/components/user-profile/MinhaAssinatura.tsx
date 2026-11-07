'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCsrf } from '@/hooks/useCsrf';
import { PLANO_QUERY_KEY, usePlano } from '@/hooks/usePlano';
import { NOME_PLANO, PRECOS_PLANOS, formatarReais } from '@/lib/planos';
import type { AssinaturaMe } from '@/types/assinatura';
import {
  BTN_PRIMARIO,
  BTN_SECUNDARIO,
  IconeAlerta,
  IconeInfo,
  aindaVale,
  formatarData,
  formatarDiaMes,
  usePortalAssinatura,
} from '@/components/planos/planosUi';

/** Prazo de reembolso do arrependimento informado ao usuário (o suporte executa no Stripe). */
export const DIAS_UTEIS_REEMBOLSO = 5;

export type EstadoAssinatura =
  | 'ativa'
  | 'cortesia'
  | 'lancamento'
  | 'falha'
  | 'cancelada'
  | 'basic'
  | 'equipe'
  | 'consultor';

/** Estado da tela a partir do /me (e de estar agindo por um cliente). */
export function estadoDaAssinatura(me: AssinaturaMe, agindoPeloCliente: boolean): EstadoAssinatura {
  if (agindoPeloCliente) return 'consultor';
  const paga = me.origem === 'assinatura' && !!me.planoAssinatura;
  if (me.status === 'past_due' && me.planoAssinatura) return 'falha';
  if (paga && me.cancelAtPeriodEnd) return 'cancelada';
  if (paga) return 'ativa';
  if (me.origem === 'lancamento') return 'lancamento';
  if (me.origem === 'cortesia' || me.origem === 'legado') return 'cortesia';
  if (me.origem === 'consultor' || (me.origem === 'forcado' && me.plano !== 'basic'))
    return 'equipe';
  return 'basic';
}

/** Resumo de uma linha (o "hint" do item Minha assinatura no Perfil do celular). */
export function resumoDaAssinatura(me: AssinaturaMe, agindoPeloCliente: boolean): string {
  const nome = NOME_PLANO[me.plano];
  switch (estadoDaAssinatura(me, agindoPeloCliente)) {
    case 'ativa':
      return `${nome} · próxima renovação ${formatarData(me.currentPeriodEnd)}`.trim();
    case 'cancelada':
      return `${nome} · termina em ${formatarData(me.currentPeriodEnd)}`;
    case 'falha':
      return `${nome} · pagamento pendente`;
    case 'cortesia':
      return me.cortesiaAte
        ? `${nome} · cortesia até ${formatarData(me.cortesiaAte)}`
        : `${nome} · cortesia`;
    case 'lancamento':
      return `${nome} · acesso completo até ${formatarData(me.cortesiaAte)}`;
    case 'equipe':
      return `${nome} · sem cobrança`;
    case 'consultor':
      return `${nome} · plano do cliente`;
    default:
      return 'Basic, grátis';
  }
}

const PILULA: Record<'ok' | 'warn' | 'bad' | 'sel', string> = {
  ok: 'bg-[#ECFDF3] text-[#067647] dark:bg-[rgba(18,183,106,0.12)] dark:text-[#32D583]',
  warn: 'bg-[#FEF6E7] text-[#8A5A00] dark:bg-[rgba(247,144,9,0.12)] dark:text-[#FDB022]',
  bad: 'bg-[#FEF3F2] text-[#B42318] dark:bg-[rgba(240,68,56,0.12)] dark:text-[#F97066]',
  sel: 'border border-[#DCE6F2] bg-[#EDF2F8] text-mf-patrimonio dark:border-gray-700 dark:bg-white/5 dark:text-mf-tranquilidade',
};

const FAIXA: Record<'info' | 'warn' | 'bad', string> = {
  info: 'border-[#DCE6F2] bg-[#EDF2F8] text-gray-800 dark:border-gray-700 dark:bg-white/5 dark:text-gray-100',
  warn: 'border-[#F5D9A8] bg-[#FEF6E7] text-[#8A5A00] dark:border-[rgba(247,144,9,0.35)] dark:bg-[rgba(247,144,9,0.12)] dark:text-[#FDB022]',
  bad: 'border-[#FECDCA] bg-[#FEF3F2] text-[#B42318] dark:border-[rgba(240,68,56,0.35)] dark:bg-[rgba(240,68,56,0.12)] dark:text-[#F97066]',
};

interface Visao {
  pilula: { texto: string; tom: keyof typeof PILULA };
  ciclo: string;
  proxRotulo: string;
  prox: string;
  valor: string;
  alerta?: { tom: keyof typeof FAIXA; texto: React.ReactNode };
  nota: React.ReactNode;
}

function valorCheio(me: AssinaturaMe): string {
  if (!me.planoAssinatura) return 'R$ 0,00';
  const p = PRECOS_PLANOS[me.planoAssinatura];
  return formatarReais(me.intervalo === 'mes' ? p.mensalCentavos : p.anualCentavos);
}

const cicloDe = (me: AssinaturaMe) =>
  me.intervalo === 'mes' ? 'Mensal' : me.intervalo === 'ano' ? 'Anual' : '—';

const NADA_APAGADO = 'Nenhum dado é apagado.';

function visaoDe(estado: EstadoAssinatura, me: AssinaturaMe, cliente: string | null): Visao {
  const nome = NOME_PLANO[me.plano];
  const ate = formatarData(me.cortesiaAte);
  const fim = formatarData(me.currentPeriodEnd);
  switch (estado) {
    case 'ativa':
      return {
        pilula: { texto: 'Ativa', tom: 'ok' },
        ciclo: cicloDe(me),
        proxRotulo: 'Próxima renovação',
        prox: fim || '—',
        valor: me.intervalo === 'ano' ? `${valorCheio(me)} (preço normal)` : valorCheio(me),
        nota: `A renovação automática${fim ? ` em ${fim}` : ''} sai por ${valorCheio(me)}. Se cancelar antes, o ${nome} continua até essa data.`,
      };
    case 'cancelada':
      return {
        pilula: { texto: 'Cancelamento agendado', tom: 'warn' },
        ciclo: cicloDe(me),
        proxRotulo: 'Termina em',
        prox: fim || '—',
        valor: 'Sem nova cobrança',
        alerta: {
          tom: 'warn',
          texto: `Sua assinatura termina em ${fim}. Até lá, tudo do ${nome} continua liberado. Mudou de ideia? Reative em Gerenciar.`,
        },
        nota: `Depois de ${fim} a conta passa para o Basic. ${NADA_APAGADO} Carteira e planejamento voltam a aparecer se você assinar de novo.`,
      };
    case 'falha': {
      const prazo = formatarDiaMes(me.carenciaAte);
      return {
        pilula: { texto: 'Pagamento pendente', tom: 'bad' },
        ciclo: cicloDe(me),
        proxRotulo: 'Acesso garantido até',
        prox: formatarData(me.carenciaAte) || '—',
        valor: valorCheio(me),
        alerta: {
          tom: 'bad',
          texto: (
            <>
              <b>Não conseguimos cobrar seu cartão.</b>{' '}
              {prazo
                ? `Atualize o cartão até ${prazo} para continuar no ${nome}.`
                : `Atualize o cartão para continuar no ${nome}.`}{' '}
              Vamos tentar de novo nos próximos dias.
            </>
          ),
        },
        nota: `Se o pagamento não for feito${prazo ? ` até ${prazo}` : ''}, a conta passa para o Basic. Seus dados continuam guardados e voltam quando o pagamento for feito.`,
      };
    }
    case 'cortesia':
      return {
        pilula: { texto: 'Cortesia', tom: 'sel' },
        ciclo: 'Sem cobrança',
        proxRotulo: 'Cortesia até',
        prox: ate || 'Sem data',
        valor: 'R$ 0,00',
        alerta: ate
          ? {
              tom: 'info',
              texto: `Como você já usava o My Finance antes do lançamento, seu acesso ${nome} é gratuito até ${ate}. Depois disso, a conta passa para o Basic, a menos que você assine um plano. ${NADA_APAGADO}`,
            }
          : undefined,
        nota: ate
          ? `Assinar agora não encurta a cortesia: você continua no ${nome} até ${ate} e o plano pago vale a partir daí.`
          : `Seu acesso ${nome} é uma cortesia sem data para acabar.`,
      };
    case 'lancamento':
      return {
        pilula: { texto: 'Lançamento', tom: 'sel' },
        ciclo: 'Sem cobrança',
        proxRotulo: 'Acesso completo até',
        prox: ate || '—',
        valor: 'R$ 0,00',
        alerta: {
          tom: 'info',
          texto: `Acesso completo de lançamento até ${ate}. Depois, a conta passa para o Basic grátis, a menos que você assine um plano. ${NADA_APAGADO}`,
        },
        nota: 'Assinar agora não encurta o acesso de lançamento.',
      };
    case 'equipe':
      return {
        pilula: { texto: 'Equipe', tom: 'sel' },
        ciclo: 'Sem cobrança',
        proxRotulo: 'Renovação',
        prox: 'Não se aplica',
        valor: 'R$ 0,00',
        nota: `Contas da equipe e de consultores usam o ${nome} sem cobrança.`,
      };
    case 'consultor':
      return {
        pilula: { texto: me.origem === 'assinatura' ? 'Ativa' : NOME_PLANO[me.plano], tom: 'ok' },
        ciclo: cicloDe(me),
        proxRotulo: me.currentPeriodEnd ? 'Próxima renovação' : 'Renovação',
        prox: fim || 'Não se aplica',
        valor: me.planoAssinatura ? valorCheio(me) : 'R$ 0,00',
        alerta: {
          tom: 'info',
          texto: (
            <>
              Você está vendo a conta de <b>{cliente ?? 'um cliente'}</b>. Só o próprio cliente pode
              mudar ou cancelar a assinatura.
            </>
          ),
        },
        nota: 'O plano que vale nas telas é o maior entre o do cliente e o seu.',
      };
    default:
      return {
        pilula: { texto: 'Grátis', tom: 'sel' },
        ciclo: '—',
        proxRotulo: 'Renovação',
        prox: 'Não se aplica',
        valor: 'R$ 0,00',
        nota: 'Você usa o plano grátis. Para acompanhar investimentos, planejamento e imposto de renda, conheça o Pro e o Advanced.',
      };
  }
}

/**
 * Minha assinatura (protótipo docs/assinaturas, aba "Minha assinatura"): no Perfil do computador
 * logo após o cartão do usuário; no celular, dentro do sheet do grupo "Assinatura". Some com a
 * chave desligada. Botões: Mudar de plano (/planos), Gerenciar pagamento, faturas e
 * cancelamento (Portal do Stripe) e, só até `podeDesistirAte`, "Desistir da compra (até 7 dias)"
 * com confirmação e protocolo.
 */
export default function MinhaAssinatura({
  variante = 'pagina',
  agora,
}: {
  variante?: 'pagina' | 'sheet';
  agora?: Date;
}) {
  const { habilitado, assinatura: me } = usePlano();
  const { actingClient } = useAuth();
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const portal = usePortalAssinatura();
  const [confirmandoDesistencia, setConfirmandoDesistencia] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroDesistencia, setErroDesistencia] = useState<string | null>(null);

  if (!habilitado) return null;

  const ref = agora ?? new Date();
  const estado = estadoDaAssinatura(me, Boolean(actingClient));
  const visao = visaoDe(estado, me, actingClient?.name ?? null);
  const leitura = estado === 'consultor';
  const paga = estado === 'ativa' || estado === 'cancelada' || estado === 'falha';
  const pedido = me.pedidoArrependimento;
  // O servidor já zera podeDesistirAte quando há pedido desta assinatura; um pedido de compra
  // anterior não esconde o botão da compra nova.
  const podeDesistir = !leitura && paga && aindaVale(me.podeDesistirAte, ref);

  const desistir = async () => {
    setEnviando(true);
    setErroDesistencia(null);
    try {
      const res = await csrfFetch('/api/assinaturas/arrependimento', { method: 'POST' });
      if (!res.ok) throw new Error('arrependimento');
      setConfirmandoDesistencia(false);
      await queryClient.invalidateQueries({ queryKey: PLANO_QUERY_KEY });
    } catch {
      setErroDesistencia(
        'Não foi possível registrar o pedido agora. Tente de novo ou escreva para suporte@appmyfinance.com.br.',
      );
    } finally {
      setEnviando(false);
    }
  };

  const sheet = variante === 'sheet';
  const bloco = sheet ? 'px-0' : 'px-[22px] max-[640px]:px-[18px]';

  return (
    <section
      aria-labelledby="minha-assinatura-titulo"
      data-mf-minha-assinatura={estado}
      className={
        sheet
          ? 'overflow-hidden'
          : 'overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]'
      }
    >
      <div
        className={`flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 py-5 dark:border-gray-800 ${bloco}`}
      >
        <div>
          {!sheet ? (
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
              Minha assinatura
            </span>
          ) : null}
          <h3
            id="minha-assinatura-titulo"
            className="mt-0.5 flex flex-wrap items-center gap-2.5 text-[22px] font-semibold text-mf-seguranca dark:text-white"
          >
            {sheet ? <span className="sr-only">Minha assinatura: </span> : null}
            {NOME_PLANO[me.plano]}
            <span
              className={`inline-flex items-center rounded-full px-[9px] py-0.5 text-xs font-semibold ${PILULA[visao.pilula.tom]}`}
            >
              {visao.pilula.texto}
            </span>
          </h3>
        </div>
      </div>

      {visao.alerta ? (
        <div
          className={`mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${FAIXA[visao.alerta.tom]} ${
            sheet ? '' : 'mx-[22px] max-[640px]:mx-[18px]'
          }`}
        >
          {visao.alerta.tom === 'bad' ? (
            <IconeAlerta className="mt-0.5 h-4 w-4" />
          ) : (
            <IconeInfo className="mt-0.5 h-4 w-4" />
          )}
          <p className="min-w-0">{visao.alerta.texto}</p>
        </div>
      ) : null}

      <dl className="m-0 grid grid-cols-3 tabular-nums max-[640px]:grid-cols-1">
        {(
          [
            ['Ciclo', visao.ciclo],
            [visao.proxRotulo, visao.prox],
            ['Valor', visao.valor],
          ] as const
        ).map(([dt, dd], i) => (
          <div
            key={dt}
            className={`flex min-w-0 flex-col gap-0.5 py-4 max-[640px]:flex-row max-[640px]:items-baseline max-[640px]:justify-between max-[640px]:gap-3 max-[640px]:py-3 ${bloco} ${
              i < 2
                ? 'border-r border-gray-200 max-[640px]:border-b max-[640px]:border-r-0 dark:border-gray-800'
                : ''
            }`}
          >
            <dt className="text-xs text-gray-500 dark:text-gray-400">{dt}</dt>
            <dd className="m-0 text-[15px] font-semibold text-gray-800 max-[640px]:text-right dark:text-gray-100">
              {dd}
            </dd>
          </div>
        ))}
      </dl>

      <div
        className={`flex flex-col gap-1.5 border-t border-gray-200 py-3.5 text-[13px] text-gray-500 dark:border-gray-800 dark:text-gray-400 ${bloco}`}
      >
        <p>{visao.nota}</p>
        {paga && !leitura ? (
          <p>
            <b>Cancelar</b> encerra a assinatura no fim do período já pago. <b>Desistir</b> (até 7
            dias depois da compra) devolve o valor inteiro e encerra o plano na hora.
          </p>
        ) : null}
        {pedido ? (
          <p
            role="status"
            data-mf-pedido-desistencia={pedido.status}
            className="text-gray-800 dark:text-gray-100"
          >
            {pedido.status === 'atendido'
              ? `Desistência concluída em ${formatarData(pedido.atendidoEm)}: o valor foi devolvido ao seu cartão (protocolo ${pedido.protocolo}).`
              : `Pedido de desistência recebido em ${formatarDiaMes(pedido.criadoEm)}, protocolo ${pedido.protocolo}. O reembolso integral sai em até ${DIAS_UTEIS_REEMBOLSO} dias úteis.`}
          </p>
        ) : null}
      </div>

      {!leitura ? (
        <div
          className={`flex flex-wrap gap-2.5 border-t border-gray-200 py-4 dark:border-gray-800 max-[640px]:[&>*]:w-full ${bloco}`}
        >
          {estado === 'falha' ? (
            <button
              type="button"
              onClick={() => void portal.abrir()}
              disabled={portal.abrindo}
              className={BTN_PRIMARIO}
            >
              Atualizar cartão
            </button>
          ) : null}
          {estado === 'basic' ? (
            <Link href="/planos" className={BTN_PRIMARIO}>
              Ver planos
            </Link>
          ) : (
            <Link href="/planos" className={estado === 'falha' ? BTN_SECUNDARIO : BTN_PRIMARIO}>
              Mudar de plano
            </Link>
          )}
          {paga ? (
            <button
              type="button"
              onClick={() => void portal.abrir()}
              disabled={portal.abrindo}
              className={BTN_SECUNDARIO}
            >
              Gerenciar pagamento, faturas e cancelamento
            </button>
          ) : null}
          {podeDesistir ? (
            <button
              type="button"
              onClick={() => setConfirmandoDesistencia(true)}
              className={BTN_SECUNDARIO}
              data-mf-desistir=""
            >
              Desistir da compra (até {formatarDiaMes(me.podeDesistirAte)})
            </button>
          ) : null}
        </div>
      ) : null}

      {portal.erro ? (
        <p role="alert" className={`pb-4 text-[13px] text-[#B42318] dark:text-[#F97066] ${bloco}`}>
          {portal.erro}
        </p>
      ) : null}

      {confirmandoDesistencia ? (
        <div
          role="alertdialog"
          aria-labelledby="desistir-titulo"
          className={`flex flex-col gap-3 border-t border-gray-200 py-4 text-sm dark:border-gray-800 ${bloco}`}
          data-mf-confirmar-desistencia=""
        >
          <p id="desistir-titulo" className="font-semibold text-gray-800 dark:text-white/90">
            Desistir da compra?
          </p>
          <p className="text-gray-600 dark:text-gray-300">
            O plano {NOME_PLANO[me.planoAssinatura ?? me.plano]} termina na hora e devolvemos o
            valor inteiro no seu cartão em até {DIAS_UTEIS_REEMBOLSO} dias úteis. Seus dados não são
            apagados: a conta passa para o Basic.
          </p>
          {erroDesistencia ? (
            <p role="alert" className="text-[13px] text-[#B42318] dark:text-[#F97066]">
              {erroDesistencia}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2.5 max-[640px]:flex-col-reverse max-[640px]:[&>*]:w-full">
            <button
              type="button"
              onClick={() => setConfirmandoDesistencia(false)}
              className={BTN_SECUNDARIO}
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void desistir()}
              disabled={enviando}
              className={BTN_PRIMARIO}
            >
              {enviando ? 'Enviando…' : 'Confirmar desistência'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
