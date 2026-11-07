'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePlano } from '@/hooks/usePlano';
import {
  NOME_PLANO,
  OFERTAS_PLANOS,
  PRECOS_PLANOS,
  equivalenteMensalOferta,
  formatarReais,
  ofertaVigente,
  temAcesso,
  type PlanoPago,
} from '@/lib/planos';
import { MATRIZ_EXIBICAO } from '@/lib/planosMatriz';
import {
  BTN_PRIMARIO,
  FAIXA_OFERTA,
  IconeCadeadoPlano,
  IconeCheck,
  usePortalAssinatura,
} from './planosUi';

/** Prévia FICTÍCIA desenhada desfocada por baixo do cartão (nunca dado real do usuário). */
export type PreviaCadeado = 'carteira' | 'quadro' | 'planejamento' | 'saude' | 'analise';

export interface CadeadoPlanoProps {
  /** Plano que libera o recurso. */
  need: PlanoPago;
  /** 'pagina' = prévia alta + cartão central; 'bloco' = aba/seção, prévia baixa. */
  variante?: 'pagina' | 'bloco';
  /** Nome do recurso na frase do consultor ("A Análise de Ativos faz parte do Pro"). */
  recurso?: string;
  /** Uma frase do que o recurso faz (abaixo do título). */
  descricao?: string;
  previa?: PreviaCadeado;
  /** Instante para a validade da oferta (padrão: agora). */
  agora?: Date;
}

const DESCRICAO_PADRAO: Record<PlanoPago, string> = {
  pro: 'Acompanhe seus investimentos, a rentabilidade e os seus planos num lugar só.',
  adv: 'Veja cada detalhe da carteira e cuide do imposto de renda sem planilha.',
};

/** Linhas da prévia: só números inventados (tickers públicos, valores de exemplo). */
const LINHAS_FICTICIAS = [
  ['ITUB4', '9,1%', '1,9', '8,4', '21%', '+12%'],
  ['WEGE3', '1,7%', '9,8', '31,2', '30%', '+8%'],
  ['BBAS3', '10,4%', '0,8', '4,6', '20%', '−3%'],
  ['TAEE11', '9,8%', '1,8', '9,1', '22%', '+5%'],
  ['VALE3', '7,2%', '1,3', '6,0', '19%', '−6%'],
  ['HGLG11', '8,6%', '1,0', '—', '—', '+2%'],
  ['PETR4', '13,5%', '1,1', '3,9', '29%', '+4%'],
] as const;

const KPIS_FICTICIOS: Record<PreviaCadeado, ReadonlyArray<readonly [string, string]>> = {
  carteira: [
    ['Patrimônio', 'R$ 248.300'],
    ['Rentabilidade 12m', '+11,4%'],
    ['Proventos 12m', 'R$ 9.870'],
    ['Classes', '7'],
  ],
  quadro: [
    ['Ações', '412'],
    ['FIIs', '298'],
    ['Filtros', '3'],
    ['Salvos', '12'],
  ],
  planejamento: [
    ['Independência em', '2041'],
    ['Aporte mensal', 'R$ 2.500'],
    ['Renda desejada', 'R$ 12.000'],
    ['Sonhos', '4'],
  ],
  saude: [
    ['Nota geral', '7,8'],
    ['Reserva', '6 meses'],
    ['Endividamento', '18%'],
    ['Seguros', '3'],
  ],
  analise: [
    ['TWR 12m', '+10,9%'],
    ['Volatilidade', '9,2%'],
    ['Cobertura FGC', '92%'],
    ['IR do mês', 'R$ 0,00'],
  ],
};

const CABECALHO_FICTICIO = ['Ativo', 'DY', 'P/VP', 'P/L', 'ROE', '12 meses'];

/** Prévia desfocada (aria-hidden, sem foco, sem seleção): números de exemplo, nunca do usuário. */
export function PreviaFicticia({ tipo, linhas = 7 }: { tipo: PreviaCadeado; linhas?: number }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {KPIS_FICTICIOS[tipo].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-[10px] bg-gray-100 p-3 dark:bg-white/[0.05]">
            <span className="block text-xs text-gray-500 dark:text-gray-400">{rotulo}</span>
            <b className="text-[17px] tabular-nums text-gray-800 dark:text-white/90">{valor}</b>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {['Ações', 'FIIs', 'Renda fixa', 'Tesouro'].map((c) => (
          <span
            key={c}
            className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-white/[0.05] dark:text-gray-300"
          >
            {c}
          </span>
        ))}
      </div>
      <div className="text-[13px] text-gray-700 dark:text-gray-200">
        <div className="grid grid-cols-[1.2fr_repeat(2,1fr)] gap-2.5 border-b border-gray-200 py-2 text-xs font-semibold text-gray-500 sm:grid-cols-[1.2fr_repeat(5,1fr)] dark:border-gray-800 dark:text-gray-400">
          {CABECALHO_FICTICIO.map((c, i) => (
            <span key={c} className={i > 1 && i < 5 ? 'max-sm:hidden' : undefined}>
              {c}
            </span>
          ))}
        </div>
        {LINHAS_FICTICIAS.slice(0, linhas).map((linha) => (
          <div
            key={linha[0]}
            className="grid grid-cols-[1.2fr_repeat(2,1fr)] gap-2.5 border-b border-gray-200 py-2 tabular-nums sm:grid-cols-[1.2fr_repeat(5,1fr)] dark:border-gray-800"
          >
            {linha.map((v, i) => (
              <span key={i} className={i > 1 && i < 5 ? 'max-sm:hidden' : undefined}>
                {v}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Texto da oferta no cartão do cadeado (só com a Black Friday vigente). */
export function textoOfertaCadeado(need: PlanoPago): { titulo: string; linha: string } {
  const oferta = OFERTAS_PLANOS[need];
  return {
    titulo: `Black Friday até 05/12: anual ${oferta.desconto} abaixo de 12 mensalidades`,
    linha: `${formatarReais(PRECOS_PLANOS[need].anualOfertaCentavos)} no primeiro ano, equivale a ${formatarReais(equivalenteMensalOferta(need))} por mês.`,
  };
}

const CARTAO =
  'flex w-full max-w-[420px] flex-col gap-2.5 rounded-2xl border border-gray-200 bg-white p-[22px] shadow-[0_10px_30px_rgba(28,41,60,0.12)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]';

function Lk() {
  return (
    <span className="grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-mf-seguranca text-white">
      <IconeCadeadoPlano />
    </span>
  );
}

function CartaoVenda({
  need,
  descricao,
  agora,
}: {
  need: PlanoPago;
  descricao: string;
  agora: Date;
}) {
  const nome = NOME_PLANO[need];
  const itens = MATRIZ_EXIBICAO.cartoes[need].itens.slice(0, 3);
  const oferta = ofertaVigente(agora) ? textoOfertaCadeado(need) : null;
  return (
    <div className={CARTAO} data-mf-cadeado-cartao="venda">
      <Lk />
      <h4 className="text-lg font-semibold text-mf-seguranca dark:text-white">
        Disponível no {nome}
      </h4>
      <p className="text-[13.5px] text-gray-500 dark:text-gray-400">{descricao}</p>
      <ul className="flex flex-col gap-1.5 text-[13.5px] text-gray-800 dark:text-gray-100">
        {itens.map((item) => (
          <li key={item} className="flex gap-2">
            <IconeCheck className="mt-[3px] h-4 w-4 text-mf-outside" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {oferta ? (
        <div className={`${FAIXA_OFERTA} px-3 py-2.5 text-[13px]`} data-mf-cadeado-oferta="">
          <b className="block text-sm">{oferta.titulo}</b>
          {oferta.linha}
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <Link href={`/planos?need=${need}`} className={`${BTN_PRIMARIO} max-[520px]:w-full`}>
          Ver planos
        </Link>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Renovação automática · 7 dias para desistir
        </span>
      </div>
    </div>
  );
}

function CartaoConsultor({
  need,
  recurso,
  cliente,
}: {
  need: PlanoPago;
  recurso: string;
  cliente: string;
}) {
  return (
    <div className={CARTAO} data-mf-cadeado-cartao="consultor">
      <Lk />
      <h4 className="text-lg font-semibold text-mf-seguranca dark:text-white">
        Este recurso não está no plano do cliente nem no seu
      </h4>
      <p className="text-[13.5px] text-gray-500 dark:text-gray-400">
        {recurso} faz parte do {NOME_PLANO[need]}. Só {cliente} pode mudar o plano dele.
      </p>
    </div>
  );
}

function CartaoPagamento({ need }: { need: PlanoPago }) {
  const portal = usePortalAssinatura();
  return (
    <div className={CARTAO} data-mf-cadeado-cartao="pagamento">
      <Lk />
      <h4 className="text-lg font-semibold text-mf-seguranca dark:text-white">
        Pagamento pendente
      </h4>
      <p className="text-[13.5px] text-gray-500 dark:text-gray-400">
        Não conseguimos cobrar sua assinatura do {NOME_PLANO[need]}. Atualize o pagamento para
        liberar de novo. Seus dados continuam guardados.
      </p>
      {portal.erro ? (
        <p role="alert" className="text-[13px] text-[#B42318] dark:text-[#F97066]">
          {portal.erro}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => void portal.abrir()}
          disabled={portal.abrindo}
          className={`${BTN_PRIMARIO} max-[520px]:w-full`}
        >
          Atualizar pagamento
        </button>
      </div>
    </div>
  );
}

/**
 * Cadeado padrão das assinaturas (protótipo docs/assinaturas, aba "Cadeado"): prévia fictícia
 * desfocada + cartão. Três cartões:
 *  - consultor agindo pelo cliente (só aparece quando nem o cliente nem o consultor têm o plano,
 *    porque o /me já devolve o maior dos dois): texto sem CTA;
 *  - pagamento pendente (a assinatura cobriria o recurso, mas está past_due/unpaid): Portal;
 *  - venda: "Disponível no {Plano}", 3 itens da matriz, oferta e "Ver planos" → /planos?need=.
 */
export default function CadeadoPlano({
  need,
  variante = 'pagina',
  recurso = 'Este recurso',
  descricao,
  previa = 'quadro',
  agora,
}: CadeadoPlanoProps) {
  const { actingClient } = useAuth();
  const { assinatura } = usePlano();
  const ref = agora ?? new Date();
  const pagamentoPendente =
    (assinatura.status === 'past_due' || assinatura.status === 'unpaid') &&
    !!assinatura.planoAssinatura &&
    temAcesso(assinatura.planoAssinatura, need);

  const cartao = actingClient ? (
    <CartaoConsultor need={need} recurso={recurso} cliente={actingClient.name || 'o cliente'} />
  ) : pagamentoPendente ? (
    <CartaoPagamento need={need} />
  ) : (
    <CartaoVenda need={need} descricao={descricao ?? DESCRICAO_PADRAO[need]} agora={ref} />
  );

  const pagina = variante === 'pagina';
  return (
    <section
      aria-label={`Recurso do plano ${NOME_PLANO[need]}`}
      data-mf-cadeado={variante}
      data-need={need}
      className="grid overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div
        aria-hidden="true"
        inert
        className={`pointer-events-none flex select-none [grid-area:1/1] flex-col overflow-hidden p-[18px] opacity-55 blur-[5px] saturate-[.6] ${
          pagina ? 'max-h-[560px] min-h-[520px]' : 'max-h-[400px] min-h-[380px]'
        }`}
      >
        <PreviaFicticia tipo={previa} linhas={pagina ? 7 : 4} />
      </div>
      <div className="grid place-items-center [grid-area:1/1] bg-gradient-to-b from-transparent via-gray-50/55 to-gray-50/55 p-4 dark:via-gray-900/60 dark:to-gray-900/60">
        {cartao}
      </div>
    </section>
  );
}
