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
 *
 * Idempotente (reescrita por símbolo / chave (symbol, dataRef)) e retomável (rodar de novo continua
 * do estado gravado). Nunca escreve em tabelas existentes do app.
 */
import { readFileSync } from 'node:fs';
import {
  ETAPAS,
  executarScores,
  type Etapa,
} from '../../src/services/analiseAtivos/calculo/executarScores';
import { executarJobAnalise } from '../../src/services/analiseAtivos/jobs/executarJob';
import { prisma } from '../../src/lib/prisma';

interface Args {
  aplicar: boolean;
  etapas: Etapa[];
  tudo: boolean;
  retencao: boolean;
  prazoMs: number;
  extras?: { acao?: string[]; fii?: string[] };
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
  return {
    aplicar: argv.includes('--apply'),
    etapas: etapas as Etapa[],
    tudo: argv.includes('--tudo'),
    retencao: !argv.includes('--sem-retencao'),
    prazoMs: prazo * 1000,
    extras,
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
  let detalhes: Record<string, unknown> | undefined;
  const inicio = Date.now();
  const rel = await executarJobAnalise(
    'backfill:recalcular-analise',
    async (ctx) => {
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
      parametros: { etapas: args.etapas, tudo: args.tudo, aplicar: args.aplicar },
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
  if (rel.status === 'falha') process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
