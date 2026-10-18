/**
 * Backfill dos fundamentos SEC (Stocks e REITs, fatia A): companyfacts de TODOS os CIKs do
 * universo EUA (SecCompany.noUniverso, cikHistorico quando há) → AssetFundamentalsPeriod source
 * 'SEC'. Mesma função do job diário (processarCikSec): FY de 350–380 dias, último arquivado vence,
 * ano pelo término, versao +1 só quando o FY muda — rodar de novo não duplica nada (retomável).
 *
 * Script, nunca cron. Dry-run por padrão (calcula e conta, não grava); --apply explícito. Registra
 * AnaliseJobRun 'backfill:sec-fundamentos' (origem 'script') com rssPicoMb.
 *
 * Caminhos de dado:
 *  - padrão: data.sec.gov/api/xbrl/companyfacts/CIK##########.json por CIK, com gzip, ≤ 4 req/s e
 *    User-Agent da SEC (≈ 1.500 CIKs ≈ 7 min de rede; ~300–400 MB transferidos uma vez);
 *  - --zip=/caminho/companyfacts.zip: o arquivo em lote da SEC
 *    (https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip, ~1,4 GB, baixado À PARTE
 *    para /tmp — nunca para o repositório), lido entrada por entrada em streaming, sem rede no
 *    processamento. Uso: recarga completa ou máquina sem saída para a SEC. zip64 não é suportado
 *    (ErroFonte 'zip64_nao_suportado' — aí use o caminho padrão).
 *
 * Uso (DATABASE_URL do ambiente alvo; em prod pelo runner, com OK do Wellington):
 *   MALLOC_ARENA_MAX=2 NODE_OPTIONS=--max-old-space-size=256 npx tsx --env-file=.env \
 *     scripts/analise-ativos/backfill-sec-fundamentos.ts [--apply] [--ciks=320193,789019] \
 *     [--zip=/tmp/companyfacts.zip] [--anos=13]
 */
import {
  listarEntradasZip,
  linhasDaEntrada,
} from '../../src/services/analiseAtivos/fontes/zipStream';
import type { CompanyFactsSec } from '../../src/services/analiseAtivos/eua/extrairFundamentosSec';
import {
  ANOS_HISTORICO_SEC,
  processarCikSec,
} from '../../src/services/analiseAtivos/eua/jobs/secFundamentos';
import { criarSecCliente } from '../../src/services/analiseAtivos/eua/secCliente';
import { executarJobAnalise } from '../../src/services/analiseAtivos/jobs/executarJob';
import { nomeBackfill } from '../../src/services/analiseAtivos/jobs/nomesJobs';
import { listarCiksFundamentosEua } from '../../src/services/analiseAtivos/repositorio/eua';
import { prisma } from '../../src/lib/prisma';
import { normalizarCik } from '../../src/types/analiseAtivosEua';

const PRAZO_SCRIPT_MS = 2 * 60 * 60 * 1000;
/** maior companyfacts medido: 8,9 MB (C); folga ampla para uma linha JSON só */
const MAX_LINHA_ZIP = 128 * 1024 * 1024;

function arg(nome: string): string | undefined {
  const a = process.argv.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  if (!a) return undefined;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : 'true';
}

const aplicar = arg('apply') === 'true';
const zip = arg('zip');
const anos = Number(arg('anos') ?? ANOS_HISTORICO_SEC);
const ciksArg = arg('ciks')
  ?.split(',')
  .filter(Boolean)
  .map((c) => normalizarCik(c));

let entradasZip: Map<string, Awaited<ReturnType<typeof listarEntradasZip>>[number]> | null = null;

async function lerDoZip(caminho: string, nomeEntrada: string): Promise<CompanyFactsSec | null> {
  if (!entradasZip)
    entradasZip = new Map((await listarEntradasZip(caminho)).map((x) => [x.nome, x]));
  const e = entradasZip.get(nomeEntrada);
  if (!e) return null;
  let texto = '';
  for await (const l of linhasDaEntrada(caminho, e, {
    encoding: 'utf8',
    maxLinha: MAX_LINHA_ZIP,
  })) {
    texto += l;
  }
  return JSON.parse(texto) as CompanyFactsSec;
}

async function main() {
  const hoje = new Date().toISOString().slice(0, 10);
  const anoMinimo = Number(hoje.slice(0, 4)) - anos;
  console.log(
    `=== backfill SEC (${aplicar ? 'APPLY' : 'dry-run'}) FY ≥ ${anoMinimo}` +
      `${zip ? ` · zip ${zip}` : ' · companyfacts por CIK'} ===`,
  );
  const cliente = criarSecCliente();
  const r = await executarJobAnalise(
    nomeBackfill('sec-fundamentos'),
    async (ctx) => {
      const universo = ciksArg
        ? ciksArg.map((c) => ({ cikFundamentos: c }))
        : await listarCiksFundamentosEua(ctx.prisma);
      let ok = 0;
      let semDados = 0;
      let novas = 0;
      let i = 0;
      for (const u of universo) {
        if (ctx.estourouPrazo()) return { parcial: true, detalhes: { ok, semDados, novas } };
        i++;
        const cf = zip ? await lerDoZip(zip, `CIK${u.cikFundamentos}.json`) : undefined;
        const res = await processarCikSec(ctx.prisma, u.cikFundamentos, {
          cliente,
          cf,
          anoMinimo,
          aplicar: ctx.aplicar,
          alertar: ctx.alertar,
        });
        ctx.contar('linhasLidas', res.periodos);
        ctx.contar('linhasGravadas', res.novasVersoes);
        novas += res.novasVersoes;
        if (res.status === 'ok') ok++;
        else {
          semDados++;
          ctx.contar('rejeitadas');
          ctx.alertar({
            codigo: 'sem_companyfacts',
            nivel: 'aviso',
            mensagem: `CIK ${u.cikFundamentos} sem companyfacts`,
            ref: u.cikFundamentos,
          });
        }
        if (i % 25 === 0 || i === universo.length) {
          const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
          console.log(`  ${i}/${universo.length} CIKs · ${novas} FY novos · RSS ${rss} MB`);
        }
      }
      return {
        detalhes: {
          ciks: universo.length,
          ok,
          semDados,
          novas,
          requisicoesSec: cliente.requisicoes(),
        },
      };
    },
    {
      origem: 'script',
      aplicar,
      prazoMs: PRAZO_SCRIPT_MS,
      parametros: {
        anoMinimo,
        ...(zip ? { zip: true } : {}),
        ...(ciksArg ? { ciks: ciksArg.length } : {}),
      },
    },
  );
  console.log(
    `  → ${r.job}: ${r.status} em ${(r.duracaoMs / 1000).toFixed(1)} s · lidas ${r.linhasLidas} · ` +
      `gravadas ${r.linhasGravadas} · rejeitadas ${r.rejeitadas} · RSS pico ${r.rssPicoMb} MB` +
      (r.erro ? ` · ERRO ${r.erro}` : ''),
  );
  const porCodigo = new Map<string, number>();
  for (const a of r.alertas) porCodigo.set(a.codigo, (porCodigo.get(a.codigo) ?? 0) + 1);
  if (porCodigo.size)
    console.log(`    alertas: ${[...porCodigo].map(([k, n]) => `${k}×${n}`).join(' · ')}`);
  return r.status === 'falha' ? 1 : 0;
}

main()
  .then(async (c) => {
    await prisma.$disconnect();
    process.exit(c);
  })
  .catch(async (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
