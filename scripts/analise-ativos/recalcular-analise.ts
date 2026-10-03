/**
 * Recalcula os derivados da Análise de Ativos (fatia D) — backfill passos 9 e 10 e recálculo manual.
 * Roda exatamente a função do cron /api/cron/analise-ativos/scores (executarScores), registrada em
 * AnaliseJobRun como 'backfill:recalcular-analise' (origem 'script').
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/recalcular-analise.ts \
 *     --etapas=proventos,eventos,derivados,scores          # dry-run: contagens e amostra, não grava
 *   NODE_OPTIONS=--max-old-space-size=384 npx tsx --env-file=.env \
 *     scripts/analise-ativos/recalcular-analise.ts --etapas=proventos,eventos,derivados,scores --apply
 *
 * Opções:
 *   --apply                 grava (padrão: dry-run)
 *   --etapas=a,b            subconjunto de proventos,eventos,derivados,scores (padrão: todas)
 *   --tudo                  derivados anuais de TODOS os emissores/FIIs (padrão: só os alterados
 *                           desde o último run OK do job scores; sem run anterior = todos)
 *   --sem-retencao          não aplica a retenção de asset_scores
 *   --prazo-s=N             prazo interno (padrão 1.800 s no script; o cron usa 240 s)
 *   --simbolos-arquivo=F    JSON {"acao": [...], "fii": [...]} com símbolos EXTRAS só para
 *                           proventos/eventos (dev sem cadastro das fatias A/B)
 *   --versao-params=N       roda com a versão N do ScoringParams em vez da ativa (bloco C: dry-run
 *                           da v2 ANTES de gravá-la). Sem a versão no banco, só a v2 do código
 *                           (scoringParamsV2.ts) e SÓ em dry-run (--apply é recusado).
 *   --relatorio=ARQ         grava também o relatório por regra do motor de sanidade (texto) em ARQ
 *
 * Bloco C — dry-run da v2 com relatório por regra (o mesmo que vai para detalhes.scores.sanidade):
 *   npx tsx --env-file=.env scripts/analise-ativos/recalcular-analise.ts --versao-params=2 --tudo \
 *     --sem-retencao --relatorio=/tmp/dryrun-v2.txt
 *
 * Idempotente (reescrita por símbolo / chave (symbol, dataRef)) e retomável (rodar de novo continua
 * do estado gravado). Nunca escreve em tabelas existentes do app.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  ETAPAS,
  executarScores,
  type Etapa,
} from '../../src/services/analiseAtivos/calculo/executarScores';
import { executarJobAnalise } from '../../src/services/analiseAtivos/jobs/executarJob';
import {
  ErroParams,
  obterScoringParams,
} from '../../src/services/analiseAtivos/params/obterScoringParams';
import { SCORING_PARAMS_V2 } from '../../src/services/analiseAtivos/params/scoringParamsV2';
import type { RelatorioSanidade } from '../../src/services/analiseAtivos/calculo/recalcularScores';
import type { JobContexto, ScoringParams } from '../../src/services/analiseAtivos/tipos';
import { prisma } from '../../src/lib/prisma';

interface Args {
  aplicar: boolean;
  etapas: Etapa[];
  tudo: boolean;
  retencao: boolean;
  prazoMs: number;
  extras?: { acao?: string[]; fii?: string[] };
  versaoParams?: number;
  relatorio?: string;
}

function lerArgs(argv: string[]): Args {
  const valor = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.split('=', 2)[1];
  const etapasTxt = valor('etapas');
  const etapas = (etapasTxt ? etapasTxt.split(',') : [...ETAPAS]).map((e) => e.trim());
  for (const e of etapas) {
    if (!(ETAPAS as readonly string[]).includes(e)) throw new Error(`etapa inválida: ${e}`);
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
  return {
    versaoParams,
    relatorio: valor('relatorio'),
    aplicar: argv.includes('--apply'),
    etapas: etapas as Etapa[],
    tudo: argv.includes('--tudo'),
    retencao: !argv.includes('--sem-retencao'),
    prazoMs: prazo * 1000,
    extras,
  };
}

/**
 * Params da --versao-params: a versão do banco se existir; senão, a v2 do código (só dry-run — gravar
 * scores com uma versão que não está no banco quebraria a trilha paramsVersion).
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
    if (versao !== SCORING_PARAMS_V2.versao) throw e;
    if (aplicar) {
      throw new Error(
        `ScoringParams v${versao} não está no banco: --versao-params com --apply exige a versão ` +
          'gravada (seed-scoring-params --versao=2 --apply, com OK). Rode sem --apply (dry-run).',
      );
    }
    return { params: SCORING_PARAMS_V2, origem: 'codigo' };
  }
}

const pct = (n: number, total: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : '—');

/** Relatório por regra do motor de sanidade (texto). */
export function relatorioTexto(r: RelatorioSanidade | undefined, cabecalho: string): string {
  if (!r) return `${cabecalho}\n(motor de sanidade desligado nesta versão: nenhuma regra rodou)\n`;
  const linhas = [
    cabecalho,
    `Quadro: ${r.totais.acao} ações · ${r.totais.fii} FIIs (linhas com score)`,
    `Índices com componente em conferência pelo bloco C: ${r.indicesEmConferencia.acao} empresas · ${r.indicesEmConferencia.fii} FIIs`,
    `Calculados (completos) sem o bloco C: ${r.calculadosSemBlocoC.acao} empresas · ${r.calculadosSemBlocoC.fii} FIIs`,
    `  passam a incompletos com o bloco C: ${r.calculadosQueCaem.acao.length} empresas (${pct(r.calculadosQueCaem.acao.length, r.calculadosSemBlocoC.acao)}%) ${r.calculadosQueCaem.acao.join(', ')}`,
    `                                      ${r.calculadosQueCaem.fii.length} FIIs (${pct(r.calculadosQueCaem.fii.length, r.calculadosSemBlocoC.fii)}%) ${r.calculadosQueCaem.fii.join(', ')}`,
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
  const inicio = Date.now();
  const rel = await executarJobAnalise(
    'backfill:recalcular-analise',
    async (ctxJob) => {
      const ctx: JobContexto = override
        ? { ...ctxJob, params: override.params, paramsVersion: args.versaoParams! }
        : ctxJob;
      const r = await executarScores(ctx, {
        etapas: args.etapas,
        tudo: args.tudo,
        extras: args.extras,
        retencao: args.retencao,
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
  const sanidade = (detalhes?.scores as { sanidade?: RelatorioSanidade } | undefined)?.sanidade;
  if (detalhes?.scores) {
    const texto = relatorioTexto(
      sanidade,
      `=== motor de sanidade (bloco C) — relatório por regra — ScoringParams v${args.versaoParams ?? 'ativa'} — ${args.aplicar ? 'APPLY' : 'dry-run'} ===`,
    );
    console.log(texto);
    if (args.relatorio) writeFileSync(args.relatorio, texto);
  }
  if (rel.status === 'falha') process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
