/**
 * Job fiagro-mensal: Informe Mensal de Fiagro (CVM, FIAGRO/DOC/INF_MENSAL, um zip por mês desde
 * 202505) ⇒ FiiMonthly, para os CNPJs do FiiTickerMap com tipoFundo FIAGRO. Mesmo núcleo do
 * fii-mensal (processarMesesFii: saneamento, tipo, histerese, régua) com:
 * - tipo forçado a 'papel' (comFundosPapel): decisão de produto de 04/11/2026 — Fiagro é analisado
 *   como FII de papel, só muda o lastro (CRA/LCA); override manual do CNPJ continua valendo;
 * - segmentoCvm = 'Fiagro' (o informe não tem segmento; vira o rótulo e a faceta do Quadro);
 * - o informe de Fiagro é a fonte oficial desde a CVM 175: o mês gravado antes pelo informe de FII
 *   (mesmo CNPJ, até mai–ago/2025) é sobrescrito sem comparar versões (existentesDeOutraFonte), e o
 *   fii-mensal nunca sobrescreve o que este job gravou (ehFonteDedicada).
 *
 * Cron: os 3 meses anteriores ao corrente (o do mês M sai em M+1/M+2; 404 = ainda não publicado),
 * condicional por ETag/sha256. Backfill (`meses`): todos desde 202505, sem condicional.
 * Sem informe trimestral de Fiagro: vacância/imóveis/CRIs do trimestral ficam sem dado.
 */
import path from 'path';
import { fiiOverrides } from '@/services/analiseAtivos/repositorio/fii';
import { mesesRecentes, obterArquivo } from '@/services/analiseAtivos/fii/fiiArquivos';
import {
  cnpjsDoMapa,
  comFundosPapel,
  ehFonteDedicada,
  existentesDeOutraFonte,
  gravarMensal,
  lerMensalGravado,
  type ResultadoGravacao,
} from '@/services/analiseAtivos/fii/gravarFii';
import {
  PRIMEIRO_MES_FIAGRO,
  lerInformeFiagroZip,
  urlInformeFiagro,
} from '@/services/analiseAtivos/fii/parserInformeFiagro';
import {
  AgregadorAlertas,
  processarMesesFii,
} from '@/services/analiseAtivos/fii/sincronizarFiiMensal';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const JOB_FIAGRO_MENSAL = 'fiagro-mensal';
/** Meses relidos pelo cron (anteriores ao corrente). */
export const MESES_CRON_FIAGRO = 3;

export interface OpcoesFiagroMensal {
  /** meses 'AAAA-MM-01' (backfill); padrão: os 3 anteriores ao corrente */
  meses?: string[];
  cacheDir?: string;
  /** false ⇒ baixa sem condicional (backfill) */
  condicional?: boolean;
  /** restringe a estes CNPJs (padrão: os FIAGRO do FiiTickerMap) */
  cnpjs?: string[];
}

function somarMeses(ref: string, n: number): string {
  const [a, m] = ref.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
}

/** Todos os meses de 202505 até o anterior ao de `hoje` (backfill). */
export function mesesDesdeInicioFiagro(hoje: string): string[] {
  const fim = mesesRecentes(hoje, 2)[1];
  const out: string[] = [];
  for (let m = PRIMEIRO_MES_FIAGRO; m <= fim; m = somarMeses(m, 1)) out.push(m);
  return out;
}

const daFonteFiagro = (sourceUrl: string) => /\/dados\/FIAGRO\//.test(sourceUrl);

export async function sincronizarFiagroMensal(
  ctx: JobContexto,
  opts: OpcoesFiagroMensal = {},
): Promise<ResultadoJob> {
  const cnpjs = opts.cnpjs ?? (await cnpjsDoMapa(ctx.prisma, ['FIAGRO']));
  if (cnpjs.length === 0) {
    ctx.alertar({
      codigo: 'fiagro_mapa_vazio',
      nivel: 'aviso',
      mensagem: 'nenhum Fiagro no FiiTickerMap: rode fii-cadastro antes (listas B3)',
    });
    return { detalhes: { cnpjs: 0 } };
  }
  const filtro = new Set(cnpjs);
  const meses = (opts.meses ?? mesesRecentes(ctx.hoje, MESES_CRON_FIAGRO + 1).slice(1)).filter(
    (m) => m >= PRIMEIRO_MES_FIAGRO,
  );
  // mais antigo primeiro: a histerese/saneamento do mês leem o anterior já gravado
  meses.sort();
  const overrides = comFundosPapel(await fiiOverrides(ctx.prisma), cnpjs);
  const arquivos: Array<Record<string, unknown>> = [];
  const total: ResultadoGravacao = { criadas: 0, atualizadas: 0, iguais: 0, versaoMenor: 0 };
  const agregador = new AgregadorAlertas(ctx.alertar);
  let parcial = false;

  for (const ref of meses) {
    if (ctx.estourouPrazo()) {
      parcial = true;
      break;
    }
    const url = urlInformeFiagro(ref);
    const arq = await obterArquivo(ctx.prisma, url, {
      cacheDir: opts.cacheDir,
      condicional: opts.condicional,
      aplicar: ctx.aplicar,
      naoPublicadoSe404: true,
    });
    try {
      if (arq.status === 'nao_modificado' || arq.status === 'nao_publicado' || !arq.caminho) {
        arquivos.push({ url, status: arq.status });
        continue;
      }
      const lido = await lerInformeFiagroZip(arq.caminho, {
        arquivo: path.basename(url),
        cnpjs: filtro,
      });
      ctx.contar('linhasLidas', lido.linhasLidas);
      ctx.contar('rejeitadas', lido.rejeitadas);
      const doMes = lido.meses.filter((m) => m.refMonth === ref);
      const fora = lido.meses.length - doMes.length;
      if (fora > 0) {
        agregador.add({
          codigo: 'fiagro_mes_inesperado',
          nivel: 'aviso',
          mensagem: `${path.basename(url)}: ${fora} linhas de outro mês ignoradas`,
        });
      }
      const gravados =
        doMes.length > 0
          ? await lerMensalGravado(
              ctx.prisma,
              [...new Set(doMes.map((m) => m.cnpj))],
              somarMeses(ref, -(ctx.params.fiiTipo.mesesHisterese + 1)),
              ref,
            )
          : new Map();
      const { linhas, alertas } = processarMesesFii(doMes, gravados, overrides, ctx.params, {
        todosOsMeses: true,
        sourceUrl: url,
      });
      alertas.forEach(agregador.add);
      const g = await gravarMensal(
        ctx.prisma,
        linhas,
        existentesDeOutraFonte(gravados, daFonteFiagro),
        ctx.aplicar,
      );
      ctx.contar('linhasGravadas', g.criadas + g.atualizadas);
      for (const k of Object.keys(total) as Array<keyof ResultadoGravacao>) total[k] += g[k];
      const sobreFii = linhas.filter((l) => {
        const e = gravados.get(`${l.cnpj}|${l.refMonth}`);
        return e && !daFonteFiagro(e.sourceUrl) && !ehFonteDedicada(e.sourceUrl);
      }).length;
      arquivos.push({
        url,
        status: arq.status,
        bytes: arq.bytes,
        cnpjs: doMes.length,
        sobreInformeFii: sobreFii,
        ...g,
      });
      if (ctx.aplicar) await arq.concluir(JOB_FIAGRO_MENSAL);
    } finally {
      await arq.descartar();
    }
  }

  agregador.fechar();
  return { parcial, detalhes: { meses, cnpjsUniverso: cnpjs.length, arquivos, gravacao: total } };
}
