/**
 * Recalcula os derivados da Análise de Ativos (fatia D) — backfill passos 9 e 10 e recálculo manual.
 * Roda exatamente a função do cron /api/cron/analise-ativos/derivados (executarDerivados; a rota
 * /scores é alias), registrada em AnaliseJobRun como 'backfill:recalcular-analise' (origem 'script').
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/recalcular-analise.ts \
 *     --etapas=proventos,eventos,derivados,atuais          # dry-run: contagens, não grava
 *   NODE_OPTIONS=--max-old-space-size=384 npx tsx --env-file=.env \
 *     scripts/analise-ativos/recalcular-analise.ts --etapas=proventos,eventos,derivados,atuais --apply
 *
 * D6-a (23/10/2026): o Índice MF e o semáforo saíram do job. A etapa 'scores' continua aceita como
 * alias de 'atuais' (múltiplos do dia + sanidade), com aviso — os comandos antigos do RUNBOOK e de
 * produção (--etapas=proventos,eventos,derivados,scores) fazem o mesmo trabalho de antes, sem gravar
 * asset_scores. --sem-retencao é aceito sem efeito (não há mais retenção de asset_scores).
 *
 * Opções:
 *   --apply                 grava (padrão: dry-run)
 *   --etapas=a,b            subconjunto de proventos,eventos,derivados,atuais (padrão: todas;
 *                           'scores' = alias de 'atuais')
 *   --tudo                  derivados anuais de TODOS os emissores/FIIs (padrão: só os alterados
 *                           desde o último run OK do job derivados/scores; sem run anterior = todos)
 *   --sem-retencao          sem efeito desde a D6-a (aceito com aviso)
 *   --prazo-s=N             prazo interno (padrão 1.800 s no script; o cron usa 240 s)
 *   --simbolos-arquivo=F    JSON {"acao": [...], "fii": [...]} com símbolos EXTRAS só para
 *                           proventos/eventos (dev sem cadastro das fatias A/B)
 *   --versao-params=N       roda com a versão N do ScoringParams em vez da ativa (bloco C: dry-run
 *                           da v2 ANTES de gravá-la). Sem a versão no banco, só a v2 do código
 *                           (scoringParamsV2.ts) e SÓ em dry-run (--apply é recusado).
 *   --relatorio=ARQ         grava também o relatório por regra do motor de sanidade (texto) em ARQ
 *   --relatorio-tickers=ARQ (fundamentei-regras F2) grava o CSV antes × depois de payoutPct, dyPct
 *                           e DPA por ticker (anual e do dia): 'antes' = o que está gravado no banco,
 *                           'depois' = o que esta rodada calculou (com --versao-params, a versão N).
 *                           Não muda o que é calculado nem gravado. Só em dry-run (sem --apply).
 *   --tickers=A,B           limita o CSV do --relatorio-tickers a estes tickers (padrão: todos)
 *
 * fundamentei-regras (F2) — dry-run da scoring v3 (inerte no banco com validFrom 2099, ou do código):
 *   npx tsx --env-file=.env scripts/analise-ativos/recalcular-analise.ts --versao-params=3 \
 *     --etapas=derivados,atuais --tudo --relatorio-tickers=/tmp/v2-x-v3.csv
 *
 * Bloco C — dry-run da v2 com relatório por regra (o mesmo que vai para detalhes.atuais.sanidade):
 *   npx tsx --env-file=.env scripts/analise-ativos/recalcular-analise.ts --versao-params=2 --tudo \
 *     --relatorio=/tmp/dryrun-v2.txt
 *
 * Idempotente (reescrita por símbolo) e retomável (rodar de novo continua
 * do estado gravado). Nunca escreve em tabelas existentes do app.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  ETAPAS,
  executarDerivados,
  normalizarEtapas,
  type Etapa,
} from '../../src/services/analiseAtivos/calculo/executarDerivados';
import { executarJobAnalise } from '../../src/services/analiseAtivos/jobs/executarJob';
import {
  ErroParams,
  obterScoringParams,
} from '../../src/services/analiseAtivos/params/obterScoringParams';
import { SCORING_PARAMS_V2 } from '../../src/services/analiseAtivos/params/scoringParamsV2';
import { SCORING_PARAMS_V3 } from '../../src/services/analiseAtivos/params/scoringParamsV3';
import { SCORING_PARAMS_V4 } from '../../src/services/analiseAtivos/params/scoringParamsV4';
import type { RelatorioSanidade } from '../../src/services/analiseAtivos/calculo/recalcularAtuais';
import type {
  ColetorPayoutDy,
  ContextoComColetor,
} from '../../src/services/analiseAtivos/calculo/recalcularDerivados';
import type { JobContexto, ScoringParams } from '../../src/services/analiseAtivos/tipos';
import { prisma } from '../../src/lib/prisma';

export interface Args {
  aplicar: boolean;
  etapas: Etapa[];
  tudo: boolean;
  prazoMs: number;
  extras?: { acao?: string[]; fii?: string[] };
  versaoParams?: number;
  relatorio?: string;
  relatorioTickers?: string;
  tickers?: string[];
}

export function lerArgs(argv: string[]): Args {
  const valor = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.split('=', 2)[1];
  const etapasTxt = valor('etapas');
  // 'scores' = alias de 'atuais' (D6-a), com aviso; etapa desconhecida lança
  const etapas = normalizarEtapas(etapasTxt ? etapasTxt.split(',') : [...ETAPAS]);
  if (argv.includes('--sem-retencao')) {
    console.warn(
      '[recalcular-analise] --sem-retencao não tem mais efeito (D6-a: sem asset_scores)',
    );
  }
  const prazo = Number(valor('prazo-s') ?? 1800);
  if (!Number.isFinite(prazo) || prazo <= 0) throw new Error('--prazo-s inválido');
  const arquivo = valor('simbolos-arquivo');
  const extras = arquivo
    ? (JSON.parse(readFileSync(arquivo, 'utf8')) as { acao?: string[]; fii?: string[] })
    : undefined;
  const versaoTxt = valor('versao-params');
  const versaoParams = versaoTxt === undefined ? undefined : Number(versaoTxt);
  if (versaoParams !== undefined && (!Number.isInteger(versaoParams) || versaoParams <= 0)) {
    throw new Error('--versao-params inválido');
  }
  // 'antes' é lido do banco depois da rodada: com --apply sairia igual ao 'depois'
  if (valor('relatorio-tickers') !== undefined && argv.includes('--apply')) {
    throw new Error('--relatorio-tickers só em dry-run (sem --apply)');
  }
  const tickersTxt = valor('tickers');
  return {
    versaoParams,
    relatorio: valor('relatorio'),
    relatorioTickers: valor('relatorio-tickers'),
    tickers: tickersTxt
      ? tickersTxt
          .split(',')
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean)
      : undefined,
    aplicar: argv.includes('--apply'),
    etapas,
    tudo: argv.includes('--tudo'),
    prazoMs: prazo * 1000,
    extras,
  };
}

/** Versões do código aceitas no fallback da --versao-params (só dry-run). */
const VERSOES_CODIGO: Record<number, ScoringParams> = {
  [SCORING_PARAMS_V2.versao]: SCORING_PARAMS_V2,
  [SCORING_PARAMS_V3.versao]: SCORING_PARAMS_V3,
  [SCORING_PARAMS_V4.versao]: SCORING_PARAMS_V4,
};

/**
 * Params da --versao-params: a versão do banco se existir; senão, a v2/v3/v4 do código (só dry-run —
 * gravar derivados com uma versão que não está no banco quebraria a trilha paramsVersion).
 */
async function paramsDaVersao(
  versao: number,
  aplicar: boolean,
): Promise<{ params: ScoringParams; origem: 'banco' | 'codigo' }> {
  try {
    const p = await obterScoringParams(prisma, { versao });
    return { params: p.params, origem: 'banco' };
  } catch (e: unknown) {
    if (!(e instanceof ErroParams) || e.codigo !== 'versao_inexistente') throw e;
    const doCodigo = VERSOES_CODIGO[versao];
    if (!doCodigo) throw e;
    if (aplicar) {
      throw new Error(
        `ScoringParams v${versao} não está no banco: --versao-params com --apply exige a versão ` +
          `gravada (seed-scoring-params --versao=${versao} --apply, com OK). Rode sem --apply (dry-run).`,
      );
    }
    return { params: doCodigo, origem: 'codigo' };
  }
}

const pct = (n: number, total: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : '—');

/** Relatório por regra do motor de sanidade (texto). */
export function relatorioTexto(r: RelatorioSanidade | undefined, cabecalho: string): string {
  if (!r) return `${cabecalho}\n(motor de sanidade desligado nesta versão: nenhuma regra rodou)\n`;
  const linhas = [
    cabecalho,
    `Quadro: ${r.totais.acao} ações · ${r.totais.fii} FIIs (linhas do Quadro)`,
    `Liberações da curadoria lidas: ${r.liberacoes}`,
    '',
    'classe        regra                                      ações (%)      empresas  FIIs (%)   amostra',
  ];
  for (const c of r.regras) {
    linhas.push(
      `${c.classe.padEnd(13)} ${c.regra.padEnd(42)} ${`${c.acao} (${pct(c.acao, r.totais.acao)})`.padEnd(14)} ${String(c.empresas).padEnd(9)} ${`${c.fii} (${pct(c.fii, r.totais.fii)})`.padEnd(10)} ${c.amostra.join(', ')}`,
    );
  }
  if (r.regras.length === 0) linhas.push('(nenhuma regra marcou)');
  linhas.push('');
  linhas.push(
    r.acimaDoLimite.length === 0
      ? 'Nenhuma regra bloqueante acima do limite de alerta.'
      : `ACIMA DO LIMITE: ${r.acimaDoLimite.map((a) => `${a.regra} ${a.classe} ${a.n} (${a.pct.toFixed(1)}%)`).join('; ')}`,
  );
  return linhas.join('\n') + '\n';
}

/** Valores gravados hoje (o 'antes' do relatório por ticker). */
export interface AntesPayoutDy {
  anuais: Map<string, { payoutPct: number | null; dyPct: number | null; dpa: number | null }>;
  atuais: Map<string, { payoutPct: number | null; dy12mPct: number | null; dpa12m: number | null }>;
}

const fmt = (x: number | null | undefined) =>
  typeof x === 'number' && Number.isFinite(x) ? x.toFixed(4) : '';
const mudou = (a: number | null | undefined, b: number | null | undefined) =>
  fmt(a) !== fmt(b) ? 'sim' : '';

/**
 * CSV antes × depois (F2): uma linha por ticker × ano fiscal (anual) e uma por ticker (atual).
 * Colunas vazias = sem número. Puro (testado).
 */
export function csvRelatorioTickers(antes: AntesPayoutDy, depois: ColetorPayoutDy): string {
  const linhas = [
    'tipo;symbol;anoFiscal;dtFim;payout_antes;payout_depois;payout_mudou;dy_antes;dy_depois;dy_mudou;dpa_antes;dpa_depois;dpa_mudou',
  ];
  const anuais = [...depois.anuais].sort(
    (a, b) => a.symbol.localeCompare(b.symbol) || a.anoFiscal - b.anoFiscal,
  );
  for (const d of anuais) {
    const a = antes.anuais.get(`${d.symbol}|${d.anoFiscal}`);
    linhas.push(
      [
        'anual',
        d.symbol,
        d.anoFiscal,
        d.dtFim,
        fmt(a?.payoutPct),
        fmt(d.payoutPct),
        mudou(a?.payoutPct, d.payoutPct),
        fmt(a?.dyPct),
        fmt(d.dyPct),
        mudou(a?.dyPct, d.dyPct),
        fmt(a?.dpa),
        fmt(d.dpa),
        mudou(a?.dpa, d.dpa),
      ].join(';'),
    );
  }
  const atuais = [...depois.atuais].sort((a, b) => a.symbol.localeCompare(b.symbol));
  for (const d of atuais) {
    const a = antes.atuais.get(d.symbol);
    linhas.push(
      [
        'atual',
        d.symbol,
        '',
        '',
        fmt(a?.payoutPct),
        fmt(d.payoutPct),
        mudou(a?.payoutPct, d.payoutPct),
        fmt(a?.dy12mPct),
        fmt(d.dy12mPct),
        mudou(a?.dy12mPct, d.dy12mPct),
        fmt(a?.dpa12m),
        fmt(d.dpa12m),
        mudou(a?.dpa12m, d.dpa12m),
      ].join(';'),
    );
  }
  return linhas.join('\n') + '\n';
}

/** Lê do banco o 'antes' dos símbolos que a rodada calculou (só leitura). */
async function lerAntes(simbolos: string[]): Promise<AntesPayoutDy> {
  const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  const [my, ps, mc] = await Promise.all([
    prisma.assetMultiplesYearly.findMany({
      where: { symbol: { in: simbolos } },
      select: { symbol: true, anoFiscal: true, payoutPct: true, dyPct: true },
    }),
    prisma.assetPerShareYearly.findMany({
      where: { symbol: { in: simbolos } },
      select: { symbol: true, anoFiscal: true, dpaDataCom: true },
    }),
    prisma.assetMultiplesCurrent.findMany({
      where: { symbol: { in: simbolos } },
      select: { symbol: true, payoutPct: true, dy12mPct: true, dpa12m: true },
    }),
  ]);
  const dpa = new Map(ps.map((p) => [`${p.symbol}|${p.anoFiscal}`, num(p.dpaDataCom)]));
  return {
    anuais: new Map(
      my.map((m) => [
        `${m.symbol}|${m.anoFiscal}`,
        {
          payoutPct: num(m.payoutPct),
          dyPct: num(m.dyPct),
          dpa: dpa.get(`${m.symbol}|${m.anoFiscal}`) ?? null,
        },
      ]),
    ),
    atuais: new Map(
      mc.map((m) => [
        m.symbol,
        { payoutPct: num(m.payoutPct), dy12mPct: num(m.dy12mPct), dpa12m: num(m.dpa12m) },
      ]),
    ),
  };
}

async function main() {
  const args = lerArgs(process.argv.slice(2));
  console.log(
    `=== recalcular-analise (${args.aplicar ? 'APPLY' : 'dry-run'}) etapas=${args.etapas.join(',')}${args.tudo ? ' --tudo' : ''} ===`,
  );
  if (args.extras) {
    console.log(
      `  símbolos extras: ${args.extras.acao?.length ?? 0} ações, ${args.extras.fii?.length ?? 0} FIIs`,
    );
  }
  // Aquece a conexão e o query engine do Prisma antes do job: no cron o processo Next já está com
  // o engine carregado, então o delta de RSS medido deve ser só o do cálculo.
  await prisma.$queryRaw`SELECT 1`;
  const override =
    args.versaoParams !== undefined
      ? await paramsDaVersao(args.versaoParams, args.aplicar)
      : undefined;
  if (override) {
    console.log(
      `  ScoringParams v${args.versaoParams} (${override.origem}); conferência ${override.params.sanidade.conferencia.ligada ? 'LIGADA' : 'desligada'}`,
    );
  }
  let detalhes: Record<string, unknown> | undefined;
  const coletor: ColetorPayoutDy | undefined = args.relatorioTickers
    ? { simbolos: args.tickers ? new Set(args.tickers) : null, anuais: [], atuais: [] }
    : undefined;
  const inicio = Date.now();
  const rel = await executarJobAnalise(
    'backfill:recalcular-analise',
    async (ctxJob) => {
      const base: JobContexto = override
        ? { ...ctxJob, params: override.params, paramsVersion: args.versaoParams! }
        : ctxJob;
      const ctx: ContextoComColetor = coletor ? { ...base, coletorPayoutDy: coletor } : base;
      const r = await executarDerivados(ctx, {
        etapas: args.etapas,
        tudo: args.tudo,
        extras: args.extras,
      });
      detalhes = r.detalhes;
      return r;
    },
    {
      origem: 'script',
      aplicar: args.aplicar,
      prazoMs: args.prazoMs,
      lockTtlMs: args.prazoMs + 60_000,
      exigeParamsDoBanco: true,
      parametros: {
        etapas: args.etapas,
        tudo: args.tudo,
        aplicar: args.aplicar,
        ...(args.versaoParams !== undefined ? { versaoParams: args.versaoParams } : {}),
      },
    },
  );
  const mem = process.memoryUsage();
  console.log(
    JSON.stringify(
      {
        status: rel.status,
        erro: rel.erro,
        duracaoS: Math.round((Date.now() - inicio) / 100) / 10,
        linhasLidas: rel.linhasLidas,
        linhasGravadas: rel.linhasGravadas,
        rejeitadas: rel.rejeitadas,
        rssPicoMb: rel.rssPicoMb,
        heapUsadoMb: Math.round(mem.heapUsed / 1024 / 1024),
        alertas: rel.alertas,
        detalhes,
      },
      null,
      2,
    ),
  );
  const sanidade = (detalhes?.atuais as { sanidade?: RelatorioSanidade } | undefined)?.sanidade;
  if (detalhes?.atuais) {
    const texto = relatorioTexto(
      sanidade,
      `=== motor de sanidade (bloco C) — relatório por regra — ScoringParams ${args.versaoParams ? `v${args.versaoParams}` : 'ativa'} — ${args.aplicar ? 'APPLY' : 'dry-run'} ===`,
    );
    console.log(texto);
    if (args.relatorio) writeFileSync(args.relatorio, texto);
  }
  if (coletor && args.relatorioTickers) {
    const simbolos = [
      ...new Set([...coletor.anuais.map((l) => l.symbol), ...coletor.atuais.map((l) => l.symbol)]),
    ];
    const antes = await lerAntes(simbolos);
    writeFileSync(args.relatorioTickers, csvRelatorioTickers(antes, coletor));
    console.log(
      `  relatório por ticker: ${simbolos.length} tickers, ${coletor.anuais.length} linhas anuais, ` +
        `${coletor.atuais.length} do dia → ${args.relatorioTickers}`,
    );
  }
  if (rel.status === 'falha') process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
