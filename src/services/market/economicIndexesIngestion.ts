import axios from 'axios';
import prisma from '@/lib/prisma';

// ================== TYPES ==================

type BacenResponse = {
  data: string;
  valor: string;
}[];

type IndexType = 'CDI' | 'IPCA';

interface IngestionResult {
  inserted: number;
  updated: number;
  errors: number;
  duration: number;
}

// ================== HELPER FUNCTIONS ==================

/**
 * Converte data no formato brasileiro (DD/MM/YYYY) para Date
 */
const parseDateBR = (date: string): Date => {
  const [day, month, year] = date.split('/');
  return new Date(`${year}-${month}-${day}`);
};

/**
 * Busca dados de uma série do BACEN SGS
 * Para séries diárias (como CDI), a dataInicial é obrigatória
 */
const fetchBacenSeries = async (
  seriesId: number,
  startDate?: string,
  endDate?: string,
): Promise<BacenResponse> => {
  let url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados?formato=json`;

  // Se não foi fornecida data inicial, usar 5 anos atrás para séries diárias
  if (!startDate) {
    const defaultDate = new Date();
    defaultDate.setFullYear(defaultDate.getFullYear() - 5);
    const day = String(defaultDate.getDate()).padStart(2, '0');
    const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
    const year = defaultDate.getFullYear();
    startDate = `${day}/${month}/${year}`;
  }

  url += `&dataInicial=${startDate}`;

  if (endDate) {
    url += `&dataFinal=${endDate}`;
  }

  const { data } = await axios.get<BacenResponse>(url);
  return data;
};

// ================== INGESTION FUNCTIONS ==================

/**
 * Ingere dados de um índice econômico (CDI ou IPCA)
 */
const ingestIndex = async (
  seriesId: number,
  indexType: IndexType,
  startDate?: string,
  endDate?: string,
): Promise<{ inserted: number; updated: number; errors: number }> => {
  console.log(`📊 Iniciando ingestão de ${indexType} (série ${seriesId})...`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  try {
    // IPCA é mensal e não aceita filtros de data - buscar todos os dados
    const useDateFilter = indexType === 'CDI';
    const data = await fetchBacenSeries(
      seriesId,
      useDateFilter ? startDate : undefined,
      useDateFilter ? endDate : undefined,
    );

    console.log(`📥 Recebidos ${data.length} registros de ${indexType}`);

    for (const item of data) {
      try {
        const date = parseDateBR(item.data);
        const value = Number(item.valor) / 100; // Converter percentual para decimal

        // Verificar se já existe para contar corretamente
        const existing = await prisma.economicIndex.findUnique({
          where: {
            indexType_date: {
              indexType,
              date,
            },
          },
        });

        await prisma.economicIndex.upsert({
          where: {
            indexType_date: {
              indexType,
              date,
            },
          },
          update: {
            value,
            updatedAt: new Date(),
          },
          create: {
            indexType,
            date,
            value,
          },
        });

        if (existing) {
          updated++;
        } else {
          inserted++;
        }
      } catch (error) {
        console.error(`❌ Erro ao processar registro ${item.data} de ${indexType}:`, error);
        errors++;
      }
    }

    console.log(
      `✅ Ingestão de ${indexType} concluída: ${inserted} inseridos, ${updated} atualizados, ${errors} erros`,
    );
  } catch (error) {
    console.error(`💥 Erro ao buscar dados de ${indexType}:`, error);
    throw error;
  }

  return { inserted, updated, errors };
};

/**
 * Executa a ingestão completa de índices econômicos (CDI e IPCA)
 */
export const runEconomicIndexesIngestion = async (
  startDate?: string,
  endDate?: string,
): Promise<IngestionResult> => {
  const startTime = Date.now();

  console.log('🕐 Iniciando ingestão de índices econômicos...');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);

  // Se não foi fornecida data inicial, usar 5 anos atrás para CDI
  let finalStartDate = startDate;
  if (!finalStartDate) {
    const defaultDate = new Date();
    defaultDate.setFullYear(defaultDate.getFullYear() - 5);
    const day = String(defaultDate.getDate()).padStart(2, '0');
    const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
    const year = defaultDate.getFullYear();
    finalStartDate = `${day}/${month}/${year}`;
    console.log(`📆 Usando período padrão: ${finalStartDate} até hoje (5 anos)`);
  } else if (endDate) {
    console.log(`📆 Período: ${finalStartDate} a ${endDate}`);
  } else {
    console.log(`📆 A partir de: ${finalStartDate}`);
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  try {
    // Ingerir CDI (série 12) - sempre requer dataInicial
    const cdiResult = await ingestIndex(12, 'CDI', finalStartDate, endDate);
    totalInserted += cdiResult.inserted;
    totalUpdated += cdiResult.updated;
    totalErrors += cdiResult.errors;

    // Ingerir IPCA (série 433) - pode funcionar sem data, mas usamos a mesma para consistência
    // IPCA é mensal, então pode ter comportamento diferente
    let ipcaResult = { inserted: 0, updated: 0, errors: 0 };
    try {
      ipcaResult = await ingestIndex(433, 'IPCA', finalStartDate, endDate);
      totalInserted += ipcaResult.inserted;
      totalUpdated += ipcaResult.updated;
      totalErrors += ipcaResult.errors;
    } catch (ipcaError) {
      console.warn(
        '⚠️  Aviso: Erro ao ingerir IPCA (série pode não estar disponível ou ter formato diferente):',
        ipcaError,
      );
      // Continuar mesmo se IPCA falhar
      totalErrors++;
    }

    const duration = (Date.now() - startTime) / 1000;

    const result: IngestionResult = {
      inserted: totalInserted,
      updated: totalUpdated,
      errors: totalErrors,
      duration,
    };

    console.log('📊 Resultado da ingestão:');
    console.log(
      `   • CDI: ${cdiResult.inserted} inseridos, ${cdiResult.updated} atualizados, ${cdiResult.errors} erros`,
    );
    if (ipcaResult.inserted > 0 || ipcaResult.updated > 0 || ipcaResult.errors > 0) {
      console.log(
        `   • IPCA: ${ipcaResult.inserted} inseridos, ${ipcaResult.updated} atualizados, ${ipcaResult.errors} erros`,
      );
    } else {
      console.log(
        `   • IPCA: Não foi possível ingerir (série pode não estar disponível ou ter formato diferente)`,
      );
    }
    console.log(
      `   • Total: ${totalInserted} inseridos, ${totalUpdated} atualizados, ${totalErrors} erros`,
    );
    console.log(`   • Duração: ${duration.toFixed(2)}s`);

    return result;
  } catch (error) {
    console.error('💥 Erro durante a ingestão de índices econômicos:', error);
    throw error;
  }
};

/**
 * Testa a conexão com a API do BACEN
 */
export const testBacenConnection = async (): Promise<boolean> => {
  console.log('🧪 Testando conexão com API do BACEN...');

  try {
    // Usar uma data inicial de 30 dias atrás para o teste
    const testDate = new Date();
    testDate.setDate(testDate.getDate() - 30);
    const day = String(testDate.getDate()).padStart(2, '0');
    const month = String(testDate.getMonth() + 1).padStart(2, '0');
    const year = testDate.getFullYear();
    const startDate = `${day}/${month}/${year}`;

    const data = await fetchBacenSeries(12, startDate); // Testar com série CDI
    const isWorking = Array.isArray(data) && data.length > 0;

    if (isWorking) {
      console.log(`✅ Teste de conexão com BACEN passou! Recebidos ${data.length} registros.`);
    } else {
      console.log('❌ Teste de conexão com BACEN falhou!');
    }

    return isWorking;
  } catch (error) {
    console.error('❌ Erro no teste de conexão com BACEN:', error);
    return false;
  }
};
