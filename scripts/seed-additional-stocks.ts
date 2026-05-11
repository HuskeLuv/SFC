import prisma from '../src/lib/prisma';

/**
 * Bug #16 (relatório Maio/2026): popular o catálogo de ações e FIIs B3 com
 * tickers que faltavam — sob qualquer wizard de adição, /api/assets?tipo=fii
 * (ou ?tipo=acao) consulta `prisma.stock`, que hoje só é populado por seeds
 * manuais. Sem cron BRAPI sincronizando Stock, tickers como GOAU4, LREN3
 * e todos os FOFs (KFOF11, KISU11, HFOF11, JSAF11, RINV11) não aparecem
 * na busca e o usuário não consegue cadastrá-los.
 *
 * Uso:
 *   npx tsx scripts/seed-additional-stocks.ts
 *
 * Idempotente — usa upsert por ticker. A solução de médio prazo é um cron
 * BRAPI que mantenha Stock em sincronia automática (ver §4.1 do
 * relatório dos consultores).
 */

const ADDITIONAL_STOCKS: Array<{ ticker: string; companyName: string }> = [
  // ─── Ações B3 faltantes confirmadas no relatório ───
  { ticker: 'GOAU4', companyName: 'Metalúrgica Gerdau S.A.' },
  { ticker: 'LREN3', companyName: 'Lojas Renner S.A.' },

  // ─── Ações IBOV alta liquidez (curadoria mínima para o catálogo) ───
  { ticker: 'VALE3', companyName: 'Vale S.A.' },
  { ticker: 'PETR3', companyName: 'Petrobras ON' },
  { ticker: 'PETR4', companyName: 'Petrobras PN' },
  { ticker: 'ITUB4', companyName: 'Itaú Unibanco PN' },
  { ticker: 'BBDC4', companyName: 'Banco Bradesco PN' },
  { ticker: 'ABEV3', companyName: 'Ambev S.A.' },
  { ticker: 'BBAS3', companyName: 'Banco do Brasil S.A.' },
  { ticker: 'B3SA3', companyName: 'B3 S.A. — Brasil, Bolsa, Balcão' },
  { ticker: 'WEGE3', companyName: 'WEG S.A.' },
  { ticker: 'MGLU3', companyName: 'Magazine Luiza S.A.' },
  { ticker: 'PRIO3', companyName: 'PetroRio S.A.' },
  { ticker: 'CSMG3', companyName: 'Companhia de Saneamento de Minas Gerais — Copasa' },
  { ticker: 'RENT3', companyName: 'Localiza Rent a Car S.A.' },
  { ticker: 'SUZB3', companyName: 'Suzano S.A.' },
  { ticker: 'EQTL3', companyName: 'Equatorial Energia S.A.' },
  { ticker: 'RAIL3', companyName: 'Rumo S.A.' },
  { ticker: 'TIMS3', companyName: 'TIM S.A.' },
  { ticker: 'VBBR3', companyName: 'Vibra Energia S.A.' },
  { ticker: 'JBSS3', companyName: 'JBS S.A.' },
  { ticker: 'GGBR4', companyName: 'Gerdau S.A. PN' },
  { ticker: 'CSAN3', companyName: 'Cosan S.A.' },
  { ticker: 'HAPV3', companyName: 'Hapvida Participações e Investimentos S.A.' },
  { ticker: 'RDOR3', companyName: "Rede D'Or São Luiz S.A." },
  { ticker: 'KLBN11', companyName: 'Klabin S.A. (Units)' },
  { ticker: 'BBSE3', companyName: 'BB Seguridade Participações S.A.' },
  { ticker: 'EMBR3', companyName: 'Embraer S.A.' },
  { ticker: 'CIEL3', companyName: 'Cielo S.A.' },
  { ticker: 'TOTS3', companyName: 'TOTVS S.A.' },
  { ticker: 'CYRE3', companyName: 'Cyrela Brazil Realty S.A.' },

  // ─── FOFs (Fundos de Fundos imobiliários) — bug #07 ───
  { ticker: 'KFOF11', companyName: 'Kinea FOF — Fundo de Fundos Imobiliários' },
  { ticker: 'KISU11', companyName: 'Kinea Renda Imobiliária — Subordinada' },
  { ticker: 'HFOF11', companyName: 'Hedge Top FOF II — Fundo de Fundos Imobiliários' },
  { ticker: 'JSAF11', companyName: 'JS Real Estate Multigestão — Fundo de Fundos' },
  { ticker: 'RINV11', companyName: 'Rio Bravo Renda — Fundo de Investimento Imobiliário' },
  { ticker: 'BCFF11', companyName: 'BTG Pactual Fundo de Fundos' },
  { ticker: 'BPFF11', companyName: 'BB Progressivo Fundo de Fundos' },
  { ticker: 'HGFF11', companyName: 'CSHG FOF — Fundo de Fundos Imobiliários' },
  { ticker: 'XPCM11', companyName: 'XP Crédito Multimercado' },
  { ticker: 'MGFF11', companyName: 'Mogno FOF — Fundo de Investimento Imobiliário' },

  // ─── FIIs líquidos relevantes adicionais ───
  { ticker: 'MXRF11', companyName: 'Maxi Renda — Fundo de Investimento Imobiliário' },
  { ticker: 'HGLG11', companyName: 'CSHG Logística — Fundo de Investimento Imobiliário' },
  { ticker: 'XPLG11', companyName: 'XP Log — Fundo de Investimento Imobiliário' },
  { ticker: 'KNRI11', companyName: 'Kinea Renda Imobiliária' },
  { ticker: 'VISC11', companyName: 'Vinci Shopping Centers' },
  { ticker: 'HGRE11', companyName: 'CSHG Real Estate' },
  { ticker: 'XPML11', companyName: 'XP Malls Fundo de Investimento Imobiliário' },
  { ticker: 'BTLG11', companyName: 'BTG Pactual Logística' },
  { ticker: 'IRDM11', companyName: 'Iridium Recebíveis Imobiliários' },
  { ticker: 'HGCR11', companyName: 'CSHG Recebíveis Imobiliários' },
];

async function main() {
  console.log(`📈 Sincronizando catálogo de ${ADDITIONAL_STOCKS.length} ações e FIIs...\n`);
  let inserted = 0;
  let updated = 0;

  for (const stock of ADDITIONAL_STOCKS) {
    const existing = await prisma.stock.findUnique({
      where: { ticker: stock.ticker },
      select: { id: true },
    });

    await prisma.stock.upsert({
      where: { ticker: stock.ticker },
      create: {
        ticker: stock.ticker,
        companyName: stock.companyName,
        isActive: true,
      },
      update: {
        companyName: stock.companyName,
        isActive: true,
      },
    });

    if (existing) {
      updated += 1;
    } else {
      console.log(`  ✅ ${stock.ticker} — ${stock.companyName}`);
      inserted += 1;
    }
  }

  console.log(`\n${inserted} inseridos · ${updated} já existiam (atualizados).`);
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
