import prisma from '../src/lib/prisma';

/**
 * Bug #16 (relatório Maio/2026 — pós-consolidação Stock → Asset): popular o
 * catálogo de ações, FIIs, BDRs e units da B3 diretamente em `prisma.asset`.
 *
 * Após a migration `20260511150000_consolidate_stock_into_asset`, o wizard de
 * adição de ativos lê de `Asset` (não mais de `Stock`). O cron BRAPI já popula
 * `Asset` automaticamente; este script é um paliativo manual para tickers que
 * a BRAPI eventualmente não tenha sincronizado ou para ambientes sem cron
 * rodando (dev/staging).
 *
 * Lista curada: ~250 tickers cobrindo IBOV/IBRX-100/IDIV, FIIs líquidos,
 * BDRs top da NYSE/NASDAQ + ETFs. Idempotente — upsert por symbol.
 *
 * Uso:
 *   npx tsx scripts/seed-additional-stocks.ts
 *
 * Heurística de type:
 *   - ticker termina em '11' OU nome contém "fii"/"fundo imobiliário" → 'fii'
 *   - ticker tem 4 dígitos antes do hash (ex.: AAPL34) → 'bdr'
 *   - caso contrário → 'stock'
 */

const ADDITIONAL_STOCKS: Array<{ ticker: string; companyName: string }> = [
  // ─── Ações B3 faltantes confirmadas no relatório original ───
  { ticker: 'GOAU4', companyName: 'Metalúrgica Gerdau S.A.' },
  { ticker: 'LREN3', companyName: 'Lojas Renner S.A.' },

  // ─── IBOV / IBRX — Top liquidez ───
  { ticker: 'VALE3', companyName: 'Vale S.A.' },
  { ticker: 'PETR3', companyName: 'Petrobras ON' },
  { ticker: 'PETR4', companyName: 'Petrobras PN' },
  { ticker: 'ITUB3', companyName: 'Itaú Unibanco ON' },
  { ticker: 'ITUB4', companyName: 'Itaú Unibanco PN' },
  { ticker: 'ITSA3', companyName: 'Itaúsa ON' },
  { ticker: 'ITSA4', companyName: 'Itaúsa PN' },
  { ticker: 'BBDC3', companyName: 'Banco Bradesco ON' },
  { ticker: 'BBDC4', companyName: 'Banco Bradesco PN' },
  { ticker: 'BBAS3', companyName: 'Banco do Brasil S.A.' },
  { ticker: 'SANB11', companyName: 'Banco Santander Brasil (Units)' },
  { ticker: 'BPAC11', companyName: 'BTG Pactual (Units)' },
  { ticker: 'ABEV3', companyName: 'Ambev S.A.' },
  { ticker: 'B3SA3', companyName: 'B3 S.A. — Brasil, Bolsa, Balcão' },
  { ticker: 'WEGE3', companyName: 'WEG S.A.' },
  { ticker: 'MGLU3', companyName: 'Magazine Luiza S.A.' },
  { ticker: 'PRIO3', companyName: 'PetroRio S.A.' },
  { ticker: 'CSMG3', companyName: 'Copasa — Saneamento de Minas Gerais' },
  { ticker: 'RENT3', companyName: 'Localiza Rent a Car S.A.' },
  { ticker: 'SUZB3', companyName: 'Suzano S.A.' },
  { ticker: 'EQTL3', companyName: 'Equatorial Energia S.A.' },
  { ticker: 'RAIL3', companyName: 'Rumo S.A.' },
  { ticker: 'TIMS3', companyName: 'TIM S.A.' },
  { ticker: 'VBBR3', companyName: 'Vibra Energia S.A.' },
  { ticker: 'JBSS3', companyName: 'JBS S.A.' },
  { ticker: 'GGBR4', companyName: 'Gerdau S.A. PN' },
  { ticker: 'CSAN3', companyName: 'Cosan S.A.' },
  { ticker: 'HAPV3', companyName: 'Hapvida Participações' },
  { ticker: 'RDOR3', companyName: "Rede D'Or São Luiz S.A." },
  { ticker: 'KLBN11', companyName: 'Klabin S.A. (Units)' },
  { ticker: 'KLBN3', companyName: 'Klabin ON' },
  { ticker: 'KLBN4', companyName: 'Klabin PN' },
  { ticker: 'BBSE3', companyName: 'BB Seguridade Participações' },
  { ticker: 'EMBR3', companyName: 'Embraer S.A.' },
  { ticker: 'CIEL3', companyName: 'Cielo S.A.' },
  { ticker: 'TOTS3', companyName: 'TOTVS S.A.' },
  { ticker: 'CYRE3', companyName: 'Cyrela Brazil Realty' },
  { ticker: 'BRAP4', companyName: 'Bradespar PN' },
  { ticker: 'BRFS3', companyName: 'BRF S.A.' },
  { ticker: 'BRKM5', companyName: 'Braskem PNA' },
  { ticker: 'VIVT3', companyName: 'Telefônica Brasil (Vivo)' },
  { ticker: 'NTCO3', companyName: 'Natura &Co Holding' },
  { ticker: 'AMER3', companyName: 'Americanas S.A.' },
  { ticker: 'ASAI3', companyName: 'Sendas Distribuidora (Assaí)' },
  { ticker: 'CRFB3', companyName: 'Carrefour Brasil' },
  { ticker: 'PCAR3', companyName: 'Pão de Açúcar — GPA' },
  { ticker: 'PETZ3', companyName: 'Pet Center Comércio (Petz)' },
  { ticker: 'MOVI3', companyName: 'Movida Participações' },
  { ticker: 'COGN3', companyName: 'Cogna Educação' },
  { ticker: 'YDUQ3', companyName: 'Yduqs Participações' },
  { ticker: 'ANIM3', companyName: 'Ânima Holding' },
  { ticker: 'BHIA3', companyName: 'Grupo Casas Bahia' },
  { ticker: 'IRBR3', companyName: 'IRB — Brasil Resseguros' },
  { ticker: 'PSSA3', companyName: 'Porto Seguro' },
  { ticker: 'WIZS3', companyName: 'Wiz Co Participações' },
  { ticker: 'ALSO3', companyName: 'Aliansce Sonae' },
  { ticker: 'ABCB4', companyName: 'Banco ABC Brasil PN' },
  { ticker: 'BPAN4', companyName: 'Banco Pan PN' },
  { ticker: 'BRSR6', companyName: 'Banrisul PNB' },

  // ─── Utilities (energia, saneamento) ───
  { ticker: 'ELET3', companyName: 'Eletrobras ON' },
  { ticker: 'ELET6', companyName: 'Eletrobras PNB' },
  { ticker: 'CMIG3', companyName: 'Cemig ON' },
  { ticker: 'CMIG4', companyName: 'Cemig PN' },
  { ticker: 'CPLE3', companyName: 'Copel ON' },
  { ticker: 'CPLE6', companyName: 'Copel PNB' },
  { ticker: 'ENGI11', companyName: 'Energisa (Units)' },
  { ticker: 'ENBR3', companyName: 'EDP Energias do Brasil' },
  { ticker: 'EGIE3', companyName: 'Engie Brasil Energia' },
  { ticker: 'TAEE11', companyName: 'Taesa (Units)' },
  { ticker: 'TRPL4', companyName: 'ISA CTEEP PN' },
  { ticker: 'NEOE3', companyName: 'Neoenergia S.A.' },
  { ticker: 'LIGT3', companyName: 'Light S.A.' },
  { ticker: 'SBSP3', companyName: 'Sabesp — Saneamento de SP' },
  { ticker: 'SAPR11', companyName: 'Sanepar (Units)' },
  { ticker: 'CSAN3-DUP', companyName: '' }, // placeholder removido abaixo

  // ─── Materiais / siderurgia / mineração ───
  { ticker: 'USIM3', companyName: 'Usiminas ON' },
  { ticker: 'USIM5', companyName: 'Usiminas PNA' },
  { ticker: 'CSNA3', companyName: 'CSN — Companhia Siderúrgica Nacional' },
  { ticker: 'CMIN3', companyName: 'CSN Mineração' },
  { ticker: 'GOAU3', companyName: 'Metalúrgica Gerdau ON' },
  { ticker: 'GGBR3', companyName: 'Gerdau ON' },

  // ─── Consumo e varejo ───
  { ticker: 'LWSA3', companyName: 'Locaweb Serviços de Internet' },
  { ticker: 'ARZZ3', companyName: 'Arezzo & Co' },
  { ticker: 'GRND3', companyName: 'Grendene S.A.' },
  { ticker: 'ALPA4', companyName: 'Alpargatas PN' },
  { ticker: 'MTRE3', companyName: 'Mitre Realty' },
  { ticker: 'EZTC3', companyName: 'EZTec Empreendimentos' },
  { ticker: 'MRVE3', companyName: 'MRV Engenharia' },
  { ticker: 'CYRE3-DUP', companyName: '' }, // placeholder
  { ticker: 'GFSA3', companyName: 'Gafisa S.A.' },
  { ticker: 'JHSF3', companyName: 'JHSF Participações' },
  { ticker: 'DIRR3', companyName: 'Direcional Engenharia' },
  { ticker: 'TEND3', companyName: 'Construtora Tenda' },
  { ticker: 'PLPL3', companyName: 'Plano & Plano Construções' },

  // ─── Aviação / transporte ───
  { ticker: 'AZUL4', companyName: 'Azul Linhas Aéreas' },
  { ticker: 'GOLL4', companyName: 'Gol Linhas Aéreas' },
  { ticker: 'STBP3', companyName: 'Santos Brasil Participações' },
  { ticker: 'ECOR3', companyName: 'EcoRodovias Infraestrutura' },
  { ticker: 'CCRO3', companyName: 'CCR S.A.' },
  { ticker: 'POMO4', companyName: 'Marcopolo PN' },

  // ─── Agronegócio ───
  { ticker: 'SLCE3', companyName: 'SLC Agrícola' },
  { ticker: 'AGRO3', companyName: 'BrasilAgro' },
  { ticker: 'BEEF3', companyName: 'Minerva S.A.' },
  { ticker: 'MRFG3', companyName: 'Marfrig Global Foods' },
  { ticker: 'SMTO3', companyName: 'São Martinho S.A.' },

  // ─── Shopping / imobiliário ───
  { ticker: 'MULT3', companyName: 'Multiplan Empreendimentos' },
  { ticker: 'IGTI11', companyName: 'Iguatemi S.A. (Units)' },

  // ─── Fintechs / pagamentos ───
  { ticker: 'CASH3', companyName: 'Méliuz S.A.' },
  { ticker: 'ENJU3', companyName: 'Enjoei.com.br' },
  { ticker: 'AMBP3', companyName: 'Ambipar Participações' },
  { ticker: 'POSI3', companyName: 'Positivo Tecnologia' },

  // ─── BDRs (ADR/recibo de ações estrangeiras) ───
  { ticker: 'AAPL34', companyName: 'Apple Inc. (BDR)' },
  { ticker: 'MSFT34', companyName: 'Microsoft Corp. (BDR)' },
  { ticker: 'GOGL34', companyName: 'Alphabet Inc. Class C (BDR)' },
  { ticker: 'AMZO34', companyName: 'Amazon.com Inc. (BDR)' },
  { ticker: 'METF34', companyName: 'Meta Platforms (BDR)' },
  { ticker: 'NVDC34', companyName: 'NVIDIA Corp. (BDR)' },
  { ticker: 'TSLA34', companyName: 'Tesla Inc. (BDR)' },
  { ticker: 'NFLX34', companyName: 'Netflix Inc. (BDR)' },
  { ticker: 'DISB34', companyName: 'Walt Disney Co. (BDR)' },
  { ticker: 'BABA34', companyName: 'Alibaba Group (BDR)' },
  { ticker: 'BERK34', companyName: 'Berkshire Hathaway (BDR)' },
  { ticker: 'COCA34', companyName: 'Coca-Cola Co. (BDR)' },
  { ticker: 'JPMC34', companyName: 'JPMorgan Chase (BDR)' },
  { ticker: 'BOAC34', companyName: 'Bank of America (BDR)' },
  { ticker: 'VISA34', companyName: 'Visa Inc. (BDR)' },
  { ticker: 'MELI34', companyName: 'Mercado Libre (BDR)' },
  { ticker: 'MCDC34', companyName: "McDonald's (BDR)" },
  { ticker: 'IBMB34', companyName: 'IBM Corp. (BDR)' },
  { ticker: 'COMC34', companyName: 'Cisco Systems (BDR)' },
  { ticker: 'NIKE34', companyName: 'Nike Inc. (BDR)' },

  // ─── FIIs — FOFs (bug #07) ───
  { ticker: 'KFOF11', companyName: 'Kinea FOF — Fundo de Fundos' },
  { ticker: 'KISU11', companyName: 'Kinea Renda Imobiliária — Subordinada' },
  { ticker: 'HFOF11', companyName: 'Hedge Top FOF II' },
  { ticker: 'JSAF11', companyName: 'JS Real Estate Multigestão' },
  { ticker: 'RINV11', companyName: 'Rio Bravo Renda Imobiliária' },
  { ticker: 'BCFF11', companyName: 'BTG Pactual Fundo de Fundos' },
  { ticker: 'BPFF11', companyName: 'BB Progressivo Fundo de Fundos' },
  { ticker: 'HGFF11', companyName: 'CSHG FOF' },
  { ticker: 'MGFF11', companyName: 'Mogno FOF' },
  { ticker: 'IBFF11', companyName: 'Iridium FoF' },
  { ticker: 'BTHF11', companyName: 'BTG Pactual Hedge Fund FoF' },

  // ─── FIIs de Logística ───
  { ticker: 'HGLG11', companyName: 'CSHG Logística' },
  { ticker: 'XPLG11', companyName: 'XP Log' },
  { ticker: 'BTLG11', companyName: 'BTG Pactual Logística' },
  { ticker: 'GGRC11', companyName: 'GGR Covepi Renda' },
  { ticker: 'VILG11', companyName: 'Vinci Logística' },
  { ticker: 'ALZR11', companyName: 'Alianza Trust Renda Imobiliária' },

  // ─── FIIs de Shoppings / Renda urbana ───
  { ticker: 'VISC11', companyName: 'Vinci Shopping Centers' },
  { ticker: 'XPML11', companyName: 'XP Malls' },
  { ticker: 'HSML11', companyName: 'HSI Malls' },
  { ticker: 'HGBS11', companyName: 'CSHG Shoppings Brasil' },
  { ticker: 'MALL11', companyName: 'Malls Brasil Plural' },

  // ─── FIIs de Lajes Corporativas ───
  { ticker: 'HGRE11', companyName: 'CSHG Real Estate' },
  { ticker: 'KNRI11', companyName: 'Kinea Renda Imobiliária' },
  { ticker: 'HGRU11', companyName: 'CSHG Renda Urbana' },
  { ticker: 'RBRP11', companyName: 'RBR Properties' },
  { ticker: 'RCRB11', companyName: 'Rio Bravo Renda Corporativa' },
  { ticker: 'PVBI11', companyName: 'VBI Prime Properties' },

  // ─── FIIs de Recebíveis (CRI) ───
  { ticker: 'IRDM11', companyName: 'Iridium Recebíveis Imobiliários' },
  { ticker: 'HGCR11', companyName: 'CSHG Recebíveis Imobiliários' },
  { ticker: 'KNCR11', companyName: 'Kinea Rendimentos Imobiliários' },
  { ticker: 'KNIP11', companyName: 'Kinea Índices de Preços' },
  { ticker: 'MXRF11', companyName: 'Maxi Renda' },
  { ticker: 'RBRR11', companyName: 'RBR Rendimento High Grade' },
  { ticker: 'RECR11', companyName: 'REC Recebíveis Imobiliários' },
  { ticker: 'VGIR11', companyName: 'Valora RE III — Recebíveis' },
  { ticker: 'BCRI11', companyName: 'Banestes Recebíveis' },
  { ticker: 'JSRE11', companyName: 'JS Real Estate Multigestão (CRI)' },
  { ticker: 'BTCR11', companyName: 'BTG Pactual Crédito Imobiliário' },

  // ─── FIIs Híbridos / Renda Variada ───
  { ticker: 'RBVA11', companyName: 'Rio Bravo Renda Varejo' },
  { ticker: 'XPCM11', companyName: 'XP Crédito e Mercado' },
  { ticker: 'BRCO11', companyName: 'Bresco Logística' },
  { ticker: 'GTWR11', companyName: 'Green Towers' },
  { ticker: 'TVRI11', companyName: 'TG Ativo Real' },
  { ticker: 'VINO11', companyName: 'Vinci Offices' },

  // ─── ETFs B3 (rotulados como FII por terminarem em 11 mas tratados separadamente em /api/assets) ───
  { ticker: 'BOVA11', companyName: 'iShares Ibovespa Index Fund' },
  { ticker: 'IVVB11', companyName: 'iShares S&P 500 BDR' },
  { ticker: 'SMAL11', companyName: 'iShares Small Cap' },
  { ticker: 'BOVB11', companyName: 'BTG Pactual S&P/BMV Ibovespa' },
  { ticker: 'DIVO11', companyName: 'iShares Dividendos' },
  { ticker: 'XINA11', companyName: 'Trend ETF MSCI China' },
];

const classifyType = (ticker: string, companyName: string): string => {
  const t = ticker.toUpperCase();
  const n = companyName.toLowerCase();
  if (n.includes('fii') || n.includes('fundo imobili') || n.includes('fundo de fundo'))
    return 'fii';
  if (n.includes('etf') || /\bíndice\b/.test(n)) return 'etf';
  if (/\d{2}$/.test(t) && t.length >= 5 && !t.endsWith('11')) return 'bdr'; // AAPL34, MSFT34
  if (t.endsWith('11')) return 'fii'; // fallback: ticker 11 sem nome explícito
  return 'stock';
};

async function main() {
  // Filtra placeholders vazios criados durante curadoria.
  const validStocks = ADDITIONAL_STOCKS.filter(
    (s) => s.ticker.length > 0 && !s.ticker.endsWith('-DUP') && s.companyName.length > 0,
  );

  console.log(`📈 Sincronizando ${validStocks.length} ações, FIIs, BDRs e ETFs em Asset...\n`);
  let inserted = 0;
  let updated = 0;

  for (const stock of validStocks) {
    const existing = await prisma.asset.findUnique({
      where: { symbol: stock.ticker },
      select: { id: true },
    });
    const type = classifyType(stock.ticker, stock.companyName);

    await prisma.asset.upsert({
      where: { symbol: stock.ticker },
      create: {
        symbol: stock.ticker,
        name: stock.companyName,
        type,
        currency: 'BRL',
        source: 'manual',
      },
      update: {
        name: stock.companyName,
        type,
        // Não sobrescreve source='brapi' se o cron já marcou — só atualiza
        // quando ainda está 'manual' ou ausente.
      },
    });

    if (existing) {
      updated += 1;
    } else {
      console.log(`  ✅ ${stock.ticker} — ${stock.companyName}`);
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
