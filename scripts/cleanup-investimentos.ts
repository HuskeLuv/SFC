#!/usr/bin/env tsx

/**
 * Script para limpar registros duplicados de investimentos
 * Remove itens de investimento criados dentro do grupo "Despesas > Investimentos"
 * 
 * Uso:
 *   npx tsx scripts/cleanup-investimentos.ts
 */

import { prisma } from '../src/lib/prisma';

const main = async (): Promise<void> => {
  console.log('🧹 Script de Limpeza de Investimentos Duplicados');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}\n`);
  
  try {
    // Buscar grupos de "Investimentos" que estão dentro de "Despesas"
    const gruposDespesas = await prisma.cashflowGroup.findMany({
      where: {
        name: 'Despesas',
        type: 'Despesas',
      },
      include: {
        children: true,
      },
    });

    let totalItensRemovidos = 0;
    let totalValoresRemovidos = 0;

    for (const grupoDespesa of gruposDespesas) {
      const subgrupoInvestimentos = grupoDespesa.children?.find(
        (child) => child.name === 'Investimentos'
      );

      if (subgrupoInvestimentos) {
        console.log(`🔍 Encontrado subgrupo "Investimentos" dentro de "Despesas" (ID: ${subgrupoInvestimentos.id})`);

        // Buscar itens desse subgrupo
        const itens = await prisma.cashflowItem.findMany({
          where: {
            groupId: subgrupoInvestimentos.id,
          },
          include: {
            valores: true,
          },
        });

        console.log(`   📋 ${itens.length} itens encontrados neste subgrupo`);

        for (const item of itens) {
          // Deletar valores associados
          const valoresCount = item.valores.length;
          await prisma.cashflowValue.deleteMany({
            where: {
              itemId: item.id,
            },
          });
          totalValoresRemovidos += valoresCount;

          // Deletar item
          await prisma.cashflowItem.delete({
            where: {
              id: item.id,
            },
          });
          totalItensRemovidos++;
          
          console.log(`   ✅ Removido: ${item.descricao} (${valoresCount} valores)`);
        }

        // Deletar o subgrupo vazio
        await prisma.cashflowGroup.delete({
          where: {
            id: subgrupoInvestimentos.id,
          },
        });
        
        console.log(`   🗑️  Subgrupo "Investimentos" removido\n`);
      }
    }

    if (totalItensRemovidos === 0) {
      console.log('✨ Nenhum registro duplicado encontrado. Banco de dados limpo!\n');
    } else {
      console.log('🎉 Limpeza concluída!');
      console.log(`   • ${totalItensRemovidos} itens removidos`);
      console.log(`   • ${totalValoresRemovidos} valores removidos\n`);
    }

    console.log('💡 Agora os investimentos serão calculados dinamicamente a partir das transações do portfolio.');
    
  } catch (error) {
    console.error('\n💥 Erro durante a limpeza:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

// Executar
if (require.main === module) {
  main()
    .catch((error) => {
      console.error('❌ Erro não capturado:', error);
      process.exit(1);
    });
}

export { main as cleanupInvestimentos };

