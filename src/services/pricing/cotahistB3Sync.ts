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
 *   5. Insere em batches de BATCH_SIZE via prisma.createMany + skipDuplicates
 *      (1 round-trip por batch ao Neon ≈ 7s/batch, vs ~70s do upsert antigo).
 *
 * Não emitimos progresso por dia/mês; o log sai a cada PROGRESS_EVERY linhas
 * processadas pra dar feedback durante os 5-15 min de processamento.
 *
 * Idempotente: skipDuplicates respeita a unique constraint [symbol, date].
 * Pode rodar múltiplas vezes sem duplicar; duplicatas são silenciosamente
 * puladas (não atualizamos preços já gravados — cotações de fechamento são
 * imutáveis).
 */
import { logger } from '@/lib/logger';
import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import AdmZip from 'adm-zip';
import prisma from '@/lib/prisma';
import { parseCotahistLine, type CotahistRecord } from './cotahistB3Parser';
import { canOverwrite } from './sourcePrecedence';

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
  /** Inseridos via createMany (linhas novas; duplicatas em [symbol,date] são skipadas). */
  inserted: number;
  /**
   * @deprecated Mantido na interface por compat, sempre 0 após F2.2 (createMany
   * não distingue update; duplicatas são puladas via skipDuplicates).
   */
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
  // ISO-8859-1 (latin1), igual aos CSVs da CVM. NÃO materializa a string inteira:
  // arquivos recentes (2024+ ≈ 75MB zipado → ~500MB texto) estouram o limite de
  // string do Node (ERR_STRING_TOO_LONG, máx 0x1fffffe8). Decodifica linha a linha
  // direto do Buffer (peak de memória menor que o toString antigo).
  const data = txtEntry.getData();
  logger.info(`   📄 TXT ${(data.length / 1024 / 1024).toFixed(1)} MB descompactado`);

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

  // 4. Stream linha a linha direto do Buffer (sem materializar a string inteira —
  //    ver acima). COTAHIST usa CRLF; cada linha é decodificada de latin1 entre
  //    quebras `\n`, incluindo o `\r` final (igual ao split('\n') antigo — o
  //    parser ignora colunas além do registro fixo).
  let parsed = 0;
  let lineCount = 0;
  const uniqueSymbols = new Set<string>();
  const sample: CotahistRecord[] = [];
  const matched: CotahistRecord[] = [];
  const LF = 0x0a;

  let lineStart = 0;
  for (let pos = 0; pos <= data.length; pos++) {
    if (pos !== data.length && data[pos] !== LF) continue;
    if (pos > lineStart) {
      const line = data.toString('latin1', lineStart, pos);
      lineCount++;
      const rec = parseCotahistLine(line);
      if (rec) {
        parsed++;
        uniqueSymbols.add(rec.symbol);
        if (sample.length < 3) sample.push(rec);

        // Filtra pelo conjunto de symbols (Asset table OU filtro custom).
        if (options.symbolFilter) {
          // symbolFilter vazio = aceitar tudo (modo "carregar geral")
          if (
            options.symbolFilter.size === 0 ||
            options.symbolFilter.has(rec.symbol.toUpperCase())
          ) {
            matched.push(rec);
          }
        } else if (assetBySymbol.has(rec.symbol.toUpperCase())) {
          matched.push(rec);
        }

        if (lineCount % PROGRESS_EVERY === 0) {
          logger.info(
            `   ⏳ ${lineCount.toLocaleString('pt-BR')} linhas lidas | ${parsed} parseadas | ${matched.length} candidatas`,
          );
        }
      }
    }
    lineStart = pos + 1;
  }

  logger.info(
    `   📊 ${lineCount.toLocaleString('pt-BR')} linhas, ${parsed} parseadas, ${uniqueSymbols.size} symbols únicos, ${matched.length} candidatas a upsert`,
  );

  let inserted = 0;
  // `updated` = nº de linhas de prioridade menor (BRAPI/Yahoo) que a B3 sobrescreveu.
  let updated = 0;
  let errors = 0;

  if (dryRun) {
    const duration = (Date.now() - startTime) / 1000;
    logger.info(`   🚫 DRY RUN — não persistido. Duração: ${duration.toFixed(2)}s`);
    return {
      year,
      lines: lineCount,
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

  // 5. Insert em batches via createMany + skipDuplicates.
  //    Trade-off (F2.2 perf): cada batch antes era um $transaction com 1000
  //    upserts individuais (= 1000 round-trips ao Neon ≈ 70s/batch). Agora é
  //    UM round-trip via createMany, derrubando 7h pra ~10-15min/ano. Perdemos
  //    a contagem precisa "updated" — createMany retorna apenas o count dos
  //    inseridos efetivos (linhas com [symbol,date] novas). `skipDuplicates`
  //    silencia conflitos na unique [symbol,date], mantendo a idempotência
  //    desejada do upsert anterior. Como cotações antigas não mudam (o preço
  //    de fechamento de 2018 é fixo), pular duplicatas é semanticamente
  //    equivalente a re-upsertar o mesmo valor.
  for (let i = 0; i < matched.length; i += BATCH_SIZE) {
    const batch = matched.slice(i, i + BATCH_SIZE);

    try {
      const dataToCreate = batch.map((rec) => {
        const asset = assetBySymbol.get(rec.symbol.toUpperCase());
        // Se chegamos aqui é porque o symbol existe (já filtrado acima); o
        // assetId é obrigatório no schema.
        if (!asset) {
          throw new Error(`assetId não encontrado para symbol ${rec.symbol} — invariante violada`);
        }
        return {
          assetId: asset.id,
          symbol: rec.symbol,
          price: new Decimal(rec.closePrice),
          currency: 'BRL',
          source: SOURCE,
          date: rec.date,
        };
      });

      // Precedência: a B3 (oficial) SOBRESCREVE linhas BRAPI/Yahoo já gravadas, mas
      // preserva `manual` e outras linhas B3. Antes era só createMany+skipDuplicates
      // (pulava qualquer dia já existente), o que impedia a B3 de ser primária nos
      // anos que a BRAPI já preencheu. Apaga só o que a B3 pode sobrescrever (por id);
      // os dias preservados são pulados pelo skipDuplicates do createMany.
      const batchKeys = new Set(dataToCreate.map((d) => `${d.symbol}|${d.date.getTime()}`));
      const symbolsInBatch = [...new Set(dataToCreate.map((d) => d.symbol))];
      const datesInBatch = [...new Set(dataToCreate.map((d) => d.date.getTime()))].map(
        (t) => new Date(t),
      );
      const existing = await prisma.assetPriceHistory.findMany({
        where: { symbol: { in: symbolsInBatch }, date: { in: datesInBatch } },
        select: { id: true, symbol: true, date: true, source: true },
      });
      const deletableIds = existing
        .filter(
          (e) => batchKeys.has(`${e.symbol}|${e.date.getTime()}`) && canOverwrite(e.source, SOURCE),
        )
        .map((e) => e.id);
      const [, result] = await prisma.$transaction([
        prisma.assetPriceHistory.deleteMany({ where: { id: { in: deletableIds } } }),
        prisma.assetPriceHistory.createMany({ data: dataToCreate, skipDuplicates: true }),
      ]);
      inserted += result.count;
      updated += deletableIds.length;

      if ((i / BATCH_SIZE) % 10 === 0) {
        logger.info(`   💾 ${i + batch.length}/${matched.length} processados (${inserted} novos)`);
      }
    } catch (batchErr) {
      logger.error(`   ❌ Batch ${i}-${i + batch.length} falhou:`, batchErr);
      errors += batch.length;
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  logger.info(
    `   ✅ [COTAHIST ${year}] ${inserted} gravados (${updated} sobrescreveram BRAPI/Yahoo), ${matched.length - inserted - errors} preservados (manual/B3), ${errors} erros em ${duration.toFixed(1)}s`,
  );

  return {
    year,
    lines: lineCount,
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
