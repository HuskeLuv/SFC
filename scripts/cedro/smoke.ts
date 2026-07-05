/**
 * Smoke test ao vivo da Cedro Crystal.
 *
 * Roda GP / GCH / SQT / MQC nos casos-teste que batem nas nossas dores de
 * paridade com o Kinvo (split HFOF11 10:1, rendimento mensal de FII, JCP de
 * ação, série longa) e grava raw + parseado em docs/cedro-captures/.
 *
 * Uso (credenciais no .env — CEDRO_HOST/PORT/USER/PASS/SOFTWARE_KEY):
 *   node --env-file=.env --import tsx scripts/cedro/smoke.ts
 *   ... [tickerOpcional]   # roda só um ativo
 *   CEDRO_DEBUG=1 ...      # loga tráfego cru
 *
 * ⚠️ Gotcha: o parser de --env-file do Node trata `#` como comentário. Se a
 * senha tem `#` (ex.: socket#656), ASPAS são obrigatórias no .env:
 *   CEDRO_PASS="socket#656"   (sem aspas vira "socket" → Invalid Login).
 * Software Key = cedro_crystal (NÃO vazia — esse era o "Invalid Login" inicial).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CedroClient } from './cedroClient';
import { parseProventos, parseCandles, parseQuote, parseMqc } from './parsers';

const cfg = {
  host: process.env.CEDRO_HOST ?? 'cd102.cedrotech.com',
  port: Number(process.env.CEDRO_PORT ?? 81),
  user: process.env.CEDRO_USER ?? '',
  pass: process.env.CEDRO_PASS ?? '',
  softwareKey: process.env.CEDRO_SOFTWARE_KEY ?? '',
  commandTimeoutMs: 45_000,
  debug: process.env.CEDRO_DEBUG === '1',
};

interface CaseDef {
  ticker: string;
  nota: string;
}
const CASES: CaseDef[] = [
  { ticker: 'HFOF11', nota: 'FII c/ split 10:1 (bug de duplicação)' },
  { ticker: 'MXRF11', nota: 'FII rendimento mensal' },
  { ticker: 'ITSA4', nota: 'ação c/ JCP' },
  { ticker: 'PETR4', nota: 'blue chip (sanidade)' },
];

const HOJE = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const DESDE = '20140101';

async function safe<T>(label: string, fn: () => Promise<T>): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ ${label}: ${msg}`);
    return { ok: false, error: msg };
  }
}

async function main() {
  if (!cfg.user || !cfg.pass) {
    console.error('Faltam CEDRO_USER / CEDRO_PASS no ambiente.');
    process.exit(1);
  }
  const onlyTicker = process.argv[2]?.toUpperCase();
  const cases = onlyTicker ? CASES.filter((c) => c.ticker === onlyTicker) : CASES;
  if (onlyTicker && cases.length === 0) cases.push({ ticker: onlyTicker, nota: 'ad-hoc' });

  console.log(`Conectando em ${cfg.host}:${cfg.port} como ${cfg.user}…`);
  const client = new CedroClient(cfg);
  await client.connect();
  console.log('✓ autenticado\n');

  const capture: Record<string, unknown> = {
    meta: { host: cfg.host, user: cfg.user, capturadoEm: new Date().toISOString(), casos: cases },
    resultados: {},
  };
  const resultados = capture.resultados as Record<string, unknown>;

  // MQC uma vez só (catálogo Bovespa) — amostra, não a lista inteira.
  console.log('▶ MQC Bovespa (catálogo)…');
  const mqc = await safe('MQC', () => client.sendCommand('MQC Bovespa', CedroClient.doneOn.colonE));
  if (mqc.ok && mqc.data) {
    const ativos = parseMqc(mqc.data);
    console.log(`  ✓ ${ativos.length} ativos. Amostra: ${ativos.slice(0, 8).join(', ')}`);
    resultados.mqc = { totalAtivos: ativos.length, amostra: ativos.slice(0, 30), raw: mqc.data.slice(0, 4000) };
  } else {
    resultados.mqc = { error: mqc.error };
  }

  for (const c of cases) {
    const t = c.ticker;
    console.log(`\n▶ ${t} — ${c.nota}`);
    const r: Record<string, unknown> = { nota: c.nota };

    // SQT snapshot (N = não inscreve)
    const sqt = await safe('SQT', () => client.sendCommand(`SQT ${t} N`, CedroClient.doneOn.bang));
    if (sqt.ok && sqt.data) {
      const q = parseQuote(sqt.data);
      console.log(`  SQT: último=${q?.ultimoPreco} fechAnt=${q?.fechamentoAnterior} desc=${q?.descricao}`);
      r.sqt = { parsed: q, raw: sqt.data.slice(0, 2000) };
    } else r.sqt = { error: sqt.error };

    // GP proventos + eventos corporativos (ordenado por data de pagamento)
    const gp = await safe('GP', () =>
      client.sendCommand(`GP D gp${t.slice(0, 4)} ${DESDE} ${HOJE} ${t} DP`, CedroClient.doneOn.end),
    );
    if (gp.ok && gp.data) {
      const provs = parseProventos(gp.data);
      const tipos = [...new Set(provs.map((p) => p.tipo))];
      const eventos = provs.filter((p) => /desdobr|grupamento|bonific|incorpora/i.test(p.tipo));
      console.log(`  GP: ${provs.length} proventos. Tipos: ${tipos.join(', ') || '—'}`);
      if (eventos.length)
        console.log(
          `      eventos: ${eventos.map((e) => `${e.tipo}(${e.proporcaoAntes}->${e.proporcaoDepois} em ${e.dataEx})`).join('; ')}`,
        );
      r.gp = { total: provs.length, tipos, eventos, proventos: provs, raw: gp.data.slice(0, 6000) };
    } else r.gp = { error: gp.error };

    // GCH candles diários AJUSTADOS (série longa)
    const gch = await safe('GCH', () =>
      client.sendCommand(`GCH ${t} H gc${t.slice(0, 4)} D ${DESDE}0000 ${HOJE}2359`, CedroClient.doneOn.colonE),
    );
    if (gch.ok && gch.data) {
      const candles = parseCandles(gch.data);
      console.log(
        `  GCH(aj): ${candles.length} candles. ${candles[0]?.data}=${candles[0]?.close} … ${candles.at(-1)?.data}=${candles.at(-1)?.close}`,
      );
      r.gch_ajustado = {
        total: candles.length,
        primeiro: candles[0],
        ultimo: candles.at(-1),
        candles,
      };
    } else r.gch_ajustado = { error: gch.error };

    // GCH NP ("no proventos"): neste trial o NP retorna SÓ o candle mais recente
    // (snapshot não-ajustado), não a série histórica — verificado ao vivo em
    // 2026-06-30 (limitação de plano). A série longa vem do GCH ajustado acima.
    const gchNp = await safe('GCH NP', () =>
      client.sendCommand(`GCH ${t} NP H gn${t.slice(0, 4)} D ${DESDE}0000 ${HOJE}2359`, CedroClient.doneOn.colonE),
    );
    if (gchNp.ok && gchNp.data) {
      const candles = parseCandles(gchNp.data);
      console.log(`  GCH(NP): ${candles.length} candle (snapshot não-ajustado; NP não dá série neste trial)`);
      r.gch_np_snapshot = { nota: 'NP retorna só o candle mais recente neste trial', candles };
    } else r.gch_np_snapshot = { error: gchNp.error };

    resultados[t] = r;
  }

  await client.quit();

  const dir = join(process.cwd(), 'docs', 'cedro-captures');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `cedro-smoke-${HOJE}.json`);
  writeFileSync(file, JSON.stringify(capture, null, 2));
  console.log(`\n✓ Captura salva em ${file}`);
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
