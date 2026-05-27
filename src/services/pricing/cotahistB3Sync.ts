/**
 * F2.2 — Sync de cotações históricas da B3 via arquivos COTAHIST (Séries
 * Históricas anuais). Cobre o gap de 2016-2020 em AssetPriceHistory pra ações,
 * FIIs, BDRs e ETFs. 2021+ continua via BRAPI no fluxo normal.
 *
 * Pipeline:
 *   1. Baixa COTAHIST_A{ANO}.ZIP (~50MB compactado, ~150MB texto).
 *   2. Descompacta com adm-zip e extrai o único .TXT.
 *   3. Decodifica latin1 e processa linha a linha (~2M linhas/ano).
 *   4. Filtra pelos symbols que JÁ existem em Asset (não criamos asset novo,
 *      pq tem ~5k tickers no COTAHIST e a maior parte não interessa).
 *   5. Upserta em batches de BATCH_SIZE registros via prisma.$transaction.
 *
 * Não emitimos progresso por dia/mês; o log sai a cada PROGRESS_EVERY linhas
 * processadas pra dar feedback durante os 5-15 min de processamento.
 *
 * Idempotente: usa unique constraint [symbol, date] no upsert. Pode rodar
 * múltiplas vezes sem duplicar.
 */
import { logger } from '@/lib/logger';
import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import AdmZip from 'adm-zip';
import prisma from '@/lib/prisma';
import { parseCotahistLine, type CotahistRecord } from './cotahistB3Parser';

// ================== CONSTANTS ==================

const COTAHIST_URL = (year: number) =>
  `https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A${year}.ZIP`;

/** Linhas por batch de upsert. 1000 mantém latência razoável e fits no payload Prisma. */
const BATCH_SIZE = 1000;

/** Log de progresso a cada N linhas processadas (não persistidas). */
const PROGRESS_EVERY = 100_000;

/** Timeout do download. ZIPs antigos podem ter ~50MB; 5min é folga generosa. */
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/** Fonte gravada em AssetPriceHistory pra distinguir BRAPI/CVM/Tesouro. */
const SOURCE = 'B3_COTAHIST';

// ================== TYPES ==================

export interface CotahistSyncOptions {
  /**
   * Quando true, parseia e conta tudo mas NÃO persiste no banco. Default false.
   */
  dryRun?: boolean;
  /**
   * Limita aos symbols informados (uppercased). Quando undefined, persiste
   * apenas symbols já presentes em Asset (modo padrão). Quando vazio, persiste
   * TODOS os symbols (escape hatch pra povoar de assets desconhecidos).
   */
  symbolFilter?: Set<string>;
}

export interface CotahistSyncResult {
  year: number;
  /** Total de linhas lidas do arquivo (inclui header/trailer/filtradas). */
  lines: number;
  /** Linhas que passaram no parser (TIPREG=01, TPMERC=010, CODBDI permitido). */
  parsed: number;
  /** Symbols únicos encontrados após o parser. */
  uniqueSymbols: number;
  /** Linhas cujo symbol bate com algum Asset no banco (alvo do upsert). */
  matched: number;
  /** Inseridos via upsert (nova linha). */
  inserted: number;
  /** Atualizados via upsert (linha já existia, preço atualizado). */
  updated: number;
  /** Erros durante o upsert (batches falhos). */
  errors: number;
  /** Duração total em segundos. */
  duration: number;
  /** True se rodou em dry-run (não persistiu). */
  dryRun: boolean;
  /** Amostra de 3 registros parseados pra inspeção visual no log. */
  sample: CotahistRecord[];
}

// ================== CORE ==================

/**
 * Baixa o COTAHIST de um ano e persiste cotações em AssetPriceHistory.
 *
 * @param year Ano do arquivo (ex.: 2020). Disponíveis desde 1986.
 * @param options dryRun, filtro de symbols.
 */
export async function syncCotahistYear(
  year: number,
  options: CotahistSyncOptions = {},
): Promise<CotahistSyncResult> {
  const startTime = Date.now();
  const dryRun = options.dryRun ?? false;

  logger.info(`📥 [COTAHIST ${year}] Iniciando sync (${dryRun ? 'DRY RUN' : 'APPLY'})...`);

  // 1. Download
  const url = COTAHIST_URL(year);
  logger.info(`   GET ${url}`);
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS,
    // B3 às vezes recusa user-agents vazios; user-agent simples é suficiente.
    headers: { 'User-Agent': 'sfc-cotahist-sync/1.0' },
  });
  const zipBuffer = Buffer.from(response.data);
  logger.info(`   ✅ ZIP ${(zipBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

  // 2. Descompacta
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const txtEntry = entries.find((e) => e.entryName.toUpperCase().endsWith('.TXT'));
  if (!txtEntry) {
    throw new Error(`COTAHIST_A${year}.ZIP não contém arquivo .TXT`);
  }
  // ISO-8859-1 (latin1) é a mesma família usada pelos CSVs CVM.
  const txt = txtEntry.getData().toString('latin1');
  logger.info(`   📄 TXT ${(txt.length / 1024 / 1024).toFixed(1)} MB descompactado`);

  // 3. Carrega map de symbols → assetId pra cruzar antes de upsertar.
  //    Mantemos a lista de assets em memória (apenas ~5k registros) pra evitar
  //    findUnique por linha (seriam ~500k queries).
  const assetBySymbol = new Map<string, { id: string; symbol: string }>();
  if (!options.symbolFilter) {
    const assets = await prisma.asset.findMany({
      select: { id: true, symbol: true },
    });
    for (const a of assets) {
      assetBySymbol.set(a.symbol.toUpperCase(), a);
    }
    logger.info(`   📚 ${assetBySymbol.size} assets já cadastrados no banco`);
  }

  // 4. Stream linha a linha. split('\n') em string de 150MB cria ~2M strings na
  //    heap; aceitável (Node aguenta), e poupa ler o ZIP duas vezes. Alternativa
  //    seria escrever em /tmp e usar readline, mas pra 5 anos a memória peak
  //    fica em ~500MB que cabe num runner padrão.
  const lines = txt.split('\n');
  let parsed = 0;
  const uniqueSymbols = new Set<string>();
  const sample: CotahistRecord[] = [];
  const matched: CotahistRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rec = parseCotahistLine(lines[i]);
    if (!rec) continue;
    parsed++;
    uniqueSymbols.add(rec.symbol);

    if (sample.length < 3) sample.push(rec);

    // Filtra pelo conjunto de symbols (Asset table OU filtro custom).
    if (options.symbolFilter) {
      if (options.symbolFilter.size > 0 && !options.symbolFilter.has(rec.symbol.toUpperCase())) {
        continue;
      }
      // symbolFilter vazio = aceitar tudo (modo "carregar geral")
      matched.push(rec);
    } else if (assetBySymbol.has(rec.symbol.toUpperCase())) {
      matched.push(rec);
    }

    if (i > 0 && i % PROGRESS_EVERY === 0) {
      logger.info(
        `   ⏳ ${i.toLocaleString('pt-BR')} linhas lidas | ${parsed} parseadas | ${matched.length} candidatas`,
      );
    }
  }

  logger.info(
    `   📊 ${lines.length.toLocaleString('pt-BR')} linhas, ${parsed} parseadas, ${uniqueSymbols.size} symbols únicos, ${matched.length} candidatas a upsert`,
  );

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  if (dryRun) {
    const duration = (Date.now() - startTime) / 1000;
    logger.info(`   🚫 DRY RUN — não persistido. Duração: ${duration.toFixed(2)}s`);
    return {
      year,
      lines: lines.length,
      parsed,
      uniqueSymbols: uniqueSymbols.size,
      matched: matched.length,
      inserted: 0,
      updated: 0,
      errors: 0,
      duration,
      dryRun: true,
      sample,
    };
  }

  // 5. Upsert em batches.
  for (let i = 0; i < matched.length; i += BATCH_SIZE) {
    const batch = matched.slice(i, i + BATCH_SIZE);

    try {
      // Identifica registros já existentes pra distinguir insert vs update.
      const existing = await prisma.assetPriceHistory.findMany({
        where: { OR: batch.map((r) => ({ symbol: r.symbol, date: r.date })) },
        select: { symbol: true, date: true },
      });
      const existingSet = new Set(existing.map((e) => `${e.symbol}|${e.date.toISOString()}`));

      const operations = batch.map((rec) => {
        const asset = assetBySymbol.get(rec.symbol.toUpperCase());
        // Se chegamos aqui é porque o symbol existe (já filtrado acima); o
        // assetId é obrigatório no schema.
        if (!asset) {
          throw new Error(`assetId não encontrado para symbol ${rec.symbol} — invariante violada`);
        }
        return prisma.assetPriceHistory.upsert({
          where: {
            symbol_date: { symbol: rec.symbol, date: rec.date },
          },
          update: {
            price: new Decimal(rec.closePrice),
            currency: 'BRL',
            source: SOURCE,
          },
          create: {
            assetId: asset.id,
            symbol: rec.symbol,
            price: new Decimal(rec.closePrice),
            currency: 'BRL',
            source: SOURCE,
            date: rec.date,
          },
        });
      });

      await prisma.$transaction(operations);

      for (const rec of batch) {
        const key = `${rec.symbol}|${rec.date.toISOString()}`;
        if (existingSet.has(key)) updated++;
        else inserted++;
      }

      if ((i / BATCH_SIZE) % 10 === 0) {
        logger.info(
          `   💾 ${i + batch.length}/${matched.length} persistidos (${inserted} ins, ${updated} upd)`,
        );
      }
    } catch (batchErr) {
      logger.error(`   ❌ Batch ${i}-${i + batch.length} falhou:`, batchErr);
      errors += batch.length;
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  logger.info(
    `   ✅ [COTAHIST ${year}] ${inserted} inseridos, ${updated} atualizados, ${errors} erros em ${duration.toFixed(1)}s`,
  );

  return {
    year,
    lines: lines.length,
    parsed,
    uniqueSymbols: uniqueSymbols.size,
    matched: matched.length,
    inserted,
    updated,
    errors,
    duration,
    dryRun: false,
    sample,
  };
}
