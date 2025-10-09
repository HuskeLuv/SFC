import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
  console.log('🔍 Verificando dados no banco de dados...\n');

  try {
    // Verificar ativos
    const totalAssets = await prisma.asset.count();
    console.log(`📊 Total de ativos: ${totalAssets}`);
    
    if (totalAssets > 0) {
      const sampleAssets = await prisma.asset.findMany({
        take: 5,
        orderBy: { symbol: 'asc' }
      });
      
      console.log('\n🔍 Exemplos de ativos:');
      sampleAssets.forEach(asset => {
        console.log(`   • ${asset.symbol} - ${asset.name} (${asset.type || 'N/A'}) [${asset.source}]`);
      });
    }

    // Verificar instituições
    const totalInstitutions = await prisma.institution.count();
    console.log(`\n📊 Total de instituições: ${totalInstitutions}`);
    
    if (totalInstitutions > 0) {
      const sampleInstitutions = await prisma.institution.findMany({
        take: 10,
        orderBy: { codigo: 'asc' }
      });
      
      console.log('\n🔍 Exemplos de instituições:');
      sampleInstitutions.forEach(institution => {
        console.log(`   • ${institution.codigo} - ${institution.nome} [${institution.status}]`);
      });
    }

    // Estatísticas por status das instituições
    const institutionStatus = await prisma.institution.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    });

    if (institutionStatus.length > 0) {
      console.log('\n🏦 Status das instituições:');
      institutionStatus.forEach(status => {
        console.log(`   • ${status.status}: ${status._count.id} instituições`);
      });
    }

    // Estatísticas por tipo de ativo
    const assetTypes = await prisma.asset.groupBy({
      by: ['type'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    if (assetTypes.length > 0) {
      console.log('\n📈 Distribuição por tipo de ativo:');
      assetTypes.forEach(type => {
        console.log(`   • ${type.type || 'Não especificado'}: ${type._count.id} ativos`);
      });
    }

    // Estatísticas por status (removido - campo status não existe no modelo Asset)
    // const assetStatus = await prisma.asset.groupBy({
    //   by: ['status'],
    //   _count: {
    //     id: true
    //   }
    // });

    // if (assetStatus.length > 0) {
    //   console.log('\n🚦 Distribuição por status:');
    //   assetStatus.forEach(status => {
    //     console.log(`   • ${status.status}: ${status._count.id} ativos`);
    //   });
    // }

    console.log('\n✅ Verificação concluída!');

  } catch (error) {
    console.error('❌ Erro ao verificar dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  checkData();
}

export { checkData }; 