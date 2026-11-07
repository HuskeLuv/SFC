'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePlano } from '@/hooks/usePlano';
import { EMAIL_SUPORTE } from '@/content/faq';
import {
  NOME_PLANO,
  OFERTAS_PLANOS,
  PLANOS,
  PRECOS_PLANOS,
  descontoOfertaPct,
  equivalenteMensalOferta,
  formatarReais,
  ofertaVigente,
  type Intervalo,
  type Plano,
  type PlanoPago,
} from '@/lib/planos';
import { MATRIZ_EXIBICAO, type CelulaMatriz } from '@/lib/planosMatriz';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import ConfirmarAssinaturaModal from './ConfirmarAssinaturaModal';
import {
  BTN_PRIMARIO,
  BTN_SECUNDARIO,
  FAIXA_OFERTA,
  IconeCheck,
  IconeInfo,
  SELO_PLANO,
} from './planosUi';

const PERGUNTAS: ReadonlyArray<{ p: string; r: string }> = [
  {
    p: 'A assinatura renova sozinha?',
    r: 'Sim. No fim de cada período (mês ou ano) cobramos de novo no mesmo cartão, pelo preço normal do plano naquele momento. O desconto da Black Friday vale só para o primeiro ano.',
  },
  {
    p: 'Como cancelo?',
    r: 'Em Perfil > Minha assinatura > Gerenciar pagamento, faturas e cancelamento. O cancelamento vale no fim do período já pago, e você usa o plano até lá.',
  },
  {
    p: 'Posso desistir e receber de volta?',
    r: 'Sim. Em até 7 dias depois da compra, use "Desistir da compra" em Perfil > Minha assinatura: devolvemos o valor inteiro e o plano termina na hora (direito de arrependimento, Código de Defesa do Consumidor, art. 49).',
  },
  {
    p: 'Quais formas de pagamento?',
    r: 'Cartão de crédito. O plano anual é cobrado de uma vez. O pagamento é feito no Stripe, e o recibo chega no seu e-mail.',
  },
];

/** Preço do cartão: mensal, anual da oferta (comparado com 12 mensalidades) ou anual cheio. */
function Preco({
  plano,
  intervalo,
  oferta,
}: {
  plano: Plano;
  intervalo: Intervalo;
  oferta: boolean;
}) {
  const val =
    'text-[30px] font-extrabold leading-[1.15] tracking-[-0.02em] text-mf-seguranca dark:text-white';
  const pequeno = 'text-sm font-semibold tracking-normal text-gray-500 dark:text-gray-400';
  const eq = 'text-[13px] text-gray-500 dark:text-gray-400';
  if (plano === 'basic') {
    return (
      <div className="flex min-h-[96px] flex-col gap-0.5 tabular-nums max-[899px]:min-h-0">
        <span className={val}>Grátis</span>
        <span className={eq}>Sem cartão. Para sempre.</span>
      </div>
    );
  }
  const p = PRECOS_PLANOS[plano];
  if (intervalo === 'mes') {
    return (
      <div className="flex min-h-[96px] flex-col gap-0.5 tabular-nums max-[899px]:min-h-0">
        <span className={val}>
          {formatarReais(p.mensalCentavos)} <small className={pequeno}>/mês</small>
        </span>
        <span className={eq}>Cobrado todo mês no cartão.</span>
      </div>
    );
  }
  if (!oferta) {
    return (
      <div className="flex min-h-[96px] flex-col gap-0.5 tabular-nums max-[899px]:min-h-0">
        <span className={val}>
          {formatarReais(p.anualCentavos)} <small className={pequeno}>/ano</small>
        </span>
        <span className={eq}>
          Equivale a {formatarReais(Math.round(p.anualCentavos / 12))} por mês. Pago de uma vez no
          cartão.
        </span>
      </div>
    );
  }
  const pct = Math.round(descontoOfertaPct(plano));
  return (
    <div className="flex min-h-[96px] flex-col gap-0.5 tabular-nums max-[899px]:min-h-0">
      <span className={val}>
        {formatarReais(p.anualOfertaCentavos)} <small className={pequeno}>/ano</small>
      </span>
      <span className={eq}>
        Equivale a {formatarReais(equivalenteMensalOferta(plano))} por mês. Pago de uma vez no
        cartão.
      </span>
      <span className={eq}>
        12 mensalidades: {formatarReais(p.mensalCentavos * 12)} · você paga {pct}% a menos no 1º ano
      </span>
      <span className={`${SELO_PLANO} mt-1 self-start text-xs`}>Black Friday até 05/12</span>
    </div>
  );
}

function Celula({ v }: { v: CelulaMatriz }) {
  if (v === true) {
    return (
      <span className="inline-flex text-mf-outside" aria-label="Incluído">
        <IconeCheck />
      </span>
    );
  }
  if (v === false) {
    return (
      <span className="text-gray-400 dark:text-gray-500" aria-label="Não incluído">
        —
      </span>
    );
  }
  return <span className="tabular-nums">{v}</span>;
}

const textoCelula = (v: CelulaMatriz) => (v === true ? 'Sim' : v === false ? 'Não' : v);

/**
 * /planos (protótipo docs/assinaturas, aba "Planos"): toggle Mensal/Anual (Anual pré-selecionado
 * na oferta), faixa da Black Friday, 3 cartões (Pro em destaque, "Recomendado"), modal de aceite,
 * comparativo (tabela no padrão TABLE_STYLES no computador, acordeão no celular), FAQ e rodapé
 * com razão social e CNPJ. Sem "de/por": o anual é comparado com 12 mensalidades.
 */
export default function PlanosPage({ agora }: { agora?: Date }) {
  const ref = agora ?? new Date();
  const oferta = ofertaVigente(ref);
  const params = useSearchParams();
  const { actingClient } = useAuth();
  const { plano: planoAtual, assinatura } = usePlano();
  const [intervalo, setIntervalo] = useState<Intervalo>(oferta ? 'ano' : 'mes');
  const [escolha, setEscolha] = useState<PlanoPago | null>(null);
  const [cancelado, setCancelado] = useState(params.get('checkout') === 'cancelado');
  const podeAssinar = assinatura.podeAssinar && !actingClient;
  const temAssinaturaPaga = assinatura.origem === 'assinatura' && !!assinatura.planoAssinatura;

  // Celular: Pro primeiro (cartão em destaque); computador: Basic → Pro → Advanced.
  const cartoes = PLANOS.map((id) => {
    const atual = id === planoAtual;
    const destaque = id === 'pro';
    const cartao = MATRIZ_EXIBICAO.cartoes[id];
    let cta: React.ReactNode;
    if (id === 'basic') {
      cta = (
        <button type="button" disabled className={`${BTN_SECUNDARIO} w-full`}>
          {atual ? 'Seu plano atual' : 'Grátis para sempre'}
        </button>
      );
    } else if (temAssinaturaPaga && assinatura.planoAssinatura === id) {
      cta = (
        <button type="button" disabled className={`${BTN_SECUNDARIO} w-full`}>
          Seu plano atual
        </button>
      );
    } else {
      cta = (
        <button
          type="button"
          disabled={!podeAssinar}
          onClick={() => setEscolha(id)}
          data-mf-assinar={id}
          className={`${destaque ? BTN_PRIMARIO : BTN_SECUNDARIO} w-full`}
        >
          Assinar o {NOME_PLANO[id]}
        </button>
      );
    }
    return (
      <article
        key={id}
        data-mf-plano={id}
        className={`relative flex flex-col gap-4 rounded-2xl bg-white p-[22px] dark:bg-white/[0.03] ${
          destaque
            ? 'border-2 border-mf-outside shadow-[0_10px_30px_rgba(28,41,60,0.12)] max-[899px]:order-first'
            : 'border border-gray-200 dark:border-gray-800'
        }`}
      >
        {destaque ? (
          <span className="absolute -top-3 left-[22px] rounded-full bg-mf-outside px-2.5 py-[3px] text-[11px] font-bold uppercase tracking-[0.06em] text-white">
            Recomendado
          </span>
        ) : null}
        <div>
          <h3 className="flex flex-wrap items-center gap-2 text-xl font-bold text-mf-seguranca dark:text-white">
            {NOME_PLANO[id]}
            {atual ? <span className={SELO_PLANO}>Seu plano</span> : null}
          </h3>
          <p className="min-h-[2.6em] text-[13px] text-gray-500 max-[899px]:min-h-0 dark:text-gray-400">
            {cartao.para}
          </p>
        </div>
        <Preco plano={id} intervalo={intervalo} oferta={oferta} />
        {cta}
        {id !== 'basic' ? (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            {intervalo === 'ano'
              ? `Renova em 1 ano por ${formatarReais(PRECOS_PLANOS[id].anualCentavos)}. Cancele quando quiser.`
              : 'Renova todo mês. Cancele quando quiser.'}
          </p>
        ) : null}
        <ul className="flex flex-col gap-2 text-[13.5px] text-gray-800 dark:text-gray-100">
          {cartao.base ? (
            <li className="font-semibold text-gray-500 dark:text-gray-400">{cartao.base}</li>
          ) : null}
          {cartao.itens.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <IconeCheck className="mt-0.5 h-4 w-4 text-mf-outside" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </article>
    );
  });

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 font-app" data-mf-planos="">
      {cancelado ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-[#DCE6F2] bg-[#EDF2F8] px-4 py-3 text-gray-800 dark:border-gray-700 dark:bg-white/5 dark:text-gray-100"
          data-mf-checkout-cancelado=""
        >
          <IconeInfo />
          <p className="min-w-0 flex-[1_1_260px]">
            <b>Pagamento não concluído.</b> Nada foi cobrado. Você pode escolher um plano quando
            quiser.
          </p>
          <button
            type="button"
            onClick={() => setCancelado(false)}
            aria-label="Fechar aviso"
            className="min-h-11 min-w-11 text-lg leading-none"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-bold text-mf-seguranca dark:text-white">Planos</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Comece grátis no Basic. Mude de plano ou cancele quando quiser, em Perfil &gt; Minha
          assinatura.
        </p>
        {actingClient ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Você está vendo a conta de <b>{actingClient.name}</b>. Só o próprio cliente pode assinar
            um plano.
          </p>
        ) : null}
      </div>

      {oferta ? (
        <div
          className={`${FAIXA_OFERTA} flex flex-wrap items-center gap-4 px-5 py-[18px]`}
          data-mf-faixa-oferta=""
        >
          <div className="min-w-0 flex-[1_1_280px]">
            <strong className="block text-[17px]">
              Black Friday: anual até {OFERTAS_PLANOS.adv.desconto} abaixo de 12 mensalidades
            </strong>
            <p className="text-[13px] text-white/80">
              Pro com {OFERTAS_PLANOS.pro.desconto} e Advanced com {OFERTAS_PLANOS.adv.desconto} a
              menos no primeiro ano. Depois, a renovação é pelo preço normal.
            </p>
          </div>
          <span className="whitespace-nowrap rounded-full bg-white/15 px-[11px] py-1 text-xs font-semibold">
            Até 05/12/2026
          </span>
        </div>
      ) : null}

      <div className="sticky top-[var(--mf-header-h,0px)] z-[5] flex justify-center py-1.5">
        <div
          role="group"
          aria-label="Ciclo de cobrança"
          className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-[0_10px_30px_rgba(28,41,60,0.12)] dark:border-gray-700 dark:bg-gray-900"
        >
          {(['mes', 'ano'] as const).map((ciclo) => {
            const ativo = intervalo === ciclo;
            return (
              <button
                key={ciclo}
                type="button"
                aria-pressed={ativo}
                onClick={() => setIntervalo(ciclo)}
                className={`min-h-9 rounded-full px-[18px] font-semibold ${
                  ativo ? 'bg-mf-seguranca text-white' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {ciclo === 'mes' ? 'Mensal' : 'Anual'}
                {ciclo === 'ano' && oferta ? (
                  <span
                    className={`ml-1 text-[11px] font-bold ${ativo ? 'text-[#9CC9FF]' : 'text-mf-outside'}`}
                  >
                    até {OFERTAS_PLANOS.adv.desconto} a menos
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <section
        aria-label="Planos"
        className="grid grid-cols-3 items-start gap-4 max-[899px]:grid-cols-1 max-[899px]:gap-[22px]"
      >
        {cartoes}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-bold text-mf-seguranca dark:text-white">
          Compare os planos
        </h2>
        <div className={`${TABLE_STYLES.wrapper} max-md:hidden`} data-mf-comparativo="">
          <table className={`${TABLE_STYLES.table} min-w-[640px]`}>
            <thead>
              <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                <th scope="col" className={`${TABLE_STYLES.th} text-left`}>
                  Recurso
                </th>
                {PLANOS.map((id) => (
                  <th key={id} scope="col" className={`${TABLE_STYLES.th} text-center`}>
                    {NOME_PLANO[id]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIZ_EXIBICAO.grupos.map((g) => (
                <React.Fragment key={g.grupo}>
                  <tr className={TABLE_STYLES.row}>
                    <td
                      colSpan={4}
                      className="bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-gray-500 dark:bg-white/[0.02] dark:text-gray-400"
                    >
                      {g.grupo}
                    </td>
                  </tr>
                  {g.linhas.map((l) => (
                    <tr key={l.recurso} className={TABLE_STYLES.row}>
                      <td className={`${TABLE_STYLES.td} font-medium`}>{l.recurso}</td>
                      {(['basic', 'pro', 'adv'] as const).map((id) => (
                        <td key={id} className={`${TABLE_STYLES.td} text-center align-top`}>
                          <Celula v={l[id]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 md:hidden" data-mf-comparativo-acordeao="">
          {MATRIZ_EXIBICAO.grupos.map((g, i) => (
            <details
              key={g.grupo}
              open={i === 0}
              className="group rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 font-semibold text-gray-800 dark:text-white/90 [&::-webkit-details-marker]:hidden">
                {g.grupo}
                <span aria-hidden="true" className="font-normal text-gray-500 group-open:hidden">
                  +
                </span>
                <span
                  aria-hidden="true"
                  className="hidden font-normal text-gray-500 group-open:inline"
                >
                  −
                </span>
              </summary>
              {g.linhas.map((l) => (
                <div
                  key={l.recurso}
                  className="flex flex-col gap-1.5 border-t border-gray-200 px-3.5 py-2.5 dark:border-gray-800"
                >
                  <b className="font-semibold text-gray-800 dark:text-white/90">{l.recurso}</b>
                  <div className="grid grid-cols-3 gap-1.5 text-[12.5px]">
                    {(['basic', 'pro', 'adv'] as const).map((id) => (
                      <span
                        key={id}
                        className="min-w-0 rounded-lg bg-gray-100 px-[7px] py-[5px] text-gray-800 dark:bg-white/[0.05] dark:text-gray-100"
                      >
                        <em className="block text-[10.5px] uppercase not-italic tracking-[0.06em] text-gray-500 dark:text-gray-400">
                          {id === 'adv' ? 'Adv' : NOME_PLANO[id]}
                        </em>
                        {textoCelula(l[id])}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-bold text-mf-seguranca dark:text-white">Dúvidas comuns</h2>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {PERGUNTAS.map((q) => (
            <div
              key={q.p}
              className="flex flex-col gap-1.5 rounded-2xl border border-gray-200 bg-white px-[18px] py-4 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <h4 className="text-[14.5px] font-semibold text-mf-seguranca dark:text-white">
                {q.p}
              </h4>
              <p className="text-[13.5px] text-gray-500 dark:text-gray-400">{q.r}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-gray-200 pt-3.5 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
        <span>MY FINANCE SOFTWARES LTDA · CNPJ 65.655.251/0001-50</span>
        <a href={`mailto:${EMAIL_SUPORTE}`} className="font-medium text-mf-outside">
          {EMAIL_SUPORTE}
        </a>
        <Link href="/termos-de-uso" className="font-medium text-mf-outside">
          Termos de uso
        </Link>
        <Link href="/politica-de-privacidade" className="font-medium text-mf-outside">
          Política de privacidade
        </Link>
      </footer>

      {escolha ? (
        <ConfirmarAssinaturaModal
          plano={escolha}
          intervalo={intervalo}
          agora={ref}
          onFechar={() => setEscolha(null)}
        />
      ) : null}
    </div>
  );
}
