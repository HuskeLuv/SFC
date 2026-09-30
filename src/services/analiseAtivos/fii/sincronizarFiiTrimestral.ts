/**
 * Job fii-trimestral: Informe Trimestral de FII (CVM) ⇒ FiiQuarterly.
 *
 * Zip do ano corrente (+ ano−1 se mês ≤ 3), condicional por ETag/sha256; só CNPJs do FiiTickerMap.
 * Por (CNPJ, trimestre): imóveis de renda (nº, área, vacância física ponderada pela área,
 * inadimplência ponderada pela receita — "fonte CVM"), prazo médio aproximado e indexadores dos
 * contratos, CRIs distintos (regra 25) e maior CRI, resultado/rendimentos declarados.
 *
 * Três estados em FiiQuarterly (sem coluna naoSeAplica): coluna null + flag `nsa:<coluna>` quando
 * não se aplica (vacância em FII de papel); null sem flag = ausente.
 */
import { paraData } from '@/services/analiseAtivos/repositorio/conversao';
import { anosDoCron, obterArquivo, urlInformeFii } from '@/services/analiseAtivos/fii/fiiArquivos';
import {
  cnpjsDoMapa,
  gravarTrimestral,
  lerTrimestralGravado,
  type LinhaFiiTrimestral,
  type ResultadoGravacao,
} from '@/services/analiseAtivos/fii/gravarFii';
import { AgregadorAlertas } from '@/services/analiseAtivos/fii/sincronizarFiiMensal';
import {
  lerInformeTrimestralZip,
  type FiiTrimestreBruto,
} from '@/services/analiseAtivos/fii/parserInformeTrimestral';
import { contarCrisDistintos, contarFiisDistintos } from '@/services/analiseAtivos/regras/fii/cris';
import { agregarImoveis, prazoMedioAproximado } from '@/services/analiseAtivos/regras/fii/imoveis';
import { deData } from '@/services/analiseAtivos/repositorio/conversao';
import type {
  AlertaJob,
  FiiTipo,
  JobContexto,
  ResultadoJob,
  ScoringParams,
  Valor,
} from '@/services/analiseAtivos/tipos';

export const JOB_FII_TRIMESTRAL = 'fii-trimestral';

export interface OpcoesFiiTrimestral {
  anos?: number[];
  cacheDir?: string;
  condicional?: boolean;
  cnpjs?: string[];
}

function colunaValor(v: Valor<number>, coluna: string, flags: string[]): number | null {
  if (v.estado === 'ok') return v.valor;
  if (v.estado === 'nao_se_aplica') flags.push(`nsa:${coluna}`);
  return null;
}

/** Núcleo puro: trimestre bruto + tipo vigente do FII no fim do trimestre ⇒ linha a gravar. */
export function montarLinhaTrimestral(
  t: FiiTrimestreBruto,
  tipoVigente: FiiTipo | null,
  p: ScoringParams,
  sourceUrl: string,
): { linha: LinhaFiiTrimestral; alertas: AlertaJob[] } {
  const alertas: AlertaJob[] = [];
  const ref = `${t.cnpj}@${t.refQuarter}`;
  const im = agregarImoveis(t.imoveis, p, { tipoVigente });
  const flags = [...im.flags];
  const cris = contarCrisDistintos(t.ativos);
  const prazo = t.faixas
    ? prazoMedioAproximado(t.faixas)
    : { prazoMedioAnos: null, vencAte12mPct: null, vencAcima36mPct: null };

  if (flags.includes('soma_pct_receita_invalida')) {
    alertas.push({
      codigo: 'fii_soma_pct_receita',
      nivel: 'aviso',
      mensagem: `Σ %receita dos imóveis = ${im.somaPctReceita?.toFixed(1)} > ${p.sanidade.fii.somaPctReceitaMax}: inadimplência descartada`,
      ref,
    });
  }
  if (flags.includes('area_nao_abl')) {
    alertas.push({
      codigo: 'fii_area_nao_abl',
      nivel: 'aviso',
      mensagem: `imóvel com ${Math.round(im.areaMaiorImovelM2 ?? 0)} m² > ${p.sanidade.fii.areaMaxAblM2} (terreno, não ABL)`,
      ref,
    });
  }
  const temImoveis = t.imoveis.length > 0;
  const nFii = contarFiisDistintos(t.ativos);

  return {
    linha: {
      cnpj: t.cnpj,
      refQuarter: t.refQuarter,
      versao: t.versao,
      nImoveisRenda: temImoveis ? im.nImoveisRenda : null,
      nImoveisOutros: temImoveis ? im.nImoveisOutros : null,
      areaM2: im.areaM2,
      areaMaiorImovelM2: im.areaMaiorImovelM2,
      vacanciaFisicaCvmPct: colunaValor(im.vacanciaFisicaCvmPct, 'vacanciaFisicaCvmPct', flags),
      inadimplenciaCvmPct: colunaValor(im.inadimplenciaCvmPct, 'inadimplenciaCvmPct', flags),
      somaPctReceita: im.somaPctReceita,
      prazoMedioAnosAprox: prazo.prazoMedioAnos,
      vencAte12mPct: prazo.vencAte12mPct,
      vencAcima36mPct: prazo.vencAcima36mPct,
      idxIpcaPct: t.idxIpcaPct,
      idxIgpmPct: t.idxIgpmPct,
      nCri: t.ativos.length > 0 ? cris.nCri : null,
      valorCri: t.ativos.length > 0 ? cris.valorCri : null,
      maiorCriPct: cris.maiorCriPct,
      nFii: t.ativos.length > 0 ? nFii : null,
      receitaAluguel: t.receitaAluguel,
      resultadoTrimestral: t.resultadoTrimestral,
      rendimentosDeclarados: t.rendimentosDeclarados,
      taxaPerformance: t.taxaPerformance,
      flags: [...new Set(flags)],
      sourceUrl,
    },
    alertas,
  };
}

/** Tipo vigente no último mês do trimestre (FiiMonthly, tabela desta fatia). */
async function tiposNoFimDoTrimestre(
  ctx: JobContexto,
  trimestres: FiiTrimestreBruto[],
): Promise<Map<string, FiiTipo | null>> {
  const out = new Map<string, FiiTipo | null>();
  if (trimestres.length === 0) return out;
  const refs = [...new Set(trimestres.map((t) => `${t.refQuarter.slice(0, 7)}-01`))];
  const cnpjs = [...new Set(trimestres.map((t) => t.cnpj))];
  for (let i = 0; i < cnpjs.length; i += 500) {
    const linhas = await ctx.prisma.fiiMonthly.findMany({
      where: { cnpj: { in: cnpjs.slice(i, i + 500) }, refMonth: { in: refs.map(deData) } },
      select: { cnpj: true, refMonth: true, tipoVigente: true },
    });
    for (const l of linhas) {
      out.set(`${l.cnpj}|${paraData(l.refMonth).slice(0, 7)}`, (l.tipoVigente as FiiTipo) ?? null);
    }
  }
  return out;
}

export async function sincronizarFiiTrimestral(
  ctx: JobContexto,
  opts: OpcoesFiiTrimestral = {},
): Promise<ResultadoJob> {
  const cnpjs = opts.cnpjs ?? (await cnpjsDoMapa(ctx.prisma));
  if (cnpjs.length === 0) {
    ctx.alertar({
      codigo: 'fii_mapa_vazio',
      nivel: 'aviso',
      mensagem: 'FiiTickerMap vazio: rode fii-cadastro antes (universo B3)',
    });
    return { detalhes: { cnpjs: 0 } };
  }
  const filtro = new Set(cnpjs);
  const anos = opts.anos ?? anosDoCron(ctx.hoje, 3);
  const arquivos: Array<Record<string, unknown>> = [];
  const total: ResultadoGravacao = { criadas: 0, atualizadas: 0, iguais: 0, versaoMenor: 0 };
  const porTrimestre: Record<string, { fundos: number; comImoveis: number; comCri: number }> = {};
  const agregador = new AgregadorAlertas(ctx.alertar);
  let parcial = false;

  for (const ano of anos) {
    if (ctx.estourouPrazo()) {
      parcial = true;
      break;
    }
    const url = urlInformeFii('trimestral', ano);
    const arq = await obterArquivo(ctx.prisma, url, {
      cacheDir: opts.cacheDir,
      condicional: opts.condicional,
    });
    try {
      if (arq.status === 'nao_modificado' || !arq.caminho) {
        arquivos.push({ url, status: arq.status });
        continue;
      }
      const lido = await lerInformeTrimestralZip(arq.caminho, {
        cnpjs: filtro,
        arquivo: `inf_trimestral_fii_${ano}.zip`,
      });
      ctx.contar('linhasLidas', lido.linhasLidas);
      ctx.contar('rejeitadas', lido.rejeitadas);
      const tipos = await tiposNoFimDoTrimestre(ctx, lido.trimestres);
      const linhas: LinhaFiiTrimestral[] = [];
      for (const t of lido.trimestres) {
        const tipo = tipos.get(`${t.cnpj}|${t.refQuarter.slice(0, 7)}`) ?? null;
        const m = montarLinhaTrimestral(t, tipo, ctx.params, url);
        m.alertas.forEach(agregador.add);
        linhas.push(m.linha);
        const r = (porTrimestre[t.refQuarter] ??= { fundos: 0, comImoveis: 0, comCri: 0 });
        r.fundos++;
        if ((m.linha.nImoveisRenda ?? 0) > 0) r.comImoveis++;
        if ((m.linha.nCri ?? 0) > 0) r.comCri++;
      }
      const refs = lido.trimestres.map((t) => t.refQuarter).sort();
      const gravados = refs.length
        ? await lerTrimestralGravado(
            ctx.prisma,
            [...new Set(linhas.map((l) => l.cnpj))],
            refs[0],
            refs[refs.length - 1],
          )
        : new Map();
      const g = await gravarTrimestral(ctx.prisma, linhas, gravados, ctx.aplicar);
      ctx.contar('linhasGravadas', g.criadas + g.atualizadas);
      for (const k of Object.keys(total) as Array<keyof ResultadoGravacao>) total[k] += g[k];
      arquivos.push({ url, status: arq.status, bytes: arq.bytes, trimestres: linhas.length, ...g });
      if (ctx.aplicar) await arq.concluir(JOB_FII_TRIMESTRAL);
    } finally {
      await arq.descartar();
    }
  }
  agregador.fechar();
  return {
    parcial,
    detalhes: { anos, cnpjsUniverso: cnpjs.length, arquivos, gravacao: total, porTrimestre },
  };
}
