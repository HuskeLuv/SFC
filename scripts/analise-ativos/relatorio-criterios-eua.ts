/**
 * Relatório dos Filtros de Fundamentos de Stocks e REITs (fatia B da feature EUA) — FONTE dos
 * números de cobertura e de quantos atendem cada critério enviados ao Pedro (desenho
 * final.plano_producao passo 4: "relatorio-criterios-eua com a distribuição por critério").
 * SÓ LEITURA: nada é gravado.
 *
 * Imprime, para as linhas stock/reit de criteria_eval (ou de uma avaliação em memória):
 *  1. por perfil (stock, stock_financeira, reit) × janela × critério: com dado e atende;
 *  2. distribuição "n de k" por perfil na janela 5 (k = 6 em todos: financeiras literal, REIT com
 *     a ocupação inativa no denominador);
 *  3. cobertura da janela 5 contra os mínimos de aceite (COBERTURA_MINIMA_EUA);
 *  4. a nota explícita do caixa operacional por ação dos REITs (quantos atendem na janela 5).
 * Contagens factuais: não são nota nem ranking.
 *
 * Uso (DEV: DATABASE_URL do Postgres local; produção: pelo runbook, com o OK do Wellington):
 *   npx tsx scripts/analise-ativos/relatorio-criterios-eua.ts [--saida=ARQ]
 *   --recalcular=N   roda o criterios-eua EM MEMÓRIA com o criteria_params vN (a mesma função do
 *                    job; a gravação é trocada por uma captura) — ex.: --recalcular=3 antes da v3
 *                    ser vigente
 *   --arquivo=ARQ    lê as linhas de um JSON (LinhaEvalEua[])
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import {
  COBERTURA_MINIMA_EUA,
  DEPENDENCIAS_CRITERIOS_EUA,
  executarCriteriosEua,
} from '../../src/services/analiseAtivos/calculo/executarCriteriosEua';
import { SCORING_PARAMS_V1 } from '../../src/services/analiseAtivos/params/scoringParamsV1';
import type { LinhaCriteriaEval } from '../../src/services/analiseAtivos/repositorio/criterios';
import type { JobContexto } from '../../src/services/analiseAtivos/tipos';

export interface LinhaEvalEua {
  symbol: string;
  classe: string;
  perfil: string;
  janela: number;
  atendidos: number;
  aplicaveis: number;
  anoFim: number;
  paramsVersion: number;
  resultados: Array<{ id: string; estado: string; obs?: string[]; fonte?: string[] }>;
}

const JANELAS = [3, 5, 10];
const PERFIS = ['stock', 'stock_financeira', 'reit'] as const;

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const fmtPct = (n: number, d: number) =>
  `${n}/${d} (${pct(n, d).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`;
const comDado = (e: string | undefined) => !!e && e !== 'sem_dado' && e !== 'nao_se_aplica';
const estadoDe = (l: LinhaEvalEua, id: string) => l.resultados.find((r) => r.id === id)?.estado;

/** Monta o relatório (texto) e quantos critérios ficaram abaixo do mínimo. Pura. */
export function montarRelatorioEua(
  linhas: readonly LinhaEvalEua[],
  opts: { geradoEm?: string } = {},
): { texto: string; abaixoDoMinimo: number } {
  const eua = linhas.filter((l) => l.classe === 'stock' || l.classe === 'reit');
  const out: string[] = [];
  const p = (s = '') => out.push(s);
  const de = (perfil: string, janela: number) =>
    eua.filter((l) => l.perfil === perfil && l.janela === janela);

  p('Filtros de Fundamentos — Stocks e REITs (10-K na SEC): cobertura e critérios atendidos');
  p(
    `gerado em ${opts.geradoEm ?? new Date().toISOString()} · criteria_params v${[
      ...new Set(eua.map((l) => l.paramsVersion)),
    ].join(', ')} · ano final da janela: ${[...new Set(eua.map((l) => l.anoFim))].join(', ')}`,
  );
  p('"com dado" = o critério tem os anos da janela; sem dado conta como não atende.');
  p('Contagens factuais: não são nota nem ranking.');
  p();

  // 1. perfil × janela × critério
  for (const perfil of PERFIS) {
    const j5 = de(perfil, 5);
    if (j5.length === 0) continue;
    p(`== perfil ${perfil} (${j5.length} tickers) ==`);
    p(
      `${'critério'.padEnd(9)} ${JANELAS.map((j) => `janela ${j}: com dado | atende`.padEnd(42)).join('')}`,
    );
    for (const id of j5[0].resultados.map((r) => r.id)) {
      const cols = JANELAS.map((j) => {
        const ls = de(perfil, j);
        const com = ls.filter((l) => comDado(estadoDe(l, id))).length;
        const at = ls.filter((l) => estadoDe(l, id) === 'atende').length;
        return `${fmtPct(com, ls.length)} | ${fmtPct(at, ls.length)}`.padEnd(42);
      });
      p(`${id.padEnd(9)} ${cols.join('')}`);
    }
    // 2. distribuição n de k
    const dist = new Map<string, number>();
    for (const l of j5) {
      const k = `${l.atendidos} de ${l.aplicaveis}`;
      dist.set(k, (dist.get(k) ?? 0) + 1);
    }
    p(
      `distribuição (janela 5): ${[...dist.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }))
        .map(([k, n]) => `${k}: ${n}`)
        .join(' · ')}`,
    );
    p();
  }

  // 3. cobertura contra os mínimos de aceite
  let abaixoDoMinimo = 0;
  p('== cobertura da janela 5 contra os mínimos de aceite ==');
  for (const [perfil, minimos] of Object.entries(COBERTURA_MINIMA_EUA)) {
    const ls = de(perfil, 5);
    if (ls.length === 0) {
      p(`${perfil}: sem linhas`);
      continue;
    }
    for (const [id, min] of Object.entries(minimos ?? {})) {
      const com = ls.filter((l) => comDado(estadoDe(l, id))).length;
      const ok = pct(com, ls.length) >= (min as number) * 100;
      if (!ok) abaixoDoMinimo++;
      p(
        `${ok ? 'ok   ' : 'ABAIXO'} ${perfil}.${id}: ${fmtPct(com, ls.length)} · mínimo ${(min as number) * 100}%`,
      );
    }
  }
  p();

  // 4. nota explícita do caixa operacional por ação (REIT)
  const reit5 = de('reit', 5);
  if (reit5.length > 0) {
    const at = reit5.filter((l) => estadoDe(l, 'fco_acao') === 'atende').length;
    p(
      `REITs · Caixa operacional/ação crescente na janela 5: ${fmtPct(at, reit5.length)} atendem ` +
        '(o caixa operacional oscila com o capital de giro; não é o FFO do relatório).',
    );
    p('REITs · Ocupação ≥ 95%: sem dado para todos (não existe nos dados estruturados da SEC).');
  }
  return { texto: out.join('\n'), abaixoDoMinimo };
}

async function recalcularEmMemoria(prisma: PrismaClient, versao: number): Promise<LinhaEvalEua[]> {
  const capturadas: LinhaCriteriaEval[] = [];
  const ctx: JobContexto = {
    prisma,
    prazo: Date.now() + 30 * 60_000,
    restanteMs: () => 30 * 60_000,
    estourouPrazo: () => false,
    alertar: (a) => console.error(`  [${a.nivel}] ${a.codigo}: ${a.mensagem}`),
    contar: () => undefined,
    params: SCORING_PARAMS_V1,
    paramsVersion: SCORING_PARAMS_V1.versao,
    hoje: new Date().toISOString().slice(0, 10),
    origem: 'script',
    // aplicar=true só para o job montar as linhas; a gravação abaixo só captura
    aplicar: true,
  };
  await executarCriteriosEua(
    ctx,
    {
      ...DEPENDENCIAS_CRITERIOS_EUA,
      gravar: async (_p, linhas) => {
        capturadas.push(...linhas);
        return linhas.length;
      },
    },
    { versaoParams: versao },
  );
  return capturadas as unknown as LinhaEvalEua[];
}

async function main() {
  const argv = process.argv.slice(2);
  const valor = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.split('=', 2)[1];
  const prisma = new PrismaClient();
  try {
    const arquivo = valor('arquivo');
    const recalcular = valor('recalcular');
    const linhas: LinhaEvalEua[] = arquivo
      ? (JSON.parse(readFileSync(arquivo, 'utf8')) as LinhaEvalEua[])
      : recalcular
        ? await recalcularEmMemoria(prisma, Number(recalcular))
        : ((await prisma.criteriaEval.findMany({
            where: { classe: { in: ['stock', 'reit'] } },
            select: {
              symbol: true,
              classe: true,
              perfil: true,
              janela: true,
              atendidos: true,
              aplicaveis: true,
              anoFim: true,
              paramsVersion: true,
              resultados: true,
            },
          })) as unknown as LinhaEvalEua[]);
    const r = montarRelatorioEua(linhas);
    console.log(r.texto);
    const saida = valor('saida');
    if (saida) writeFileSync(saida, `${r.texto}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
