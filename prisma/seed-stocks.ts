import { PrismaClient } from '@prisma/client';
import { fetchB3Stocks } from '../src/utils/stockData';

const prisma = new PrismaClient();

async function seedStocks() {
  try {
    console.log('🌱 Iniciando seed de ativos da B3...\n');

    // Buscar dados da API da B3
    console.log('📡 Buscando dados da API da B3...');
    const stocksData = await fetchB3Stocks();
    
    console.log(`✅ ${stocksData.length} ativos encontrados`);

    // Limpar dados existentes
    console.log('🧹 Limpando dados existentes...');
    await prisma.stockTransaction.deleteMany({});
    await prisma.portfolio.deleteMany({});
    await prisma.watchlist.deleteMany({});
    await prisma.stock.deleteMany({});

    // Inserir ativos no banco
    console.log('📝 Inserindo ativos no banco...');
    const createdStocks = [];
    
    for (const stockData of stocksData) {
      try {
        const stock = await prisma.stock.create({
          data: {
            ticker: stockData.ticker,
            companyName: stockData.companyName,
            sector: stockData.sector || null,
            subsector: stockData.subsector || null,
            segment: stockData.segment || null,
            isActive: true,
            lastUpdate: new Date(),
          },
        });
        
        createdStocks.push(stock);
        console.log(`  ✅ ${stock.ticker} - ${stock.companyName}`);
        
      } catch (error) {
        console.warn(`  ⚠️  Erro ao criar ${stockData.ticker}:`, error);
      }
    }

    console.log(`\n🎉 Seed concluído! ${createdStocks.length} ativos inseridos no banco.`);
    
    // Mostrar alguns exemplos
    if (createdStocks.length > 0) {
      console.log('\n📊 Exemplos de ativos inseridos:');
      createdStocks.slice(0, 5).forEach(stock => {
        console.log(`  - ${stock.ticker}: ${stock.companyName} (${stock.sector || 'N/A'})`);
      });
    }

  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedStocks(); 