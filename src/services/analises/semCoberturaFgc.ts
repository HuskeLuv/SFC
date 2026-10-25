/**
 * "Fora do FGC" da aba Cobertura FGC (ClickUp 86e2vvde3): o que a carteira tem SEM a proteção
 * do Fundo Garantidor, agrupado por classe, para o cliente ver o risco da carteira inteira e não
 * só da renda fixa bancária.
 *
 * Puro: sem I/O. A rota valora cada item (valuatePortfolioItem / pricer do Tesouro) e entrega
 * a categoria e o valor atual em R$.
 */

import type { CategoriaCarteira } from '@/services/portfolio/itemValuation';

/** Categorias da carteira + Tesouro Direto (que na carteira cai em rendaFixaFundos). */
export type ClasseSemCobertura = CategoriaCarteira | 'tesouroDireto';

export interface ItemSemCobertura {
  classe: ClasseSemCobertura;
  valorAtual: number;
}

export interface ClasseSemCoberturaResumo {
  classe: ClasseSemCobertura;
  rotulo: string;
  /** Garantia ou proteção que não é o FGC (ex.: Tesouro Nacional); null = nenhuma. */
  nota: string | null;
  valor: number;
  quantidadeAtivos: number;
}

export interface SemCoberturaFgc {
  classes: ClasseSemCoberturaResumo[];
  /** Soma das classes fora do FGC. */
  total: number;
  /** Renda fixa coberta (até os limites) + não coberta + classes fora do FGC. */
  totalInvestimentos: number;
  /** Renda fixa sem cobertura (produto não coberto ou acima do limite) + classes fora do FGC. */
  totalSemProtecao: number;
  /** totalSemProtecao / totalInvestimentos, em %. */
  percentualSemProtecao: number;
}

const ROTULOS: Record<ClasseSemCobertura, string> = {
  tesouroDireto: 'Tesouro Direto',
  rendaFixaFundos: 'Fundos de renda fixa',
  fimFia: 'Fundos (FIM/FIA)',
  fiis: 'Fundos imobiliários',
  acoes: 'Ações',
  stocks: 'Stocks (EUA)',
  reits: 'REITs',
  etfs: 'ETFs',
  moedasCriptos: 'Moedas e criptoativos',
  previdenciaSeguros: 'Previdência e seguros',
  opcoes: 'Opções',
  reservaEmergencia: 'Reserva de emergência (outros produtos)',
  reservaOportunidade: 'Reserva de oportunidade (outros produtos)',
  imoveisBens: 'Imóveis e bens',
};

const NOTAS: Partial<Record<ClasseSemCobertura, string>> = {
  tesouroDireto: 'Garantido pelo Tesouro Nacional, não pelo FGC.',
  previdenciaSeguros:
    'Patrimônio separado da seguradora/gestora (fiscalizado pela Susep), não pelo FGC.',
  rendaFixaFundos: 'Patrimônio do fundo é separado do da gestora; o risco é dos ativos do fundo.',
  fimFia: 'Patrimônio do fundo é separado do da gestora; o risco é dos ativos do fundo.',
  fiis: 'Patrimônio do fundo é separado do da gestora; o risco é dos ativos do fundo.',
};

const arred = (v: number): number => Math.round(v * 100) / 100;

export function resumirSemCobertura(
  itens: ItemSemCobertura[],
  rendaFixa: { totalValor: number; totalEfetivamenteCoberto: number },
): SemCoberturaFgc {
  const porClasse = new Map<ClasseSemCobertura, { valor: number; quantidade: number }>();
  for (const item of itens) {
    if (!(item.valorAtual > 0)) continue;
    const atual = porClasse.get(item.classe) ?? { valor: 0, quantidade: 0 };
    atual.valor += item.valorAtual;
    atual.quantidade += 1;
    porClasse.set(item.classe, atual);
  }

  const classes = Array.from(porClasse.entries())
    .map(([classe, { valor, quantidade }]) => ({
      classe,
      rotulo: ROTULOS[classe],
      nota: NOTAS[classe] ?? null,
      valor: arred(valor),
      quantidadeAtivos: quantidade,
    }))
    .sort((a, b) => b.valor - a.valor);

  const total = classes.reduce((s, c) => s + c.valor, 0);
  const rendaFixaSemProtecao = Math.max(
    0,
    rendaFixa.totalValor - rendaFixa.totalEfetivamenteCoberto,
  );
  const totalInvestimentos = rendaFixa.totalValor + total;
  const totalSemProtecao = rendaFixaSemProtecao + total;

  return {
    classes,
    total: arred(total),
    totalInvestimentos: arred(totalInvestimentos),
    totalSemProtecao: arred(totalSemProtecao),
    percentualSemProtecao:
      totalInvestimentos > 0 ? arred((totalSemProtecao / totalInvestimentos) * 100) : 0,
  };
}
