/**
 * Utilitários dos testes das regras de cálculo: carregam as fixtures reais (Fase A e banco dev) nos
 * tipos de tipos.ts.
 */
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { paraProventoBruto } from '@/services/analiseAtivos/repositorio/proventos';
import type {
  ContagemAcoes,
  EventoCorporativoBruto,
  ProventoBruto,
} from '@/services/analiseAtivos/tipos';
import acoesFaseA from './fixtures/acoes-fase-a.json';
import eventosDev from './fixtures/eventos-brutos-dev.json';
import fiiInforme from './fixtures/fii-informe-mensal.json';
import proventosDev from './fixtures/proventos-dev.json';

export const P = SCORING_PARAMS_V1;
export { acoesFaseA, fiiInforme };

type Empresa = {
  cnpj: string;
  anos: Record<string, Record<string, number | null | string>>;
  itr2T26?: { data: string; acoes_mi: number };
};

export function empresa(ticker: string): Empresa {
  return (acoesFaseA.empresas as unknown as Record<string, Empresa>)[ticker];
}

/** Contagens de fim de exercício (e o ITR 2T26 quando houver) da amostra da Fase A. */
export function contagensDe(ticker: string): ContagemAcoes[] {
  const e = empresa(ticker);
  const out: ContagemAcoes[] = Object.entries(e.anos)
    .filter(([, v]) => typeof v.acoes_mi === 'number')
    .map(([ano, v]) => ({
      cnpj: e.cnpj,
      data: `${ano}-12-31`,
      on: null,
      pn: null,
      total: Math.round((v.acoes_mi as number) * 1e6),
      fonte: 'dfp',
      razaoLpa: 1,
      status: 'ok' as const,
    }));
  if (e.itr2T26) {
    out.push({
      cnpj: e.cnpj,
      data: e.itr2T26.data,
      on: null,
      pn: null,
      total: Math.round(e.itr2T26.acoes_mi * 1e6),
      fonte: 'itr',
      razaoLpa: 1,
      status: 'ok',
    });
  }
  return out;
}

export function eventosBrutos(...symbols: string[]): EventoCorporativoBruto[] {
  return (eventosDev.eventos as EventoCorporativoBruto[]).filter((e) => symbols.includes(e.symbol));
}

/** Linhas de asset_dividend_history do dev convertidas pela convenção de params (repositório). */
export function proventosBrutos(symbol: string): ProventoBruto[] {
  return proventosDev.linhas
    .filter((l) => l.symbol === symbol)
    .map((l) =>
      paraProventoBruto(
        {
          id: l.id,
          symbol: l.symbol,
          date: new Date(`${l.date}T00:00:00Z`),
          dataCom: l.dataCom ? new Date(`${l.dataCom}T00:00:00Z`) : null,
          tipo: l.tipo,
          valorUnitario: l.valorUnitario,
          source: l.source,
        },
        P,
      ),
    );
}

export function bruto(p: Partial<ProventoBruto> & { id: string }): ProventoBruto {
  return {
    symbol: 'TEST3',
    source: 'BRAPI',
    tipo: 'DIVIDENDO',
    valor: 1,
    dataPagamento: null,
    dataExGravada: null,
    dataExOrigem: 'dataCom',
    ...p,
  };
}
