/**
 * Selo de frescor do ativo (fatia B): 'Dados: cotação B3 de 29/09 · CVM DFP 2025 / ITR 2T26 ·
 * informe FII ago/26'. A camada atrasada (painel da Fase 0) vira ícone + 'atualização em atraso'.
 * O painel é lido em cache de 10 min (uma consulta para todos os ativos).
 */
import type { PrismaClient } from '@prisma/client';
import { getTtlCache } from '@/lib/simpleTtlCache';
import { obterPainelFrescor } from '@/services/analiseAtivos/observabilidade/frescor';
import type { PainelFrescor } from '@/services/analiseAtivos/regras/eventos/alertasFrescor';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { Camada } from '@/services/analiseAtivos/tipos';
import type { ClasseQuadro, FrescorAtivo } from '@/types/analiseAtivosApi';

export const TTL_PAINEL_FRESCOR_MS = 10 * 60_000;
const cachePainel = getTtlCache<PainelFrescor>('analiseFrescorPainel');

/** Painel de frescor da Fase 0 em cache de 10 min; falha = null (o selo sai sem o aviso). */
export async function painelFrescorEmCache(prisma: PrismaClient): Promise<PainelFrescor | null> {
  const emCache = cachePainel.get('painel');
  if (emCache) return emCache;
  try {
    const painel = await obterPainelFrescor(prisma);
    cachePainel.set('painel', painel, TTL_PAINEL_FRESCOR_MS);
    return painel;
  } catch {
    return null;
  }
}

const CAMADAS_POR_CLASSE: Record<ClasseQuadro, Camada[]> = {
  acao: ['cotacoes', 'fundamentos_dfp', 'fundamentos_itr', 'scores'],
  fii: ['cotacoes', 'fii_mensal', 'scores'],
};

export interface EntradaFrescor {
  classe: ClasseQuadro;
  precoData: string | null;
  /** último ano fiscal com DFP */
  dfpAno: number | null;
  /** último ITR (ano e trimestre) posterior à DFP */
  itr: { ano: number; trimestre: number } | null;
  /** último informe mensal do FII (AAAA-MM-DD) */
  fiiMes: string | null;
  painel: PainelFrescor | null;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function montarFrescor(e: EntradaFrescor): FrescorAtivo {
  const t = TEXTOS_TELA.ativo.frescor;
  const cotacao = e.precoData
    ? formatarTexto(t.cotacao, { data: `${e.precoData.slice(8, 10)}/${e.precoData.slice(5, 7)}` })
    : null;
  let fundamentos: string | null = null;
  if (e.classe === 'acao' && e.dfpAno !== null) {
    fundamentos =
      e.itr && e.itr.ano * 10 + e.itr.trimestre > e.dfpAno * 10 + 4
        ? formatarTexto(t.fundamentosDfpItr, {
            ano: e.dfpAno,
            valor: `${e.itr.trimestre}T${String(e.itr.ano).slice(2)}`,
          })
        : formatarTexto(t.fundamentosDfp, { ano: e.dfpAno });
  }
  const fii =
    e.classe === 'fii' && e.fiiMes
      ? formatarTexto(t.fii, {
          data: `${MESES[Number(e.fiiMes.slice(5, 7)) - 1]}/${e.fiiMes.slice(2, 4)}`,
        })
      : null;
  const atrasadas = new Set(e.painel?.atrasadas ?? []);
  return {
    cotacao,
    fundamentos,
    fii,
    painelAtrasado: CAMADAS_POR_CLASSE[e.classe].some((c) => atrasadas.has(c)),
  };
}
