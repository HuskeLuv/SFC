import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ================== TYPES ==================

interface BrapiStock {
  stock: string;
  name: string;
  type?: string;
  sector?: string;
}

interface BrapiResponse {
  stocks: BrapiStock[];
}

interface InstitutionData {
  codigo: string;
  nome: string;
  cnpj?: string;
  status: 'ATIVA' | 'INATIVA';
}

// ================== API FETCH FUNCTIONS ==================

/**
 * Busca lista de ativos da B3 via API brapi.dev
 */
const fetchAtivos = async (): Promise<BrapiStock[]> => {
  console.log('🔍 Buscando dados de ativos da B3...');
  
  try {
    const response = await fetch('https://brapi.dev/api/quote/list');
    
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`);
    }
    
    const data: BrapiResponse = await response.json();
    
    if (!data.stocks || !Array.isArray(data.stocks)) {
      throw new Error('Formato de resposta inesperado da API brapi.dev');
    }
    
    console.log(`✅ ${data.stocks.length} ativos encontrados na API`);
    return data.stocks;
    
  } catch (error) {
    console.error('❌ Erro ao buscar dados da API brapi.dev:', error);
    throw error;
  }
};

/**
 * Retorna lista das principais corretoras e bancos de investimento do Brasil
 */
const fetchInstituicoes = async (): Promise<InstitutionData[]> => {
  console.log('📋 Carregando lista das principais corretoras e bancos de investimento...');
  
  const institutions: InstitutionData[] = [
    { codigo: "ITAU", nome: "Itaú Corretora de Valores", cnpj: "60872504000123", status: "ATIVA" },
    { codigo: "BTG", nome: "BTG Pactual Corretora de Valores", cnpj: "30669937000139", status: "ATIVA" },
    { codigo: "XP", nome: "XP Investimentos CCTVM S.A.", cnpj: "02558157000162", status: "ATIVA" },
    { codigo: "NUINVEST", nome: "NuInvest Corretora de Valores", cnpj: "62144172000185", status: "ATIVA" },
    { codigo: "CLEAR", nome: "Clear Corretora", cnpj: "09296295000160", status: "ATIVA" },
    { codigo: "MODAL", nome: "ModalMais Corretora", cnpj: "22610500000158", status: "ATIVA" },
    { codigo: "INTER", nome: "Banco Inter DTVM", cnpj: "00416968000101", status: "ATIVA" },
    { codigo: "SANTANDER", nome: "Santander Corretora de Valores", cnpj: "90400888000142", status: "ATIVA" },
    { codigo: "BBINVEST", nome: "Banco do Brasil Investimentos", cnpj: "00000000000191", status: "ATIVA" },
    { codigo: "BRADESCO", nome: "Bradesco Corretora", cnpj: "60746948000112", status: "ATIVA" },
    { codigo: "GENIAL", nome: "Genial Investimentos", cnpj: "13486793000152", status: "ATIVA" },
    { codigo: "ORAMA", nome: "Órama DTVM", cnpj: "13914414000122", status: "ATIVA" },
    { codigo: "RICO", nome: "Rico Investimentos", cnpj: "08744919000199", status: "ATIVA" },
    { codigo: "C6", nome: "C6 Corretora de Valores", cnpj: "31872495000125", status: "ATIVA" },
    { codigo: "BANRISUL", nome: "Banrisul Corretora de Valores", cnpj: "92702067000196", status: "ATIVA" }
  ];
  
  console.log(`✅ ${institutions.length} instituições carregadas`);
  return institutions;
};

// ================== DATABASE SYNC FUNCTIONS ==================

/**
 * Sincroniza ativos da B3 no banco de dados
 */
const syncAtivos = async (ativos: BrapiStock[]): Promise<{ inserted: number; updated: number }> => {
  console.log('💾 Sincronizando ativos no banco de dados...');
  
  let inserted = 0;
  let updated = 0;
  
  try {
    for (const ativo of ativos) {
      if (!ativo.stock) {
        console.warn('⚠️  Ativo sem ticker, pulando:', ativo);
        continue;
      }
      
      const result = await prisma.asset.upsert({
        where: {
          ticker: ativo.stock
        },
        update: {
          nome: ativo.name || ativo.stock,
          tipo: ativo.type || 'acao',
          setor: ativo.sector || null,
          status: 'ativo',
          updatedAt: new Date()
        },
        create: {
          ticker: ativo.stock,
          nome: ativo.name || ativo.stock,
          tipo: ativo.type || 'acao',
          setor: ativo.sector || null,
          status: 'ativo'
        }
      });
      
      // Verificar se foi inserção ou atualização baseado na data de criação
      const isNew = result.createdAt.getTime() === result.updatedAt.getTime();
      if (isNew) {
        inserted++;
      } else {
        updated++;
      }
    }
    
    console.log(`✅ Ativos sincronizados: ${inserted} inseridos, ${updated} atualizados`);
    return { inserted, updated };
    
  } catch (error) {
    console.error('❌ Erro ao sincronizar ativos:', error);
    throw error;
  }
};

/**
 * Sincroniza instituições financeiras no banco de dados
 */
const syncInstituicoes = async (instituicoes: InstitutionData[]): Promise<{ inserted: number; updated: number }> => {
  console.log('💾 Sincronizando instituições no banco de dados...');
  
  let inserted = 0;
  let updated = 0;
  
  try {
    for (const instituicao of instituicoes) {
      if (!instituicao.codigo) {
        console.warn('⚠️  Instituição sem código, pulando:', instituicao);
        continue;
      }
      
      const result = await prisma.institution.upsert({
        where: {
          codigo: instituicao.codigo
        },
        update: {
          nome: instituicao.nome,
          cnpj: instituicao.cnpj,
          status: instituicao.status,
          updatedAt: new Date()
        },
        create: {
          codigo: instituicao.codigo,
          nome: instituicao.nome,
          cnpj: instituicao.cnpj,
          status: instituicao.status
        }
      });
      
      // Verificar se foi inserção ou atualização baseado na data de criação
      const timeDiff = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime());
      const isNew = timeDiff < 1000; // Considera novo se a diferença for menor que 1 segundo
      
      if (isNew) {
        inserted++;
      } else {
        updated++;
      }
    }
    
    console.log(`✅ Instituições sincronizadas com sucesso: ${inserted} inseridas, ${updated} atualizadas`);
    return { inserted, updated };
    
  } catch (error) {
    console.error('❌ Erro ao sincronizar instituições:', error);
    throw error;
  }
};

// ================== MAIN FUNCTION ==================

/**
 * Função principal que executa toda a sincronização
 */
const main = async (): Promise<void> => {
  console.log('🚀 Iniciando sincronização de dados externos...\n');
  
  const startTime = Date.now();
  
  try {
    // Executar fetch dos ativos da B3 e carregar instituições
    console.log('📡 Buscando dados de ativos da B3 e carregando instituições...');
    const [ativos, instituicoes] = await Promise.all([
      fetchAtivos(),
      fetchInstituicoes()
    ]);
    
    console.log('\n💾 Sincronizando dados no banco...');
    
    // Executar sincronização no banco em paralelo
    const [ativosResult, instituicoesResult] = await Promise.all([
      syncAtivos(ativos),
      syncInstituicoes(instituicoes)
    ]);
    
    // Exibir resumo final
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n🎉 Sincronização concluída com sucesso!');
    console.log('📊 RESUMO:');
    console.log(`   • Ativos: ${ativosResult.inserted} inseridos, ${ativosResult.updated} atualizados`);
    console.log(`   • Instituições: ${instituicoesResult.inserted} inseridas, ${instituicoesResult.updated} atualizadas`);
    console.log(`   • Tempo total: ${duration.toFixed(2)}s`);
    
  } catch (error) {
    console.error('\n💥 Erro durante a sincronização:', error);
    
    if (error instanceof Error) {
      console.error('Detalhes:', error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

// ================== EXECUTION ==================

// Executar apenas se este arquivo foi chamado diretamente
if (require.main === module) {
  main()
    .catch((error) => {
      console.error('❌ Erro não capturado:', error);
      process.exit(1);
    });
}

// Exportar funções para uso em outros módulos
export {
  fetchAtivos,
  fetchInstituicoes,
  syncAtivos,
  syncInstituicoes,
  main as syncExternalData
}; 