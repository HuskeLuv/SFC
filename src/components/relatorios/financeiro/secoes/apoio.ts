/**
 * Apoio das seções 4 a 8: ganchos dos cadeados (só com dado que o plano já tem) e pequenos
 * formatadores. Puro e sem textos de plano: vai para o chunk de todos os planos.
 */
import type {
  BlocoOrcamento,
  CategoriaOrcamentoRelatorio,
  ChaveClasseCarteira,
  MesOrcamentoRelatorio,
  StatusSemaforo,
} from '@/types/relatorioFinanceiro';
import { CORES } from '../cores';
import { soma } from '../formato';

/** Planejamento Financeiro (dinheiro dos sonhos) fica fora dos gastos (decisão 2). */
function ehPlanejamento(c: CategoriaOrcamentoRelatorio): boolean {
  return /^planejamento/i.test(c.chave) || /^planejamento/i.test(c.nome);
}

/** Gasto realizado do mês, sem Planejamento Financeiro. */
export function gastoDoMes(m: MesOrcamentoRelatorio): number {
  return soma(m.categorias.filter((c) => !ehPlanejamento(c)).map((c) => c.realizado));
}

/** Sobra do período pelo realizado: Σ receita − Σ gastos lançados. */
export function sobraDoPeriodo(orcamento: BlocoOrcamento): number {
  return soma(orcamento.meses.map((m) => m.receita - gastoDoMes(m)));
}

/**
 * Índice de poupança (%) dos meses FECHADOS do período (a mesma base do indicador da seção 7).
 * null sem mês fechado com receita (com n=1 o período só tem o mês corrente).
 */
export function poupancaDosFechados(orcamento: BlocoOrcamento): number | null {
  const fechados = orcamento.meses.filter((m) => m.fechado);
  const receita = soma(fechados.map((m) => m.receita));
  if (receita <= 0) return null;
  return ((receita - soma(fechados.map(gastoDoMes))) / receita) * 100;
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. */
export function dataBr(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Cores da rosca por classe (as do protótipo; 'Outros' em cinza). */
export const COR_CLASSE: Record<ChaveClasseCarteira, string> = {
  rendaFixa: CORES.blue,
  tesouro: CORES.b6,
  acoes: CORES.navy,
  fiis: CORES.gold,
  exterior: CORES.b4,
  reits: CORES.b2,
  outros: CORES.grey,
};

/** Rótulos do semáforo (seção 7). */
export const ROTULO_STATUS: Record<StatusSemaforo, string> = {
  good: 'Saudável',
  warn: 'Atenção',
  bad: 'Alerta',
};

/** R$ em milhões com 1 casa ('R$ 5,0 mi'); abaixo de 1 milhão, R$ sem casas. */
export function fMi(v: number): string {
  if (Math.abs(v) < 1e6) {
    return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  }
  return (
    'R$ ' +
    (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) +
    ' mi'
  );
}

/** "mês"/"meses". */
export const meses = (n: number) => `${n} ${n > 1 ? 'meses' : 'mês'}`;
