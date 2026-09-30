/**
 * Tabela de notas reais × protótipo (decisão 1): para os ativos B3 do protótipo do Pedro (ações e FIIs),
 * o Índice MF calculado pela fórmula (último dataRef de asset_scores) ao lado do valor digitado no
 * protótipo e dos componentes — para o Pedro recalibrar os limiares em ScoringParams, se quiser.
 *
 * Só leitura no banco (asset_scores pelo repositório). Gera docs/analise-ativos/fase0/notas-reais-prototipo.csv.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/relatorio-notas-prototipo.ts \
 *     [--data-ref=AAAA-MM-DD] [--out=arquivo.csv] [--prototipo=docs/analise-ativos/prototipo-pedro.html]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { prisma } from '../../src/lib/prisma';
import { scoresNaData } from '../../src/services/analiseAtivos/repositorio/derivados';
import { dadoMaisRecentePorCamada } from '../../src/services/analiseAtivos/repositorio/jobs';

const RAIZ = path.resolve(__dirname, '../..');
const PROTOTIPO_PADRAO = path.join(RAIZ, 'docs/analise-ativos/prototipo-pedro.html');
const SAIDA_PADRAO = path.join(RAIZ, 'docs/analise-ativos/fase0/notas-reais-prototipo.csv');

interface LinhaPrototipo {
  t: string;
  n?: string;
  score?: number;
  tipo?: string;
}

function carregarPrototipo(arquivo: string): { acoes: LinhaPrototipo[]; fiis: LinhaPrototipo[] } {
  const html = readFileSync(arquivo, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const dataScript = scripts.find((s) => s.includes('const DATA ='));
  if (!dataScript) throw new Error('não achei "const DATA =" no protótipo');
  const ctx = vm.createContext({ Math, JSON });
  const data = vm.runInContext(
    `${dataScript}\n({ acoes: DATA.acoes.rows, fiis: DATA.fiis.rows })`,
    ctx,
  ) as {
    acoes: LinhaPrototipo[];
    fiis: LinhaPrototipo[];
  };
  return data;
}

function csv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const argv = process.argv.slice(2);
  const dataArg = argv.find((a) => a.startsWith('--data-ref='))?.split('=', 2)[1];
  const saida = argv.find((a) => a.startsWith('--out='))?.split('=', 2)[1] ?? SAIDA_PADRAO;
  const prototipo =
    argv.find((a) => a.startsWith('--prototipo='))?.split('=', 2)[1] ?? PROTOTIPO_PADRAO;
  const proto = carregarPrototipo(prototipo);
  const alvos = [
    ...proto.acoes.map((r) => ({ ...r, classe: 'acao' })),
    ...proto.fiis.map((r) => ({ ...r, classe: 'fii' })),
  ];
  const dataRef = dataArg ?? (await dadoMaisRecentePorCamada(prisma)).scores;
  const scores = dataRef
    ? await scoresNaData(
        prisma,
        dataRef,
        alvos.map((a) => a.t),
      )
    : [];
  const porSimbolo = new Map(scores.map((s) => [s.symbol, s]));

  const cab = [
    'ticker',
    'classe',
    'indice_formula',
    'indice_prototipo',
    'diferenca',
    'regua',
    'c_lucro',
    'c_divida',
    'c_rent',
    'c_div',
    'c_preco',
    'criterios',
    'incompleto',
    'motivos_incompleto',
    'ticker_referencia',
    'params_version',
    'data_ref',
  ];
  const linhas = alvos.map((a) => {
    const s = porSimbolo.get(a.t);
    const dif = s?.indiceMf != null && typeof a.score === 'number' ? s.indiceMf - a.score : null;
    return [
      a.t,
      a.classe,
      s?.indiceMf,
      a.score,
      dif,
      s?.regua ?? 'sem_score',
      s?.cLucro,
      s?.cDivida,
      s?.cRent,
      s?.cDiv,
      s?.cPreco,
      s ? `${s.criteriosAtendidos} de ${s.criteriosAplicaveis}` : '',
      s ? (s.incompleto ? 'sim' : 'não') : '',
      s?.motivosIncompleto.join(' '),
      s?.tickerReferencia,
      s?.paramsVersion,
      s ? s.dataRef : '',
    ]
      .map(csv)
      .join(';');
  });
  mkdirSync(path.dirname(saida), { recursive: true });
  writeFileSync(saida, `${cab.join(';')}\n${linhas.join('\n')}\n`, 'utf8');
  const comScore = alvos.filter((a) => porSimbolo.has(a.t)).length;
  console.log(
    `notas-reais-prototipo: ${alvos.length} ativos do protótipo (${proto.acoes.length} ações, ${proto.fiis.length} FIIs); ` +
      `${comScore} com score em ${dataRef ?? '(sem asset_scores)'} → ${path.relative(RAIZ, saida)}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
