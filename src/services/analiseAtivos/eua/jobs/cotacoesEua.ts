/**
 * Job 'cotacoes-eua' (seg–sex 22:30 UTC, linha de cron COMENTADA no template até a licença). Só com
 * ANALISE_ATIVOS_EUA_PRECO_HABILITADO (e a área EUA ligada): sem a chave termina 'pulado' sem
 * chamar provedor nem banco. Com a chave: tickers vigentes do universo (listarUniversoEua) →
 * FontePrecoEua (ANALISE_EUA_PRECO_FONTE, BRAPI primeiro) → só o candle que já é fechamento
 * (≥ 16h30 em Nova York do dia do pregão) → AssetQuoteDailyUs (upsert por symbol+data).
 * Os múltiplos com preço (AssetMultiplesCurrent) são da fatia B.
 *
 * DONO: fatia A (docs/analise-ativos/stocks-reits/desenho.json).
 */
import {
  analiseAtivosEuaHabilitado,
  analiseAtivosEuaPrecoHabilitado,
} from '@/lib/analiseAtivosConfig';
import {
  ehFechamentoEua,
  fontePrecoEuaConfigurada,
  type FontePrecoEua,
} from '@/services/analiseAtivos/eua/precos/fontePrecoEua';
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { gravarCotacoesEua, listarUniversoEua } from '@/services/analiseAtivos/repositorio/eua';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import { CLASSES_EUA, type FontePrecoEuaId } from '@/types/analiseAtivosEua';

export const MOTIVO_SEM_CHAVE =
  'cotação EUA desligada (ANALISE_ATIVOS_EUA_PRECO_HABILITADO): nada consultado';

export interface DependenciasCotacoesEua {
  habilitado?: () => boolean;
  fonte?: (id: FontePrecoEuaId) => Promise<FontePrecoEua | null>;
  agora?: () => Date;
}

async function fontePadrao(id: FontePrecoEuaId): Promise<FontePrecoEua | null> {
  if (id !== 'brapi') return null;
  const { criarFonteBrapiEua } = await import('@/services/analiseAtivos/eua/precos/fonteBrapiEua');
  return criarFonteBrapiEua();
}

const LOTE = 100;

export async function sincronizarCotacoesEua(
  ctx: JobContexto,
  deps: DependenciasCotacoesEua = {},
): Promise<ResultadoJob> {
  const habilitado =
    deps.habilitado ?? (() => analiseAtivosEuaHabilitado() && analiseAtivosEuaPrecoHabilitado());
  if (!habilitado()) return { pulado: MOTIVO_SEM_CHAVE };

  const id = fontePrecoEuaConfigurada();
  const fonte = await (deps.fonte ?? fontePadrao)(id);
  if (!fonte) return { pulado: `fonte de cotação EUA '${id}' não implementada` };

  const empresas = await listarUniversoEua(ctx.prisma, CLASSES_EUA);
  const symbols = [...new Set(empresas.map((e) => e.symbol))];
  const agora = (deps.agora ?? (() => new Date()))();
  let gravadas = 0;
  let intradiarias = 0;
  let recebidas = 0;
  let parcial = false;
  for (let i = 0; i < symbols.length; i += LOTE) {
    if (ctx.estourouPrazo()) {
      parcial = true;
      break;
    }
    const cot = await fonte.cotacoes(symbols.slice(i, i + LOTE));
    recebidas += cot.length;
    const fechadas = cot.filter((c) => ehFechamentoEua(c.data, agora));
    intradiarias += cot.length - fechadas.length;
    if (ctx.aplicar) {
      gravadas += await gravarCotacoesEua(
        ctx.prisma,
        fechadas.map((c) => ({
          symbol: c.symbol,
          date: c.data,
          close: c.fechamento,
          adjClose: c.ajustado,
          volume: c.volume,
          source: fonte.id,
        })),
        agora,
      );
    }
  }
  ctx.contar('linhasLidas', recebidas);
  ctx.contar('linhasGravadas', gravadas);
  const semCotacao = symbols.length - recebidas;
  if (semCotacao > 0) {
    ctx.alertar({
      codigo: 'sem_cotacao_eua',
      nivel: 'info',
      mensagem: `${semCotacao} de ${symbols.length} tickers sem cotação na fonte ${fonte.id}`,
    });
  }
  return {
    ...(parcial ? { parcial: true } : {}),
    detalhes: { fonte: fonte.id, symbols: symbols.length, recebidas, gravadas, intradiarias },
  };
}

export async function jobCotacoesEua(
  ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return sincronizarCotacoesEua(ctx);
}
