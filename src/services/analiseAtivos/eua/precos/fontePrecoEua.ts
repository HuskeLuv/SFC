/**
 * Interface ÚNICA da cotação EUA (Stocks e REITs, fatia A) — só usada com
 * ANALISE_ATIVOS_EUA_PRECO_HABILITADO (decisão do Wellington de 17/10: Análise EUA sem preço até a
 * licença de exibição; a Carteira não depende disto e continua como está).
 *
 * - O provedor vem de ANALISE_EUA_PRECO_FONTE=brapi|eodhd|twelvedata (padrão brapi), sem migration;
 *   hoje só a BRAPI (plano pago já contratado, a mesma fonte da Carteira) está implementada — as
 *   outras devolvem null e o job termina 'pulado'.
 * - O candle só vale como FECHAMENTO depois das 16h30 de Nova York do próprio dia (o pregão fecha às
 *   16h; folga para o leilão/ajustes). Antes disso a cotação é intradiária e não é gravada.
 */
import {
  ENV_FONTE_PRECO_EUA,
  FONTES_PRECO_EUA,
  type FontePrecoEuaId,
} from '@/types/analiseAtivosEua';

export interface CotacaoEua {
  /** forma da Análise (BRK.B) */
  symbol: string;
  /** dia do pregão em Nova York (AAAA-MM-DD) */
  data: string;
  fechamento: number;
  ajustado: number | null;
  volume: number | null;
  /** instante da cotação (ISO, UTC) */
  momento: string;
}

export interface FontePrecoEua {
  id: FontePrecoEuaId;
  /** Cotações mais recentes dos símbolos (forma da Análise); símbolo sem cotação fica de fora. */
  cotacoes(symbols: readonly string[]): Promise<CotacaoEua[]>;
}

/** Provedor configurado (valor desconhecido = 'brapi'). */
export function fontePrecoEuaConfigurada(env: NodeJS.ProcessEnv = process.env): FontePrecoEuaId {
  const v = env[ENV_FONTE_PRECO_EUA]?.trim().toLowerCase();
  return (FONTES_PRECO_EUA as readonly string[]).includes(v ?? '')
    ? (v as FontePrecoEuaId)
    : 'brapi';
}

const FUSO_NY = 'America/New_York';

/** Data e hora (minutos desde 0h) de um instante no fuso de Nova York. */
export function dataHoraNovaYork(instante: Date): { data: string; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_NY,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '00';
  return {
    data: `${p('year')}-${p('month')}-${p('day')}`,
    minutos: Number(p('hour')) * 60 + Number(p('minute')),
  };
}

/** 16h30 em Nova York. */
export const MINUTOS_FECHAMENTO_NY = 16 * 60 + 30;

/**
 * O candle do dia `dataPregao` (Nova York) já é fechamento em `agora`? Sim se `agora` está num dia
 * posterior em Nova York, ou no mesmo dia a partir das 16h30.
 */
export function ehFechamentoEua(dataPregao: string, agora: Date): boolean {
  const ny = dataHoraNovaYork(agora);
  if (ny.data > dataPregao) return true;
  return ny.data === dataPregao && ny.minutos >= MINUTOS_FECHAMENTO_NY;
}
