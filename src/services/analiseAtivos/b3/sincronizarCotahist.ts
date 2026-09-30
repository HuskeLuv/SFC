/**
 * Job 'cotahist' (cron seg–sex 23:05 UTC + repescagem ter–sáb 09:55 UTC).
 *
 * 1. Lacunas: dos últimos `sanidade.b3.cotahistRecuperarPregoes` (5) pregões B3 até hoje
 *    (regras/comum/pregoes — 20/11 desde 2024 e Carnaval não são pregão), os que não têm nenhuma
 *    linha em asset_quotes_daily.
 * 2. Para cada lacuna baixa COTAHIST_D{DDMMAAAA}.ZIP (~0,5–2 MB), lê em streaming e grava só
 *    TPMERC 010 com BDI 02/12. 404 = ainda não publicado: info no dia e no seguinte; aviso quando o
 *    pregão já tem 2+ pregões (a B3 publica ~20h30 BRT do próprio dia).
 * 3. Recalcula AssetQuoteResumo: 1 consulta dos últimos 30 pregões gravados (todos os símbolos),
 *    liquidez de 21 pregões (regra 29), negociado nos últimos 30 (decisão 14) e salto > 40% sem
 *    evento no último pregão (regra 30; eventos brutos só para NÃO marcar, sem validar).
 *
 * Idempotente: pregão já gravado não é rebaixado; @@id (symbol, date) + skipDuplicates.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  LIMITES_B3,
  nomeCotahistDiario,
  obterArquivoB3,
  urlCotahistDiario,
} from '@/services/analiseAtivos/b3/b3Arquivos';
import {
  lerCotahistZip,
  novaEstatistica,
  type EstatisticaCotahist,
} from '@/services/analiseAtivos/b3/cotahistStream';
import {
  GravadorCotacoes,
  datasComCotacao,
  gravarResumo,
  ultimaDataCotacao,
  type LinhaResumo,
} from '@/services/analiseAtivos/b3/gravarB3';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import { liquidez } from '@/services/analiseAtivos/regras/b3/liquidez';
import {
  detectarSaltoDiario,
  type SaltoDiario,
} from '@/services/analiseAtivos/regras/b3/saltoDiario';
import { pregoesEntre } from '@/services/analiseAtivos/regras/comum/pregoes';
import {
  marcarProcessado,
  registrarDownload,
} from '@/services/analiseAtivos/repositorio/fontesArquivo';
import { paraData } from '@/services/analiseAtivos/repositorio/conversao';
import { eventosCorporativosBrutos } from '@/services/analiseAtivos/repositorio/proventos';
import type {
  AlertaJob,
  JobContexto,
  ResultadoJob,
  ScoringParams,
} from '@/services/analiseAtivos/tipos';

const DIA_MS = 24 * 60 * 60 * 1000;
/** Máximo de alertas individuais de salto por run (o resto vai num resumo). */
const MAX_ALERTAS_SALTO = 20;

function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T00:00:00.000Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Últimos `n` pregões B3 até `ate` (inclusive), em ordem crescente. */
export function ultimosPregoes(ate: string, n: number): string[] {
  if (n <= 0) return [];
  // 2× + 15 dias corridos cobre feriados emendados (Carnaval, fim de ano)
  return pregoesEntre(somarDias(ate, -(2 * n + 15)), ate).slice(-n);
}

/** Pregões que faltam em asset_quotes_daily entre os últimos `n` até hoje. */
export async function pregoesSemCotacao(
  prisma: PrismaClient,
  hoje: string,
  n: number,
): Promise<string[]> {
  const candidatos = ultimosPregoes(hoje, n);
  const presentes = await datasComCotacao(prisma, candidatos);
  return candidatos.filter((d) => !presentes.has(d));
}

export interface OpcoesArquivoCotahist {
  url: string;
  nome: string;
  maxBytes: number;
  timeoutMs: number;
  cacheDir?: string | string[] | null;
  aceitarDataBruta?: (aaaammdd: string) => boolean;
  /** job gravado em AnaliseFonteArquivo.jobUltimo */
  job: string;
}

export interface ResultadoArquivoCotahist {
  status: 'gravado' | 'nao_publicado';
  estat: EstatisticaCotahist;
  gravadas: number;
  enviadas: number;
  bytes: number;
  doCache: boolean;
}

/**
 * Baixa (ou pega do cache), lê e grava um arquivo COTAHIST. 404 ⇒ 'nao_publicado' (o chamador
 * decide o nível do alerta). Usado pelo cron (diário) e pelo backfill (anual).
 */
export async function processarArquivoCotahist(
  ctx: Pick<JobContexto, 'prisma' | 'aplicar' | 'contar'>,
  o: OpcoesArquivoCotahist,
): Promise<ResultadoArquivoCotahist> {
  const estat = novaEstatistica();
  let arq;
  try {
    arq = await obterArquivoB3(o.url, {
      maxBytes: o.maxBytes,
      timeoutMs: o.timeoutMs,
      cacheDir: o.cacheDir,
      nomeCache: o.nome,
    });
  } catch (e: unknown) {
    if (e instanceof ErroFonte && e.codigo === 'http_erro' && e.httpStatus === 404) {
      return { status: 'nao_publicado', estat, gravadas: 0, enviadas: 0, bytes: 0, doCache: false };
    }
    throw e;
  }
  try {
    if (!arq.caminho) throw new ErroFonte('http_erro', `${o.nome}: download sem arquivo`);
    // arquivo do cache também é registrado: o backfill retoma por processadoEm
    if (ctx.aplicar) {
      await registrarDownload(ctx.prisma, o.url, {
        etag: arq.etag,
        lastModified: arq.lastModified,
        bytes: arq.bytes,
        sha256: arq.sha256,
      });
    }
    const gravador = new GravadorCotacoes(ctx.prisma, ctx.aplicar);
    try {
      for await (const r of lerCotahistZip(arq.caminho, {
        arquivo: o.nome,
        aceitarDataBruta: o.aceitarDataBruta,
        estat,
      })) {
        await gravador.adicionar(r);
      }
      await gravador.descarregar();
    } catch (e: unknown) {
      // falha da fonte (trailer, zip): as linhas já lidas são íntegras — grava o lote pendente e
      // deixa o arquivo SEM processadoEm, para a próxima execução reprocessar (skipDuplicates)
      if (e instanceof ErroFonte) await gravador.descarregar().catch(() => {});
      throw e;
    } finally {
      ctx.contar('linhasLidas', estat.emitidos);
      ctx.contar('linhasGravadas', gravador.gravadas);
      ctx.contar('rejeitadas', estat.rejeitados);
    }
    if (ctx.aplicar) await marcarProcessado(ctx.prisma, o.url, o.job);
    return {
      status: 'gravado',
      estat,
      gravadas: gravador.gravadas,
      enviadas: gravador.enviadas,
      bytes: arq.bytes,
      doCache: arq.doCache,
    };
  } finally {
    await arq.descartar();
  }
}

export interface ResultadoResumo {
  ultimoPregao: string | null;
  simbolos: number;
  negociados30: number;
  fiisNegociados30: number;
  baixaLiquidez: number;
  saltos: Array<{ symbol: string; date: string; variacaoPct: number }>;
}

/**
 * Recalcula AssetQuoteResumo a partir dos últimos 30 pregões gravados (1 consulta de ~30 pregões ×
 * ~700 símbolos). Salto > 40% sem evento bruto só no último pregão de cada símbolo.
 */
export async function recalcularResumoCotacoes(
  prisma: PrismaClient,
  p: ScoringParams,
  alertar: (a: AlertaJob) => void,
  opts: { aplicar: boolean; agora?: Date } = { aplicar: true },
): Promise<ResultadoResumo> {
  const ultimo = await ultimaDataCotacao(prisma);
  const vazio: ResultadoResumo = {
    ultimoPregao: ultimo,
    simbolos: 0,
    negociados30: 0,
    fiisNegociados30: 0,
    baixaLiquidez: 0,
    saltos: [],
  };
  if (!ultimo) return vazio;

  const janela = Math.max(p.universo.fiiQuadroPregoes, p.sanidade.b3.liquidezPregoes);
  const calendario = ultimosPregoes(ultimo, janela);
  const linhas = await prisma.assetQuoteDaily.findMany({
    where: { date: { gte: new Date(`${calendario[0]}T00:00:00.000Z`) } },
    select: {
      symbol: true,
      date: true,
      closeRaw: true,
      volumeFin: true,
      codBdi: true,
      especi: true,
    },
    orderBy: [{ symbol: 'asc' }, { date: 'asc' }],
  });

  type Linha = (typeof linhas)[number];
  const porSymbol = new Map<string, Linha[]>();
  for (const l of linhas) {
    const arr = porSymbol.get(l.symbol);
    if (arr) arr.push(l);
    else porSymbol.set(l.symbol, [l]);
  }

  const serieSalto = (ls: Linha[]) =>
    ls.map((l) => ({ date: paraData(l.date), closeRaw: l.closeRaw.toNumber() }));
  const noUltimo = (ls: Linha[], saltos: SaltoDiario[]) => {
    const d = paraData(ls[ls.length - 1].date);
    return saltos.find((s) => s.date === d);
  };

  // 1ª passada sem eventos: candidatos a salto; só eles consultam asset_corporate_actions
  const candidatos = new Set(
    [...porSymbol.entries()]
      .filter(([, ls]) => noUltimo(ls, detectarSaltoDiario(serieSalto(ls), [], p)))
      .map(([s]) => s),
  );
  const eventos = await eventosCorporativosBrutos(prisma, [...candidatos]);
  const eventosPorSymbol = new Map<string, Array<{ date: string; fator: number }>>();
  for (const e of eventos) {
    const arr = eventosPorSymbol.get(e.symbol) ?? [];
    arr.push({ date: e.date, fator: e.factor });
    eventosPorSymbol.set(e.symbol, arr);
  }

  const resumo: LinhaResumo[] = [];
  const saltos: ResultadoResumo['saltos'] = [];
  for (const [symbol, ls] of porSymbol) {
    const liq = liquidez(
      ls.map((l) => ({ date: paraData(l.date), volumeFin: l.volumeFin.toNumber() })),
      calendario,
      p,
    );
    const salto = candidatos.has(symbol)
      ? noUltimo(ls, detectarSaltoDiario(serieSalto(ls), eventosPorSymbol.get(symbol) ?? [], p))
      : undefined;
    const ult = ls[ls.length - 1];
    if (salto) saltos.push({ symbol, date: salto.date, variacaoPct: salto.variacaoPct });
    resumo.push({
      symbol,
      ultimoPregao: paraData(ult.date),
      closeRaw: ult.closeRaw as Prisma.Decimal,
      codBdi: ult.codBdi,
      especi: ult.especi,
      ...liq,
      saltoSuspeito: Boolean(salto),
    });
  }

  // alerta só para saltos do último pregão gravado (não repetir o mesmo salto por 30 dias)
  const novos = saltos.filter((s) => s.date === ultimo);
  for (const s of novos.slice(0, MAX_ALERTAS_SALTO)) {
    alertar({
      codigo: 'salto_sem_evento',
      nivel: 'aviso',
      mensagem: `${s.symbol}: fechamento variou ${s.variacaoPct.toFixed(1)}% em ${s.date} sem evento corporativo`,
      ref: s.symbol,
    });
  }
  if (novos.length > MAX_ALERTAS_SALTO) {
    alertar({
      codigo: 'salto_sem_evento',
      nivel: 'aviso',
      mensagem: `mais ${novos.length - MAX_ALERTAS_SALTO} saltos > ${p.sanidade.b3.saltoDiarioPct}% sem evento em ${ultimo}`,
    });
  }

  if (opts.aplicar) await gravarResumo(prisma, resumo, opts.agora ?? new Date());
  return {
    ultimoPregao: ultimo,
    simbolos: resumo.length,
    negociados30: resumo.filter((r) => r.negociadoUltimos30).length,
    fiisNegociados30: resumo.filter((r) => r.negociadoUltimos30 && r.codBdi === '12').length,
    baixaLiquidez: resumo.filter((r) => r.baixaLiquidez).length,
    saltos,
  };
}

export interface OpcoesSincronizarCotahist {
  /** só desenvolvimento: reusa zips diários já baixados */
  cacheDir?: string | string[] | null;
}

/** Função do cron 'cotahist' (roda dentro de executarJobAnalise). */
export async function sincronizarCotahist(
  ctx: JobContexto,
  opts: OpcoesSincronizarCotahist = {},
): Promise<ResultadoJob> {
  const p = ctx.params;
  const faltando = await pregoesSemCotacao(
    ctx.prisma,
    ctx.hoje,
    p.sanidade.b3.cotahistRecuperarPregoes,
  );
  const arquivos: Array<Record<string, unknown>> = [];
  let parcial = false;

  for (const data of faltando) {
    if (ctx.estourouPrazo()) {
      parcial = true;
      break;
    }
    const url = urlCotahistDiario(data);
    const nome = nomeCotahistDiario(data);
    const aaaammdd = data.replace(/-/g, '');
    let esperada = 0;
    const r = await processarArquivoCotahist(ctx, {
      url,
      nome,
      maxBytes: LIMITES_B3.maxBytesCotahistDiario,
      timeoutMs: Math.min(LIMITES_B3.timeoutMs, Math.max(5_000, ctx.restanteMs())),
      cacheDir: opts.cacheDir,
      job: 'cotahist',
      // arquivo diário só pode ter o próprio pregão; linha de outra data é rejeitada
      aceitarDataBruta: (d) => {
        if (d === aaaammdd) {
          esperada++;
          return true;
        }
        ctx.contar('rejeitadas');
        return false;
      },
    });
    if (r.status === 'nao_publicado') {
      const idade = pregoesEntre(data, ctx.hoje).length - 1;
      const atrasado = idade >= 2;
      ctx.alertar({
        codigo: atrasado ? 'cotahist_ausente' : 'cotahist_nao_publicado',
        nivel: atrasado ? 'aviso' : 'info',
        mensagem: atrasado
          ? `${nome}: pregão ${data} sem arquivo na B3 após ${idade} pregões`
          : `${nome}: ainda não publicado (404)`,
        ref: data,
      });
      arquivos.push({ data, status: 'nao_publicado' });
      continue;
    }
    if (esperada === 0) {
      ctx.alertar({
        codigo: 'cotahist_vazio',
        nivel: 'aviso',
        mensagem: `${nome}: nenhuma linha 010/BDI 02-12 de ${data}`,
        ref: data,
      });
    }
    arquivos.push({
      data,
      status: 'gravado',
      bytes: r.bytes,
      linhas: r.estat.linhas,
      emitidos: r.estat.emitidos,
      gravadas: r.gravadas,
    });
  }

  const resumo = await recalcularResumoCotacoes(ctx.prisma, p, ctx.alertar, {
    aplicar: ctx.aplicar,
  });
  return {
    parcial,
    detalhes: {
      lacunas: faltando,
      arquivos,
      resumo: { ...resumo, saltos: resumo.saltos.slice(0, 50) },
    },
  };
}
