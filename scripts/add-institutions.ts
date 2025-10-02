import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const institutions = [
  'XP Investimentos',
  'BTG Pactual',
  'ModalMais',
  'Genial Investimentos',
  'Rico Investimentos',
  'Órama Investimentos',
  'Guide Investimentos',
  'Easynvest (atual NuInvest)',
  'Inter Invest',
  'Clear Corretora',
  'Banco do Brasil',
  'Bradesco',
  'Itaú Unibanco (Itaú Corretora)',
  'Santander Brasil',
  'Caixa Econômica Federal',
  'Nubank (NuInvest)',
  'Banco Inter',
  'C6 Bank Investimentos',
  'PagBank (PagSeguro)',
  'Banco Sofisa Direto'
];

async function addInstitutions() {
  try {
    console.log('🏦 Adicionando instituições ao banco de dados...\n');
    
    let added = 0;
    let updated = 0;
    let errors = 0;
    
    for (const nome of institutions) {
      try {
        // Gerar código único baseado no nome
        const codigo = nome
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        
        const result = await prisma.institution.upsert({
          where: { codigo },
          update: { 
            nome,
            updatedAt: new Date()
          },
          create: {
            codigo,
            nome,
            status: 'ATIVA'
          }
        });
        
        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
          added++;
          console.log(`✅ Adicionada: ${nome}`);
        } else {
          updated++;
          console.log(`🔄 Atualizada: ${nome}`);
        }
      } catch (error) {
        errors++;
        console.error(`❌ Erro ao processar ${nome}:`, error);
      }
    }
    
    console.log(`\n📊 RESUMO:`);
    console.log(`   • Adicionadas: ${added}`);
    console.log(`   • Atualizadas: ${updated}`);
    console.log(`   • Erros: ${errors}`);
    console.log(`   • Total processadas: ${institutions.length}`);
    
    // Verificar total de instituições no banco
    const totalInstitutions = await prisma.institution.count();
    console.log(`\n🏦 Total de instituições no banco: ${totalInstitutions}`);
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addInstitutions();
