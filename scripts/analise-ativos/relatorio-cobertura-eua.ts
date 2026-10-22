/**
 * Relatório de cobertura dos fundamentos SEC no UNIVERSO EUA (Stocks e REITs, fatia A) — o aceite
 * antes de ligar critérios/Quadro EUA (desenho.json → fatias[A].criterios_aceite):
 *  - stocks não financeiras ≥ 90% em ebitda e fcl e ≥ 85% em dl; REITs ≥ 85% em dl — na janela 5
 *    (os 6 últimos FY fechados, todos com dado); abaixo disso, a lista de campos faltantes;
 *  - ≥ 95% dos CIKs com receita e lucro em 10 de 11 anos, entre os que têm os 11 FY na SEC (IPO ou
 *    spin-off depois do início da janela não entra na conta: decisão do Wellington de 22/10/2026);
 *  - CIKs do universo sem nenhum FY SEC (moeda ≠ USD, trust sem DRE… → override ou SIC fora);
 *  - data do free float de capa (anual por natureza) e overrides aplicados.
 * Só leitura do banco (nenhuma escrita). Critério aqui = dado presente (não se atende); quem avalia é
 * o criterios-eua (fatia B).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/relatorio-cobertura-eua.ts [--ancora=2025]
 *     [--saida=/tmp/cobertura.txt]
 *   npx tsx scripts/analise-ativos/relatorio-cobertura-eua.ts --validar-conceitos=/tmp/c.json
 *     (consulta os frames da SEC para cada conceito das cadeias: existe = HTTP 200 em algum ano)
 */
import { writeFileSync } from 'fs';
import {
  conceitosDasCadeias,
  unidadesDosConceitos,
} from '../../src/services/analiseAtivos/eua/cadeiasConceitos';
import { OVERRIDES_EUA } from '../../src/services/analiseAtivos/eua/overridesEua';
import { criarSecCliente, urlSec } from '../../src/services/analiseAtivos/eua/secCliente';
import { paraData, paraNumero } from '../../src/services/analiseAtivos/repositorio/conversao';
import { prisma } from '../../src/lib/prisma';
import { SEC_URLS, emissorIdSec } from '../../src/types/analiseAtivosEua';

function arg(nome: string): string | undefined {
  const a = process.argv.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  if (!a) return undefined;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : 'true';
}

type Fy = Record<string, number | null> & { anoFiscal: number };

const CAMPOS = [
  'receita',
  'lucroAtribuivel',
  'ebit',
  'depreciacaoAmortizacao',
  'dividaBrutaLp',
  'caixa',
  'fco',
  'capex',
  'dividendosJcpPagos',
  'acoesMediaDiluida',
  'dpa',
] as const;

/**
 * Campos exigidos por critério (dado presente em TODOS os anos da janela). dl: dívida sem conceito
 * no ano conta como zero (mesma regra de multiplos.dividaLiquida do BR); a cobertura de
 * dividaBrutaLp sai na linha 'por campo'.
 */
const CRITERIOS: Record<'stock' | 'reit', Record<string, readonly (typeof CAMPOS)[number][]>> = {
  stock: {
    rec: ['receita'],
    luc: ['lucroAtribuivel'],
    ebitda: ['ebit', 'depreciacaoAmortizacao'],
    mg: ['receita', 'lucroAtribuivel'],
    dl: ['caixa', 'ebit', 'depreciacaoAmortizacao'],
    fcl: ['fco', 'capex'],
  },
  reit: {
    rec: ['receita'],
    dpa: ['dpa'],
    fco_acao: ['fco', 'acoesMediaDiluida'],
    dl: ['caixa', 'ebit', 'depreciacaoAmortizacao'],
    pay: ['dividendosJcpPagos', 'fco'],
  },
};
/** Metas do aceite (fração) — ausente = só informativo. */
const METAS: Record<string, number> = {
  'stock:ebitda': 0.9,
  'stock:fcl': 0.9,
  'stock:dl': 0.85,
  'reit:dl': 0.85,
};

const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

async function validarConceitos(saida: string) {
  const cli = criarSecCliente();
  const unidades = unidadesDosConceitos();
  const out: { conceito: string; periodo: string; empresas: number }[] = [];
  const faltando: string[] = [];
  for (const c of conceitosDasCadeias()) {
    const [taxonomia, conceito] = c.split(':');
    const u = unidades.get(c)!;
    let achou = false;
    for (const ano of [2023, 2018, 2015]) {
      const periodo = u.tipo === 'instante' ? `CY${ano}Q4I` : `CY${ano}`;
      const r = await cli.obterJson<{ data: unknown[] }>(
        urlSec(SEC_URLS.frames, {
          taxonomia,
          conceito,
          unidade: u.unidade.replace('/', '-per-'),
          periodo,
        }),
      );
      if (r && r.data.length > 0) {
        out.push({ conceito: c, periodo, empresas: r.data.length });
        achou = true;
        break;
      }
    }
    if (!achou) faltando.push(c);
    console.log(`${achou ? 'ok ' : 'NÃO'} ${c}`);
  }
  writeFileSync(
    saida,
    `${JSON.stringify({ geradoEm: new Date().toISOString(), conceitos: out, faltando }, null, 2)}\n`,
  );
  console.log(`→ ${saida} (${out.length} ok, ${faltando.length} sem frame)`);
}

async function relatorio() {
  const hoje = new Date().toISOString().slice(0, 10);
  const ancora = Number(arg('ancora') ?? Number(hoje.slice(0, 4)) - 1);
  const janela = 5;
  const anosJanela = Array.from({ length: janela + 1 }, (_, i) => ancora - janela + i);
  const anos11 = Array.from({ length: 11 }, (_, i) => ancora - 10 + i);
  const linhas: string[] = [];
  const p = (s = '') => linhas.push(s);

  const empresas = await prisma.secCompany.findMany({
    where: { noUniverso: true },
    select: {
      cik: true,
      nome: true,
      classe: true,
      ehFinanceira: true,
      cikHistorico: true,
      publicFloatUsd: true,
      publicFloatData: true,
      segmento: true,
    },
    orderBy: { cik: 'asc' },
  });
  const tickers = await prisma.secCompanyTicker.findMany({
    where: { cik: { in: empresas.map((e) => e.cik) }, validTo: null, principal: true },
    select: { cik: true, symbol: true },
  });
  const tickerDe = new Map(tickers.map((t) => [t.cik, t.symbol]));
  const fora = await prisma.secCompany.groupBy({
    by: ['foraMotivo'],
    where: { noUniverso: false },
    _count: true,
  });

  p(`Cobertura dos fundamentos SEC no universo EUA — ${new Date().toISOString()}`);
  p(
    `Âncora FY${ancora} · janela ${janela} = FY${anosJanela[0]}–FY${ancora} (todos os anos com dado)`,
  );
  p(
    `Universo: ${empresas.length} CIKs (stock ${empresas.filter((e) => e.classe === 'stock').length}, ` +
      `reit ${empresas.filter((e) => e.classe === 'reit').length}); fora: ` +
      fora.map((f) => `${f.foraMotivo ?? '?'} ${f._count}`).join(', '),
  );
  p();

  const grupos: Record<
    string,
    { rotulo: string; perfil: 'stock' | 'reit'; ciks: typeof empresas }
  > = {
    stock: { rotulo: 'Stocks não financeiras', perfil: 'stock', ciks: [] },
    stock_financeira: { rotulo: 'Stocks financeiras', perfil: 'stock', ciks: [] },
    reit: { rotulo: 'REITs', perfil: 'reit', ciks: [] },
  };
  for (const e of empresas) {
    const k = e.classe === 'reit' ? 'reit' : e.ehFinanceira ? 'stock_financeira' : 'stock';
    grupos[k].ciks.push(e);
  }

  let com10de11 = 0;
  let com11fy = 0;
  let com10de11Total = 0;
  const menos10: string[] = [];
  const semFy: string[] = [];
  const aceite: string[] = [];
  const conceitosUsados = new Map<string, Map<string, number>>();

  for (const [chave, g] of Object.entries(grupos)) {
    const criterios = CRITERIOS[g.perfil];
    const atende: Record<string, number> = Object.fromEntries(
      Object.keys(criterios).map((c) => [c, 0]),
    );
    const campoCob: Record<string, number> = Object.fromEntries(CAMPOS.map((c) => [c, 0]));
    const faltas: Record<string, string[]> = {};
    for (const e of g.ciks) {
      const emissor = emissorIdSec(e.cikHistorico ?? e.cik);
      const rows = await prisma.assetFundamentalsPeriod.findMany({
        where: { emissorId: emissor, source: 'SEC', tipoPeriodo: 'FY' },
        orderBy: [{ dtFim: 'desc' }, { versao: 'desc' }],
      });
      const porAno = new Map<number, Fy>();
      const vistosFim = new Set<string>();
      for (const r of rows) {
        const fim = paraData(r.dtFim);
        if (vistosFim.has(fim)) continue;
        vistosFim.add(fim);
        if (porAno.has(r.anoFiscal)) continue;
        const fy: Fy = { anoFiscal: r.anoFiscal };
        for (const c of CAMPOS) fy[c] = paraNumero(r[c] as Parameters<typeof paraNumero>[0]);
        porAno.set(r.anoFiscal, fy);
        const sc = (r.sourceConcept ?? {}) as Record<string, string>;
        if (anosJanela.includes(r.anoFiscal)) {
          for (const [campo, conc] of Object.entries(sc)) {
            const m = conceitosUsados.get(campo) ?? new Map<string, number>();
            const k = conc.startsWith('derivado:')
              ? 'derivado'
              : conc.replace(/^(pre_ir|lucro):.*$/, '$1:…');
            m.set(k, (m.get(k) ?? 0) + 1);
            conceitosUsados.set(campo, m);
          }
        }
      }
      const temTodos = (campos: readonly string[]) =>
        anosJanela.every((a) => campos.every((c) => (porAno.get(a)?.[c] ?? null) !== null));
      for (const c of CAMPOS) if (temTodos([c])) campoCob[c]++;
      for (const [crit, campos] of Object.entries(criterios)) {
        if (temTodos(campos)) atende[crit]++;
        else {
          const faltam = campos.filter((c) => !temTodos([c]));
          const anosSem = anosJanela.filter((a) =>
            campos.some((c) => (porAno.get(a)?.[c] ?? null) === null),
          );
          (faltas[crit] ??= []).push(
            `${tickerDe.get(e.cik) ?? e.cik} (${faltam.join('+')}; FY ${anosSem.join(',')})`,
          );
        }
      }
      if (porAno.size === 0) semFy.push(`${tickerDe.get(e.cik) ?? e.cik} (${e.cik})`);
      const rl = anos11.filter(
        (a) => porAno.get(a)?.receita != null && porAno.get(a)?.lucroAtribuivel != null,
      ).length;
      if (rl >= 10) com10de11Total++;
      if (anos11.every((a) => porAno.has(a))) {
        com11fy++;
        if (rl >= 10) com10de11++;
        else menos10.push(`${tickerDe.get(e.cik) ?? e.cik} ${rl}/11`);
      }
    }
    const n = g.ciks.length;
    p(`== ${g.rotulo} (${n})`);
    p(
      `  por campo (janela ${janela}): ` +
        CAMPOS.map((c) => `${c} ${pct(campoCob[c], n)}`).join(' · '),
    );
    for (const crit of Object.keys(criterios)) {
      const meta = chave !== 'stock_financeira' ? METAS[`${g.perfil}:${crit}`] : undefined;
      const frac = n ? atende[crit] / n : 0;
      const marca =
        meta === undefined
          ? ''
          : frac >= meta
            ? `  ✔ meta ${meta * 100}%`
            : `  ✘ ABAIXO da meta ${meta * 100}%`;
      p(
        `  ${crit.padEnd(9)} ${String(atende[crit]).padStart(4)}/${n}  ${pct(atende[crit], n)}${marca}`,
      );
      if (meta !== undefined)
        aceite.push(`${g.rotulo} ${crit}: ${pct(atende[crit], n)} (meta ${meta * 100}%)`);
      if (faltas[crit]?.length)
        p(
          `      sem dado: ${faltas[crit].slice(0, 25).join('; ')}${faltas[crit].length > 25 ? ` … +${faltas[crit].length - 25}` : ''}`,
        );
    }
    p();
  }

  const marca10 = com11fy && com10de11 / com11fy >= 0.95 ? '✔' : '✘';
  p(
    `Receita e lucro em ≥ 10 de 11 anos (FY${anos11[0]}–FY${ancora}), entre os ${com11fy} CIKs com os 11 FY: ` +
      `${com10de11}/${com11fy} = ${pct(com10de11, com11fy)} ${marca10} meta 95% ` +
      `(universo inteiro: ${com10de11Total}/${empresas.length} = ${pct(com10de11Total, empresas.length)}, informativo)`,
  );
  if (menos10.length) p(`  abaixo de 10/11: ${menos10.join(' · ')}`);
  aceite.push(`Receita e lucro 10/11 (com 11 FY): ${pct(com10de11, com11fy)} (meta 95%)`);
  p(
    semFy.length
      ? `✘ No universo SEM nenhum FY SEC (${semFy.length}): ${semFy.join(' · ')}`
      : '✔ Todo CIK do universo tem FY SEC',
  );
  p();
  p('Aceite:');
  for (const a of aceite) p(`  ${a}`);
  p();
  p('Conceitos usados na janela (campo → conceito × anos-empresa):');
  for (const [campo, m] of [...conceitosUsados].sort()) {
    p(
      `  ${campo}: ${[...m]
        .sort((a, b) => b[1] - a[1])
        .map(([c, k]) => `${c} ${k}`)
        .join(' · ')}`,
    );
  }
  p();
  const datas = new Map<string, number>();
  for (const e of empresas) {
    const d = e.publicFloatData ? paraData(e.publicFloatData).slice(0, 7) : 'sem data';
    datas.set(d, (datas.get(d) ?? 0) + 1);
  }
  p(
    'Data do free float de capa (AAAA-MM → CIKs): ' +
      [...datas]
        .sort()
        .map(([d, k]) => `${d} ${k}`)
        .join(' · '),
  );
  p('Overrides por CIK: ' + OVERRIDES_EUA.map((o) => `${o.cik} ${o.acao}`).join(' · '));
  p();
  p('Universo (ticker principal · classe · float US$ bi · data):');
  for (const e of empresas) {
    const f = paraNumero(e.publicFloatUsd);
    p(
      `  ${(tickerDe.get(e.cik) ?? '?').padEnd(6)} ${e.cik} ${String(e.classe).padEnd(5)}${e.ehFinanceira ? ' fin' : '    '} ` +
        `${f === null ? '—' : (f / 1e9).toFixed(1).padStart(7)} ${e.publicFloatData ? paraData(e.publicFloatData) : '—'} ${e.segmento ?? ''} ${e.nome}`,
    );
  }
  const texto = `${linhas.join('\n')}\n`;
  console.log(texto);
  const saida = arg('saida');
  if (saida) writeFileSync(saida, texto);
}

async function main() {
  const validar = arg('validar-conceitos');
  if (validar) await validarConceitos(validar);
  else await relatorio();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
