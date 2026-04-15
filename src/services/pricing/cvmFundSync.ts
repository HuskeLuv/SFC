import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import AdmZip from 'adm-zip';
import prisma from '@/lib/prisma';

// ================== CONSTANTS ==================

const CVM_DAILY_URL = (yyyymm: string) =>
  `https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_${yyyymm}.zip`;

const CVM_FUND_REGISTRY_URL = 'https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv';

/** Number of rows to upsert per transaction batch */
const BATCH_SIZE = 50;

/** Number of funds to upsert per catalog batch */
const CATALOG_BATCH_SIZE = 100;

// ================== TYPES ==================

interface CvmDailyRow {
  cnpj: string;
  date: Date;
  quotaValue: number;
  netWorth: number | null;
  totalValue: number | null;
  shareholders: number | null;
  dailyInflow: number | null;
  dailyOutflow: number | null;
}

export interface CvmFundSyncResult {
  inserted: number;
  updated: number;
  errors: number;
  duration: number;
  fundsProcessed: number;
  targetCnpjs: number;
}

// ================== HELPERS ==================

/**
 * Extract a CSV from a ZIP buffer and parse into an array of records.
 * CVM ZIP files contain a single semicolon-delimited CSV file.
 */
function extractCsvFromZip(buffer: Buffer): Record<string, unknown>[] {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const csvEntry = entries.find((e) => e.entryName.endsWith('.csv'));
  if (!csvEntry) throw new Error('ZIP não contém arquivo CSV');

  const csvText = csvEntry.getData().toString('latin1'); // CVM uses ISO-8859-1
  const lines = csvText.split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(';').map((h) => h.trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(';');
    const row: Record<string, unknown> = {};
    for (let j = 0; j < header.length && j < cols.length; j++) {
      row[header[j]] = cols[j].trim();
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Strip CNPJ formatting: "12.345.678/0001-90" → "12345678000190"
 */
const normalizeCnpj = (cnpj: string): string => cnpj.replace(/[.\-/]/g, '');

/**
 * Get YYYYMM string for a given date.
 */
const getYYYYMM = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
};

/**
 * Parse a numeric string, returning null for empty/invalid.
 */
const parseNum = (val: unknown): number | null => {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
};

// ================== CORE SYNC ==================

/**
 * Synchronize CVM fund quota data for funds held by platform users.
 *
 * Strategy:
 * 1. Query DB for all Asset records with a CNPJ (fund assets users actually hold)
 * 2. Download the current month's CVM INF_DIARIO ZIP
 * 3. Extract and parse the CSV, filtering by target CNPJs
 * 4. Upsert matching rows to CvmFundQuota
 * 5. Update Asset.currentPrice for linked funds
 */
export async function runCvmFundSync(): Promise<CvmFundSyncResult> {
  const startTime = Date.now();

  console.log('📋 Iniciando sincronização CVM Fundos...');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  let fundsProcessed = 0;

  // 1. Find target CNPJs — only funds users actually hold in their portfolios.
  //    Previously this queried ALL 25k CVM assets, causing massive filtered rows
  //    and timeouts. Now we only sync what's actually in someone's portfolio.
  const fundAssets = await prisma.asset.findMany({
    where: {
      cnpj: { not: null },
      portfolios: { some: {} },
    },
    select: { id: true, symbol: true, cnpj: true },
  });

  const targetCnpjs = new Set(fundAssets.filter((a) => a.cnpj).map((a) => normalizeCnpj(a.cnpj!)));

  if (targetCnpjs.size === 0) {
    console.log('ℹ️  Nenhum fundo com CNPJ cadastrado. Pulando sincronização CVM.');
    const duration = (Date.now() - startTime) / 1000;
    return { inserted, updated, errors, duration, fundsProcessed, targetCnpjs: 0 };
  }

  console.log(`🎯 ${targetCnpjs.size} CNPJs alvo encontrados`);

  // 2. Download ZIP (try current month, fall back to previous)
  const now = new Date();
  const currentMonth = getYYYYMM(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = getYYYYMM(prevDate);

  let zipBuffer: ArrayBuffer | null = null;
  let usedMonth = currentMonth;

  for (const month of [currentMonth, prevMonth]) {
    const url = CVM_DAILY_URL(month);
    try {
      console.log(`📥 Tentando baixar: ${url}`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000, // 20s — leave headroom for parsing + DB writes within Vercel's 60s limit
      });
      zipBuffer = response.data;
      usedMonth = month;
      console.log(`✅ ZIP baixado: ${(zipBuffer!.byteLength / 1024 / 1024).toFixed(1)} MB`);
      break;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : 'unknown';
      console.warn(`⚠️  Falha ao baixar mês ${month} (status: ${status})`);
    }
  }

  if (!zipBuffer) {
    throw new Error('Não foi possível baixar o arquivo CVM INF_DIARIO para nenhum mês');
  }

  // 3. Extract and parse CSV from ZIP
  console.log(`📄 Extraindo CSV do ZIP (mês: ${usedMonth})...`);
  const csvRows = extractCsvFromZip(Buffer.from(zipBuffer));
  console.log(`📊 ${csvRows.length} linhas totais no CSV`);

  // 4. Filter by target CNPJs and parse
  const filteredRows: CvmDailyRow[] = [];

  for (const row of csvRows) {
    // CVM uses CNPJ_FUNDO or CNPJ_FUNDO_CLASSE depending on version
    const rawCnpj = String(row['CNPJ_FUNDO_CLASSE'] ?? row['CNPJ_FUNDO'] ?? '');
    const cnpj = normalizeCnpj(rawCnpj);

    if (!targetCnpjs.has(cnpj)) continue;

    const dateStr = String(row['DT_COMPTC'] ?? '');
    if (!dateStr) continue;

    const quotaValue = parseNum(row['VL_QUOTA']);
    if (quotaValue === null || quotaValue === 0) continue;

    filteredRows.push({
      cnpj,
      date: new Date(dateStr),
      quotaValue,
      netWorth: parseNum(row['VL_PATRIM_LIQ']),
      totalValue: parseNum(row['VL_TOTAL']),
      shareholders: (() => {
        const n = parseNum(row['NR_COTST']);
        return n !== null ? Math.round(n) : null;
      })(),
      dailyInflow: parseNum(row['CAPTC_DIA']),
      dailyOutflow: parseNum(row['RESG_DIA']),
    });
  }

  console.log(`🎯 ${filteredRows.length} linhas correspondentes aos CNPJs alvo`);

  // 5. Upsert in batches
  for (let i = 0; i < filteredRows.length; i += BATCH_SIZE) {
    const batch = filteredRows.slice(i, i + BATCH_SIZE);

    try {
      // Check existing for counting
      const existingKeys = await prisma.cvmFundQuota.findMany({
        where: {
          OR: batch.map((r) => ({ cnpj: r.cnpj, date: r.date })),
        },
        select: { cnpj: true, date: true },
      });

      const existingSet = new Set(existingKeys.map((k) => `${k.cnpj}|${k.date.toISOString()}`));

      const operations = batch.map((row) =>
        prisma.cvmFundQuota.upsert({
          where: {
            cnpj_date: { cnpj: row.cnpj, date: row.date },
          },
          update: {
            quotaValue: new Decimal(row.quotaValue),
            netWorth: row.netWorth !== null ? new Decimal(row.netWorth) : null,
            totalValue: row.totalValue !== null ? new Decimal(row.totalValue) : null,
            shareholders: row.shareholders,
            dailyInflow: row.dailyInflow !== null ? new Decimal(row.dailyInflow) : null,
            dailyOutflow: row.dailyOutflow !== null ? new Decimal(row.dailyOutflow) : null,
            updatedAt: new Date(),
          },
          create: {
            cnpj: row.cnpj,
            date: row.date,
            quotaValue: new Decimal(row.quotaValue),
            netWorth: row.netWorth !== null ? new Decimal(row.netWorth) : null,
            totalValue: row.totalValue !== null ? new Decimal(row.totalValue) : null,
            shareholders: row.shareholders,
            dailyInflow: row.dailyInflow !== null ? new Decimal(row.dailyInflow) : null,
            dailyOutflow: row.dailyOutflow !== null ? new Decimal(row.dailyOutflow) : null,
          },
        }),
      );

      await prisma.$transaction(operations);

      for (const row of batch) {
        const key = `${row.cnpj}|${row.date.toISOString()}`;
        if (existingSet.has(key)) {
          updated++;
        } else {
          inserted++;
        }
      }
    } catch (batchErr) {
      console.error(`❌ Erro no batch ${i}-${i + batch.length}:`, batchErr);
      errors += batch.length;
    }
  }

  // 6. Bridge: update Asset.currentPrice for fund assets
  fundsProcessed = await bridgeCvmToAssetPrices(fundAssets);

  const duration = (Date.now() - startTime) / 1000;

  console.log('📊 Resultado CVM Fundos:');
  console.log(`   • ${inserted} inseridos, ${updated} atualizados, ${errors} erros`);
  console.log(`   • ${fundsProcessed} ativos atualizados com cota CVM`);
  console.log(`   • Duração: ${duration.toFixed(2)}s`);

  return {
    inserted,
    updated,
    errors,
    duration,
    fundsProcessed,
    targetCnpjs: targetCnpjs.size,
  };
}

/**
 * Update Asset.currentPrice with the latest CVM quota value for each fund.
 */
async function bridgeCvmToAssetPrices(
  fundAssets: { id: string; symbol: string; cnpj: string | null }[],
): Promise<number> {
  console.log('🔗 Atualizando preços de fundos com cotas CVM...');
  let bridged = 0;

  for (const asset of fundAssets) {
    if (!asset.cnpj) continue;
    const cnpj = normalizeCnpj(asset.cnpj);

    const latestQuota = await prisma.cvmFundQuota.findFirst({
      where: { cnpj },
      orderBy: { date: 'desc' },
      select: { quotaValue: true, date: true },
    });

    if (!latestQuota) continue;

    const now = new Date();
    await prisma.$transaction([
      prisma.asset.update({
        where: { id: asset.id },
        data: {
          currentPrice: latestQuota.quotaValue,
          priceUpdatedAt: now,
          source: 'cvm',
        },
      }),
      prisma.assetPriceHistory.upsert({
        where: {
          symbol_date: {
            symbol: asset.symbol,
            date: latestQuota.date,
          },
        },
        update: { price: latestQuota.quotaValue },
        create: {
          assetId: asset.id,
          symbol: asset.symbol,
          price: latestQuota.quotaValue,
          currency: 'BRL',
          source: 'CVM',
          date: latestQuota.date,
        },
      }),
    ]);

    bridged++;
  }

  console.log(`   ✅ ${bridged} fundos atualizados com cota CVM`);
  return bridged;
}

// ================== FUND CATALOG SYNC ==================

export interface CvmCatalogSyncResult {
  inserted: number;
  updated: number;
  errors: number;
  duration: number;
  totalActive: number;
}

/**
 * Download the current month's CVM INF_DIARIO ZIP and extract distinct fund CNPJs
 * with their names, creating searchable Asset records for each active fund.
 *
 * Why INF_DIARIO instead of cad_fi.csv? The legacy cad_fi.csv shows most funds as
 * "CANCELADA" (migrated to RCVM 175 structure). The INF_DIARIO contains all funds
 * that are actually operating and publishing daily quotas — the true active set.
 *
 * Symbol format: CVM-{CNPJ14} (deterministic, stable across syncs)
 * Source: 'cvm'
 *
 * Should be run weekly (or on first deploy).
 */
export async function runCvmCatalogSync(): Promise<CvmCatalogSyncResult> {
  const startTime = Date.now();

  console.log('📚 Iniciando sincronização do catálogo CVM de fundos...');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  // 1. Download INF_DIARIO ZIP (same as daily sync, but process ALL CNPJs)
  const now = new Date();
  const currentMonth = getYYYYMM(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = getYYYYMM(prevDate);

  let zipBuffer: ArrayBuffer | null = null;

  for (const month of [currentMonth, prevMonth]) {
    const url = CVM_DAILY_URL(month);
    try {
      console.log(`📥 Tentando baixar: ${url}`);
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      zipBuffer = response.data;
      console.log(`✅ ZIP baixado: ${(zipBuffer!.byteLength / 1024 / 1024).toFixed(1)} MB`);
      break;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : 'unknown';
      console.warn(`⚠️  Falha ao baixar mês ${month} (status: ${status})`);
    }
  }

  if (!zipBuffer) {
    throw new Error('Não foi possível baixar o arquivo CVM INF_DIARIO');
  }

  // 2. Extract and parse
  const csvRows = extractCsvFromZip(Buffer.from(zipBuffer));
  console.log(`📊 ${csvRows.length} linhas totais no CSV`);

  // 3. Extract distinct CNPJs with latest quota
  const fundMap = new Map<string, { cnpj: string; latestQuota: number; latestDate: string }>();

  for (const row of csvRows) {
    const rawCnpj = String(row['CNPJ_FUNDO_CLASSE'] ?? row['CNPJ_FUNDO'] ?? '');
    const cnpj = normalizeCnpj(rawCnpj);
    if (cnpj.length < 11) continue;

    const dateStr = String(row['DT_COMPTC'] ?? '');
    const quota = Number(row['VL_QUOTA']);
    if (!dateStr || isNaN(quota) || quota === 0) continue;

    const existing = fundMap.get(cnpj);
    if (!existing || dateStr > existing.latestDate) {
      fundMap.set(cnpj, { cnpj, latestQuota: quota, latestDate: dateStr });
    }
  }

  const activeCnpjs = Array.from(fundMap.values());
  console.log(`🎯 ${activeCnpjs.length} fundos distintos com cotas no mês`);

  // 4. Cross-reference with cad_fi.csv for fund names (best-effort)
  const nameMap = new Map<string, { name: string; classe: string }>();
  try {
    console.log('📥 Baixando cad_fi.csv para nomes dos fundos...');
    const { data: regCsv } = await axios.get<string>(CVM_FUND_REGISTRY_URL, {
      responseType: 'text',
      timeout: 30000,
    });
    const regLines = regCsv.split('\n');
    const regHeader = regLines[0].split(';').map((h) => h.trim());
    const iCnpj = regHeader.indexOf('CNPJ_FUNDO');
    const iNome = regHeader.indexOf('DENOM_SOCIAL');
    const iClasse = regHeader.indexOf('CLASSE');

    if (iCnpj !== -1 && iNome !== -1) {
      for (let i = 1; i < regLines.length; i++) {
        const cols = regLines[i].split(';');
        if (cols.length <= Math.max(iCnpj, iNome)) continue;
        const cnpj = normalizeCnpj((cols[iCnpj] || '').trim());
        const nome = (cols[iNome] || '').trim();
        const classe = iClasse !== -1 ? (cols[iClasse] || '').trim() : '';
        if (cnpj && nome) {
          nameMap.set(cnpj, { name: nome, classe });
        }
      }
      console.log(`📝 ${nameMap.size} nomes carregados do registro`);
    }
  } catch {
    console.warn('⚠️  Não foi possível carregar nomes do registro. Usando CNPJ como nome.');
  }

  // 5. Upsert Asset records
  for (let i = 0; i < activeCnpjs.length; i += CATALOG_BATCH_SIZE) {
    const batch = activeCnpjs.slice(i, i + CATALOG_BATCH_SIZE);

    try {
      const operations = batch.map((fund) => {
        const symbol = `CVM-${fund.cnpj}`;
        const reg = nameMap.get(fund.cnpj);
        const name = reg?.name || `Fundo ${fund.cnpj}`;
        const type = inferFundType(reg?.classe || '', name);

        return prisma.asset.upsert({
          where: { symbol },
          update: {
            name,
            currentPrice: new Decimal(fund.latestQuota),
            priceUpdatedAt: new Date(fund.latestDate),
          },
          create: {
            symbol,
            name,
            type,
            currency: 'BRL',
            source: 'cvm',
            cnpj: fund.cnpj,
            currentPrice: new Decimal(fund.latestQuota),
            priceUpdatedAt: new Date(fund.latestDate),
          },
        });
      });

      const symbols = batch.map((f) => `CVM-${f.cnpj}`);
      const existing = await prisma.asset.findMany({
        where: { symbol: { in: symbols } },
        select: { symbol: true },
      });
      const existingSet = new Set(existing.map((a) => a.symbol));

      await prisma.$transaction(operations);

      for (const fund of batch) {
        if (existingSet.has(`CVM-${fund.cnpj}`)) {
          updated++;
        } else {
          inserted++;
        }
      }
    } catch (batchErr) {
      console.error(`❌ Erro no batch de catálogo ${i}-${i + batch.length}:`, batchErr);
      errors += batch.length;
    }
  }

  const duration = (Date.now() - startTime) / 1000;

  console.log('📊 Resultado catálogo CVM:');
  console.log(`   • ${inserted} inseridos, ${updated} atualizados, ${errors} erros`);
  console.log(`   • Duração: ${duration.toFixed(2)}s`);

  return {
    inserted,
    updated,
    errors,
    duration,
    totalActive: activeCnpjs.length,
  };
}

/**
 * Infer Asset.type from CVM class name and fund name.
 */
function inferFundType(classe: string, name: string): string {
  const text = `${classe} ${name}`.toUpperCase();
  if (text.includes('IMOBILI') || text.includes(' FII ') || text.includes('FII ')) return 'fii';
  if (
    text.includes('PREVID') ||
    text.includes(' PREV ') ||
    text.includes('PGBL') ||
    text.includes('VGBL')
  )
    return 'previdencia';
  if (text.includes(' FIA ') || text.includes('AÇÕES')) return 'fund';
  return 'fund';
}
