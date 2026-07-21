import { logger } from '@/lib/logger';
import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import AdmZip from 'adm-zip';
import prisma from '@/lib/prisma';

// ================== CONSTANTS ==================

const CVM_DAILY_URL = (yyyymm: string) =>
  `https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_${yyyymm}.zip`;

// A CVM só mantém ZIPs MENSAIS de 2021-01 em diante; 2000-2020 ficam arquivados
// por ANO em DADOS/HIST (um ZIP anual com um CSV por mês dentro). Verificado
// em 2026-07: mensal 202012 → 404; HIST 2000..2020 → 200; HIST 1999 → 404.
const CVM_HIST_URL = (yyyy: string) =>
  `https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/HIST/inf_diario_fi_${yyyy}.zip`;

export const CVM_MONTHLY_SINCE = '202101';

/** ZIPs anuais do HIST são ~10× o mensal — timeout próprio, mais folgado. */
const CVM_HIST_TIMEOUT_MS = 300_000;

// RCVM 175 — fonte primária do catálogo. Inclui FIDC, FIP, FII, Fiagro, FIIM
// que NÃO publicam INF_DIARIO (fundos fechados / com reporte mensal/trimestral).
// ~88k entries totais, ~33k em funcionamento normal.
const CVM_REGISTRO_URL = 'https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip';

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
 * Parse a semicolon-delimited CSV text into an array of records (header → cell).
 * CVM CSVs use ISO-8859-1; o caller é responsável por já ter decodificado.
 */
function parseCsvText(csvText: string): Record<string, string>[] {
  const lines = csvText.split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(';').map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(';');
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length && j < cols.length; j++) {
      row[header[j]] = cols[j].trim();
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Extract a single CSV from a ZIP buffer and parse. Use quando o ZIP tem 1 CSV.
 */
function extractCsvFromZip(buffer: Buffer): Record<string, string>[] {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const csvEntry = entries.find((e) => e.entryName.endsWith('.csv'));
  if (!csvEntry) throw new Error('ZIP não contém arquivo CSV');
  return parseCsvText(csvEntry.getData().toString('latin1'));
}

/**
 * Extract multiple CSVs from a ZIP buffer. Use quando o ZIP tem N CSVs (ex.:
 * registro_fundo_classe.zip que traz registro_fundo, registro_classe,
 * registro_subclasse). Retorna Map por nome de arquivo (sem extensão).
 */
function extractMultipleCsvsFromZip(buffer: Buffer): Map<string, Record<string, string>[]> {
  const zip = new AdmZip(buffer);
  const result = new Map<string, Record<string, string>[]>();
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.endsWith('.csv')) continue;
    const key = entry.entryName.replace(/\.csv$/, '');
    result.set(key, parseCsvText(entry.getData().toString('latin1')));
  }
  return result;
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

/**
 * Particiona os meses pedidos entre o formato mensal (>= 2021-01) e os anos do
 * arquivo HIST (< 2021-01, um ZIP anual). Exportado para teste.
 */
export const splitMonthsForCvmFetch = (
  months: string[],
): { monthly: string[]; histYears: string[]; histMonths: Set<string> } => {
  const monthly = months.filter((m) => m >= CVM_MONTHLY_SINCE);
  const hist = months.filter((m) => m < CVM_MONTHLY_SINCE);
  return {
    monthly,
    histYears: [...new Set(hist.map((m) => m.slice(0, 4)))].sort().reverse(),
    histMonths: new Set(hist),
  };
};

/**
 * Mapeia linhas cruas do CSV INF_DIARIO para CvmDailyRow, filtrando pelos
 * CNPJs alvo e (opcionalmente) pelos meses pedidos — o ZIP anual do HIST traz
 * o ano inteiro mesmo quando a janela só alcança parte dele.
 */
const collectDailyRows = (
  csvRows: Record<string, string>[],
  targetCnpjs: Set<string>,
  wantedMonths: Set<string> | null,
  sink: CvmDailyRow[],
): void => {
  for (const row of csvRows) {
    // CVM uses CNPJ_FUNDO or CNPJ_FUNDO_CLASSE depending on version
    const rawCnpj = String(row['CNPJ_FUNDO_CLASSE'] ?? row['CNPJ_FUNDO'] ?? '');
    const cnpj = normalizeCnpj(rawCnpj);
    if (!targetCnpjs.has(cnpj)) continue;

    const dateStr = String(row['DT_COMPTC'] ?? '');
    if (!dateStr) continue;
    if (wantedMonths && !wantedMonths.has(dateStr.slice(0, 7).replace('-', ''))) continue;

    const quotaValue = parseNum(row['VL_QUOTA']);
    if (quotaValue === null || quotaValue === 0) continue;

    sink.push({
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
export async function runCvmFundSync(opts?: { monthsBack?: number }): Promise<CvmFundSyncResult> {
  const startTime = Date.now();

  logger.info('📋 Iniciando sincronização CVM Fundos...');
  logger.info(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);

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
    logger.info('ℹ️  Nenhum fundo com CNPJ cadastrado. Pulando sincronização CVM.');
    const duration = (Date.now() - startTime) / 1000;
    return { inserted, updated, errors, duration, fundsProcessed, targetCnpjs: 0 };
  }

  logger.info(`🎯 ${targetCnpjs.size} CNPJs alvo encontrados`);

  // 2. Baixar os últimos `monthsBack` meses de INF_DIARIO e acumular.
  //    Daily cron usa 2 (mês atual + anterior — pega cotas publicadas com
  //    atraso); o registro de fundo e o backfill de histórico pedem mais meses
  //    pra alimentar o gráfico longo. Meses >= 2021-01 são um ZIP mensal cada;
  //    anteriores caem no fallback HIST (ZIP anual, disponível até 2000).
  const monthsBack = Math.max(1, opts?.monthsBack ?? 2);
  const now = new Date();
  const monthsToFetch: string[] = [];
  for (let i = 0; i < monthsBack; i++) {
    monthsToFetch.push(getYYYYMM(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }

  const filteredRows: CvmDailyRow[] = [];
  let anyMonthOk = false;

  const { monthly, histYears, histMonths } = splitMonthsForCvmFetch(monthsToFetch);

  for (const month of monthly) {
    const url = CVM_DAILY_URL(month);
    try {
      logger.info(`📥 Tentando baixar: ${url}`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      const zipBuffer: ArrayBuffer = response.data;
      anyMonthOk = true;
      logger.info(`✅ ZIP ${month}: ${(zipBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

      const csvRows = extractCsvFromZip(Buffer.from(zipBuffer));
      collectDailyRows(csvRows, targetCnpjs, null, filteredRows);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : 'unknown';
      logger.warn(`⚠️  Falha ao baixar/processar mês ${month} (status: ${status})`);
    }
  }

  // Fallback HIST: meses < 2021-01 vêm do ZIP ANUAL (2000-2020). Cada ZIP traz
  // um CSV por mês — processamos entrada a entrada (pula meses fora da janela
  // pelo nome do arquivo) pra não segurar o ano inteiro em memória.
  for (const year of histYears) {
    const url = CVM_HIST_URL(year);
    try {
      logger.info(`📥 Tentando baixar (HIST anual): ${url}`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: CVM_HIST_TIMEOUT_MS,
      });
      const zipBuffer: ArrayBuffer = response.data;
      anyMonthOk = true;
      logger.info(`✅ ZIP HIST ${year}: ${(zipBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

      const zip = new AdmZip(Buffer.from(zipBuffer));
      for (const entry of zip.getEntries()) {
        if (!entry.entryName.endsWith('.csv')) continue;
        const monthMatch = entry.entryName.match(/(\d{6})\.csv$/);
        if (monthMatch && !histMonths.has(monthMatch[1])) continue;
        const csvRows = parseCsvText(entry.getData().toString('latin1'));
        // Filtro por mês também nas linhas: cobre entradas sem YYYYMM no nome.
        collectDailyRows(csvRows, targetCnpjs, histMonths, filteredRows);
      }
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : 'unknown';
      logger.warn(`⚠️  Falha ao baixar/processar HIST ${year} (status: ${status})`);
    }
  }

  if (!anyMonthOk) {
    throw new Error('Não foi possível baixar o arquivo CVM INF_DIARIO para nenhum mês');
  }

  logger.info(
    `🎯 ${filteredRows.length} linhas correspondentes aos CNPJs alvo (${monthsBack} meses)`,
  );

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
      logger.error(`❌ Erro no batch ${i}-${i + batch.length}:`, batchErr);
      errors += batch.length;
    }
  }

  // 6. Bridge: update Asset.currentPrice for fund assets
  fundsProcessed = await bridgeCvmToAssetPrices(fundAssets);

  const duration = (Date.now() - startTime) / 1000;

  logger.info('📊 Resultado CVM Fundos:');
  logger.info(`   • ${inserted} inseridos, ${updated} atualizados, ${errors} erros`);
  logger.info(`   • ${fundsProcessed} ativos atualizados com cota CVM`);
  logger.info(`   • Duração: ${duration.toFixed(2)}s`);

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
 * Liga as cotas CVM ao modelo de preço dos ativos, como uma ação:
 * - `Asset.currentPrice` = última cota (valor atual da posição = qty × cota);
 * - `AssetPriceHistory` recebe a SÉRIE COMPLETA de cotas (não só a última), para
 *   alimentar os gráficos de histórico do fundo igual a uma ação/FII.
 */
async function bridgeCvmToAssetPrices(
  fundAssets: { id: string; symbol: string; cnpj: string | null }[],
): Promise<number> {
  logger.info('🔗 Atualizando preços de fundos com cotas CVM...');
  let bridged = 0;

  for (const asset of fundAssets) {
    if (!asset.cnpj) continue;
    const cnpj = normalizeCnpj(asset.cnpj);

    // Série completa (ordenada) — a última é o preço atual; todas viram histórico.
    const quotas = await prisma.cvmFundQuota.findMany({
      where: { cnpj },
      orderBy: { date: 'asc' },
      select: { quotaValue: true, date: true },
    });

    if (quotas.length === 0) continue;
    const latestQuota = quotas[quotas.length - 1];

    const now = new Date();
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        currentPrice: latestQuota.quotaValue,
        priceUpdatedAt: now,
        source: 'cvm',
      },
    });

    // Grava toda a série no histórico de preços (em lotes pra não estourar a
    // transação). Sem isso, o gráfico do fundo fica sem pontos intermediários.
    for (let i = 0; i < quotas.length; i += BATCH_SIZE) {
      const batch = quotas.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map((q) =>
          prisma.assetPriceHistory.upsert({
            where: { symbol_date: { symbol: asset.symbol, date: q.date } },
            update: { price: q.quotaValue },
            create: {
              assetId: asset.id,
              symbol: asset.symbol,
              price: q.quotaValue,
              currency: 'BRL',
              source: 'CVM',
              date: q.date,
            },
          }),
        ),
      );
    }

    bridged++;
  }

  logger.info(`   ✅ ${bridged} fundos atualizados com cota CVM (série completa no histórico)`);
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
 * Sincroniza o catálogo de fundos CVM a partir do `registro_fundo_classe.zip`
 * (estrutura RCVM 175, vigente desde 2022). Substitui a fonte antiga
 * INF_DIARIO + cad_fi.csv que cobria só fundos com cota diária — agora
 * pegamos também FIDC, FIP, Fiagro e FIIM que reportam mensal/trimestral.
 *
 * O ZIP contém 3 CSVs:
 *   - registro_fundo.csv (~88k rows): CNPJ_Fundo, Tipo_Fundo, Denominacao_Social, Situacao
 *   - registro_classe.csv (~33k rows): ID_Registro_Fundo, Tipo_Classe, Classificacao
 *   - registro_subclasse.csv (~3k rows): subclasses pra fundos com várias séries (não usado)
 *
 * Pipeline:
 *   1. Baixar e extrair os CSVs.
 *   2. Filtrar fundos com Situacao = 'Em Funcionamento Normal'.
 *   3. JOIN com registro_classe por ID_Registro_Fundo (primeira classe ativa).
 *   4. Classificar via inferFundType usando Tipo_Fundo + Classificacao + nome.
 *   5. Cross-reference com INF_DIARIO do mês corrente pra cota inicial (fundos
 *      fechados ficam sem currentPrice — será preenchido manualmente ou pela
 *      sync diária quando o usuário cadastrar e o INF_DIARIO trouxer cota).
 *   6. Upsert Asset (symbol = `CVM-{CNPJ14}`).
 */
export async function runCvmCatalogSync(): Promise<CvmCatalogSyncResult> {
  const startTime = Date.now();

  logger.info('📚 Iniciando sincronização do catálogo CVM (RCVM 175)...');
  logger.info(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  // 1. Baixar registro_fundo_classe.zip
  logger.info(`📥 Baixando ${CVM_REGISTRO_URL}...`);
  let registroBuffer: ArrayBuffer;
  try {
    const response = await axios.get(CVM_REGISTRO_URL, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    registroBuffer = response.data;
    logger.info(`✅ ZIP baixado: ${(registroBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : 'unknown';
    throw new Error(`Falha ao baixar registro_fundo_classe.zip (status: ${status}): ${err}`);
  }

  // 2. Extrair os 3 CSVs
  const csvs = extractMultipleCsvsFromZip(Buffer.from(registroBuffer));
  const fundoRows = csvs.get('registro_fundo') ?? [];
  const classeRows = csvs.get('registro_classe') ?? [];
  logger.info(`📊 ${fundoRows.length} fundos, ${classeRows.length} classes`);

  if (fundoRows.length === 0) {
    throw new Error('registro_fundo.csv vazio ou ausente do ZIP');
  }

  // 3. Indexar classes por ID_Registro_Fundo (primeira ativa por fundo).
  //    Cada fundo pode ter múltiplas classes (RCVM 175 separa fundo/classe),
  //    mas pra classificação usamos a primeira "Em Funcionamento Normal" —
  //    suficiente pra UI/IR; cadastros multi-classe são raros e tratáveis depois.
  const classeByFundoId = new Map<string, { tipoClasse: string; classificacao: string }>();
  for (const cl of classeRows) {
    const fundoId = cl['ID_Registro_Fundo'];
    if (!fundoId || classeByFundoId.has(fundoId)) continue;
    if (cl['Situacao'] && cl['Situacao'].toLowerCase() !== 'em funcionamento normal') continue;
    classeByFundoId.set(fundoId, {
      tipoClasse: cl['Tipo_Classe'] || '',
      classificacao: cl['Classificacao'] || '',
    });
  }
  logger.info(`📝 ${classeByFundoId.size} classes ativas indexadas`);

  // 4. Filtrar fundos ativos e enriquecer com classe
  interface FundEntry {
    cnpj: string;
    name: string;
    tipoFundo: string;
    classificacao: string;
    tipoClasse: string;
    type: string;
  }
  const fundsToUpsert: FundEntry[] = [];
  for (const f of fundoRows) {
    const sit = f['Situacao'] || '';
    if (sit.toLowerCase() !== 'em funcionamento normal') continue;

    const cnpj = normalizeCnpj(f['CNPJ_Fundo'] || '');
    if (cnpj.length < 14) continue;

    const name = (f['Denominacao_Social'] || '').trim() || `Fundo ${cnpj}`;
    const tipoFundo = f['Tipo_Fundo'] || '';
    const classe = classeByFundoId.get(f['ID_Registro_Fundo'] || '');
    const classificacao = classe?.classificacao || '';
    const tipoClasse = classe?.tipoClasse || '';

    const type = inferFundType({ tipoFundo, classificacao, name });
    fundsToUpsert.push({ cnpj, name, tipoFundo, classificacao, tipoClasse, type });
  }
  logger.info(`🎯 ${fundsToUpsert.length} fundos ativos pra upsert`);

  // 5. Cross-reference com INF_DIARIO pra cota inicial (best-effort).
  //    Fundos fechados (FIP/FIDC/FII fechado) não publicam diariamente — ficam
  //    sem currentPrice. A sync diária (runCvmFundSync) preenche quando o
  //    usuário cadastrar e a CVM publicar.
  const quotaByCnpj = new Map<string, { quota: number; date: string }>();
  const now = new Date();
  const months = [getYYYYMM(now), getYYYYMM(new Date(now.getFullYear(), now.getMonth() - 1, 1))];
  for (const month of months) {
    try {
      logger.info(`📥 INF_DIARIO ${month} (best-effort para cotas)...`);
      const response = await axios.get(CVM_DAILY_URL(month), {
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      const rows = extractCsvFromZip(Buffer.from(response.data));
      for (const row of rows) {
        const cnpj = normalizeCnpj(String(row['CNPJ_FUNDO_CLASSE'] ?? row['CNPJ_FUNDO'] ?? ''));
        const dateStr = String(row['DT_COMPTC'] ?? '');
        const quota = Number(row['VL_QUOTA']);
        if (!cnpj || cnpj.length < 14 || !dateStr || isNaN(quota) || quota === 0) continue;
        const existing = quotaByCnpj.get(cnpj);
        if (!existing || dateStr > existing.date) {
          quotaByCnpj.set(cnpj, { quota, date: dateStr });
        }
      }
      logger.info(`   ${quotaByCnpj.size} CNPJs com cota no mês ${month}`);
      break;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : 'unknown';
      logger.warn(`⚠️  INF_DIARIO ${month} indisponível (${status}); seguindo sem cota inicial`);
    }
  }

  // 6. Upsert em batches
  for (let i = 0; i < fundsToUpsert.length; i += CATALOG_BATCH_SIZE) {
    const batch = fundsToUpsert.slice(i, i + CATALOG_BATCH_SIZE);
    try {
      const symbols = batch.map((f) => `CVM-${f.cnpj}`);
      const existing = await prisma.asset.findMany({
        where: { symbol: { in: symbols } },
        select: { symbol: true },
      });
      const existingSet = new Set(existing.map((a) => a.symbol));

      const operations = batch.map((fund) => {
        const symbol = `CVM-${fund.cnpj}`;
        const quota = quotaByCnpj.get(fund.cnpj);
        const updateData: {
          name: string;
          type: string;
          categoria: string | null;
          subcategoria: string | null;
          currentPrice?: Decimal;
          priceUpdatedAt?: Date;
        } = {
          name: fund.name,
          type: fund.type,
          categoria: fund.tipoClasse || null,
          subcategoria: fund.classificacao || null,
        };
        if (quota) {
          updateData.currentPrice = new Decimal(quota.quota);
          updateData.priceUpdatedAt = new Date(quota.date);
        }
        return prisma.asset.upsert({
          where: { symbol },
          update: updateData,
          create: {
            symbol,
            name: fund.name,
            type: fund.type,
            currency: 'BRL',
            source: 'cvm',
            cnpj: fund.cnpj,
            categoria: fund.tipoClasse || null,
            subcategoria: fund.classificacao || null,
            ...(quota
              ? {
                  currentPrice: new Decimal(quota.quota),
                  priceUpdatedAt: new Date(quota.date),
                }
              : {}),
          },
        });
      });

      await prisma.$transaction(operations);

      for (const fund of batch) {
        if (existingSet.has(`CVM-${fund.cnpj}`)) updated++;
        else inserted++;
      }
    } catch (batchErr) {
      logger.error(`❌ Erro no batch ${i}-${i + batch.length}:`, batchErr);
      errors += batch.length;
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  logger.info('📊 Resultado catálogo CVM:');
  logger.info(`   • ${inserted} inseridos, ${updated} atualizados, ${errors} erros`);
  logger.info(`   • ${quotaByCnpj.size} cotas iniciais aplicadas via INF_DIARIO`);
  logger.info(`   • Duração: ${duration.toFixed(2)}s`);

  return {
    inserted,
    updated,
    errors,
    duration,
    totalActive: fundsToUpsert.length,
  };
}

export interface InferFundTypeInput {
  /**
   * Tipo_Fundo do `registro_fundo.csv` (RCVM 175) ou TP_FUNDO do legacy `cad_fi.csv`.
   * Valores comuns: 'FI', 'FIDC', 'FIP', 'FII', 'FIAGRO', 'FIIM', 'FAPI', 'FUNCINE',
   * 'FMIEE', 'FMP-FGTS', 'FITVM', 'FMIA', 'FMIA-CL', 'FIF', 'FACFIF'.
   * Pode vir vazio quando classificando entries do cad_fi.csv legacy sem TP_FUNDO.
   */
  tipoFundo?: string;
  /**
   * Classificacao do `registro_classe.csv` ou CLASSE do legacy `cad_fi.csv`.
   * Valores comuns: 'Multimercado', 'Renda Fixa', 'Ações', 'Cambial', 'Referenciado',
   * 'Curto Prazo', 'Dívida Externa', 'FIP IE', 'FIP EE', 'FIDC-NP', etc.
   */
  classificacao?: string;
  /** Denominacao_Social do fundo — usado como sinal secundário (Fiagro, FI-Infra, FIA). */
  name?: string;
}

/**
 * Classifica Asset.type a partir dos campos CVM. Ordem importa: tipos estruturais
 * (FIDC, FIP, FII, FIAGRO, FIIM) têm prioridade sobre classificação genérica (FI +
 * Multimercado/RF/Ações), pois a tributação e a UX dependem da estrutura legal.
 *
 * Subtipos identificados:
 *   - 'fidc'           — Fundo de Investimento em Direitos Creditórios
 *   - 'fip'            — Fundo de Investimento em Participações
 *   - 'fip-infra'      — FIP em Infraestrutura (Lei 12.431, isenção PF em rendimentos)
 *   - 'fii'            — Fundo de Investimento Imobiliário
 *   - 'fiagro'         — Fundo de Investimento nas Cadeias Produtivas Agroindustriais
 *   - 'etf-cvm'        — FIIM (ETF registrado na CVM, distinto do BRAPI 'etf')
 *   - 'previdencia'    — PGBL/VGBL/Previdência Privada
 *   - 'fia'            — Fundo de Ações (Classificacao=Ações)
 *   - 'multimercado'   — Fundo Multimercado
 *   - 'fund-rf'        — Fundo de Renda Fixa
 *   - 'fund-cambial'   — Fundo Cambial
 *   - 'fund'           — Catch-all pra FI/FIF/FACFIF sem classificação clara
 */
export function inferFundType(input: InferFundTypeInput): string {
  const tipo = (input.tipoFundo || '').toUpperCase().trim();
  const classif = (input.classificacao || '').toUpperCase().trim();
  const name = (input.name || '').toUpperCase();
  const allText = `${tipo} ${classif} ${name}`;

  // Tipos estruturais primeiro (mais específicos, ordem de prioridade)
  if (tipo === 'FIDC' || classif.includes('FIDC') || classif === 'FICFIDC-NP') {
    if (name.includes('FIAGRO') || name.includes('AGROIND')) return 'fiagro';
    return 'fidc';
  }
  if (
    tipo === 'FIP' ||
    tipo === 'FMIEE' ||
    classif === 'FIP' ||
    classif.startsWith('FIP ') ||
    classif === 'FIC FIP'
  ) {
    if (name.includes('FIAGRO')) return 'fiagro';
    // FIP IE = FIP em Infraestrutura (Lei 12.431) — tributação diferenciada
    if (classif === 'FIP IE' || allText.includes('INFRAESTRUTUR')) return 'fip-infra';
    return 'fip';
  }
  if (tipo === 'FII' || classif === 'FII') {
    if (name.includes('FIAGRO')) return 'fiagro';
    return 'fii';
  }
  if (tipo === 'FIAGRO' || name.includes('FIAGRO') || name.includes('AGROIND')) {
    return 'fiagro';
  }
  // FIIM = Fundos de Índice de Mercado (ETFs registrados na CVM). Categoria distinta
  // dos ETFs vindos da BRAPI (type='etf'), embora muitos sejam os mesmos veículos.
  if (tipo === 'FIIM') return 'etf-cvm';

  // Previdência (sinalizado no nome, não há tipo estrutural separado)
  if (
    allText.includes('PREVID') ||
    allText.includes(' PREV ') ||
    allText.includes('PGBL') ||
    allText.includes('VGBL')
  ) {
    return 'previdencia';
  }

  // Imobiliário pelo nome (caso a CVM não tenha marcado como FII explícito)
  if (name.includes('IMOBILI')) return 'fii';

  // FI/FIF/FACFIF/FITVM/FMIA classificados pelo subtipo (Classificacao)
  if (classif === 'AÇÕES' || classif === 'ACOES' || tipo === 'FITVM' || tipo === 'FMIA') {
    return 'fia';
  }
  if (classif === 'MULTIMERCADO') return 'multimercado';
  if (classif === 'RENDA FIXA' || classif === 'REFERENCIADO' || classif === 'CURTO PRAZO') {
    return 'fund-rf';
  }
  if (
    classif === 'CAMBIAL' ||
    classif.includes('DÍVIDA EXTERNA') ||
    classif.includes('DIVIDA EXTERNA')
  ) {
    return 'fund-cambial';
  }

  return 'fund';
}
