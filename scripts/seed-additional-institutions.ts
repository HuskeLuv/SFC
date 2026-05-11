import prisma from '../src/lib/prisma';

/**
 * Bugs #10 + #16 (relatório Maio/2026 — expansão Sprint 4): popular o catálogo
 * de instituições financeiras com bancos regionais, fintechs, estrangeiros,
 * corretoras independentes e exchanges de cripto que o seed dev (`prisma/seed.ts`)
 * não cobria. Idempotente — upsert por `codigo`.
 *
 * Uso:
 *   npx tsx scripts/seed-additional-institutions.ts
 *
 * Convenção de código:
 *   - COMPE oficial (3 dígitos) quando a entidade tem registro Bacen.
 *   - Slug prefixado quando não há COMPE (corretoras/DTVMs sem código próprio,
 *     exchanges de cripto, plataformas estrangeiras):
 *       FIN-* : fintech sem COMPE próprio
 *       COR-* : corretora/DTVM brasileira sem COMPE próprio
 *       INT-* : instituição estrangeira/internacional
 *       CRP-* : exchange de criptoativos
 *   Garante unicidade e não colide com COMPE numérico.
 *
 * CNPJs deixados em null quando a entidade legal varia/foi rebrandada
 * (ex.: Easynvest → NuInvest sob raiz XP) ou não temos certeza pública.
 */

const ADDITIONAL_INSTITUTIONS: Array<{
  code: string;
  name: string;
  cnpj: string | null;
}> = [
  // ─── Corretoras / DTVMs (Sprint 4 — primeira leva) ───
  { code: '102', name: 'XP Investimentos CCTVM', cnpj: '02332886000104' },
  { code: '380', name: 'Rico Investimentos', cnpj: '02332886000104' },
  { code: '278', name: 'Genial Investimentos CTVM', cnpj: '27652684000162' },
  { code: '107', name: 'Terra Investimentos DTVM', cnpj: '03751794000113' },
  { code: '325', name: 'Órama DTVM', cnpj: '13293225000125' },
  { code: '508', name: 'Avenue Securities DTVM', cnpj: '24933830000130' },
  { code: '260', name: 'NuInvest (ex-Easynvest)', cnpj: '62169875000179' },
  { code: '477', name: 'Citibank N.A. Brasil', cnpj: null },
  { code: '655-IC', name: 'BV Investimentos (Banco Votorantim)', cnpj: null },
  { code: '102-CL', name: 'Clear Corretora (Grupo XP)', cnpj: '02332886000104' },

  // ─── Corretoras / DTVMs (Sprint 4 — expansão) ───
  { code: 'COR-AGORA', name: 'Ágora Investimentos (Bradesco BBI)', cnpj: null },
  { code: 'COR-TORO', name: 'Toro Investimentos (Santander)', cnpj: null },
  { code: 'COR-MIRAE', name: 'Mirae Asset Securities Brasil', cnpj: null },
  { code: 'COR-NECTON', name: 'Necton Investimentos (BTG)', cnpj: null },
  { code: 'COR-GUIDE', name: 'Guide Investimentos', cnpj: null },
  { code: 'COR-PI', name: 'Pi Investimentos (Santander)', cnpj: null },
  { code: 'COR-GERACAO', name: 'Geração Futuro Corretora', cnpj: null },
  { code: 'COR-ATIVA', name: 'Ativa Investimentos', cnpj: null },
  { code: 'COR-RENASCENCA', name: 'Renascença DTVM', cnpj: null },
  { code: 'COR-EASY', name: 'Easynvest (legado)', cnpj: null },

  // ─── Bancos comerciais e regionais ───
  { code: '070', name: 'BRB — Banco de Brasília', cnpj: '00000208000100' },
  { code: '021', name: 'Banestes — Banco do Estado do Espírito Santo', cnpj: '28127603000178' },
  { code: '041', name: 'Banrisul — Banco do Estado do Rio Grande do Sul', cnpj: '92702067000196' },
  { code: '004', name: 'Banco do Nordeste do Brasil', cnpj: '07237373000120' },
  { code: '037', name: 'Banpará — Banco do Estado do Pará', cnpj: '04913711000108' },
  { code: '389', name: 'Banco Mercantil do Brasil', cnpj: '17184037000110' },
  { code: '047', name: 'Banco do Estado de Sergipe (Banese)', cnpj: '13009717000146' },
  { code: '184', name: 'Banco Itaú BBA', cnpj: '17298092000130' },
  { code: '074', name: 'Banco J. Safra', cnpj: '03017677000120' },
  { code: '237-BBI', name: 'Bradesco BBI', cnpj: null },

  // ─── Fintechs e bancos digitais ───
  { code: '290', name: 'PagBank — PagSeguro Digital', cnpj: '08561701000101' },
  { code: '380-PIC', name: 'PicPay — Banco PicPay', cnpj: '22896431000110' },
  { code: '323', name: 'Banco Mercado Pago (Mercado Bitcoin)', cnpj: '10573521000191' },
  { code: '197', name: 'Stone Pagamentos', cnpj: '16501555000157' },
  { code: '218', name: 'Banco BS2', cnpj: '71027866000134' },
  { code: '332', name: 'Acesso Soluções de Pagamento (Banco Neon)', cnpj: '13140088000199' },
  { code: '364', name: 'Gerencianet Pagamentos do Brasil', cnpj: null },
  { code: '188', name: 'Ativa Investimentos S.A. CTVM', cnpj: null },
  { code: '121', name: 'Banco Agibank', cnpj: '10664513000150' },
  { code: 'FIN-WILL', name: 'Will Bank', cnpj: null },
  { code: 'FIN-NEON', name: 'Neon Pagamentos', cnpj: null },
  { code: 'FIN-N26', name: 'N26 Brasil', cnpj: null },
  { code: 'FIN-NUBANK', name: 'Nubank S.A.', cnpj: '18236120000158' },

  // ─── Bancos estrangeiros / internacionais ───
  { code: '376', name: 'JP Morgan Chase Brasil', cnpj: null },
  { code: '487', name: 'Deutsche Bank Brasil', cnpj: null },
  { code: '745', name: 'Citibank S.A.', cnpj: null },
  { code: '064', name: 'Goldman Sachs Brasil', cnpj: null },
  { code: '066', name: 'Morgan Stanley CTVM', cnpj: null },
  { code: '139', name: 'Banco ICBC do Brasil', cnpj: null },
  { code: '752', name: 'BNP Paribas Brasil', cnpj: null },
  { code: '366', name: 'Société Générale Brasil', cnpj: null },
  { code: '505', name: 'Credit Suisse Brasil', cnpj: null },
  { code: '456', name: 'MUFG Bank Brasil', cnpj: null },
  { code: 'INT-INTERAC', name: 'Interactive Brokers (acesso internacional)', cnpj: null },
  { code: 'INT-PASSFOLIO', name: 'Passfolio Securities', cnpj: null },
  { code: 'INT-NOMAD', name: 'Nomad (conta global)', cnpj: null },
  { code: 'INT-REMESSA', name: 'Remessa Online', cnpj: null },

  // ─── Bancos médios e cooperativos ───
  { code: '637', name: 'Banco Sofisa', cnpj: null },
  { code: '643', name: 'Banco Pine', cnpj: null },
  { code: '243', name: 'Banco Master', cnpj: null },
  { code: '082', name: 'Banco Topázio', cnpj: null },
  { code: '085', name: 'Cooperativa Central Ailos', cnpj: null },
  { code: '125', name: 'Banco Plural', cnpj: null },
  { code: '253', name: 'Bexs Banco', cnpj: null },
  { code: '604', name: 'Banco Industrial do Brasil', cnpj: null },

  // ─── Previdência / Seguradoras (usadas como "instituição" de previdência) ───
  { code: 'PREV-BRASILPREV', name: 'Brasilprev Seguros e Previdência', cnpj: null },
  { code: 'PREV-ICATU', name: 'Icatu Seguros / Previdência', cnpj: null },
  { code: 'PREV-MAPFRE', name: 'MAPFRE Previdência', cnpj: null },
  { code: 'PREV-SULAMERICA', name: 'SulAmérica Previdência', cnpj: null },
  { code: 'PREV-BRADESCO', name: 'Bradesco Vida e Previdência', cnpj: null },
  { code: 'PREV-ITAUVIDA', name: 'Itaú Vida e Previdência', cnpj: null },

  // ─── Exchanges de cripto ───
  { code: 'CRP-MERCADO-BITCOIN', name: 'Mercado Bitcoin', cnpj: '18213434000147' },
  { code: 'CRP-FOXBIT', name: 'Foxbit', cnpj: null },
  { code: 'CRP-NOVADAX', name: 'NovaDAX', cnpj: null },
  { code: 'CRP-COINEXT', name: 'Coinext', cnpj: null },
  { code: 'CRP-BITSO', name: 'Bitso Brasil', cnpj: null },
  { code: 'CRP-BINANCE', name: 'Binance', cnpj: null },
  { code: 'CRP-COINBASE', name: 'Coinbase', cnpj: null },
  { code: 'CRP-OKX', name: 'OKX Exchange', cnpj: null },
  { code: 'CRP-KRAKEN', name: 'Kraken', cnpj: null },
  { code: 'CRP-BIPA', name: 'Bipa', cnpj: null },
  { code: 'CRP-RIPIO', name: 'Ripio Brasil', cnpj: null },

  // ─── Outras instituições relevantes ───
  { code: 'OTH-WALLET', name: 'Carteira em casa (custódia direta)', cnpj: null },
  { code: 'OTH-CORRETORA-OFICIAL', name: 'Tesouro Direto (B3 direto)', cnpj: null },
];

async function main() {
  console.log(`🏦 Sincronizando ${ADDITIONAL_INSTITUTIONS.length} instituições...\n`);
  let inserted = 0;
  let updated = 0;

  for (const inst of ADDITIONAL_INSTITUTIONS) {
    const existing = await prisma.institution.findUnique({
      where: { codigo: inst.code },
      select: { id: true, nome: true },
    });

    await prisma.institution.upsert({
      where: { codigo: inst.code },
      create: {
        codigo: inst.code,
        nome: inst.name,
        cnpj: inst.cnpj,
        status: 'ATIVA',
      },
      update: {
        nome: inst.name,
        cnpj: inst.cnpj,
        status: 'ATIVA',
      },
    });

    if (existing) {
      updated += 1;
    } else {
      console.log(`  ✅ ${inst.name} (${inst.code})`);
      inserted += 1;
    }
  }

  console.log(`\n${inserted} inseridos · ${updated} atualizados.`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('❌ Erro:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export default main;
