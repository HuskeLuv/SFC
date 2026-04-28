/**
 * Projeção da próxima cobrança automática de come-cotas em fundos de
 * investimento (PF). O custodiante retém automaticamente no último dia útil
 * de maio e de novembro de cada ano — o usuário não paga DARF, mas vê o
 * impacto no patrimônio. Esta projeção é informativa.
 *
 * Regras (Lei 11.033/2004 + IN RFB 1585/2015):
 *  - Fundos de **renda fixa, multimercado, cambiais** (longo prazo) — alíquota
 *    15% sobre o rendimento desde a última cobrança/aplicação.
 *  - Fundos de **curto prazo** (carteira de prazo médio ≤ 365 dias) — 20%.
 *  - Fundos de **ações (FIA)** — NÃO têm come-cotas; tributados só no resgate.
 *  - FIIs e ETFs — NÃO têm come-cotas; regras próprias (Fase 2).
 *
 * Aproximação adotada por agora: usamos valorAplicado e valorAtualizado da
 * posição como proxy do rendimento desde a inception. Não rastreamos a data
 * da última cobrança — a primeira projeção será sobreestimada para fundos
 * antigos que já tiveram come-cotas anteriores. Quando tivermos um campo
 * `lastComeCotasAt` na posição, refinar.
 *
 * Sem I/O. Recebe posições já carregadas; retorna projeção estruturada.
 */

export type FundoTipo = 'longo-prazo' | 'curto-prazo' | 'acoes';

export interface FundoPosicao {
  symbol: string;
  nome: string;
  /** valorAplicado nominal (custo). */
  valorAplicado: number;
  /** valor atualizado de mercado (cota × qty). */
  valorAtualizado: number;
  startDate: Date;
  /** Tipo do fundo. Default longo-prazo. */
  tipo?: FundoTipo;
}

export interface ComecotasProjection {
  symbol: string;
  nome: string;
  tipo: FundoTipo;
  diasDecorridos: number;
  rendimentoEstimado: number;
  aliquota: number;
  irEstimado: number;
  /** Data da próxima cobrança (último dia útil de maio ou novembro). */
  proximaCobranca: string;
  /** True se o fundo é isento de come-cotas (FIA). */
  isentoComeCotas: boolean;
}

export interface ComecotasResult {
  fundos: ComecotasProjection[];
  /** Soma de irEstimado por mês alvo (próximo) — projeção informativa. */
  totalProximaCobranca: number;
  /** Data agregada da próxima cobrança (todos os fundos compartilham o calendário). */
  proximaCobrancaGlobal: string | null;
}

const ALIQUOTAS: Record<FundoTipo, number> = {
  'longo-prazo': 0.15,
  'curto-prazo': 0.2,
  acoes: 0, // sem come-cotas
};

/**
 * Próxima data de come-cotas a partir de hoje. Considera o último dia útil
 * de maio (31) ou novembro (30) — para simplicidade não recua para sexta
 * quando 31/05 ou 30/11 caem em fim de semana; refinar se relevante.
 */
function proximaDataComecotas(today: Date): Date {
  // Usa UTC pra evitar drift de fuso ao serializar com toISOString.
  const year = today.getUTCFullYear();
  const may = new Date(Date.UTC(year, 4, 31, 23, 59, 59)); // mês 4 = maio (0-indexed)
  const nov = new Date(Date.UTC(year, 10, 30, 23, 59, 59)); // mês 10 = novembro
  if (today.getTime() <= may.getTime()) return may;
  if (today.getTime() <= nov.getTime()) return nov;
  // Já passou novembro deste ano → próximo evento é maio do ano seguinte.
  return new Date(Date.UTC(year + 1, 4, 31, 23, 59, 59));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function projetarComecotas(
  posicoes: FundoPosicao[],
  asOfDate: Date = new Date(),
): ComecotasResult {
  const proxima = proximaDataComecotas(asOfDate);
  const proximaIso = proxima.toISOString();

  const fundos: ComecotasProjection[] = posicoes.map((p) => {
    const tipo: FundoTipo = p.tipo ?? 'longo-prazo';
    const aliquota = ALIQUOTAS[tipo];
    const isentoComeCotas = tipo === 'acoes';
    const rendimentoEstimado = Math.max(0, p.valorAtualizado - p.valorAplicado);
    const irEstimado = isentoComeCotas ? 0 : round2(rendimentoEstimado * aliquota);
    const diasDecorridos = Math.max(
      0,
      Math.floor((asOfDate.getTime() - p.startDate.getTime()) / (24 * 60 * 60 * 1000)),
    );
    return {
      symbol: p.symbol,
      nome: p.nome,
      tipo,
      diasDecorridos,
      rendimentoEstimado: round2(rendimentoEstimado),
      aliquota,
      irEstimado,
      proximaCobranca: proximaIso,
      isentoComeCotas,
    };
  });

  const totalProximaCobranca = round2(
    fundos.reduce((s, f) => s + (f.isentoComeCotas ? 0 : f.irEstimado), 0),
  );

  return {
    fundos,
    totalProximaCobranca,
    proximaCobrancaGlobal: posicoes.length > 0 ? proximaIso : null,
  };
}
