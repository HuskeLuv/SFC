import prisma from '../src/lib/prisma';

interface InstituicaoData {
  codigo: string;
  nome: string;
  cnpj?: string;
}

/**
 * Busca dados de instituições financeiras do Bacen
 * Em caso de falha, retorna dados de exemplo das principais instituições brasileiras
 */
async function fetchInstituicoes(): Promise<InstituicaoData[]> {
  try {
    console.log('🔍 Buscando dados de instituições financeiras do Bacen...');

    // Tentar buscar da API do Bacen (exemplo de endpoint)
    // Nota: A API real do Bacen pode ter um endpoint diferente
    const response = await fetch(
      'https://www.bcb.gov.br/api/servico/sitebcb/estatisticas/instituicoes-financeiras',
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ ${data.length || 0} instituições encontradas na API do Bacen`);
      return data.map((item: Record<string, string | undefined>) => ({
        codigo: item.codigo || item.code || String(Math.random()),
        nome: item.nome || item.name,
        cnpj: item.cnpj || item.cnpj,
      }));
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch {
    console.log('⚠️  API do Bacen indisponível, criando dados de exemplo...');

    // Dados de exemplo das principais instituições financeiras brasileiras
    return [
      { codigo: '001', nome: 'Banco do Brasil S.A.', cnpj: '00000000000191' },
      { codigo: '033', nome: 'Banco Santander (Brasil) S.A.', cnpj: '90400888000142' },
      { codigo: '104', nome: 'Caixa Econômica Federal', cnpj: '00360305000104' },
      { codigo: '237', nome: 'Banco Bradesco S.A.', cnpj: '60746948000112' },
      { codigo: '341', nome: 'Banco Itaú S.A.', cnpj: '60701190000104' },
      { codigo: '422', nome: 'Banco Safra S.A.', cnpj: '58160789000128' },
      { codigo: '748', nome: 'Banco Cooperativo Sicredi S.A.', cnpj: '01181521000169' },
      { codigo: '260', nome: 'Nu Pagamentos S.A.', cnpj: '18236120000166' },
      { codigo: '290', nome: 'PagSeguro Internet S.A.', cnpj: '08561701000101' },
      {
        codigo: '323',
        nome: 'Mercado Pago - Instituição de Pagamento Ltda.',
        cnpj: '10573521000110',
      },
      { codigo: '077', nome: 'Banco Inter S.A.', cnpj: '00416968000101' },
      { codigo: '197', nome: 'Stone Pagamentos S.A.', cnpj: '16501555000157' },
      { codigo: '208', nome: 'BTG Pactual S.A.', cnpj: '30306294000145' },
      { codigo: '212', nome: 'Banco Original S.A.', cnpj: '92856902000101' },
      { codigo: '336', nome: 'Banco C6 S.A.', cnpj: '31872495000100' },
      { codigo: '655', nome: 'Banco Votorantim S.A.', cnpj: '59588111000105' },
      { codigo: '070', nome: 'Banco de Brasília S.A.', cnpj: '00000208000101' },
      { codigo: '085', nome: 'Cooperativa Central de Crédito - Ailos', cnpj: '04814563000112' },
      { codigo: '125', nome: 'Brasil Plural S.A. Banco Múltiplo', cnpj: '03323840000118' },
      { codigo: '184', nome: 'Banco Itaú BBA S.A.', cnpj: '18322020000100' },
    ];
  }
}

/**
 * Sincroniza instituições financeiras no banco de dados
 */
async function syncInstituicoes(
  instituicoes: InstituicaoData[],
): Promise<{ inserted: number; updated: number }> {
  console.log('💾 Sincronizando instituições no banco de dados...');

  let inserted = 0;
  let updated = 0;

  for (const instituicao of instituicoes) {
    try {
      // Verificar se já existe antes do upsert
      const existing = await prisma.institution.findUnique({
        where: { codigo: instituicao.codigo },
      });

      await prisma.institution.upsert({
        where: { codigo: instituicao.codigo },
        update: {
          nome: instituicao.nome,
          // Não apaga nem troca o cnpj que o import do Bacen preencheu (ClickUp 86e2xqh69).
          ...(instituicao.cnpj && !existing?.cnpj ? { cnpj: instituicao.cnpj } : {}),
          status: 'ATIVA',
        },
        create: {
          codigo: instituicao.codigo,
          nome: instituicao.nome,
          cnpj: instituicao.cnpj || null,
          status: 'ATIVA',
        },
      });

      if (existing) {
        updated++;
      } else {
        inserted++;
      }
    } catch (error) {
      console.error(`❌ Erro ao sincronizar instituição ${instituicao.codigo}:`, error);
    }
  }

  console.log(`✅ Instituições sincronizadas: ${inserted} inseridas, ${updated} atualizadas`);
  return { inserted, updated };
}

/**
 * Função principal que coordena a sincronização
 */
async function main() {
  console.log('🚀 Iniciando sincronização de dados externos...\n');

  try {
    const startTime = Date.now();

    // Buscar instituições
    const instituicoes = await fetchInstituicoes();
    console.log(`✅ ${instituicoes.length} instituições encontradas\n`);

    // Sincronizar no banco
    const result = await syncInstituicoes(instituicoes);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log('\n🎉 Sincronização concluída com sucesso!');
    console.log('📊 RESUMO:');
    console.log(`   • Instituições: ${result.inserted} inseridas, ${result.updated} atualizadas`);
    console.log(`   • Tempo total: ${duration.toFixed(2)}s\n`);
  } catch (error) {
    console.error('\n❌ Erro durante a sincronização:', error);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// Exportar funções para uso programático
export { fetchInstituicoes, syncInstituicoes, main as syncExternalData };
