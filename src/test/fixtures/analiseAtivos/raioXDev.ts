/**
 * Fixtures REAIS do banco de DEV (leitura de 08/10/2026) para o Raio-X e o Essencial (Bloco D,
 * fatia A): WEGE3, ITUB4, TAEE11, CBAV3, PETR4, VALE3 (ações) e HGLG11, KNCR11, XPLG11, MXRF11
 * (FIIs). O JSON tem as linhas do Quadro, asset_per_share_yearly, asset_multiples_yearly,
 * asset_multiples_current, os períodos FY (+ o último TTM) de fundamentosVigentes e, nos FIIs,
 * fii_quarterly e fii_monthly desde 2014.
 */
import dev from './raio-x-dev.json';
import type { DadosBancoAcao, DadosBancoFii } from '@/services/analiseAtivos/leitura/ativo/raioX';
import type { FundamentosPeriodo } from '@/services/analiseAtivos/tipos';
import type { FiiTipoTela } from '@/types/analiseAtivosApi';

export const HOJE_DEV = '2026-10-08';

export const ACOES_DEV = ['WEGE3', 'ITUB4', 'TAEE11', 'CBAV3', 'PETR4', 'VALE3'] as const;
export const FIIS_DEV = ['HGLG11', 'KNCR11', 'XPLG11', 'MXRF11'] as const;

export type AcaoDev = (typeof ACOES_DEV)[number];
export type FiiDev = (typeof FIIS_DEV)[number];

interface LinhaDev {
  symbol: string;
  classe: string;
  cnpj: string;
  regua: string;
  fiiTipo: string | null;
  flags: string[];
  motivosIncompleto: string[];
  nome: string;
  paramsVersion: number;
}

const BRUTO = dev as unknown as Record<string, Record<string, unknown> & { linha: LinhaDev }>;

export function linhaDev(t: AcaoDev | FiiDev): LinhaDev {
  return BRUTO[t].linha;
}

export function dadosAcaoDev(t: AcaoDev): DadosBancoAcao {
  const b = BRUTO[t];
  return {
    financeira: b.linha.regua === 'acao_financeira',
    periodos: b.periodos as FundamentosPeriodo[],
    perShare: b.perShare as DadosBancoAcao['perShare'],
    multiplos: b.multiplos as DadosBancoAcao['multiplos'],
    atual: b.atual as DadosBancoAcao['atual'],
    flagsLinha: b.linha.flags,
    motivosLinha: b.linha.motivosIncompleto,
  };
}

export function dadosFiiDev(t: FiiDev): DadosBancoFii {
  const b = BRUTO[t];
  return {
    fiiTipo: b.linha.fiiTipo as FiiTipoTela | null,
    trimestres: b.trimestres as DadosBancoFii['trimestres'],
    meses: b.meses as DadosBancoFii['meses'],
    perShare: b.perShare as DadosBancoFii['perShare'],
    multiplos: b.multiplos as DadosBancoFii['multiplos'],
    atual: b.atual as DadosBancoFii['atual'],
    flagsLinha: b.linha.flags,
    motivosLinha: b.linha.motivosIncompleto,
  };
}
