/**
 * Job fi-infra-mensal ("FI-Infra leve"): informe diário de fundos da CVM (FI/DOC/INF_DIARIO,
 * inf_diario_fi_AAAAMM.zip) ⇒ FiiMonthly, para os CNPJs do FiiTickerMap com tipoFundo FI-INFRA.
 * Um mês = o último dia informado no mês: PL, valor da cota (VP/cota), cotas (= PL ÷ cota) e
 * cotistas. SEM composição da carteira (a CDA das debêntures está fora do escopo): imóveis, papéis,
 * caixa, obrigações e DY da CVM ficam sem dado (flag 'sem_composicao').
 *
 * Mesmo núcleo do fii-mensal (processarMesesFii) com o tipo forçado a 'papel' (comFundosPapel:
 * FI-Infra analisado como FII de papel, lastro em debêntures) e segmentoCvm = 'FI-Infra'.
 *
 * Cron: os 3 meses FECHADOS anteriores ao corrente (o mês corrente ainda está incompleto),
 * condicional por ETag/sha256 (~11 MB por mês, lido em streaming com pré-filtro de CNPJ).
 * Backfill (`meses`): desde 2021-01 (1º arquivo mensal), sem condicional.
 */
import path from 'path';
import { fiiOverrides } from '@/services/analiseAtivos/repositorio/fii';
import { mesesRecentes, obterArquivo } from '@/services/analiseAtivos/fii/fiiArquivos';
import {
  cnpjsDoMapa,
  comFundosPapel,
  existentesDeOutraFonte,
  gravarMensal,
  lerMensalGravado,
  type ResultadoGravacao,
} from '@/services/analiseAtivos/fii/gravarFii';
import {
  PRIMEIRO_MES_DIARIO,
  lerInformeDiarioZip,
  mesDoFechamento,
  urlInformeDiarioFi,
} from '@/services/analiseAtivos/fii/parserInformeDiarioFi';
import {
  AgregadorAlertas,
  processarMesesFii,
} from '@/services/analiseAtivos/fii/sincronizarFiiMensal';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const JOB_FI_INFRA_MENSAL = 'fi-infra-mensal';
export const MESES_CRON_FI_INFRA = 3;
export const FLAG_SEM_COMPOSICAO = 'sem_composicao';

export interface OpcoesFiInfraMensal {
  /** meses 'AAAA-MM-01' (backfill); padrão: os 3 fechados anteriores ao corrente */
  meses?: string[];
  cacheDir?: string;
  condicional?: boolean;
  /** restringe a estes CNPJs (padrão: os FI-INFRA do FiiTickerMap) */
  cnpjs?: string[];
}

function somarMeses(ref: string, n: number): string {
  const [a, m] = ref.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
}

/** Meses fechados de `desde` (padrão 2021-01) até o anterior ao de `hoje` (backfill). */
export function mesesFechadosDesde(hoje: string, desde = PRIMEIRO_MES_DIARIO): string[] {
  const fim = mesesRecentes(hoje, 2)[1];
  const inicio = desde < PRIMEIRO_MES_DIARIO ? PRIMEIRO_MES_DIARIO : desde;
  const out: string[] = [];
  for (let m = inicio; m <= fim; m = somarMeses(m, 1)) out.push(m);
  return out;
}

const daFonteDiario = (sourceUrl: string) => /\/dados\/FI\/DOC\/INF_DIARIO\//.test(sourceUrl);

export async function sincronizarFiInfraMensal(
  ctx: JobContexto,
  opts: OpcoesFiInfraMensal = {},
): Promise<ResultadoJob> {
  const cnpjs = opts.cnpjs ?? (await cnpjsDoMapa(ctx.prisma, ['FI-INFRA']));
  if (cnpjs.length === 0) {
    ctx.alertar({
      codigo: 'fi_infra_mapa_vazio',
      nivel: 'aviso',
      mensagem: 'nenhum FI-Infra no FiiTickerMap: rode fii-cadastro antes (listas B3)',
    });
    return { detalhes: { cnpjs: 0 } };
  }
  const filtro = new Set(cnpjs);
  const meses = (opts.meses ?? mesesRecentes(ctx.hoje, MESES_CRON_FI_INFRA + 1).slice(1))
    .filter((m) => m >= PRIMEIRO_MES_DIARIO)
    .sort();
  const overrides = comFundosPapel(await fiiOverrides(ctx.prisma), cnpjs);
  const arquivos: Array<Record<string, unknown>> = [];
  const total: ResultadoGravacao = { criadas: 0, atualizadas: 0, iguais: 0, versaoMenor: 0 };
  const agregador = new AgregadorAlertas(ctx.alertar);
  const comDado = new Set<string>();
  let parcial = false;

  for (const ref of meses) {
    if (ctx.estourouPrazo()) {
      parcial = true;
      break;
    }
    const url = urlInformeDiarioFi(ref);
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
      const lido = await lerInformeDiarioZip(arq.caminho, {
        arquivo: path.basename(url),
        cnpjs: filtro,
      });
      ctx.contar('linhasLidas', lido.linhasLidas);
      ctx.contar('rejeitadas', lido.rejeitadas);
      const doMes = [...lido.fechamentos.values()]
        .map(mesDoFechamento)
        .filter((m) => m.refMonth === ref);
      doMes.forEach((m) => comDado.add(m.cnpj));
      const gravados =
        doMes.length > 0
          ? await lerMensalGravado(
              ctx.prisma,
              [...new Set(doMes.map((m) => m.cnpj))],
              somarMeses(ref, -(ctx.params.fiiTipo.mesesHisterese + 1)),
              ref,
            )
          : new Map();
      const processado = processarMesesFii(doMes, gravados, overrides, ctx.params, {
        todosOsMeses: true,
        sourceUrl: url,
      });
      processado.alertas.forEach(agregador.add);
      const linhas = processado.linhas.map((l) => ({
        ...l,
        flags: [...new Set([...l.flags, FLAG_SEM_COMPOSICAO])],
      }));
      const g = await gravarMensal(
        ctx.prisma,
        linhas,
        existentesDeOutraFonte(gravados, daFonteDiario),
        ctx.aplicar,
      );
      ctx.contar('linhasGravadas', g.criadas + g.atualizadas);
      for (const k of Object.keys(total) as Array<keyof ResultadoGravacao>) total[k] += g[k];
      arquivos.push({ url, status: arq.status, bytes: arq.bytes, cnpjs: doMes.length, ...g });
      if (ctx.aplicar) await arq.concluir(JOB_FI_INFRA_MENSAL);
    } finally {
      await arq.descartar();
    }
  }

  const semDado = cnpjs.filter((c) => !comDado.has(c));
  if (semDado.length > 0 && arquivos.some((a) => a.status !== 'nao_modificado')) {
    agregador.add({
      codigo: 'fi_infra_sem_informe_diario',
      nivel: 'info',
      mensagem: `${semDado.length} FI-Infra do mapa sem linha no informe diário: ${semDado.slice(0, 10).join(', ')}`,
    });
  }
  agregador.fechar();
  return { parcial, detalhes: { meses, cnpjsUniverso: cnpjs.length, arquivos, gravacao: total } };
}
