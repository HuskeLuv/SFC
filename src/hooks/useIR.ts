import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export interface IRResumoAnual {
  year: number;
  asOf: string;
  irPorCategoria: {
    rendaVariavelBr: number;
    stocksUs: number;
    cripto: number;
    comecotas: number;
    rendaFixa: number;
    total: number;
  };
  rendimentos: {
    isentos: {
      dividendosAcoesBr: number;
      rendimentosFii: number;
      total: number;
    };
    tributacaoExclusiva: {
      jcp: number;
      total: number;
    };
    totalRecebido: number;
  };
  observacoes: string[];
}

export type IRRendaVariavelCategory = 'acao_br' | 'fii' | 'etf_br';

export interface IRMonthlyCategoryResult {
  category: IRRendaVariavelCategory;
  vendasTotal: number;
  lucroBruto: number;
  prejuizoCompensado: number;
  lucroTributavel: number;
  isento: boolean;
  motivoIsencao: string | null;
  aliquota: number;
  irDevido: number;
  saldoPrejuizoFinal: number;
}

export interface IRMonthlyApuracao {
  year: number;
  month: number;
  yearMonth: string;
  porCategoria: Partial<Record<IRRendaVariavelCategory, IRMonthlyCategoryResult>>;
  irTotalDevido: number;
}

export type IRLossPoolKey = 'rvComum' | 'fii';

export interface IRMensalResponse {
  asOf: string;
  meses: IRMonthlyApuracao[];
  saldosPrejuizoAtual: Record<IRLossPoolKey, number>;
}

export interface IRMonthlyForeignResult {
  year: number;
  month: number;
  yearMonth: string;
  vendasTotalBrl?: number;
  vendasTotal?: number;
  lucroBrutoBrl?: number;
  lucroBruto?: number;
  isento: boolean;
  motivoIsencao: string | null;
  aliquota: number;
  irDevido: number;
}

export interface IRStocksUsResponse {
  asOf: string;
  meses: Array<IRMonthlyForeignResult & { vendasTotalBrl: number; lucroBrutoBrl: number }>;
}

export interface IRCriptoResponse {
  asOf: string;
  meses: Array<IRMonthlyForeignResult & { vendasTotal: number; lucroBruto: number }>;
}

export type IRFundoTipo = 'longo-prazo' | 'curto-prazo' | 'acoes';

export interface IRComecotasFundo {
  symbol: string;
  nome: string;
  tipo: IRFundoTipo;
  diasDecorridos: number;
  rendimentoEstimado: number;
  aliquota: number;
  irEstimado: number;
  proximaCobranca: string;
  isentoComeCotas: boolean;
}

export interface IRComecotasResponse {
  asOf: string;
  fundos: IRComecotasFundo[];
  totalProximaCobranca: number;
  proximaCobrancaGlobal: string | null;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) throw new Error(`Erro ao carregar ${url}`);
  return res.json();
}

export function useIRResumoAnual(year: number) {
  return useQuery<IRResumoAnual>({
    queryKey: queryKeys.ir.resumoAnual(year),
    queryFn: ({ signal }) => fetchJson(`/api/analises/ir-resumo-anual?year=${year}`, signal),
  });
}

export function useIRMensal() {
  return useQuery<IRMensalResponse>({
    queryKey: queryKeys.ir.mensal(),
    queryFn: ({ signal }) => fetchJson('/api/analises/ir-mensal', signal),
  });
}

export function useIRStocksUs() {
  return useQuery<IRStocksUsResponse>({
    queryKey: queryKeys.ir.stocksUs(),
    queryFn: ({ signal }) => fetchJson('/api/analises/ir-stocks-us', signal),
  });
}

export function useIRCripto() {
  return useQuery<IRCriptoResponse>({
    queryKey: queryKeys.ir.cripto(),
    queryFn: ({ signal }) => fetchJson('/api/analises/ir-cripto', signal),
  });
}

export function useIRComecotas() {
  return useQuery<IRComecotasResponse>({
    queryKey: queryKeys.ir.comecotas(),
    queryFn: ({ signal }) => fetchJson('/api/analises/ir-comecotas', signal),
  });
}
