/**
 * Planos do My Finance (Basic, Pro, Advanced) e o acesso de cada bloco do Relatório financeiro.
 *
 * Puro: usado pelo backend (resolverPlano, montarRelatorio) e pelo front (cadeados, sumário).
 * Quem decide o plano de um usuário é só `planoDoUsuario` (src/services/planos/resolverPlano.ts);
 * o front lê `relatorio.plano` e chama `temAcesso`.
 */
import type { BlocoBloqueavel, RelatorioFinanceiro } from '@/types/relatorioFinanceiro';

export type Plano = 'basic' | 'pro' | 'adv';

export const PLANOS: readonly Plano[] = ['basic', 'pro', 'adv'] as const;

export const RANK: Record<Plano, number> = { basic: 0, pro: 1, adv: 2 };

export const NOME_PLANO: Record<Plano, string> = { basic: 'Basic', pro: 'Pro', adv: 'Advanced' };

export function ehPlano(v: unknown): v is Plano {
  return v === 'basic' || v === 'pro' || v === 'adv';
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

export interface OfertaPlano {
  desconto: string;
  parcelas: string;
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
  pro: { desconto: '20%', parcelas: '12x de R$ 39,92' },
  adv: { desconto: '30%', parcelas: '12x de R$ 99,90' },
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
