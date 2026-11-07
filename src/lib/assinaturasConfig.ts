/**
 * Configuração das assinaturas (Stripe, ClickUp 86e2zkhe2).
 *
 * Só lê variáveis de ambiente — NÃO importa o SDK (padrão do pluggyConfig/comunidadeConfig), então
 * serve ao middleware (Edge), aos route handlers e aos testes. O SDK (Node) vive em `@/lib/stripe`.
 *
 * Chave DESLIGADA (padrão, e assim em prod até a conta Stripe existir) = app idêntico ao de hoje:
 * todo usuário Advanced, rotas novas 404, sem cadeado novo, sem limite de conexões e a IA com o
 * ASSISTENTE_LIMITE_MENSAL de hoje.
 *
 * Variáveis (todas no .env.example):
 *  - ASSINATURAS_HABILITADAS="true"   liga (exige também STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET)
 *  - STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
 *  - STRIPE_PRICE_{PRO,ADV}_{MENSAL,ANUAL}            price_…
 *  - STRIPE_COUPON_BF_{PRO,ADV}_ANUAL                 cupom da Black Friday (ausente = sem desconto)
 *  - ASSINATURAS_APP_URL                              base das URLs de retorno do Checkout/Portal
 *  - ASSINATURAS_CORTESIA_CORTE / _CORTESIA_ATE / _LANCAMENTO_ATE   datas ISO (migração)
 *  - ASSINATURAS_CARENCIA_DIAS                        só exibição ("atualize até dd/mm"), padrão 7
 *  - ASSINATURAS_LIMITE_{IA,CONEXOES}_{BASIC,PRO,ADV} overrides de LIMITES_PLANO
 */
import {
  LIMITES_PLANO,
  ofertaVigente,
  type Intervalo,
  type Plano,
  type PlanoPago,
} from '@/lib/planos';

export { ofertaVigente };

function envTexto(nome: string): string | null {
  const v = process.env[nome]?.trim();
  return v ? v : null;
}

function envData(nome: string): Date | null {
  const v = envTexto(nome);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function envInteiro(nome: string): number | null {
  const v = envTexto(nome);
  if (!v || !/^\d+$/.test(v)) return null;
  return Number(v);
}

export function stripeSecretKey(): string | null {
  return envTexto('STRIPE_SECRET_KEY');
}

export function stripeWebhookSecret(): string | null {
  return envTexto('STRIPE_WEBHOOK_SECRET');
}

/** Chave + segredos, no mesmo espírito de `pluggyHabilitado()`. */
export function assinaturasHabilitadas(): boolean {
  return (
    process.env.ASSINATURAS_HABILITADAS === 'true' &&
    stripeSecretKey() !== null &&
    stripeWebhookSecret() !== null
  );
}

/** sk_live_… = modo produção do Stripe (o webhook ignora eventos com livemode trocado). */
export function stripeModoLive(): boolean {
  return stripeSecretKey()?.startsWith('sk_live_') ?? false;
}

const ENV_PRICE: Record<PlanoPago, Record<Intervalo, string>> = {
  pro: { mes: 'STRIPE_PRICE_PRO_MENSAL', ano: 'STRIPE_PRICE_PRO_ANUAL' },
  adv: { mes: 'STRIPE_PRICE_ADV_MENSAL', ano: 'STRIPE_PRICE_ADV_ANUAL' },
};

const ENV_CUPOM: Record<PlanoPago, string> = {
  pro: 'STRIPE_COUPON_BF_PRO_ANUAL',
  adv: 'STRIPE_COUPON_BF_ADV_ANUAL',
};

/** ID do Price do Stripe para (plano, intervalo), ou null se o env não tiver. */
export function priceDe(plano: PlanoPago, intervalo: Intervalo): string | null {
  return envTexto(ENV_PRICE[plano][intervalo]);
}

/** Plano e intervalo de um Price do Stripe; null = desconhecido (o chamador loga e trata como Basic). */
export function precoParaPlano(
  priceId: string | null | undefined,
): { plano: PlanoPago; intervalo: Intervalo } | null {
  if (!priceId) return null;
  for (const plano of ['pro', 'adv'] as const) {
    for (const intervalo of ['mes', 'ano'] as const) {
      if (priceDe(plano, intervalo) === priceId) return { plano, intervalo };
    }
  }
  return null;
}

/** Cupom da Black Friday do anual do plano (o servidor só o envia com ofertaVigente() e 'ano'). */
export function cupomOfertaAnual(plano: PlanoPago): string | null {
  return envTexto(ENV_CUPOM[plano]);
}

export const ASSINATURAS_APP_URL_PADRAO = 'https://appmyfinance.com.br';

/** Base das success/cancel/return_url, sem barra no fim. */
export function assinaturasAppUrl(): string {
  return (envTexto('ASSINATURAS_APP_URL') ?? ASSINATURAS_APP_URL_PADRAO).replace(/\/+$/, '');
}

/** Abertura do cadastro (decisão 3 de 07/11): quem foi criado antes é legado. */
export const ASSINATURAS_CORTESIA_CORTE_PADRAO = '2026-11-15T03:00:00Z';

/** Corte do legado: env ou 15/11/2026 00:00 em SP. */
export function cortesiaCorte(): Date {
  return envData('ASSINATURAS_CORTESIA_CORTE') ?? new Date(ASSINATURAS_CORTESIA_CORTE_PADRAO);
}

/**
 * Fim da cortesia Advanced do legado. Ausente (ou inválida) = legado sem data: ninguém perde
 * acesso de surpresa por falta de configuração.
 */
export function cortesiaAte(): Date | null {
  return envData('ASSINATURAS_CORTESIA_ATE');
}

/** Fim do acesso completo de lançamento (cadastros a partir do corte). Ausente = sem lançamento. */
export function lancamentoAte(): Date | null {
  return envData('ASSINATURAS_LANCAMENTO_ATE');
}

export const ASSINATURAS_CARENCIA_DIAS_PADRAO = 7;

/** Dias exibidos para atualizar o cartão após a 1ª falha (o Smart Retries do Stripe decide). */
export function carenciaDias(): number {
  return envInteiro('ASSINATURAS_CARENCIA_DIAS') ?? ASSINATURAS_CARENCIA_DIAS_PADRAO;
}

export type TipoLimite = keyof typeof LIMITES_PLANO;

const ENV_LIMITE: Record<TipoLimite, string> = {
  ia: 'ASSINATURAS_LIMITE_IA_',
  conexoes: 'ASSINATURAS_LIMITE_CONEXOES_',
};

/**
 * Limite do plano com o override do env (ASSINATURAS_LIMITE_IA_PRO=150, …). NÃO olha a chave:
 * quem aplica (F2) só chama com a chave ligada; desligada continua o comportamento de hoje.
 */
export function limiteDoPlano(tipo: TipoLimite, plano: Plano): number {
  return envInteiro(`${ENV_LIMITE[tipo]}${plano.toUpperCase()}`) ?? LIMITES_PLANO[tipo][plano];
}
