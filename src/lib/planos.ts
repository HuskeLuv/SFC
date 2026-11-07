/**
 * Planos do My Finance (Basic, Pro, Advanced): acesso de cada bloco do Relatório financeiro,
 * preços (espelho do Stripe) e limites. Os textos da matriz de /planos ficam em planosMatriz.ts.
 *
 * Puro: usado pelo backend (resolverPlano, montarRelatorio) e pelo front (cadeados, sumário).
 * Quem decide o plano de um usuário é só `planoDoUsuario` (src/services/planos/resolverPlano.ts);
 * o front lê `relatorio.plano` (ou /api/assinaturas/me) e chama `temAcesso`.
 */
import type { BlocoBloqueavel, RelatorioFinanceiro } from '@/types/relatorioFinanceiro';

export type Plano = 'basic' | 'pro' | 'adv';

export const PLANOS: readonly Plano[] = ['basic', 'pro', 'adv'] as const;

export const RANK: Record<Plano, number> = { basic: 0, pro: 1, adv: 2 };

export const NOME_PLANO: Record<Plano, string> = { basic: 'Basic', pro: 'Pro', adv: 'Advanced' };

/** Planos vendidos no Stripe (o Basic é grátis e fica fora do Stripe). */
export type PlanoPago = Exclude<Plano, 'basic'>;

export const PLANOS_PAGOS: readonly PlanoPago[] = ['pro', 'adv'] as const;

/** Ciclo de cobrança da assinatura. */
export type Intervalo = 'mes' | 'ano';

export function ehPlano(v: unknown): v is Plano {
  return v === 'basic' || v === 'pro' || v === 'adv';
}

export function ehPlanoPago(v: unknown): v is PlanoPago {
  return v === 'pro' || v === 'adv';
}

export function ehIntervalo(v: unknown): v is Intervalo {
  return v === 'mes' || v === 'ano';
}

/** O maior dos planos (Basic quando a lista vem vazia ou só com nulos). */
export function maxPlano(...planos: Array<Plano | null | undefined>): Plano {
  let melhor: Plano = 'basic';
  for (const p of planos) {
    if (p && RANK[p] > RANK[melhor]) melhor = p;
  }
  return melhor;
}

/** true quando `plano` libera o que exige `need`. */
export function temAcesso(plano: Plano, need: Plano): boolean {
  return RANK[plano] >= RANK[need];
}

/** Plano mínimo de cada bloco bloqueável do relatório (matriz do Pedro). */
export const ACESSO_BLOCOS: Record<BlocoBloqueavel, Exclude<Plano, 'basic'>> = {
  carteira: 'pro',
  planejamento: 'pro',
  sonhos: 'pro',
  carteiraAvancada: 'adv',
  saude: 'adv',
  ir: 'adv',
};

/**
 * Preços em centavos de BRL: espelho do que mora no Stripe (os IDs dos Prices ficam no env,
 * src/lib/assinaturasConfig.ts). TUDO É PROPOSTA para o Pedro. O desconto do anual é ancorado em
 * 12 mensalidades (nada de "de/por" com preço nunca praticado, CDC arts. 31 e 37).
 *  - mensalCentavos: preço do mensal, à venda pelo valor cheio desde o primeiro dia.
 *  - anualCentavos: anual fora da Black Friday (= 12 mensalidades).
 *  - cupomOfertaCentavos: amount_off do cupom da Black Friday (duration 'once', só no 1º ano).
 *  - anualOfertaCentavos: anual no 1º ano com o cupom (= anual − cupom).
 */
export interface PrecoPlano {
  mensalCentavos: number;
  anualCentavos: number;
  cupomOfertaCentavos: number;
  anualOfertaCentavos: number;
}

export const PRECOS_PLANOS: Record<PlanoPago, PrecoPlano> = {
  pro: {
    mensalCentavos: 4990,
    anualCentavos: 59880,
    cupomOfertaCentavos: 11976,
    anualOfertaCentavos: 47904,
  },
  adv: {
    mensalCentavos: 14290,
    anualCentavos: 171480,
    cupomOfertaCentavos: 51600,
    anualOfertaCentavos: 119880,
  },
};

/** 'R$ 1.198,80' a partir de centavos (sem Intl: o mesmo texto no servidor e no navegador). */
export function formatarReais(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.round(Math.abs(centavos));
  const inteiro = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const resto = (abs % 100).toString().padStart(2, '0');
  return `${negativo ? '−' : ''}R$ ${inteiro},${resto}`;
}

/** Quanto o anual da oferta custa a menos que 12 mensalidades, em % (ex.: 20, 30.09). */
export function descontoOfertaPct(plano: PlanoPago): number {
  const p = PRECOS_PLANOS[plano];
  const doze = p.mensalCentavos * 12;
  return Math.round(((doze - p.anualOfertaCentavos) / doze) * 10000) / 100;
}

/** Valor mensal equivalente do anual da oferta, em centavos (ex.: 3992). */
export function equivalenteMensalOferta(plano: PlanoPago): number {
  return Math.round(PRECOS_PLANOS[plano].anualOfertaCentavos / 12);
}

/**
 * Limites por plano (proposta aprovada em 07/11; ajustáveis por env sem deploy em
 * src/lib/assinaturasConfig.ts). Valem SÓ com ASSINATURAS_HABILITADAS ligada: desligada,
 * conexões sem limite e a IA com o ASSISTENTE_LIMITE_MENSAL de hoje.
 *  - ia: mensagens do Assistente por mês (sempre ≤ ASSISTENTE_LIMITE_MENSAL).
 *  - conexoes: conexões Open Finance (Pluggy) ativas.
 */
export const LIMITES_PLANO: { ia: Record<Plano, number>; conexoes: Record<Plano, number> } = {
  ia: { basic: 30, pro: 100, adv: 300 },
  conexoes: { basic: 1, pro: 3, adv: 6 },
};

/**
 * Texto da oferta da Black Friday no cartão de upgrade. Sem "12x": a assinatura anual é cobrada
 * de uma vez ("R$ 479,04/ano, equivale a R$ 39,92 por mês. Pago de uma vez no cartão"). Um teste
 * confere estes textos contra PRECOS_PLANOS.
 */
export interface OfertaPlano {
  /** Desconto do anual em relação a 12 mensalidades, arredondado ('20%'). */
  desconto: string;
  /** Preço do anual no 1º ano ('R$ 479,04/ano'). */
  anual: string;
  /** Equivalente mensal do anual da oferta ('R$ 39,92 por mês'). */
  equivalente: string;
}

/** Ofertas do cartão de upgrade (Black Friday). Depois da validade: só "Conhecer o {plano}". */
export const OFERTAS_PLANOS: {
  pro: OfertaPlano;
  adv: OfertaPlano;
  /** Último dia da oferta, 'YYYY-MM-DD' (data em São Paulo). */
  validade: string;
  url: string;
  /** Texto da URL no cartão. */
  urlTexto: string;
} = {
  pro: { desconto: '20%', anual: 'R$ 479,04/ano', equivalente: 'R$ 39,92 por mês' },
  adv: { desconto: '30%', anual: 'R$ 1.198,80/ano', equivalente: 'R$ 99,90 por mês' },
  validade: '2026-12-05',
  url: 'https://appmyfinance.com.br/planos',
  urlTexto: 'appmyfinance.com.br/planos',
};

/** Data 'YYYY-MM-DD' em São Paulo (UTC−3 fixo). */
export function dataEmSaoPaulo(agora: Date): string {
  return new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A oferta ainda vale em `agora` (até o fim do dia da validade, em SP)? */
export function ofertaVigente(agora: Date): boolean {
  return dataEmSaoPaulo(agora) <= OFERTAS_PLANOS.validade;
}

/**
 * Máscara do cadeado: zera os blocos que o plano não libera e o irGancho no Advanced.
 * O montador já não calcula o que está bloqueado; isto repete no fim (defesa dupla) e serve ao
 * modo demonstração do front.
 */
export function aplicarCadeado(relatorio: RelatorioFinanceiro, plano: Plano): RelatorioFinanceiro {
  const libera = (b: BlocoBloqueavel) => temAcesso(plano, ACESSO_BLOCOS[b]);
  return {
    ...relatorio,
    plano,
    carteira: libera('carteira') ? relatorio.carteira : null,
    carteiraAvancada: libera('carteiraAvancada') ? relatorio.carteiraAvancada : null,
    planejamento: libera('planejamento') ? relatorio.planejamento : null,
    sonhos: libera('sonhos') ? relatorio.sonhos : null,
    saude: libera('saude') ? relatorio.saude : null,
    ir: libera('ir') ? relatorio.ir : null,
    irGancho: temAcesso(plano, 'adv') ? null : relatorio.irGancho,
  };
}
