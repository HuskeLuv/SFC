/**
 * Relatório dos Filtros de Fundamentos (v2.4; v2.5 com a v2 do criteria_params) — FONTE ÚNICA dos
 * números enviados ao Pedro (cobertura e quantos atendem cada critério, por perfil e janela).
 * SÓ LEITURA.
 *
 * Lê criteria_eval (gravado pelo job 'criterios') + analise_quadro_linhas (noQuadro, tipo do FII) e
 * imprime, para os ativos do Quadro:
 *  1. por perfil × janela × critério: com dado (≠ 'sem dado') e atende;
 *  2. ações: os limites v1 na janela 5 sobre TODAS as ações do Quadro (inclui financeiras),
 *     distribuição "n de k" e o análogo do caso 30 (Receita + Lucro + Dív.líq/EBITDA);
 *  3. FIIs por tipo (tijolo, papel, híbrido, indefinido, FoF, sem tipo);
 *  4. v2.5: fontes e observações (lucro descontado em fallback, dados incompletos);
 *  5. conferência contra a cobertura medida no desenho da v2.4 (docs/analise-ativos/v2-filtros,
 *     spec-desenho.json → arquitetura.criterios), tolerância ±2 p.p. — só para avaliações v1.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/relatorio-criterios.ts [--saida=ARQ] [--todos]
 *   --todos            todo o universo avaliado (padrão: só noQuadro)
 *   --arquivo=ARQ      lê as linhas de criteria_eval de um JSON (dry-run do job) em vez do banco
 *   --recalcular=N     v2.5: roda o job 'criterios' EM MEMÓRIA com o criteria_params vN (mesma
 *                      função do cron, nada é gravado) e relata essas linhas
 *   --comparar=A,B     v2.5: recalcula com vA e vB em memória e acrescenta a comparação por perfil ×
 *                      critério (janela 5) — ex.: --comparar=1,2 antes de adiantar o validFrom da v2
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import {
  DEPENDENCIAS_PADRAO,
  executarCriterios,
} from '../../src/services/analiseAtivos/calculo/executarCriterios';
import { obterScoringParams } from '../../src/services/analiseAtivos/params/obterScoringParams';
import type { LinhaCriteriaEval } from '../../src/services/analiseAtivos/repositorio/criterios';
import type { JobContexto } from '../../src/services/analiseAtivos/tipos';

export interface LinhaEvalRelatorio {
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

export interface LinhaQuadroRelatorio {
  symbol: string;
  classe: string;
  noQuadro: boolean;
  fiiTipo: string | null;
}

/** Números do desenho (13/10/2026) para a conferência (numerador/denominador). */
interface Esperado {
  rotulo: string;
  num: number;
  den: number;
  /** por que o medido pode sair da tolerância por REGRA decidida (mostrada só quando sai) */
  nota?: string;
  /** quem calcula o valor medido */
  medir: (c: Contexto) => { num: number; den: number };
}

interface Contexto {
  porJanela: (j: number) => LinhaEvalRelatorio[];
  quadro: Map<string, LinhaQuadroRelatorio>;
}

const JANELAS = [3, 5, 10];
/** Regras do fix 9d2fbdf3 (13/10/2026, depois da medição do desenho). */
const NOTA_RECEITA_NAO_POSITIVA =
  'receita ≤ 0 no ano = sem dado (fix 9d2fbdf3 de 13/10, depois da medição do desenho; ex.: holdings sem receita própria)';
const NOTA_RECEITA_MENOR_LUCRO =
  'receita ≤ lucro no ano = margem sem dado (regra 15, fix 9d2fbdf3 de 13/10, depois da medição do desenho; ex.: ALOS3 e BRML3 em 2023, ganho da fusão)';
const NOTA_POR_ID: Partial<Record<string, string>> = {
  rec: NOTA_RECEITA_NAO_POSITIVA,
  mg: NOTA_RECEITA_MENOR_LUCRO,
};
const TOLERANCIA_PP = 2;

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const fmtPct = (n: number, d: number) =>
  `${n}/${d} (${pct(n, d).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`;

function estadoDe(l: LinhaEvalRelatorio, id: string): string | null {
  return l.resultados.find((r) => r.id === id)?.estado ?? null;
}

function contar(
  linhas: LinhaEvalRelatorio[],
  id: string,
  pred: (estado: string | null) => boolean,
): number {
  return linhas.filter((l) => pred(estadoDe(l, id))).length;
}

const comDado = (e: string | null) => e !== null && e !== 'sem_dado' && e !== 'nao_se_aplica';
const atende = (e: string | null) => e === 'atende';

function tipoFii(q: LinhaQuadroRelatorio | undefined): string {
  return q?.fiiTipo ?? 'sem tipo';
}

/** Medição por filtro: perfil (e tipo do FII) e critério. */
function medida(
  janela: number,
  filtro: (l: LinhaEvalRelatorio, q: LinhaQuadroRelatorio | undefined) => boolean,
  id: string,
  pred: (e: string | null) => boolean,
) {
  return (c: Contexto) => {
    const ls = c.porJanela(janela).filter((l) => filtro(l, c.quadro.get(l.symbol)));
    return { num: contar(ls, id, pred), den: ls.length };
  };
}

const ehAcao = (l: LinhaEvalRelatorio) => l.perfil === 'acao';
const ehFin = (l: LinhaEvalRelatorio) => l.perfil === 'acao_financeira';
const ehClasseAcao = (l: LinhaEvalRelatorio) => l.classe === 'acao';
/**
 * O desenho mediu "FII tijolo (207)" pelo TIPO (tijolo 185 + híbrido 7 + indefinido 15), não pelo
 * perfil: híbrido/indefinido com imóveis < 50% do PL são avaliados como papel (rec. 3).
 */
const grupoTijolo207 = (l: LinhaEvalRelatorio, q?: LinhaQuadroRelatorio) =>
  l.classe === 'fii' && ['tijolo', 'hibrido', 'indefinido'].includes(q?.fiiTipo ?? '');
const tijoloPuro = (l: LinhaEvalRelatorio, q?: LinhaQuadroRelatorio) =>
  l.perfil === 'fii_tijolo' && q?.fiiTipo === 'tijolo';
const papelPuro = (l: LinhaEvalRelatorio, q?: LinhaQuadroRelatorio) =>
  l.perfil === 'fii_papel' && q?.fiiTipo === 'papel';
const fof = (l: LinhaEvalRelatorio, q?: LinhaQuadroRelatorio) =>
  l.classe === 'fii' && q?.fiiTipo === 'fof';

export const ESPERADO_DESENHO: Esperado[] = [
  ...(
    [
      ['rec', 283, 227],
      ['luc', 283, 227],
      ['ebitda', 283, 227],
      ['mg', 282, 220],
      ['dl', 287, 231],
      ['fcl', 279, 224],
    ] as const
  ).flatMap(([id, j5, j10]) => [
    {
      rotulo: `ações não financeiras · ${id} com dado · janela 5`,
      num: j5,
      den: 293,
      ...(NOTA_POR_ID[id] ? { nota: NOTA_POR_ID[id] } : {}),
      medir: medida(5, ehAcao, id, comDado),
    },
    {
      rotulo: `ações não financeiras · ${id} com dado · janela 10`,
      num: j10,
      den: 293,
      ...(NOTA_POR_ID[id] ? { nota: NOTA_POR_ID[id] } : {}),
      medir: medida(10, ehAcao, id, comDado),
    },
  ]),
  ...(
    [
      ['rec', 110],
      ['luc', 29],
      ['ebitda', 52],
      ['mg', 208],
      ['dl', 168],
      ['fcl', 2],
    ] as const
  ).map(([id, n]) => ({
    rotulo: `ações (todas) · ${id} atende · janela 5`,
    num: n,
    den: 330,
    ...(id === 'dl'
      ? {
          nota: 'EBITDA ≤ 0 com dívida líquida positiva em algum ano = fora (decisão do desenho: fato "EBITDA ≤ 0 em AAAA")',
        }
      : id === 'mg'
        ? { nota: NOTA_RECEITA_MENOR_LUCRO }
        : {}),
    medir: medida(5, ehClasseAcao, id, atende),
  })),
  {
    rotulo: 'financeiras · rec com dado · janela 5',
    num: 35,
    den: 37,
    nota: `${NOTA_RECEITA_NAO_POSITIVA}: BBSE3, CXSE3, RPAD`,
    medir: medida(5, ehFin, 'rec', comDado),
  },
  {
    rotulo: 'financeiras · luc com dado · janela 5',
    num: 35,
    den: 37,
    medir: medida(5, ehFin, 'luc', comDado),
  },
  {
    rotulo: 'financeiras · mg com dado · janela 5',
    num: 30,
    den: 37,
    nota: '1 ativo de 37 = 2,7 p.p.: receita ≤ 0 ou ausente em algum ano da janela deixa a margem sem dado; holding/banco sem nenhuma margem na janela (receita não comparável ao lucro) = não se aplica',
    medir: medida(5, ehFin, 'mg', comDado),
  },
  {
    rotulo: 'FII tijolo · rend com dado · janela 5',
    num: 88,
    den: 207,
    medir: medida(5, grupoTijolo207, 'rend', comDado),
  },
  {
    rotulo: 'FII tijolo · rend com dado · janela 3',
    num: 121,
    den: 207,
    medir: medida(3, grupoTijolo207, 'rend', comDado),
  },
  {
    rotulo: 'FII tijolo · vp com dado · janela 5',
    num: 133,
    den: 207,
    medir: medida(5, grupoTijolo207, 'vp', comDado),
  },
  {
    rotulo: 'FII tijolo · alav com dado · janela 5',
    num: 149,
    den: 207,
    nota: 'rec. 3: híbridos e indefinidos com imóveis < 50% do PL são avaliados como papel (LTV, D3) e não têm Obrigações/PL',
    medir: medida(5, grupoTijolo207, 'alav', comDado),
  },
  {
    rotulo: 'FII tijolo · alav com dado · janela 10',
    num: 33,
    den: 207,
    medir: medida(10, grupoTijolo207, 'alav', comDado),
  },
  {
    rotulo: 'FII tijolo (só tipo tijolo) · alav atende · janela 5',
    num: 90,
    den: 185,
    medir: medida(5, tijoloPuro, 'alav', atende),
  },
  {
    rotulo: 'FII tijolo · mes com dado (base cobre a janela) · janela 5',
    num: 114,
    den: 207,
    nota: '"com dado" inclui a sequência quebrada dentro de uma base curta (não atende); o desenho contou só a base que cobre a janela',
    medir: medida(5, grupoTijolo207, 'mes', comDado),
  },
  {
    rotulo: 'FII tijolo (só tipo tijolo) · mes atende · janela 5',
    num: 74,
    den: 185,
    nota: 'rec. 4: a sequência é contada até dez/anoFim (não até hoje) e base de proventos que começa depois de jan do 1º ano da janela = sem dado; o desenho usou mesesComRendimento (contado a partir de hoje)',
    medir: medida(5, tijoloPuro, 'mes', atende),
  },
  {
    rotulo: 'FII tijolo · res com dado · janela 5',
    num: 116,
    den: 207,
    medir: medida(5, grupoTijolo207, 'res', comDado),
  },
  {
    rotulo: 'FII tijolo (só tipo tijolo) · res atende · janela 5',
    num: 25,
    den: 185,
    medir: medida(5, tijoloPuro, 'res', atende),
  },
  {
    rotulo: 'FII papel (só tipo papel) · rend com dado · janela 5',
    num: 26,
    den: 70,
    medir: medida(5, papelPuro, 'rend', comDado),
  },
  {
    rotulo: 'FII papel (só tipo papel) · vp com dado · janela 5',
    num: 35,
    den: 70,
    medir: medida(5, papelPuro, 'vp', comDado),
  },
  {
    rotulo: 'FII papel (só tipo papel) · mes com dado · janela 5',
    num: 39,
    den: 70,
    nota: 'rec. 4: a sequência é contada até dez/anoFim (não até hoje) e base de proventos que começa depois de jan do 1º ano da janela = sem dado; o desenho usou mesesComRendimento (contado a partir de hoje)',
    medir: medida(5, papelPuro, 'mes', comDado),
  },
  {
    rotulo: 'FII papel (só tipo papel) · mes atende · janela 5',
    num: 38,
    den: 70,
    nota: 'rec. 4: a sequência é contada até dez/anoFim (não até hoje) e base de proventos que começa depois de jan do 1º ano da janela = sem dado; o desenho usou mesesComRendimento (contado a partir de hoje)',
    medir: medida(5, papelPuro, 'mes', atende),
  },
  {
    rotulo: 'FII papel (só tipo papel) · res com dado · janela 5',
    num: 28,
    den: 70,
    medir: medida(5, papelPuro, 'res', comDado),
  },
  {
    rotulo: 'FII papel (só tipo papel) · res atende · janela 5',
    num: 4,
    den: 70,
    medir: medida(5, papelPuro, 'res', atende),
  },
  {
    rotulo: 'FoF · rend com dado · janela 5',
    num: 9,
    den: 57,
    medir: medida(5, fof, 'rend', comDado),
  },
  {
    rotulo: 'FoF · vp com dado · janela 5',
    num: 19,
    den: 57,
    medir: medida(5, fof, 'vp', comDado),
  },
];

/** Monta o relatório (texto). Pura. */
export function montarRelatorio(
  evals: LinhaEvalRelatorio[],
  quadro: LinhaQuadroRelatorio[],
  opts: { todos?: boolean; geradoEm?: string } = {},
): { texto: string; fora: number } {
  const q = new Map(quadro.map((l) => [l.symbol, l]));
  const universo = evals.filter((l) => opts.todos || q.get(l.symbol)?.noQuadro === true);
  const porJanelaMap = new Map<number, LinhaEvalRelatorio[]>();
  for (const l of universo) {
    const lista = porJanelaMap.get(l.janela);
    if (lista) lista.push(l);
    else porJanelaMap.set(l.janela, [l]);
  }
  const porJanela = (j: number) => porJanelaMap.get(j) ?? [];
  const ctx: Contexto = { porJanela, quadro: q };
  const out: string[] = [];
  const p = (s = '') => out.push(s);

  const versoes = [...new Set(universo.map((l) => l.paramsVersion))].join(', ');
  const anosFim = [...new Set(universo.map((l) => l.anoFim))].join(', ');
  const soV1 = universo.length > 0 && universo.every((l) => l.paramsVersion === 1);
  p('Filtros de Fundamentos — relatório de cobertura e critérios atendidos');
  p(`gerado em ${opts.geradoEm ?? new Date().toISOString()} · criteria_params v${versoes}`);
  p(
    `ano final da janela: ${anosFim} · universo: ${opts.todos ? 'todos os avaliados' : 'ativos do Quadro'}`,
  );
  p('"com dado" = o critério tem os anos (ou meses) da janela; sem dado conta como não atende.');
  p('Contagens factuais: não são nota nem ranking.');
  p();

  // 1. perfil × janela × critério
  const perfis = ['acao', 'acao_financeira', 'fii_tijolo', 'fii_papel'];
  for (const perfil of perfis) {
    const j5 = porJanela(5).filter((l) => l.perfil === perfil);
    if (j5.length === 0) continue;
    p(`== perfil ${perfil} (${j5.length} ativos) ==`);
    const ids = j5[0].resultados.map((r) => r.id);
    p(
      `${'critério'.padEnd(8)} ${JANELAS.map((j) => `janela ${j}: com dado | atende`.padEnd(40)).join('')}`,
    );
    for (const id of ids) {
      const cols = JANELAS.map((j) => {
        const ls = porJanela(j).filter((l) => l.perfil === perfil);
        const nsa = contar(ls, id, (e) => e === 'nao_se_aplica');
        if (nsa === ls.length && ls.length > 0) return 'não se aplica'.padEnd(40);
        return `${fmtPct(contar(ls, id, comDado), ls.length)} | ${fmtPct(contar(ls, id, atende), ls.length)}`.padEnd(
          40,
        );
      });
      p(`${id.padEnd(8)} ${cols.join('')}`);
    }
    p();
  }

  // 2. ações
  const acoes5 = porJanela(5).filter(ehClasseAcao);
  p(`== ações do Quadro, janela 5 (${acoes5.length}, inclui financeiras) ==`);
  for (const id of ['rec', 'luc', 'ebitda', 'mg', 'dl', 'fcl']) {
    p(`atendem ${id.padEnd(7)} ${fmtPct(contar(acoes5, id, atende), acoes5.length)}`);
  }
  const dist = new Map<string, number>();
  for (const l of acoes5) {
    const k = `${l.atendidos} de ${l.aplicaveis}`;
    dist.set(k, (dist.get(k) ?? 0) + 1);
  }
  p(
    `distribuição: ${[...dist.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }))
      .map(([k, n]) => `${k}: ${n}`)
      .join(' · ')}`,
  );
  const caso30 = acoes5.filter((l) =>
    ['rec', 'luc', 'dl'].every((id) => estadoDe(l, id) === 'atende'),
  ).length;
  p(
    `análogo do caso 30 (Receita + Lucro + Dív.líq/EBITDA, janela 5): ${caso30} de ${acoes5.length}`,
  );
  p();

  // 3. FIIs por tipo
  const tipos = ['tijolo', 'papel', 'hibrido', 'indefinido', 'fof', 'sem tipo'];
  p('== FIIs do Quadro por tipo (perfil usado) ==');
  for (const tipo of tipos) {
    const ls5 = porJanela(5).filter((l) => l.classe === 'fii' && tipoFii(q.get(l.symbol)) === tipo);
    if (ls5.length === 0) continue;
    const perfisTipo = [...new Set(ls5.map((l) => l.perfil))]
      .map((pf) => `${pf} ${ls5.filter((l) => l.perfil === pf).length}`)
      .join(', ');
    p(`-- ${tipo} (${ls5.length}; ${perfisTipo})`);
    for (const id of ['rend', 'vp', 'vac', 'alav', 'inad', 'ltv', 'mes', 'res']) {
      const cols = JANELAS.map((j) => {
        const ls = porJanela(j).filter(
          (l) => l.classe === 'fii' && tipoFii(q.get(l.symbol)) === tipo,
        );
        const com = contar(ls, id, (e) => e !== null);
        if (com === 0) return '—'.padEnd(36);
        return `j${j} ${fmtPct(contar(ls, id, comDado), ls.length)} | ${contar(ls, id, atende)}`.padEnd(
          36,
        );
      });
      if (cols.every((c) => c.trim() === '—')) continue;
      p(`   ${id.padEnd(5)} ${cols.join('')}`);
    }
  }
  p(
    soV1
      ? '(vacância, inadimplência e LTV: sem dado para todos — D3)'
      : '(v2: vacância da CVM avaliada no tijolo; inadimplência e LTV só com provedor aprovado, senão "não atende · sem dado")',
  );
  p();

  // 4. v2.5 — fontes e observações
  p('== fontes e observações (v2.5) ==');
  for (const j of JANELAS) {
    const ls = porJanela(j);
    const res = ls.flatMap((l) => l.resultados);
    const comObs = (o: string) => res.filter((r) => r.obs?.includes(o)).length;
    const fontes = new Map<string, number>();
    for (const r of res) for (const f of r.fonte ?? []) fontes.set(f, (fontes.get(f) ?? 0) + 1);
    p(
      `janela ${j}: luc com fallback do lucro descontado ${comObs('lucro_sem_descontado')} · ` +
        `dados incompletos ${comObs('dados_incompletos')} · fontes ${
          fontes.size > 0
            ? [...fontes.entries()].map(([f, n]) => `${f} ${n}`).join(', ')
            : '— (avaliação sem fonte: v1)'
        }`,
    );
  }
  const fin5 = porJanela(5).filter(ehFin);
  if (fin5.length > 0) {
    const den = [...new Set(fin5.map((l) => l.aplicaveis))].sort((a, b) => a - b).join(', ');
    p(`financeiras (janela 5): denominador "n de ${den}"`);
  }
  p();

  // 5. conferência com o desenho da v2.4 (números medidos com a v1)
  if (!soV1) {
    p('== conferência com o desenho da v2.4: pulada (só vale para avaliações com a v1) ==');
    return { texto: out.join('\n'), fora: 0 };
  }
  p(`== conferência com o desenho (13/10/2026), tolerância ±${TOLERANCIA_PP} p.p. ==`);
  let fora = 0;
  let explicados = 0;
  for (const e of ESPERADO_DESENHO) {
    const m = e.medir(ctx);
    const dif = pct(m.num, m.den) - pct(e.num, e.den);
    const ok = Math.abs(dif) <= TOLERANCIA_PP;
    if (!ok && e.nota) explicados++;
    else if (!ok) fora++;
    const marca = ok ? 'ok  ' : e.nota ? 'REGRA' : 'FORA';
    p(
      `${marca} ${e.rotulo}: medido ${fmtPct(m.num, m.den)} · desenho ${fmtPct(e.num, e.den)} · ${dif >= 0 ? '+' : ''}${dif.toFixed(1)} p.p.`,
    );
    if (!ok && e.nota) p(`      ↳ ${e.nota}`);
  }
  p(
    `${ESPERADO_DESENHO.length - fora - explicados} de ${ESPERADO_DESENHO.length} dentro da tolerância; ` +
      `${explicados} fora por regra decidida (↳); ${fora} fora sem explicação`,
  );
  return { texto: out.join('\n'), fora };
}

/**
 * Comparação de duas avaliações (ex.: v1 × v2) por perfil × critério na janela 5: com dado e atende.
 * Pura.
 */
export function compararVersoes(
  rotuloA: string,
  a: LinhaEvalRelatorio[],
  rotuloB: string,
  b: LinhaEvalRelatorio[],
  quadro: LinhaQuadroRelatorio[],
  opts: { todos?: boolean } = {},
): string {
  const q = new Map(quadro.map((l) => [l.symbol, l]));
  const filtrar = (ls: LinhaEvalRelatorio[]) =>
    ls.filter((l) => l.janela === 5 && (opts.todos || q.get(l.symbol)?.noQuadro === true));
  const A = filtrar(a);
  const B = filtrar(b);
  const out: string[] = [];
  out.push(`== comparação ${rotuloA} × ${rotuloB} (janela 5; com dado | atende | n/a) ==`);
  for (const perfil of ['acao', 'acao_financeira', 'fii_tijolo', 'fii_papel']) {
    const pa = A.filter((l) => l.perfil === perfil);
    const pb = B.filter((l) => l.perfil === perfil);
    if (pa.length + pb.length === 0) continue;
    out.push(`-- ${perfil} (${rotuloA}: ${pa.length} · ${rotuloB}: ${pb.length})`);
    const ids = [...new Set([...pa, ...pb].flatMap((l) => l.resultados.map((r) => r.id)))];
    for (const id of ids) {
      const col = (ls: LinhaEvalRelatorio[]) =>
        `${contar(ls, id, comDado)} | ${contar(ls, id, atende)} | ${contar(ls, id, (e) => e === 'nao_se_aplica')}`;
      out.push(`   ${id.padEnd(7)} ${rotuloA} ${col(pa).padEnd(18)} ${rotuloB} ${col(pb)}`);
    }
    const den = (ls: LinhaEvalRelatorio[]) =>
      [...new Set(ls.map((l) => l.aplicaveis))].sort((x, y) => x - y).join('/') || '—';
    out.push(`   denominador: ${rotuloA} n de ${den(pa)} · ${rotuloB} n de ${den(pb)}`);
  }
  return out.join('\n');
}

/**
 * Roda o job 'criterios' em MEMÓRIA com a versão pedida do criteria_params (a mesma função do cron;
 * a gravação é trocada por uma captura — nada vai ao banco).
 */
async function recalcularEmMemoria(
  prisma: PrismaClient,
  versao: number,
): Promise<LinhaEvalRelatorio[]> {
  const { versao: scoringVersion, params: scoring } = await obterScoringParams(prisma);
  const capturadas: LinhaCriteriaEval[] = [];
  const ctx: JobContexto = {
    prisma,
    prazo: Date.now() + 30 * 60_000,
    restanteMs: () => 30 * 60_000,
    estourouPrazo: () => false,
    alertar: (a) => console.error(`  [${a.nivel}] ${a.codigo}: ${a.mensagem}`),
    contar: () => undefined,
    params: scoring,
    paramsVersion: scoringVersion,
    hoje: new Date().toISOString().slice(0, 10),
    origem: 'script',
    // aplicar=true só para o job montar as linhas; a gravação abaixo só captura
    aplicar: true,
  };
  await executarCriterios(
    ctx,
    {
      ...DEPENDENCIAS_PADRAO,
      scoresEmExecucao: async () => false,
      gravar: async (_p, linhas) => {
        capturadas.push(...linhas);
        return linhas.length;
      },
    },
    { versaoParams: versao },
  );
  return capturadas as unknown as LinhaEvalRelatorio[];
}

async function main() {
  const argv = process.argv.slice(2);
  const valor = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.split('=', 2)[1];
  const prisma = new PrismaClient();
  try {
    const arquivo = valor('arquivo');
    const recalcular = valor('recalcular');
    const comparar = valor('comparar')
      ?.split(',')
      .map((v) => Number(v.trim()));
    if (comparar && (comparar.length !== 2 || comparar.some((v) => !Number.isInteger(v)))) {
      throw new Error('--comparar=A,B (duas versões do criteria_params)');
    }
    const quadro = await prisma.analiseQuadroLinha.findMany({
      select: { symbol: true, classe: true, noQuadro: true, fiiTipo: true },
    });
    if (comparar) {
      const [va, vb] = comparar;
      const a = await recalcularEmMemoria(prisma, va);
      const b = await recalcularEmMemoria(prisma, vb);
      const todos = argv.includes('--todos');
      const textos = [
        montarRelatorio(a, quadro, { todos }).texto,
        '',
        montarRelatorio(b, quadro, { todos }).texto,
        '',
        compararVersoes(`v${va}`, a, `v${vb}`, b, quadro, { todos }),
      ];
      const texto = textos.join('\n');
      console.log(texto);
      const saida = valor('saida');
      if (saida) writeFileSync(saida, `${texto}\n`);
      return;
    }
    const evals: LinhaEvalRelatorio[] = arquivo
      ? (JSON.parse(readFileSync(arquivo, 'utf8')) as LinhaEvalRelatorio[])
      : recalcular
        ? await recalcularEmMemoria(prisma, Number(recalcular))
        : ((await prisma.criteriaEval.findMany({
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
          })) as unknown as LinhaEvalRelatorio[]);
    const r = montarRelatorio(evals, quadro, { todos: argv.includes('--todos') });
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
